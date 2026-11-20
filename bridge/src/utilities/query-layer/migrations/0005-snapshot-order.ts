// Migration 5 (CP-14 review round 3): the newest inventory State has applied, and the time since
// which the home owes the core a fresh inventory.
// - `state_snapshot` keeps the `snapshot_version` of the newest inventory applied, so an older one
//   resent later changes nothing: it cannot bring back what a newer one removed, and an empty one
//   can still be ordered. One row; a new connector key clears it, as it resets the versions.
// - `health_snapshot.refresh_owed_since`: a session opened, and the data stays stale until that
//   session's own inventory is stored (FR-006).
// Additive: one new table and one nullable column, so code N-1 still runs on this schema (DS5).
// Once released, this file never changes.
import type { Migration } from "./migration.ts";

export const SNAPSHOT_ORDER: Migration = {
  version: 5,
  name: "snapshot-order",
  statements: {
    sqlite: [
      `CREATE TABLE state_snapshot (
        snapshot_id INTEGER NOT NULL,
        snapshot_version INTEGER NOT NULL,
        CONSTRAINT state_snapshot_pk PRIMARY KEY (snapshot_id),
        CONSTRAINT state_snapshot_one_row CHECK (snapshot_id = 1)
      ) STRICT`,
      "ALTER TABLE health_snapshot ADD COLUMN refresh_owed_since INTEGER",
    ],
    tsql: [
      `CREATE TABLE state_snapshot (
        snapshot_id INT NOT NULL,
        snapshot_version BIGINT NOT NULL,
        CONSTRAINT state_snapshot_pk PRIMARY KEY (snapshot_id),
        CONSTRAINT state_snapshot_one_row CHECK (snapshot_id = 1)
      )`,
      "ALTER TABLE health_snapshot ADD refresh_owed_since BIGINT NULL",
    ],
  },
};
