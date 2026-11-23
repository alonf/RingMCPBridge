# Quality Evidence: Iteration 003

**Profile Ref**: `quality-profile.custom-composition.v1`
**Preset Refs**: Bounded custom composition for TypeScript, the two SQL dialects, private media storage and owner settings.
**Findings Ref**: `specs/001-ring-mcp-bridge/iterations/003/quality/mechanical-findings.json`
**Reviewed By**: Reviewer (pending)
**Reviewed At**: 2026-11-22T20:59:04Z

## Gate Matrix

| Gate | Requirement | Evidence Source | Status | Exception |
| --- | --- | --- | --- | --- |
| `dead-field` | mechanical quality bar, unused-state hygiene | `specs/001-ring-mcp-bridge/iterations/003/quality/mechanical-findings.json` | `planned` | `—` |
| `anti-pattern` | mechanical quality bar, deterministic anti-pattern scan | `specs/001-ring-mcp-bridge/iterations/003/quality/mechanical-findings.json` | `planned` | `—` |
| `test-integrity` | mechanical quality bar, assertion-driven tests | `specs/001-ring-mcp-bridge/iterations/003/quality/mechanical-findings.json` | `planned` | `—` |
| `stack-tooling-evidence` | stack tooling evidence | `specs/001-ring-mcp-bridge/iterations/003/quality/quality-evidence.md` | `planned` | `—` |
| `quality-lens-review` | quality-lens review | `specs/001-ring-mcp-bridge/iterations/003/quality/quality-evidence.md` | `planned` | `—` |

## Recorded-event receiver pilot � 23 November 2026

A local hybrid core accepted an SDK call to `share_event_media` for a previously captured Ring detection. The pilot replayed its official household, camera, event and capture times from the private manifest. A separate receiver process presented its own bridge OAuth access token and the item grant. The JPEG and MP4 matched the source lengths and SHA-256 digests. The clip supported byte-range reads. The caller�s credential failed at the receiver endpoint. Withdrawal denied the next range request, and reapproval required a new grant. Both clients linked through the real bridge issuer with a local Entra stand-in. [Reproduction](../../../quickstart.md#iteration-003-acceptance-run-planned)

The approved household settings screen passed browser checks at three widths in both themes. It persisted a single service approval covering photos and clips for the selected camera. The database tests checked that another camera and another service retained their settings.

**Open field checks.** The pilot supplied the recorded event metadata and media source locally. The hybrid core still needs a trusted source that resolves a new connector detection to the matching official Ring event. The existing connector derives camera IDs from the community library and adds a kind suffix to its event IDs. The private official API sample used opaque identifiers. A verified mapping or ingestion of the official event identity is required before treating the deployed callback path as working. T064 still needs observed playback with sound in ChatGPT and Claude. No deployment or live household permission change was part of this run.
