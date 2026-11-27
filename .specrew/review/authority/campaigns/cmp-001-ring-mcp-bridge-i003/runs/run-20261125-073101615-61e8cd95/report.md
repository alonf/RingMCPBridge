# Review Result

- **Campaign**: `cmp-001-ring-mcp-bridge-i003`
- **Run**: `run-20261125-073101615-61e8cd95`
- **Harness**: `claude-code-file-primary`
- **Target digest**: `5d66a1a0546696c072723ef6e4d20cdbe0d866fd`
- **Completion**: `complete`
- **Verdict**: `findings`
- **Runtime outcome**: `completed`
- **Currentness**: `current`
- **Can approve current snapshot**: `false`

## Summary

Risk-based static review of the iteration 003 media slice: staging and cleanup, grants, camera permissions, receiver download, MCP scope gating, owner settings, audit, migrations, issuer scopes and the Ring event probe. Scope gating, grant binding, withdrawal before first byte and staging cleanup read as sound. One major deviation from the approved Option B: an already authorized transfer is cut off mid-body by per-chunk reauthorization. One minor observability gap covers failures after response headers. The single controller verification command (specrew-governance) exited 0; it reports no test results, and no tests were run by this reviewer. Infra was only searched, not read in depth.

## Findings

| ID | Severity | Relevance | Location | Finding |
| --- | --- | --- | --- | --- |
| `finding-b8fb479855ea5e19` | minor | current | bridge/src/core/managers/media/media-handoff.ts:343 | An already authorized transfer is aborted mid-body on grant expiry or withdrawal: [demoted to minor: no concrete failure scenario, so it cannot gate; reported as major by the reviewer] The recorded human decision for Option B says an already authorized transfer may finish, and the plan says 'A transfer already authorized can finish; each subsequent GET or Range must recheck'. mediaDownload splits a response into 256 KiB chunks and calls MediaHandoff.read for each. read calls authorize unconditionally, including when firstChunk is false, and authorize rechecks the ticket's five-minute expiry, policy generation and approval. A clip (up to 32 MiB) whose GET began just before grant expiry, or is read by a slow receiver, throws MediaDenied in pull() after a 200/206 with a full Content-Length was sent, so the receiver gets a truncated body. Resuming with Range then fails because the grant has expired. Toggling an unrelated camera setting such as sound also changes the policy generation and cuts the transfer. The large-download test mocks read, and the scenario test only c… |
| `finding-4811edbb77d6ad7b` | minor | current | bridge/src/core/clients/web/media-download.ts:127 | Failures after the first download chunk are neither logged nor audited: The ReadableStream pull() calls nextChunk outside the try/catch that maps and records failures, because the Response has already been returned. A storage error, timeout or MediaDenied on any later chunk therefore errors the stream without media_download_failed being logged by this handler and without a denied or incomplete audit entry. The access log retains only the fetch 'allowed' entry written with the first chunk, so a truncated delivery cannot be distinguished from a complete one. Catch errors in pull, log the item id, record a denial where applicable, and rethrow. |

_This Markdown is a controller-generated projection. Authority is the sibling immutable `result.json`._