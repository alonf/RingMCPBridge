# Review Result

- **Campaign**: `cmp-001-ring-mcp-bridge-i003`
- **Run**: `run-20261125-125638133-0fad3578`
- **Harness**: `claude-code-file-primary`
- **Target digest**: `f3f81089c5c89a089863db4d39384f6654e73418`
- **Completion**: `complete`
- **Verdict**: `findings`
- **Runtime outcome**: `completed`
- **Currentness**: `current`
- **Can approve current snapshot**: `false`

## Summary

Risk-based review of the iteration 003 media slice (M01-M05): staging and cleanup, item grants, approval and settings storage, migrations 0011-0016, receiver download, share tool, scope gating on the MCP endpoint and issuer, admin camera and delete forms, event path person override, host wiring, storage infrastructure, and the Ring pilot probe. No blocking or major defect was established. Grants are bound to item, receiver, policy generation and approval generation; they are rechecked before the first bytes of each GET or Range; media-only tokens are refused event subscription methods; removed or media-less agents lose approvals in the seeding transaction. Two minor findings remain: a receiver disconnect between chunk reads leaves the audit at allowed only, and the stale-form check does not cover approval changes. The supplied controller evidence holds one successful record (governance validation, exit 0); it contains no unit, integration or infrastructure test result, so this review relies on source inspection only. Not inspected in depth: the tsql query-layer internals, most connector code unchanged by the media work, and most test files. Planned tasks (M06, F01, Q01, Q02, V01, V02) and the still in-progress production event source were treated as open scope, not defects.

## Findings

| ID | Severity | Relevance | Location | Finding |
| --- | --- | --- | --- | --- |
| `finding-6437ff5b7e0cbabf` | minor | current | bridge/src/core/clients/web/media-download.ts:160 | A receiver disconnect between chunk reads is never audited as incomplete: The first chunk records a fetch as allowed. Later failures are recorded as incomplete or denied only inside the catch of pull(). The stream's cancel() callback only aborts the controller. With highWaterMark 0, a client that disconnects while no pull is outstanding (for example while the server waits for socket drain, or between two reads) reaches cancel() with no pending nextChunk(), so no incomplete entry is written and the access log keeps only allowed for a transfer that did not finish. A disconnect during a storage read does get an incomplete entry, so the outcome depends on timing. The audit has an explicit incomplete outcome and FR-035 requires media access to be audited. The cancellation test uses a no-op auditFetch and asserts only the read count, so it does not detect this. Suggested fix: when cancel() runs with offset <= range.end and no failure already recorded, write the incomplete entry once with an independent timeout, and assert it in the cancellation test. |
| `finding-223da1d696c9bbdc` | minor | current | bridge/src/core/access/settings/media-permissions.ts:156 | Stale camera form check does not cover approval changes, so a stale form can restore a withdrawn approval: save() compares only the policy generation and person_action from the form. The policy generation changes only when enabled or sound changes (or on first insert); adding or removing a receiver approval leaves it unchanged. A form opened before a service was approved, with that service selected under Add receiving service, is therefore still accepted as current after the owner has approved and then withdrawn the service in another tab. It inserts a fresh approval and reports Camera permissions saved instead of the stale notice. Existing grants stay invalid because the new approval has a new generation, but new grants can be issued again. The form carries no approval version. Suggested fix: include a version for the camera's approval set in the expected values (for example a hash of approval ids and generations, read under the same lock), at least when the form adds an approval; withdrawals can remain accepted from older forms. |

_This Markdown is a controller-generated projection. Authority is the sibling immutable `result.json`._