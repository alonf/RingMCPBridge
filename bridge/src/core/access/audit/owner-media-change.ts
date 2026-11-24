import { randomUUID } from "node:crypto";
import type { SqlSession } from "../../../utilities/query-layer/index.ts";
import type { EventAction } from "../../../utilities/config/index.ts";

type OwnerChange =
  | {
      action: "camera_settings";
      home: string;
      camera: string;
      enabled: number;
      sound: number;
      personAction: EventAction;
    }
  | {
      action: "approval_added" | "approval_removed";
      home: string;
      camera: string;
      receiver: string;
    }
  | {
      action: "approval_removed";
      receiver: string;
      cameraKey: string;
      home?: string;
      camera?: string;
    }
  | { action: "delete_cached_media" };

export async function recordOwnerMediaChange(
  tx: SqlSession,
  change: OwnerChange,
  at: number,
  signal: AbortSignal,
) {
  await tx.run(
    {
      sql: "INSERT INTO owner_media_change(change_id,ts,action,location_id,device_id,receiver_id,enabled,sound,person_action,camera_key) VALUES (@id,@at,@action,@home,@camera,@receiver,@enabled,@sound,@person,@cameraKey)",
      params: {
        id: randomUUID(),
        at,
        action: change.action,
        home: "home" in change ? change.home : null,
        camera: "camera" in change ? change.camera : null,
        cameraKey: "cameraKey" in change ? change.cameraKey : null,
        receiver: "receiver" in change ? change.receiver : null,
        enabled: change.action === "camera_settings" ? change.enabled : null,
        sound: change.action === "camera_settings" ? change.sound : null,
        person:
          change.action === "camera_settings" ? change.personAction : null,
      },
    },
    signal,
  );
}
