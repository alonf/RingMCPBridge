// Migration 4 (T018): the connector key State's versions belong to (PT-30). A newly enrolled
// connector's version counter starts again, so State resets its versions when a session of another
// key opens. Keeping the key here, not in memory, means a core restart does not reset them for the
// same connector. Additive: one new table, one row. Once released, this file never changes.
import type { Migration } from "./migration.ts";

/** SQL Server: text compared by code point, as SQLite compares it (see migration 1). */
const TEXT = "COLLATE Latin1_General_100_BIN2";

export const STATE_SOURCE: Migration = {
  version: 4,
  name: "state-source",
  statements: {
    sqlite: [
      `CREATE TABLE state_source (
        source_id INTEGER NOT NULL,
        key_id TEXT NOT NULL,
        claimed_at INTEGER NOT NULL,
        CONSTRAINT state_source_pk PRIMARY KEY (source_id),
        CONSTRAINT state_source_one_row CHECK (source_id = 1)
      ) STRICT`,
    ],
    tsql: [
      `CREATE TABLE state_source (
        source_id INT NOT NULL,
        key_id NVARCHAR(128) ${TEXT} NOT NULL,
        claimed_at BIGINT NOT NULL,
        CONSTRAINT state_source_pk PRIMARY KEY (source_id),
        CONSTRAINT state_source_one_row CHECK (source_id = 1)
      )`,
    ],
  },
};
