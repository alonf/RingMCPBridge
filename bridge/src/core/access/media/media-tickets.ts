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
  async audit(
    item: string,
    receiver: string,
    operation: "share" | "fetch",
    signal: AbortSignal,
  ) {
    await this.db.run(
      {
        sql: "INSERT INTO media_access_log(access_id,media_id,receiver_id,operation,ts) VALUES (@id,@item,@receiver,@operation,@now)",
        params: {
          id: randomUUID(),
          item,
          receiver,
          operation,
          now: this.clock.now(),
        },
      },
      signal,
    );
  }
}
