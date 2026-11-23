import type { Migration } from "./migration.ts";

function statements(sqlite: boolean) {
  const text = sqlite
    ? "TEXT"
    : "NVARCHAR(400) COLLATE Latin1_General_100_BIN2";
  const id = sqlite ? "TEXT" : "NVARCHAR(36) COLLATE Latin1_General_100_BIN2";
  const timestamp = sqlite ? "INTEGER" : "BIGINT";
  return [
    `CREATE TABLE owner_media_change (change_id ${id} NOT NULL PRIMARY KEY, ts ${timestamp} NOT NULL, action ${text} NOT NULL, location_id ${text}, device_id ${text}, receiver_id ${text}, enabled INTEGER, sound INTEGER, person_action ${text})${sqlite ? " STRICT" : ""}`,
    "CREATE INDEX owner_media_change_by_time ON owner_media_change (ts)",
  ];
}
export const OWNER_MEDIA_CHANGES: Migration = {
  version: 15,
  name: "owner-media-changes",
  statements: { sqlite: statements(true), tsql: statements(false) },
};
