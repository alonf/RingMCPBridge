# Review Result

- **Campaign**: `cmp-001-ring-mcp-bridge-i003`
- **Run**: `run-20261123-185559094-4f35122d`
- **Harness**: `claude-code-file-primary`
- **Target digest**: `a59a9d999560cb938b571e80a8f2469e282019cb`
- **Completion**: `complete`
- **Verdict**: `findings`
- **Runtime outcome**: `completed`
- **Currentness**: `current`
- **Can approve current snapshot**: `false`

## Summary

Risk-based review of the implemented iteration 003 slice (T064 pilot probe; T065/T066 private media staging, retention, delete-now), focusing on claims, publication, cancellation, late Blob commits, orphan reconciliation, read/delete races, cleanup isolation, host wiring and storage infrastructure. No blocking or major defect was found. Claims commit before bytes are sent, publication is conditional on an undeleted row, listing precedes the database check, and reads recheck visibility after the object read. Two minor operability defects and one minor record inconsistency remain. Receiver handoff, grants, settings UI and later work (M03-M06, F01, Q01, Q02) were outside the risk focus and were not assessed. spec.md and tasks.md were searched by requirement/task ID, and the contract schemas were not opened. The supplied controller evidence contains only a passing governance validation; it carries no unit, integration or Azurite results, so those tests were inspected but their execution was not confirmed here.

## Findings

| ID | Severity | Relevance | Location | Finding |
| --- | --- | --- | --- | --- |
| `finding-f195f58c0cec1b34` | minor | current | bridge/src/host/core-assembly.ts:188 | Core shutdown waits for media cleanup before releasing the lease: stop() awaits media.stop() and the sweep before links.stop() and lease.stop(). media.stop() waits for every in-flight stage, and each aborted stage runs cleanupFailedWrite, which can take up to CLEANUP_TIMEOUT_MS (10 s) when Blob or SQL is slow or unavailable. main.ts sets no overall stop deadline, and no infra file sets WEBSITES_CONTAINER_STOP_TIME_LIMIT. If the host kills the container during this wait, the lease is not released and a replacement may have to wait for its expiry (LEASE_EXPIRES_MS is 45 s) before it takes over the home link. A failing media store can therefore delay alarm/event ingestion on a restart. Suggested fix: abort media first, then release links and the lease without waiting for media, and await media settlement before the caller closes the database; or run both concurrently. |
| `finding-ddfd6947ed5b1eca` | minor | current | bridge/src/host/core-assembly.ts:129 | A stalled storage call suspends all later media sweeps: sweepMedia returns immediately while a previous sweep promise is unsettled, and the sweep receives only the process-lifetime cleanup signal. Neither collect() nor BlobMediaObjects imposes a per-operation or per-sweep deadline on list/delete, unlike staging (WRITE_TIMEOUT_MS) and failed-write cleanup (CLEANUP_TIMEOUT_MS). While a list or delete call remains stalled, every later tick is skipped. Expired objects then remain on disk/Blob and abandoned pending claims keep their event in the pending state, with no media_cleanup_failed log. Expired ready items remain unreadable because ready() checks expires_at, so this affects physical retention, retries and observability. Suggested fix: give each sweep a clock-scheduled abort combined with the shutdown signal, report the timeout, and add a test with a stalled remove/listPage. |
| `finding-edcad6787d4425c0` | minor | current | specs/001-ring-mcp-bridge/iterations/003/state.md:4 | Iteration 003 records contradict the implemented state: tasks.md marks T065 and T066 complete and media-evidence.md says M02 storage is implemented, while plan.md (Status executing) still lists M01 and M02 as planned. state.md says Current Phase before-implement, Iteration Status planning, no completed or in-progress tasks, and that the plan awaits a scope decision. The hardening gate still has Reviewed By Reviewer (pending) and says the independent hardening review and before-implement decision are pending, although plan.md calls for validating that gate before implementation. A resume or reviewer relying on these records gets the wrong task and gate status. Reconcile them through the governed workflow. |

_This Markdown is a controller-generated projection. Authority is the sibling immutable `result.json`._