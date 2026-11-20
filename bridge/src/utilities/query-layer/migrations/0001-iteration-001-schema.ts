// Migration 1: the iteration 001 tables (data-model.md; FR-002, FR-006, FR-044). Once released,
// this file never changes; a later change is a new migration.
//
// The same choices hold for both dialects, so one SQL statement gives one answer on either:
// - every time is UTC milliseconds since 1970 in an integer column; the accessors map it to ISO
//   8601;
// - a flag is the integer 0 or 1 (BIT on SQL Server);
// - a JSON document is text;
// - SQLite tables are STRICT, so a column refuses a value of the wrong type, as SQL Server does;
// - SQL Server text columns compare by code point (Latin1_General_100_BIN2), as SQLite does. Ids
//   differing only in case stay apart, which oidc-provider's tokens need;
// - enumerations have no CHECK, because SQLite cannot change a CHECK without rebuilding the table,
//   and migrations are additive. The owning accessor checks the value.
//
// Each table belongs to one accessor, which alone reads it (CD4, DS6): State owns `location`,
// `device` and `health_snapshot`; Settings owns `setting`, `agent` and `connector`; Grants owns
// `oidc_item`; Lease owns `lease`.
import type { Migration } from "./migration.ts";

/** SQL Server: text compared by code point, as SQLite compares it. */
const TEXT = "COLLATE Latin1_General_100_BIN2";

