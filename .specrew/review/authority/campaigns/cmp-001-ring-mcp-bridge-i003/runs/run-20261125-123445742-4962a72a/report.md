# Review Result

- **Campaign**: `cmp-001-ring-mcp-bridge-i003`
- **Run**: `run-20261125-123445742-4962a72a`
- **Harness**: `claude-code-file-primary`
- **Target digest**: `a419b0529a0d4d08706fd3b46549223d9382dd94`
- **Completion**: `complete`
- **Verdict**: `findings`
- **Runtime outcome**: `completed`
- **Currentness**: `current`
- **Can approve current snapshot**: `false`

## Summary

Risk-based review of the iteration 003 work present in the snapshot (event media staging, handoff, grants, withdrawal, receiver download, settings page, cache deletion, media-scope MCP gating, audit, migrations 11-16, Ring pilot probe). No blocking or major defect was established. Grants are bound to item, receiver, policy and approval generation and rechecked before the first byte of each GET/Range; staging publishes only after storage succeeds; media-only tokens are kept off read and event methods; deletion requires a fresh sign-in and typed confirmation. One minor concurrency issue in camera settings and two notes are reported. Tests were read, not run; the only controller evidence is the governance command (exit 0), which is not a test run. Tasks the plan lists as planned (M06, F01, Q01, Q02, V01, V02) and the production event source (M01/M03/M05 in progress) are not assessed as delivered. Infrastructure, the home connector and other unchanged code were sampled lightly or not read.

## Findings

| ID | Severity | Relevance | Location | Finding |
| --- | --- | --- | --- | --- |
| `finding-27b386535c9b0e67` | minor | current | bridge/src/core/access/settings/media-permissions.ts:155 | A stale camera settings form can silently undo the owner's media or sound switch-off: The camera form posts the full enabled, sound and person_action values and carries no version of the policy it was rendered from. MediaPermissions.save applies them unconditionally (UPDATE ... SET enabled, sound where they differ). If the owner turns media or sound off in one tab or device, then submits a form that was rendered earlier in another session merely to add or remove a service, the old checked boxes are sent and media access or sound is turned back on without a warning. Existing approvals remain, so approved receivers can then be issued new grants. The policy row already has a generation that changes with enabled and sound; carrying it in the form and refusing a mismatch would cover those two switches. Person action changes do not move that generation and would need their own check. |
| `finding-013dc9204b820b45` | note | current | bridge/src/core/clients/web/pages.ts:383 | Camera and cached-media sections are absent from navigation, and two outcomes give no notice: The admin navigation and folded-width menu list only Health, Enroll connector and Time zone, although the page now renders #cameras and #media-storage. In addition, a successful camera save and a delete submitted after the sign-in became stale both redirect without setting a notice (web.ts #cameraChange and #deleteMedia). The stale delete shows the sign-in prompt but does not say that nothing was deleted; the comparable enrollment path reports sign_in_stale. |
| `finding-958c1eb095b1a16c` | note | current | specs/001-ring-mcp-bridge/contracts/web-endpoints.md:59 | web-endpoints.md still describes a read-only token contract and omits the media routes: The contract says tokens carry read only in iteration 001 and that at the MCP endpoint a token without read gets a 403. McpEndpoint now admits a media-only POST when media is wired, and the Issuer grants read and media. The clip link row still says its path is not named although /media/items/{id} is served, and the admin row omits /admin/cameras and /admin/media/delete. |

_This Markdown is a controller-generated projection. Authority is the sibling immutable `result.json`._