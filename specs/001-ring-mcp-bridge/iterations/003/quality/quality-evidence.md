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