export const ITERATION_001_SCHEMA: Migration = {
  version: 1,
  name: "iteration-001-schema",
  statements: {
    sqlite: [
      `CREATE TABLE location (
        location_id TEXT NOT NULL,
        name TEXT NOT NULL,
        ownership TEXT NOT NULL,
        time_zone TEXT NOT NULL,
        alarm_mode TEXT,
        as_of INTEGER NOT NULL,
        state_version INTEGER NOT NULL,
        CONSTRAINT location_pk PRIMARY KEY (location_id)
      ) STRICT`,
      `CREATE TABLE device (
        device_id TEXT NOT NULL,
        location_id TEXT NOT NULL,
        name TEXT NOT NULL,
        kind TEXT NOT NULL,
        room TEXT,
        battery_pct INTEGER,
        battery_low INTEGER,
        power_mode TEXT NOT NULL,
        online INTEGER NOT NULL,
        state TEXT NOT NULL,
        as_of INTEGER NOT NULL,
        state_version INTEGER NOT NULL,
        CONSTRAINT device_pk PRIMARY KEY (device_id),
        CONSTRAINT device_location_fk FOREIGN KEY (location_id) REFERENCES location (location_id)
      ) STRICT`,
      "CREATE INDEX device_by_location ON device (location_id, device_id)",
      `CREATE TABLE health_snapshot (
        snapshot_id INTEGER NOT NULL,
        home_link_status TEXT,
        home_link_since INTEGER,
        ring_session_status TEXT,
        ring_session_since INTEGER,
        push_status TEXT,
        push_since INTEGER,
        last_event_at INTEGER,
        stale_since INTEGER,
        outbox_depth INTEGER,
        connector_version TEXT,
        as_of INTEGER NOT NULL,
        CONSTRAINT health_snapshot_pk PRIMARY KEY (snapshot_id),
        CONSTRAINT health_snapshot_one_row CHECK (snapshot_id = 1)
      ) STRICT`,
      `CREATE TABLE setting (
        name TEXT NOT NULL,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        CONSTRAINT setting_pk PRIMARY KEY (name)
      ) STRICT`,
      `CREATE TABLE agent (
        client_id TEXT NOT NULL,
        platform TEXT,
        scopes TEXT NOT NULL,
        redirect_uris TEXT NOT NULL,
        revoked_at INTEGER,
        last_seen_at INTEGER,
        CONSTRAINT agent_pk PRIMARY KEY (client_id)
      ) STRICT`,
      `CREATE TABLE connector (
        key_id TEXT NOT NULL,
        public_key TEXT NOT NULL,
        status TEXT NOT NULL,
        requested_at INTEGER NOT NULL,
        expires_at INTEGER,
        enrolled_at INTEGER,
        revoked_at INTEGER,
        connector_version TEXT,
        CONSTRAINT connector_pk PRIMARY KEY (key_id)
      ) STRICT`,
      `CREATE TABLE oidc_item (
        model TEXT NOT NULL,
        id TEXT NOT NULL,
        grant_id TEXT,
        uid TEXT,
        data TEXT NOT NULL,
        expires_at INTEGER,
        CONSTRAINT oidc_item_pk PRIMARY KEY (model, id)
      ) STRICT`,
      "CREATE INDEX oidc_item_by_grant ON oidc_item (grant_id)",
      "CREATE INDEX oidc_item_by_uid ON oidc_item (uid)",
      "CREATE INDEX oidc_item_by_expiry ON oidc_item (expires_at)",
      `CREATE TABLE lease (
        name TEXT NOT NULL,
        holder TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        CONSTRAINT lease_pk PRIMARY KEY (name)
      ) STRICT`,
    ],
    tsql: [
      `CREATE TABLE location (
        location_id NVARCHAR(128) ${TEXT} NOT NULL,
        name NVARCHAR(400) ${TEXT} NOT NULL,
        ownership NVARCHAR(32) ${TEXT} NOT NULL,
        time_zone NVARCHAR(64) ${TEXT} NOT NULL,
        alarm_mode NVARCHAR(32) ${TEXT},
        as_of BIGINT NOT NULL,
        state_version BIGINT NOT NULL,
        CONSTRAINT location_pk PRIMARY KEY (location_id)
      )`,
      `CREATE TABLE device (
        device_id NVARCHAR(128) ${TEXT} NOT NULL,
        location_id NVARCHAR(128) ${TEXT} NOT NULL,
        name NVARCHAR(400) ${TEXT} NOT NULL,
        kind NVARCHAR(32) ${TEXT} NOT NULL,
        room NVARCHAR(400) ${TEXT},
        battery_pct INT,
        battery_low BIT,
        power_mode NVARCHAR(32) ${TEXT} NOT NULL,
        online BIT NOT NULL,
        state NVARCHAR(MAX) ${TEXT} NOT NULL,
        as_of BIGINT NOT NULL,
        state_version BIGINT NOT NULL,
        CONSTRAINT device_pk PRIMARY KEY (device_id),
        CONSTRAINT device_location_fk FOREIGN KEY (location_id) REFERENCES location (location_id)
      )`,
      "CREATE INDEX device_by_location ON device (location_id, device_id)",
      `CREATE TABLE health_snapshot (
        snapshot_id INT NOT NULL,
        home_link_status NVARCHAR(32) ${TEXT},
        home_link_since BIGINT,
        ring_session_status NVARCHAR(32) ${TEXT},
        ring_session_since BIGINT,
        push_status NVARCHAR(32) ${TEXT},
        push_since BIGINT,
        last_event_at BIGINT,
        stale_since BIGINT,
        outbox_depth INT,
        connector_version NVARCHAR(64) ${TEXT},
        as_of BIGINT NOT NULL,
        CONSTRAINT health_snapshot_pk PRIMARY KEY (snapshot_id),
        CONSTRAINT health_snapshot_one_row CHECK (snapshot_id = 1)
      )`,
      `CREATE TABLE setting (
        name NVARCHAR(128) ${TEXT} NOT NULL,
        value NVARCHAR(MAX) ${TEXT} NOT NULL,
        updated_at BIGINT NOT NULL,
        CONSTRAINT setting_pk PRIMARY KEY (name)
      )`,
      `CREATE TABLE agent (
        client_id NVARCHAR(400) ${TEXT} NOT NULL,
        platform NVARCHAR(64) ${TEXT},
        scopes NVARCHAR(MAX) ${TEXT} NOT NULL,
        redirect_uris NVARCHAR(MAX) ${TEXT} NOT NULL,
        revoked_at BIGINT,
        last_seen_at BIGINT,
        CONSTRAINT agent_pk PRIMARY KEY (client_id)
      )`,
      `CREATE TABLE connector (
        key_id NVARCHAR(128) ${TEXT} NOT NULL,
        public_key NVARCHAR(MAX) ${TEXT} NOT NULL,
        status NVARCHAR(32) ${TEXT} NOT NULL,
        requested_at BIGINT NOT NULL,
        expires_at BIGINT,
        enrolled_at BIGINT,
        revoked_at BIGINT,
        connector_version NVARCHAR(64) ${TEXT},
        CONSTRAINT connector_pk PRIMARY KEY (key_id)
      )`,
      `CREATE TABLE oidc_item (
        model NVARCHAR(40) ${TEXT} NOT NULL,
        id NVARCHAR(400) ${TEXT} NOT NULL,
        grant_id NVARCHAR(128) ${TEXT},
        uid NVARCHAR(128) ${TEXT},
        data NVARCHAR(MAX) ${TEXT} NOT NULL,
        expires_at BIGINT,
        CONSTRAINT oidc_item_pk PRIMARY KEY (model, id)
      )`,
      "CREATE INDEX oidc_item_by_grant ON oidc_item (grant_id)",
      "CREATE INDEX oidc_item_by_uid ON oidc_item (uid)",
      "CREATE INDEX oidc_item_by_expiry ON oidc_item (expires_at)",
      `CREATE TABLE lease (
        name NVARCHAR(128) ${TEXT} NOT NULL,
        holder NVARCHAR(128) ${TEXT} NOT NULL,
        expires_at BIGINT NOT NULL,
        CONSTRAINT lease_pk PRIMARY KEY (name)
      )`,
    ],
  },
};
