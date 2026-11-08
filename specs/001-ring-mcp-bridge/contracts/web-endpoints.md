# Core HTTP Surface

**Feature**: `001-ring-mcp-bridge` | **Stage**: plan (Phase 1 design artifact) | **Date**: 2026-11-02

This lists every HTTP surface the cloud core serves in hybrid mode (H), and what changes in all-in-one mode (A). Citation keys are in `../data-model.md`; PT and CRP ids are the plan-time resolutions of 2026-11-02 in `../research.md`.

Only three paths are named in the workshop records: `/oauth` (the Issuer), `/livez` and `/readyz` (the Host). Every other surface is listed by its record name, with "not named". Its path is set at implement. The OAuth discovery paths are fixed by the protocols, not by a record decision, and are cited as such.

## Surfaces

| Surface | Path in the records | Served by | Called by | Authentication | Iteration | Source |
|---|---|---|---|---|---|---|
| MCP endpoint (Streamable HTTP; the 2026-07-28 era and the legacy era on one endpoint) | `/mcp` [P] (T024, DRIFT-001-42) | MCP Endpoint | agents; the channel shim | OAuth 2.1 bearer token from the Issuer; no anonymous access. Azure-hosted agents may present an Entra token for the bridge's app from a listed managed identity | 001 (the shim's use: 002) | IA D1, AC IN3, AC B2, AC B14, SC2, SC4 |
| Listen stream | not a separate route: the MCP method `subscriptions/listen` on the MCP endpoint (2026-07-28 era) | MCP Endpoint; Delivery (its listen adapter) | the channel shim, which relays push to the desktop coding agent; other 2026-07-28 clients | the same bearer token; the shim holds `read` only | 002 | IA §Contracts by boundary (2), AC §Research verdicts, CD map v3 Delivery, SC2 |
| Issuer (OAuth 2.1 authorization server: CIMD or DCR for listed agents only; issue, refresh, revoke) | `/oauth` (node-oidc-provider's endpoints under it) | Issuer | agents; the shim (a static entry, PKCE) | owner consent through Entra | 001 (the shim's entry: 002) | CD §Every component and its job at lens open (Issuer), SC1, SC2 |
| OAuth discovery | the protected-resource metadata (RFC 9728, MCP authorization), at `/.well-known/oauth-protected-resource/mcp`, and the authorization-server metadata (RFC 8414): protocol-defined paths | MCP Endpoint; Issuer | agents | none | 001 | protocol; the content rules in SC §Evidence |
| Owner sign-in (Entra) return | not named | Web, through the Security utility's Entra sign-in client | the owner's browser | Entra, the owner's organization identity; no client secret (a managed-identity federated credential) | 001 | SC1, FR-029, CD (Security utility), DO1 knock-on |
| Admin page | not named | Web, calling Admin and Inquiry (never the tables) | the owner | a fresh Entra sign-in; risky actions need a sign-in under 5 minutes old plus a typed confirmation | 001 minimal; 004 full | FR-039, FR-040, UX U1-U5, DS6, DA Option B |
| Confirm page (disarm only) | not named | Web, calling Control (Safety, Command) | the owner, from the URL in an MRTR URL elicitation | a fresh Entra sign-in (`prompt=login`) by the same user (`sub`) who started the request. The URL holds no secret and is not pre-signed | 004 | FR-028, FR-041, IA D8 disarm table, SC1, UX |
| Clip links and event frame links | not named | Web, calling Media | the requesting agent | the agent's own OAuth bearer token; never public or pre-signed links | 003 | FR-018, IA §Rules 4, CD map v3 Web |
| `/livez` | `/livez` | Host | the platform's auto-heal | not recorded | 001 | OR3, DO knock-on (App Service), CD map v3 Host |
| `/readyz` | `/readyz` | Host | the platform's health check; the deploy smoke test | not recorded | 001 | OR3, DO knock-on, DO §CI/CD smoke test |
| Connector link (WSS upgrade) | not named | Connector Link and Ring Access, over the Link transport | the home connector | TLS (the core's certificate) plus a signed challenge at every hello; no OAuth (`connector-link.md`) | 001 | IA D1, SC2, CD X2 |

Outbound, not routes: Delivery calls ChatGPT's MCP Events webhooks (002; IA §Contracts by boundary (3), AC IN5). Out-of-band alerts go from Azure Monitor to the owner by email and SMS (OR3). Neither is served by the core. The out-of-band heartbeat and home-offline alerts are 002 (DA Option B, part 2). The out-of-band "Ring session lost" alert is 004. In 001 a lost Ring session shows on the admin page; from 002 it is also a HIGH health event (CRP 4).

## Health endpoints

| Endpoint | Reports | Source |
|---|---|---|
| `/livez` | the process and its event loop are alive | OR3 |
| `/readyz` | the database is reachable, the single-instance lease is held, and secrets are loaded. Without the lease there is no control (fail closed), and `/readyz` reports it | OR3, OR §Amendments, CD C6, FR-044 |

On App Service, `/readyz` is the health check and `/livez` drives auto-heal (DO knock-on changes, assumed equivalent for one instance). The deploy's smoke test calls `/readyz` and `get_health` (DO §CI/CD).

## OAuth content rules

These are recorded client needs. The discovery paths themselves come from the protocols.

| Rule | Source |
|---|---|
| Listed agents only; CIMD preferred, DCR as the fallback (DCR is deprecated in the 2026-07-28 era) | SC1, SC §Evidence |
| The authorization-server metadata advertises PKCE `S256` | SC §Evidence (ChatGPT) |
| For CIMD it advertises `client_id_metadata_document_supported: true` and `none` in `token_endpoint_auth_methods_supported` | SC §Evidence (Claude) |
| Access tokens last 1 hour. Refresh tokens rotate and end after 30 days unused or 90 days at most; a dead refresh token answers `invalid_grant` | FR-029, SC1, SC §Evidence |
| Signing keys live in Key Vault, are rotated every 90 days by the Scheduler and Admin, and the old key is kept for checking | SC4, CD-A1 |
| Tokens and confirmations are bound to the owner's `sub` and the client | SC3 |
| Only the owner signs in: the ID token's object id (`oid`) must be the configured owner's, and every sign-in is refused while none is configured. The app registration also requires assignment, with only the owner assigned. The sign-in asks for `openid profile`, since Entra sends `oid` only with `profile` | the owner's choice (c), 2026-11-08 (DRIFT-001-39) |
| Every link is a fresh Entra sign-in by the owner: no grant is reused from an earlier browser session | FR-029, DRIFT-001-39 |
| A CIMD agent is listed under its document's URL. The URL is checked before anything is fetched, and every redirect URI the document names must be listed for it. The library implements CIMD draft-02 | PT-18, DRIFT-001-39 |
| A DCR registration is accepted only when every redirect URI it names is listed for one agent, whose listed client id is then only a name. The match is made again on every use, so revoking or unlisting the agent ends the client | DRIFT-001-39 |
| The token endpoint takes `none` or `private_key_jwt`: no client secret is issued or stored | SC4, DRIFT-001-39 |
| Tokens are for one resource, the MCP endpoint (RFC 8707), with `read` only in iteration 001. Access tokens are opaque: the MCP endpoint checks each against its stored grant | FR-030, DRIFT-001-39 |
| `issuer-signing-keys` is `{"keys": [current, previous]}`: one or two private RSA JWKs for RS256 with distinct `kid`s, newest first. The Issuer signs with the first and publishes both; its cookie keys are derived from them | PT-03, PT-04, DRIFT-001-39 |

At the MCP endpoint (DRIFT-001-42), a missing or bad token is a 401 and a token without `read` a 403, each with `WWW-Authenticate` naming the protected-resource metadata. While the Issuer cannot check tokens, the answer is 503 with `Retry-After`, so the agent keeps its token. The `Host` must be one of the core's names, and a request with an `Origin` header is refused [P].

An agent's authorization reaches the Issuer's interaction route (under `/oauth`), which starts the owner's Entra sign-in. Entra returns to the core's one sign-in return route, served by Web, which hands an Issuer sign-in back to the Issuer, with the browser's cookies, to finish the link (T029). The sign-in is bound to the browser that started the link by a cookie set when it was sent to Entra. A return in any other browser is refused before Entra's code is redeemed, and ends the link (DRIFT-001-40).

## Admin page sections

The admin page is server-rendered. All state is on the server, the health panel polls every 15 s, and the audit is paged and filtered on the server (UX U1, U3). It must work at three widths (a folded phone, an unfolded phone, a PC), keep page state when a phone is unfolded mid-task, default to dark with a light switch remembered per browser, and show every status as a word and an icon (FR-040, UX U1, U5).

| Section | What it does | Risky (fresh sign-in under 5 min plus a typed confirmation) | Iteration | Source |
|---|---|---|---|---|
| Health | the `get_health` data, refreshed every 15 s; "connector behind"; banners for home offline, Ring session lost and store down | no | 001 | FR-039, FR-040, UX U3, U4, OR carry-forward, CRP 4 |
| Enroll connector | shows the pending request's code to compare with the connector's log; approve | yes | 001 | SC2, UX U4, FR-032 |
| Agents | each agent's platform, scopes, last seen and control switch; revoke one; revoke all | revoke all: yes | 004 | FR-031, FR-039, UX layout |
| Cameras | per camera: media to agents, keep sound, battery cap per hour | no | 003 (FR-020 is in US3) | FR-019, FR-020, SC7, UX layout |
| Locations | shared locations off or read-only; the owners' agreement (who, date) recorded first | no | 004 | FR-036, SC7 C5 |
| Data | delete cached media and events now; the retention periods | yes | 004 | FR-037, SC7 C6, UX U4 |
| Audit | newest first, filter by kind and agent, paged on the server | no | 004 | FR-039, SC5, UX layout |
| Settings | disarm on or off (default off); set or change the PIN; the light auto-off default; links to each platform's training and memory settings | turning disarm on: yes; the PIN change needs a fresh sign-in | 004 | FR-027, FR-038, FR-039, CD-A1, UX layout |
| Clips | a player, only if spike S7 shows the agents' apps cannot play clips | no | not planned unless S7 says so | SC7, spec Edge Cases |

In 001, before the Agents section exists, the agent allowlist lives in Settings, seeded from deployment configuration (client identifiers, redirect URIs, scopes), and grants read only (PT-18).

## Confirm page (004)

The page appears only for disarm. It shows the signed-in user, which agent asks, the action, the monitoring state, a countdown and a PIN field (FR-041, UX layout). It answers in plain words (UX U4):

- disarmed;
- expired;
- already used;
- wrong PIN, with the tries left;
- locked for 15 minutes;
- home offline;
- outcome unknown (check the state).

The PIN never passes through the agent, the client or the model (FR-028).

## All-in-one mode (A)

| Surface | Mode A behaviour | Source |
|---|---|---|
| MCP endpoint | stdio, or an endpoint bound to localhost only; local MCP clients only | SC Lens 4 summary, AC IN2, FR-045 |
| Issuer, owner sign-in | none: mode A has no owner sign-in | spec Clarifications, spec Assumptions |
| Admin page | localhost only, opened with a one-time link printed at startup; risky actions need the typed confirmation. The link's path is not named | FR-039, FR-045, spec Clarifications |
| Confirm page | not served: disarm is never offered in mode A | FR-027, FR-045 |
| Connector link | not used: Ring Access calls Execute in process | CD map v3 |
| `/livez`, `/readyz` | not recorded for mode A | - |

Mode A is wired by the same Host from 001 for development and CI (DA Option B). The one-time localhost admin link is US7 work, in iteration 004. How local clients authorize in mode A is carried to the iteration 004 plan (G14 in `../data-model.md`).
