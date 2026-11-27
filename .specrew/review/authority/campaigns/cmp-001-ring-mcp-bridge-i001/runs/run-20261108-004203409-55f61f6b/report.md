# Review Result

- **Campaign**: `cmp-001-ring-mcp-bridge-i001`
- **Run**: `run-20261108-004203409-55f61f6b`
- **Harness**: `codex-cli-file-primary`
- **Target digest**: `4c56875665fc0db66bc463a0d6e7a704772fb9a3`
- **Completion**: `complete`
- **Verdict**: `findings`
- **Runtime outcome**: `completed`
- **Currentness**: `current`
- **Can approve current snapshot**: `false`

## Summary

Completed risk-based inspection of the implemented connector, enrollment and authentication boundaries, link transport, durable outbox, SQL persistence, state ordering, freshness, inquiry contracts, secret handling, and verification configuration, with design records and selected tests checked for context. Found two major correctness issues in reconnect freshness and enrollment replacement. The controller's one declared governance command succeeded for the frozen digest. No tests, builds, or repository automation were run during this review; planned later components and explicitly recorded carry-forwards were distinguished from defects in implemented code.

## Findings

| ID | Severity | Relevance | Location | Finding |
| --- | --- | --- | --- | --- |
| `finding-fa5a9c1e3bc9d082` | minor | current | bridge/src/connector/managers/ingest/ingest.ts:261 | Do not let cached location-change inventories satisfy the reconnect refresh: [demoted to minor: no concrete failure scenario, so it cannot gate; reported as major by the reviewer] After a core-link reconnect, sessionOpened starts a full Ring read while retaining the previous #view. If an alarm-mode/location change arrives before that read completes, #received queues an inventory from that old view and #composingFor stamps it with the new session ID. #writeChange can send it immediately because the Ring read is outside the outbox queue. EventManager.inventory then clears refresh_owed_since solely because the IDs match (event-manager.ts:119), although the session's fresh read has not completed. For example, a camera that went offline during the gap can still be reported from the previous view with freshness='cached' and the new link's timestamp while the refresh is pending. Bind the refresh marker to a full read completed for the relevant session; a location-change snapshot of an earlier view must not discharge that requirement. Cover a location change during a d… |
| `finding-cf3083c13eb9e49d` | minor | current | bridge/src/core/clients/connector-link/core-session.ts:351 | Fence State ownership against a delayed active-key check from an older enrollment: [demoted to minor: no concrete failure scenario, so it cannot gate; reported as major by the reviewer] The final active-key lookup and homeSessionOpened claim are separate asynchronous operations. With the pooled T-SQL driver, key A's lookup can read 'active' before the owner approves B, but resolve after B has opened and claimed State. A then proceeds through this code and EventManager.homeSessionOpened unconditionally claims A, resets versions, and replaces #currentKey. ConnectorLink only replaces sessions having the same key, so B stays connected. When A's periodic check finally detects revocation and closes A, nothing restores B's claim: B's inventories and device changes are acknowledged as not_current and discarded, and its heartbeats are ignored until B reconnects. Order the active-enrollment decision and State claim together, or carry a monotonic enrollment generation that prevents an older claim from displacing a newer one. Cover a delayed final key-check result arriving after… |

_This Markdown is a controller-generated projection. Authority is the sibling immutable `result.json`._