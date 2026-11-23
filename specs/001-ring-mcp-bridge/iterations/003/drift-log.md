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

**Total drift events**: 1
**Resolution rate**: 100% (1/1 resolved)
**Specification drift**: None detected. The iteration-scoped design record passed the pre-plan gate.

## Events

### DRIFT-003-01 — Camera handoff recorded at iteration scope

- **Observed** November 23 during iteration 003 design. The owner approved a single camera and service permission for photos and video and then typed “move on.” The [decision record](workshop/integration-api.md) preserves that agreement.
- **Evidence** The lens checkpoint requested a confirmed agenda. The agenda renderer then reported a missing `agenda_contract` property. Neither operation established an iteration 003 checkpoint.
- **Repair request, November 23.** With the owner's approval to prepare a proposal, the governed request on Specrew 0.40.0 stopped with a missing `schema_version` property. The feature-level agenda has selected topics and workshop records but no such property. Iteration 003 has a saved camera decision and no iteration-level agenda file. The command returned no proposal or authorization phrase.
- **Proposed recovery for review.** Reproduce the failure in an isolated copy with the same legacy record shape. Test a supported recovery that recognizes the old format and correctly targets iteration 003. Verify that all earlier decisions and the iteration 002 seal are preserved, the iteration 003 camera decision is retained, and only the intended workshop checkpoint would change. Present the generated proposal and its exact authorization phrase before applying anything to the project.
- **Resolution** The owner directed that the feature-level agenda remain untouched. The human decision, UI layout and iteration-scoped design record passed the pre-plan gate for Option B. The earlier recovery proposal is superseded.
- **Class closure** The pre-plan gate validates the iteration design, recorded choice and gate packet. [Gate packet](../../gates/design-analysis-003.md)

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
