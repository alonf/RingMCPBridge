# Review Result

- **Campaign**: `cmp-001-ring-mcp-bridge-i001`
- **Run**: `run-20261115-114230329-89ed980d`
- **Harness**: `codex-cli-file-primary`
- **Target digest**: `057ff23dbe11666ed9008585d246053c15ffe06a`
- **Completion**: `complete`
- **Verdict**: `findings`
- **Runtime outcome**: `completed`
- **Currentness**: `current`
- **Can approve current snapshot**: `false`

## Summary

Completed risk-based inspection of the implemented iteration 001 scope, including authentication and enrollment, MCP contracts and reads, Ring integration, reconnect and freshness behavior, state ordering, persistence, secrets, host lifecycle, and deployment configuration. Found two recovery defects. The controller's sole declared governance verification succeeded for the frozen digest. No tests or builds were run in this reviewer session. Features explicitly deferred to later iterations were not treated as missing implementation.

## Findings

| ID | Severity | Relevance | Location | Finding |
| --- | --- | --- | --- | --- |
| `finding-48510b726817b94a` | minor | current | bridge/src/connector/access/ring-adapter/ring-api-adapter.ts:683 | Keep data stale until a Ring reconnect has refreshed device state: [demoted to minor: no concrete failure scenario, so it cannot gate; reported as major by the reviewer] For an established connector-to-core session, let a previously healthy Ring location's live connection remain closed beyond the grace period, change a contact while disconnected, then reopen the connection before its device list arrives. This branch immediately removes the location from connectionsClosed and can set the Ring session to ok. HubSessions does not prevent this for previously healthy hubs: it tracks only hubs already reported non-online, and its reopened handler only advances those existing entries. Ingest ignores session changes, so this reconnect creates no inventory debt. The next heartbeat can therefore carry ring_session=ok and inventory_owed_after=null; afterHeartbeat removes stale_since and advances the envelope's as_of, although State still contains the pre-outage contact/alarm values. A delayed or missing device list makes get_overview advertise those values as fr… |
| `finding-27dcc765e3cb0213` | minor | current | bridge/src/host/main.ts:151 | Wire stuck Ring connection recovery into all-in-one mode: [demoted to minor: no concrete failure scenario, so it cannot gate; reported as major by the reviewer] The all-in-one startup calls openRingHome without its onConnectionStuck callback. The standalone connector supplies that callback and turns it into a fatal error, but RingApiAdapter.followStuck returns without scheduling recovery when the callback is absent. Consequently, the known Ring reconnect-ticket failure documented in DRIFT-001-35 leaves mode A running indefinitely with a closed alarm connection even after Ring's web API recovers. The process-wide unhandledRejection handler logs and continues, so it does not provide a fallback restart either. Subsequent local MCP reads remain stale until the owner manually restarts the process. Pass the same fatal recovery callback when opening the production all-in-one home, or provide an equivalent bounded reconnect path, and cover this mode in the recovery test. |

_This Markdown is a controller-generated projection. Authority is the sibling immutable `result.json`._