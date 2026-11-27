# Review Result

- **Campaign**: `cmp-001-ring-mcp-bridge-i001`
- **Run**: `run-20261107-153636996-5e841879`
- **Harness**: `codex-cli-file-primary`
- **Target digest**: `10f215e63fa3215f63ea399c75a35ffae09181cc`
- **Completion**: `complete`
- **Verdict**: `findings`
- **Runtime outcome**: `completed`
- **Currentness**: `current`
- **Can approve current snapshot**: `false`

## Summary

Completed risk-based inspection of the frozen implementation, design contracts, selected regression tests, and CI policy. Coverage included enrollment, sign-in and secret handling, Ring access, link authentication and reconnects, outbox delivery, SQL transactions and migrations, logging, and public contracts. The controller's sole declared governance verification passed with exit code 0 and no timeout. No tests or builds were run during this review. Found one major concurrency defect and one minor memory leak; documented pilot deferrals were not reported as new defects.

## Findings

| ID | Severity | Relevance | Location | Finding |
| --- | --- | --- | --- | --- |
| `finding-1f10be69e73b9824` | minor | current | bridge/src/core/access/settings/settings-store.ts:291 | Serialize pending-enrollment replacement on SQL Server: [demoted to minor: no concrete failure scenario, so it cannot gate; reported as major by the reviewer] When two different keys request enrollment concurrently while no request is pending, both transactions can execute DELETE_PENDING before either inserts. TsqlDriver runs transactions concurrently and begins them without serializable isolation; the connector table has only a key_id primary key and no invariant restricting pending rows. Both inserts can therefore commit, leaving two pending requests. pendingEnrollment returns only one, while approveEnrollment can still approve the other even after ConnectorLink has closed its link as enrollment_replaced. This violates the promised replacement semantics and permits approval of a superseded request. Serialize this operation across requests with a database lock or enforce a singleton pending record, and cover the overlapping-request case on SQL Server. The existing replacement test awaits the requests sequentially and does not exercise this… |
| `finding-910125e8f1d52591` | minor | current | bridge/src/connector/clients/home-scheduler/home-scheduler.ts:74 | Discard cancellation handles after scheduler timers fire: Each completed resend or heartbeat tick appends another cancellation closure to #cancels, but expired entries are never removed until stop(). SystemClock.schedule's closure retains its Timeout object, so an unattended connector accumulates roughly 14,400 retained handles per day at the configured 10-second and 15-second intervals, even when no work fails. Memory and shutdown traversal grow with total uptime instead of the two active timers. Keep only the current cancellation handle for each periodic task, or remove the previous handle when its timer fires. |

_This Markdown is a controller-generated projection. Authority is the sibling immutable `result.json`._