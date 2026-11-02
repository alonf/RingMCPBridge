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

**Total drift events**: 1
**Resolution rate**: 0% (0/1 resolved; DRIFT-001-01 is reconciled when plan.md and the hardening gate are written)
**Specification drift**: None detected (one tooling-output drift against the spec)

## Events

### DRIFT-001-01: the quality resolver's profile does not match the spec

- **Detected**: 2026-11-01, before-plan, by `resolve-quality-profile.ps1` (Specrew 0.40.0-beta41)
- **Kind**: governed tooling output contradicts the spec (no spec or code change)
- **Observed**: the resolver returned `quality-profile.custom-composition.v1` with the stack `mixed-or-unknown`, because no code exists yet. It marked `concurrency-correctness`, `resiliency` and `retry-idempotency-and-recovery` as not applicable, and the hardening focus area "Retry and idempotency expectations" as not applicable.
- **Requirement citation**: FR-024 (each command at most once, never retried, outcome unknown on timeout); FR-042 (reconnect within 60 s with backoff, resend after 10 s, catch-up); FR-010 and FR-011 (at-least-once push deduplicated by event id, cursors that never skip); FR-044 (single active instance, lease); FR-013 (late events and the recovery summary); `implementation-rules.yml` resolves the stack as `typescript-javascript`, and code-implementation I7 accepts synchronous SQLite calls on the event loop.
- **Resolution**: human-decision pending (reported to the owner at the design-analysis stop). Proposed: plan.md's quality section and `quality/hardening-gate.md` override the three dimensions and the focus area as `required`, each with its FR rationale, and record the stack as TypeScript on Node. The resolver's other rows stand.
- **Class closure**: NONE — the resolver is Specrew-owned machinery outside this project; the per-feature override in plan.md and the hardening gate keeps this instance visible and reviewable.

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
- **human-decision**: Escalate to the owner for resolution

### Notes

- This artifact was scaffolded before review starts so drift can be logged immediately when detected.
- Replace the zero-drift summary with real counts when the first drift event is recorded.