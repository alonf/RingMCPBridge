# Drift Log: Iteration 003

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
**Resolution rate**: 2/3 closed. DRIFT-003-03 awaits the next governed state projection.
**Specification drift**: None detected. The iteration-scoped design record passed the pre-plan gate.

## Events

### DRIFT-003-01 — Camera handoff recorded at iteration scope

- **Observed** November 23 during iteration 003 design. The owner approved a single camera and service permission for photos and video and then typed “move on.” The [decision record](workshop/integration-api.md) preserves that agreement.
- **Evidence** The lens checkpoint requested a confirmed agenda. The agenda renderer then reported a missing `agenda_contract` property. Neither operation established an iteration 003 checkpoint.
- **Repair request, November 23.** With the owner's approval to prepare a proposal, the governed request on Specrew 0.40.0 stopped with a missing `schema_version` property. The feature-level agenda has selected topics and workshop records but no such property. Iteration 003 has a saved camera decision and no iteration-level agenda file. The command returned no proposal or authorization phrase.
- **Proposed recovery for review.** Reproduce the failure in an isolated copy with the same legacy record shape. Test a supported recovery that recognizes the old format and correctly targets iteration 003. Verify that all earlier decisions and the iteration 002 seal are preserved, the iteration 003 camera decision is retained, and only the intended workshop checkpoint would change. Present the generated proposal and its exact authorization phrase before applying anything to the project.
- **Resolution** The owner directed that the feature-level agenda remain untouched. The human decision, UI layout and iteration-scoped design record passed the pre-plan gate for Option B. The earlier recovery proposal is superseded.
- **Class closure**: The pre-plan gate validates the iteration design, recorded choice and gate packet. [Gate packet](../../gates/design-analysis-003.md)

### DRIFT-003-02 — Plan sync refused the execution summary after setting the phase

- **Observed** On November 23, Specrew 0.40.0 wrote `Current Phase` as `plan` during the plan sync for commit `a63b013`. Its own `iteration-state-truth-gate` then refused that phase together with the sentence “Execution has not started yet.” The refusal referred to task progress, resume and gate paths but named no specific repair for this planning state.
- **Human decision** The owner identified this as a Specrew defect and approved deleting only the following plain narrative line from the execution summary in [state.md](state.md).

  ```text
  - Execution has not started yet.
  ```

- **Class closure**: NONE — the approved edit corrects this occurrence only. A general fix belongs in Specrew.

### DRIFT-003-03 — Progress records lagged implementation

- **Observed** The pre-implementation planning snapshot still appears in the generated iteration state. The authoritative before-implement verdict is at `5023777`. The first media handoff checkpoint reviewed code through `c34b962`.
- **Reconciliation** The iteration plan records M02 and M04 as done and M01, M03 and M05 as in progress. [Task checkboxes](../../tasks.md) and [field evidence](quality/quality-evidence.md) identify the outstanding acceptance checks. The hardening record identifies the historical Claude review and owner verdict. Estimates are not used as actual effort.
- **Class closure**: Reconcile the generated state at the next authorized boundary sync and compare it with the task rows. The owner's instruction reserves that sync for the next crossing.

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
