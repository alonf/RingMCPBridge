# Security & Compliance — Ring MCP Bridge

**Depth**: Full.
**Status**: CLOSED 2026-10-25. The human said "move on" after SC7. Confirmation: human-confirmed, scope lens-question, per decision point SC1-SC7. The decided state is in the "Lens 4 summary" section and the decision table.
**Inputs**:
- `integration-api.md` (closed 2026-10-25);
- `architecture-core.md` (B5, B6, B8, B13, B14, B15, P5, S1);
- `requirements-nfr.md` (the refusals, the audit trail, retention);
- `product-domain.md` (the harmed parties, shared locations, the Ring ToS).

## Carried in, and where each item is answered

- The auth mechanism for each boundary (1)-(6): SC1 and SC2. Boundary (3) follows OpenAI's MCP Events sender rules (S4), and boundary (6) uses HMAC (S1).
- P5, the identity provider: SC1.
- Confirmation binding to the OAuth `sub` and client, because 2026-07-28 has no sessions: SC3.
- The confirm page's sign-in and same-user check (a spec MUST): SC1 and T9.
- PIN storage and the lockout count N: SC4.
- The `requestState` sealing key, the connector identity, and the Ring token at rest: SC2 and SC4.
- The S1 secrets mechanism (from architecture-core: the human enters them, the agent never sees them, they are encrypted at rest and never printed): SC4.
- Client support for MRTR and `elicitation.url`: SC6, and the new spike S7.

## Trust boundaries and attack surface (lens-open proposal, 2026-10-25; the as-decided diagram is in the Lens 4 summary)

```text
 TRUST BOUNDARIES AND ATTACK SURFACE (topology H)

 ZONE 1: CLIENTS               ZONE 2: AZURE CORE             ZONE 3: HOME VM
 untrusted: models can be      trusted, but open to the       most trusted: holds
 steered by what they read     internet (T4)                  the Ring token
 +--------------------+        +-------------------------+    +--------------------+
 | ChatGPT, claude.ai,| T1-T3  | MCP endpoint: checks    |    | Connector          |
 | Desktop, Claude    |--(1)-->| tokens; Safety gate     | T6 | Ring token, push   |
 | Code, Foundry,     | bearer | confirm page + PIN (T9) |<(4)| credentials (B5)   |
 | your gate app      | token  | event log, audit, media |WSS | connector key      |
 +--------------------+        | secrets in Key Vault    |    | outbox          T5 |
 | shim on your PC    |--(2)-->|                         |    +---------+----------+
 +--------------------+        | Delivery                |              | (5) T8
 ChatGPT MCP Events <---(3)----| signed as OpenAI        |              v
                               | requires (S4)           |         Ring cloud
 Ring official API ----(6)---->| HMAC webhooks, only if  |         (ToS risk)
                               | S1 passes               |
                               +-------------------------+
 ISSUER (SC1, hosted or ours): you sign in with a passkey; it gives clients their
 tokens, and the core checks them. The confirm page signs you in through it too.
 MODE A (all-in-one at home, B3): stdio, or an endpoint bound to localhost only.
```

```text
 +-----+---------------------------------+-----------------------------------------------+
 | T   | Threat                          | Mitigation                                    |
 +-----+---------------------------------+-----------------------------------------------+
 | T1  | prompt injection through Ring   | marked untrusted (B13); control always needs  |
 |     | names, event text or images     | a human confirmation                          |
 | T2  | an agent confirms its own       | elicitation where supported; control scope    |
 |     | action                          | only for listed clients; audit (SC6)          |
 | T3  | a stolen or leaked client token | short-lived tokens, scopes, revoke-all;       |
 |     |                                 | disarm also needs the PIN and a sign-in       |
 | T4  | abuse of the public endpoint    | every endpoint authenticates in its own way   |
 |     |                                 | (bearer token, connector key, browser         |
 |     |                                 | sign-in, HMAC); only metadata and health are  |
 |     |                                 | anonymous; rate limits; PIN lockout           |
 | T5  | the home VM is compromised (it  | outbound only (B6), non-root container,       |
 |     | holds the Ring token)           | read-only image, encrypted token, patching    |
 | T6  | link impersonation or command   | TLS to the core; connector key (SC2);         |
 |     | replay                          | command_id and deadline                       |
 | T7  | npm supply chain                | lockfile, pinned versions, audit in CI, few   |
 |     |                                 | dependencies, license check (B15)             |
 | T8  | Ring blocks the account         | one rate limiter, no polling bursts; ToS risk |
 |     |                                 | already accepted                              |
 | T9  | disarm-link phishing            | same-user sign-in on the page (a spec MUST),  |
 |     |                                 | one-time URL, 2 min                           |
 | T10 | an always-on agent (a ChatGPT   | it arrives with its platform's token, so      |
 |     | dot, later Claude Duet) acts    | assume the core cannot tell it apart (S7);    |
 |     | with nobody watching, after     | accepted for ChatGPT and Claude (SC3): audit, |
 |     | reading untrusted Ring text     | arm summary, control rate limit, auto-off     |
 | T11 | only with option B: our         | CIMD only from listed agent hosts; DCR only   |
 |     | issuer's open endpoints are     | with listed redirect URIs; https only, no     |
 |     | abused (a CIMD URL makes us     | private addresses, size and time limits; rate |
 |     | fetch an attacker's host; DCR   | limits                                        |
 |     | floods registrations)           |                                               |
 +-----+---------------------------------+-----------------------------------------------+
```

## Decision points SC1-SC7 (2026-10-25: all decided or confirmed by the human)

```text
 +-----+--------------------+------------------------------------------------------------+
 | #   | Decision point     | My proposal                                                |
 +-----+--------------------+------------------------------------------------------------+
 | SC1 | Who signs in, and  | DECIDED 2026-10-25 (human: option B). You are the only     |
 |     | where (P5)         | human, and you sign in with Entra ID (your organization    |
 |     |                    | tenant; you are its admin), using the passkey or MFA your  |
 |     |                    | tenant sets. The core runs its own issuer on               |
 |     |                    | node-oidc-provider. It gives agents their tokens through   |
 |     |                    | CIMD or DCR, only for listed agents (T11). Tokens: 1 h     |
 |     |                    | access; refresh rotating, 30 days unused, 90 days at most. |
 |     |                    | The confirm page asks Entra for a fresh sign-in. The core  |
 |     |                    | reaches Entra with its managed identity as a federated     |
 |     |                    | credential (to confirm on Container Apps). Auth0 (no free  |
 |     |                    | slots) and AWS: not used.                                  |
 | SC2 | Machine identities | Connector enrollment human-confirmed; the rest as          |
 |     |                    | presented, no change asked. Connector: a key pair made on  |
 |     |                    | the VM, enrolled once on the admin page after you check a  |
 |     |                    | code; it signs a challenge at each hello; enrolling a new  |
 |     |                    | one revokes the old (B7). Shim: OAuth with PKCE through    |
 |     |                    | Entra once; refresh token in Windows Credential Manager; a |
 |     |                    | static entry in our issuer. Gate app: client credentials   |
 |     |                    | signed with its own private key; a static entry.           |
 |     |                    | Azure-hosted agents (Foundry, ACA): their own managed      |
 |     |                    | identity; the core accepts an Entra token for our app from |
 |     |                    | a listed identity (human-confirmed). Core: managed         |
 |     |                    | identity to Key Vault and to Entra.                        |
 | SC3 | Who may do what    | DECIDED 2026-10-25 (human). Scopes read, media, control;   |
 |     |                    | config switches beat scopes (disarm off unless switched    |
 |     |                    | on). Control (arm, lights): ChatGPT including the dot, and |
 |     |                    | every Claude surface including Claude Duet when it arrives |
 |     |                    | (T10 accepted). Shim: read. Gate app and Azure-hosted      |
 |     |                    | agents (Foundry, ACA): read and media. Disarm also needs   |
 |     |                    | MRTR and URL elicitation (S7). Lights take an optional     |
 |     |                    | auto-off time (additive under D2). Tokens and              |
 |     |                    | confirmations are bound to your sub and the client. Shared |
 |     |                    | locations: off unless enabled, read-only by default (MVP), |
 |     |                    | with their owners' agreement. Read is sensitive too.       |
 |     |                    | Revoke-all on the admin page.                              |
 | SC4 | Secrets and data   | DECIDED 2026-10-25 (human). Ring token, push credentials,  |
 |     |                    | device ID and the connector key: connector only, in an     |
 |     |                    | encrypted file whose key comes from a Docker secret. Core  |
 |     |                    | secrets in Key Vault through managed identity: issuer      |
 |     |                    | signing keys (rotated every 90 days, old key kept for      |
 |     |                    | checking until its tokens expire), requestState key,       |
 |     |                    | plan-token key, PIN hash, the S1 secrets (you enter them;  |
 |     |                    | never seen or printed). No client secret toward Entra.     |
 |     |                    | Only the core's identity gets Key Vault and database       |
 |     |                    | rights. Refresh-token grants stored hashed only. Mode A:   |
 |     |                    | an encrypted local file. PIN: argon2id; 5 wrong tries lock |
 |     |                    | disarm for 15 min and raise a HIGH event. Events, audit    |
 |     |                    | and frames: TLS, encrypted at rest, lens 1 retention,      |
 |     |                    | frames 7 days. Logs never hold tokens, PINs, keys or       |
 |     |                    | images.                                                    |
 | SC5 | Audit              | DECIDED 2026-10-25 (human). Append-only and hash-chained.  |
 |     |                    | Two copies: a database copy for the admin page and         |
 |     |                    | get_history, and WORM blob storage as the proof            |
 |     |                    | (audit-90d: control, media access; audit-1y: security,     |
 |     |                    | config; one append blob a day; the core may only append;   |
 |     |                    | unlocked during the pilot, lock decided later). Security   |
 |     |                    | and config kept 1 year. Security events raise an event.    |
 |     |                    | get_history also returns the bridge's control entries      |
 |     |                    | (additive under D2). Cost under $0.10 a month. Operational |
 |     |                    | logs are separate and never hold secrets.                  |
 | SC6 | Risk we accept     | DECIDED 2026-10-25 (human). Risk register R1-R8 accepted   |
 |     |                    | (R4 for the dot and Claude Duet). Per-agent rate limits:   |
 |     |                    | control 20 an hour (counted on confirm; a light with       |
 |     |                    | auto-off counts once; hitting it raises a security event); |
 |     |                    | reads from the core 600 an hour; fresh frames and bursts   |
 |     |                    | 60; clips 20; one shared limiter toward Ring at the        |
 |     |                    | connector. All config defaults, tuned in the pilot. The    |
 |     |                    | rest as presented: a per-agent elicitation-only switch,    |
 |     |                    | default off; client support checked in S7.                 |
 | SC7 | Compliance and     | DECIDED 2026-10-25 (human). C1-C7 in the SC7 section. Ring |
 |     | privacy            | terms accepted earlier, plus a README disclaimer. A        |
 |     |                    | per-camera 'media to agents' switch. Clips keep the sound  |
 |     |                    | Ring recorded (human-changed; a per-camera switch can drop |
 |     |                    | it). The README and admin page point to the platforms'     |
 |     |                    | training and memory settings. Shared-location owners'      |
 |     |                    | agreement recorded before a location turns on; their media |
 |     |                    | off by default. Delete-now on the admin page. OSS: MIT,    |
 |     |                    | secure defaults, SECURITY.md, no telemetry. If S7 shows    |
 |     |                    | clients cannot play clips, the admin page plays them.      |
 +-----+--------------------+------------------------------------------------------------+
```

