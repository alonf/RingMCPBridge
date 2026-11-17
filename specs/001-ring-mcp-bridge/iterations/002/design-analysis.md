# Design Analysis — Feature 001-ring-mcp-bridge / Iteration 002

**Feature**: 001-ring-mcp-bridge
**Iteration**: 002
**Date**: 2026-11-17
**Spec**: file:///C:/Dev/RingMCPBridge/specs/001-ring-mcp-bridge/spec.md
**Status**: draft, in progress with the owner

<!--
  This artifact is the durable pre-plan design decision record. Plan generation is
  blocked until this file is valid AND the Human Decision section records a chosen
  option and commit hash.
-->

## Problem Framing

Iteration 001 delivered the read path on the hybrid topology. The home connector holds the Ring session, the core in Azure serves the four read tools, and ChatGPT and Claude sign in through the bridge's Issuer and read the home. It closed on 2026-11-16 at about 75.75 SP of effort against a plan of 42 (estimate; iteration 001's retro).

Iteration 002 adds pushed events, as the feature plan forecast it (16 SP before calibration):

- Ring's push reaches the home connector, which normalizes events, catches up to 24 hours, and marks late events (CP-08b).
- The core classifies events, then writes the Event Log, State and Audit in one transaction. It gives a recovery summary and a Ring-down health event (CP-11b).
- Each client gets cursors with epochs and its own delivery state (CP-12).
- Delivery uses current-era MCP events (ChatGPT), earlier-era clients, the listen stream and the channel shim (CP-13).
- Out-of-band alerts cover heartbeat loss and the home offline (CP-18).
- Spike S1 asks whether a non-US account can register an official Ring private app (CP-20).
- The dot and the first end-to-end latency samples (CP-21b).

The architecture is already decided at the feature level: the component map, the contracts and the implementation rules. This design analysis decides how iteration 002 slices and orders that work, and what it takes from iteration 001's retro.

The unknowns it must face:

- whether ChatGPT's MCP events reach the agent, and how the dot behaves (integration-api S4, S7);
- whether a HIGH event reaches agents within 10 seconds end to end (SC-001);
- how reliable Ring's push reception is, starting from the push library's "crypto-key is missing" log line;
- whether a non-US Ring account can register an official private app (S1).

## Key Design Decision Points

1. **Capacity and calibration.** Decided; see Decisions So Far.
2. **Which design areas apply** (the design-analysis questionnaire).
3. **The slice and order of the event path.** Simplest to by-the-book options, as in iteration 001.
4. **Risk order** among the unknowns above.
5. **The carried items** from iteration 001's retro Signals, and which of them enter iteration 002's scope:
   - SC-003's soak (ending about 2026-11-21) and the clock check;
   - SC-011's bill;
   - DRIFT-001-77, the snooze;
   - DRIFT-001-89's known limit;
   - the agent reads on the new core.
6. **Task ids and the task ledger** (DRIFT-002-01): task ids that match tasks.md, or the ledger kept current as each task finishes.
7. **A midpoint independent review** (iteration 001's Lesson 6).

## Applicable Lenses

Selected by the questionnaire in file:///C:/Dev/RingMCPBridge/specs/001-ring-mcp-bridge/iterations/002/lens-applicability.json (the owner typed "confirm", 2026-11-17). Eight of nine areas apply.

| Lens | Why | Depth | What it decides for iteration 002 |
| --- | --- | --- | --- |
| architecture-core | always on | light | The event path fits the decided topology (home connector and Azure core, plus all-in-one mode) with no new deployable |
| component-design | always on | full | The event path's components and responsibilities, co-designed, with one flow walked: Ring push to connector, link, Event manager, event log, agent notification |
| requirements-nfr | always on | medium | The 10-second budget (SC-001), 24-hour catch-up, at-least-once delivery with dedup, and how each is measured |
| security-compliance | auth and secrets: yes | medium | Untrusted event text reaching agents, push credentials on the home, per-client subscriptions |
| data-storage | persistent data: yes | medium | The event log, cursors with epochs, each client's delivery state, retention, the one-transaction write |
| integration-api | external services: yes | full | Ring's push (the "crypto-key is missing" line), MCP events to ChatGPT, earlier-era clients, the listen stream, the channel shim, the dot |
| devops-operations | deploy and CI: yes | light | The out-of-band alert rule (about $1.50 a month, feature plan) and the new migrations |
| observability-resilience | performance and resilience: yes | medium | The Ring-down health event, push-reception health, the recovery summary, catch-up |
| ui-ux | user-facing UI: no | skipped | Iteration 002 builds no screen of its own. The dot is ChatGPT's indicator, and the admin page does not change unless a later decision says it should show push health |

The coding rules carry over from the feature's implementation rules; a new dependency would come up under integration-api. The reviewer stays codex, as chosen for the feature.

## Decisions So Far

- **Capacity** (the owner, 2026-11-17, typed "1"):
  - Keep the capacity at 42 SP, and scale each task estimate by about 1.8, iteration 001's measured ratio of effort to plan (estimate).
  - Each estimate includes its co-review rounds and its first real-world run (iteration 001's Lesson 1).
  - At that ratio, the 16 SP forecast is about 29 SP of effort, leaving about 13 SP under the cap for the carried items (estimate).
- **Design areas** (the owner, 2026-11-17, typed "confirm"): the eight areas above, with ui-ux skipped.
- **architecture-core** (the owner, 2026-11-17, typed "Yes" and "move on"):
  - IDesign and the hybrid topology plus all-in-one mode stay. The channel shim on the owner's PC is the only new running piece.
  - Ring's push format and each agent platform's envelope stay behind their own boundaries.
  - Out of iteration 002: Control, Media, motion opt-ins, Ring's official API, and admin-page changes.
  - Record: file:///C:/Dev/RingMCPBridge/specs/001-ring-mcp-bridge/iterations/002/workshop/architecture-core.md
- **component-design** (the owner, 2026-11-17, answered the four decisions, then "move on"):
  - The event path's map is kept as shown in the record, with one flow walked: a doorbell ring from Ring's push to the agent.
  - Home gets its ack only after the core commits. Resends use a send window (about 50 in flight) and backoff on the oldest (10 s doubling to 5 minutes, with jitter). The backlog is reported in the heartbeat and `get_health`, with an alert after about 5 minutes. The outbox keeps everything until acked. About 2 SP of effort, inside CP-08b (estimate).
  - Catch-up stays at home, in Ingest.
  - The channel shim is deferred to a later iteration (DRIFT-002-02). Claude reads events with `get_events`.
  - Record: file:///C:/Dev/RingMCPBridge/specs/001-ring-mcp-bridge/iterations/002/workshop/component-design.md
- **requirements-nfr** (2026-11-17; the owner typed "move on" without changing the four recommendations):
  - SC-001 is measured from Ring's trigger time to ChatGPT accepting the webhook, logged for every event; the CI 0.5 s check extends to events; the owner adds stopwatch samples of the dot.
  - The first resend stays at 10 s, so the backoff is read as consistent with FR-042.
  - FR-009's priority table ships as a data file. Events are kept 30 days. Late events are summarized (FR-013).
  - Record: file:///C:/Dev/RingMCPBridge/specs/001-ring-mcp-bridge/iterations/002/workshop/requirements-nfr.md
