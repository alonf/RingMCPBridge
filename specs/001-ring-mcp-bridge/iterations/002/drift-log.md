# Drift Log: Iteration 002

**Schema**: v2

<!--
  Markdown authoring note (Specrew lifecycle convention):

  When you add new drift events to this file, watch for MD032 (blanks-around-lists).
  A sentence ending with a colon, immediately followed by a bullet list, is the most
  common violation. Always put a BLANK LINE between the colon line and the list:

      BAD:                              GOOD:
      Resolution steps:                 Resolution steps:
      - Step one                        <— blank line here
      - Step two                        - Step one
                                        - Step two

  The F-033 pre-boundary markdownlint gate runs markdownlint-cli --fix on .md
  changes before every boundary-sync write, so most violations auto-fix — but the
  blank line you write in the first place avoids the cleanup churn.
-->

## Summary

**Total drift events**: 11
**Resolution rate**: 100% (11/11 resolved or decided)
**Specification drift**: One deferral, decided by the owner: FR-012's local relay for a desktop coding agent (DRIFT-002-02). Three additions beyond the spec's text, decided by the owner: the backlog in the heartbeat and `get_health`, the backlog alert, and the Ring-session-lost alert brought forward (DRIFT-002-04). DRIFT-002-01 carries iteration 001's closeout facts, which its sealed drift log cannot take. DRIFT-002-03 carries iteration 001's quality override into iteration 002's plan.

## Events

### DRIFT-002-11: FR-009's table leaves three cases open; the policy file takes one reading of each

- **Detected**: 2026-11-18, while writing the Classify engine's policy file (T045).
- **Kind**: the spec's table does not decide three cases. The policy is data, so each reading is one row in `bridge/src/core/engines/classify/priority-policy.json`.
- **Observed**:
  1. **Camera motion while armed.** FR-009 lists "motion while armed" as HIGH and "other camera motion" as not pushed. The file reads "motion while armed" as an alarm motion sensor. Camera and doorbell motion is MEDIUM with a person and LOW without, armed or not. The other reading would push every passing car while the alarm is armed.
  2. **A contact closing.** FR-009 says "a contact". The file gives a closing the same priority as an opening: HIGH while armed, MEDIUM while disarmed.
  3. **A location with no alarm.** It counts as not armed.
  - The recovery kinds (`health.home_online`, `health.ring_restored`) are HIGH, as `contracts/events.schema.json` proposes. `mode.changed` and `ring.other` get the default, LOW.
- **Requirement citation**: FR-009; `data-model.md` "Priority policy"; `contracts/events.schema.json` (`kind`, `priority`).
- **Resolution**: implementer-decision in policy data, reported to the owner at the next checkpoint for confirmation. Changing a reading is an edit to one row of the file and its test.
- **Carry-forward**: the kinds named in the file are the ones Normalize (T042) must produce; T042 and the file are checked against each other then.
- **Class closure**: NONE - open cases in a requirement's table, settled in data and shown to the owner.

### DRIFT-002-10: T041's wording against the link contract: the existing `ack`, and the device entry inside the event

- **Detected**: 2026-11-18, while building T041.
- **Kind**: the task's wording differs from the decided contract. The contract is followed.
- **Observed**:
  1. `tasks.md` T041 names a new `event_ack` message from core to home. `contracts/connector-link.md` had already decided that the existing `ack` answers an event, with the event's `event_id` as its `message_id` (PT-07). No new message is added; Core Link at home already reads `ack`.
  2. The contract lists `state_version` as a field of `EventMessage`, "together with the device's full current entry". The entry already carries its own `state_version`, so the message has one field, `device_state`, holding the entry. The contract's text now says so.
- **Requirement citation**: FR-008, FR-046; `contracts/connector-link.md` "Frames" and "EventMessage"; PT-07, PT-30.
- **Resolution**: implementer-decision, inside the decided contract, reported to the owner at the next checkpoint. `tasks.md` is left as approved; this entry is the record.
- **Carry-forward**: T044 and T047 use `ack` and `device_state` as described here.
- **Class closure**: NONE - a wording difference between two approved records, settled by the earlier design decision.

