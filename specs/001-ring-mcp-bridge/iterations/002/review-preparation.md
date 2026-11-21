# Iteration 002 review

## Round nine scope

The owner reset the allowance after round eight. Two independent checks remain from that round. Inspect these specific assertions on the frozen tree and record the files examined.

1. Compare `get_events` in `schemas/tool-inputs.schema.json` with `specs/001-ring-mcp-bridge/contracts/iteration-002-tools.schema.json`. Read the parameterized comparison in `bridge/test/contract/public-contract.test.ts` (lines 182–212). Check whether it exercises iteration 002 and would catch a change to `limit.maximum`.
2. Read the assertions under “MCP Events on the endpoint” in `bridge/test/mcp-endpoint/events.test.ts` (from line 460) against T048 in `specs/001-ring-mcp-bridge/tasks.md`. Check what a client without read scope receives, what happens at the callback receiver on a rejected destination, and how successful creation and removal are verified.

The round-eight findings below remain open. Record any additional gaps and any limitations of this inspection.

## Round eight result, November 21

Claude's [report](../../../../.specrew/review/authority/campaigns/cmp-001-ring-mcp-bridge-i002/runs/run-20261121-000915774-bedcc450/report.md) confirms test coverage for T043 acknowledgements, send window, backoff, jitter, backlog metrics and restart. For T048 it found tests for signed delivery, destination checks, response size, timeout, retry and isolation between clients. For T051 it found tests for restart, independent cursors, forward-only reads, paging and epoch changes.

| Finding | Follow-up |
| --- | --- |
| `finding-ac084882de5cd3e9` (minor) | Test that an oversized outbound webhook sends nothing, logs only the event identifier, and allows subsequent events to be delivered. |
| `finding-a8cb0b8b0ede4b00` (minor) | Reopen the subscription database and verify that two clients retain their own subscription and delivery state. |

Claude did not independently inspect the corrected `get_events` contract test, read the endpoint test beyond its titles, or examine 14 other test files referenced by its report. The controller recorded an incomplete verdict and paused the retry before invoking another reviewer. All four rounds in the reset allowance are used. The two pilot findings from round four also remain open.

The reviewed tree `1657167162b225b7c983267f8af74403b238ecfc` is pinned by the verified remote tag `specrew-reviewed/run-20261121-000915774-bedcc450`.

The owner chose to stop after round eight. Specrew attempted the final check and returned `review-human-disposition-requires-complete-current-valid-result`. The result is current but partial. The campaign remains paused, the findings remain open, and iteration 002 has no review sign-off. The stop decision remains unspent.

## Round eight scope

Compare the tests on the frozen tree with the acceptance criteria in [tasks.md](../../tasks.md). For each task, cite the assertions that cover its criteria and identify any criterion that lacks a test.

| Task | What to verify | Tests to inspect |
| --- | --- | --- |
| T043, connector outbox | An acknowledgement removes exactly its event. Check the send window, retry timing and jitter, backlog metrics, and recovery after a restart. | `bridge/src/connector/access/outbox-store/outbox-events.test.ts` |
| T048, callback delivery | Check the subscription read scope, protection of stored callback credentials, callback destination and request bounds, signature, retry, isolation between clients, untrusted text and per-event latency. | `bridge/test/mcp-endpoint/events.test.ts`, `bridge/test/core-access/subscriptions-store.test.ts`, and `delivery.test.ts` and `callback-transport.test.ts` in `bridge/src/core/clients/delivery/` |
| T051, subscriptions and cursors | Check client and location isolation, delivery state, restart persistence, gap-free paging, old-epoch reporting and migration coverage for both databases. | `bridge/test/core-access/cursor-store.test.ts`, `bridge/test/core-access/subscriptions-store.test.ts` and `bridge/src/core/managers/inquiry/events-read.test.ts` |

Verify the round-seven correction by checking the iteration 002 case in `bridge/test/contract/public-contract.test.ts` against the planned and published inputs for `get_events`.

## Round seven scope (historical)

Independently verify the timestamp fix in `f8dda18` and compare the event-path tests with the iteration 002 requirements and public MCP schema. Start with the following evidence:

1. In `bridge/src/connector/engines/normalize/normalize.test.ts`, find “uses the next timestamp”; in `bridge/src/connector/managers/ingest/ingest.test.ts`, find “queues a doorbell press with receipt time”. Compare their assertions with the implementation in `normalize.ts`, the wire event schema, and tasks T041–T044.
2. Compare the requirements in `iterations/002/plan.md` and `tasks.md` (T043, T048 and T051–T053) with the outbox, callback transport, subscription store and event-read tests identified below. Cite the assertions actually read and pinpoint any missing coverage.
3. Read `specs/001-ring-mcp-bridge/contracts/iteration-002-tools.schema.json` and `bridge/test/contract/public-contract.test.ts`. Check which tool shapes the tests compare with the plan. For `get_events` cursor and timestamp behavior, compare the schema and runtime contract with `bridge/src/core/managers/inquiry/events-read.test.ts`.

Rounds five and six already traced production code. The independent test and schema comparison is the outstanding work. State whether the timestamp finding is resolved, which requirements are covered and any specific gaps.

## Round six scope (historical)

