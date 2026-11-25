import { recordOwnerMediaChange } from "../audit/index.ts";
import { createHash, randomUUID } from "node:crypto";
import { upsertStatement } from "../../../utilities/query-layer/index.ts";
import type { EventAction } from "../../../utilities/config/index.ts";
import type {
  QueryLayer,
  SqlSession,
} from "../../../utilities/query-layer/index.ts";

export interface CameraPermission {
  readonly enabled: boolean;
  readonly sound: boolean;
  readonly generation: string;
  readonly approvalRevision: string;
  readonly personAction?: EventAction;
  readonly approvals: ReadonlyMap<string, string>;
}
export interface CameraChange {
  readonly expected?: {
    readonly generation: string;
    readonly approvalRevision: string;
    readonly personAction: EventAction;
  };
  readonly enabled: boolean;
  readonly sound: boolean;
  readonly approved: boolean;
  readonly remove?: readonly string[];
  readonly personAction?: EventAction;
}

function key(...parts: string[]): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}
async function advanceApprovalRevision(
  tx: SqlSession,
  cameraKey: string,
  signal: AbortSignal,
) {
  await tx.run(
    {
      sql: "UPDATE camera_media_policy SET approval_revision=@revision WHERE camera_key=@cameraKey",
      params: { revision: randomUUID(), cameraKey },
    },
    signal,
  );
}
function personAction(value: unknown): EventAction {
  return value === "drop" || value === "push" || value === "store_only"
    ? value
    : "inherit";
}
export async function cameraPersonActionIn(
  tx: SqlSession,
  home: string,
  camera: string,
  signal: AbortSignal,
) {
  const row = await tx.get(
    {
      sql: "SELECT person_action FROM camera_media_policy WHERE camera_key=@camera_key",
      params: { camera_key: key(home, camera) },
    },
    signal,
  );
  return personAction(row?.person_action);
}
/** Withdraw and audit exactly the rows removed by this transaction. Older rows
 * carry a hash only. Match it against known IDs, preserving the hash even if
 * the camera and its history have already disappeared. */
export async function withdrawReceiverIn(
  tx: SqlSession,
  receiver: string,
  at: number,
  signal: AbortSignal,
) {
  const columns = ["camera_key", "location_id", "device_id"];
  const sql =
    tx.dialect === "tsql"
      ? `DELETE FROM camera_media_approval OUTPUT ${columns.map((c) => "DELETED." + c).join(",")} WHERE receiver_id=@receiver`
      : `DELETE FROM camera_media_approval WHERE receiver_id=@receiver RETURNING ${columns.join(",")}`;
  const removed = await tx.all({ sql, params: { receiver } }, signal);
  const legacy = new Map<string, { home: string; camera: string }>();
  if (
    removed.some((row) => row.location_id === null || row.device_id === null)
  ) {
    const known = await tx.all(
      {
        sql: "SELECT location_id,device_id FROM device UNION SELECT location_id,device_id FROM media UNION SELECT location_id,device_id FROM owner_media_change WHERE location_id IS NOT NULL AND device_id IS NOT NULL",
        params: {},
      },
      signal,
    );
    for (const row of known) {
      const home = String(row.location_id),
        camera = String(row.device_id);
      legacy.set(key(home, camera), { home, camera });
    }
  }
  for (const row of removed) {
    const cameraKey = String(row.camera_key);
    await advanceApprovalRevision(tx, cameraKey, signal);
    const ids =
      typeof row.location_id === "string" && typeof row.device_id === "string"
        ? { home: row.location_id, camera: row.device_id }
        : legacy.get(cameraKey);
    await recordOwnerMediaChange(
      tx,
      { action: "approval_removed", receiver, cameraKey, ...ids },
      at,
      signal,
    );
  }
}

