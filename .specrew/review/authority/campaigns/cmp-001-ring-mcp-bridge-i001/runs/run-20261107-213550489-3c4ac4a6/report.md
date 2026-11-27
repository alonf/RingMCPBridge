# Review Result

- **Campaign**: `cmp-001-ring-mcp-bridge-i001`
- **Run**: `run-20261107-213550489-3c4ac4a6`
- **Harness**: `codex-cli-file-primary`
- **Target digest**: `b662983cadd374abdcc0cd209029527bb7f170f4`
- **Completion**: `complete`
- **Verdict**: `findings`
- **Runtime outcome**: `completed`
- **Currentness**: `current`
- **Can approve current snapshot**: `false`

## Summary

Completed risk-based static review of the frozen target, covering implemented enrollment and authentication, link transport and replay, persistence and migrations, Ring integration, inquiry freshness, secrets and logging, public contracts, and CI configuration, with targeted test inspection. Found three major state-correctness defects. The controller's single declared governance verification command passed for the supplied digest. No tests or builds were run in this reviewer session. Planned, unimplemented iteration work was distinguished from defects in existing code.

## Findings

| ID | Severity | Relevance | Location | Finding |
| --- | --- | --- | --- | --- |
| `finding-2a323ba3d83dee68` | minor | current | bridge/src/core/access/state/state-store.ts:478 | Replayed inventories can restore devices and locations that newer snapshots removed: [demoted to minor: no concrete failure scenario, so it cannot gate; reported as major by the reviewer] applySnapshot upserts every listed entry before reconciling removals. onlyIfNewer protects an existing row, but a deleted row has no retained version and is inserted unconditionally. For example, apply inventory A containing a device, then newer inventory B omitting it, then resend A after an acknowledgement or commit failure: the removed device is inserted again with A's old state. The same applies to removed locations. At-least-once delivery explicitly allows these retries, and B may already have been acknowledged, leaving the resurrected entry until another fresh inventory. Preserve a per-connector snapshot/deletion watermark or tombstones so obsolete inventories cannot recreate removed entries. Cover A/B/A replay after deletion on both store dialects; the existing older-inventory tests check removal and updates, but not reinsertion after deletion. |
| `finding-e5a0a081c826e3cc` | minor | current | bridge/src/core/access/state/state-store.ts:480 | An empty full inventory never removes the previously stored home: [demoted to minor: no concrete failure scenario, so it cannot gate; reported as major by the reviewer] A valid inventory with locations=[] and devices=[] makes lowestVersion return undefined, so applySnapshot immediately returns removed:0 without reconciling any existing rows. This occurs, for example, when the connector restarts after the account's last location was removed. Event reports the inventory applied and Connector Link acknowledges it, while all previously owned locations and devices remain available through Inquiry. Subsequent healthy heartbeats can keep this obsolete home marked cached indefinitely. Give each full snapshot an ordering version independent of its entries and use it to reconcile an empty snapshot safely, while still rejecting older empty snapshots. |
| `finding-82c7d7e6d55e3b8d` | minor | current | bridge/src/core/engines/health/health-engine.ts:150 | Reconnect marks old device state fresh before the new inventory commits: [demoted to minor: no concrete failure scenario, so it cannot gate; reported as major by the reviewer] homeUp clears stale_since and advances as_of on a signed session opening, while retaining the previous ring_session_status. Event calls this before hello_ok, and Ingest only reads and sends the fresh inventory afterwards. If the previous Ring status was ok, a home that was offline for minutes therefore changes immediately from stale to cached even when its new inventory is delayed or fails. Inquiry's reply uses only this health timestamp, so an old contact/alarm state is presented as true at the reconnection time. Heartbeats also clear staleness without establishing that pending state reached the core. Keep transport liveness separate from data freshness and retain the stale marker until the current session's refreshed state has committed; cover reads during a held or failed reconnect inventory. |

_This Markdown is a controller-generated projection. Authority is the sibling immutable `result.json`._