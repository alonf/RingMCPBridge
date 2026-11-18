---

description: "Iteration 002 task list for the Ring MCP Bridge"
---

# Tasks: Ring MCP Bridge, iteration 002

**Input**: design documents in `specs/001-ring-mcp-bridge/`: `plan.md`, `iterations/002/plan.md` (approved 2026-11-17), `iterations/002/design-analysis.md` (Option B), `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`
**Scope**: iteration 002 only, 33.75 story points of effort against the cap of 42: US2's pushed events, the cursor, late events and the recovery summary, Ring-down health, and US1's health completed (FR-005). Iterations 003 and 004 get their own design analysis, plan and tasks stages.
**Tests**: requested.

- code-implementation I4.4: the failing test comes first for the engines, the edge parsers, Normalize and every bug fix. Elsewhere, tests are written with the code, in the same task.
- plan.md (`verification-confidence`): each FR gets a positive and a negative test, and failure-mode FRs are not covered by smoke tests only.

**Iteration 001's task list** (T001 to T036, all done) is kept unchanged in [tasks-iteration-001.md](tasks-iteration-001.md). Task numbers continue from T037, so a number names one task across the whole feature.

**Organization**: one phase per step of Option B's order. Tasks on the event path carry `[US2]`. The health-completion task carries `[US1]`. Probe, alert, review and pilot tasks carry no story label.

## Format: `- [ ] T### [P?] [US#?] [assigned_to: <role>] [effort: <SP>] Description with exact file path(s) (Trace: ...)`

