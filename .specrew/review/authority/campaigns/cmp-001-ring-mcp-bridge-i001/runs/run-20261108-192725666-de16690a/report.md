# Review Result

- **Campaign**: `cmp-001-ring-mcp-bridge-i001`
- **Run**: `run-20261108-192725666-de16690a`
- **Harness**: `codex-cli-file-primary`
- **Target digest**: `ae9551d43b8aecf14c9cc2ae3b9faadc20ff73b7`
- **Completion**: `complete`
- **Verdict**: `findings`
- **Runtime outcome**: `completed`
- **Currentness**: `current`
- **Can approve current snapshot**: `false`

## Summary

Completed risk-based static review of the frozen target, covering owner/OAuth authorization, connector authentication, durable ingestion and replay, state freshness, storage, secret handling, and public contracts. The controller's one declared governance command passed for this digest. No tests or builds were run in this reviewer session. Two state-reporting defects remain. Explicitly deferred future components were accounted for when assessing scope.

## Findings

| ID | Severity | Relevance | Location | Finding |
| --- | --- | --- | --- | --- |
| `finding-2a8fcf66cd72aa32` | minor | current | bridge/src/core/managers/inquiry/inquiry-manager.ts:310 | Preserve the observation time of camera data across heartbeats: [demoted to minor: no concrete failure scenario, so it cannot gate; reported as major by the reviewer] After the startup inventory reports a camera as 60% battery and online, let it become 5% and offline while the connector and Ring session stay healthy. Camera fields refresh only through RingApiAdapter.#currentCameras during an inventory read; Ingest.sendDue stops requesting inventories once the initial debt clears, and camera change notifications are deferred. HealthView.as_of nevertheless advances on every heartbeat, and reply() uses that time for the unchanged data. list_devices and get_overview can consequently report the old camera status as true at the latest heartbeat indefinitely, with no per-device observation time in those outputs. This violates FR-006 and conceals how old the battery/online evidence is. The documented deferral of camera push still requires truthful observation times. Derive data timestamps and freshness from actual observations, or refresh the affected data… |
| `finding-584f635f843d084b` | minor | current | bridge/src/connector/access/ring-adapter/ring-api-adapter.ts:499 | Refresh inventory when the alarm-device membership changes: [demoted to minor: no concrete failure scenario, so it cannot gate; reported as major by the reviewer] After the initial inventory is committed, onDevices handles an added alarm contact only by subscribing to it, and #watchDevice unconditionally discards its first current-data emission. A newly added contact that is already open therefore produces no device_state; the core's unknown-device inventory_request path is never reached until another device update occurs. Removals produce no notification at all, and removed subscriptions remain in watched. With healthy links and no periodic inventory reconciliation, list_devices/get_overview can omit the new open contact or retain a deleted sensor's old state until an unrelated inventory refresh or reconnect. Reconcile additions/removals from onDevices, trigger a fresh inventory, and release removed subscriptions. Suppress an initial data emission only when that device's state was actually included in the inventory. |

_This Markdown is a controller-generated projection. Authority is the sibling immutable `result.json`._