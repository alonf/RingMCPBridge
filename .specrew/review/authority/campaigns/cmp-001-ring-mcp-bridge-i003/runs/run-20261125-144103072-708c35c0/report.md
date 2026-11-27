# Review Result

- **Campaign**: `cmp-001-ring-mcp-bridge-i003`
- **Run**: `run-20261125-144103072-708c35c0`
- **Harness**: `claude-code-file-primary`
- **Target digest**: `02733dd5426857dd4c2757ce026ad1896e3f59ac`
- **Completion**: `complete`
- **Verdict**: `findings`
- **Runtime outcome**: `completed`
- **Currentness**: `current`
- **Can approve current snapshot**: `false`

## Summary

Risk-based static review of the iteration 003 implementation so far: media staging and cleanup, grants, receiver download, camera permissions and withdrawal, owner settings form, scope gating, event precedence, audit retention, migrations, shutdown, storage infrastructure and the Ring pilot media probe. Per-read approval checks, approval generations, receiver identity binding, stale-form detection, tombstones, the orphan sweep and T-SQL/SQLite handling read as consistent with Option B. Two minor issues found, no blocking or major ones. The plan leaves M01, M03 and M05 in progress and M06, F01, Q01, Q02, V01 and V02 planned; core.ts wires no eventMediaSource, so the live handoff is not yet enabled, which was not treated as a defect. The controller evidence joins one successful governance command and no unit or integration test results; this review ran no tests. Contract schema files, page templates and most test files were not opened in full.

## Findings

| ID | Severity | Relevance | Location | Finding |
| --- | --- | --- | --- | --- |
| `finding-5fdf134ce80eb26f` | minor | current | bridge/src/core/clients/mcp-endpoint/share-event-media.ts:104 | A cancelled share returns its photo/clip allowance while the core continues the provider download: EventMedia.stage deliberately keeps loading after the requester leaves: once the claim commits, the load and upload use only the shutdown and write-timeout signals. The tool handler passes ctx.mcpReq.signal and a 60 s timeout to media.share and calls allowance.release() for every error except MediaDenied, including the caller's own abort and that timeout. A client can therefore request a distinct event, disconnect after the claim, get its slot back and repeat. Each cancelled call can leave a provider download running (up to 32 MiB for a clip) that was not counted against the 20 clips or 60 photos an hour in FR-026. A later request that collects the item does consume a slot, but abandoned items never do, leaving only the 600 an hour request limit. Keep the slot when a claim has started work, or tie its release to the outcome of the staged work rather than to the caller's wait. This becomes reachable once an eventMediaSource is wired in production. |
| `finding-14b0264366d43025` | minor | current | bridge/src/core/clients/web/media-download.ts:213 | Denied media attempts are audited with the caller's connection signal, so a disconnect or shutdown can drop the record: Before streaming starts, all denial audits in mediaDownload (invalid token, missing or malformed grant, and the MediaDenied catch) use `signal`, which combines the request's abort, the download lifetime's shutdown abort and the 30 s deadline. MediaHandoff.share likewise writes its denied entry with the MCP request signal. If the caller disconnects, or the core starts shutting down, between the denial and the commit of the insert, the query layer aborts it and no media_access_log row is written. The download paths that catch it log media_audit_failed; DownloadLifetime waits for the request but cannot save an already aborted write. The mid-stream interruption path handles this case explicitly by using an independent AbortSignal.timeout and lifetime.track. Use the same independent bounded signal for pre-stream and share denials so the FR-035 media-access trail does not depend on the denied party staying connected. |

_This Markdown is a controller-generated projection. Authority is the sibling immutable `result.json`._