### DRIFT-002-09: Phase 3 tasks that do not read Ring's push payloads started before T038's home run

- **Detected**: 2026-11-18, after T038 part 1 and T039's handler.
- **Kind**: task order. `tasks.md` places Phase 3 after T038, because T038's recorded payloads feed T042.
- **Observed**:
  - T038 part 2 (the run at the owner's home) waits for the owner's decision on updating the home connector during the 7-day soak.
  - T041 (the event shape and the link's event message) reads no Ring payload. It was built while that decision is open.
  - T042 (Normalize) stays behind T038 part 2, as planned: its fixtures must be the real payloads.
- **Requirement citation**: `tasks.md` "Phase Dependencies" and "Inside Phase 3"; the owner's standing instruction to continue with approved work when nothing is pending.
- **Resolution**: implementer-decision, reported to the owner at the next checkpoint. It changes no scope and no design, and the owner can reverse it.
- **Carry-forward**: T043, T045 and T046 also read no Ring payload and may follow in the same way. T042, T044 and T047 keep their planned order.
- **Class closure**: NONE - an ordering choice inside one iteration.

### DRIFT-002-08: a second audit exception, for a new picomatch advisory in the development tools

- **Detected**: 2026-11-17, by CI's audit step on commit 85ef659, which changed documents only.
- **Kind**: a new upstream advisory, not a change in this project.
- **Observed**:
  - GHSA-fc5q-39xc-vjpf, high: picomatch is open to a slow-pattern denial of service. Every release up to 4.0.7, the newest, is affected, so no fixed version exists.
  - picomatch reaches this project only through development tools: dependency-cruiser, vite (through tinyglobby and fdir) and vitest. The production install (`npm ls picomatch --omit=dev`) has none of it.
  - The patterns it matches here are the repository's own configuration, not Ring's text or an agent's input.
- **Requirement citation**: `implementation-rules.yml`, `project.supply-chain-policy`: npm audit fails on high or critical over the whole tree, with a written exception list.
- **Resolution**: human-decision, decided by the owner's typed "yes" on 2026-11-17: the advisory is added to `scripts/audit-exceptions.json`, the list's second entry, until a fixed picomatch ships.
- **Carry-forward**: remove the entry when a fixed picomatch is released; Dependabot's weekly update will show it.
- **Class closure**: NONE - upstream advisories arrive when they arrive. The audit gate still blocks every other high or critical advisory.

### DRIFT-002-07: the hardening review needed two repairs outside the project before it could start

- **Detected**: 2026-11-17, at T037, the hardening review before implement.
- **Kind**: tooling on the owner's PC (Specrew 0.40.0 and the reviewer's launcher). The project's files were not changed for it.
- **Observed**:
  1. **The review engine's copy on the PC differed from the project's.** The review refused with `review-engine-version-mismatch` and asked for a project update. Read-only checks (names, dates and hashes) showed the project's copy unchanged since 2026-11-01 and one file of the installed copy changed on 2026-11-17. The update was not run, because it would have copied that change into the project. The owner fixed the installed copy, and the check then passed.
  2. **The reviewer could not be launched.** The run `run-20261117-181348428-cc789c45` failed before the reviewer was invoked, with `runtime-command-shim-unsupported:codex`: on this PC `codex` resolved only to npm's launcher scripts, and the review starts only a native executable. No round was used.
  3. **The fallback**, by the owner's typed "yes", on the reviewer session's advice: for the review process only, the folder of the native `codex.exe` inside npm's own installation of codex was put first on PATH. Nothing was installed and no file changed.
  4. With it, `run-20261117-185648219-777d6e8c` ran and passed with no findings.
- **Requirement citation**: T037 and iteration 002's hardening gate; this project's rule that fallbacks on PATH need the owner's yes per run.
- **Resolution**: human-decision, decided by the owner on 2026-11-17 (the fix on the PC, and the "yes" for the fallback). The hardening gate records the review.
- **Carry-forward**: each later review round in this session needs the same fallback and the owner's yes, unless the session is started where a native `codex` is on PATH. For Specrew's bug-bash list: the review refuses npm's launcher for codex on Windows.
- **Class closure**: NONE - the launch rule is Specrew's. This project's guard: check what `codex` resolves to before asking for a review round.

### DRIFT-002-06: the tasks sync refused because state.md's phase is ahead of the authority record

- **Detected**: 2026-11-17, at iteration 002's tasks sync.
- **Kind**: a state mismatch written by governed tooling (Specrew 0.40.0). Nothing was recorded.
- **Observed**:
  - After the owner's "approved for plan", the session was resumed once. Specrew's session-start writer then created `tasks-progress.yml` (eleven work items, all pending) and rewrote state.md's header, setting Current Phase to "before-implement" and Iteration Status to "not-started". Both files were committed unchanged (840dc81).
  - The tasks sync ran once with the lint fallback (DRIFT-001-91), naming iteration 002, by the owner's typed "yes". Its iteration-state gate refused: state.md says Current Phase "before-implement", but the last authorized boundary is "plan". It wrote no crossing and no pending-verdict file.
  - The refusal's own advice for a page that is ahead of the record: correct the line by hand and record why in the drift log.
  - Separately, iteration 002's plan.md still reads Status "planning" after the approval. The crew has not changed it.
- **Requirement citation**: the tasks boundary of iteration 002; this project's rule that the crew never hand-sets state.md's Specrew header without the owner's approval.
- **Resolution**: human-decision, pending. The proposed recovery, on the owner's yes: set state.md's Current Phase line to "plan", the last authorized boundary, as the refusal advises; commit it; run the tasks sync once more. If that run refuses, stop and report.
- **The owner's "yes"** (2026-11-17) approved the one hand edit and one more sync run. state.md's Current Phase line was set from "before-implement" to "plan", the last authorized boundary, as the refusal advises. No other line was changed.
- **The second run** (2026-11-17, at 21e6290) passed the phase check and was refused by the same gate on another line: state.md's Execution Summary still says "Execution has not started yet." beside a header that now carries Current Phase "plan" and Iteration Status "not-started". It wrote no crossing. The recovery step failed on its next attempt, so the crew stopped and reported; no third attempt was made. The state page that the plan sync accepted was the scaffolded one, before the session-start writer added its header lines (f6a8746).
- **The reviewer session's reading** (advice, 2026-11-17, from Specrew 0.40.0's source): with the writer's header lines present, no value passes at the tasks sync. One check accepts only the last approved boundary, "plan"; the next refuses "plan" beside "Execution has not started yet.". A page without the two lines passes, because both checks skip an absent line. It names this a Specrew defect.
- **The owner's "1"** (2026-11-17) chose the repair: state.md restored exactly as it was at f6a8746, the scaffolded form the plan sync accepted. This also undoes the hand-set phase line. `tasks-progress.yml` is unchanged. Then one sync run.
- **Rule for iteration 002**: until the before-implement approval is recorded, avoid session starts; before each sync, if a session start added the header lines again, restore the scaffolded page and note it here. After that approval the writer's header is accepted.
- **Closed**: 2026-11-17. The third run, on the restored page (14418a8), passed every gate and recorded the tasks crossing (2026-11-17T16:14:33Z). The owner then typed "approved for tasks". The "pending" in the Resolution line above is superseded by this line.
- **Carry-forward**: for Specrew's bug-bash list: the session-start writer sets a phase that the tasks sync's gate then refuses.
- **Class closure**: NONE - Specrew's code writes the line. This project's guard: no session is resumed or started between an approval and the next sync.

