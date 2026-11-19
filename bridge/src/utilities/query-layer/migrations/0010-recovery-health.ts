import type { Migration } from "./migration.ts";

// Pending summaries, receipt deduplication, and the latest connector backlog. The pending
// flag is nullable so rows from previous releases keep their original behavior.
function statements(sqlite: boolean): string[] {
  const integer = sqlite ? "INTEGER" : "BIGINT";
  const text = sqlite
    ? "TEXT"
    : "NVARCHAR(128) COLLATE Latin1_General_100_BIN2";
  const strict = sqlite ? " STRICT" : "";
  return [
    `ALTER TABLE event ADD recovery_pending ${text} NULL`,
    "CREATE INDEX event_recovery_pending ON event (recovery_pending, location_id) WHERE recovery_pending IS NOT NULL",
    "CREATE INDEX event_by_stored_at ON event (stored_at)",
    "CREATE INDEX audit_by_chain_time ON audit_entry (chain, ts)",
    `CREATE TABLE recovery_marker (marker_id ${text} NOT NULL PRIMARY KEY, completed_at ${integer} NOT NULL)${strict}`,
    `ALTER TABLE health_snapshot ADD event_backlog_count ${integer} NULL`,
    `ALTER TABLE health_snapshot ADD event_backlog_oldest_age_ms ${integer} NULL`,
    `CREATE TABLE health_incident (part ${text} NOT NULL PRIMARY KEY, since_ms ${integer} NOT NULL, kind ${text} NOT NULL, location_id ${text} NOT NULL)${strict}`,
  ];
}
export const RECOVERY_HEALTH: Migration = {
  version: 10,
  name: "recovery-health",
  statements: { sqlite: statements(true), tsql: statements(false) },
};
