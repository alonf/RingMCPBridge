// Migration 2 (T022): the code a pending enrollment was requested with, so the admin page can show
// it for the owner to compare with the code the connector printed (SC2, PT-32). Additive: one
// nullable column, so code N-1 still runs on this schema (DS5). Once released, this file never
// changes; a later change is a new migration.
import type { Migration } from "./migration.ts";

/** SQL Server: text compared by code point, as SQLite compares it (see migration 1). */
const TEXT = "COLLATE Latin1_General_100_BIN2";

export const CONNECTOR_ENROLLMENT_CODE: Migration = {
  version: 2,
  name: "connector-enrollment-code",
  statements: {
    sqlite: ["ALTER TABLE connector ADD COLUMN enrollment_code TEXT"],
    tsql: [
      `ALTER TABLE connector ADD enrollment_code NVARCHAR(64) ${TEXT} NULL`,
    ],
  },
};
