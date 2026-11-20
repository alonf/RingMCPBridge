// Migration 7 (T046; FR-008, FR-011, PT-23, PT-33): the Event Log's and the Audit's tables.
// - `log_meta`: one row per location, with the log's epoch and the next `seq`. The counter moves
//   in the transaction that writes the event, so a rolled-back write leaves no gap.
// - `event`: the durable log, keyed by `(location_id, seq)`, with a unique `event_id` for dedup.
//   `device_id` and `media_id` are not foreign keys: an event outlives a device Ring no longer
//   lists, and media arrives in iteration 003.
// - `audit_chain`: one row per retention class, with its next `seq`.
// - `audit_entry`: one record per audited change, keyed by `(chain, seq)`. The hash chain
//   (`prev_hash`, `hash`), the anchor and the write-once copy come in iteration 004 as nullable
//   columns and new tables, so these rows are never rewritten.
// The choices of migration 1 hold: times are UTC milliseconds, flags are 0 or 1, JSON is text,
// SQLite tables are STRICT, SQL Server text compares by code point, enumerations have no CHECK.
// Additive: new tables only, so code N-1 still runs on this schema (DS5).
// Once released, this file never changes.
import type { Migration } from "./migration.ts";

/** SQL Server: text compared by code point, as SQLite compares it. */
const TEXT = "COLLATE Latin1_General_100_BIN2";

export const EVENT_LOG_AND_AUDIT: Migration = {
  version: 7,
  name: "event-log-and-audit",
  statements: {
    sqlite: [
      `CREATE TABLE log_meta (
        location_id TEXT NOT NULL,
        epoch INTEGER NOT NULL,
        next_seq INTEGER NOT NULL,
        CONSTRAINT log_meta_pk PRIMARY KEY (location_id)
      ) STRICT`,
      `CREATE TABLE event (
        location_id TEXT NOT NULL,
        seq INTEGER NOT NULL,
        event_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        priority TEXT NOT NULL,
        occurred_at INTEGER NOT NULL,
        received_at INTEGER NOT NULL,
        stored_at INTEGER NOT NULL,
        device_id TEXT,
        summary TEXT NOT NULL,
        media_id TEXT,
        late INTEGER NOT NULL,
        data TEXT,
        CONSTRAINT event_pk PRIMARY KEY (location_id, seq),
        CONSTRAINT event_id_unique UNIQUE (event_id)
      ) STRICT`,
      `CREATE TABLE audit_chain (
        chain TEXT NOT NULL,
        next_seq INTEGER NOT NULL,
        CONSTRAINT audit_chain_pk PRIMARY KEY (chain)
      ) STRICT`,
      `CREATE TABLE audit_entry (
        chain TEXT NOT NULL,
        seq INTEGER NOT NULL,
        kind TEXT NOT NULL,
        event_id TEXT,
        location_id TEXT,
        event_seq INTEGER,
        client_id TEXT,
        sub TEXT,
        action TEXT,
        result TEXT,
        ts INTEGER NOT NULL,
        CONSTRAINT audit_entry_pk PRIMARY KEY (chain, seq)
      ) STRICT`,
    ],
    tsql: [
      `CREATE TABLE log_meta (
        location_id NVARCHAR(128) ${TEXT} NOT NULL,
        epoch INT NOT NULL,
        next_seq BIGINT NOT NULL,
        CONSTRAINT log_meta_pk PRIMARY KEY (location_id)
      )`,
      `CREATE TABLE event (
        location_id NVARCHAR(128) ${TEXT} NOT NULL,
        seq BIGINT NOT NULL,
        event_id NVARCHAR(128) ${TEXT} NOT NULL,
        kind NVARCHAR(64) ${TEXT} NOT NULL,
        priority NVARCHAR(32) ${TEXT} NOT NULL,
        occurred_at BIGINT NOT NULL,
        received_at BIGINT NOT NULL,
        stored_at BIGINT NOT NULL,
        device_id NVARCHAR(128) ${TEXT},
        summary NVARCHAR(1000) ${TEXT} NOT NULL,
        media_id NVARCHAR(128) ${TEXT},
        late BIT NOT NULL,
        data NVARCHAR(MAX) ${TEXT},
        CONSTRAINT event_pk PRIMARY KEY (location_id, seq),
        CONSTRAINT event_id_unique UNIQUE (event_id)
      )`,
      `CREATE TABLE audit_chain (
        chain NVARCHAR(32) ${TEXT} NOT NULL,
        next_seq BIGINT NOT NULL,
        CONSTRAINT audit_chain_pk PRIMARY KEY (chain)
      )`,
      `CREATE TABLE audit_entry (
        chain NVARCHAR(32) ${TEXT} NOT NULL,
        seq BIGINT NOT NULL,
        kind NVARCHAR(32) ${TEXT} NOT NULL,
        event_id NVARCHAR(128) ${TEXT},
        location_id NVARCHAR(128) ${TEXT},
        event_seq BIGINT,
        client_id NVARCHAR(128) ${TEXT},
        sub NVARCHAR(128) ${TEXT},
        action NVARCHAR(64) ${TEXT},
        result NVARCHAR(64) ${TEXT},
        ts BIGINT NOT NULL,
        CONSTRAINT audit_entry_pk PRIMARY KEY (chain, seq)
      )`,
    ],
  },
};
