# Review Result

- **Campaign**: `cmp-001-ring-mcp-bridge-i003`
- **Run**: `run-20261125-141732783-c691cfed`
- **Harness**: `claude-code-file-primary`
- **Target digest**: `6ae94404d49f293d9155f5168fcaf9fdd62eb6d7`
- **Completion**: `complete`
- **Verdict**: `findings`
- **Runtime outcome**: `completed`
- **Currentness**: `current`
- **Can approve current snapshot**: `false`

## Summary

Risk-based static review centred on the iteration 003 media handoff: staging, cleanup, object stores, grants, approvals, settings form, receiver download, audits, shutdown, token scopes, event policy, SQL layer, infra storage and the Ring pilot. No blocking or major defect was established. Grants are bound to item, receiver, policy generation and approval generation and are rechecked just before the first bytes; withdrawal, reapproval, stale forms, delete-now and interrupted audits are handled consistently in the code read. Two minor findings and one note are reported. Limits: no tests were run by this reviewer. The controller evidence holds one passing command, governance validation (exit 0, output suppressed); it contains no unit, integration, lint or type-check record, so it is not evidence of runtime behaviour. Connector-side code outside the media path and features still planned (M06, F01, Q01, Q02, V01, V02) were not reviewed in depth.

## Findings

| ID | Severity | Relevance | Location | Finding |
| --- | --- | --- | --- | --- |
| `finding-2a0e3bd32ef36eed` | minor | current | bridge/src/core/clients/web/media-download.ts:208; bridge/src/core/managers/media/media-handoff.ts:315 | Denied fetches of withdrawn, deleted or expired items leave no audit row: mediaDownload's outer catch audits a MediaDenied by calling auditFetch without the item it may already have resolved. MediaHandoff.auditFetch then looks the item up with media.ready(), which returns only rows that are ready and unexpired, and silently returns when there is none. Two cases lose the record: (1) authorize succeeds, the owner's delete-now or expiry lands before the first read, media.read returns undefined and MediaDenied is raised; the item is known but the denial is not written; (2) a receiver retries a grant for an item whose row is now 'deleting' or expired but still present. The comment says attempts against known items are audited, and interruptions after headers correctly pass the known item. No media is disclosed, but the denial that shows delete-now taking effect is missing from the FR-035 media-access trail. Keep the authorized item in scope for the catch path and look up known items regardless of status when auditing denials. |
| `finding-85d872b1cdf116ab` | minor | current | bridge/src/host/core-assembly.ts:129 | The background media sweep has no deadline, so one stalled storage call stops all later sweeps: sweepMedia skips a run while the previous promise is pending and passes media.sweep only the shutdown signal. Every Blob list or delete inside collect therefore has no operation deadline of its own, and BlobMediaObjects configures no try timeout. If one storage request never settles, 'sweep' stays set and no later sweep runs until restart: expired objects are not removed at the configured retention (FR-021), delete-now cleanup reported as pending is not retried, and expired pending claims are not released, so shares of those events keep answering pending. Reads stay protected because ready() checks status and expires_at, hence minor. Other media paths bound their work (write timeout, 10 s failed-write cleanup, 60 s delete-now). Combine cleanup.signal with a per-sweep timeout; collect already tolerates an abort and resumes from durable rows. |
| `finding-9aac01541e67437d` | note | current | bridge/src/host/core.ts:64; bridge/src/host/core-service.ts:275 | The production core wires no event media source, so the handoff cannot run outside tests: startCore passes mediaObjects but no eventMediaSource, and startCoreService registers share_event_media only when a source is present. The only supplier found in the bridge is the test fixture and scenario. Production therefore shows the camera permission screen and accepts approvals, while no agent can request a handoff. This matches the plan, where M01, M03 and M05 are still in progress; it is recorded so that the passing synthetic scenario is not read as a deployed vertical slice. |

_This Markdown is a controller-generated projection. Authority is the sibling immutable `result.json`._