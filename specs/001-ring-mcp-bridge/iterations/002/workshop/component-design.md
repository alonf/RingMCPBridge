# Iteration 002 — component-design (full)

**Closed**: 2026-11-17, the owner typed "move on" after answering the four decisions below.

## The event path in iteration 002

A subset of the feature's component map v3 (`specs/001-ring-mcp-bridge/workshop/component-design.md`). Calls go only
downward.

```text
 [N] new in 002   [E] extended in 002   [=] used as built in 001

 AGENTS   ChatGPT (MCP events, the dot)   Claude, others (listen stream)   Claude Code
              ^                                 ^                               ^
              |                                 |      CHANNEL SHIM (your PC): deferred
 =========================== AZURE CORE ======================================================
 CLIENTS    [E] MCP Endpoint            [E] Connector Link          [N] Scheduler
 MANAGERS   [E] Event                   [E] Inquiry
 ENGINES    [N] Classify                [E] Health
 RESOURCE   [N] Event Log   [=] State   [N] Audit   [N] Subscriptions   [N] Delivery
 ACCESS
 SCHEMAS    [E] Public Contract (the event shape agents see)
 ======================================^======================================================
                                       | WSS link: events up, acks down
 =========================== HOME CONNECTOR ==================================================
 CLIENTS    [N] Push Listener           [E] Core Link               [=] Home Scheduler
 MANAGERS   [E] Ingest
 ENGINES    [N] Normalize
 RESOURCE   [E] Outbox Store            [=] Ring Adapter            [=] Secrets File
 ACCESS
```

- **Clients**
  - MCP Endpoint [E]: event notifications to current-era clients (ChatGPT, the dot), and `get_events`.
  - Connector Link [E]: event messages from home to Event, and acks back.
  - Scheduler [N]: minute ticks in the core: the home-offline check and the 30-day purge.
  - Push Listener [N] (home): Ring's push in.
  - Core Link [E] (home): events up, acks in.
  - Home Scheduler [=] (home): resends.
- **Managers**
  - Event [E]: one transaction per event, priority, fan-out, late events, health changes.
  - Inquiry [E]: `get_events` after a cursor, with filters and a next cursor.
  - Ingest [E] (home): normalize, outbox, send; catch-up after a gap (up to 24 hours), marked late.
- **Engines**
  - Classify [N]: priority from policy data (FR-009), the late-event rule.
  - Health [E]: the Ring-down event after 2 minutes, the recovery event, push-reception health.
  - Normalize [N] (home): Ring's payload into the bridge's event shape, Ring's text marked untrusted.
- **Resource access**
  - Event Log [N]: events in order per location, the epoch, dedup by event id.
  - State [=]: device state, updated by events.
  - Audit [N]: written in the same transaction.
  - Subscriptions [N]: each client's cursor and last-read mark.
  - Delivery [N]: one adapter per platform.
  - Outbox Store [E] (home): events until acked, the catch-up mark.

## Key flow: a doorbell ring (HIGH), within 10 seconds end to end

```text
Ring push -> Push Listener -> Ingest -> Normalize -> Outbox Store -> Core Link
  -> (link) -> Connector Link -> Event -> Classify (HIGH)
  -> one transaction: Event Log + State + Audit -> ack back home (the outbox clears)
  -> Delivery (per Subscriptions) -> ChatGPT event (the dot) / listen stream
  -> later, the agent calls get_events -> Inquiry -> its cursor -> Event Log
```

## Decisions

1. **The map** (the owner: "OK"): kept as shown.
2. **Acks, resends and the backlog** (the owner: "Is it exponential retry, what happens if more and more events are
   not getting ack", then "2 ok" to the proposal):
   - Home gets its ack only after the core's transaction commits; dedup by event id absorbs repeats.
   - A send window: at most about 50 events sent and unacked.
   - While nothing is acked, only the oldest is resent: 10 s, then 20, 40 and so on, capped at 5 minutes, with jitter.
     The first ack resets it, and the backlog drains in order. The first resend stays at 10 s for the 10-second
     budget.
   - The heartbeat reports the backlog's size and the oldest's age; `get_health` shows it; the out-of-band alert
     fires when the oldest has waited more than about 5 minutes.
   - The outbox keeps every event until it is acked, limited only by the disk; a full disk is reported in the
     heartbeat. This is option (a), the crew's recommendation, taken with "2 ok"; the owner did not choose (b).
   - About 1 SP before scaling, about 2 SP of effort (estimate), inside CP-08b. This is new against iteration 001's
     fixed 10 s resend of the whole backlog.
3. **Catch-up** (the owner: "OK"): at home, in Ingest, as the feature design says.
4. **The channel shim** (the owner: "2", after asking what it is for and noting Claude Code is not the intended client):
   - Deferred to a later iteration. The spec is unchanged; DRIFT-002-02 records the deferral.
   - The Claude apps have no documented way to take pushed events today (checked 2026-11-17); Claude reads events
     with `get_events`. If Anthropic adds push for Claude's connectors, Delivery gets one more adapter.
   - Frees about 1 of CP-13's 3 SP, about 2 SP of effort (estimate).