Review the gaps that round five left in iteration 002. Use the iteration plan, tasks T041–T044, T048 and T051–T053 in `tasks.md`, and `contracts/iteration-002-tools.schema.json` as the acceptance criteria. Inspect the following four areas and their tests on the frozen tree.

1. Ring push intake and normalization. Follow a doorbell push through `bridge/src/connector/clients/push-listener/` and `bridge/src/connector/engines/normalize/normalize.ts`. Check identity and time handling against the corresponding listener and normalization tests.
2. Durability and recovery. Read `bridge/src/connector/access/outbox-store/outbox-store.ts`, `outbox-events.test.ts` and the relevant reconnect or resend assertions in `bridge/src/connector/managers/ingest/ingest.test.ts`. Check what survives a restart and which acknowledgement permits removal.
3. Subscription persistence and callback destinations. Read `bridge/src/core/access/subscriptions/subscriptions-store.ts`, `bridge/test/core-access/subscriptions-store.test.ts`, and `bridge/src/core/clients/delivery/callback-transport.ts` with its tests. Check subscription lifetime and destination validation on delivery.
4. Contract. Compare the covered behavior with the iteration requirements and the published event tools schema. Check the relevant assertions in `bridge/test/contract/public-contract.test.ts`. Record the test and code locations supporting each conclusion and identify any remaining gaps.

The camera pilot and the 13 core event-path files in earlier reports are background. This round's conclusions should address the four areas above.

## Round five scope (historical)

Trace a real `doorbell.ding` from Ring intake through the home connector and core to ChatGPT's signed webhook, then through the client's `get_events` read. Compare the production code and tests with iteration 002's plan, task acceptance criteria and tools contract. Start with these paths:

- `bridge/src/connector/engines/normalize`, `connector/managers/ingest` and `connector/access/outbox-store`: event identity, timestamps, durable enqueue, reconnect and catch-up.
- `bridge/src/core/clients/connector-link`, `core/engines/classify` and `core/access/event-log`: location policy, deduplication, transaction and acknowledgement order.
- `bridge/src/core/clients/delivery`, `core/access/subscriptions` and `core/clients/mcp-endpoint`: authorization, HIGH delivery, retries, and the event returned to each client on its cursor.
- `specs/001-ring-mcp-bridge/iterations/002/plan.md`, `specs/001-ring-mcp-bridge/tasks.md` and `contracts/iteration-002-tools.schema.json` under the feature directory: compare the implemented guarantees with the requirements and recorded pilot evidence.

Identify the actual files and tests examined, any unverified links in the path, and findings with source locations. The four private camera pilot files were already examined in round four.

## Status

The owner approved an allowance reset after the fourth round. Three of the four new rounds are used. The campaign is paused after round seven's partial report and human sign-off is pending.

## Round seven result, November 21

Claude independently verified the timestamp fallback in `f8dda18`, including the unit test of the fallback order and the ingest test of the persisted, schema-valid doorbell event. This resolves round six's timestamp finding. The [round-seven report](../../../../.specrew/review/authority/campaigns/cmp-001-ring-mcp-bridge-i002/runs/run-20261120-234231358-748d2ccb/report.md) also describes the cursor tests it inspected and suggests an optional read-side timestamp regression.

Claude found one minor gap (`finding-477fb977b10323f4`). The public contract test compared tool inputs with the iteration 001 plan only. Extending it to iteration 002 exposed a single difference in `get_events.limit`. The plan now declares the same maximum safe integer as the published input, 9007199254740991. The regression test failed before that correction and passed afterward. The server continues to cap each page at 200 events.

The report is partial. Claude did not assess T043, T048 and T051 against the plan and task acceptance criteria, including the outbox, callback transport, subscription and endpoint tests. One round remains in the allowance. The reviewed tree `b49ac6ed4699479402801750dcaab993862ed5cd` is pinned by the verified remote tag `specrew-reviewed/run-20261120-234231358-748d2ccb`.

## Round six result, November 21

Claude's [round-six report](../../../../.specrew/review/authority/campaigns/cmp-001-ring-mcp-bridge-i002/runs/run-20261120-225113497-9da5c772/report.md) records a passing governance check and inspection of eight production files covering push intake, normalization, outbox persistence and resend, subscription storage, and callback transport. Claude also read the review brief. It did not examine the tests, plan, task acceptance criteria, or public tools schema. Their comparison is the remaining gap in the requested independent review.

Claude reported one minor finding, `finding-d8ec3fba6e193215`. An out-of-range Ring timestamp could prevent an event from entering the outbox. The connector now checks each timestamp against the four-digit UTC year supported by the event schema. It tries the trigger time, the ding creation time and the eventito timestamp in order, then uses the home receipt time. Regression tests in `normalize.test.ts` and `ingest.test.ts` failed before the fix and passed after it. They verify fallback order and the schema-valid doorbell message in the SQLite outbox. The fix is ready for independent verification together with the remaining test and contract comparison. The two minor pilot findings from round four remain open.

The reviewed tree `8202d1f61e58e3e7aeb23bc9e485de2eef7827ab` is pinned by the verified remote tag `specrew-reviewed/run-20261120-225113497-9da5c772`. The automatic retry paused before invoking another reviewer.

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
