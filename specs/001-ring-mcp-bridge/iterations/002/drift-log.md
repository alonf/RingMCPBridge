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

**Total drift events**: 1
**Resolution rate**: 100% (1/1 resolved or decided)
**Specification drift**: None detected. DRIFT-002-01 carries iteration 001's closeout facts, which its sealed drift log cannot take.

## Events

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
