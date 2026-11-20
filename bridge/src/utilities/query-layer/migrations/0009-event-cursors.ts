// Migration 9 (T051; FR-010, FR-011): each client's read mark per location, owned by Subscriptions.
// - `event_cursor`: one row per client and location, holding the log epoch and the `seq` the client
//   last read up to. `get_events` without a cursor starts after it. A mark only moves forward within
//   an epoch, so a slow reader can never make a client read an event twice or lose its place; a new
//   epoch replaces it, and the reader is told (PT-28).
// Times are UTC milliseconds; SQLite tables are STRICT; SQL Server text compares by code point, as
// in migration 1. Additive: one new table, so code N-1 still runs. Once released, this file never
// changes.
import type { Migration } from "./migration.ts";

/** SQL Server: text compared by code point, as SQLite compares it. */
const TEXT = "COLLATE Latin1_General_100_BIN2";

export const EVENT_CURSORS: Migration = {
  version: 9,
  name: "event-cursors",
  statements: {
    sqlite: [
      `CREATE TABLE event_cursor (
        client_id TEXT NOT NULL,
        location_id TEXT NOT NULL,
        epoch INTEGER NOT NULL,
        seq INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        CONSTRAINT event_cursor_pk PRIMARY KEY (client_id, location_id)
      ) STRICT`,
    ],
    tsql: [
      `CREATE TABLE event_cursor (
        client_id NVARCHAR(512) ${TEXT} NOT NULL,
        location_id NVARCHAR(128) ${TEXT} NOT NULL,
        epoch BIGINT NOT NULL,
        seq BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        CONSTRAINT event_cursor_pk PRIMARY KEY (client_id, location_id)
      )`,
    ],
  },
};
