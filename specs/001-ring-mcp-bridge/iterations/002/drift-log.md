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

**Total drift events**: 3
**Resolution rate**: 100% (3/3 resolved or decided)
**Specification drift**: One deferral, decided by the owner: FR-012's local relay for a desktop coding agent (DRIFT-002-02). DRIFT-002-01 carries iteration 001's closeout facts, which its sealed drift log cannot take. DRIFT-002-03 carries iteration 001's quality override into iteration 002's plan.

## Events

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
