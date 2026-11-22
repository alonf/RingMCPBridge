# Iteration Plan: 002

**Schema**: v1
**Spec**: [../../spec.md](../../spec.md)
**Status**: retro
**Capacity**: 33.75/42 story_points
**Started**: 2026-11-17
**Completed**:

<!--
  Validator schema (canonical, enforced by validate-governance.ps1):
  - Iteration Status MUST be one of:
      planning | executing | reviewing | retro | complete | abandoned
    (Common mistakes the validator REJECTS: `approved`, `in-progress`, `done`, `ready`.)
  - Capacity format MUST be `<consumed>/<cap> <effort_unit>` with NO trailing prose on that line.
    Append explanatory notes in the Notes section at the bottom instead.
  - Task Status (in the Tasks table) MUST be one of:
      planned | in-progress | done | needs-rework | deferred | blocked
    (Note `in-progress` uses a hyphen, not an underscore. `done` not `completed`.)
-->

## Scope Summary

| Requirement | Summary | Stories |
| ----------- | ------- | ------- |
| FR-005 | The system MUST report its own health: the home link, the Ring session, push reception, the last event received, and since when data has been stale. | US1 (completed here) |
| FR-008 | The system MUST record every event in a durable log, ordered per location, with a unique event id, and MUST keep events for 30 days. | US2 |
| FR-009 | The system MUST assign priorities by policy data, not code (the spec's priority table). | US2 |
| FR-010 | The system MUST push HIGH and MEDIUM events in real time to every connected agent client, at least once, deduplicated by event id. Each client MUST be able to set which sensors and priorities it receives (opt-ins for events not pushed by default). | US2 (without opt-ins) |
| FR-011 | The system MUST let an agent read events after a cursor, with filters and a next cursor. The cursor MUST never skip and MUST survive restarts. The log is the source of truth, and push is a hint. | US2 |
| FR-012 | The system MUST deliver push both to clients on the current MCP protocol version and to clients on the earlier version, including a local relay that brings events to a desktop coding agent. | US2 (without the desktop relay) |
| FR-013 | The system MUST store events that arrive late (recovered after a gap of up to 24 hours, or held at home for more than 2 minutes) with a late marker and their priority. It MUST NOT push them one by one, and MUST instead push one recovery summary with the count, the time range, the sequence range and the highest priority among them. | US2 |
| FR-014 | The system MUST never delay an event for a snapshot. An event carries a frame link only if a frame was already captured. | US2 |
| FR-015 | The system MUST raise a HIGH health event when the Ring connection is down for more than 2 minutes, and a recovery event when it returns. | US2 |
| FR-026 | The system MUST enforce configurable per-agent rate limits (defaults: control 20 an hour, counted on confirm; reads 600 an hour; fresh frames and bursts 60 an hour; clips 20 an hour). It MUST also limit its outgoing calls to Ring through one shared limiter with backoff, with no polling bursts. | cross-cutting (US2 path) |
| FR-030 | The system MUST grant the scopes read, media and control per client, and configuration switches MUST override scopes. Defaults: control for the chosen chat and coding agents; read-only for the local desktop relay; read and media for cloud-hosted agents acting under their own identity. | cross-cutting (US2 path) |
| FR-033 | The system MUST treat Ring-sourced text (device names, event text) and image content as untrusted data, MUST never act on instructions found in them, and MUST mark them as untrusted in its tool descriptions and schemas. | cross-cutting (US2 path) |
| FR-034 | Logs MUST carry identifiers, never content: no tokens, PIN, keys or images. | cross-cutting (US2 path) |
| FR-042 | The system MUST run at least 7 days unattended without a manual Ring re-login. It MUST reconnect within 60 seconds of a link or push drop, with growing delays (1 to 30 seconds, randomised). It MUST resend unacknowledged events from home after 10 seconds, and after a gap MUST catch up Ring's history (up to 24 hours) through the shared Ring limiter. | cross-cutting (US2 path) |
| FR-043 | The system MUST alert the owner out of band, by email and SMS, when no heartbeat is seen for 10 minutes, the home is offline for more than 10 minutes, the Ring session is lost, the audit chain does not match, or the audit's write-once copy is more than 1 hour behind. These out-of-band alerts apply to hybrid mode; all-in-one mode has no outside watcher (FR-045). | cross-cutting (part) |
| FR-046 | The tool list is the public contract and MUST change only additively: a tool is deprecated before removal. The link between the home part and the cloud part MUST be versioned, and the cloud part MUST accept the current and the previous version. | cross-cutting (US2 path) |
| FR-047 | The system MUST publish its public contract (tool inputs and outputs, the event shape) as machine-readable schemas. | cross-cutting (US2 path) |
| FR-048 | Tool input schemas MUST be flat (enums and optional fields, no alternatives or nullable unions), so that every target client can use them. | cross-cutting (US2 path) |

The feature-level plan is [../../plan.md](../../plan.md): the iteration map, technical context, quality planning and cost. This file is its iteration 002 slice, re-checked by iteration 002's design analysis ([design-analysis.md](design-analysis.md)). The owner chose Option B on 2026-11-17 (`416403e`): risk first, each part built once.

Partly in iteration 002:

- FR-005: completed. `get_health` adds push reception, the last event received and the home's backlog.
- FR-010: without per-client opt-ins, which come in iteration 003.
- FR-012: without the local relay to a desktop coding agent (the channel shim), deferred by the owner (DRIFT-002-02 in [drift-log.md](drift-log.md)). Claude reads events with `get_events`.
- FR-014: no event carries a frame link until media arrives in iteration 003; no event waits for one.
- FR-026: `get_events` counts against the read limit, and catch-up goes through the shared Ring limiter.
- FR-030: only clients with the read scope subscribe.
- FR-043: no heartbeat for 10 minutes, the home offline over 10 minutes and the Ring session lost, plus the home's event backlog over about 5 minutes (the owner's addition). The audit conditions come with the audit chain in iteration 004.
- FR-046: link version 1 gains its event messages without a version bump.

