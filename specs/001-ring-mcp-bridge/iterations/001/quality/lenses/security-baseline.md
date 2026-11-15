# Lens Checklist: security-baseline v1 (iteration 001)

| Field | Value |
| --- | --- |
| Lens ID | `security-baseline` |
| Version | `v1.0.0` |
| Purpose | Establish the minimum reviewable security baseline for Phase 1 stack-aware quality governance. |
| Default Row Statuses | `pass`, `fail`, `not-applicable`, `advisory` |

## Scope

Use this lens when the active feature exposes security-sensitive paths, handles untrusted input, relies on credentials or tokens, or publishes externally reachable behavior. Keep execution evidence row-level and explicit.

## Row Status Vocabulary

| Status | Meaning |
| --- | --- |
| `pass` | Evidence shows the check was satisfied for the reviewed scope. |
| `fail` | Evidence shows the check was required and is currently unsatisfied. |
| `not-applicable` | The feature does not exercise the risk; record the rationale. |
| `advisory` | The concern is worth tracking but is not a blocking Phase 1 failure. |

## Checklist Items

| Item ID | Concern | Concrete Check | Acceptance Criteria | Row Status | Evidence / Notes |
| --- | --- | --- | --- | --- | --- |
| SEC-001 | Trust boundaries | Identify every untrusted entry point touched by the feature. | All externally sourced inputs, callbacks, messages, and config values are named or linked to a concrete interface boundary. | `pass` | Each entry point is named in the contracts: the MCP endpoint (agents over HTTPS with a bearer token), the Issuer (OAuth with CIMD or DCR, and the owner's browser), the admin page (the owner's browser and its forms), the connector link (WSS dialled from home, signed hello), Ring's data (untrusted text, FR-033), the health file (local), and the deployment settings. `contracts/web-endpoints.md`, `contracts/connector-link.md`, `workshop/security-compliance.md` |
| SEC-002 | Input handling | Validate or constrain untrusted input before business logic or persistence. | The implementation rejects, sanitizes, or bounds malformed input with an explicit rule per entry point. | `pass` | zod at every edge. Tool inputs are flat schemas that reject unknown fields, answering `INVALID_ARGUMENT` (FR-048, `mcp-endpoint.test.ts`). Link messages are strict objects (`home-messages.ts`, `core-messages.ts`). Admin forms are zod-parsed, from the page's origin only, with a 4 KB body limit (`web.test.ts`). Ring's payloads go through tolerant readers (`ring-mapping.ts`, `room-lists.ts`). The health file is zod-parsed |
| SEC-003 | AuthN/AuthZ | Review authentication and authorization assumptions for changed paths. | Protected behavior has an explicit auth check or documented not-applicable rationale; no privileged path relies on implicit trust. | `pass` | Every MCP call needs an opaque token checked against its stored grant, for the one resource, with `read` only (`issuer.test.ts`, `mcp-endpoint.test.ts`). Only listed agents link, and only the owner's Entra object id signs in. The admin page needs a fresh sign-in, the session's form token and its origin. The connector enrolls with its key and the code the owner types (SC2). Agent links accept an open Microsoft session, which is the owner's choice for read-only links; the unchecked part is an accepted risk (DRIFT-001-76) |
| SEC-004 | Secret handling | Check credentials, tokens, keys, and connection strings for safe handling. | No secret is hard-coded, echoed into logs, or written to a repo-tracked artifact; runtime sourcing is explicit. | `pass` | The Ring token lives sealed in the home's Secrets File, its key in a Docker secret (FR-032). The core's signing keys are in Key Vault. gitleaks runs in the pre-commit hook and in CI. The logger has an allow-list and redacts. The owner's identifiers are kept out of git, checked before every commit |
| SEC-005 | Dependency exposure | Review dependency or package changes for new attack surface. | Newly introduced packages, services, or privilege boundaries have a documented reason and no known unsupported risk is silently ignored. | `advisory` | One production advisory chain: GHSA-2p57-rm9w-gvfp in `ip`, through `werift` in `ring-client-api`. It is on the written exception list until `werift` 0.25; `werift` serves only Ring live media, unused in iteration 001. `hono` and `@hono/node-server` were patched before the first deploy (DRIFT-001-67). The pilot added no dependency |
| SEC-006 | Sensitive output | Inspect logs, errors, and diagnostics for sensitive leakage. | Errors and telemetry omit secrets, tokens, and unnecessary sensitive payload data while preserving actionable troubleshooting context. | `pass` | Logs carry identifiers, codes and measures only (FR-034, `log-fields.ts`): rooms are logged as counts, and links as the platform's code. Errors carry the bridge's own words. Since DRIFT-001-82, a reply's text includes Ring's names for text-only clients; the tool descriptions and schemas mark them untrusted (FR-033) |

## Execution

Run for iteration 001 at T035 (2026-11-15), against the code at `afc6f82` and the evidence in `../quality-evidence.md`. The review scope is the iteration's whole delivered surface: the core, the home connector, the admin page and the infrastructure scripts.

## Upgrade Guidance

When a new recurring security trap is discovered:

1. Add or revise checklist rows in the extension source instead of editing scaffolded downstream copies first.
2. Bump the semantic version when reviewer-approved scope changes materially alter expected execution.
3. Record whether each new row is immediately approved, explicitly deferred, or advisory-only for the current adoption cycle.
4. Update any preset references only after the reviewed lens version is accepted.

## Change Log

| Version | Date | Change | Review Notes |
| --- | --- | --- | --- |
| `v1.0.0` | 2026-05-07 | Initial Phase 1 baseline with trust-boundary, input-handling, auth, secret, dependency, and leakage checks. | Establishes the reviewed minimum security checklist source for FR-022 through FR-026. |
