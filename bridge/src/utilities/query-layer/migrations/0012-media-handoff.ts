import type { Migration } from "./migration.ts";

function statements(sqlite: boolean): string[] {
  const id = sqlite ? "TEXT" : "NVARCHAR(64) COLLATE Latin1_General_100_BIN2";
  const receiver = sqlite
    ? "TEXT"
    : "NVARCHAR(400) COLLATE Latin1_General_100_BIN2";
  const suffix = sqlite ? " STRICT" : "";
  const time = sqlite ? "INTEGER" : "BIGINT";
  return [
    `CREATE TABLE camera_media_policy (camera_key ${id} NOT NULL PRIMARY KEY, enabled INTEGER NOT NULL, sound INTEGER NOT NULL, generation ${id} NOT NULL)${suffix}`,
    `CREATE TABLE camera_media_approval (approval_key ${id} NOT NULL PRIMARY KEY, camera_key ${id} NOT NULL, receiver_id ${receiver} NOT NULL, generation ${id} NOT NULL)${suffix}`,
    "CREATE INDEX approvals_by_camera ON camera_media_approval (camera_key)",
    `CREATE TABLE media_ticket (token_hash ${id} NOT NULL PRIMARY KEY, media_id ${id} NOT NULL, receiver_id ${receiver} NOT NULL, policy_generation ${id} NOT NULL, approval_generation ${id} NOT NULL, expires_at ${time} NOT NULL)${suffix}`,
    "CREATE INDEX tickets_by_expiry ON media_ticket (expires_at)",
    `CREATE TABLE media_access_log (access_id ${id} NOT NULL PRIMARY KEY, media_id ${id} NOT NULL, receiver_id ${receiver} NOT NULL, operation ${id} NOT NULL, ts ${time} NOT NULL)${suffix}`,
  ];
}
export const MEDIA_HANDOFF: Migration = {
  version: 12,
  name: "media-handoff",
  statements: { sqlite: statements(true), tsql: statements(false) },
};