Success criteria touched: SC-001 (the 10-second budget, first samples), SC-002 (no HIGH event lost: the kill-and-restart and dropped-link tests read every event from the cursor), SC-003 (the soak's result), SC-005 (the HIGH health event), SC-010 (the alerts) and SC-011 (the bill).

The owner's decisions in the design analysis add three things beyond the spec's text: the home's backlog in the heartbeat and in `get_health`, an alert on that backlog, and the Ring-session-lost alert moved from iteration 004 into this one. DRIFT-002-04 records them.

## Tasks

Effort is each item's raw estimate scaled by about 1.8, iteration 001's measured ratio of effort to plan, as the owner decided on 2026-11-17 (capacity option 1). Each estimate includes its co-review rounds and its first real-world run. All figures are estimates.

| Task | Title | Requirement | Story | Effort | Owner | Owner File Globs | Status | Agent | Actual | Verdict |
| ---- | ----- | ----------- | ----- | ------ | ----- | ---------------- | ------ | ----- | ------ | ------- |
| CP-08b | Home event intake: the push probe first; Push Listener, Normalize (Ring text marked untrusted) and Ingest; events into the Outbox with a send window of about 50 and backoff on the oldest (10 s doubling to 5 min, with jitter), held until the core acks after its commit; the backlog in the heartbeat; catch-up up to 24 hours through the shared Ring limiter, marked late; the link's event messages in version 1 | FR-008, FR-013, FR-026, FR-033, FR-042, FR-046 | US2 | 6.3 | Implementer | `bridge/src/connector/**`, `bridge/src/utilities/**` | done | — | — | — |
| CP-11b | Core event path: Classify (FR-009's table as a data file, the late-event rule); Event Log, State and Audit in one transaction, dedup by event id, then the ack home; the recovery summary; Ring-down and recovery events through the event path; `get_health` adds push reception, the last event and the backlog; 30-day retention; the CI 0.5 s latency check extended to events | FR-005, FR-008, FR-009, FR-013, FR-014, FR-015, FR-034 | US2 | 6.3 | Implementer | `bridge/src/core/**`, `bridge/src/contract/**`, `schemas/**` | done | — | — | — |
| CP-12 | Subscriptions and cursors: cursors with epochs that never skip and survive restarts; each client's delivery state; `get_events` after a cursor with filters and a next cursor, flat input, read scope and read limit | FR-010, FR-011, FR-026, FR-030, FR-047, FR-048 | US2 | 1.8 | Implementer | `bridge/src/core/**`, `bridge/src/contract/**`, `schemas/**` | done | — | — | — |
| CP-13 | Delivery: the ChatGPT adapter for MCP Events as OpenAI's draft publishes them (signed webhooks; each subscription's callback address and signing secret in the database, encrypted; callbacks through the bounded fetch), and the minimal listen stream for earlier-era clients. HIGH and MEDIUM pushed at least once, dedup by event id, Ring text marked untrusted. The channel shim is deferred (DRIFT-002-02) | FR-010, FR-012, FR-030, FR-033 | US2 | 3.6 | Implementer | `bridge/src/core/**` | done | — | — | — |
| CP-18 | One Azure Monitor alert rule, by email and SMS: no heartbeat for 10 minutes, the home offline over 10 minutes, the backlog over about 5 minutes, the Ring session lost | FR-043 | cross-cutting | 2.25 | Implementer | `infra/**`, `bridge/src/core/**` | deferred | — | — | Pilot remainder in 003 |
| CP-20 | Spike S1, time-boxed: can a non-US Ring account register an official private app (TG-004, the accepted unknown S1)? The owner does the Ring developer-portal steps; no Ring credentials or codes pass through the chat | TG-004 | discovery | 1.8 | Implementer, with the owner's account | — | done | — | — | — |
| CP-21b | The dot and the first end-to-end latency samples: SC-001 measured from Ring's trigger to ChatGPT accepting the webhook, logged per event; the owner's stopwatch samples of the dot; the agent read from ChatGPT on the new core | FR-010, FR-012 | US2 | 1.8 | Owner, with the Implementer | — | deferred | — | — | Pilot remainder in 003 |
| CP-MR | Midpoint independent review, after the dot (iteration 001's Lesson 6) | FR-005, FR-008, FR-009, FR-010, FR-011, FR-012, FR-013, FR-014, FR-015, FR-026, FR-030, FR-033, FR-034, FR-042, FR-043, FR-046, FR-047, FR-048 | all | 1.8 | Reviewer | — | done | — | — | — |
| CP-RV | Review: independent review rounds and the hardening review | FR-005, FR-008, FR-009, FR-010, FR-011, FR-012, FR-013, FR-014, FR-015, FR-026, FR-030, FR-033, FR-034, FR-042, FR-043, FR-046, FR-047, FR-048 | all | 3.6 | Reviewer | — | done | — | — | Accepted |
| CP-RW | Expected rework | FR-005, FR-008, FR-009, FR-010, FR-011, FR-012, FR-013, FR-014, FR-015, FR-026, FR-030, FR-033, FR-034, FR-042, FR-043, FR-046, FR-047, FR-048 | all | 3.6 | Implementer | — | done | — | — | Accepted |
| CP-PJ | Carried pilot reads: SC-003's 7-day soak result and the clock check at its end (about 2026-11-21), including the Ring session's re-establishment on 2026-11-16; the month's bill against SC-011's $30 ceiling | FR-042 | pilot | 0.9 | Implementer, with the owner | — | deferred | — | — | Pilot remainder in 003 |

## Effort Model

| Setting | Value | Notes |
| ------- | ----- | ----- |
| Effort Unit | story_points | Unit used in task effort, capacity, and retro variance. |
| Capacity per Iteration | 42 | Maximum planned effort before overcommit guidance applies. |
| Iteration Bounding | scope | `scope` keeps requirements fixed; `time` enforces a time ceiling. |
| Time Limit (hours) | n/a | Only applies when iteration bounding is `time`. |
| Overcommit Threshold | 1.0 | Warn planners when total estimated effort exceeds 42 story_points (capacity 42 x threshold 1.0). |
| Defer Strategy | manual | How planning should choose deferrals when the iteration is over capacity. |
| Calibration Enabled | true | When true, retrospectives should suggest future capacity adjustments. |

## Concurrency Rationale

- Current roster snapshot: Spec Steward, Planner, Implementer, Reviewer, Retro Facilitator
- Technology and scope signals: a TypeScript service and a home daemon, joined by the link. Iteration 002 builds no screen: the dot is ChatGPT's own indicator.
- Task dependency graph, in Option B's order:
  1. Probes in parallel: the push probe at home (CP-08b's first step); MCP Events on the owner's ChatGPT plan with a test subscription against a stub (CP-13's first step); Spike S1 (CP-20).
  2. The event path end to end: CP-08b's intake and Outbox, and CP-11b's one-transaction write with the ack after commit.
  3. ChatGPT delivery and the dot: CP-13's ChatGPT adapter and CP-21b. Then the midpoint review (CP-MR).
  4. Cursors and `get_events` (CP-12); catch-up, late events and the recovery summary (CP-08b, CP-11b); Ring-down events and the health fields (CP-11b).
  5. The alert rule (CP-18) and the minimal listen stream (CP-13).
  6. CP-RV and CP-RW. CP-PJ when the soak ends and the month's bill closes.
  tasks.md sets the exact order.
- Workstream separability: the home side (CP-08b) and the core side (CP-11b, CP-12, CP-13) meet at the link's event messages, so keep same-specialty work serial.
- Shared-surface conflict risk: elevated. CP-11b, CP-12 and CP-13 share `bridge/src/core/**` and the event shape in `schemas/**`.
- Prior reviewer ownership/hotspot evidence: iteration 001's hotspots on this path are `bridge/src/connector/managers/ingest/ingest.ts`, `bridge/src/connector/access/outbox-store/outbox-store.ts`, `bridge/src/core/managers/event/event-manager.ts`, `bridge/src/core/clients/connector-link/core-session.ts` and `bridge/src/core/clients/mcp-endpoint/mcp-endpoint.ts`.
- Recommendation: do not propose Junior/Senior same-specialty expansion until the task table and ownership boundaries make safe parallelism explicit. If a same-specialty pair is approved later, record `Owner File Globs` for the parallel tasks or keep the work serial.

## Phase Baseline

| Phase | Estimated Effort | Notes |
| ----- | ---------------- | ----- |
| Planning | spent | The design analysis and this stage; not counted in the 42 |
| Discovery/Spikes | 3.6 | CP-20 and CP-21b. The push probe and the MCP Events test sit inside CP-08b and CP-13 |
| Implementation | 20.25 | CP-08b, CP-11b, CP-12, CP-13 and CP-18 |
| Review | 5.4 | CP-MR and CP-RV |
| Rework | 3.6 | CP-RW |
| Carried | 0.9 | CP-PJ |

## Traceability Summary

- Requirement scope: FR-005, FR-008, FR-009, FR-010, FR-011, FR-012, FR-013, FR-014, FR-015, FR-026, FR-030, FR-033, FR-034, FR-042, FR-043, FR-046, FR-047, FR-048
- User stories represented in current scope: US2 (pushed events, the cursor, late events and the recovery summary, Ring-down health), and US1's health completed (FR-005).
- CP-20 traces to TG-004 and the accepted unknown S1, not to an FR: the spike decides which Ring path iteration 003 widens, as the feature plan's spike table states.
- Every requirement in scope maps to at least one work item above. tasks.md, at the tasks stage, breaks them into tasks mapped to FRs and SCs and runs the traceability check.
- Overcommit guardrail: 33.75 planned against 42 (threshold 1.0), so no deferral is needed. The about 8 SP of headroom is kept for the first-contact items: the push probe, MCP Events, S1 and the dot (estimate).

## Notes

- This plan was scaffolded by `scaffold-iteration-plan.ps1` and filled from iteration 002's design analysis on 2026-11-17.
- **Raw and scaled effort.** The raw estimates total 18.75 SP: 17.25 for the event work, review and rework, plus 1.5 for the carried items. At about 1.8 that is 33.75 SP of effort. The Capacity line shows the planned 33.75 against the cap of 42.
- **Quality.** The quality resolver again marks concurrency, resiliency and retry/idempotency as not applicable. They are overridden to required, as in iteration 001 (DRIFT-002-03, citing DRIFT-001-01). Iteration 002's hardening gate, [quality/hardening-gate.md](quality/hardening-gate.md), is filled for the event path and signed off before implementation starts.
- **The task ledger** (DRIFT-002-01). Until the owner's reviewer session for Specrew confirms whether task ids that match tasks.md let Specrew track iteration 002, the proven path applies: as each task finishes, its entry in `tasks-progress.yml` is set to done with its times and committed, and one session start before review-signoff rebuilds state.md. Proposed: commit iteration 002's `tasks-progress.yml` from the start, because the closeout seal lists it. The owner decides at the plan boundary.
- **Production deploys** need the owner's explicit OK each time. Step 1's MCP Events test probably needs one, because ChatGPT's test subscription calls the public endpoint.
- **Spike S1 uses the owner's Ring account.** The owner does the developer-portal steps.
- **Research-needed during the work:** ChatGPT's callback hosts and who issues the signing secret; MCP Events on the owner's ChatGPT plan; SMS to an Israeli number; the push library's "crypto-key is missing" line.
- **Cost:** about $23 a month from iteration 002, of which the alert rule is about $1.50, plus cents for SMS (agent-derived list prices read 2026-10-26; feature plan). The midpoint review runs on the reviewer's account, so its money cost is unknown.
- **Closeout accounting.** Eight packages finished their accepted scope. Three carry the remaining field measurements to 003 under decision `rmb-i002-pilot-checks-deferred`. The 33.75-point figure is the approved budget. Actual consumption and velocity are unknown.
