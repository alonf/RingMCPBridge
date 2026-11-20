# Code Map: Iteration 002

**Schema**: v1
**Reviewed**:
**Baseline Ref**: c9618ddc79cb7f5e3d94dffe1ae4c2bc3d16ea7c
**Test-to-Code Ratio**: 56:96

> **⚠️ Review Evidence Warning** _(Form-vs-Meaning Gap Detected)_
>
> This iteration's task tracking declares **6 completed task(s)**, but the git diff against baseline `c9618ddc79cb7f5e3d94dffe1ae4c2bc3d16ea7c` contains **281 file(s)**.
>
> **Severity**: WARNING
> **Implication**: Review evidence may be incomplete or misleading.
>
> **Possible causes**:
>
> - Implementation work was not committed before scaffolding review artifacts
> - Task status markers in plan.md or review.md do not match actual progress
> - Baseline reference in state.md is stale or incorrect
>
> **Remediation**:
>
> 1. Verify implementation is committed: `git diff c9618ddc79cb7f5e3d94dffe1ae4c2bc3d16ea7c...HEAD --stat`
> 2. If uncommitted work exists: `git add . && git commit -m "Implementation complete"`
> 3. Re-run scaffolder with `-Force` flag to regenerate review artifacts after commit
> 4. Re-run `validate-governance.ps1` to clear pre-review commit gate error
>
> _See Proposal 073 (Review Evidence Integrity) for background on this validation._

---

## Files Touched

