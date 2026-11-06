// The schema of the connector's own SQLite file (DS3, CD map v3 Outbox Store). It lives on SQLite
// only. A new migration goes at the end; a released one is never edited or removed (DS5).
//
// - `outbox`: one row per message not yet acked. `seq` is SQLite's row id, so rows come back in the
//   order they were written. `kind` has no CHECK, so a later release can add kinds (events and
//   `catchup_done` in iteration 002) without rebuilding the table. Times are UTC milliseconds.
// - `state_counter`: one row, the last `state_version` handed out (PT-30).
import type { Migration } from "../../../utilities/query-layer/index.ts";

export const OUTBOX_MIGRATIONS: readonly Migration<"sqlite">[] = [
  {
    version: 1,
    name: "outbox-and-state-counter",
    statements: {
      sqlite: [
        `CREATE TABLE outbox (
          seq INTEGER NOT NULL,
          message_id TEXT NOT NULL,
          kind TEXT NOT NULL,
          body TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          sent_at INTEGER,
          CONSTRAINT outbox_pk PRIMARY KEY (seq),
          CONSTRAINT outbox_message_id_uq UNIQUE (message_id)
        ) STRICT`,
        `CREATE TABLE state_counter (
          counter_id INTEGER NOT NULL,
          last_version INTEGER NOT NULL,
          CONSTRAINT state_counter_pk PRIMARY KEY (counter_id),
          CONSTRAINT state_counter_single_row CHECK (counter_id = 1)
        ) STRICT`,
        "INSERT INTO state_counter (counter_id, last_version) VALUES (1, 0)",
      ],
    },
  },
];
