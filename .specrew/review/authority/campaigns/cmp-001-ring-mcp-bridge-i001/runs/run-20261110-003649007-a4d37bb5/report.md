# Review Result

- **Campaign**: `cmp-001-ring-mcp-bridge-i001`
- **Run**: `run-20261110-003649007-a4d37bb5`
- **Harness**: `codex-cli-file-primary`
- **Target digest**: `fa7c721b2fa8e8f56333cc11e45a602a69d963d1`
- **Completion**: `complete`
- **Verdict**: `findings`
- **Runtime outcome**: `completed`
- **Currentness**: `current`
- **Can approve current snapshot**: `false`

## Summary

Completed risk-based inspection of the frozen target, covering authentication and authorization, connector enrollment and reconnection, Ring access, durable state and outbox handling, leases, host lifecycle, configuration, contracts, and selected tests and deployment files. Found two major lifecycle/concurrency defects and one minor configuration defect. The controller's sole declared verification command succeeded for the supplied digest; its record contains no test-result counts. No tests or builds were run during this read-only review. Documented deferred functionality was not treated as an implementation defect.

## Findings

| ID | Severity | Relevance | Location | Finding |
| --- | --- | --- | --- | --- |
| `finding-a11277b1616c56a5` | minor | current | bridge/src/host/connector.ts:54 | Prevent duplicate connector processes from repeatedly replacing each other: [demoted to minor: no concrete failure scenario, so it cannot gate; reported as major by the reviewer] Starting a second standalone connector with the same data directory opens another Ring client and starts another CoreLink without acquiring any exclusive ownership. Both use the same persisted connector key. ConnectorLink replaces the older session with session_replaced (connector-link.ts:145), but HomeSession treats that reason as an ordinary opened-session disconnect (home-session.ts:273-292), and CoreLink reconnects after one second. The two processes therefore repeatedly evict each other while both retain active Ring clients, independent call limiters, and writers for the same secrets file/outbox. This defeats the single-active-instance requirement and can continually interrupt inventory synchronization. Acquire and hold exclusive connector ownership before openHome, and ensure a duplicate cannot keep competing for the enrolled session. |
| `finding-291b916207652d52` | minor | current | bridge/src/host/ring-home.live.ts:67 | Drain pending refresh-token writes before completing shutdown: [demoted to minor: no concrete failure scenario, so it cannot gate; reported as major by the reviewer] When Ring rotates its refresh token, RingApiAdapter.#saveToken starts saveRefreshToken asynchronously and does not retain its completion. The host maps that operation to SecretsFile.update, but this close callback only calls ring.close() and immediately resolves; neither component drains SecretsFile's queued writes. main.ts then calls process.exit() after the host stop completes. If SIGTERM, stdin closure, or a fatal restart overlaps a token write (for example, a slow write/fsync/rename on the mounted data volume), an otherwise clean shutdown can terminate before the replacement is durable. The next launch reads the older credential and may need manual Ring sign-in. Stop token production and await all accepted token writes before allowing host shutdown to resolve. |
| `finding-75ea7ae1e4b1dcdf` | minor | current | bridge/src/utilities/config/mode-settings.ts:177 | Reject tenant domains or resolve their canonical issuer before sign-in: The tenant setting accepts a verified domain, and host/core.ts explicitly constructs the Entra issuer using either a tenant ID or domain. However, EntraSignInSettings documents that the issuer must use the tenant ID because discovery returns that canonical ID, and entra-discovery.ts:114 rejects any issuer mismatch. A value such as contoso.onmicrosoft.com consequently passes startup validation but makes owner sign-in fail at discovery. Restrict BRIDGE_ENTRA_TENANT_ID to the supported tenant ID form, or securely resolve the domain to its canonical tenant issuer before constructing EntraOwnerSignIn. |

_This Markdown is a controller-generated projection. Authority is the sibling immutable `result.json`._