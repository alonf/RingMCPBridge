# Review Result

- **Campaign**: `cmp-001-ring-mcp-bridge-i001`
- **Run**: `run-20261109-235724885-f7a7e7cc`
- **Harness**: `codex-cli-file-primary`
- **Target digest**: `52df49e36aaa978bf75f647a82cdbf64c6b4aeb7`
- **Completion**: `complete`
- **Verdict**: `findings`
- **Runtime outcome**: `completed`
- **Currentness**: `current`
- **Can approve current snapshot**: `false`

## Summary

Completed risk-based inspection of the frozen implementation, covering host lifecycle, OAuth/Entra authorization, connector authentication and transport, state freshness, persistence and leases, secret handling, MCP contracts, and packaging/CI. Found one major shutdown defect and one minor overview-reporting defect. The controller's single declared governance command succeeded against the supplied digest. No tests, builds, or repository automation were run during this review.

## Findings

| ID | Severity | Relevance | Location | Finding |
| --- | --- | --- | --- | --- |
| `finding-cb0b2e46fa0fa805` | minor | current | bridge/src/host/core-service.ts:242 | Close connector WebSockets before awaiting HTTP server shutdown: [demoted to minor: no concrete failure scenario, so it cannot gate; reported as major by the reviewer] Stopping the core while a healthy home connector is connected can hang indefinitely. stop() awaits the HTTP server's close callback before calling linkServer.close(), but upgraded WebSocket connections remain open: closeAllConnections() explicitly excludes them, and the server's close callback waits for connections to end. The connector continues exchanging heartbeats, so its liveness timer does not break the wait. Consequently SIGTERM/SIGINT cannot reach core.stop(), lease release, or database cleanup without the peer disconnecting or the process being forcibly killed. Initiate HTTP shutdown, close the tracked connector links, and only then await server closure. Cover stopping the core while its connector is still connected; the existing WebSocket integration test stops the home first. This ordering follows the documented behavior of [HTTP closeAllConnections](https://nodejs.org/api/… |
| `finding-1463fff2d9874025` | minor | current | bridge/src/core/clients/mcp-endpoint/read-tools.ts:130 | Do not report truncated overview lists as complete home totals: When an overview exceeds the token budget, summary-engine.ts slices each category list to a shared cap. This text summary then uses those shortened arrays' lengths as the number of open contacts, active motion sensors, offline devices, and low batteries in the home. Unlike list_devices, the overview retains neither full totals nor a truncation indicator. A sufficiently large home therefore receives understated counts with no indication that additional problem devices were omitted. The documented policy permits shortening lists, but these shortened lengths are not home totals. Preserve the actual totals and indicate truncation, or explicitly describe the counts as only the returned subset. Include the oversized-home case in the MCP summary coverage. |

_This Markdown is a controller-generated projection. Authority is the sibling immutable `result.json`._