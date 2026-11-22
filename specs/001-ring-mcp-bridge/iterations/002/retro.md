# Retrospective: Iteration 002

**Schema**: v1
**Date**: 2026-11-22

## What Went Well

- A real doorbell press reached the connector in 403 ms and ChatGPT accepted the signed callback in 913 ms, within the 10-second SC-001 budget. Matching the event identifier across both systems let us measure the delivery path even though user-visible notification latency still needs its own measurement. [Pilot record](state.md#notes)
- The official private Ring app linked an account, listed devices and returned a JPEG for a search window wholly after linking. That experiment gives iteration 003 a working camera API path. Retrieving media for a specific detection through an MCP client is the next proof. [Pilot research](../../research.md)
- A failing regression test exposed a difference between the published and planned maximum for `get_events.limit`. The corrected comparison covers both iterations. The final reviewer confirmed it would detect another change. The same review identified two missing endpoint assertions. [Review handoff](review.md)

## What Didn't Go Well

- Several rounds inspected adjacent code and missed the requested assertions. Two later invocations produced no review. After the second, a tool-free CLI request exposed the reviewer's weekly usage limit. Once the limit reset, the same probe succeeded and round eleven completed both outstanding checks. [Review history](review-preparation.md)
- The final launcher lint fix came after the reviewed snapshot. Its compatibility test passed, yet the change and two handoff documents still needed an explicit partial-coverage decision. Recording review evidence, obtaining formal sign-off and closing the iteration each require distinct steps. [Partial-coverage decision](../../../../.specrew/review/signoff-gate/history/20261122T202220Z-1e36a489.json)
- Azure fired and resolved the health alert and the owner received both SMS messages. The enabled email receiver and the address-verification message did not establish alert email delivery. The seven-day soak, clock comparison and month-end bill also still lack their acceptance measurements. [Field checks](review.md#gap-ledger)

## Estimation Accuracy

The plan committed 33.75 story points against a capacity of 42. The estimates already included iteration 001's factor of about 1.8. None of the eleven tasks has a final actual in the plan. The evidence column records what can be established for each item. [Iteration plan](plan.md#tasks)

| Task | Estimated points | Actual effort or observed outcome |
| --- | ---: | --- |
| CP-08b, home intake | 6.3 | Points unrecorded. The connector now checkpoints each camera after a complete history scan. |
| CP-11b, core event path | 6.3 | Points unrecorded. Recovery-summary, health-event and retention tests passed. |
| CP-12, subscriptions and cursors | 1.8 | Points unrecorded. Review covered restart-safe independent cursors, gap-free pages and epoch changes. |
| CP-13, delivery | 3.6 | Points unrecorded. A real signed callback was accepted. The endpoint-test follow-ups are listed below. |
| CP-18, alert | 2.25 | Points unrecorded. SMS was verified. T056 remains open for email. |
| CP-20, official API discovery | 1.8 | Points unrecorded. Account linking, inventory and a stored snapshot were demonstrated. |
| CP-21b, live event timing | 1.8 | Points unrecorded. Webhook acceptance was measured. T049 still needs user-visible timing. |
| CP-MR, midpoint review | 1.8 | Points unrecorded. Four midpoint findings led to fixes. |
| CP-RV, final review | 3.6 | Points unrecorded. Round eleven completed the two outstanding checks. T059 quality evidence still needs reconciliation. |
| CP-RW, rework | 3.6 | The ledger allocated 2.5 points to T062/T063 and estimated about 1.0 for midpoint fixes. Later rework has no final point total. |
| CP-PJ, carried pilot checks | 0.9 | Points unrecorded. T061 carries the soak, clock and bill checks. |

## Phase Variance

The planned split was 3.6 points for discovery, 20.25 for implementation, 5.4 for review, 3.6 for rework and 0.9 for carried pilot work. Planning was outside the cap. Across the review campaign, 16 recorded attempts account for 88.7 minutes of controller runtime. Four produced complete reviews, five partial reviews and seven no review. These totals include preflight time and cover both midpoint and final review. The task ledger includes estimates for some fixes and gives no final effort for the people doing the work. A total point variance or velocity cannot be calculated from this record.

## Drift Summary

The [drift log](drift-log.md) records 23 decisions or resolutions. DRIFT-002-20 used part of the rework reserve for hub events and shared-home policy. DRIFT-002-22 separated per-camera catch-up progress from the cursor an MCP client uses to read stored events, corrected byte-bounded paging and added the VM update helper to provisioning. DRIFT-002-23 records the supported listen transports and the live alert criteria. The later review and field checks above retain their own evidence and follow-ups.

## Lessons Learned

1. Choose the observation that proves the requirement before a live test. Webhook acceptance, a visible notification, an email arriving, and a JPEG opened by a second client each need a different observer.
2. Give the reviewer a specific assertion to inspect and the outcome it should prove. The round-eleven brief led directly to the missing read-scope and unsubscribe assertions.
3. A public review tag exposes its reachable history before a feature branch is pushed. Inspect pilot notes, commit metadata, machine paths and artifacts before publishing the first tag. Keep raw household traces and service credentials in private storage.

## Improvement Actions

| Owner | When | Action and evidence of completion |
| --- | --- | --- |
| Implementer and reviewer | Before the next paid or limited review round | Run a small availability probe after any quota-related failure. Include acceptance criteria, test paths and the behavior each assertion proves in the brief. |
| Implementer | During iteration 003 subscription work | Test that a client without read scope cannot subscribe in either era. Through the endpoint, subscribe, verify a signed callback, unsubscribe and confirm delivery stops. |
| Implementer and owner | During iteration 003 field checks | Record user-visible notification latency separately, verify receipt of an alert email, collect soak and clock evidence, and compare the month-end bill with $30. |
| Implementer | Before camera acceptance | Use a real detection to request event-time media through MCP. Record the capture time and verify that the intended recipient can fetch the result with its grant. |
| Reviewer | At iteration closeout | Reconcile the 51 unused-field scan candidates against actual consumers and retain the individual dispositions. The review summary already documents a consumer for the first candidate. |

## Triage: Reviewer-Instruction Candidates

- **Promote** checking subscribe, deliver and unsubscribe through the public endpoint. The current endpoint tests can pass when unsubscribe returns successfully without removing a subscription.
- **Promote** comparing the planned tool inputs with the published contract whenever a tool is added.
- **Defer** camera download destination validation and removal-webhook replay tests to the camera work. Keep the oversized outbound webhook and two-client subscription restart tests in the delivery backlog. These four earlier findings remain open. [Finding history](review-preparation.md)

## Calibration Suggestion

Keep the 42-point cap as the planning baseline until actual effort can support a change. For iteration 003, the implementer should record an effort estimate at task completion and identify review or field-test time separately. The approximately 0.1 points left after midpoint allocations were a forecast before final rework. No unused reserve can be verified at closeout from that figure alone.

## Signals for Next Iteration

Keep the household filters page in 003. Plan sensor rules by type and camera rules per individual camera, with push, store-only and drop actions. Use the official API evidence to scope event-specific camera media. The family-recognition service remains a dependency for the named visitor announcement. The bridge-to-MCP media test can run independently.

On November 22, after retro approval, the implementer traced the 51 scanner rows and documented the quickstart evidence and remaining gaps. See the [closeout quality record](quality/quality-evidence.md).
