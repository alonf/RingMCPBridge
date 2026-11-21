# Review: Iteration 002

**Schema**: v1
**Reviewed**: 2026-11-22
**Overall Verdict**: accepted

The owner accepted the findings on the frozen tree `94a77c9604847dd4adb7d81bae5f4636b714e709`. The sign-off applies to the reviewed software. Open field measurements retain their original criteria. [Sign-off decision](../../../../.specrew/review/signoff-gate/history/20261121T225458Z-83ce20f7.json)

## Task Verdicts

| Task | Requirement | Verdict | Notes |
| ---- | ----------- | ------- | ----- |
| CP-08b | FR-008, FR-013, FR-026, FR-033, FR-042, FR-046 | pass | Durable outbox, acknowledgements, retry windows and restart were checked in round eight. Round seven verified timestamp fallback. |
| CP-11b | FR-005, FR-008, FR-009, FR-013, FR-014, FR-015, FR-034 | pass | Round five traced classification, deduplication, the transaction and acknowledgement. The implementation and test evidence are linked in the review preparation. |
| CP-12 | FR-010, FR-011, FR-026, FR-030, FR-047, FR-048 | pass | Round eight checked independent, restart-safe cursors and epoch changes. Round eleven confirmed the get_events schema comparison. A two-client subscription restart test remains open. |
| CP-13 | FR-010, FR-012, FR-030, FR-033 | pass | Signed delivery, retries and destination checks were reviewed. The endpoint test gaps accepted at round eleven are listed below. |
| CP-18 | FR-043 | pass | Accepted with the outstanding field check deferred. Azure fired and resolved the health alert. SMS arrived. T056 stays open until the alert email is received. |
| CP-20 | TG-004 | pass | The official private app linked successfully, listed five devices and returned a JPEG for a time window after linking. Production MCP media delivery is iteration 003 work. |
| CP-21b | FR-010, FR-012 | pass | Accepted for the measured callback path. The physical doorbell press reached the connector in 403 ms and ChatGPT accepted the callback in 913 ms. The owner observed the notification. Separate UI stopwatch samples remain outstanding. |
| CP-MR | FR-005, FR-008, FR-009, FR-010, FR-011, FR-012, FR-013, FR-014, FR-015, FR-026, FR-030, FR-033, FR-034, FR-042, FR-043, FR-046, FR-047, FR-048 | pass | T050 records the independent midpoint review. Its findings and subsequent rework are recorded in the drift log. |
| CP-RV | FR-005, FR-008, FR-009, FR-010, FR-011, FR-012, FR-013, FR-014, FR-015, FR-026, FR-030, FR-033, FR-034, FR-042, FR-043, FR-046, FR-047, FR-048 | pass | Claude completed the final two checks in round eleven. On November 22 the owner accepted the remaining round-eleven findings and Specrew verified the exact snapshot. |
| CP-RW | FR-005, FR-008, FR-009, FR-010, FR-011, FR-012, FR-013, FR-014, FR-015, FR-026, FR-030, FR-033, FR-034, FR-042, FR-043, FR-046, FR-047, FR-048 | pass | The timestamp and public contract corrections have regression tests. The earlier round-four and round-eight follow-ups remain tracked in review-preparation.md. |
| CP-PJ | FR-042 | pass | The owner accepted deferral of this task. T061 carries the seven-day unattended run, clock comparison and month-end bill against the $30 ceiling into 003. |

<!-- SPECREW-REVIEW-EVIDENCE: run-20261121-213350389-0f2fa4c7 -->

## Gap Ledger

- **fixed-now** — The timestamp fallback and the planned-versus-published `get_events` comparison now have regression tests. Rounds seven and eleven verified the fixes.
- **deferred** — Test a subscription request without read scope and exercise signed delivery before and after unsubscribe through the endpoint. The owner accepted these two minor round-eleven findings on November 22. See [the defer entry in .squad/decisions.md](../../../../.squad/decisions.md#iteration-002-round-eleven-subscription-test-follow-ups). [Recorded decision](../../../../.specrew/review/authority/campaigns/cmp-001-ring-mcp-bridge-i002/dispositions/run-20261121-213350389-0f2fa4c7/disposition-f1b487d364e8d928e773.json)
- **deferred** — The owner carried outstanding pilot measurements into 003 on November 20. T049 still distinguishes callback acceptance from user-visible latency. T056 requires alert email delivery. T061 requires the seven-day soak, clock check and month-end bill. See [the defer entry in .squad/decisions.md](../../../../.squad/decisions.md#iteration-002-pilot-checks-carried-to-003). [Pilot evidence](state.md#notes)

## Notes

The regression run after the contract correction recorded 1,634 passing tests and 164 skipped. Claude independently inspected the contract and endpoint assertions in [round eleven](../../../../.specrew/review/authority/campaigns/cmp-001-ring-mcp-bridge-i002/runs/run-20261121-213350389-0f2fa4c7/report.md).

Earlier open findings remain in the [review preparation](review-preparation.md). Round four covered the camera pilot's signed-download destination and integration-removal replay. Round eight identified missing tests for oversized outbound webhooks and independent subscription state after restart. Neither pair was re-examined in round eleven.

T059's separate quality checklist still labels its gates as planned. The mechanical scan recorded 51 candidates under the unused WebSocket field rule. For example, the source reads `LINK_CLOSE_REASONS.keyNotEnrolled` in both the home and core sessions. That example rules out one candidate. The remaining entries still need individual disposition before claiming the quality checklist is complete. [Quality checklist](quality/quality-evidence.md) · [Scan results](quality/mechanical-findings.json)
