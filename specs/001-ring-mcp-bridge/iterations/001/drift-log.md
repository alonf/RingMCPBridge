# Drift Log: Iteration 001

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
**Resolution rate**: 100% (3/3 resolved at plan, 2026-11-02)
**Specification drift**: None detected (one tooling-output drift, one record-to-record conflict and one owner re-slicing of the design analysis's first slice, all against the spec)

## Events

### DRIFT-001-01: the quality resolver's profile does not match the spec

- **Detected**: 2026-11-01, before-plan, by `resolve-quality-profile.ps1` (Specrew 0.40.0-beta41)
- **Kind**: governed tooling output contradicts the spec (no spec or code change)
- **Observed**: the resolver returned `quality-profile.custom-composition.v1` with the stack `mixed-or-unknown`, because no code exists yet. It marked `concurrency-correctness`, `resiliency` and `retry-idempotency-and-recovery` as not applicable, and the hardening focus area "Retry and idempotency expectations" as not applicable.
- **Requirement citation**: FR-024 (each command at most once, never retried, outcome unknown on timeout); FR-042 (reconnect within 60 s with backoff, resend after 10 s, catch-up); FR-010 and FR-011 (at-least-once push deduplicated by event id, cursors that never skip); FR-044 (single active instance, lease); FR-013 (late events and the recovery summary); `implementation-rules.yml` resolves the stack as `typescript-javascript`, and code-implementation I7 accepts synchronous SQLite calls on the event loop.
- **Resolution**: human-decision, accepted 2026-11-02 with the design-analysis verdict (Option B), and applied the same day: plan.md (Phase 1 Risk Dimensions, Required Quality Gates, Hardening Focus Areas) and `quality/hardening-gate.md` (`retry-idempotency-requirements` and `operational-resilience-concerns` flipped to `addressed`) carry it. The decision: plan.md's quality section and `quality/hardening-gate.md` override the three dimensions and the focus area as `required`, each with its FR rationale, and record the stack as TypeScript on Node. The resolver's other rows stand.
- **Class closure**: NONE — the resolver is Specrew-owned machinery outside this project; the per-feature override in plan.md and the hardening gate keeps this instance visible and reviewable.

### DRIFT-001-02: two workshop records name different error codes for a command caught by a home-link drop

- **Detected**: 2026-11-02, plan, during research consolidation (research.md, "Conflicts resolved at plan" 1)
- **Kind**: the workshop records disagree with each other. No spec or code change
- **Observed**:
  - component-design (CD2, X2) fails in-flight commands with `BRIDGE_UNAVAILABLE` when the link drops;
  - integration-api (D7) defines `HOME_OFFLINE` for "home link down (control and media)";
  - the observability amendment reserves `BRIDGE_UNAVAILABLE` for a core dependency being down.
- **Requirement citation**: spec Edge Cases ("in-flight commands fail with outcome unknown and are never retried; ... control and media report that the home is offline"); FR-024.
- **Resolution**: plan decision, 2026-11-02, for the owner to review at the plan boundary. `HOME_OFFLINE`, outcome unknown, never retried; the spec decides WHAT. contracts/errors.md and research.md carry it. Applies from iteration 003, when commands arrive.
- **Class closure**: NONE. This is a one-off conflict between closed workshop records; the contract tests in iteration 003 pin the code.

### DRIFT-001-03: the owner split the design analysis's first slice into two iterations

- **Detected**: 2026-11-02, plan, at the capacity check (58 SP planned against the configured 20)
- **Kind**: the plan's iteration slicing differs from the design-analysis record. No spec or code change
- **Observed**: the design analysis (Option B) puts US1 and US2 together in iteration 001 and numbers the later work as iterations 002 and 003. The owner chose capacity option 2 at the plan stage, so plan.md now has four iterations:
  - 001: US1 reads after Entra sign-in (42 SP);
  - 002: US2 events, the dot and the out-of-band alerts (16 SP, forecast);
  - 003: the old 002 (media, control, the rest of US1 and US2);
  - 004: the old 003 (full admin, disarm, the README, shared locations).
- **Requirement citation**: no requirement moved out of v1 or changed. FR-008 to FR-015, FR-042 (the 24-hour catch-up), FR-043 (part), SC-001, SC-002 and SC-010 move from iteration 001 to iteration 002.
- **Resolution**: human-decision. The owner chose option 2 on 2026-11-02. The planner placed the items and set the capacity, for the owner to review at the plan boundary: CP-17 (the minimal admin page) stays in iteration 001 because enrollment needs it, CP-08 is split because the home sends device state through the Outbox, CP-11 is split because the core's Event manager receives that state and the heartbeats, CP-21 is split so real clients sign in during iteration 001, and the capacity is set to 42 in `.specrew/iteration-config.yml`. plan.md, research.md, data-model.md, quickstart.md, contracts/ and `quality/hardening-gate.md` carry the new numbering. The design-analysis record and its gate packet keep the numbering the owner decided on, and this entry maps it.
- **Class closure**: NONE. This is a one-off owner decision at the plan boundary. Iteration 002 gets its own design analysis and plan stage, which re-check the forecast.<!--
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
- **human-decision**: Escalate to the owner for resolution

### Notes

- This artifact was scaffolded before review starts so drift can be logged immediately when detected.
- Replace the zero-drift summary with real counts when the first drift event is recorded.