| Path | Lines Added | Lines Removed | Owning Task ID(s) | Owning Role |
| ---- | ----------- | ------------- | ----------------- | ----------- |
| .github/workflows/deploy.yml | 5 | 1 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| .specrew/handoff-evidence.json | 21 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| .specrew/review/authority/campaigns/cmp-001-ring-mcp-bridge-i002/claims/lin-001-ring-mcp-bridge/00000001-abandoned.json | 1 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| .specrew/review/authority/campaigns/cmp-001-ring-mcp-bridge-i002/claims/lin-001-ring-mcp-bridge/00000001-held.json | 1 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| .specrew/review/authority/campaigns/cmp-001-ring-mcp-bridge-i002/claims/lin-001-ring-mcp-bridge/00000002-held.json | 1 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| .specrew/review/authority/campaigns/cmp-001-ring-mcp-bridge-i002/claims/lin-001-ring-mcp-bridge/00000002-released.json | 1 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| .specrew/review/authority/campaigns/cmp-001-ring-mcp-bridge-i002/claims/lin-001-ring-mcp-bridge/00000003-abandoned.json | 1 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| .specrew/review/authority/campaigns/cmp-001-ring-mcp-bridge-i002/claims/lin-001-ring-mcp-bridge/00000003-held.json | 1 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| .specrew/review/authority/campaigns/cmp-001-ring-mcp-bridge-i002/claims/lin-001-ring-mcp-bridge/00000004-held.json | 1 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| .specrew/review/authority/campaigns/cmp-001-ring-mcp-bridge-i002/claims/lin-001-ring-mcp-bridge/00000004-released.json | 1 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| .specrew/review/authority/campaigns/cmp-001-ring-mcp-bridge-i002/claims/lin-001-ring-mcp-bridge/00000005-abandoned.json | 1 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| .specrew/review/authority/campaigns/cmp-001-ring-mcp-bridge-i002/claims/lin-001-ring-mcp-bridge/00000005-held.json | 1 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| .specrew/review/authority/campaigns/cmp-001-ring-mcp-bridge-i002/claims/lin-001-ring-mcp-bridge/00000006-held.json | 1 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| .specrew/review/authority/campaigns/cmp-001-ring-mcp-bridge-i002/claims/lin-001-ring-mcp-bridge/00000006-released.json | 1 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| .specrew/review/authority/campaigns/cmp-001-ring-mcp-bridge-i002/dispositions/run-20261118-162053445-009f3258/disposition-230ba7fcedef11d9a6d9.json | 1 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| .specrew/review/authority/campaigns/cmp-001-ring-mcp-bridge-i002/grants/grant-0d2e1cbb4f73910b61c7.json | 1 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| .specrew/review/authority/campaigns/cmp-001-ring-mcp-bridge-i002/grants/grant-a6254a1d57e3499b8ba4.json | 1 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| .specrew/review/authority/campaigns/cmp-001-ring-mcp-bridge-i002/grants/grant-ba0c907563027e9dd770.json | 1 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| .specrew/review/authority/campaigns/cmp-001-ring-mcp-bridge-i002/releases/res-37adb497cbc32921ad9f.json | 1 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| .specrew/review/authority/campaigns/cmp-001-ring-mcp-bridge-i002/releases/res-4793b3642c439b864ae3.json | 1 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| .specrew/review/authority/campaigns/cmp-001-ring-mcp-bridge-i002/releases/res-77b577d442bb992e5bd2.json | 1 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| .specrew/review/authority/campaigns/cmp-001-ring-mcp-bridge-i002/reservations/grant-0d2e1cbb4f73910b61c7/slot-001/generation-001.json | 1 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| .specrew/review/authority/campaigns/cmp-001-ring-mcp-bridge-i002/reservations/grant-0d2e1cbb4f73910b61c7/slot-001/generation-002.json | 1 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| .specrew/review/authority/campaigns/cmp-001-ring-mcp-bridge-i002/reservations/grant-a6254a1d57e3499b8ba4/slot-001/generation-001.json | 1 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| .specrew/review/authority/campaigns/cmp-001-ring-mcp-bridge-i002/reservations/grant-a6254a1d57e3499b8ba4/slot-001/generation-002.json | 1 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| .specrew/review/authority/campaigns/cmp-001-ring-mcp-bridge-i002/reservations/grant-ba0c907563027e9dd770/slot-001/generation-001.json | 1 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| .specrew/review/authority/campaigns/cmp-001-ring-mcp-bridge-i002/reservations/grant-ba0c907563027e9dd770/slot-001/generation-002.json | 1 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| .specrew/review/authority/campaigns/cmp-001-ring-mcp-bridge-i002/runs/run-20261117-181348428-cc789c45/claimed.json | 1 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| .specrew/review/authority/campaigns/cmp-001-ring-mcp-bridge-i002/runs/run-20261117-181348428-cc789c45/preflighted.json | 1 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| .specrew/review/authority/campaigns/cmp-001-ring-mcp-bridge-i002/runs/run-20261117-181348428-cc789c45/report.md | 23 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| .specrew/review/authority/campaigns/cmp-001-ring-mcp-bridge-i002/runs/run-20261117-181348428-cc789c45/requested.json | 1 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| .specrew/review/authority/campaigns/cmp-001-ring-mcp-bridge-i002/runs/run-20261117-181348428-cc789c45/reserved.json | 1 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| .specrew/review/authority/campaigns/cmp-001-ring-mcp-bridge-i002/runs/run-20261117-181348428-cc789c45/result.json | 1 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| .specrew/review/authority/campaigns/cmp-001-ring-mcp-bridge-i002/runs/run-20261117-185648219-777d6e8c/claimed.json | 1 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| .specrew/review/authority/campaigns/cmp-001-ring-mcp-bridge-i002/runs/run-20261117-185648219-777d6e8c/invoked.json | 1 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| .specrew/review/authority/campaigns/cmp-001-ring-mcp-bridge-i002/runs/run-20261117-185648219-777d6e8c/pause-decision.json | 1 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| .specrew/review/authority/campaigns/cmp-001-ring-mcp-bridge-i002/runs/run-20261117-185648219-777d6e8c/pending-pause.json | 1 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| .specrew/review/authority/campaigns/cmp-001-ring-mcp-bridge-i002/runs/run-20261117-185648219-777d6e8c/preflighted.json | 1 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| .specrew/review/authority/campaigns/cmp-001-ring-mcp-bridge-i002/runs/run-20261117-185648219-777d6e8c/recovery.json | 1 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| .specrew/review/authority/campaigns/cmp-001-ring-mcp-bridge-i002/runs/run-20261117-185648219-777d6e8c/report.md | 21 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| .specrew/review/authority/campaigns/cmp-001-ring-mcp-bridge-i002/runs/run-20261117-185648219-777d6e8c/requested.json | 1 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| .specrew/review/authority/campaigns/cmp-001-ring-mcp-bridge-i002/runs/run-20261117-185648219-777d6e8c/reserved.json | 1 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| .specrew/review/authority/campaigns/cmp-001-ring-mcp-bridge-i002/runs/run-20261117-185648219-777d6e8c/result.json | 1 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| .specrew/review/authority/campaigns/cmp-001-ring-mcp-bridge-i002/runs/run-20261118-152234676-01569001/requested.json | 1 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| .specrew/review/authority/campaigns/cmp-001-ring-mcp-bridge-i002/runs/run-20261118-152402348-e76399ba/claimed.json | 1 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| .specrew/review/authority/campaigns/cmp-001-ring-mcp-bridge-i002/runs/run-20261118-152402348-e76399ba/preflighted.json | 1 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| .specrew/review/authority/campaigns/cmp-001-ring-mcp-bridge-i002/runs/run-20261118-152402348-e76399ba/report.md | 23 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| .specrew/review/authority/campaigns/cmp-001-ring-mcp-bridge-i002/runs/run-20261118-152402348-e76399ba/requested.json | 1 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| .specrew/review/authority/campaigns/cmp-001-ring-mcp-bridge-i002/runs/run-20261118-152402348-e76399ba/reserved.json | 1 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| .specrew/review/authority/campaigns/cmp-001-ring-mcp-bridge-i002/runs/run-20261118-152402348-e76399ba/result.json | 1 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| .specrew/review/authority/campaigns/cmp-001-ring-mcp-bridge-i002/runs/run-20261118-162053445-009f3258/claimed.json | 1 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| .specrew/review/authority/campaigns/cmp-001-ring-mcp-bridge-i002/runs/run-20261118-162053445-009f3258/invoked.json | 1 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| .specrew/review/authority/campaigns/cmp-001-ring-mcp-bridge-i002/runs/run-20261118-162053445-009f3258/pause-decision.json | 1 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| .specrew/review/authority/campaigns/cmp-001-ring-mcp-bridge-i002/runs/run-20261118-162053445-009f3258/pending-pause.json | 1 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| .specrew/review/authority/campaigns/cmp-001-ring-mcp-bridge-i002/runs/run-20261118-162053445-009f3258/preflighted.json | 1 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| .specrew/review/authority/campaigns/cmp-001-ring-mcp-bridge-i002/runs/run-20261118-162053445-009f3258/recovery.json | 1 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| .specrew/review/authority/campaigns/cmp-001-ring-mcp-bridge-i002/runs/run-20261118-162053445-009f3258/report.md | 26 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| .specrew/review/authority/campaigns/cmp-001-ring-mcp-bridge-i002/runs/run-20261118-162053445-009f3258/requested.json | 1 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| .specrew/review/authority/campaigns/cmp-001-ring-mcp-bridge-i002/runs/run-20261118-162053445-009f3258/reserved.json | 1 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| .specrew/review/authority/campaigns/cmp-001-ring-mcp-bridge-i002/runs/run-20261118-162053445-009f3258/result.json | 1 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| .specrew/review/authority/campaigns/cmp-001-ring-mcp-bridge-i002/runs/run-20261119-171935615-aa83ec71/claimed.json | 1 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| .specrew/review/authority/campaigns/cmp-001-ring-mcp-bridge-i002/runs/run-20261119-171935615-aa83ec71/preflighted.json | 1 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| .specrew/review/authority/campaigns/cmp-001-ring-mcp-bridge-i002/runs/run-20261119-171935615-aa83ec71/report.md | 23 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| .specrew/review/authority/campaigns/cmp-001-ring-mcp-bridge-i002/runs/run-20261119-171935615-aa83ec71/requested.json | 1 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| .specrew/review/authority/campaigns/cmp-001-ring-mcp-bridge-i002/runs/run-20261119-171935615-aa83ec71/reserved.json | 1 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| .specrew/review/authority/campaigns/cmp-001-ring-mcp-bridge-i002/runs/run-20261119-171935615-aa83ec71/result.json | 1 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| .specrew/review/authority/campaigns/cmp-001-ring-mcp-bridge-i002/runs/run-20261119-173047606-1ebf52a1/claimed.json | 1 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| .specrew/review/authority/campaigns/cmp-001-ring-mcp-bridge-i002/runs/run-20261119-173047606-1ebf52a1/invoked.json | 1 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| .specrew/review/authority/campaigns/cmp-001-ring-mcp-bridge-i002/runs/run-20261119-173047606-1ebf52a1/pending-pause.json | 1 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| .specrew/review/authority/campaigns/cmp-001-ring-mcp-bridge-i002/runs/run-20261119-173047606-1ebf52a1/preflighted.json | 1 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| .specrew/review/authority/campaigns/cmp-001-ring-mcp-bridge-i002/runs/run-20261119-173047606-1ebf52a1/recovery.json | 1 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| .specrew/review/authority/campaigns/cmp-001-ring-mcp-bridge-i002/runs/run-20261119-173047606-1ebf52a1/report.md | 36 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| .specrew/review/authority/campaigns/cmp-001-ring-mcp-bridge-i002/runs/run-20261119-173047606-1ebf52a1/requested.json | 1 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| .specrew/review/authority/campaigns/cmp-001-ring-mcp-bridge-i002/runs/run-20261119-173047606-1ebf52a1/reserved.json | 1 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| .specrew/review/authority/campaigns/cmp-001-ring-mcp-bridge-i002/runs/run-20261119-173047606-1ebf52a1/result.json | 1 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| .specrew/review/authority/campaigns/cmp-001-ring-mcp-bridge-i002/spend/res-6be456a13c4d877129b5.json | 1 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| .specrew/review/authority/campaigns/cmp-001-ring-mcp-bridge-i002/spend/res-9da8cd557b0bfff3fec8.json | 1 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| .specrew/review/authority/campaigns/cmp-001-ring-mcp-bridge-i002/spend/res-c73bd7213805c4899be8.json | 1 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| .specrew/reviewer-hosts.json | 2 | 2 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| .specrew/role-assignments.yml | 1 | 1 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| .squad/decisions.md | 45 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| .squad/events/lifecycle-events.jsonl | 3 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| .squad/identity/now.md | 5 | 5 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| README.md | 59 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/dev/ring-pilot/app.ts | 553 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/dev/ring-pilot/client.ts | 136 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/dev/ring-pilot/links.ts | 133 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/dev/ring-pilot/main.ts | 75 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/dev/ring-pilot/snapshot.ts | 150 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/connector/access/outbox-store/index.ts | 6 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/connector/access/outbox-store/outbox-events.test.ts | 367 | 0 | CP-MR, CP-RV | Reviewer |
| bridge/src/connector/access/outbox-store/outbox-migrations.ts | 46 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/connector/access/outbox-store/outbox-store.ts | 308 | 15 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/connector/access/ring-adapter/index.ts | 6 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/connector/access/ring-adapter/ring-api-adapter.test.ts | 259 | 1 | CP-MR, CP-RV | Reviewer |
| bridge/src/connector/access/ring-adapter/ring-api-adapter.ts | 167 | 1 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/connector/access/ring-adapter/ring-client.ts | 34 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/connector/access/ring-adapter/ring-mapping.ts | 74 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/connector/access/ring-adapter/ring-port.ts | 86 | 3 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/connector/clients/core-link/core-link.test.ts | 1 | 0 | CP-MR, CP-RV | Reviewer |
| bridge/src/connector/clients/home-scheduler/home-scheduler.test.ts | 19 | 2 | CP-MR, CP-RV | Reviewer |
| bridge/src/connector/clients/home-scheduler/home-scheduler.ts | 8 | 1 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/connector/clients/home-scheduler/index.ts | 1 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/connector/clients/push-listener/index.ts | 13 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/connector/clients/push-listener/push-listener.test.ts | 176 | 0 | CP-MR, CP-RV | Reviewer |
| bridge/src/connector/clients/push-listener/push-listener.ts | 125 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/connector/clients/push-listener/push-shape.test.ts | 73 | 0 | CP-MR, CP-RV | Reviewer |
| bridge/src/connector/clients/push-listener/push-shape.ts | 67 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/connector/clients/push-listener/push-sighting.test.ts | 80 | 0 | CP-MR, CP-RV | Reviewer |
| bridge/src/connector/clients/push-listener/push-sighting.ts | 98 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/connector/engines/normalize/history-events.test.ts | 82 | 0 | CP-MR, CP-RV | Reviewer |
| bridge/src/connector/engines/normalize/history-events.ts | 80 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/connector/engines/normalize/hub-events.test.ts | 250 | 0 | CP-MR, CP-RV | Reviewer |
| bridge/src/connector/engines/normalize/hub-events.ts | 219 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/connector/engines/normalize/index.ts | 22 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/connector/engines/normalize/normalize.test.ts | 285 | 0 | CP-MR, CP-RV | Reviewer |
| bridge/src/connector/engines/normalize/normalize.ts | 262 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/connector/managers/ingest/home-view.ts | 35 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/connector/managers/ingest/index.ts | 5 | 1 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/connector/managers/ingest/ingest.test.ts | 600 | 0 | CP-MR, CP-RV | Reviewer |
| bridge/src/connector/managers/ingest/ingest.ts | 409 | 16 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/contract/event.ts | 125 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/contract/events-tool.ts | 93 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/contract/index.ts | 20 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/contract/inquiry-tools.test.ts | 2 | 1 | CP-MR, CP-RV | Reviewer |
| bridge/src/contract/inquiry-tools.ts | 22 | 15 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/contract/json-schema.ts | 10 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/contract/tool-contract.ts | 18 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/core/access/audit/audit.ts | 191 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/core/access/audit/index.ts | 17 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/core/access/event-log/event-log.ts | 408 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/core/access/event-log/index.ts | 18 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/core/access/secrets/core-secrets.ts | 7 | 3 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/core/access/state/state-store.ts | 133 | 3 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/core/access/subscriptions/cursor-store.ts | 118 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/core/access/subscriptions/delivery-key.ts | 71 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/core/access/subscriptions/index.ts | 31 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/core/access/subscriptions/subscriptions-store.ts | 306 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/core/clients/connector-link/connector-link.test.ts | 138 | 0 | CP-MR, CP-RV | Reviewer |
| bridge/src/core/clients/connector-link/core-session.ts | 50 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/core/clients/connector-link/intake-mapping.ts | 39 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/core/clients/connector-link/messages/home-messages.test.ts | 64 | 0 | CP-MR, CP-RV | Reviewer |
| bridge/src/core/clients/connector-link/messages/home-messages.ts | 74 | 12 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/core/clients/connector-link/messages/index.ts | 2 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/core/clients/delivery/callback-transport.test.ts | 210 | 0 | CP-MR, CP-RV | Reviewer |
| bridge/src/core/clients/delivery/callback-transport.ts | 230 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/core/clients/delivery/delivery.test.ts | 672 | 0 | CP-MR, CP-RV | Reviewer |
| bridge/src/core/clients/delivery/delivery.ts | 653 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/core/clients/delivery/index.ts | 42 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/core/clients/delivery/webhook-signature.ts | 44 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/core/clients/issuer/issuer.ts | 14 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/core/clients/mcp-endpoint/events-handler.ts | 140 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/core/clients/mcp-endpoint/index.ts | 4 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/core/clients/mcp-endpoint/listen-stream.test.ts | 51 | 0 | CP-MR, CP-RV | Reviewer |
| bridge/src/core/clients/mcp-endpoint/listen-stream.ts | 169 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/core/clients/mcp-endpoint/mcp-endpoint.ts | 88 | 1 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/core/clients/mcp-endpoint/read-tools.ts | 19 | 3 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/core/clients/scheduler/index.ts | 27 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/core/engines/classify/classify-engine.test.ts | 297 | 0 | CP-MR, CP-RV | Reviewer |
| bridge/src/core/engines/classify/classify-engine.ts | 232 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/core/engines/classify/index.ts | 29 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/core/engines/classify/priority-policy.json | 53 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/core/engines/health/health-engine.test.ts | 27 | 0 | CP-MR, CP-RV | Reviewer |
| bridge/src/core/engines/health/health-engine.ts | 42 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/core/engines/health/index.ts | 1 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/core/engines/summary/summary-engine.ts | 14 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/core/managers/event/event-intake.ts | 86 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/core/managers/event/event-manager.test.ts | 55 | 1 | CP-MR, CP-RV | Reviewer |
| bridge/src/core/managers/event/event-manager.ts | 326 | 3 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/core/managers/event/event-path.test.ts | 770 | 0 | CP-MR, CP-RV | Reviewer |
| bridge/src/core/managers/event/event-writer.ts | 218 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/core/managers/event/index.ts | 15 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/core/managers/inquiry/events-read.test.ts | 418 | 0 | CP-MR, CP-RV | Reviewer |
| bridge/src/core/managers/inquiry/events-read.ts | 324 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/core/managers/inquiry/index.ts | 2 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/core/managers/inquiry/inquiry-manager.test.ts | 46 | 5 | CP-MR, CP-RV | Reviewer |
| bridge/src/core/managers/inquiry/inquiry-manager.ts | 120 | 17 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/host/all-in-one.ts | 12 | 2 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/host/connector.ts | 16 | 1 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/host/core-assembly.ts | 36 | 1 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/host/core-service.ts | 83 | 2 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/host/first-signing-key.ts | 15 | 3 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/host/home-assembly.ts | 43 | 3 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/host/leased-links.ts | 18 | 1 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/host/main.ts | 6 | 1 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/host/priority-policy.ts | 27 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/host/push-shapes-file.ts | 38 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/host/ring-home.live.ts | 5 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/utilities/config/event-rules.ts | 121 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/utilities/config/index.ts | 3 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/utilities/config/mode-settings.ts | 26 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/utilities/config/settings.test.ts | 75 | 1 | CP-MR, CP-RV | Reviewer |
| bridge/src/utilities/config/settings.ts | 5 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/utilities/logging/log-fields.ts | 16 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/utilities/logging/logger.test.ts | 18 | 0 | CP-MR, CP-RV | Reviewer |
| bridge/src/utilities/logging/logger.ts | 7 | 1 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/utilities/query-layer/migrations/0007-event-log-and-audit.ts | 113 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/utilities/query-layer/migrations/0008-webhook-subscriptions.ts | 46 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/utilities/query-layer/migrations/0009-event-cursors.ts | 39 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/utilities/query-layer/migrations/0010-recovery-health.ts | 26 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/utilities/query-layer/migrations/core-migrations.ts | 8 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/src/utilities/security/sealing.ts | 5 | 3 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| bridge/test/contract/event-shape.test.ts | 156 | 0 | CP-MR, CP-RV | Reviewer |
| bridge/test/contract/public-contract.test.ts | 4 | 0 | CP-MR, CP-RV | Reviewer |
| bridge/test/core-access/cursor-store.test.ts | 105 | 0 | CP-MR, CP-RV | Reviewer |
| bridge/test/core-access/event-log-and-audit.test.ts | 308 | 0 | CP-MR, CP-RV | Reviewer |
| bridge/test/core-access/subscriptions-store.test.ts | 200 | 0 | CP-MR, CP-RV | Reviewer |
| bridge/test/fixtures/ring/push-ding-v2.synthetic.json | 51 | 0 | CP-MR, CP-RV | Reviewer |
| bridge/test/fixtures/ring/push-motion-human.synthetic.json | 56 | 0 | CP-MR, CP-RV | Reviewer |
| bridge/test/host/assembly.test.ts | 30 | 0 | CP-MR, CP-RV | Reviewer |
| bridge/test/host/core-service.test.ts | 2 | 0 | CP-MR, CP-RV | Reviewer |
| bridge/test/host/event-path.test.ts | 315 | 0 | CP-MR, CP-RV | Reviewer |
| bridge/test/host/first-signing-key.test.ts | 15 | 4 | CP-MR, CP-RV | Reviewer |
| bridge/test/host/priority-policy.test.ts | 52 | 0 | CP-MR, CP-RV | Reviewer |
| bridge/test/host/push-shapes-file.test.ts | 80 | 0 | CP-MR, CP-RV | Reviewer |
| bridge/test/infra/core-deployment.test.ts | 22 | 0 | CP-MR, CP-RV | Reviewer |
| bridge/test/infra/deploy-workflow.test.ts | 9 | 2 | CP-MR, CP-RV | Reviewer |
| bridge/test/infra/home-vm.test.ts | 8 | 0 | CP-MR, CP-RV | Reviewer |
| bridge/test/issuer/issuer.test.ts | 47 | 0 | CP-MR, CP-RV | Reviewer |
| bridge/test/link/link-contract.test.ts | 102 | 1 | CP-MR, CP-RV | Reviewer |
| bridge/test/mcp-endpoint/core-fixture.ts | 16 | 0 | CP-MR, CP-RV | Reviewer |
| bridge/test/mcp-endpoint/events.test.ts | 584 | 0 | CP-MR, CP-RV | Reviewer |
| bridge/test/mcp-endpoint/mcp-endpoint.test.ts | 40 | 3 | CP-MR, CP-RV | Reviewer |
| bridge/test/query-layer/migrations-contract.ts | 65 | 0 | CP-MR, CP-RV | Reviewer |
| bridge/test/query-layer/tsql.test.ts | 3 | 3 | CP-MR, CP-RV | Reviewer |
| bridge/test/ring-boundary/push-decrypt.test.ts | 86 | 0 | CP-MR, CP-RV | Reviewer |
| bridge/test/ring-pilot.test.ts | 525 | 0 | CP-MR, CP-RV | Reviewer |
| bridge/test/scenarios/scenario-engine.ts | 6 | 0 | CP-MR, CP-RV | Reviewer |
| bridge/test/support/event-path.ts | 50 | 0 | CP-MR, CP-RV | Reviewer |
| bridge/test/support/fake-ring-client.ts | 23 | 0 | CP-MR, CP-RV | Reviewer |
| bridge/test/support/index.ts | 3 | 0 | CP-MR, CP-RV | Reviewer |
| bridge/test/support/recording-intake.ts | 25 | 1 | CP-MR, CP-RV | Reviewer |
| infra/bootstrap/bootstrap.ps1 | 5 | 4 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| infra/bootstrap/entra-app-registration.md | 9 | 1 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| infra/bootstrap/set-alert-contacts.ps1 | 77 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| infra/home/new-connector-vm.ps1 | 9 | 2 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| infra/home/ring-bridge-update.sh | 38 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| infra/home/start-ring-pilot.ps1 | 40 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| infra/main.bicep | 22 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| infra/main.example.bicepparam | 3 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| infra/modules/app-service.bicep | 7 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| infra/modules/bridge-health.kql | 15 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| infra/modules/monitoring.bicep | 58 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| package-lock.json | 3 | 3 | CP-MR, CP-RV | Reviewer |
| package.json | 1 | 0 | CP-MR, CP-RV | Reviewer |
| schemas/event.schema.json | 184 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| schemas/tool-inputs.schema.json | 44 | 1 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| schemas/tool-replies.schema.json | 307 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| scripts/audit-exceptions.json | 8 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| scripts/deploy-parameters.mjs | 19 | 1 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| scripts/license-gate.mjs | 62 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| scripts/npm-tree-exceptions.json | 11 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| specs/001-ring-mcp-bridge/contracts/connector-link.md | 8 | 3 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| specs/001-ring-mcp-bridge/contracts/mcp-tools.md | 3 | 1 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| specs/001-ring-mcp-bridge/contracts/web-endpoints.md | 4 | 2 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| specs/001-ring-mcp-bridge/implementation-rules.yml | 3 | 3 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| specs/001-ring-mcp-bridge/iterations/002/design-analysis.md | 345 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| specs/001-ring-mcp-bridge/iterations/002/drift-log.md | 396 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| specs/001-ring-mcp-bridge/iterations/002/lens-applicability.json | 50 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| specs/001-ring-mcp-bridge/iterations/002/plan.md | 138 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| specs/001-ring-mcp-bridge/iterations/002/quality/hardening-gate.md | 54 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| specs/001-ring-mcp-bridge/iterations/002/quality/mechanical-findings.json | 11 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| specs/001-ring-mcp-bridge/iterations/002/quality/quality-evidence.md | 17 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| specs/001-ring-mcp-bridge/iterations/002/state.md | 45 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| specs/001-ring-mcp-bridge/iterations/002/tasks-progress.yml | 71 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| specs/001-ring-mcp-bridge/iterations/002/workshop/architecture-core.md | 32 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| specs/001-ring-mcp-bridge/iterations/002/workshop/component-design.md | 87 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| specs/001-ring-mcp-bridge/iterations/002/workshop/data-storage.md | 30 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| specs/001-ring-mcp-bridge/iterations/002/workshop/devops-operations.md | 25 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| specs/001-ring-mcp-bridge/iterations/002/workshop/integration-api.md | 30 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| specs/001-ring-mcp-bridge/iterations/002/workshop/observability-resilience.md | 25 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| specs/001-ring-mcp-bridge/iterations/002/workshop/requirements-nfr.md | 35 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| specs/001-ring-mcp-bridge/iterations/002/workshop/security-compliance.md | 35 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| specs/001-ring-mcp-bridge/plan.md | 4 | 2 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| specs/001-ring-mcp-bridge/quickstart.md | 2 | 2 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| specs/001-ring-mcp-bridge/research.md | 137 | 1 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| specs/001-ring-mcp-bridge/spec.md | 11 | 13 | CP-MR, CP-RV | Reviewer |
| specs/001-ring-mcp-bridge/tasks-iteration-001.md | 659 | 0 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| specs/001-ring-mcp-bridge/tasks.md | 344 | 552 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| specs/001-ring-mcp-bridge/workshop/product-domain.md | 2 | 2 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |
| specs/001-ring-mcp-bridge/workshop/product-domain.yml | 3 | 3 | CP-08b, CP-11b, CP-12, CP-13, CP-18, CP-20, CP-21b, CP-RW, CP-PJ | Implementer |

