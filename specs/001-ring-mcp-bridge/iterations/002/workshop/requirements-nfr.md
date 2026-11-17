# Iteration 002 — requirements-nfr (medium)

**Closed**: 2026-11-17. The owner typed "move on" to the presentation below, without changing any of the four
recommendations. They are recorded as the crew's recommendations, accepted without objection, not as answered one by one.

## The numbers that apply

```text
 SC-001  HIGH event -> every connected agent within 10 s of the device triggering (ceiling);
         goal 5 s at p95, measured in a pilot log. MEDIUM within 30 s.
         The bridge's own processing <= 0.5 s at p95, checked automatically on every change.
 FR-009  Priorities are policy data, not code:
           HIGH:   flood, alarm triggered, doorbell, contact while armed, motion while armed,
                   Ring connection lost
           MEDIUM: contact while disarmed, camera motion with a person
           kept but not pushed: motion while disarmed, other camera motion
 FR-042  Resend unacked events from home after 10 s; catch up Ring's history (up to 24 h)
         after a gap; reconnect within 60 s.
 FR-008  Events kept 30 days.
 FR-013  Late events (recovered, or held > 2 min) are stored and summarized, not pushed one by one.
```

## Decisions (the crew's recommendations, accepted without objection)

1. **Measuring SC-001.**
   - The bridge logs, for every event, the time from the device's trigger (Ring's timestamp) to ChatGPT accepting the
     webhook. That is the pilot log for the 5 s goal and the 10 s ceiling.
   - The automatic 0.5 s check in CI extends from reads to events.
   - The owner adds a few stopwatch samples of the dot itself (CP-21b). The bridge cannot see when the dot lights up.
2. **The backoff against FR-042.** The first resend stays at exactly 10 s; backoff starts only when acks keep failing.
   Read as consistent with FR-042; no spec change.
3. **The priority table.** FR-009's table ships as written, as a data file the code reads. Per-client opt-ins stay in
   iteration 003.
4. **Retention and late events.** Events are kept 30 days and purged by the core's Scheduler. Late events are
   summarized as FR-013 says.
