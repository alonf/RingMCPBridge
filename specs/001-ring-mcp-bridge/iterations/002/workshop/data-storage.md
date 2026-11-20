# Iteration 002 — data-storage (medium)

**Closed**: 2026-11-17, the owner typed "all as recommended" and "move on".

## What iteration 002 adds

```text
 AZURE SQL (core; SQLite in all-in-one mode)
   event         event_id (unique, the dedup key), location_id + seq (never reused),
                 kind, priority, occurred_at (Ring), received_at (home), stored_at,
                 device_id, summary (untrusted-derived), late, data
   log_meta      per location: epoch (changes only after a restore or reset), next_seq
   subscription  per client and location: kind, epoch, last_seq, last_read_at
   audit         event_ingested: identifiers only, same transaction as event + state
 HOME SQLITE
   outbox        events until acked; the catch-up mark
 KEPT            events and their audit entries 30 days; subscriptions until revoked;
                 outbox rows until acked
```

## Decisions (all as recommended)

1. **The event log and cursor as the data model designs them** (`data-model.md`: Event, Cursor, PT-28). The cursor
   encodes location, epoch and position. After a restore or a "delete now", an old cursor reads from the start of the
   new epoch with `epoch_changed`, and the agent dedups by event id. Migrations only add.
2. **ChatGPT's webhook subscriptions.** The subscription row gains the callback address and the signing secret. The
   secret stays in the database, encrypted at rest (Azure SQL's default) and readable only by the core's identity, not
   as one Key Vault secret per subscription. Key Vault keeps the few long-lived secrets.
3. **Volume and cost.** About 100 to 300 events a day, so about 3,000 to 9,000 rows in 30 days (estimate). No database
   tier change, $0 extra (estimate).