### DRIFT-002-05: the first plan sync checked iteration 001 and was refused

- **Detected**: 2026-11-17, at iteration 002's plan sync.
- **Kind**: operator error in the sync's arguments, under governed tooling (Specrew 0.40.0). Nothing was recorded.
- **Observed**:
  - The plan sync ran once with the lint fallback (DRIFT-001-91: npm's and Node's folders off PATH for that one process), by the owner's typed "yes". markdownlint was skipped as expected.
  - The run did not name the iteration, following the plan sync skill's command, which passes none. The sync then took the iteration from the session's lifecycle position, which still names iteration 001.
  - Its iteration-state gate refused: iteration 001's state.md (Current Phase iteration-closeout, Iteration Status complete) and plan.md (Status complete) did not match the boundary being synced, 'plan'.
  - It wrote no crossing and no pending-verdict file. The only change is the local lifecycle file's pending next boundary, now 'plan', which git does not track.
- **Requirement citation**: the plan boundary of iteration 002; DRIFT-001-91's fallback, used once per owner yes.
- **Resolution**: human-decision, pending. The one recovery step is to run the plan sync once more, naming iteration 002 (`-IterationNumber 002`, as the retro and closeout syncs did), on the owner's yes. Iteration 001 is sealed and correct, so the refusal's advice to correct its lines by hand does not apply: those files are not edited.
- **The second run** (the owner's second "yes", 2026-11-17, naming iteration 002) passed the iteration-state gate. Then its design-analysis gate refused, again writing no crossing and no pending-verdict file:
  - Each of the three options lacks the fields iteration 001's design analysis had: Approach, Architectural pattern, Quality features considered, Effort estimate, Reversibility cost, Trade-offs, and a Mermaid diagram.
  - The Applicable Lenses section lacks an "Addressed:" line for each of the eight selected areas, pointing into the option comparison.

  That is the crew's authoring gap: iteration 002's design analysis followed the options message instead of the template. The proposed recovery, on the owner's approval: add those fields and lines without changing the options, the choice or any decision, then run the sync once more.
- **Closed**: 2026-11-17. The owner's third "yes" covered the layout fill (commit 40286f7; the options, the choice of B, the effort figures and the trade-offs unchanged) and one more sync. That third run, naming iteration 002, passed every gate and recorded the plan crossing at 40286f7 (2026-11-17T10:54:15Z). The owner then typed "approved for plan". The "pending" in the Resolution line above is superseded by this line.
- **Carry-forward**: for Specrew's bug-bash list: the plan sync skill's command passes no iteration number, and on a later iteration the sync then checks the closed one.
- **Class closure**: NONE - Specrew's code picks the default. This project's guard: every sync here names its iteration.

### DRIFT-002-04: the owner's additions beyond the spec's text: the backlog, its alert, and the Ring-session-lost alert brought forward

- **Detected**: 2026-11-17, at iteration 002's plan stage, checking the plan against the spec.
- **Kind**: scope additions and a move between iterations, decided by the owner in the design analysis. The spec is unchanged.
- **Observed**:
  1. **The backlog in the heartbeat and in `get_health`.** FR-005's health fields are the home link, the Ring session, push reception, the last event and stale-since; the backlog is not among them. The owner took it with the ack and resend design ("2 ok", component-design): the heartbeat reports the backlog's size and the oldest's age, and `get_health` shows it (observability-resilience, "all as recommended").
  2. **An alert on the backlog.** FR-043's conditions are the heartbeat, the home offline, the Ring session lost, the audit chain and the write-once copy; the backlog is not among them. The owner took an alert when the oldest unacked event has waited more than about 5 minutes (component-design, "2 ok"; devops-operations, "Yes").
  3. **The Ring-session-lost alert in iteration 002.** FR-043 lists it, but the feature plan's map placed it in iteration 004. The owner moved it here (devops-operations, "yes"): it is the failure the 7-day soak watches for, and it shares the one rule.
- **Requirement citation**: FR-005 and FR-043 (the conditions they list); FR-042 (the resend that the backlog reports on); the feature plan's iteration map (FR-043 "in part" for iteration 002).
- **Resolution**: human-decision, decided by the owner on 2026-11-17 in the design analysis (records: `workshop/component-design.md`, `workshop/observability-resilience.md`, `workshop/devops-operations.md`). Items 1 and 2 add to what the spec requires and contradict none of it; item 3 moves a listed condition earlier. Iteration 002's plan carries all three (CP-08b, CP-11b, CP-18), and the feature plan's pointer line records the move. The review's drift check treats them as authorized, not as gold-plating.
- **Carry-forward**: whether the spec should name the backlog in FR-005 and FR-043 is a spec decision for a later spec change; the owner decides it then.
- **Class closure**: NONE - a one-off set of owner decisions at the design analysis, recorded so the review can trace them.

### DRIFT-002-03: the quality resolver again marks concurrency, resiliency and retry/idempotency as not applicable

- **Detected**: 2026-11-17, at iteration 002's plan stage, by `resolve-quality-profile.ps1` (the before-plan check).
- **Kind**: governed tooling output that contradicts the spec, as in iteration 001 (DRIFT-001-01). No code changed.
- **Observed**: the resolver's `not_applicable_dimensions` list concurrency-correctness ("no … realtime concurrency behavior"), resiliency ("does not materially depend on retries, reconnect, or degraded recovery") and retry-idempotency-and-recovery ("does not present a material retry or recovery workflow"). Its hardening focus area "Retry and idempotency expectations" is likewise `not-applicable`.
- **Requirement citation**: iteration 002 is the event path, so these dimensions are its core:
  - FR-010: at least once, deduplicated by event id;
  - FR-011: a cursor that never skips and survives restarts;
  - FR-013: late events and the recovery summary;
  - FR-042: resend after 10 seconds, reconnect, the 24-hour catch-up;
  - and the decided ack after the core's commit, with the send window and backoff (component-design, 2026-11-17).
- **Resolution**: overridden to required, as in iteration 001, where the owner accepted the same override with the design-analysis verdict (DRIFT-001-01). Iteration 002's plan states the override in its Notes. Its hardening gate (`quality/hardening-gate.md`) marks the three dimensions and the retry and idempotency focus area as required, and is filled for the event path before implementation starts. The owner reviews it at the plan boundary.
- **Carry-forward**: for Specrew's bug-bash list: the resolver reads no concurrency or retry signal from a spec that states at-least-once delivery, cursors, resends and catch-up.
- **Class closure**: NONE - the resolver is Specrew's code. This project's guard is the before-plan check plus this override, applied at each plan stage.

### DRIFT-002-02: the channel shim, FR-012's desktop relay, is deferred out of iteration 002

- **Detected**: 2026-11-17, iteration 002's design analysis, component-design.
- **Kind**: scope deferral, decided by the owner. The spec is unchanged.
- **Observed**:
  - The channel shim relays events to Claude Code on the owner's PC, through Claude Code's channels (a research preview).
  - The owner: "claude code is not the intended client". The intended clients are ChatGPT, with the dot, and the Claude apps.
  - Checked on 2026-11-17: ChatGPT takes pushed events through MCP Events (signed webhooks, the dot and Work mode). The Claude apps have no documented way to take a connector's pushed message; only Claude Code has channels.
- **Requirement citation**: FR-012: "The system MUST deliver push both to clients on the current MCP protocol version and to clients on the earlier version, including a local relay that brings events to a desktop coding agent."
- **Resolution**: deferred, by the owner's typed "2" (2026-11-17), the crew's recommendation.
  - The shim is not built in iteration 002. FR-012's other parts stay in scope: push to current-era and earlier-era clients.
  - The Claude apps read events with `get_events` from their cursor (FR-011).
  - If Anthropic adds push for Claude's connectors, Delivery gets one more adapter; each platform already has its own.
  - This frees about 1 of CP-13's 3 SP, about 2 SP of effort at 1.8 (estimate).
- **Carry-forward**: the shim, and FR-012's desktop-relay clause, to a later iteration's planning. Feature closeout cannot claim FR-012 in full until then.
- **Class closure**: NONE - a scope deferral, not a defect; its carry-forward keeps it visible until a later iteration takes it.

### DRIFT-002-01: iteration 001's closeout facts, carried here because its drift log is sealed

- **Detected**: 2026-11-17, at iteration 001's closeout and just after it.
- **Kind**: governed tooling behaviour (Specrew 0.40.0), recorded for continuity. No code changed.
- **Observed**:
  1. **The lint fallback at the closeout** (DRIFT-001-91). Two closeout syncs ran with npm's and Node's folders off PATH, under the owner's standing yes and then the owner's "go". The first refused at the iteration-state gate and wrote nothing; the second passed.
  2. **The closeout dashboard** (`iterations/001/dashboard.md`, now sealed):
     - Its plan-vs-reality row reads Planned 75.8 / Actual 75.8 / Delta 0. The dashboard takes plan.md's Capacity figure, which reads the summed actuals (75.75/42), as the plan.
     - Its velocity, 5.05 SP/day, is on the effort basis (75.75 SP over 15 days). Counting delivered scope, it is about 2.8 SP/day (42 SP over 15 days, estimate).
     - It also froze the "AWAITING YOUR VERDICT" banner it was captured under.
     - The real figures are in iteration 001's retro.md. The owner approved the closeout with this disposition.
  3. **The seal listed a file git did not track.** The closeout's seal lists iteration 001's `tasks-progress.yml`, which the project kept out of git. So Specrew CI failed on `460de86` from a clean checkout: "closed-iteration-edited: … was edited after its closeout seal: tasks-progress.yml". The file was unchanged: its content matched the sealed hash.
- **Evidence**: commits `460de86` (the closeout, with these facts in its message) and `c9618dd` (the ledger). CI is green on all three workflows at `c9618dd`.
- **Requirement citation**: FR-047 (the gates run in CI on every commit); iteration 001's closeout boundary.
- **Resolution**: human-decision, decided.
  - Items 1 and 2 are recorded as the owner approved them.
  - Item 3: by the owner's "yes", iteration 001's `tasks-progress.yml` is committed once (`c9618dd`), as an exception to the rule that kept it out of git.
- **Carry-forward**:
  - **The task ledger's trap is set again.** Iteration 002's forecast tasks are CP-numbered (CP-08b, CP-11b, CP-20, CP-21b). Specrew's writer takes "done" hints only from tasks.md rows with T-ids, so the same "not started" state would stop the closeout. The prevention is chosen at iteration 002's planning: task ids that match tasks.md, or the ledger kept current as each task finishes. Whether iteration 002's ledger is committed is part of that choice.
  - **For Specrew's bug-bash list:**
    - the seal includes untracked files;
    - the dashboard reads Capacity's first figure as the plan;
    - no on-demand command runs the task-progress writer;
    - the writer ignores plan.md's Status column.
- **Class closure**: NONE - the defects are in Specrew's code. The ledger trap's prevention for this iteration is a planning decision, recorded when it is made.

<!--
  Every new ### DRIFT-... event includes:

  - **Class closure**: the executable mechanism that makes the next instance impossible or loud

  If the change fixes only this instance, write NONE — <why class closure is not in scope>.
  A bare Resolution: FIXED is not class closure.
-->

### Resolution Strategies (Unused)

The following resolution strategies remain available if drift is detected later in execution:

- **spec-updated**: Update the spec to reflect implementation choice
- **implementation-reverted**: Revert implementation to match spec
- **deferred**: Mark drift as deferred to next iteration
- **human-decision**: Escalate to Alon for resolution

### Notes

- This artifact was scaffolded before review starts so drift can be logged immediately when detected.
- Replace the zero-drift summary with real counts when the first drift event is recorded.