- **[P]**: can run in parallel: different files, and no dependency on an unfinished task.
- **[US#]**: the user story the task serves.
- **[assigned_to]**: the role from `.specrew/role-assignments.yml`.
- **[effort]**: story points, already scaled by about 1.8 (iteration 001's measured ratio). All figures are estimates. The tasks sum to 33.75.
- **Trace**: the FRs and SCs the task serves (iteration 002 scope only), then the plan work item (CP-xx).

## Path Conventions

From plan.md "Project Structure": one npm workspace. Inside `bridge/src/core/` and `bridge/src/connector/`, IDesign layers are folders: `clients/`, `managers/`, `engines/`, `access/`.

- New folders in this iteration, one per new component of the agreed map:
  - home: `bridge/src/connector/clients/push-listener/`, `bridge/src/connector/engines/normalize/`;
  - core: `bridge/src/core/clients/scheduler/`, `bridge/src/core/engines/classify/`, `bridge/src/core/access/event-log/`, `bridge/src/core/access/audit/`, `bridge/src/core/access/subscriptions/`, `bridge/src/core/access/delivery/`.
- Extended in place: `bridge/src/connector/managers/ingest/`, `bridge/src/connector/access/outbox-store/`, `bridge/src/connector/clients/core-link/`, `bridge/src/core/clients/connector-link/`, `bridge/src/core/managers/event/`, `bridge/src/core/managers/inquiry/`, `bridge/src/core/engines/health/`, `bridge/src/core/clients/mcp-endpoint/`, `bridge/src/contract/`, `schemas/`.
- Owner values are placeholders everywhere: `<subscription>`, `<resource-group>`, `<core-host>`, `<owner-email>`, `<owner-phone>`. Real values never go into the repository. Pilot facts go in the pilot journal, which is not tracked.

## Work Item to Task Map (capacity check)

| Work item | Planned SP | Tasks | Task SP |
| --- | --- | --- | --- |
| CP-08b Home event intake | 6.3 | T038, T041, T042, T043, T044, T053 | 0.9 + 0.9 + 0.9 + 0.9 + 1.35 + 1.35 = 6.3 |
| CP-11b Core event path | 6.3 | T045, T046, T047, T054, T055 | 0.9 + 1.35 + 1.8 + 0.9 + 1.35 = 6.3 |
| CP-12 Subscriptions and cursors | 1.8 | T051, T052 | 0.9 + 0.9 = 1.8 |
| CP-13 Delivery | 3.6 | T039, T048, T057 | 0.9 + 1.8 + 0.9 = 3.6 |
| CP-18 Alert rule | 2.25 | T056 | 2.25 |
| CP-20 Spike S1 | 1.8 | T040 | 1.8 |
| CP-21b The dot and latency samples | 1.8 | T049 | 1.8 |
| CP-MR Midpoint review | 1.8 | T050 | 1.8 |
| CP-RV Review | 3.6 | T037, T058, T059 | 0.9 + 1.8 + 0.9 = 3.6 |
| CP-RW Rework | 3.6 | T060 | 3.6 |
| CP-PJ Carried pilot reads | 0.9 | T061 | 0.9 |
| **Total** | **33.75** | **25 tasks** | **33.75** |

---

## Phase 1: Hardening Review (before any code)

**Goal**: iteration 002's hardening gate is signed off before implementation starts.
**Independent test**: `iterations/002/quality/hardening-gate.md` records the effective review class, the reviewer and the approval reference, and no critical concern is open without the owner's approved deferral.
**Depends on**: the owner's tasks approval. Implementation also needs the before-implement approval.

- [x] T037 [assigned_to: Reviewer] [effort: 0.9] Review and sign off `specs/001-ring-mcp-bridge/iterations/002/quality/hardening-gate.md` for the event path:
  - the five concerns against the design analysis's decisions (the ack after commit, the send window and backoff, dedup, the callback rules, Ring text untrusted);
  - the three dimensions overridden to required: concurrency, resiliency, retry and idempotency (DRIFT-002-03);
  - the two planning additions, which the owner decides: a malformed Ring payload counts toward "push degraded", and one client's failed delivery never blocks the others.

  (Trace: FR-005, FR-008, FR-009, FR-010, FR-011, FR-012, FR-013, FR-014, FR-015, FR-026, FR-030, FR-033, FR-034, FR-042, FR-043, FR-046, FR-047, FR-048; CP-RV)

**Verification**: `pwsh -File .specify/extensions/specrew-speckit/scripts/validate-governance.ps1 -ProjectPath .`

---

## Phase 2: Probes (Option B, step 1)

**Goal**: the three biggest unknowns are met before the event path is built: Ring's push at home, MCP Events on the owner's ChatGPT plan, and Ring's official app registration.
**Independent test**: each probe ends with a written finding in `specs/001-ring-mcp-bridge/research.md` (a dated iteration 002 addendum) that says what was observed, what stays unknown, and what the next task does differently because of it.
**Depends on**: Phase 1. The three probes are independent of each other.

- [x] T038 [P] [assigned_to: Implementer] [effort: 0.9] The push probe at home, in `bridge/src/connector/clients/push-listener/`:
  - a minimal Push Listener over the Ring boundary (`bridge/src/connector/access/ring-adapter/` stays the only import site of the Ring library);
  - it logs each push's shape with identifiers only: the kind, the device id, Ring's timestamp and the arrival time. No names, text or images;
  - a few real payloads, with their identifying values replaced, saved as fixtures under `bridge/test/fixtures/ring/` for T042;
  - the push library's "crypto-key is missing" log line: find its cause and whether a push is lost when it appears;
  - it runs on the owner's home connector for at least one doorbell press and one motion event. The home update needs the owner's OK.

  Finding: push arrives or not, its delay from Ring's timestamp, and the payload kinds seen (Trace: FR-008, FR-042; CP-08b)
- [x] T039 [P] [assigned_to: Implementer] [effort: 0.9] The MCP Events probe on the owner's ChatGPT plan:
  - read OpenAI's current draft for MCP Events: the subscription call, the webhook's signature, who issues the signing secret, the retry rules, and the callback hosts;
  - a stub subscription handler behind a configuration switch in `bridge/src/core/clients/mcp-endpoint/`, which accepts a test subscription and records its shape with identifiers only;
  - one test event sent by hand to the recorded callback, to see whether ChatGPT accepts it and whether the dot lights;
  - the production deploy for this probe needs the owner's explicit OK.

  Finding: whether the owner's plan offers MCP Events, the exact callback hosts for the allowlist, and the signature scheme. If the plan does not offer it, stop and bring the choice to the owner before T048 (Trace: FR-010, FR-012; CP-13)
- [ ] T040 [P] [assigned_to: Implementer] [effort: 1.8] Spike S1, time-boxed to its points: can a non-US Ring account register an official private app?
  - the owner does every Ring developer-portal step on their own account. No Ring credentials or codes pass through the chat;
  - the Implementer prepares the step list and records each answer the owner reports;
  - the result names which Ring path iteration 003 widens: the official API, or the current library.

  (Trace: TG-004; CP-20)

**Verification**: the three findings are in `research.md`; `npx vitest run bridge/src/connector/clients/push-listener`

**Checkpoint**: the unknowns are answered or named. A "no" from T039 goes to the owner before Phase 4.

---

## Phase 3: User Story 2, the event path end to end (Option B, step 2)

**Goal**: a Ring push at home becomes one durable event in the core, written once with its state change and its audit record, and acked home only after the commit.
**Independent test**:

1. A doorbell press on the simulated home appears in the core's Event Log exactly once, with a priority from the policy file.
2. Killing the core between the write and the ack, then restarting it, leaves exactly one event in the log and an empty backlog at home.
3. Dropping the link for a minute loses nothing: every event arrives, in order per location.

**Depends on**: Phase 2 (T038's payloads feed T042). Inside the phase: T041 first; then the home side (T042, T043, T044) and the core side (T045, T046) in turn; T047 last.

- [x] T041 [US2] [assigned_to: Implementer] [effort: 0.9] The event shape and the link's event messages:
  - the event shape agents see, in `bridge/src/contract/`, checked against `specs/001-ring-mcp-bridge/contracts/events.schema.json`, with Ring's text fields marked untrusted in the schema;
  - regenerated `schemas/`, with the snapshot check updated;
  - the link's `event` message (home to core) and `event_ack` message (core to home) in `bridge/src/connector/clients/core-link/messages/` and `bridge/src/core/clients/connector-link/messages/`, added to link version 1 without a version bump;
  - `specs/001-ring-mcp-bridge/contracts/connector-link.md` updated with both messages.

  Tests: a core that predates the messages ignores them without dropping the link; the schema snapshot changes only by additions (Trace: FR-008, FR-033, FR-046, FR-047; CP-08b)
- [x] T042 [P] [US2] [assigned_to: Implementer] [effort: 0.9] Normalize engine in `bridge/src/connector/engines/normalize/`. The failing test comes first:
  - Ring's push payload becomes the bridge's event: an event id that is stable for the same Ring event, the kind, the device id, the location id and Ring's timestamp;
  - Ring's text is carried as data and marked untrusted;
  - a malformed or unknown payload returns a typed failure. It never throws and never produces a partial event.

  Tests: every fixture from T038; the same Ring event twice gives the same event id; malformed input (Trace: FR-008, FR-033; CP-08b)
- [x] T043 [P] [US2] [assigned_to: Implementer] [effort: 0.9] Outbox Store, extended in `bridge/src/connector/access/outbox-store/`:
  - events are held until the core's ack for that event id;
  - a send window of about 50 unacked events;
  - backoff on the oldest unacked event: 10 seconds, doubling to 5 minutes, with jitter;
  - the backlog's size and the oldest event's age, for the heartbeat;
  - a migration in `outbox-migrations.ts`.

  Tests, on the fake clock: the window never exceeds its size; the backoff series; an ack clears exactly one event; the queue survives a restart (Trace: FR-042, SC-002; CP-08b)
- [x] T044 [US2] [assigned_to: Implementer] [effort: 1.35] The home side joined up:
  - Push Listener (`bridge/src/connector/clients/push-listener/`) hands each push to Ingest;
  - Ingest (`bridge/src/connector/managers/ingest/ingest.ts`) normalizes it, writes it to the Outbox, then sends it;
  - Core Link (`bridge/src/connector/clients/core-link/`) sends events up and takes acks in; Home Scheduler triggers the resends;
  - the heartbeat carries the backlog's size and the oldest event's age;
  - a malformed payload is logged by identifier and counted toward "push degraded" (a planning addition, pending the owner's decision in T037);
  - logs carry identifiers only.

  Tests: push to outbox to link on the scenario engine; a link drop and reconnect resends in order; no event text in any log line (Trace: FR-008, FR-034, FR-042; CP-08b)
- [x] T045 [P] [US2] [assigned_to: Implementer] [effort: 0.9] Classify engine in `bridge/src/core/engines/classify/`. The failing test comes first:
  - FR-009's priority table as a data file beside the engine, validated when the core starts. A bad file stops the start with a clear error;
  - the priority for an event comes from the table only. No priority is written in code;
  - the late-event rule: an event is late when it was recovered after a gap or held at home for more than 2 minutes.

  Tests: every row of the spec's table; an unknown kind gets the table's default; the 2-minute edge on the fake clock (Trace: FR-009, FR-013; CP-11b)
- [x] T046 [P] [US2] [assigned_to: Implementer] [effort: 1.35] Event Log and Audit resource access, in `bridge/src/core/access/event-log/` and `bridge/src/core/access/audit/`:
  - Event Log: events in order per location, a sequence that never skips, the epoch, and a unique key on the event id for dedup;
  - Audit: one record per event write, shaped so iteration 004's chain can be added without rewriting rows;
  - migrations in `bridge/src/utilities/query-layer/migrations/` for both dialects;
  - both take the caller's transaction. Neither opens its own.

  Tests, on SQLite and on the SQL Server container: the order per location; a duplicate event id is reported, not written twice; the sequence has no gap after a rolled-back write (Trace: FR-008, FR-011; CP-11b)
- [x] T047 [US2] [assigned_to: Implementer] [effort: 1.8] Event manager's event path in `bridge/src/core/managers/event/event-manager.ts`, with Connector Link (`bridge/src/core/clients/connector-link/`):
  - one transaction per event: Classify, then Event Log, State and Audit together;
  - the ack goes home only after the commit. A duplicate event id is acked without a second write;
  - no event waits for a snapshot, and no event carries a frame link in this iteration;
  - after the commit, the event is published for delivery. A delivery failure never rolls back the write;
  - logs carry identifiers only.

  Tests: the three independent tests above, including the kill between commit and ack; a failed State write rolls back the Event Log and the Audit; two locations in parallel keep their own order (Trace: FR-008, FR-014, FR-034, SC-002; CP-11b)

**Verification**: `tsc --noEmit`, `npx vitest run --coverage` (90% lines, 85% branches), `npx depcruise bridge shim --config .dependency-cruiser.cjs`, the schema snapshot check

**Checkpoint**: events flow from a push to the core's log, once each, in mode A and in the mode H integration tests.

---

## Phase 4: User Story 2, ChatGPT delivery and the dot (Option B, step 3)

**Goal**: a HIGH event reaches ChatGPT as an MCP Event within the 10-second budget, the dot lights, and an independent review reads the path at its midpoint.
**Independent test**: a doorbell press at the owner's home lights ChatGPT's dot. The core's log shows the time from Ring's trigger to ChatGPT accepting the webhook, per event.
**Depends on**: Phase 3 and T039's finding. T049 needs T048 deployed, with the owner's OK. T050 follows T049.

- [x] T048 [US2] [assigned_to: Implementer] [effort: 1.8] Delivery to ChatGPT, in `bridge/src/core/access/delivery/` and `bridge/src/core/clients/mcp-endpoint/`:
  - the subscription call as OpenAI's draft publishes it, for clients with the read scope only;
  - each subscription's callback address and signing secret stored in the database, encrypted, through `bridge/src/core/access/subscriptions/` (the store's cursor fields come in T051);
  - callbacks go out through the bounded fetch: only the hosts T039 found, HTTPS only, with a time limit and a size limit, and no redirects;
  - each webhook is signed as the draft requires; HIGH and MEDIUM are pushed at least once, and the event id lets the client drop repeats;
  - Ring's text in the payload is marked untrusted;
  - one client's failed delivery never blocks the others (a planning addition, pending the owner's decision in T037);
  - the time from Ring's trigger to the webhook's acceptance is logged per event, by identifier.

  Tests: against a stub receiver: the signature verifies; a callback outside the allowlist is refused; a slow receiver times out and is retried; a client without the read scope cannot subscribe (Trace: FR-010, FR-012, FR-030, FR-033, SC-001; CP-13)
- [ ] T049 [US2] [assigned_to: Owner, with the Implementer] [effort: 1.8] The dot and the first end-to-end latency samples:
  - deploy the core and update the home connector, each with the owner's explicit OK;
  - the owner connects ChatGPT to the new core and reads the home once (the agent read carried from iteration 001);
  - at least ten real events: the logged time from Ring's trigger to ChatGPT accepting the webhook, against SC-001's 10 seconds;
  - the owner's stopwatch samples of the dot, recorded beside the logged times;
  - the samples go in the pilot journal; the summary without home details goes in `specs/001-ring-mcp-bridge/iterations/002/state.md`.

  (Trace: FR-010, FR-012, SC-001; CP-21b)
- [ ] T050 [assigned_to: Reviewer] [effort: 1.8] Midpoint independent review, after the dot (iteration 001's Lesson 6): one co-review run through specrew-review over Phases 2 to 4, on the owner's "approved for review round". Findings go to T060 before Phase 5 builds on the path (Trace: FR-005, FR-008, FR-009, FR-010, FR-011, FR-012, FR-013, FR-014, FR-015, FR-026, FR-030, FR-033, FR-034, FR-042, FR-043, FR-046, FR-047, FR-048; CP-MR)

**Verification**: `npx vitest run bridge/src/core/access/delivery bridge/src/core/clients/mcp-endpoint`, the deploy workflow's smoke test, and the pilot journal entries

**Checkpoint**: the dot lights from a real doorbell press, and SC-001 has its first measured samples.

---

## Phase 5: User Story 2 and User Story 1, cursors, catch-up and health (Option B, step 4)

**Goal**: an agent reads every event after its cursor; events missed during a gap come back marked late with one summary; Ring going down is itself an event; `get_health` is complete.
**Independent test**:

1. An agent that reads with `get_events` from its cursor, across a core restart and a dropped link, sees every HIGH event exactly once.
2. After a simulated 3-hour gap, the missed events are stored late, none is pushed one by one, and one recovery summary is pushed.
3. Ring down for more than 2 minutes raises one HIGH health event, and its return raises one recovery event.

**Depends on**: Phase 3. T051 before T052. T053 before T054. T055 can run beside them.

- [ ] T051 [US2] [assigned_to: Implementer] [effort: 0.9] Subscriptions store's cursors in `bridge/src/core/access/subscriptions/`:
  - each client's cursor per location, with the epoch, and its last-read mark;
  - each client's delivery state (opt-ins come in iteration 003);
  - a cursor never skips an event and survives a restart; an epoch change is reported to the reader, never hidden;
  - a migration for both dialects.

  Tests: restart; two clients with separate cursors; an old-epoch cursor (Trace: FR-010, FR-011; CP-12)
- [ ] T052 [US2] [assigned_to: Implementer] [effort: 0.9] `get_events`, in `bridge/src/contract/`, `bridge/src/core/managers/inquiry/` and `bridge/src/core/clients/mcp-endpoint/`:
  - input: a cursor, filters by priority, kind and device, and a limit. The input schema is flat: enums and optional fields only;
  - output: events after the cursor, in order, and a next cursor; Ring's text is marked untrusted in the tool's description and schema;
  - the read scope is required, and each call counts against the read limit;
  - checked against `specs/001-ring-mcp-bridge/contracts/iteration-002-tools.schema.json`; `schemas/` regenerated; `specs/001-ring-mcp-bridge/contracts/mcp-tools.md` updated.

  Tests: the first independent test above; paging to the end; a filter that matches nothing; the 601st read in an hour is refused; a token without the read scope is refused (Trace: FR-011, FR-026, FR-030, FR-047, FR-048, SC-002; CP-12)
- [ ] T053 [US2] [assigned_to: Implementer] [effort: 1.35] Catch-up at home, in `bridge/src/connector/managers/ingest/` and `bridge/src/connector/access/outbox-store/`:
  - the catch-up mark: the last Ring event known to be in the Outbox;
  - after a push gap or a restart, Ring's history is read from the mark, up to 24 hours back, through the shared Ring limiter with backoff, never in a burst;
  - recovered events go through Normalize and the Outbox with the same event ids as their pushes would have had, marked late;
  - an event held at home for more than 2 minutes is marked late when it is sent;
  - the link reconnects within 60 seconds of a drop, with growing, randomised delays.

  Tests, on the fake clock: a 3-hour gap; a 30-hour gap recovers only 24 hours and says so; an event seen both by push and by catch-up is stored once; the limiter is never exceeded (Trace: FR-013, FR-026, FR-042; CP-08b)
- [ ] T054 [US2] [assigned_to: Implementer] [effort: 0.9] Late events and the recovery summary, in `bridge/src/core/managers/event/`:
  - a late event is stored with its late marker and its priority, and is never pushed by itself;
  - when a batch of late events ends, one recovery summary is pushed: the count, the time range, the sequence range and the highest priority among them;
  - `get_events` returns late events in their place in the order, with the marker.

  Tests: the second independent test above; a single late event still gives one summary; a HIGH late event shows in the summary's highest priority (Trace: FR-013; CP-11b)
- [ ] T055 [P] [US1] [assigned_to: Implementer] [effort: 1.35] Health completed, in `bridge/src/core/engines/health/`, `bridge/src/core/managers/inquiry/` and a new `bridge/src/core/clients/scheduler/`:
  - Ring down for more than 2 minutes raises one HIGH health event through the event path; its return raises one recovery event;
  - `get_health` adds push reception, the last event received and the home's backlog (size and the oldest's age);
  - the core's Scheduler: minute ticks for the home-offline check and the purge of events older than 30 days;
  - the CI latency check of 0.5 seconds is extended to the event path's write.

  Tests: the third independent test above; flapping under 2 minutes raises nothing; the purge keeps day 30 and removes day 31; `get_health`'s new fields on a stale home (Trace: FR-005, FR-008, FR-015, SC-005; CP-11b)

**Verification**: `tsc --noEmit`, `npx vitest run --coverage`, the schema snapshot check, `npx depcruise bridge shim --config .dependency-cruiser.cjs`

**Checkpoint**: US2's acceptance scenarios pass on the simulated home, and SC-002's kill-and-restart and dropped-link tests read every event from the cursor.

---

## Phase 6: The alert rule and the listen stream (Option B, step 5)

**Goal**: the owner hears out of band when the bridge cannot speak for itself, and clients on the earlier protocol version receive pushed events.
**Independent test**: stopping the home connector for 10 minutes sends one email and one SMS to the owner. A client on the earlier protocol version that opens the listen stream receives a HIGH event.
**Depends on**: Phase 5 (the backlog and the health fields). T056 and T057 are independent.

- [ ] T056 [P] [assigned_to: Implementer] [effort: 2.25] One Azure Monitor alert rule, by email and SMS, in `infra/modules/` and `infra/main.bicep`:
  - the conditions: no heartbeat for 10 minutes; the home offline over 10 minutes; the oldest unacked event waiting over about 5 minutes; the Ring session lost;
  - the core logs each condition as a structured signal the rule reads, by identifier only (`bridge/src/core/engines/health/`);
  - the owner's email and phone are parameters with placeholders. Real values are entered as GitHub Actions secrets at deploy time (quickstart.md) and are never committed;
  - SMS to an Israeli number: confirm it is delivered. If it is not, bring the choice to the owner;
  - the deploy needs the owner's explicit OK. Cost: about $1.50 a month plus cents per SMS (estimate from list prices).

  Tests: `az bicep build`; the infra tests in `bridge/test/infra/`; the independent test above, once, on the real deployment (Trace: FR-043, SC-010; CP-18)
- [ ] T057 [P] [US2] [assigned_to: Implementer] [effort: 0.9] The minimal listen stream for earlier-era clients, in `bridge/src/core/access/delivery/` and `bridge/src/core/clients/mcp-endpoint/`:
  - a client on the earlier protocol version receives HIGH and MEDIUM events as notifications on its open stream, at least once, with the event id for dedup;
  - the stream is a hint. The client's cursor and `get_events` stay the source of truth;
  - the channel shim for a desktop coding agent is not built (DRIFT-002-02).

  Tests: both protocol eras in `bridge/test/mcp-endpoint/`; a closed stream loses nothing that `get_events` cannot read (Trace: FR-010, FR-012; CP-13)

**Verification**: `az bicep build --file infra/main.bicep`, `npx vitest run bridge/test/infra bridge/test/mcp-endpoint`

---

## Phase 7: Review, Rework and the Carried Pilot Reads

**Goal**: the reviewed, signed-off iteration, with its evidence, the fixes its findings need, and the pilot's two carried results.
**Independent test**: the review-signoff evidence gate finds every reviewer artifact. `validate-governance.ps1` passes.
**Depends on**: T058 runs alongside Phases 3 to 6. T059 needs Phases 2 to 6. T060 follows the findings. T061 follows the calendar.

- [ ] T058 [assigned_to: Reviewer] [effort: 1.8] Run continuous co-review during implement, with the reviewer host (codex) through specrew-review: one run per finished group (the home event path, the core event path, delivery, cursors and catch-up, the alert rule), each on the owner's "approved for review round". After each round, tag its reviewed tree and push the tag (Trace: FR-005, FR-008, FR-009, FR-010, FR-011, FR-012, FR-013, FR-014, FR-015, FR-026, FR-030, FR-033, FR-034, FR-042, FR-043, FR-046, FR-047, FR-048; CP-RV)
- [ ] T059 [assigned_to: Reviewer] [effort: 0.9] Assemble the review-signoff evidence under `specs/001-ring-mcp-bridge/iterations/002/`:
  - the drift check (specrew-drift-check) into `drift-log.md`;
  - `quality/mechanical-findings.json` and `quality/quality-evidence.md`, with the three restored reviews (concurrency, resiliency, retry and idempotency);
  - the lens evidence under `quality/lenses/`;
  - the reviewer artifacts: `review.md`, `code-map.md`, `coverage-evidence.md`, `reviewer-index.md`, `review-diagrams.md` and `dependency-report.md`;
  - a walk through the iteration 002 rows of quickstart.md.

  (Trace: FR-005, FR-008, FR-009, FR-010, FR-011, FR-012, FR-013, FR-014, FR-015, FR-026, FR-030, FR-033, FR-034, FR-042, FR-043, FR-046, FR-047, FR-048, SC-001, SC-002, SC-005, SC-010; CP-RV)
- [ ] T060 [assigned_to: Implementer] [effort: 3.6] Rework reserve: fixes for the midpoint review's and the co-review's findings, each with its failing test first. Points left unused are reported at the retro, never spent on new scope (Trace: FR-005, FR-008, FR-009, FR-010, FR-011, FR-012, FR-013, FR-014, FR-015, FR-026, FR-030, FR-033, FR-034, FR-042, FR-043, FR-046, FR-047, FR-048; CP-RW)
- [ ] T061 [assigned_to: Implementer, with the owner] [effort: 0.9] The carried pilot reads:
  - about 2026-11-21: the 7-day soak's result and the clock check at its end, including the Ring session's re-establishment on 2026-11-16, against SC-003;
  - at month end: the month's bill against SC-011's $30 ceiling;
  - both results go in `specs/001-ring-mcp-bridge/iterations/002/state.md` without home or account details, and in the pilot journal with them.

  (Trace: FR-042, SC-003, SC-011; CP-PJ)

**Verification**: `pwsh -File .specify/extensions/specrew-speckit/scripts/validate-governance.ps1 -ProjectPath .`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1** (T037): after the tasks approval. It blocks all code.
- **Phase 2** (T038, T039, T040): after Phase 1 and the before-implement approval. The three run in parallel.
- **Phase 3** (T041 to T047): after T038.
- **Phase 4** (T048, T049, T050): after Phase 3 and T039.
- **Phase 5** (T051 to T055): after Phase 3. It starts after T050, so the midpoint review's findings come first.
- **Phase 6** (T056, T057): after Phase 5.
- **Phase 7**: T058 alongside; T059 and T060 at the end; T061 by the calendar.

### Inside Phase 3

```text
T041 -> T042 -> T044
T041 -> T043 -> T044
T041 -> T045 -> T047
T041 -> T046 -> T047
T044 + T047 -> the end-to-end tests
```

### Shared Files (why some tasks are serial)

- `bridge/src/core/clients/mcp-endpoint/`: T039, T048, T052 and T057, in that order.
- `bridge/src/core/managers/event/`: T047, then T054.
- `bridge/src/connector/managers/ingest/` and `bridge/src/connector/access/outbox-store/`: T043 and T044, then T053.
- `bridge/src/core/access/subscriptions/`: T048, then T051.
- `bridge/src/contract/` and `schemas/`: T041, then T052.

---

## Parallel Examples

```text
# Phase 2, after Phase 1:
T038 (push probe)   T039 (MCP Events probe)   T040 (Spike S1)

# Phase 3, after T041:
T042 (Normalize)   T043 (Outbox Store)   T045 (Classify)   T046 (Event Log, Audit)

# Phase 6:
T056 (alert rule)   T057 (listen stream)
```

One implementer does the work, so "parallel" here means the order is free, not that two agents write at once (plan.md, Concurrency Rationale).

---

## Implementation Strategy

### Risk First

1. Phase 1, then the three probes.
2. The event path, once, with its guarantees.
3. ChatGPT delivery and the dot. **Stop and review** (T050).

### Incremental Delivery

1. After Phase 3: events are durable in the core. Nothing is pushed yet.
2. After Phase 4: the dot lights. SC-001 has samples.
3. After Phase 5: `get_events`, catch-up and complete health. SC-002's tests pass.
4. After Phase 6: the alerts and the listen stream.

Every production deploy and every home connector update needs the owner's explicit OK.

---

## Traceability Check (both directions)

**Requirements to tasks**: every in-scope FR and SC has at least one implementing or measuring task. The review tasks (T037, T050, T058, T059, T060) cite every FR and are left out of this table.

| Requirement | Tasks |
| --- | --- |
| FR-005 | T055 |
| FR-008 | T038, T041, T042, T044, T046, T047, T055 |
| FR-009 | T045 |
| FR-010 | T039, T048, T049, T051, T057 |
| FR-011 | T046, T051, T052 |
| FR-012 | T039, T048, T049, T057 |
| FR-013 | T045, T053, T054 |
| FR-014 | T047 |
| FR-015 | T055 |
| FR-026 | T052, T053 |
| FR-030 | T048, T052 |
| FR-033 | T041, T042, T048 |
| FR-034 | T044, T047 |
| FR-042 | T038, T043, T044, T053, T061 |
| FR-043 | T056 |
| FR-046 | T041 |
| FR-047 | T041, T052 |
| FR-048 | T052 |
| SC-001 | T048, T049 |
| SC-002 | T043, T047, T052 |
| SC-003 | T061 |
| SC-005 | T055 |
| SC-010 | T056 |
| SC-011 | T061 |

**Tasks to requirements**: all 25 tasks cite at least one in-scope FR or SC, except T040, which cites TG-004 (the accepted unknown S1), as `iterations/002/plan.md` states for CP-20. No task cites a requirement outside iteration 002's scope.

**Result**: PASS.

**Partly delivered in iteration 002** (as `iterations/002/plan.md` states):

- FR-010: without per-client opt-ins (iteration 003).
- FR-012: without the local relay to a desktop coding agent (DRIFT-002-02).
- FR-014: no event carries a frame link until media arrives in iteration 003.
- FR-026: the read limit on `get_events` and the shared Ring limiter on catch-up.
- FR-030: only clients with the read scope subscribe.
- FR-043: without the audit-chain and write-once-copy conditions (iteration 004).

**The owner's additions beyond the spec's text** (DRIFT-002-04): the backlog in the heartbeat and `get_health` (T044, T055), the backlog alert and the Ring-session-lost alert (T056).

---

## Notes

- The plan's task table keeps the work items (CP-xx). This file breaks them into tasks, as in iteration 001.
- A task is done when its tests pass, its checks are green and its commit is pushed. Its work item is marked done in the task ledger when its last task finishes.
- Probes may change later tasks. A change of scope goes to the owner and into `iterations/002/drift-log.md`; it is never absorbed quietly.
- No Ring credentials or codes pass through the chat. The owner types them into the Setup CLI or Ring's own pages.
