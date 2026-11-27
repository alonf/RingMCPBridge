import { randomBytes, randomUUID, createHash } from "node:crypto";
import type { QueryLayer } from "../../../utilities/query-layer/index.ts";
import type { Clock } from "../../../utilities/clock/index.ts";

const FIVE_MINUTES_MS = 300_000;
function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
/** Stores only a digest of each opaque item grant. */
export class MediaTickets {
  private readonly db: QueryLayer;
  private readonly clock: Clock;
  constructor(db: QueryLayer, clock: Clock) {
    this.db = db;
    this.clock = clock;
  }
  async issue(
    mediaId: string,
    receiver: string,
    policy: string,
    approval: string,
    itemExpiry: number,
    signal: AbortSignal,
  ) {
    const now = this.clock.now();
    const expiresAt = Math.min(now + FIVE_MINUTES_MS, itemExpiry);
    const token = randomBytes(32).toString("base64url");
    await this.db.transaction(async (tx) => {
      await tx.run(
        {
          sql: "DELETE FROM media_ticket WHERE expires_at<=@now",
          params: { now },
        },
        signal,
      );
      await tx.run(
        {
          sql: "INSERT INTO media_ticket(token_hash,media_id,receiver_id,policy_generation,approval_generation,expires_at) VALUES (@token_hash,@media_id,@receiver_id,@policy,@approval,@expires)",
          params: {
            token_hash: hash(token),
            media_id: mediaId,
            receiver_id: receiver,
            policy,
            approval,
            expires: expiresAt,
          },
        },
        signal,
      );
    }, signal);
    return { token, expiresAt };
  }
  async valid(
    token: string,
    item: string,
    receiver: string,
    policy: string,
    approval: string,
    signal: AbortSignal,
  ) {
    return Boolean(
      await this.db.get(
        {
          sql: "SELECT media_id FROM media_ticket WHERE token_hash=@hash AND media_id=@item AND receiver_id=@receiver AND policy_generation=@policy AND approval_generation=@approval AND expires_at>@now",
          params: {
            hash: hash(token),
            item,
            receiver,
            policy,
            approval,
            now: this.clock.now(),
          },
        },
        signal,
      ),
    );
  }
  /** Bounded owner-only history includes mistyped receiver and camera IDs. */
  recentShareDenials(signal: AbortSignal) {
    const top = this.db.dialect === "tsql" ? "TOP (20) " : "";
    const limit = this.db.dialect === "sqlite" ? " LIMIT 20" : "";
    return this.db.all(
      {
        sql: `SELECT ${top}ts,requester_id,receiver_id,location_id,device_id,event_id,denial_reason FROM media_access_log WHERE operation IN ('share','test_image') AND outcome='denied' ORDER BY ts DESC,access_id DESC${limit}`,
        params: {},
      },
      signal,
    );
  }
  async audit(
    entry: {
      item?: string;
      receiver: string;
      requester: string;
      operation: "share" | "fetch" | "test_image";
      outcome: "allowed" | "denied" | "incomplete" | "range_rejected";
      location_id?: string;
      device_id?: string;
      event_id?: string;
      denialReason?: string;
    },
    signal: AbortSignal,
  ) {
    await this.db.run(
      {
        sql: "INSERT INTO media_access_log(access_id,media_id,receiver_id,operation,ts,requester_id,outcome,location_id,device_id,event_id,denial_reason) VALUES (@id,@item,@receiver,@operation,@now,@requester,@outcome,@location_id,@device_id,@event_id,@reason)",
        params: {
          reason: entry.denialReason ?? null,
          id: randomUUID(),
          item: entry.item ?? "",
          receiver: entry.receiver,
          operation: entry.operation,
          requester: entry.requester,
          outcome: entry.outcome,
          location_id: entry.location_id ?? null,
          device_id: entry.device_id ?? null,
          event_id: entry.event_id ?? null,
          now: this.clock.now(),
        },
      },
      signal,
    );
  }
}
