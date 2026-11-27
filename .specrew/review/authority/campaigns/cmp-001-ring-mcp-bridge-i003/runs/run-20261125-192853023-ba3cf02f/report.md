# Review Result

- **Campaign**: `cmp-001-ring-mcp-bridge-i003`
- **Run**: `run-20261125-192853023-ba3cf02f`
- **Harness**: `claude-code-file-primary`
- **Target digest**: `10f3a1f58eb12a91212e5e8c7bca31a3cc5134de`
- **Completion**: `complete`
- **Verdict**: `findings`
- **Runtime outcome**: `completed`
- **Currentness**: `current`
- **Can approve current snapshot**: `false`

## Summary

Risk-based static review of the iteration 003 event-media handoff: receiver download, grants, withdrawal, staging, cleanup, audits, shutdown drain, owner settings, MCP sharing, migrations, storage deployment and the Ring pilot probe. No authorization bypass, cross-household access, or blocking defect was found. Two minor audit gaps were found: interruption during the last response chunk is not recorded, and unauthenticated requests for unknown items can exhaust the shared denial-audit allowance. Open plan work (M01, M03, M05 and planned tasks, including the production event source) was not reported as a defect. Controller evidence covers only the governance command, which exited 0; no unit, integration or build results were supplied, and none were run here.

## Findings

| ID | Severity | Relevance | Location | Finding |
| --- | --- | --- | --- | --- |
| `finding-3bc7ef163f87c0f4` | minor | current | bridge/src/core/clients/web/media-download.ts:166 | A disconnect while the final chunk is being sent is never audited as incomplete: enqueue() treats a transfer as finished once its last chunk is placed in the ReadableStream queue: offset passes range.end, abortListener is aborted (removing the disconnect listener), and the controller is closed. Delivery to the HTTP response has not happened at that point. A later client disconnect or shutdown closeAllConnections() cannot call onDisconnect; cancel(), if called before the queue drains, returns without auditing because offset > range.end, and once the consumer has read the last chunk the closed stream no longer receives cancel(). For any response of at most 256 KiB, start() enqueues the only chunk before the Response is returned, so the entire transfer, commonly a whole JPEG or small range, is in this unobserved state. The log then contains only 'allowed' for an interrupted transfer. Access control is unaffected. The interruption tests use bodies of 512 KiB or more and interrupt before the last chunk is enqueued. Track completion of the Node response (finish versus pr… |
| `finding-6d9f5fabee8497ed` | minor | current | bridge/src/core/clients/web/media-download.ts:71 | Requests for unknown item IDs can suppress audits of anonymous attempts on real items: Every missing or invalid-token request takes from one process-wide 'anonymous' allowance before auditFetch determines whether the item exists. auditFetch writes nothing for an unknown item, but the slot stays consumed. Any internet caller can therefore send readsPerHour requests (600 by default) with random well-formed item IDs and make later unauthenticated attempts against real items go unaudited for up to an hour. The suppression is also silent: no warning or counter is logged when take() refuses. The denial response itself remains correct. Consume the write allowance only after the item is known (with a separate bound for lookups), or bound it per item, and log once when denial auditing is being suppressed. |

_This Markdown is a controller-generated projection. Authority is the sibling immutable `result.json`._