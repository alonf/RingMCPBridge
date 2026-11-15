# Review Result

- **Campaign**: `cmp-001-ring-mcp-bridge-i001`
- **Run**: `run-20261108-023852940-d48c0a41`
- **Harness**: `codex-cli-file-primary`
- **Target digest**: `4ed91f802a5863e7ae2c6a296b0c965617f496bf`
- **Completion**: `complete`
- **Verdict**: `findings`
- **Runtime outcome**: `completed`
- **Currentness**: `current`
- **Can approve current snapshot**: `false`

## Summary

Completed risk-based inspection of the frozen implemented target, covering connector enrollment and authentication, link ordering and reconnects, Ring ingestion, durable state and outbox handling, inquiry freshness, secrets, database access, contracts, and selected tests. Found two defects that can present old state as current. Explicitly deferred implementation and documented pilot limitations were considered when assessing scope. The controller's single declared governance verification succeeded for this digest. The reviewer ran no tests, builds, installers, or repository automation.

## Findings

| ID | Severity | Relevance | Location | Finding |
| --- | --- | --- | --- | --- |
| `finding-06b1a3eb91b2d421` | minor | current | bridge/src/connector/managers/ingest/ingest.ts:329 | Keep state stale while a failed outbox write leaves a refresh outstanding: [demoted to minor: no concrete failure scenario, so it cannot gate; reported as major by the reviewer] After an established session has delivered its initial inventory, let an outbox append fail because the connector disk is full, then change a door's state. #stateNotQueued sets only the connector-local #inventoryOwed flag. Each retry can keep failing while sendHeartbeat still reports ring_session='ok'; reading the outbox depth can succeed and return zero even though writes fail. Event passes these heartbeats to afterHeartbeat, which ignores error_counts and has no indication of this new refresh obligation. With the original session refresh already cleared, Inquiry therefore continues returning the old door state as 'cached', with as_of advanced by every heartbeat, for the entire storage outage. Retrying the inventory every ten seconds does not fix this false freshness while writes remain unavailable. Propagate an unresolved state-delivery failure to the core and retain stale status un… |
| `finding-1fad5ab627b8c052` | minor | current | bridge/src/core/clients/connector-link/core-session.ts:251 | Preserve heartbeat arrival time before queuing intake work: [demoted to minor: no concrete failure scenario, so it cannot gate; reported as major by the reviewer] CoreSession queues each frame behind previous intake operations at #arrived, but records no receive timestamp. EventManager.heartbeat takes clock.now() only when that queued frame finally reaches it (event-manager.ts:149). A slow inventory transaction or backlog can therefore hold a heartbeat for longer than the two-minute freshness threshold and subsequently make it appear newly received. If application heartbeats stop while the WebSocket remains open and answers transport pings, draining that old heartbeat clears stale_since and restarts the freshness window despite no recent heartbeat having arrived. Inquiry also reports the processing time as the time the data was true. The frame-count limit does not bound this delay, and #toEvent awaits the intake without an elapsed-time limit. Capture a core-clock receive timestamp at frame arrival and carry it into Event/Health, so queued work … |

_This Markdown is a controller-generated projection. Authority is the sibling immutable `result.json`._