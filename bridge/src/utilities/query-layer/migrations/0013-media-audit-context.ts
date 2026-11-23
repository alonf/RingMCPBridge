import type { Migration } from "./migration.ts";

function statements(sqlite: boolean): string[] {
  return [
    "location_id",
    "device_id",
    "event_id",
    "requester_id",
    "outcome",
  ].map((column) =>
    sqlite
      ? `ALTER TABLE media_access_log ADD COLUMN ${column} TEXT`
      : `ALTER TABLE media_access_log ADD ${column} NVARCHAR(400) COLLATE Latin1_General_100_BIN2 NULL`,
  );
}
export const MEDIA_AUDIT_CONTEXT: Migration = {
  version: 13,
  name: "media-audit-context",
  statements: { sqlite: statements(true), tsql: statements(false) },
};
