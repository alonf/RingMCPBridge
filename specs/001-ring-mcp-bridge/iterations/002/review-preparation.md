# Iteration 002 review

## Follow-up review scope

Trace a real `doorbell.ding` from Ring intake through the home connector and core to ChatGPT's signed webhook, then through the client's `get_events` read. Compare the production code and tests with iteration 002's plan, task acceptance criteria and tools contract. Start with these paths:

- `bridge/src/connector/engines/normalize`, `connector/managers/ingest` and `connector/access/outbox-store`: event identity, timestamps, durable enqueue, reconnect and catch-up.
- `bridge/src/core/clients/connector-link`, `core/engines/classify` and `core/access/event-log`: location policy, deduplication, transaction and acknowledgement order.
- `bridge/src/core/clients/delivery`, `core/access/subscriptions` and `core/clients/mcp-endpoint`: authorization, HIGH delivery, retries, and the event returned to each client on its cursor.
- `specs/001-ring-mcp-bridge/iterations/002/plan.md`, `specs/001-ring-mcp-bridge/tasks.md` and `contracts/iteration-002-tools.schema.json` under the feature directory: compare the implemented guarantees with the requirements and recorded pilot evidence.

Identify the actual files and tests examined, any unverified links in the path, and findings with source locations. The four private camera pilot files were already examined in round four.

## Status

The owner approved an allowance reset after the fourth round. The first round under the new allowance returned a partial report, leaving three of four rounds available. The campaign is paused for the owner's decision and human sign-off is pending.

## Production event path follow-up, November 21

Claude's [round-five report](../../../../.specrew/review/authority/campaigns/cmp-001-ring-mcp-bridge-i002/runs/run-20261120-224103918-417f4833/report.md) lists 13 examined paths. It traced connector ingestion, core intake, classification, transaction and acknowledgement order, event deduplication, webhook retry authorization and the MCP event cursor. It recorded no findings in the files examined. The controller recorded a partial result. Its automatic retry paused before invoking a reviewer or spending a second round.

The remaining independent review covers the Ring push listener and normalization, outbox durability and resend order, subscription storage and callback address validation, and the relevant tests against the iteration plan and public tools contract. The implementer separately ran 19 event-path test files on the source checkout: 361 tests passed and 31 were skipped. The two earlier pilot findings remain open.

The reviewed tree `c35b34d20c7fa864217f456129ff78a997e64e62` is pinned by the verified remote tag `specrew-reviewed/run-20261120-224103918-417f4833`.

## Round four, November 20

The [controller report](../../../../.specrew/review/authority/campaigns/cmp-001-ring-mcp-bridge-i002/runs/run-20261120-201951241-4e720cca/report.md) records a successful governance check and a static review of four files in the official Ring pilot. Claude did not inspect the connector, core, contracts, specs or design documents in this round. The report identifies two minor findings in the pilot and no major or blocking findings in the files examined.

| Finding | Follow-up for disposition |
| --- | --- |
| Signed media download destination | Restrict the outbound download destination so that a redirect supplied by Ring cannot reach a private or loopback address. |
| Integration-removal webhook replay | Ensure that replaying an earlier signed removal cannot remove a newer link for the same account. |

Both findings remain open. The reviewed tree `c7e1cdfa7fd018014f201f608c1cee375a91ee1b` is pinned by `specrew-reviewed/run-20261120-201951241-4e720cca`. The controller released the first two preflight reservations. Only the invocation that produced this report spent the fourth round.

## Evidence for the final round

- The current implementation covers event intake, durable storage, catch-up, per-client reads, delivery, and bridge health. The [task ledger](../../tasks.md) lists the acceptance criteria and traces.
- The single-press pilot recorded on November 20 produced a HIGH event. The connector received it in 403 ms and ChatGPT accepted its callback in 913 ms (HTTP 200). The pilot journal contains the timestamps. See the [iteration state](state.md) for the notification observation and earlier samples.
- The official private-app experiment demonstrated device discovery and saved a real JPEG through the public pilot. The [S1 result](../../research.md) documents the post-link time range. Production camera tools and event-specific media remain iteration 003 work.

## Open acceptance evidence

The owner requested carrying the alert email, seven-day soak and clock check, and month-end bill into 003. The alert rule fired and resolved and SMS delivery was verified. Carry each outstanding check with its existing criterion. The final review findings and their disposition belong here before sign-off.
