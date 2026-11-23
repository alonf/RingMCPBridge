import type { Migration } from "./migration.ts";

function statements(sqlite: boolean): string[] {
  const text = sqlite
    ? "TEXT"
    : "NVARCHAR(256) COLLATE Latin1_General_100_BIN2";
  const integer = sqlite ? "INTEGER" : "BIGINT";
  return [
    `CREATE TABLE media (
      media_id ${text} NOT NULL PRIMARY KEY,
      cache_key ${text} NOT NULL UNIQUE,
      location_id ${text} NOT NULL, device_id ${text} NOT NULL, event_id ${text} NOT NULL,
      kind ${text} NOT NULL, has_sound INTEGER NOT NULL,
      source ${text} NOT NULL, captured_at ${integer} NOT NULL, expires_at ${integer} NOT NULL,
      status ${text} NOT NULL CHECK(status IN ('pending','ready','deleting')),
      byte_length ${integer} NOT NULL, write_until ${integer} NOT NULL
    )${sqlite ? " STRICT" : ""}`,
    "CREATE INDEX media_by_expiry ON media (expires_at)",
  ];
}

export const EVENT_MEDIA: Migration = {
  version: 11,
  name: "event-media",
  statements: { sqlite: statements(true), tsql: statements(false) },
};
