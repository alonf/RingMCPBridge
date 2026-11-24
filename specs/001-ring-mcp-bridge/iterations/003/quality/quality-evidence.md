# Quality Evidence: Iteration 003

**Profile Ref**: `quality-profile.custom-composition.v1`
**Preset Refs**: Bounded custom composition for TypeScript, the two SQL dialects, private media storage and owner settings.
**Findings Ref**: `specs/001-ring-mcp-bridge/iterations/003/quality/mechanical-findings.json`
**Reviewed By**: Claude reviewed the media handoff checkpoint through `c34b962`. Iteration-wide review remains open.
**Reviewed At**: 2026-11-23 (checkpoint)

## Gate Matrix

| Gate | Requirement | Evidence Source | Status | Exception |
| --- | --- | --- | --- | --- |
| `dead-field` | mechanical quality bar, unused-state hygiene | `specs/001-ring-mcp-bridge/iterations/003/quality/mechanical-findings.json` | pending iteration-wide scan | The scaffold predates implementation |
| `anti-pattern` | mechanical quality bar, deterministic anti-pattern scan | `specs/001-ring-mcp-bridge/iterations/003/quality/mechanical-findings.json` | pending iteration-wide scan | The scaffold predates implementation |
| `test-integrity` | mechanical quality bar, assertion-driven tests | `specs/001-ring-mcp-bridge/iterations/003/quality/mechanical-findings.json` | pending iteration-wide scan | The scaffold predates implementation |
| `stack-tooling-evidence` | stack tooling evidence | `specs/001-ring-mcp-bridge/iterations/003/quality/quality-evidence.md` | exercised at media checkpoint | See the verification record below |
| `quality-lens-review` | quality-lens review | `specs/001-ring-mcp-bridge/iterations/003/quality/quality-evidence.md` | checkpoint reviewed | Whole-iteration review remains open |

## Recorded-event receiver pilot · 23 November 2026

A local hybrid core accepted an SDK call to `share_event_media` for a previously captured Ring detection. The pilot replayed its official household, camera, event and capture times from the private manifest. A separate receiver process presented its own bridge OAuth access token and the item grant. The JPEG and MP4 matched the source lengths and SHA-256 digests. The clip supported byte-range reads. The caller’s credential failed at the receiver endpoint. Withdrawal denied the next range request, and reapproval required a new grant. Both clients linked through the real bridge issuer with a local Entra stand-in. [Reproduction](../../../quickstart.md#iteration-003-acceptance-run-planned)

The approved household settings screen passed browser checks at three widths in both themes. It persisted a single service approval covering photos and clips for the selected camera. The database tests checked that another camera and another service retained their settings.

**Open field checks.** The pilot supplied the recorded event metadata and media source locally. The hybrid core still needs a trusted source that resolves a new connector detection to the matching official Ring event. The existing connector derives camera IDs from the community library and adds a kind suffix to its event IDs. The private official API sample used opaque identifiers. A verified mapping or ingestion of the official event identity is required before treating the deployed callback path as working. T064 still needs observed playback with sound in ChatGPT and Claude. No deployment or live household permission change was part of this run.

## Media handoff review fixes · 24 November 2026

The separate receiver scenario exercises per-agent clip and photo limits, stable requester identity, denied fetches, and identifier-only audit records after deletion. Cached media remains usable without a source. A missing representation, absent source, expired event, or oversized representation returns a terminal miss. A temporary provider failure returns a retryable error and an operational log entry.

The owner can review all approvals, add or remove services, cancel unsaved edits, select an event action for forwarded person detections and delete cached photos and clips. Tests cover owner-session, origin and form-token checks, confirmation, deletion through the running admin route, and the effect of the saved event action on storage and push. SQLite and SQL Server exercise additive migrations. Existing audit rows retain the historical identifiers recorded at the time.

Product fixes are in `787e37d`. The full browser suite passed 138 cases across six viewport/theme combinations. The separate SQL Server, SQLite and Azurite run passed 81 tests with three skips. Type checking and the dependency rules passed.

The [hardening record](hardening-gate.md) identifies the independent review and the before-implement authorization. The iteration plan records task progress. The generated state summary awaits reconciliation at the next authorized boundary. [Drift log](../drift-log.md)

## Second media handoff review · 24 November 2026

The MCP scenario repeats a pending clip request 21 times and then obtains the clip. The reply gives a ten-second retry interval. Share attempts and receiver downloads have separate per-client request limits. An over-limit download returns HTTP 429 before reading the item. An authenticated request for an unknown item leaves the access log unchanged.

Camera policy changes, receiving-service approvals and withdrawals, and owner-requested cache deletion write a configuration audit row in the same transaction as the change. The audit keeps identifiers and policy settings for 365 days. The owner-page tests exercise a rejected shared-household preference, an inventory lookup failure before saving, an unconfirmed write, and object storage failure after deletion has already withdrawn access.

A core configured with storage alone omits `share_event_media` from its MCP tool list. The production milestone remains open until a fresh Ring detection resolves to media for the same household, camera and event. Recorded-event replay exercises that flow locally.

## Third media handoff review · 24 November 2026

The media-only OAuth scenario exercises the running MCP endpoint with event delivery enabled. Before the fix, the listen request returned HTTP 200. The test did not establish that any household payload was delivered. The endpoint now inspects the bounded JSON-RPC body before handing it to the SDK. A media-only client can list its sharing tool, while listening and resource subscription return HTTP 403 with the required read scope.

Receiver GETs read at most 256 KiB per storage operation as the client consumes the body. Cancellation stops further reads. Each chunk rechecks the item grant before delivery. Exhaustion of the anonymous audit allowance preserves the HTTP 401 bearer challenge.

Configuration-driven withdrawals record the affected receiver and camera in the deletion transaction. An older approval can be identified by an exact camera hash match against inventory, media or audit history. A vanished camera retains its original hash in the withdrawal record. Both pilot media paths validate a signed download destination before contacting it.
