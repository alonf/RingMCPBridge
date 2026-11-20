# Review Result

- **Campaign**: `cmp-001-ring-mcp-bridge-i001`
- **Run**: `run-20261106-234102754-7edcd9ba`
- **Harness**: `codex-cli-file-primary`
- **Target digest**: `4c342519dd3313ad898f6e112b74702c8b5ee991`
- **Completion**: `complete`
- **Verdict**: `findings`
- **Runtime outcome**: `completed`
- **Currentness**: `current`
- **Can approve current snapshot**: `false`

## Summary

Completed a risk-based review of the frozen implementation, which is implemented through T014 with later tasks explicitly planned. Inspected Ring integration and call limits, durable outbox and ingestion ordering, SQL transactions and migrations, encrypted secrets, sign-in and logging utilities, public contracts, and CI/test support. Found two major defects in Ring call lifecycle handling. The controller's one declared governance verification command succeeded for the supplied digest. No tests, builds, or repository automation were run in this review.

## Findings

| ID | Severity | Relevance | Location | Finding |
| --- | --- | --- | --- | --- |
| `finding-07100fc68fd229f6` | minor | current | bridge/src/connector/access/ring-adapter/ring-api-adapter.ts:173 | Stop underlying Ring requests before releasing their call-gate slot: [demoted to minor: no concrete failure scenario, so it cannot gate; reported as major by the reviewer] The timeout and abort paths reject only the wrapper promise; the pending work is neither cancelled nor stopped. RingCallGate.call then releases its slot even though that work is still active. DRIFT-001-18 explicitly records that ring-client-api continues retrying these requests indefinitely in the background. Consequently, retries keep reaching Ring while the circuit is open, and subsequent calls or probes can overlap the abandoned requests. The circuit does not bound these background retry loops to five calls, because later probes can also time out without terminating their work. This defeats FR-026's shared outgoing limiter and FR-042's backoff during an extended outage. Put actual requests and retries under a cancellable boundary, and ensure outstanding work is stopped or otherwise bounded before admitting replacements. Cover continued background retries after timeout in the adapte… |
| `finding-d347d80c5bbe4155` | minor | current | bridge/src/connector/access/ring-adapter/ring-api-adapter.ts:153 | Keep a lost Ring session terminal for calls already in the queue: [demoted to minor: no concrete failure scenario, so it cannot gate; reported as major by the reviewer] The lost-session check runs before waiting in the shared gate, with no equivalent check when the queued work starts. If two reads enter while the status is ok and the first fails with session_lost, the second still reaches Ring when its turn arrives. Its success unconditionally sets the status to ok, or a ring_unavailable failure changes it to unavailable, undoing the terminal lost state and permitting subsequent calls without the required owner sign-in/restart. Concurrent session-start and inventory-request reads can take this path. Recheck session loss inside the admitted work and prevent queued completions from changing a lost session to another status. The existing lost-session test invokes the second call only after the first has already rejected, so it does not cover this case. |

_This Markdown is a controller-generated projection. Authority is the sibling immutable `result.json`._