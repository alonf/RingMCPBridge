# Iteration 002 review

## Status

Four of four rounds have been used. Claude returned a partial report for round four. Specrew marked the verdict incomplete and paused the campaign. Human sign-off is pending.

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