## Public-API Delta

### Added

- equal (bridge/dev/ring-pilot/app.ts)
- mask (bridge/dev/ring-pilot/app.ts)
- pilotApp (bridge/dev/ring-pilot/app.ts)
- persist (bridge/dev/ring-pilot/app.ts)
- active (bridge/dev/ring-pilot/app.ts)
- forget (bridge/dev/ring-pilot/app.ts)
- forgetTicket (bridge/dev/ring-pilot/app.ts)
- sessionTicket (bridge/dev/ring-pilot/app.ts)
- expire (bridge/dev/ring-pilot/app.ts)
- match (bridge/dev/ring-pilot/app.ts)
- ringClient (bridge/dev/ring-pilot/client.ts)
- ringRequest (bridge/dev/ring-pilot/client.ts)
- InvalidRingGrant (bridge/dev/ring-pilot/client.ts)
- PilotLinks (bridge/dev/ring-pilot/links.ts)
- SnapshotError (bridge/dev/ring-pilot/snapshot.ts)
- checkStatus (bridge/dev/ring-pilot/snapshot.ts)
- downloadSnapshot (bridge/dev/ring-pilot/snapshot.ts)
- write (bridge/src/connector/access/outbox-store/outbox-events.test.ts)
- idsOf (bridge/src/connector/access/outbox-store/outbox-events.test.ts)
- EVENT_WINDOW (bridge/src/connector/access/outbox-store/outbox-store.ts)
- EVENT_RESEND_FIRST_MS (bridge/src/connector/access/outbox-store/outbox-store.ts)
- EVENT_RESEND_MAX_MS (bridge/src/connector/access/outbox-store/outbox-store.ts)
- EVENT_RESEND_JITTER (bridge/src/connector/access/outbox-store/outbox-store.ts)
- eventOf (bridge/src/connector/access/outbox-store/outbox-store.ts)
- past (bridge/src/connector/access/ring-adapter/ring-api-adapter.test.ts)
- eventOf (bridge/src/connector/access/ring-adapter/ring-api-adapter.test.ts)
- panelEntry (bridge/src/connector/access/ring-adapter/ring-mapping.ts)
- epochMs (bridge/src/connector/access/ring-adapter/ring-mapping.ts)
- historyEntry (bridge/src/connector/access/ring-adapter/ring-mapping.ts)
- CATCHUP_CHECK_MS (bridge/src/connector/clients/home-scheduler/home-scheduler.ts)
- PushSource (bridge/src/connector/clients/push-listener/push-listener.test.ts)
- dingFixture (bridge/src/connector/clients/push-listener/push-listener.test.ts)
- setup (bridge/src/connector/clients/push-listener/push-listener.test.ts)
- received (bridge/src/connector/clients/push-listener/push-listener.test.ts)
- MAX_SHAPES_RECORDED (bridge/src/connector/clients/push-listener/push-listener.ts)
- PushListener (bridge/src/connector/clients/push-listener/push-listener.ts)
- dingFixture (bridge/src/connector/clients/push-listener/push-shape.test.ts)
- MAX_SHAPE_DEPTH (bridge/src/connector/clients/push-listener/push-shape.ts)
- MAX_ITEM_SHAPES (bridge/src/connector/clients/push-listener/push-shape.ts)
- arrayShape (bridge/src/connector/clients/push-listener/push-shape.ts)
- objectShape (bridge/src/connector/clients/push-listener/push-shape.ts)
- shapeAt (bridge/src/connector/clients/push-listener/push-shape.ts)
- shapeOf (bridge/src/connector/clients/push-listener/push-shape.ts)
- dingFixture (bridge/src/connector/clients/push-listener/push-sighting.test.ts)
- withCategory (bridge/src/connector/clients/push-listener/push-sighting.test.ts)
- epochMs (bridge/src/connector/clients/push-listener/push-sighting.ts)
- createdAtMs (bridge/src/connector/clients/push-listener/push-sighting.ts)
- sightDing (bridge/src/connector/clients/push-listener/push-sighting.ts)
- sightPush (bridge/src/connector/clients/push-listener/push-sighting.ts)
- entry (bridge/src/connector/engines/normalize/history-events.test.ts)
- historyEvent (bridge/src/connector/engines/normalize/history-events.ts)
- contact (bridge/src/connector/engines/normalize/hub-events.test.ts)
- sensor (bridge/src/connector/engines/normalize/hub-events.test.ts)
- panel (bridge/src/connector/engines/normalize/hub-events.test.ts)
- armedAt (bridge/src/connector/engines/normalize/hub-events.ts)
- deviceChangeEvents (bridge/src/connector/engines/normalize/hub-events.ts)
- modeChangeEvent (bridge/src/connector/engines/normalize/hub-events.ts)
- alarmEvent (bridge/src/connector/engines/normalize/hub-events.ts)
- eventId (bridge/src/connector/engines/normalize/hub-events.ts)
- truncated (bridge/src/connector/engines/normalize/hub-events.ts)
- dingFixture (bridge/src/connector/engines/normalize/normalize.test.ts)
- motion (bridge/src/connector/engines/normalize/normalize.test.ts)
- push (bridge/src/connector/engines/normalize/normalize.test.ts)
- normalized (bridge/src/connector/engines/normalize/normalize.test.ts)
- fixture (bridge/src/connector/engines/normalize/normalize.test.ts)
- MAX_RING_EVENT_ID_LENGTH (bridge/src/connector/engines/normalize/normalize.ts)
- epochMs (bridge/src/connector/engines/normalize/normalize.ts)
- parsedTime (bridge/src/connector/engines/normalize/normalize.ts)
- occurredAt (bridge/src/connector/engines/normalize/normalize.ts)
- ringEventId (bridge/src/connector/engines/normalize/normalize.ts)
- sawPerson (bridge/src/connector/engines/normalize/normalize.ts)
- described (bridge/src/connector/engines/normalize/normalize.ts)
- motionDescribed (bridge/src/connector/engines/normalize/normalize.ts)
- normalizePush (bridge/src/connector/engines/normalize/normalize.ts)
- doorbellPush (bridge/src/connector/managers/ingest/ingest.test.ts)
- pushIngest (bridge/src/connector/managers/ingest/ingest.test.ts)
- entry (bridge/src/connector/managers/ingest/ingest.test.ts)
- FakeHistory (bridge/src/connector/managers/ingest/ingest.test.ts)
- catchUpIngest (bridge/src/connector/managers/ingest/ingest.test.ts)
- eventBody (bridge/src/connector/managers/ingest/ingest.ts)
- EVENT_PRIORITIES (bridge/src/contract/event.ts)
- EVENTS_RECOVERED_KIND (bridge/src/contract/event.ts)
- OTHER_RING_KIND (bridge/src/contract/event.ts)
- frameLink (bridge/src/contract/event.ts)
- recoveredSummary (bridge/src/contract/event.ts)
- recoveredExactlyWhenItsKind (bridge/src/contract/event.ts)
- eventShape (bridge/src/contract/event.ts)
- DEFAULT_EVENTS_PER_READ (bridge/src/contract/events-tool.ts)
- MAX_EVENTS_PER_REPLY (bridge/src/contract/events-tool.ts)
- getEventsInput (bridge/src/contract/events-tool.ts)
- eventsData (bridge/src/contract/events-tool.ts)
- getEventsTool (bridge/src/contract/events-tool.ts)
- EVENTS_CHAIN (bridge/src/core/access/audit/audit.ts)
- EVENT_INGESTED (bridge/src/core/access/audit/audit.ts)
- MAX_ENTRIES_PER_READ (bridge/src/core/access/audit/audit.ts)
- AuditError (bridge/src/core/access/audit/audit.ts)
- parsed (bridge/src/core/access/audit/audit.ts)
- Audit (bridge/src/core/access/audit/audit.ts)
- FIRST_LOG_EPOCH (bridge/src/core/access/event-log/event-log.ts)
- MAX_EVENTS_PER_READ (bridge/src/core/access/event-log/event-log.ts)
- MAX_SUMMARY_LENGTH (bridge/src/core/access/event-log/event-log.ts)
- EventLogError (bridge/src/core/access/event-log/event-log.ts)
- parsed (bridge/src/core/access/event-log/event-log.ts)
- storedEvent (bridge/src/core/access/event-log/event-log.ts)
- fittedSummary (bridge/src/core/access/event-log/event-log.ts)
- EventLog (bridge/src/core/access/event-log/event-log.ts)
- CursorStore (bridge/src/core/access/subscriptions/cursor-store.ts)
- DELIVERY_KEY_NAME (bridge/src/core/access/subscriptions/delivery-key.ts)
- writeFirstDeliveryKey (bridge/src/core/access/subscriptions/delivery-key.ts)
- DeliveryKeySource (bridge/src/core/access/subscriptions/delivery-key.ts)
- SubscriptionsError (bridge/src/core/access/subscriptions/subscriptions-store.ts)
- subscriptionId (bridge/src/core/access/subscriptions/subscriptions-store.ts)
- SubscriptionsStore (bridge/src/core/access/subscriptions/subscriptions-store.ts)
- opened (bridge/src/core/access/subscriptions/subscriptions-store.ts)
- eventMessage (bridge/src/core/clients/connector-link/connector-link.test.ts)
- incomingEvent (bridge/src/core/clients/connector-link/intake-mapping.ts)
- eventSchema (bridge/src/core/clients/connector-link/messages/home-messages.ts)
- transport (bridge/src/core/clients/delivery/callback-transport.test.ts)
- url (bridge/src/core/clients/delivery/callback-transport.test.ts)
- CallbackError (bridge/src/core/clients/delivery/callback-transport.ts)
- isPublicAddress (bridge/src/core/clients/delivery/callback-transport.ts)
- checkedLookup (bridge/src/core/clients/delivery/callback-transport.ts)
- httpsCallbackTransport (bridge/src/core/clients/delivery/callback-transport.ts)
- exchange (bridge/src/core/clients/delivery/callback-transport.ts)
- asCallbackError (bridge/src/core/clients/delivery/callback-transport.ts)
- echo (bridge/src/core/clients/delivery/delivery.test.ts)
- MemorySecrets (bridge/src/core/clients/delivery/delivery.test.ts)
- stored (bridge/src/core/clients/delivery/delivery.test.ts)
- signatureOf (bridge/src/core/clients/delivery/delivery.test.ts)
- EVENT_TYPE (bridge/src/core/clients/delivery/delivery.ts)
- SUBSCRIPTION_TTL_MS (bridge/src/core/clients/delivery/delivery.ts)
- MIN_SUBSCRIPTION_TTL_MS (bridge/src/core/clients/delivery/delivery.ts)
- RETRY_DELAYS_MS (bridge/src/core/clients/delivery/delivery.ts)
- MAX_WEBHOOK_BYTES (bridge/src/core/clients/delivery/delivery.ts)
- DeliveryError (bridge/src/core/clients/delivery/delivery.ts)
- clientRef (bridge/src/core/clients/delivery/delivery.ts)
- accepted (bridge/src/core/clients/delivery/delivery.ts)
- retryable (bridge/src/core/clients/delivery/delivery.ts)
- Delivery (bridge/src/core/clients/delivery/delivery.ts)
- parsedJson (bridge/src/core/clients/delivery/delivery.ts)
- storeError (bridge/src/core/clients/delivery/delivery.ts)
- signingKeyOf (bridge/src/core/clients/delivery/webhook-signature.ts)
- signedHeaders (bridge/src/core/clients/delivery/webhook-signature.ts)
- CALLBACK_ENDPOINT_ERROR (bridge/src/core/clients/mcp-endpoint/events-handler.ts)
- protocolError (bridge/src/core/clients/mcp-endpoint/events-handler.ts)
- signedInClient (bridge/src/core/clients/mcp-endpoint/events-handler.ts)
- registerEventMethods (bridge/src/core/clients/mcp-endpoint/events-handler.ts)
- EVENTS_URI (bridge/src/core/clients/mcp-endpoint/listen-stream.ts)
- legacyListen (bridge/src/core/clients/mcp-endpoint/listen-stream.ts)
- ListenStreams (bridge/src/core/clients/mcp-endpoint/listen-stream.ts)
- startCoreScheduler (bridge/src/core/clients/scheduler/index.ts)
- shippedFile (bridge/src/core/engines/classify/classify-engine.test.ts)
- refusal (bridge/src/core/engines/classify/classify-engine.test.ts)
- PRIORITY_ORDER (bridge/src/core/engines/classify/classify-engine.ts)
- PRIORITY_POLICY_VERSION (bridge/src/core/engines/classify/classify-engine.ts)
- SHARED_LOCATION_KINDS (bridge/src/core/engines/classify/classify-engine.ts)
- PriorityPolicyError (bridge/src/core/engines/classify/classify-engine.ts)
- hasNoConditions (bridge/src/core/engines/classify/classify-engine.ts)
- unreachableRule (bridge/src/core/engines/classify/classify-engine.ts)
- parsePriorityPolicy (bridge/src/core/engines/classify/classify-engine.ts)
- keptFromSharedLocation (bridge/src/core/engines/classify/classify-engine.ts)
- matches (bridge/src/core/engines/classify/classify-engine.ts)
- priorityOf (bridge/src/core/engines/classify/classify-engine.ts)
- isLate (bridge/src/core/engines/classify/classify-engine.ts)
- highestPriority (bridge/src/core/engines/classify/classify-engine.ts)
- PRIORITY_POLICY_FILE (bridge/src/core/engines/classify/index.ts)
- monitorSample (bridge/src/core/engines/health/health-engine.ts)
- location (bridge/src/core/managers/event/event-path.test.ts)
- event (bridge/src/core/managers/event/event-path.test.ts)
- FailingState (bridge/src/core/managers/event/event-path.test.ts)
- MAX_EVENT_ID_LENGTH (bridge/src/core/managers/event/event-writer.ts)
- MAX_EVENT_KIND_LENGTH (bridge/src/core/managers/event/event-writer.ts)
- fits (bridge/src/core/managers/event/event-writer.ts)
- EventWriter (bridge/src/core/managers/event/event-writer.ts)
- MAX_EVENTS_PER_REPLY (bridge/src/core/managers/inquiry/events-read.ts)
- DEFAULT_EVENTS_PER_REPLY (bridge/src/core/managers/inquiry/events-read.ts)
- encodeCursor (bridge/src/core/managers/inquiry/events-read.ts)
- decodeCursor (bridge/src/core/managers/inquiry/events-read.ts)
- cursorLocation (bridge/src/core/managers/inquiry/events-read.ts)
- readEvents (bridge/src/core/managers/inquiry/events-read.ts)
- compactDisplayFields (bridge/src/core/managers/inquiry/events-read.ts)
- mcpBytes (bridge/src/core/managers/inquiry/events-read.ts)
- matches (bridge/src/core/managers/inquiry/events-read.ts)
- CALLBACK_TIMEOUT_MS (bridge/src/host/core-service.ts)
- CALLBACK_RESPONSE_LIMIT_BYTES (bridge/src/host/core-service.ts)
- readPriorityPolicy (bridge/src/host/priority-policy.ts)
- PUSH_SHAPES_FILE_NAME (bridge/src/host/push-shapes-file.ts)
- pushShapesFile (bridge/src/host/push-shapes-file.ts)
- eventRulesSetting (bridge/src/utilities/config/event-rules.ts)
- ruleSource (bridge/src/utilities/config/event-rules.ts)
- eventSource (bridge/src/utilities/config/event-rules.ts)
- eventAction (bridge/src/utilities/config/event-rules.ts)
- cameraEventsEnabled (bridge/src/utilities/config/event-rules.ts)
- DEFAULT_CALLBACK_HOSTS (bridge/src/utilities/config/mode-settings.ts)
- EVENT_LOG_AND_AUDIT (bridge/src/utilities/query-layer/migrations/0007-event-log-and-audit.ts)
- WEBHOOK_SUBSCRIPTIONS (bridge/src/utilities/query-layer/migrations/0008-webhook-subscriptions.ts)
- EVENT_CURSORS (bridge/src/utilities/query-layer/migrations/0009-event-cursors.ts)
- statements (bridge/src/utilities/query-layer/migrations/0010-recovery-health.ts)
- RECOVERY_HEALTH (bridge/src/utilities/query-layer/migrations/0010-recovery-health.ts)
- resolved (bridge/test/contract/event-shape.test.ts)
- factsOf (bridge/test/contract/event-shape.test.ts)
- published (bridge/test/contract/event-shape.test.ts)
- event (bridge/test/contract/event-shape.test.ts)
- never (bridge/test/core-access/cursor-store.test.ts)
- never (bridge/test/core-access/event-log-and-audit.test.ts)
- event (bridge/test/core-access/event-log-and-audit.test.ts)
- Rollback (bridge/test/core-access/event-log-and-audit.test.ts)
- never (bridge/test/core-access/subscriptions-store.test.ts)
- MemorySecrets (bridge/test/core-access/subscriptions-store.test.ts)
- subscription (bridge/test/core-access/subscriptions-store.test.ts)
- never (bridge/test/host/event-path.test.ts)
- DoorbellPush (bridge/test/host/event-path.test.ts)
- fileWith (bridge/test/host/priority-policy.test.ts)
- folder (bridge/test/host/push-shapes-file.test.ts)
- logger (bridge/test/host/push-shapes-file.test.ts)
- notCalled (bridge/test/mcp-endpoint/events.test.ts)
- hourFromNow (bridge/test/mcp-endpoint/events.test.ts)
- tokenCheck (bridge/test/mcp-endpoint/events.test.ts)
- MemorySecrets (bridge/test/mcp-endpoint/events.test.ts)
- echo (bridge/test/mcp-endpoint/events.test.ts)
- subscription (bridge/test/mcp-endpoint/events.test.ts)
- base64url (bridge/test/ring-boundary/push-decrypt.test.ts)
- setup (bridge/test/ring-pilot.test.ts)
- eventPathParts (bridge/test/support/event-path.ts)
- inquiryEventParts (bridge/test/support/event-path.ts)
- invalidEdgesOnly (scripts/license-gate.mjs)
- componentsFromLock (scripts/license-gate.mjs)

