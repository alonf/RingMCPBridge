import type { Migration } from "./migration.ts";
export const CAMERA_PERSON_EVENTS: Migration = {
  version: 14,
  name: "camera-person-events",
  statements: {
    sqlite: ["ALTER TABLE camera_media_policy ADD COLUMN person_action TEXT"],
    tsql: [
      "ALTER TABLE camera_media_policy ADD person_action NVARCHAR(16) COLLATE Latin1_General_100_BIN2 NULL",
    ],
  },
};
