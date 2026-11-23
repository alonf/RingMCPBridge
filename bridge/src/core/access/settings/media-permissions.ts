import { createHash, randomUUID } from "node:crypto";
import { upsertStatement } from "../../../utilities/query-layer/index.ts";
import type { QueryLayer } from "../../../utilities/query-layer/index.ts";

export interface CameraPermission {
  readonly enabled: boolean;
  readonly sound: boolean;
  readonly generation: string;
  readonly approvals: ReadonlyMap<string, string>;
}
export interface CameraChange {
  readonly enabled: boolean;
  readonly sound: boolean;
  readonly approved: boolean;
}

function key(...parts: string[]): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}
/** Each receiver has its own generation. A camera switch change invalidates all of its tickets. */
export class MediaPermissions {
  private readonly db: QueryLayer;
  constructor(db: QueryLayer) {
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
        sql: "SELECT p.enabled,p.sound,p.generation,a.receiver_id,a.generation AS approval FROM camera_media_policy p LEFT JOIN camera_media_approval a ON a.camera_key=p.camera_key WHERE p.camera_key=@camera_key",
        params: { camera_key: cameraKey },
      },
      signal,
    );
    const policy = rows[0];
    return {
      enabled: policy?.enabled === 1,
      sound: policy ? policy.sound === 1 : true,
      generation: String(policy?.generation ?? ""),
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
  ): Promise<void> {
    const cameraKey = key(home, camera);
    const approvalKey = key(home, camera, receiver);
    const enabled = Number(change.enabled),
      sound = Number(change.sound);
    await this.db.transaction(async (tx) => {
      await tx.run(
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
      await tx.run(
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
      if (!receiver) return;
      if (change.approved) {
        await tx.run(
          upsertStatement(tx.dialect, {
            table: "camera_media_approval",
            key: ["approval_key"],
            values: {
              approval_key: approvalKey,
              camera_key: cameraKey,
              receiver_id: receiver,
              generation: randomUUID(),
            },
            onConflict: "ignore",
          }),
          signal,
        );
      } else {
        await tx.run(
          {
            sql: "DELETE FROM camera_media_approval WHERE approval_key=@approval_key",
            params: { approval_key: approvalKey },
          },
          signal,
        );
      }
    }, signal);
  }
}