### Removed

- none

## Module Hotspots

- Threshold: 250 changed lines per file
- bridge/dev/ring-pilot/app.ts (553 changed lines)
- bridge/src/connector/access/outbox-store/outbox-events.test.ts (367 changed lines)
- bridge/src/connector/access/outbox-store/outbox-store.ts (323 changed lines)
- bridge/src/connector/access/ring-adapter/ring-api-adapter.test.ts (260 changed lines)
- bridge/src/connector/engines/normalize/hub-events.test.ts (250 changed lines)
- bridge/src/connector/engines/normalize/normalize.test.ts (285 changed lines)
- bridge/src/connector/engines/normalize/normalize.ts (262 changed lines)
- bridge/src/connector/managers/ingest/ingest.test.ts (600 changed lines)
- bridge/src/connector/managers/ingest/ingest.ts (425 changed lines)
- bridge/src/core/access/event-log/event-log.ts (408 changed lines)
- bridge/src/core/access/subscriptions/subscriptions-store.ts (306 changed lines)
- bridge/src/core/clients/delivery/delivery.test.ts (672 changed lines)
- bridge/src/core/clients/delivery/delivery.ts (653 changed lines)
- bridge/src/core/engines/classify/classify-engine.test.ts (297 changed lines)
- bridge/src/core/managers/event/event-manager.ts (329 changed lines)
- bridge/src/core/managers/event/event-path.test.ts (770 changed lines)
- bridge/src/core/managers/inquiry/events-read.test.ts (418 changed lines)
- bridge/src/core/managers/inquiry/events-read.ts (324 changed lines)
- bridge/test/core-access/event-log-and-audit.test.ts (308 changed lines)
- bridge/test/host/event-path.test.ts (315 changed lines)
- bridge/test/mcp-endpoint/events.test.ts (584 changed lines)
- bridge/test/ring-pilot.test.ts (525 changed lines)
- schemas/tool-replies.schema.json (307 changed lines)
- specs/001-ring-mcp-bridge/iterations/002/design-analysis.md (345 changed lines)
- specs/001-ring-mcp-bridge/iterations/002/drift-log.md (396 changed lines)
- specs/001-ring-mcp-bridge/tasks-iteration-001.md (659 changed lines)
- specs/001-ring-mcp-bridge/tasks.md (896 changed lines)
