# Iteration 002 — observability-resilience (medium)

**Closed**: 2026-11-17, the owner typed "all as recommended" and "move on".

```text
 get_health today:   home link, Ring session, database        (as_of, in the owner's time zone)
 get_health in 002:  + push reception: on / off / degraded, and the last push time
                     + the last event received
                     + events waiting at home: count, and the oldest one's age
 FR-015 / SC-005:    Ring down > 2 min -> data shows stale, and a HIGH health event to agents;
                     Ring back -> a recovery event
 FR-013:             after a gap, one recovery summary (count, time range, highest priority)
```

## Decisions (all as recommended)

1. **`get_health` adds** push reception, the last event received and the home's backlog: the fields FR-005 names,
   added only.
2. **Ring-down and recovery events go through the normal event path**, raised by the core's Health engine from the
   heartbeat, so they reach ChatGPT's dot and are kept in the log.
3. **Push states:** "on" means the receiver is registered and connected. "Degraded" means the library is rejecting
   messages (as with "crypto-key is missing"), or the history check found events push missed (that check only if the
   probe shows it is needed).
4. **Logs:** events are logged with identifiers only (event id, kind, priority, latency timings), never Ring's text
   (FR-034). The per-event latency log is SC-001's pilot log.
