# Review Result

- **Campaign**: `cmp-001-ring-mcp-bridge-i003`
- **Run**: `run-20261123-234505006-50304c7e`
- **Harness**: `claude-code-file-primary`
- **Target digest**: `06bbfd9019208dc9c225dfef314321fd3243f88f`
- **Completion**: `partial`
- **Verdict**: `incomplete`
- **Runtime outcome**: `completed`
- **Currentness**: `current`
- **Can approve current snapshot**: `false`

## Summary

Static review focused on iteration 003 media: staging, grants, approvals, withdrawal, audit, download, MCP sharing, owner settings, event writing, pilot media and their main tests. No blocking defect was established in grant binding, withdrawal rechecks, staging publication or delete-now. Five minor findings. Partial because one planned high-risk check is unfinished: whether a media-only token can receive household events through subscriptions/listen depends on the MCP SDK, whose source is absent from the frozen workspace, and no in-repo test covering it was found. Most infra, delivery, the connector outside Ingest, page rendering and the hardening records were also not read. Controller evidence contains one successful command, specrew-governance; it has no test result and its output was suppressed, so it is not evidence that tests, lint or schema checks pass. Nothing was executed by the reviewer.

## Findings

| ID | Severity | Relevance | Location | Finding |
| --- | --- | --- | --- | --- |
| `finding-7c5a1c3c54291981` | minor | current | bridge/src/core/clients/mcp-endpoint/mcp-endpoint.ts:285 | Media-only tokens reach the shared SDK handler without a local guard on subscriptions/listen: When media is wired, #serve admits POSTs from a token with media but not read. The handler is shared, and its bus publishes every eligible ring/event payload. For such a token `events` is undefined, so any event-stream response is returned raw, bypassing ListenStreams and its stream cap, token expiry and revocation checks. The only apparent protection against receiving events is that the per-request server does not register the resource or resources.subscribe, which relies on the SDK narrowing subscriptions by capability. The SDK source is not in the workspace, so an actual event leak is NOT established. Refuse the listen method for tokens lacking read, or wrap every stream, and add a negative test with a media-only token: the searched mcp-endpoint tests contain no media case. Production core.ts supplies no eventMediaSource, so this path is currently reachable only when a source is injected. |
| `finding-01169edfb5ea92e8` | minor | current | bridge/src/core/clients/web/media-download.ts:81 | Concurrent media downloads are not bounded and each buffers the whole range: Each GET reads the requested range fully into memory, up to 32 MiB for a clip, before responding. The only local limit is readsPerHour per receiver (600 by default per FR-026), with no concurrency or total-byte limit. One approved receiver issuing parallel full GETs can make the core allocate many 32 MiB buffers simultaneously and threaten the process that also carries alarm events. Add a small concurrent-download limit or stream in bounded chunks. |
| `finding-2073e9ef6959cadb` | minor | current | bridge/src/core/clients/web/media-download.ts:54 | Unauthenticated traffic can replace a receiver's 401 with 429: All missing or invalid tokens share the single bucket 'anonymous', checked before the 401 is returned. Any unauthenticated caller using a UUID-shaped item path can exhaust it. A legitimate receiver with an expired token then gets 429 with Retry-After of up to an hour and no WWW-Authenticate challenge, so it is not told to refresh and can miss the five-minute grant. Return the 401 regardless of the bucket, and use the bucket only to bound denied-audit writes. |
| `finding-71e84fcbfc877f53` | minor | current | bridge/src/core/access/settings/settings-store.ts:254 | Approvals removed when an agent loses media scope are not audited: seedAgents deletes camera_media_approval rows for agents removed from configuration or no longer holding media, but writes no owner_media_change record. MediaPermissions.save records every approval removal, and FR-035 requires audit of configuration changes. These withdrawals therefore disappear from the approval history. Record each deleted approval in the same transaction. The approval row stores only a hashed camera_key, so home and camera identity must first be made recoverable. |
| `finding-af18573f87260a17` | minor | current | bridge/dev/ring-pilot/snapshot.ts:125 | Pilot snapshot redirect accepts any HTTPS host: The plan's M02/M03 acceptance row requires validating upstream media destinations on redirects. fetchItem in event-media.ts restricts redirect hosts and ports, but downloadSnapshot checks only scheme and user information before fetching, so an unexpected Location can direct the home computer to an arbitrary HTTPS destination, including a private one. The Ring bearer token is not sent on this request, and only a malformed or hostile Ring response triggers it. Share the destination check from event-media.ts. |

_This Markdown is a controller-generated projection. Authority is the sibling immutable `result.json`._