# Review Result

- **Campaign**: `cmp-001-ring-mcp-bridge-i002`
- **Run**: `run-20261120-201951241-4e720cca`
- **Harness**: `claude-code-file-primary`
- **Target digest**: `c7e1cdfa7fd018014f201f608c1cee375a91ee1b`
- **Completion**: `partial`
- **Verdict**: `incomplete`
- **Runtime outcome**: `completed`
- **Currentness**: `current`
- **Can approve current snapshot**: `false`

## Summary

Partial review. Controller verification (governance validation) passed with exit 0. I read only the Ring pilot dev code (bridge/dev/ring-pilot: snapshot.ts, links.ts, app.ts, client.ts), which holds the most recent changes. I did not open the connector, core, or contract sources under bridge/src (about 360 files), the specs, or the design documents, so nothing is said about them. In the files I read I found no blocking or major defects. Link confirmation, nonce replay protection, the one-time browser code, cookie flags, CSRF proof, the snapshot time-window bound and the JPEG size and shape checks all looked sound. Two minor observations follow.

## Findings

| ID | Severity | Relevance | Location | Finding |
| --- | --- | --- | --- | --- |
| `finding-d8baeaa14cfe4771` | minor | current | bridge/dev/ring-pilot/snapshot.ts:123 | Signed media URL is fetched from any https host without an allowlist: downloadSnapshot follows a 303 Location from Ring to any https URL and fetches it with the plain fetch. It carries no bearer token, redirect is 'error', and there is a timeout and a size cap, so impact is limited. A host allowlist, or at least a check that the host is not private or loopback, would harden this against a compromised or spoofed Ring response. |
| `finding-d80452654a54478a` | minor | current | bridge/dev/ring-pilot/app.ts:519 | Webhook signature has no timestamp or replay protection: /ring/webhook verifies only an HMAC over the body. A captured valid app_integration_removed event can be replayed to drop a later re-linked account's stored grant, because forget() removes the store record by account. The effect is a denial of service on a pilot, and the user would need to re-link. |

_This Markdown is a controller-generated projection. Authority is the sibling immutable `result.json`._