/** Each receiver has its own generation. A camera switch change invalidates all of its tickets. */
export class MediaPermissions {
  private readonly db: QueryLayer;
  private readonly now: () => number;
  constructor(db: QueryLayer, now: () => number = Date.now) {
    this.now = now;
    this.db = db;
  }
  async camera(
    home: string,
    camera: string,
    signal: AbortSignal,
  ): Promise<CameraPermission> {
    const cameraKey = key(home, camera);
    const rows = await this.db.all(
      {
        sql: "SELECT p.enabled,p.sound,p.person_action,p.generation,p.approval_revision,a.receiver_id,a.generation AS approval FROM camera_media_policy p LEFT JOIN camera_media_approval a ON a.camera_key=p.camera_key WHERE p.camera_key=@camera_key",
        params: { camera_key: cameraKey },
      },
      signal,
    );
    const policy = rows[0];
    return {
      enabled: policy?.enabled === 1,
      sound: policy ? policy.sound === 1 : true,
      personAction: personAction(policy?.person_action),
      generation: String(policy?.generation ?? ""),
      approvalRevision: String(policy?.approval_revision ?? ""),
      approvals: new Map(
        rows
          .filter((row) => typeof row.receiver_id === "string")
          .map((row) => [String(row.receiver_id), String(row.approval)]),
      ),
    };
  }
  async save(
    home: string,
    camera: string,
    receiver: string,
    change: CameraChange,
    signal: AbortSignal,
  ): Promise<"saved" | "stale"> {
    const cameraKey = key(home, camera);
    const approvalKey = key(home, camera, receiver);
    const enabled = Number(change.enabled),
      sound = Number(change.sound);
    return this.db.transaction(async (tx) => {
      if (change.expected) {
        // Serialize the comparison with writes, including the first save of an unseen camera.
        // SQLite already holds the write lock at the start of this transaction.
        const lock = tx.dialect === "tsql" ? " WITH (UPDLOCK,HOLDLOCK)" : "";
        const current = await tx.get(
          {
            sql: `SELECT generation,person_action,approval_revision FROM camera_media_policy${lock} WHERE camera_key=@camera_key`,
            params: { camera_key: cameraKey },
          },
          signal,
        );
        if (
          (current?.generation ?? "") !== change.expected.generation ||
          (current?.approval_revision ?? "") !==
            change.expected.approvalRevision ||
          personAction(current?.person_action) !== change.expected.personAction
        )
          return "stale" as const;
      }
      const inserted = await tx.run(
        upsertStatement(tx.dialect, {
          table: "camera_media_policy",
          key: ["camera_key"],
          values: {
            camera_key: cameraKey,
            enabled,
            sound,
            generation: randomUUID(),
          },
          onConflict: "ignore",
        }),
        signal,
      );
      const updated = await tx.run(
        {
          sql: "UPDATE camera_media_policy SET enabled=@enabled,sound=@sound,generation=@generation WHERE camera_key=@camera_key AND (enabled<>@enabled OR sound<>@sound)",
          params: {
            camera_key: cameraKey,
            enabled,
            sound,
            generation: randomUUID(),
          },
        },
        signal,
      );
      let personUpdated = 0;
      if (change.personAction !== undefined)
        personUpdated = await tx.run(
          {
            sql: "UPDATE camera_media_policy SET person_action=@action WHERE camera_key=@camera_key AND COALESCE(person_action,'inherit')<>@action",
            params: { action: change.personAction, camera_key: cameraKey },
          },
          signal,
        );
      const at = this.now();
      if (inserted || updated || personUpdated) {
        await recordOwnerMediaChange(
          tx,
          {
            action: "camera_settings",
            home,
            camera,
            enabled,
            sound,
            personAction:
              change.personAction ??
              (await cameraPersonActionIn(tx, home, camera, signal)),
          },
          at,
          signal,
        );
      }
      const removeApproval = async (removed: string) => {
        const affected = await tx.run(
          {
            sql: "DELETE FROM camera_media_approval WHERE approval_key=@id",
            params: { id: key(home, camera, removed) },
          },
          signal,
        );
        if (affected) {
          await advanceApprovalRevision(tx, cameraKey, signal);
          await recordOwnerMediaChange(
            tx,
            { action: "approval_removed", home, camera, receiver: removed },
            at,
            signal,
          );
        }
      };
      for (const removed of change.remove ?? []) await removeApproval(removed);
      if (!receiver) return "saved" as const;
      if (change.approved) {
        const added = await tx.run(
          upsertStatement(tx.dialect, {
            table: "camera_media_approval",
            key: ["approval_key"],
            values: {
              approval_key: approvalKey,
              camera_key: cameraKey,
              receiver_id: receiver,
              location_id: home,
              device_id: camera,
              generation: randomUUID(),
            },
            onConflict: "ignore",
          }),
          signal,
        );
        if (added) {
          await advanceApprovalRevision(tx, cameraKey, signal);
          await recordOwnerMediaChange(
            tx,
            { action: "approval_added", home, camera, receiver },
            at,
            signal,
          );
        }
      } else {
        await removeApproval(receiver);
      }
      return "saved" as const;
    }, signal);
  }
}