**SC6 does not reopen lens 3.** D4 and D7 rule 6 stand: elicitation is used where the client supports it, and two-step otherwise. SC3 only decides which clients receive the control scope. SC6 records the residual risk that remains on those clients.

## Evidence (2026-10-25)

- **ChatGPT:**
  - supports CIMD (preferred), DCR, predefined clients and PKCE;
  - requires the authorization server metadata to advertise S256 (OpenAI Apps SDK auth docs).
- **Claude** (claude.ai, Desktop, mobile, Claude Code):
  - supports CIMD and DCR;
  - Claude Code runs its own OAuth flow with its own CIMD (claude.com connector authentication docs).
- **MCP 2026-07-28:** DCR is deprecated in favour of CIMD (spec changelog, "Deprecated" item 4).
- **Entra ID:** publishes no RFC 7591 registration endpoint, so clients are registered statically (Microsoft Copilot extensibility docs). CIMD support is not documented.
- **Hosted identity services** (checked 2026-10-25, for the human's own accounts):
  - Auth0 documents CIMD as a tenant setting (Settings > Advanced) and also offers DCR. CIMD clients there cannot use shared-secret client auth.
  - An Auth0 community thread (opened 2026-09-30, still unresolved 2026-10-15) reports that Auth0 rejects ChatGPT's CIMD document. DCR is the reported workaround.
  - Amazon Cognito has no native DCR or CIMD; it needs a proxy in front (third-party sources). Login with Amazon was not checked.
  - Entra ID: see above.
- **Issuer requirements from the clients:**
  - ChatGPT re-prompts when it gets no refresh token (community reports).
  - Claude refreshes 5 minutes before expiry and on a 401. For CIMD and DCR clients it expects refresh-token rotation, and `invalid_grant` once a refresh token is dead.
  - For CIMD, Claude also needs `client_id_metadata_document_supported: true` and `none` in `token_endpoint_auth_methods_supported` (claude.com connector authentication docs).
- **ChatGPT dots** (launched 2026-09-29; OpenAI pages returned 403, so these come from secondary sources):
  - always-on agents that keep working while the user is away;
  - they reach apps through ChatGPT plugins;
  - one source says a dot reuses the user's existing plugin connections; another says a custom MCP server reaches a dot only when added with "Create as a plugin", not as a developer-mode app;
  - background proactive research is limited to read-only tools;
  - writes follow the user's custom rules (act without asking, act if pre-approved, ask first, hand off), plus an auto-review that the rules cannot turn off;
  - recurring work is scheduled, and no event trigger is documented;
  - what a dot learned from an app stays in its memory after the app is disconnected.
- **Client elicitation support** (secondary sources, unverified):
  - Claude Code CLI supports form elicitation.
  - A Claude Code URL-mode bug was reported in June 2026 and closed; the fix version is unknown.
  - Claude Desktop lacked elicitation in March 2026.
  - Nothing found for ChatGPT.
  - Nothing found for MRTR support in any client.

**New spike S7, the client capability matrix:** for each target client (Claude Code, claude.ai, Desktop, ChatGPT, Foundry, the gate app), check:
- the protocol era;
- elicitation form and URL support;
- MRTR;
- CIMD or DCR;
- for Foundry, which auth options it offers.

S7 is desk research plus a small test server. It does not touch Ring.

**S7 is human-agreed** (2026-10-25: "Agree foe the S7 spike"). The confirmation covers S7 only, not SC6 or any other SC row.

Proposed additions to S7 (2026-10-25, awaiting the human):
- ChatGPT dots: can a dot use our server, and how (a reused connection, or a plugin)? Can the core tell a dot's call from a chat call (client_id, `_meta`, user agent)? How would a dot show you a confirmation?
- The chosen issuer with each client: CIMD first, then DCR as the fallback, and whether refresh tokens are issued and rotated.

## SC1 in discussion (2026-10-25)

**The human's input** (verbatim): "I have an Auth0 account, I have Azure EntraID, and I have AWS that I use for Alexa skills that also provides authentication. However what I do not understand is how agents such as ChatGPT and Claude handles the login? Is it a onetime linkadge that I enter my credential, or each time I ask something? and what about ChatGPT Dot? the always on agent?"

**Known:** the human already has accounts with Auth0, Entra ID, and AWS (used for Alexa skills).

**Open question:** is the AWS auth Cognito or Login with Amazon?

**The agent's explanation:**
- Sign-in happens once per client, like Alexa account linking.
- After that, the platform attaches the access token to every call and refreshes it silently.
- You sign in again only when the refresh token expires unused, you revoke it, the scopes change, or the platform loses it.
- Community reports show ChatGPT sometimes re-prompting anyway.

```text
 HOW AN AGENT SIGNS IN TO THE BRIDGE (OAuth; once per client, like Alexa account linking)

 You              Client platform          Issuer                 Bridge core
                  (OpenAI or Anthropic     (Auth0 or another)     (Azure)
                  cloud; Claude Code:
                  your PC)
  |  add or use      |                        |                      |
  |  the connector   |                        |                      |
  |----------------->|---(1) call, no token ------------------------>|
  |                  |<--------------------- 401: sign in at issuer -|
  |<-(2) browser opens the issuer's page -----|                      |
  |--- passkey, approve scopes -------------->|                      |
  |                  |<--(3) code ------------|                      |
  |                  |---- code + PKCE ------>|                      |
  |                  |<--- access token (1h*) |                      |
  |                  |     + refresh token    |                      |
 ===== ONCE. FROM HERE ON YOU DO NOTHING ==================================
  |  "is the gate    |                        |                      |
  |   open?"         |---(4) tool call + access token -------------->| checks
  |                  |<------------------------------------- answer -| token
  |                  |                        |                      |
  |                  |---(5) near expiry: --->|                      |
  |                  |    refresh token       |                      |
  |                  |<--- new access token + |                      |
  |                  |     new refresh token  |                      |
 (6) You sign in again only if the refresh token expires unused, you
     revoke it, the scopes change, or the platform loses it.
 * Lifetimes are our choice in the issuer (SC1), not a platform rule.
```

```text
 +----------------+-------------------------+---------------+---------------------------+
 | Client         | When you sign in        | Tokens live   | Notes                     |
 +----------------+-------------------------+---------------+---------------------------+
 | ChatGPT chat   | once, at the first tool | OpenAI's      | CIMD preferred, DCR, or a |
 |                | call                    | cloud         | predefined client         |
 | ChatGPT dot    | unclear: it reuses your | OpenAI's      | runs while you are away;  |
 |                | ChatGPT connection, or  | cloud         | background is read-only;  |
 |                | sees us only if added   |               | your rules can let it     |
 |                | as a plugin (secondary  |               | write without asking      |
 |                | sources; S7)            |               |                           |
 | claude.ai,     | once, when you click    | Anthropic's   | refreshes 5 min before    |
 | Desktop,       | Connect                 | cloud         | expiry and on a 401       |
 | mobile         |                         |               |                           |
 | Claude Code    | once, in your browser   | your PC       | its own CIMD, localhost   |
 |                |                         |               | redirect                  |
 | Shim (ours)    | once, in your browser   | Windows       | SC2                       |
 |                |                         | credential    |                           |
 |                |                         | store         |                           |
 | Gate app       | never: a machine        | its own key   | client credentials (SC2)  |
 +----------------+-------------------------+---------------+---------------------------+
```

**Proposals (2026-10-25, awaiting the human):**
- **SC1 lean:** Auth0, which the human already has. It documents CIMD, with DCR as the fallback if the ChatGPT CIMD issue persists. S7 checks it with each client.
  - Entra is the fallback: every client registered by hand.
  - AWS: Cognito needs a proxy; Login with Amazon is to be confirmed with the human.
- **New issuer requirements:**
  - it issues refresh tokens;
  - it rotates them for CIMD and DCR clients;
  - it returns `invalid_grant` for a dead refresh token;
  - it advertises S256 and the CIMD metadata both clients expect.
- **Token lifetimes** (a decision for the human):
  - access tokens: 1 hour;
  - refresh tokens: rotating, expiring after 30 days unused and 90 days at most;
  - so each client re-signs-in about once a quarter, and revoke-all works at any time.
- **T10, the always-on agent:**
  - If a dot arrives with ChatGPT's own token, then giving ChatGPT the control scope gives it to an agent that runs unattended. That agent reads untrusted Ring text, and your rules can let it act without asking.
  - Through the two-step arm fallback, that is T2 with nobody present. Auto-review is ChatGPT's control, not ours.
  - The human chooses between two options:
    - ChatGPT gets no control scope;
    - or control for ChatGPT is accepted to include the dot.
  - Until S7 says otherwise, assume the core cannot tell a dot from a chat.
  - Disarm stays safe either way, because it needs your sign-in and PIN on our page.
  - Read is affected too: what a dot reads stays in its memory after you revoke it (SC7).

## SC1 answers (2026-10-25, the human's second SC1 turn)

The human's answers, verbatim:
1. "not sure, we need to check. Probably Login with Amazon."
2. "Yes, but do we need to register new app? I am afraid I am out of free app registration. What is the cost? Azure if practically free for me (I get 1000 usd budget every month)"
3. "Yes"
4. "Yes - dot is my current always on assistant and I want dot to know what's going on in my home, including Ring devices"

**Recorded:**
- **Token lifetimes** (1 h access; rotating refresh, 30 days unused, 90 days at most): human-confirmed.
- **The S7 additions** (dots; the issuer with each client): human-confirmed. S7 also gains a third check: does the issuer library's CIMD draft match what ChatGPT and Claude send?
- **The dot as a client** (known, from answer 4):
  - The ChatGPT dot is the human's main always-on assistant, and they want it to know what is going on at home, Ring devices included.
  - That calls for read and media scopes. It is not consent to control: T10 stays open for SC3.
- **SC1 issuer: still open.**
  - The "Yes" to Auth0 depends on cost, and the human is unsure whether free app slots remain.
  - Auth0 needs about 6 apps and 1 API. The Free plan allows 10 apps, 10 APIs and 1 tenant. Essentials starts at $35/month.
  - Not verified: whether CIMD- or DCR-created clients count toward the 10, and Essentials' own app limit.
  - Azure costs the human nothing in practice: a monthly budget of $1000.

```text
 +-------------+-------------------------------+----------------------------------------+
 | Option      | What you register, cost       | Fit with the agents, our work and risk |
 +-------------+-------------------------------+----------------------------------------+
 | A. Auth0    | Register: about 6 apps + 1    | Fit: CIMD is documented, but reported  |
 |             | API in your tenant (ChatGPT,  | to reject ChatGPT's CIMD. With DCR,    |
 |             | Claude hosted, Claude Code,   | Claude adds a new app per fresh        |
 |             | confirm page, shim, gate app; | connection, which eats a 10-app cap.   |
 |             | Foundry later). Free plan: 10 | Our work: the least code.              |
 |             | apps, 10 APIs, 1 tenant.      |                                        |
 |             | Cost: $0 if there is room,    |                                        |
 |             | else Essentials from          |                                        |
 |             | $35/month.                    |                                        |
 | B. Our      | Register: 1 Entra app (free). | Fit: we configure CIMD, DCR, lifetimes |
 | issuer in   | Cost: $0; it runs inside the  | and rotation ourselves. The library    |
 | the core,   | core and its keys sit in Key  | lists CIMD draft-02 (a third-party     |
 | sign-in by  | Vault.                        | index; MCP cites draft-00), so S7      |
 | Entra       |                               | checks it against what ChatGPT and     |
 |             |                               | Claude send. Our work and risk: a      |
 |             |                               | security-critical part we own, on      |
 |             |                               | node-oidc-provider; more tests; on the |
 |             |                               | public endpoint (T4).                  |
 | C. Entra    | Register: every client by     | Fit: no CIMD or DCR. ChatGPT takes a   |
 | only        | hand. Cost: $0.               | predefined client, claude.ai takes one |
 |             |                               | in advanced settings, Claude Code      |
 |             |                               | takes --client-id (open bugs Sep       |
 |             |                               | 2026). MCP clients are reported        |
 |             |                               | hitting AADSTS9010010 resource/scope   |
 |             |                               | errors on Entra. Our work: no issuer   |
 |             |                               | code, but the most friction.           |
 +-------------+-------------------------------+----------------------------------------+
```

```text
 OPTION B: OUR ISSUER IN THE CORE, SIGN-IN HANDED TO ENTRA (all on Azure, $0)

 Agent platform          Bridge core (Azure)                      Entra ID
 (ChatGPT, dot, Claude)  +------------------------------------+   (your tenant)
                         | Issuer (node-oidc-provider)        |
  (1) CIMD or DCR ------>|  knows each agent                  |
  (2) sign-in request -->|  "who are you?" ------------------------> passkey, MFA
                         |                 <------------------------ you, signed in
  (3) <-- code, tokens --|  mints our tokens: 1 h access,     |
                         |  rotating refresh, scopes          |
  (4) tool call+token -->| MCP endpoint checks the token      |
                         | Confirm page: fresh Entra sign-in, |
                         | same person, then the PIN          |
                         +------------------------------------+
 One Entra app registration (free). No Auth0. Signing keys in Key Vault.
 Another OSS user can point the issuer at any OIDC sign-in (Auth0, Google...).
```

**Proposals (2026-10-25, awaiting the human):**
- **A versus B, decided by the free-slot count:** with at least 4 Auth0 app slots free, A costs $0; otherwise B keeps it at $0. The agent does not override the human's conditional "Yes".
- **Option B reverses part of the agent's earlier SC1 proposal:** the core would now issue tokens itself, not only check them.
- **Option B open question:** is the human's Entra tenant their own, or an employer's? Sign-in for a home alarm should not depend on an employer tenant's admins or policies.
- **AWS dropped from SC1:** neither A nor B uses it. As far as the agent knows, Login with Amazon signs in Amazon customers and does not issue tokens for a third-party API (unverified). The human can refuse this.
- **Privacy:** a dot that reads the house continuously builds an occupancy history in OpenAI's memory, and that history survives revoking its access (SC7). The human has neither accepted nor objected yet.

**Carry-forward to component-design (not blocking):**
- Dots work on schedules, not push. "What changed since my last check" depends on the dot keeping its own `get_events` cursor between runs, which S7 may not confirm.
- Decide whether the server keeps a last-read mark per client as a fallback.
- This reopens neither lens 1 nor lens 3.

## SC1 answers (2026-10-25, the human's third SC1 turn)

The human's answers, verbatim:
1. "Too many, we can;t use it. We need EntraID"
2. "I am the admin of the EntraID of my organization, and I can set who can use it, so no problem. I can also deploy a new EntraID, it it neccesary."
3. "yes"
4. "Yes"

**Recorded (human-confirmed):**
- **Auth0 (option A) is out:** the tenant has too many apps.
- **Entra ID is where the human signs in.**
- **The tenant is the human's organization tenant:**
  - the human is its admin and controls who may use it;
  - a new tenant is possible but not needed;
  - the agent sees no need for one.
- **AWS is dropped from SC1.**
- **The dot's memory is accepted (SC7):** a dot reading the house builds an occupancy history in OpenAI's memory that survives revoking its access, and the human accepted that.

**Still open: B or C.** "We need EntraID" fits both, so the human chooses.

```text
 +------------------+--------------------------------+----------------------------------+
 |                  | B. Our issuer + Entra sign-in  | C. Entra only                    |
 +------------------+--------------------------------+----------------------------------+
 | Who issues the   | our issuer in the core; Entra  | Entra                            |
 | agents' tokens   | only signs you in              |                                  |
 | ChatGPT and the  | CIMD or DCR, ChatGPT's         | needs a predefined client ID and |
 | dot              | documented paths               | secret typed into ChatGPT's app  |
 |                  |                                | or plugin setup; that those      |
 |                  |                                | fields exist is unverified (S7)  |
 | Adding an agent  | automatic (CIMD or DCR), but   | by hand, one Entra app each:     |
 |                  | only for listed agents         | ChatGPT (predefined client),     |
 |                  |                                | claude.ai (advanced settings),   |
 |                  |                                | Claude Code (--client-id, open   |
 |                  |                                | bugs Sep 2026), shim, gate app   |
 | The lifetimes    | enforced exactly               | not possible: Entra refresh      |
 | you confirmed    |                                | tokens are fixed at 90 days      |
 | (30 days unused, |                                | unused and live until revoked; a |
 | 90 at most)      |                                | sign-in frequency rule needs     |
 |                  |                                | Conditional Access (a P1         |
 |                  |                                | licence)                         |
 | Secrets          | no client secret toward Entra: | a client secret for each hosted  |
 |                  | the core uses its managed      | agent's registration (ChatGPT,   |
 |                  | identity as a federated        | claude.ai), kept by OpenAI or    |
 |                  | credential (documented for App | Anthropic                        |
 |                  | Service; to confirm on         |                                  |
 |                  | Container Apps)                |                                  |
 | Known problems   | the library's CIMD draft must  | AADSTS9010010 resource/scope     |
 |                  | match what the agents send     | errors reported with MCP clients |
 |                  | (S7)                           |                                  |
 | Code we own      | the issuer (on                 | none                             |
 |                  | node-oidc-provider) and its    |                                  |
 |                  | allow-lists; new threat T11    |                                  |
 | Cost             | $0                             | $0                               |
 +------------------+--------------------------------+----------------------------------+
```

**Evidence (2026-10-25, Microsoft Learn):**
- **Refresh tokens:** Entra retired configurable refresh and session token lifetimes on 2021-01-30. Refresh tokens now expire after 90 days without use and are valid until revoked. The replacement is Conditional Access sign-in frequency.
- **Access tokens:** their lifetime is still configurable, between 10 minutes and 1 day.
- **No-secret sign-in:**
  - A user-assigned managed identity can act as a federated identity credential on an app registration, in place of a client secret.
  - This is documented for App Service, for workforce tenants, with a limit of 20 per app. Container Apps is not documented.

**Proposals (2026-10-25, awaiting the human):**
- **The agent's lean is B, for two reasons:**
  - **ChatGPT and the dot, the human's main assistant.** Under C, ChatGPT needs a predefined client ID and secret typed into its app or plugin setup. The Apps SDK lists "predefined client" without details, so it is unverified whether those screens have the fields. Under B, ChatGPT uses CIMD or DCR, its documented paths. This is unverified on both sides.
  - **The lifetimes the human confirmed.** C cannot enforce them.
  - Also against C: each agent is registered by hand, the hosted ones with a client secret, and the reported AADSTS9010010 errors are a risk.
- **S7 addition:** does ChatGPT's custom app or plugin setup accept a predefined client ID and secret? And does B's CIMD or DCR work with ChatGPT and the dot?
- **With B:**
  - Entra still holds the human's passkey and MFA, and their admin control over who signs in.
  - The confirm page requests a fresh Entra sign-in (`prompt=login`).
  - SC4 gains the issuer's signing keys in Key Vault.
  - The sign-in client key becomes the managed-identity federated credential, if Container Apps supports it.
  - New threat T11 (in the threats table above): abuse of the issuer's open endpoints.
- **Record hygiene, before lens 4 closes:** rewrite the SC1 row in the decision table to the decided option. It still says the core does not issue tokens, and it still names a hosted service as the lean.
- **Carry-forward to component-design, if B is chosen:**
  - a new issuer component inside the core;
  - it stays within topology H and B7;
  - P5 is met with Entra upstream, so lens 2 is not reopened.

## SC1 decided (2026-10-25)

**The human chose option B** (verbatim: "B").

**Confirmation:** human-confirmed (lens-question, scope SC1).

**What was decided:**
- You sign in with Entra ID, in the human's organization tenant.
- The core runs its own issuer on node-oidc-provider and gives agents their tokens through CIMD or DCR, for listed agents only.
- The confirmed token lifetimes apply.
- The SC1 row in the decision table now states this. The superseded text, where the core did not issue tokens and a hosted service was the lean, has been removed.

**Carry-forwards:**
- **To component-design:** a new issuer component inside the core. It stays within topology H and B7, and P5 is met with Entra upstream, so lens 2 is not reopened.
- **To ui-ux:** a small admin page, with a fresh Entra sign-in, for:
  - connector enrollment;
  - revoke-all;
  - the list of agents and their scopes.
  It sits next to the confirm page.

## SC2 (2026-10-25)

```text
 +-------------+----------------------------------+-----------------------+-------------+
 | Machine     | Proves itself with               | Registered how        | Scopes      |
 +-------------+----------------------------------+-----------------------+-------------+
 | Connector   | its own key pair, made on the    | enrolled once: you    | the link    |
 | (home VM)   | VM; it signs a challenge at each | approve a code on the | only, no    |
 |             | hello                            | admin page            | OAuth       |
 | Shim (your  | OAuth with PKCE through Entra,   | a static entry in our | read        |
 | PC)         | once; refresh token in Windows   | issuer (no DCR)       |             |
 |             | Credential Manager               |                       |             |
 | Gate app    | client credentials signed with   | a static entry        | read, media |
 |             | its own private key; no shared   | holding its public    |             |
 |             | secret                           | key                   |             |
 | Foundry     | S7 checks its options first      | -                     | read, media |
 | Core        | its managed identity, to Key     | the one Entra app     | -           |
 | (Azure)     | Vault and to Entra (federated    |                       |             |
 |             | credential)                      |                       |             |
 +-------------+----------------------------------+-----------------------+-------------+
```

```text
 CONNECTOR ENROLLMENT (once; again only to replace it)

 Connector (home VM)              Core (Azure)                   You
  (1) makes a key pair; the
      private key never leaves
  (2) dials out: "enroll me" ---> holds the request and
      + its public key;           shows code 7Q4-K2P
      its log prints 7Q4-K2P
                                  (3) admin page  <------------- fresh Entra sign-in;
                                      lists the request          you check the code
                                                                 matches the log
                                  (4) <------------------------- approve
  (5) <--- enrolled; any older connector key is revoked (B7: one connector)
  (6) at every hello the core sends a fresh challenge; the connector signs it
```

**Notes:**
- Our own machines (the shim and the gate app) are static entries in the issuer. DCR stays for the listed hosted agents only.
- The shim needs only the read scope, because it relays pushes.
- The connector's link is its own boundary (4), so it gets no OAuth token. It checks the core's TLS certificate as usual.

**The human's answer** (verbatim): "Yes, it is ok to enroll in this way".

**Confirmation of connector enrollment:** human-confirmed (lens-question, scope SC2 connector enrollment). This covers:
- the key pair made on the VM;
- the code checked on the admin page after a fresh Entra sign-in;
- the challenge signed at each hello;
- a new enrollment revoking the old one.

**The rest of SC2** (the shim, the gate app, Foundry and the core identities) was presented in the same turn. The human requested no change but did not explicitly confirm those rows. They stand as presented, and the human can reopen them before the lens closes.

**Open question, carried to devops-operations:** where does the gate app run? It must hold its own private key.

## SC3 in discussion (2026-10-25; presented, awaiting the human)

```text
 +-----------------+-------------+------------------------------+------------------------+
 | Client          | Read, media | Control: arm, lights         | Disarm                 |
 +-----------------+-------------+------------------------------+------------------------+
 | ChatGPT chat    | yes         | your choice (T10): (1) none, | needs control, the     |
 | and dot         |             | (2) control that includes    | disarm switch on, and  |
 |                 |             | the dot, or (3) control with | S7 showing MRTR + URL  |
 |                 |             | elicitation only             | elicitation; else      |
 |                 |             |                              | ACTION_DISABLED        |
 | claude.ai,      | yes         | your choice: listed or not   | same rule              |
 | Desktop, mobile |             |                              |                        |
 | Claude Code     | yes         | your choice: listed or not   | same rule              |
 | Shim            | read only   | no                           | no                     |
 | Gate app        | yes         | no                           | no                     |
 | Foundry         | yes         | no                           | no                     |
 +-----------------+-------------+------------------------------+------------------------+
```

**Proposal** (from the SC3 row, unchanged):
- **Scopes:** read, media and control. Config switches beat scopes, and disarm is off unless switched on.
- **Control** goes only to clients the human lists; the default is none.
- **Binding:** tokens and confirmations are bound to the OAuth `sub` and the client.
- **Shared locations:** off unless enabled, read-only by default (MVP), and only with the owners' agreement.
- **Read is sensitive too.**
- **Revoke-all** lives on the admin page.

**The T10 choice for ChatGPT**, which covers the chat and the dot alike:
- **(1) No control scope.**
- **(2) Control that includes the dot.**
  - The dot can arm and switch lights while nobody is watching, whenever your custom rules allow it.
  - On the two-step fallback, the dot can confirm its own action.
- **(3) Control with elicitation only.**
  - Arm and lights work only when ChatGPT shows you an elicitation, so a dot cannot complete them alone.
  - Until S7 shows that ChatGPT supports elicitation, this works out the same as (1).

**The human's answer** (verbatim): "ChatGPT 2 - lights of ring are only in the yard and it can assist in getting a better image into dot (If we can do it), Arm is also OK."

**Recorded (human-confirmed, lens-question, scope SC3 for ChatGPT):**
- ChatGPT gets option 2: control that includes the dot.
- So the dot may arm (Home or Away) and switch the yard lights, unattended, whenever the human's ChatGPT rules allow.
- The human's reasons:
  - The Ring lights are only in the yard.
  - Switching them on may give the dot a better image.
- **Residual risk accepted for ChatGPT (feeds SC6):**
  - On the two-step fallback, the dot can confirm its own arm or lights action.
  - If it arms Away while someone is home, the next opened contact sounds the alarm, as the D8 arm summary states.
  - The mitigations stay in place: the audit, the arm summary, the control rate limit, and mode.changed sent to every client.
  - Disarm is unchanged: it still needs the switch, MRTR with URL elicitation, a fresh Entra sign-in and the PIN.

**Still open in SC3:**
- Control for the Claude surfaces (claude.ai, Desktop, mobile, Claude Code).
- Any other change to SC3.

**New idea, a light-assisted frame (proposal, awaiting the human):**
- The dot turns on a yard light, takes a frame, and the light goes back to how it was.
- This works today with the D7 tools: prepare and confirm lights on, get_frame, then prepare and confirm lights off.
- **Proposed additive change under D2:** the lights action takes an optional auto-off time, and the bridge restores the previous state, so an unattended dot cannot leave the light on. This does not reopen lens 3.
- **Pilot check:** does a yard light improve the gate camera frames at night (colour versus IR), and how long after the light comes on is the frame good?
- **Carry-forward to component-design:** the auto-off timer must survive a core or connector restart. Who owns it: the connector, which already talks to Ring?

## SC3 decided (2026-10-25)

**The human's answers, verbatim:**
- To "should any Claude surface also get control?": "Claude - they have an agent like dot that I am in the waiting list now, and any Claude session might use it anyway". Then "1. Yes".
- To "the auto-off light option?": "2. Yes".
- To "anything else in SC3?": "3. No - move on".

**Confirmation:** human-confirmed (lens-question, scope SC3). The SC3 row in the decision table now states the decision.

**What was decided:**
- **Control (arm and lights)** goes to ChatGPT, dot included, and to every Claude surface: claude.ai, Desktop, mobile, Claude Code, and Claude Duet when it arrives.
- **Claude Duet** (waitlist opened 2026-10-21, per secondary sources) inherits the user's Claude connectors. So T10 applies to it too, and is accepted.
- **The lights action takes an optional auto-off time:** an additive amendment to D7 under D2, human-confirmed. Its pilot check and the component-design carry-forward stand as recorded above.
- The rest of SC3 stands as presented.

**Reading of "move on":** it moves to SC4, the next decision point, and does not close lens 4. SC4 to SC7 still need the human's answers. The agent states this reading back to the human.

## SC4 in discussion (2026-10-25; presented, awaiting the human)

```text
 WHERE EACH SECRET AND EACH KIND OF DATA LIVES (SC4)

 HOME VM (connector)            AZURE CORE                         NEVER IN LOGS:
 encrypted file, its key        Key Vault (managed identity):      tokens, PIN,
 from a Docker secret:          - issuer signing keys (90 days)    keys, images
 - Ring refresh token           - requestState key
 - push credentials, device ID  - plan-token key                   NEVER TO THE
 - connector private key        - PIN hash (argon2id)              MODEL OR CHAT:
                                - S1 secrets (you enter them)      tokens, PIN,
                                Database (encrypted at rest):      keys
                                - refresh-token grants, hashed
                                - events, audit (lens 1 retention)
                                - frame cache (7 days)
 YOUR PC: the shim's refresh token, in Windows Credential Manager
 GATE APP: its own private key (where it runs: devops lens)
 OPENAI, ANTHROPIC: the tokens our issuer gave them (revoke-all on the admin page)
```

**The SC4 row** in the decision table is the proposal, revised for option B. What changed:
- issuer signing keys, rotated every 90 days;
- refresh-token grants stored hashed only;
- no client secret toward Entra;
- the connector key sits in the connector's encrypted file.

**The human's answer** (verbatim): "Yes PIN rules are OK. When you say "store at home", If I want to use an Azure hosted agent, like in FOundry or ACA, and it wants to use this MCP, what does it mean to it?"

**Recorded:**
- **PIN rules:** human-confirmed (lens-question, scope SC4 PIN): argon2id, 5 wrong tries, a 15-minute disarm lock and a HIGH event.
- **Still open in SC4:** the 90-day signing-key rotation and the rest of the row.

**The agent's explanation:** "stored at home" changes nothing for an Azure-hosted agent.
- It calls the core's MCP endpoint like any other agent and never reaches Ring, the connector, Key Vault or the database.
- When home is down, reads come back stale, and control and media return HOME_OFFLINE (D7).

```text
 AN AZURE-HOSTED AGENT (Foundry or ACA) USING THE BRIDGE

  Foundry / ACA agent        Bridge core (Azure)             Home VM
  +------------------+  MCP  +-----------------------+  WSS  +-------------+
  | your agent       |------>| checks the token      |<------| connector   |--> Ring
  | managed identity | token | answers from the      |  link | Ring token  |    cloud
  | (no secret)      |       | event log, or asks    |       | stays here  |
  +------------------+       | home                  |       +-------------+
                             +-----------------------+
  It never sees: the Ring token, the connector, Key Vault, the database.
  Home down: reads come back stale (stale_since); control and media: HOME_OFFLINE.
```

```text
 +---------------+---------------+----------------------------------+-------------------+
 | Way           | Acts as       | Secrets                          | Fits              |
 +---------------+---------------+----------------------------------+-------------------+
 | 1. Its own    | the agent     | none: Foundry's "Microsoft       | an agent that     |
 | managed       | itself        | Entra" option (agent identity or | works on its own, |
 | identity      |               | project managed identity), or an | like a home       |
 |               |               | ACA managed identity, gets an    | watcher           |
 |               |               | Entra token for our app          |                   |
 | 2. OAuth      | you, after a  | Foundry holds a client secret or | an agent that     |
 | identity      | one-time      | certificate for a static entry   | acts for you in a |
 | passthrough   | consent link  | in our issuer (managed identity  | chat              |
 |               |               | reportedly not accepted here)    |                   |
 +---------------+---------------+----------------------------------+-------------------+
```

**Evidence (2026-10-25):**
- **Foundry's MCP authentication options** (Microsoft Learn): key-based, Microsoft Entra (agent identity or project managed identity), OAuth identity passthrough (managed or custom OAuth), and unauthenticated.
- **Microsoft Q&A reports** (community, unverified):
  - custom OAuth needs a client secret or certificate, and a managed identity is not accepted as that credential;
  - hosted agents see only the agent's identity.

**Proposals (2026-10-25, awaiting the human):**
- **Azure-hosted agents use way 1, their own managed identity.**
  - The core's MCP endpoint then also accepts an Entra token for our Entra app, from a listed managed identity.
  - Checks: the issuer is the human's tenant, the audience is our app, and the object ID is on the list.
  - This refines SC2, where Foundry was to be checked first.
- **SC3 wording change, which needs the human's yes because SC3 is decided:** "Foundry: read, media" becomes "Azure-hosted agents (Foundry, ACA): read, media". Control would need the human to list them.
- **SC4 addition:** only the core's identity gets Key Vault and database rights (Azure RBAC). Other agents in the same subscription get none.
- **S7:** Foundry's Entra option sends a token our core accepts; verify it with a test agent.

## SC4 decided, with the SC2 and SC3 refinements (2026-10-25)

**The human's answers, verbatim:**
- "Agree with way 1"
- "Agree with the two changes"
- "Rest are ok"

**Confirmation:** human-confirmed (lens-question).
- **SC2:** Azure-hosted agents use their own managed identity. The core accepts an Entra token for our app from a listed identity.
- **SC3** (wording change confirmed): "Azure-hosted agents (Foundry, ACA): read and media".
- **SC4 decided as in the row:** includes the 90-day signing-key rotation and Key Vault and database rights for the core's identity only.

The decision table rows are updated to match.

## SC5 in discussion (2026-10-25; presented, awaiting the human)

```text
 +----------+--------------------------+-------------------+----------+--------------+
 | Kind     | What is recorded         | Who can see it    | Kept     | Raises event |
 +----------+--------------------------+-------------------+----------+--------------+
 | Control  | prepare, confirm,        | you (admin page); | 90 days  | -            |
 |          | result, auto-off; which  | agents with read, | (lens 1) |              |
 |          | agent; the plan; the     | via get_history   |          |              |
 |          | outcome                  | ("who armed it?") |          |              |
 | Security | your sign-ins; agent     | you only (admin   | 1 year   | PIN lockout  |
 |          | registered (CIMD, DCR);  | page)             |          | (HIGH); new  |
 |          | managed identity first   |                   |          | agent;       |
 |          | seen; grants revoked;    |                   |          | connector    |
 |          | PIN failures, lockouts;  |                   |          | enrolled     |
 |          | connector enrolled or    |                   |          |              |
 |          | replaced                 |                   |          |              |
 | Media    | who fetched which frame  | you only          | 90 days  | -            |
 | access   | or clip, and when        |                   |          |              |
 | Config   | disarm switch, control   | you only          | 1 year   | disarm       |
 |          | list, shared locations,  |                   |          | switch       |
 |          | listed identities        |                   |          | turned on    |
 +----------+--------------------------+-------------------+----------+--------------+
```

**Proposals:**
- **Append-only with a hash chain.**
- **Security retention:** 1 year for security and config entries. They are small, and lens 1 set 90 days only for control and confirmations.
- **Security events raise an event,** so the dot or Claude can tell the human.
- **Control audit through get_history:** an additive extension under D2. Today get_history returns Ring's own history only. It would also return the bridge's control entries, so "who armed it, and through which agent?" can be answered.

**The human's question** (verbatim): "What is the estimation cost of the audit log? Do we use blob storage, or a WORM capable storage?"

**The agent's answer:**
- **Cost:** negligible, under $0.10 a month at most, and under $1 even at ten times the volume.
- **Storage:** WORM blob storage as the proof, plus a database copy for querying.

```text
 AUDIT: ONE WRITE PATH, TWO COPIES (SC5)

 Core -- each entry, hash-chained --+--> Database copy: for the admin page and
                                    |    get_history (store chosen in data-storage)
                                    |
                                    +--> Blob storage with WORM (the proof):
                                         container audit-90d: control, media access
                                         container audit-1y:  security, config
                                         one append blob per day; written blocks
                                         cannot change or be deleted until the
                                         retention ends; new blocks can be added
 The core's identity may only append (a data role, no rights over the policy).
 A daily check compares the two copies and raises an event on any difference.
```

```text
 +---------+------------------------------------+--------------------+-------------------+
 | Item    | Estimate (upper bound)             | Price*             | Per month         |
 +---------+------------------------------------+--------------------+-------------------+
 | Entries | about 500 a day at most (dot       | -                  | -                 |
 |         | frames, agent refreshes, control), |                    |                   |
 |         | about 1 KB each                    |                    |                   |
 | Stored  | under 0.2 GB at steady state (90   | $0.02 per GB-month | < $0.01           |
 |         | days + 1 year)                     |                    |                   |
 | Writes  | about 15,000 appends a month       | $0.055 per 10,000  | about $0.08       |
 | Reads   | the daily check                    | $0.0044 per 10,000 | about $0          |
 | WORM    | no separate meter in the price     | -                  | $0                |
 |         | list                               |                    |                   |
 | Total   |                                    |                    | under $0.10       |
 |         |                                    |                    | (under $1 even at |
 |         |                                    |                    | 10 times the      |
 |         |                                    |                    | volume)           |
 +---------+------------------------------------+--------------------+-------------------+
 * List price, Israel Central, Hot LRS, read 2026-10-25 (Azure Retail Prices API).
```

**Evidence (2026-10-25):**
- **Azure Retail Prices API, Israel Central, Hot LRS:**
  - data stored: $0.02 per GB-month (lower tiers $0.0192 and $0.0184);
  - write operations: $0.055 per 10,000;
  - read operations: $0.0044 per 10,000.
  - The list shows no separate meter for immutability.
- **Microsoft Learn, container-level WORM:**
  - With `allowProtectedAppendWrites`, new blocks can be added to an append blob, and existing blocks cannot be changed or deleted.
  - Effective retention runs from the last append.
  - An unlocked policy can be changed by someone with rights over the policy. A locked policy cannot be changed or removed.

**Why WORM and not plain blob storage with a hash chain:**
- A hash chain alone only shows tampering. An attacker holding the core's identity could rewrite the whole chain.
- WORM stops deletion and changes even by the core's own identity: that identity has only a data role, with no rights over the policy.
- It costs nothing extra.

**Proposals (2026-10-25, awaiting the human):**
- **Two containers:**
  - audit-90d, for control and media access;
  - audit-1y, for security and config.
- **One append blob per day,** so each blob's retention clock starts within a day.
- **Lifecycle rules** delete blobs once their retention ends.
- **Lock or not:** the policy stays unlocked during the pilot, and the human decides whether to lock it afterwards. Locking cannot be undone, and the storage account cannot be deleted while it holds protected blobs.
- **Mode A:** a local append-only file with the hash chain, which is weaker and accepted for local use.
- **Trade-off:** an audit entry cannot be erased early. Entries hold only metadata, never images.
- **Carry-forward to data-storage:** which database holds the queryable copy.

## SC5 decided (2026-10-25)

**The human's answers, verbatim:**
- "1. yes, if this is the cost"
- "2. yes"
- "3. yes"

**Confirmation:** human-confirmed (lens-question, scope SC5). The SC5 row in the decision table states the decision:
- WORM blob storage in two containers, unlocked during the pilot;
- security and config entries kept for 1 year;
- get_history also returns the bridge's control entries.

**The condition "if this is the cost":** the estimate is an upper bound of under $0.10 a month. If the pilot shows real cost far above it, the decision comes back to the human.

## SC6 in discussion (2026-10-25; presented, awaiting the human)

```text
 +----+-------------------------------+---------------+----------------------------------+
 | #  | Risk that remains             | Status        | What limits it                   |
 +----+-------------------------------+---------------+----------------------------------+
 | R1 | an agent, the dot or Duet     | accepted      | audit, arm summary, control rate |
 |    | included, confirms its own    | (SC3)         | limit, auto-off, mode.changed to |
 |    | arm or lights (T2, T10)       |               | all                              |
 | R2 | Ring blocks the account       | accepted      | one rate limiter toward Ring     |
 |    | (unofficial access, T8)       | (product      |                                  |
 |    |                               | domain)       |                                  |
 | R3 | disarm missing on agents      | accepted      | ACTION_DISABLED; you disarm in   |
 |    | without MRTR and URL          | (lens 3)      | the Ring app                     |
 |    | elicitation                   |               |                                  |
 | R4 | the dot's memory holds when   | accepted for  | to confirm: the same for Claude  |
 |    | the house was empty (SC7)     | the dot       | Duet                             |
 | R5 | text in Ring data steers an   | to accept     | marked untrusted (B13); only arm |
 |    | agent to arm or switch lights |               | and lights; disarm needs you     |
 |    | (T1)                          |               |                                  |
 | R6 | OpenAI or Anthropic leak the  | to accept     | revoke-all, rotation, 90-day     |
 |    | tokens they hold for us       |               | max, security events; no disarm  |
 |    |                               |               | without you                      |
 | R7 | a bug in our own issuer lets  | to accept     | certified library, allow-lists,  |
 |    | tokens be minted (T11)        |               | tests, patching; no disarm       |
 |    |                               |               | without you                      |
 | R8 | the home VM is taken over:    | to accept     | outbound only, non-root,         |
 |    | the Ring token works without  |               | read-only image, encrypted       |
 |    | our gate, disarm included     |               | token, patching                  |
 |    | (T5)                          |               |                                  |
 +----+-------------------------------+---------------+----------------------------------+
```

**Proposals:**
- **R5 to R8 are to accept.**
- **R4:** confirm the same acceptance for Claude Duet's memory as for the dot's.
- **Control rate limit:** 20 control actions an hour per agent; hitting it raises a security event.
- **The per-agent elicitation-only switch** stays available, default off.

**R8 is the largest residual.** Whoever holds the Ring token can act on the Ring account directly, disarm included, bypassing the bridge's gate. It is inherent in B4 and B5, which keep unofficial access at home.

**The human's answers, verbatim:**
- "1. Yes for both, the VM is behind my Router Firewall"
- "2. Yes, Duet has the same capabilities and rights as Dot"
- "3. I am not sure that this is the number - if it is just for command - probably yes, if it is for reading data, probably not"

**Recorded:**
- **R5 to R8 accepted:** human-confirmed. The agent reads "Yes for both" as covering R5 to R8, the question asked, and states this reading back; the human can narrow it.
- **R4 for Claude Duet accepted:** human-confirmed. Duet has the same capabilities and rights as the dot.
- **Known:** the home VM sits behind the human's router firewall, which is consistent with B6 (no inbound ports).
- **Agent's note:**
  - The firewall blocks inbound attacks.
  - It does not stop a bad dependency (T7), or another device on the home network reaching the VM.
- **Carry-forward to devops-operations:** put the VM on its own network segment or Hyper-V switch, if the router allows it.

**Rate limits, in answer to answer 3 (proposal, awaiting the human):**
- The 20 an hour is for control commands only, counted on confirm.
- Reads have their own, higher per-agent limits (D5 named per-client limits but set no numbers):

```text
 +-----------------------+--------------+-----------------------------+------------------+
 | Kind of call          | Per agent    | Why                         | When hit         |
 +-----------------------+--------------+-----------------------------+------------------+
 | Control (arm, lights) | 20 an hour   | counted on confirm; a light | RATE_LIMITED and |
 |                       |              | with auto-off counts once   | a security event |
 | Reads from the core   | 600 an hour  | served from the event log   | RATE_LIMITED     |
 | (overview, devices,   |              | and cache; cheap            |                  |
 | events, history,      |              |                             |                  |
 | health)               |              |                             |                  |
 | Fresh frames, bursts  | 60 an hour   | each goes home and to Ring; | RATE_LIMITED     |
 |                       |              | battery guard applies       |                  |
 | Clips                 | 20 an hour   | the heaviest calls          | RATE_LIMITED     |
 | Everything toward     | one shared   | protects the account (T8)   | RING_UNAVAILABLE |
 | Ring                  | limiter at   |                             | or stale reads   |
 |                       | the          |                             |                  |
 |                       | connector    |                             |                  |
 +-----------------------+--------------+-----------------------------+------------------+
 All numbers are config defaults, tuned in the pilot.
```

## SC6 decided (2026-10-25)

**The human's answer, verbatim:** "agree" (to the per-kind rate-limit table above).

**Confirmation:** human-confirmed (lens-question, scope SC6). The SC6 row in the decision table now states the decision.

**What was decided:**
- **Risk register R1-R8 accepted.** R4 covers the dot and Claude Duet.
- **Per-agent rate limits,** all config defaults tuned in the pilot:
  - control (arm, lights): 20 an hour, counted on confirm; a light with auto-off counts once; hitting it raises a security event;
  - reads from the core (overview, devices, events, history, health): 600 an hour;
  - fresh frames and bursts: 60 an hour; clips: 20 an hour;
  - one shared limiter toward Ring at the connector; when it is full, reads come back stale (T8).
- The rest of SC6 stands as presented: a per-agent elicitation-only switch, default off; client support checked in S7.
- **Carry-forward to devops-operations** (from the SC6 answers): the VM's own network segment or Hyper-V switch.

## SC7 in discussion (2026-10-25; presented, awaiting the human)

SC7 is the last decision point of this lens. It covers the Ring terms, the people on camera, what the agent platforms keep, the shared locations, retention and deletion, and the open-source release.

**Where a picture of a visitor goes:**

```text
 WHERE A PICTURE OF A VISITOR GOES (SC7)

 Camera --> Ring cloud ----> Connector (home VM) ----> Core (Azure, Israel Central*)
            (already, under  fetches only when an      frame cache: 7 days
             your Ring plan) agent asks (get_frame,    audit: who asked, when;
                             get_burst, get_clip)      never the image
                                                                |
                                                                v
                                     Agent platform (OpenAI or Anthropic cloud)
                                     kept under their terms: chat history,
                                     memory (dot, Duet), training if you allow it
 * P2: Israel Central if the services are offered there (devops-operations).
 The bridge controls the connector and the core. It cannot pull back what an
 agent platform has already kept.
```

**The proposal (C1-C7):**

```text
 +-----+-------------------+-------------------------------------------------------------+
 | #   | Topic             | Proposal                                                    |
 +-----+-------------------+-------------------------------------------------------------+
 | C1  | Ring terms        | Already accepted in product-domain (ToS 2(h)). The README   |
 |     |                   | says: unofficial, not affiliated with or endorsed by Ring   |
 |     |                   | or Amazon, the account can be blocked, use at your own      |
 |     |                   | risk. No Ring logo.                                         |
 | C2  | People on camera  | Media only when an agent asks; 7-day cache; Israel Central  |
 |     |                   | if offered. No face recognition in the bridge (a            |
 |     |                   | product-domain non-goal). NEW: a per-camera 'media to       |
 |     |                   | agents' switch, so a camera that sees a neighbor or the     |
 |     |                   | street can be events-only.                                  |
 | C3  | Sound in clips    | CHANGED BY YOU: clips keep the sound Ring recorded; Ring's  |
 |     |                   | own audio setting per device decides. A per-camera switch   |
 |     |                   | can drop it (default: keep). The README tells open-source   |
 |     |                   | users that the law on recording sound differs by place.     |
 | C4  | What agent        | Outside our control. The README and the admin page point to |
 |     | platforms keep    | each platform's training and memory settings and recommend  |
 |     |                   | training off. The dot's and Duet's memory is already        |
 |     |                   | accepted.                                                   |
 | C5  | Shared locations  | Off until enabled, read-only (SC3). NEW: the admin page     |
 |     |                   | records each owner's agreement (who, date) as a config      |
 |     |                   | audit entry before the location turns on; media from their  |
 |     |                   | cameras is off by default.                                  |
 | C6  | Retention and     | Events 30 days, media 7 days, audit 90 days or 1 year (set  |
 |     | deletion          | earlier). NEW: an admin-page 'delete cached media and       |
 |     |                   | events now'. The audit holds who, what and when, never      |
 |     |                   | images, so the WORM copy holds no pictures.                 |
 | C7  | Open source       | MIT. Secure defaults: control off for unlisted clients,     |
 |     |                   | disarm off, shared locations off. SECURITY.md with GitHub   |
 |     |                   | private vulnerability reporting; dependency updates;        |
 |     |                   | licenses checked (B15); no telemetry sent to us.            |
 +-----+-------------------+-------------------------------------------------------------+
 NEW = not decided in an earlier lens; additive under D2.
 Not legal advice: the law points come from secondary sources (see SC7 evidence).
```

**Evidence tags:**
- **Known:** Amendment 13 to Israel's Protection of Privacy Law took effect in mid-August 2025 (sources give the 14th or the 15th). It names biometric data as especially sensitive. Law-firm summaries, not the statute.
- **Known:** Israel's Secret Monitoring Law (1979) forbids secretly monitoring a conversation without lawful authority. Whether a doorbell that picks up visitors' speech is "secret" monitoring is **unknown**; the sources do not settle it.
- **Known:** in Fairhurst v Woodard (Oxford County Court, 12 October 2021), the judge found the audio collected by a Ring doorbell and other cameras was processed unlawfully under UK data protection law. It is a county court ruling and not binding precedent.
- **Known:** the Privacy Protection Authority's 2023 smart-home recommendations include telling household members about possible recording. A PPA guidance specific to doorbells or home cameras was not found.
- **Known (help.openai.com):** data from connected apps is not used for training unless it appears in a conversation with "Improve the model for everyone" on, or is sent as feedback. Memory is a separate setting.
- **Known (anthropic.com, 2025):** Claude consumer chats are used for training only if the user allows it; then retention is 5 years, otherwise 30 days. The current default is **unknown**.
- **Assumed:** dropping the audio track from a clip needs no re-encoding (a remux). To check in implementation.
- **Not legal advice.** The agent is not a lawyer. The README tells open-source users they are responsible for their local law.

**Question to the human:** does C1-C7 work, in particular the three new controls (the per-camera media switch, clips without sound by default, and the recorded owners' agreement for shared locations)?

## SC7 answer: sound in clips (2026-10-25)

**The human's answer, verbatim:** "Sound in clips - if rings record it, we can show it. It is my home, my yard and in many case I will be part of the conversasion. If an intruder enters my premise, I want to listen"

**Recorded:**
- **C3 changed by the human (human-confirmed, scope SC7 C3):** clips keep the sound Ring recorded. Ring's own audio setting per device decides. A per-camera switch can still drop the sound; its default is keep. The README tells open-source users that the law on recording sound differs by place. The C3 row in the table above now says this.
- **C7 updated to match:** "sound off" is removed from the secure defaults.
- **Evidence (secondary source, recordinglaw.com):** Israel's Secret Monitoring Law defines secret monitoring as listening or recording "without the consent of any of the participants". When the human takes part in a conversation, it is not secret monitoring. The Protection of Privacy Law still limits how a recording is later shared.
- **Residual unknown:** talk between others that the human is not part of (for example an intruder's). The sources do not settle it. The human chose to keep sound with this stated to them.
- **Agent's note on listening:**
  - Under D1 rule 4, the model gets a clip's key frames; the sound travels only in the clip file, a resource link read with the OAuth token.
  - Whether ChatGPT or Claude play that file for the human is unverified (S7 capability matrix).
  - A live clip (get_clip with N seconds live) carries sound too. Continuous listening is two-way-audio and live-view territory, outside v1; the Ring app does it.
- **Open question to the human:** if S7 shows the chat apps cannot play clips, should the admin page play them (fresh Entra sign-in)? If yes, it is carried to ui-ux.
- **C1, C2 and C4-C7:** still awaiting the human.

## SC7 decided (2026-10-25)

**The human's answers, verbatim:** "1. yes" and "2. yes".
- Answer 1 is to "if S7 shows the chat apps cannot play clips, should the admin page play them?"
- Answer 2 is to "do C1, C2 and C4 to C7 work for you?"

**Confirmation:** human-confirmed (lens-question, scope SC7). C3 was changed by the human in the previous turn. The SC7 row in the decision table now states the decision.

**What was decided:** C1-C7 as in the SC7 table above, with C3 as changed. New and additive under D2:
- a per-camera "media to agents" switch;
- a per-camera switch to drop sound (default: keep);
- the shared-location owners' agreement recorded before a location turns on, their media off by default;
- "delete cached media and events now" on the admin page;
- an admin-page clip player, if S7 shows the chat apps cannot play clips.

## Lens 4 summary (2026-10-25; closed by the human's "move on")

**Trust boundaries and controls, as decided** (this updates the lens-open proposal at the top):

```text
 TRUST BOUNDARIES AND CONTROLS, AS DECIDED (topology H, SC1-SC7)

 ZONE 1: CLIENTS               ZONE 2: AZURE CORE             ZONE 3: HOME VM
 untrusted: models can be      trusted, but open to the       most trusted: holds
 steered by what they read     internet (T4, T11)             the Ring token
 +--------------------+        +-------------------------+    +--------------------+
 | ChatGPT + dot,     | T1-T3  | Issuer (ours): listed   |    | Connector          |
 | Claude + Duet,     |--(1)-->| agents only; you sign   | T6 | Ring token, push   |
 | Claude Code:       | our    | in with Entra           |<(4)| creds, device ID,  |
 | read, media, ctrl  | token  | MCP endpoint: scopes,   |WSS | connector key:     |
 +--------------------+        | rate limits             |    | encrypted file     |
 | shim: read;        |--(2)-->| Confirm page: fresh     |    | one Ring limiter   |
 | gate app: read,    | our    | Entra sign-in + PIN     |    | outbox          T5 |
 | media              | token  | Key Vault (managed id)  |    +---------+----------+
 +--------------------+        | Audit: hash chain, WORM |              | (5) T8
 | Foundry, ACA:      |--(7)-->| Frames 7 d, events 30 d |              v
 | read, media        | Entra  | Admin page: Entra       |         Ring cloud
 +--------------------+        | sign-in                 |    (ToS 2(h) accepted)
 ChatGPT MCP Events <---(3)----| Delivery (S4)           |
 Ring official API ----(6)---->| HMAC webhooks, if S1    |
                               +-------------------------+
 Entra ID (your tenant): your sign-in (passkey, MFA) and the Azure agents' identities.
 MODE A (all-in-one at home, B3): stdio, or an endpoint bound to localhost only.
```

**Decisions:**

```text
 +-----+---------------------------------------------------------------------------------+
 | #   | Decided                                                                         |
 +-----+---------------------------------------------------------------------------------+
 | SC1 | Our issuer in the core (node-oidc-provider): CIMD or DCR for listed agents      |
 |     | only; you sign in with Entra (your tenant). Access tokens 1 h; refresh tokens   |
 |     | rotate, 30 days unused, 90 days at most.                                        |
 | SC2 | Connector: key pair + code check on the admin page. Shim: PKCE through Entra.   |
 |     | Gate app: private-key client credentials. Azure agents: their managed identity. |
 |     | Core: managed identity.                                                         |
 | SC3 | Scopes read, media, control. Control (arm, lights) for ChatGPT + dot and every  |
 |     | Claude surface + Duet. Disarm off unless switched on, then MRTR + URL           |
 |     | elicitation + PIN. Lights auto-off. Shared locations read-only, with consent.   |
 | SC4 | Ring secrets only at home, in an encrypted file. Core secrets in Key Vault. No  |
 |     | client secret. Refresh grants hashed. PIN argon2id; 5 wrong tries lock disarm   |
 |     | 15 min.                                                                         |
 | SC5 | Hash-chained audit: a database copy + WORM blob (90 days / 1 year). Under $0.10 |
 |     | a month.                                                                        |
 | SC6 | R1-R8 accepted. Per agent: control 20/h, reads 600/h, fresh frames 60/h, clips  |
 |     | 20/h; one shared Ring limiter.                                                  |
 | SC7 | README disclaimer; per-camera media switch; clips keep Ring's sound;            |
 |     | training-off advice; owners' agreement recorded; delete-now; MIT, SECURITY.md,  |
 |     | no telemetry; admin-page clip player if S7 needs it.                            |
 +-----+---------------------------------------------------------------------------------+
```

**Carry-forwards:**
- **data-storage:** the audit database copy; events 30 days, media 7 days; delete-now.
- **observability-resilience:** security events (PIN lockout, rate limits, the daily audit-copy check).
- **devops-operations:**
  - where the gate app runs (it holds a private key);
  - the VM on its own network segment or Hyper-V switch;
  - Israel Central (P2);
  - the WORM lock decision after the pilot.
- **ui-ux:** the admin page. It covers:
  - enrollment, revoke-all and the agent list;
  - the per-camera switches and the owners' agreement;
  - delete-now, and the clip player if S7 needs it.
- **component-design:** the issuer component; the auto-off timer owner (lean: the connector); a per-client last-read mark for dots.
- **S7 spike, added:** whether ChatGPT and Claude play a clip resource (MP4 with sound).
- **Pilot checks:**
  - a light improves night frames;
  - managed identity works as a federated credential on Container Apps;
  - tuning the rate limits;
  - dropping sound needs no re-encoding.

## Lens closed (2026-10-25)

**The human's answer, verbatim:** "move on" (to "is there anything else you want to change in this lens? If not, say 'move on'").

**Confirmation:** human-confirmed, scope lens-question. Each of SC1-SC7 was presented and answered by the human one at a time; there was no batch confirmation. The lens is recorded in `lens-applicability.json` as `workshop.security-compliance`.

**Not decided here, owned elsewhere:** the carry-forwards listed in the summary above, the S7 spike (agreed, not yet run), the pilot checks, and spikes S1 and S2 (each still needs the human's separate go).

## Pacing

The lens has 7 decision points. The human did not pick a pacing option. Their message was about SC1, so the agent steps through the lens one point at a time, starting with SC1, and has stated this to the human. The human can still ask for the rest all at once.

## Amendments from later lenses

- **2026-10-26, devops-operations (human-confirmed):** the SC2 "gate app" client entry (a private key, client credentials) is dropped, because the gate app (FliessGateControl, an Azure Function) is not a client of the bridge; the bridge calls it instead, with its function key stored in the core's Key Vault (SC4). See `devops-operations.md`.
- **2026-10-28, component-design (human-confirmed):** the bridge no longer calls FliessGateControl, so its function key is not stored in the core's Key Vault (SC4). The SC2 gate-app entry stays dropped. See `component-design.md`.
- **2026-10-28, component-design A1 (human-confirmed):** SC4's 90-day signing-key rotation is owned by the Scheduler (a daily tick) and Admin, writing through Secrets with write rights on that one secret; the old key is kept for checking. The PIN is changed on the admin page and written the same way. See `component-design.md`.
