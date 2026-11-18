// Migration 8 (T048; FR-010, FR-012): MCP Events webhook subscriptions, owned by Subscriptions.
// - `webhook_subscription`: one row per subscription, keyed by its id. The id is derived from the
//   client, the event type and the callback, so a renewal of the same subscription updates its row
//   rather than adding a second one that would deliver every event twice.
// - `delivery` holds the callback address and the signing secret, sealed with the core's
//   `delivery-sealing-key`: a copy of the database alone reveals neither.
// - `expires_at` is the `refreshBefore` the core granted; after it, nothing is delivered.
// The cursor fields per client and location (`subscription`, data-model.md "Cursor") come with
// T051 in their own table. Times are UTC milliseconds; SQLite tables are STRICT; SQL Server text
// compares by code point, as in migration 1. Additive: one new table, so code N-1 still runs.
// Once released, this file never changes.
import type { Migration } from "./migration.ts";

/** SQL Server: text compared by code point, as SQLite compares it. */
const TEXT = "COLLATE Latin1_General_100_BIN2";

export const WEBHOOK_SUBSCRIPTIONS: Migration = {
  version: 8,
  name: "webhook-subscriptions",
  statements: {
    sqlite: [
      `CREATE TABLE webhook_subscription (
        sub_id TEXT NOT NULL,
        client_id TEXT NOT NULL,
        event_name TEXT NOT NULL,
        delivery BLOB NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        CONSTRAINT webhook_subscription_pk PRIMARY KEY (sub_id)
      ) STRICT`,
      "CREATE INDEX webhook_subscription_by_expiry ON webhook_subscription (expires_at)",
    ],
    tsql: [
      `CREATE TABLE webhook_subscription (
        sub_id NVARCHAR(64) ${TEXT} NOT NULL,
        client_id NVARCHAR(512) ${TEXT} NOT NULL,
        event_name NVARCHAR(64) ${TEXT} NOT NULL,
        delivery VARBINARY(MAX) NOT NULL,
        created_at BIGINT NOT NULL,
        expires_at BIGINT NOT NULL,
        CONSTRAINT webhook_subscription_pk PRIMARY KEY (sub_id)
      )`,
      "CREATE INDEX webhook_subscription_by_expiry ON webhook_subscription (expires_at)",
    ],
  },
};
