# DevOps & Operations — Ring MCP Bridge

**Depth**: Medium.
**Status**: CLOSED 2026-10-26. The human said "move on" after the lens summary. Confirmation: human-confirmed, scope lens-question, per decision point DO1-DO7 and the follow-ups ?1-?3 (answered 2026-10-26).
**Inputs**:
- `architecture-core.md`: topology H; B3, B4, B6 (no inbound ports at home), B7, B15 (license checks); P1 (Container Apps vs App Service B1), P2 (Israel Central), P3 (Linux VM on Hyper-V; the same image runs on the Mac);
- `security-compliance.md`: SC1 (managed-identity federated credential to Entra), SC2 (the gate app's private key; where it runs is carried here), SC4 (Key Vault, Ring secrets only at home), SC5 (WORM; lock after the pilot), SC6 (the VM's own network segment), SC7 (MIT, GitHub private vulnerability reporting, no telemetry);
- `data-storage.md`: DS3 (Azure SQL Basic, Blob), DS5 (restore drill; CI on SQLite and SQL Server; the Ring token never backed up), network access to the database;
- `observability-resilience.md`: OR3 (action group with email and SMS; probes; alerts as code), log retention, Docker log rotation, a test alert.

## Carried in

- Topology H: the core in Azure, one instance (B7); the connector at home, dialing out only (B6); Mode A for development and open-source users.
- Cost matters (lens 5); every hosting option here is priced.
- Brownfield detection (2026-10-26): no git remote yet; local branches `main` and `001-ring-mcp-bridge`; the repository holds the Specrew and Squad template workflows (`specrew-ci.yml`, `specrew-work-kind.yml`, `specrew-confidence-lane.yml`, `specrew-project-sync.yml`, `squad-*.yml`), whose branch filters still name the template's own branch; no `.specrew/repository-governance.yml`; branch protection cannot be detected without a remote. Proposal: ADAPT (keep these lanes, fix their branch filters, add the project lanes), not overwrite.

## Decision points DO1-DO7 (from the lens and the carry-forwards; 2026-10-26, proposals awaiting the human)

**Deployment topology and promotion path (the lens diagram):**

```text
 DEPLOYMENT TOPOLOGY AND PROMOTION PATH (proposal)

 GITHUB (the forge)                    AZURE, Israel Central (one resource group)
 +---------------------------+         +--------------------------------------------+
 | PR checks: lint, types,   |         | App Service B1 Linux: 1 instance, Always On|
 |  unit, MCP contract (both |         |  core container, pulled by digest          |
 |  eras), SQLite and SQL    | deploy: |  managed identity --+--> Key Vault         |
 |  Server, upgrade N-1 to N,|-------->|  VNet integration,   +--> Azure SQL Basic   |
 |  latency, licenses        | OIDC +  |  service endpoints   +--> Blob (media, WORM)|
 | main: build images to     | your    |  logs -> Log Analytics -> alerts -> email, |
 |  ghcr.io (core amd64;     | approval|                                     SMS    |
 |  connector amd64 + arm64) |         +--------------------------------------------+
 +-------------+-------------+           ^ WSS, outbound    ^ HTTPS (MCP)     ^ HTTPS
               |                         | only (B6)        | client creds    | agents
               | you pull it at home     |                  |                 | (dot,
               v                         |                  |                 | Claude)
 HOME, behind your router                |                  |
 +-------------------------------------+ |  +----------------+-----------------+
 | Hyper-V: Ubuntu 24.04 VM, Docker    | |  | Mac Mini: your gate app (G2),     |
 |  connector container ---------------+-+  | its private key in the Keychain   |
 |  outbox (SQLite), secrets file      |    +-----------------------------------+
 |  VM kept out of backups (DS5)       |
 +-------------------------------------+
 Dev: your laptop runs Mode A (SQLite). CI is throwaway. No staging: the pilot runs on
 production with disarm off (SC3).
```

**Hosting the core (DO1, P1):**

```text
 +------------------------+------------------------------------------+--------------+
 | Option                 | What it means here                       | Month        |
 +------------------------+------------------------------------------+--------------+
 | App Service B1 Linux   | 1 core, 1.75 GB, Always On, WebSockets.  | $14.45       |
 | (lean)                 | One flat price, whatever the traffic.    |              |
 | Container Apps (P1 as  | 0.25 vCPU, 0.5 GiB. Billed at the active | ~$20 (~$6 if |
 | framed)                | rate while any request is open; the      | idle)        |
 |                        | connector's WebSocket and the agents'    |              |
 |                        | listen streams are always open, so the   |              |
 |                        | idle rate would rarely apply (assumed).  |              |
 | A small Linux VM (not  | B2ats v2 at $7.81, plus a disk and a     | ~$12 or more |
 | offered)               | public IP, and you patch the OS and run  |              |
 |                        | TLS.                                     |              |
 +------------------------+------------------------------------------+--------------+
 Whole Azure bill with the lean: about $23 a month (B1 $14.45, SQL Basic $6.46,
 alerts $1.50, Blob and WORM under $1, Key Vault cents). List prices, Israel Central,
 read 2026-10-26; Container Apps after its free monthly grant.
```

**The proposal:**

```text
 +-----+----------------+-------------------------------------------------------------+
 | #   | Decision       | Proposal                                                    |
 +-----+----------------+-------------------------------------------------------------+
 | DO1 | Hosting        | Core: App Service B1 Linux in Israel Central (P1, P2), its  |
 |     |                | database backups kept in the region. Home: Ubuntu 24.04 LTS |
 |     |                | VM on Hyper-V (2 vCPU, 2 GB, 20 GB) with Docker, automatic  |
 |     |                | security updates, starts with the host, kept out of backups |
 |     |                | and checkpoints (DS5), on its own Hyper-V switch or VLAN if |
 |     |                | the router allows (SC6). Gate app: on the Mac Mini, its key |
 |     |                | in the Keychain.                                            |
 | DO2 | Infrastructure | Bicep, run by azd (one 'azd up'). Your email and phone are  |
 |     | as code        | deploy-time values, never committed. Manual, in a runbook:  |
 |     |                | the Ring login at home, the S1 secrets into Key Vault, the  |
 |     |                | connector enrollment, the WORM lock after the pilot         |
 |     |                | (irreversible), the restore drill.                          |
 | DO3 | Environments   | Dev (your laptop, Mode A), CI (throwaway: SQLite, a SQL     |
 |     |                | Server container, Azurite), production (your Azure and VM). |
 |     |                | The same images everywhere; only config differs. No         |
 |     |                | staging: the pilot runs on production with disarm off.      |
 | DO4 | Secrets and    | Key Vault references in the app settings, never plaintext.  |
 |     | config         | Ring secrets only at home (SC4). Config layers: code        |
 |     |                | defaults, then deploy settings, then admin-page settings in |
 |     |                | the database (audited). GitHub signs in to Azure by OIDC,   |
 |     |                | with no stored secret.                                      |
 | DO5 | CI/CD          | GitHub Actions. PR: the checks in the diagram. Main: images |
 |     |                | to ghcr.io (free for public, with provenance), deploy after |
 |     |                | your approval, smoke test (/readyz, get_health). Rollback:  |
 |     |                | redeploy the previous image (additive schema, D2). The      |
 |     |                | connector is never auto-updated: the admin page says when   |
 |     |                | it is behind and you pull it. The template's Specrew lanes  |
 |     |                | are kept and their branch names fixed.                      |
 | DO6 | Identities and | Core identity: Key Vault Secrets User, Storage Blob Data    |
 |     | access         | Contributor, a database user that reads, writes and         |
 |     |                | migrates. Deploy identity: Contributor plus limited role    |
 |     |                | assignment, on the resource group only. SQL's Entra admin   |
 |     |                | is an empty group you join only to break glass. SQL,        |
 |     |                | Storage and Key Vault reachable only from the app's subnet  |
 |     |                | (free service endpoints); Entra-only sign-in to SQL; no     |
 |     |                | private endpoint.                                           |
 | DO7 | Repository     | GitHub (assumed from SC7). Trunk: main protected, feature   |
 |     |                | branches by PR; required checks (governance, lint, tests);  |
 |     |                | applies to admins, no bypass; no force pushes or deletions; |
 |     |                | 0 required approvals (GitHub does not let you approve your  |
 |     |                | own PR) with comment resolution; automated review off       |
 |     |                | unless you want Copilot; tags by you or automation; a       |
 |     |                | release-validation record; one repository.                  |
 +-----+----------------+-------------------------------------------------------------+
```

## Knock-on changes if P1 becomes App Service (a preference, so no redesign)

- The probes named for Container Apps in OR3 become App Service's health check on `/readyz` plus auto-heal on `/livez` (assumed equivalent for one instance).
- SC1's managed-identity federated credential to Entra, "to confirm on Container Apps", is confirmed on App Service instead (a user-assigned identity; assumed to work the same).
- A deploy starts the new container before stopping the old one, so two may overlap briefly; the B7 lease in the database (lens 6) keeps only one acting.
- WebSockets and Always On are switched on in the Bicep.

## Repository governance (DO7; to write to `.specrew/repository-governance.yml` once confirmed)

The invariant: main (the release-truth branch) is protected; feature closeout happens before merge; a merged PR does not leave its work item open; post-merge release, CI or docs findings open a NEW PR-backed work item (docs-only, devops or bug-bash) plus a separate release-validation record, never a reopen of the merged feature.

- provider: github (assumed from SC7; no remote yet); enforcement: rulesets (assumed free on a public repository; a private repository needs a paid GitHub plan);
- branch model: trunk; release truth `main` (protected, PR required, required checks: Specrew governance and lint, project tests and build; no force pushes or deletions); feature branches `NNN-name` merge into `main`;
- apply to admins: yes; bypass actors: none;
- review gate: 0 required approvals (solo maintainer; GitHub does not allow approving your own PR), comment resolution required; automated review off by default (Copilot suggested only if the human opts in); merge requires status checks;
- release tags: human or automation; a release-validation record separate from feature closeout: yes; single repository.
- Honesty: the work-kind check starts advisory (warns, does not block) until proven.

## Evidence tags

- **Known:** list prices from the Azure Retail Prices API, Israel Central, read 2026-10-26: App Service Basic B1 Linux $0.0198 an hour (about $14.45 a month); Container Apps consumption vCPU $0.000034 a second active and $0.000004 idle, memory $0.000004 per GiB-second, requests $0.40 per million; VM B2ats v2 Linux $0.0107 an hour; Key Vault operations $0.0396 per 10,000.
- **Known:** Container Apps gives each subscription 180,000 vCPU-seconds, 360,000 GiB-seconds and 2 million requests free a month; a replica is idle only when it is not processing any HTTP request, uses under 0.01 vCPU and receives under 1,000 bytes a second (Microsoft Learn, Container Apps billing). Private endpoints bring a management charge there.
- **Known:** App Service virtual network integration works on Basic, at no extra charge, and reaches service-endpoint-secured services (Microsoft Learn).
- **Known:** Azure SQL Basic keeps point-in-time restore for 1-7 days (7 by default), included in the price in the DTU model; backups are geo-redundant by default and can be set to local or zone redundancy (Microsoft Learn, automated backups).
- **Assumed:** an open WebSocket or listen stream counts as an HTTP request being processed, so Container Apps would bill at the active rate (about $20 a month with the free grant).
- **Assumed:** App Service's health check and auto-heal cover one instance as the Container Apps probes would; the user-assigned identity works as a federated credential to Entra on App Service; the Bicep Microsoft Graph extension can create the Entra app registration (else it is a runbook step).
- **Assumed:** rulesets on a private repository need a paid GitHub plan; Israel Central's paired region (for geo-redundant backups) is not checked, so local redundancy keeps backups in Israel.

## The human's answers (2026-10-26)

Verbatim:

> 1. App Service B1, fine, but have you considered Foundry agent hosting? Or it is not suitable for the MCP server?
> 2. Currently the Gate App is Azure function, but I will see if I will change it. Do not worry about it now. The only thing that we need from the MCP is to know the gate status: C:\Dev\FliessGateControl
> 3. Private at the beginning, public when we will feal that it is stable and correct and ready to be shared, but even in private - no secret in the source code. GHCP should review all
> 4. D02 - bicep yes, why not using GH Actions?
> 4. D03 - dev - my desktop (current PC and maybe my laptop)
> 4. D04 - Azure KV and Github action secrets
> 4. D05 - yes
> 4. D06 - yes
> 4. Do7 - yes to all

**Decided (human-confirmed, lens-question):**
- **DO1 hosting the core (P1):** App Service B1 Linux. The knock-on changes listed above apply (health check and auto-heal; the managed-identity federated credential checked on App Service).
- **DO2:** Bicep, deployed by GitHub Actions (what-if on each PR, deploy on main after the human's approval). The agent drops azd: one deploy path, fewer tools. Open-source users get the same Bicep and a README command.
- **DO3:** dev is the human's Windows desktop (and maybe the laptop): Node, Docker Desktop (for the SQL Server container and the connector), Mode A on SQLite. CI is throwaway; production is the human's Azure and VM; no staging.
- **DO4:** runtime secrets in Azure Key Vault; pipeline values in GitHub Actions secrets (the alert email and phone) and variables (subscription, tenant and client IDs, which are not secret but stay out of the code); Azure sign-in by OIDC, so no Azure password is stored in GitHub. No secret in the source code, even while private: a secret scan (for example gitleaks) runs as a required PR check and as a local pre-commit hook; GitHub push protection is switched on when the repository goes public.
- **DO5, DO6:** as proposed.
- **DO7:** as proposed, plus: private at first, public when the human judges it stable and ready; GitHub Copilot reviews every PR automatically (automated review on, provider copilot); with comment resolution required, Copilot's comments must be resolved before a merge.

**Foundry agent hosting (the human's question):** considered and not suitable for the core. Foundry hosted agents (GA 2026) run the human's agent code, not a general server:
- they expose agent protocols (Responses, Invocations, Invocations over WebSocket, Activity, A2A) behind the Foundry project endpoint with Entra sign-in, not an MCP endpoint with our own OAuth issuer (SC1) that ChatGPT and Claude can connect to;
- compute is per session, in its own sandbox, released after an idle timeout of 2 to 240 minutes; there is no single always-on instance, so the connector's WebSocket, the minute ticks (home-offline detection) and the single-instance lease (B7) cannot live there;
- they support Python and C#, not TypeScript (B2);
- Israel Central is not in the region list (P2);
- images come from Azure Container Registry.
Where Foundry fits: as a client. A Foundry agent connects to the bridge's MCP endpoint (already in scope: SC1, SC2, the S7 matrix).

**The gate (the human's answer 2; the agent's reading, open as question ?1):** the human's existing FliessGateControl Azure Function (.NET 8 isolated) already computes the gate state: `GetGateStatus` (Custom Vision predictions on its own camera's image: Closed, Open, Middle, People, car entering or exiting), `IsGateClosed`, `GetStateFromTable` (the state its 5-minute timer stores), plus `SafeOpenGate` and `SafeCloseGate` through IoT Hub. Its camera is not a Ring camera. The agent reads the answer as: agents should be able to ask the bridge for the gate status, which the bridge reads from that function; the bridge does not open or close the gate. If confirmed:
- it amends G1 (architecture-core: frames only) with a read-only gate-status source, and adds a read tool to the catalog (integration-api; additive under D2);
- the SC2 "gate app" client entry (a private key, client credentials) is dropped, because the gate app is not a client of the bridge;
- the function key (the functions use AuthorizationLevel.Function) is a secret in the core's Key Vault (DO4);
- which function to call (live prediction or the stored state), caching and `as_of` are set in component-design; the human said not to worry about it now.

## Open after the answers

1. **?1 The gate reading:** is it right that the bridge only reads the gate status from FliessGateControl (no open or close)?
2. **?2 GitHub plan:** protection (rulesets) on a private repository needs a paid plan such as GitHub Pro (assumed). With it, enforcement is `rulesets`; without it, enforcement is `ci-only` until the repository is public.
3. **?3 How the core reaches App Service while private:** private images on ghcr.io need a token to pull. Options:
   - **deploy the core as code** to App Service's Node runtime from GitHub Actions (the agent's lean): no registry, no secret, $0; the same built artifact as Mode A, not the same image; the connector image stays on private ghcr.io, pulled at home with a read-only token kept on the VM;
   - Azure Container Registry Basic at $0.1666 a day (about $5 a month), pulled by the core's managed identity: no secret, but a cost;
   - a ghcr.io token in App Service: a secret that expires (not offered).
4. **DO1's other parts** (Israel Central; the Ubuntu VM details) were in the DO1 row; the human answered the hosting choice. To confirm with the open items.

**Topology with the answers so far:**

```text
 DEPLOYMENT TOPOLOGY (2026-10-26, with your answers; ? = still open)

 GITHUB, private repo for now          AZURE, Israel Central (one resource group)
 +---------------------------+         +--------------------------------------------+
 | PR: lint, types, unit,    |         | App Service B1 Linux: 1 instance, Always On|
 |  MCP contract (both eras),|         |  core: Node LTS app, deployed as code (?3) |
 |  SQLite and SQL Server,   | GitHub  |  managed identity --+--> Key Vault         |
 |  upgrade N-1 to N,        | Actions:|  VNet integration,   +--> Azure SQL Basic   |
 |  latency, licenses,       |-------->|  service endpoints   +--> Blob (media, WORM)|
 |  secret scan; Copilot     | Bicep + |  logs -> Log Analytics -> alerts -> email, |
 |  reviews every PR         | app, by |                                     SMS    |
 | main: connector image to  | OIDC,   +-----+------------------------------^-------+
 |  ghcr.io (amd64 + arm64)  | after   |     | HTTPS: gate status (?1),     | HTTPS
 +-------------+-------------+ your    |     v function key in Key Vault    | agents
               |               approval|  +-----------------------------+    | (dot,
               | you pull it at home      | Your gate Azure Function    |    | Claude,
               v (read-only token)        | (FliessGateControl)         |    | Foundry)
 HOME, behind your router                 +-----------------------------+
 +-------------------------------------+
 | Hyper-V: Ubuntu 24.04 VM, Docker    |  WSS, outbound only (B6), to the core
 |  connector container ---------------+------------------------------------> (above)
 |  outbox (SQLite), secrets file      |
 |  VM kept out of backups (DS5)       |
 +-------------------------------------+
 Dev: your Windows desktop (and maybe the laptop): Node, Docker Desktop, Mode A on
 SQLite. CI is throwaway. No staging: the pilot runs on production with disarm off.
```

**Evidence tags (this turn):**
- **Known:** Foundry hosted agents: protocols, per-session sandboxes with a 2-240 minute idle timeout, Python and C#, the region list without Israel Central, images from Azure Container Registry (Microsoft Learn, hosted agents, updated 2026-10-20); hosted agents GA (Azure update, June 2026).
- **Known:** Azure Container Registry Basic $0.1666 a day in Israel Central (Azure Retail Prices API, read 2026-10-26).
- **Known:** FliessGateControl's functions and gate states, read from the human's local repository (read-only, 2026-10-26).
- **Assumed:** rulesets on a private personal repository need GitHub Pro; pulling a private ghcr.io image needs a token; push protection for a private personal repository is not available without a paid add-on.

## Follow-up answers (2026-10-26)

Verbatim:

> 1. Yes for the MCP bridge, the Function App does it.
> 2. Yes, you can check my github using the gh command, or browse to github.com/alonf
> 3. I already have a container registry that we can reuse, or we can deploy a new one
> 4. Yes

- **?1 The gate:** confirmed. The bridge only reads the gate status; the FliessGateControl Function App alone opens and closes the gate. Amendment notes were added to `architecture-core.md` (G1), `integration-api.md` (a read tool, additive) and `security-compliance.md` (the SC2 gate-app client entry dropped; the function key in Key Vault).
- **?2 GitHub plan:** checked read-only with `gh` on 2026-10-26. The plan name is not visible to the available token scopes. For the human's existing private repository, the API answers "Branch not protected" (and an empty ruleset list), not an "upgrade" error, which indicates a plan that supports protection on private repositories. Enforcement is recorded as `rulesets`, with `ci-only` as the fallback if that proves wrong.
- **?3 The core's packaging:** a container, from the human's existing container registry (reused; no new cost). The core pulls with its managed identity (AcrPull on that registry); GitHub Actions pushes with AcrPush scoped to that registry only. The registry is referenced by name as a deploy-time value and stays outside this project's Bicep. The connector image goes to ghcr.io (amd64 and arm64), pulled at home with a read-only token while private. "Deploy as code" was not chosen.
- **DO1's other parts:** confirmed (Israel Central; the Ubuntu VM details).
- **Confirmation:** human-confirmed, scope lens-question, per decision point DO1-DO7.

## Lens 7 summary (as decided, 2026-10-26)

```text
 +-----+----------------+-------------------------------------------------------------+
 | #   | Decision       | Decided                                                     |
 +-----+----------------+-------------------------------------------------------------+
 | DO1 | Hosting        | Core on App Service B1 Linux, Israel Central, as a          |
 |     |                | container from your existing registry (managed-identity     |
 |     |                | pull). Home: Ubuntu 24.04 VM on Hyper-V with Docker, out of |
 |     |                | backups, own switch if possible. Gate: your                 |
 |     |                | FliessGateControl function; the bridge only reads its       |
 |     |                | status.                                                     |
 | DO2 | Infrastructure | Bicep, deployed by GitHub Actions (what-if on PRs, deploy   |
 |     | as code        | on main after your approval); no azd. Manual runbook steps: |
 |     |                | Ring login, S1 secrets, enrollment, WORM lock after the     |
 |     |                | pilot, restore drill.                                       |
 | DO3 | Environments   | Dev on your Windows desktop (and maybe the laptop);         |
 |     |                | throwaway CI; production. No staging; the pilot runs on     |
 |     |                | production with disarm off.                                 |
 | DO4 | Secrets and    | Runtime secrets in Key Vault (including the gate function   |
 |     | config         | key); pipeline values in GitHub Actions secrets and         |
 |     |                | variables; OIDC to Azure. No secret in the code: a secret   |
 |     |                | scan in CI and a pre-commit hook; push protection when      |
 |     |                | public.                                                     |
 | DO5 | CI/CD          | GitHub Actions: the PR checks, the core image to your       |
 |     |                | registry, the connector image to ghcr.io, deploy after      |
 |     |                | approval, smoke test, rollback to the previous image. The   |
 |     |                | connector is updated by you, never automatically.           |
 | DO6 | Identities and | Core: Key Vault Secrets User, Blob Data Contributor, a      |
 |     | access         | read-write-migrate database user, AcrPull on your registry. |
 |     |                | Deploy: Contributor plus limited role assignment on the     |
 |     |                | resource group, AcrPush on your registry only. SQL Entra    |
 |     |                | admin: an empty break-glass group. Service endpoints only;  |
 |     |                | Entra-only SQL sign-in.                                     |
 | DO7 | Repository     | GitHub, private until you judge it ready, then public.      |
 |     |                | Trunk; main protected by rulesets; required checks; Copilot |
 |     |                | reviews every PR and its comments must be resolved; no      |
 |     |                | force pushes; one repository. Written to                    |
 |     |                | .specrew/repository-governance.yml (schema-valid).          |
 +-----+----------------+-------------------------------------------------------------+
```

**The as-decided lens diagram:**

```text
 DEPLOYMENT TOPOLOGY (lens 7 as decided)

 GITHUB, private repo for now          AZURE, Israel Central (one resource group)
 +---------------------------+         +--------------------------------------------+
 | PR: lint, types, unit,    |         | App Service B1 Linux: 1 instance, Always On|
 |  MCP contract (both eras),|         |  core container from your registry         |
 |  SQLite and SQL Server,   | GitHub  |  managed identity --+--> Key Vault         |
 |  upgrade N-1 to N,        | Actions:|  VNet integration,   +--> Azure SQL Basic   |
 |  latency, licenses,       |-------->|  service endpoints   +--> Blob (media, WORM)|
 |  secret scan; Copilot     | Bicep + |  logs -> Log Analytics -> alerts -> email, |
 |  reviews every PR         | image,  |                                     SMS    |
 | main: core image to your  | by OIDC,+-----+------------------------------^-------+
 |  registry; connector image| after   |     | HTTPS: gate status, read     | HTTPS
 |  to ghcr.io (amd64, arm64)| your    |     v only; key in Key Vault     | agents
 +-------------+-------------+ approval|  +-----------------------------+    | (dot,
               |                          | Your gate Azure Function    |    | Claude,
               | you pull it at home      | (FliessGateControl); it     |    | Foundry)
               v (read-only token)        | alone opens and closes      |
 HOME, behind your router                 +-----------------------------+
 +-------------------------------------+
 | Hyper-V: Ubuntu 24.04 VM, Docker    |  WSS, outbound only (B6), to the core
 |  connector container ---------------+------------------------------------> (above)
 |  outbox (SQLite), secrets file      |
 |  VM kept out of backups (DS5)       |
 +-------------------------------------+
 Your existing container registry is reused: the core pulls with its managed identity
 (AcrPull); GitHub pushes with AcrPush on that registry only.
 Dev: your Windows desktop (and maybe the laptop). CI is throwaway. No staging: the
 pilot runs on production with disarm off.
```

**Repository governance file:** `.specrew/repository-governance.yml`, validated against `repository-governance.schema.json` (Test-Json: True).

**Carry-forwards:**
- **component-design:** the gate-status source (which function: live prediction or the stored state; caching; `as_of`), a Gate Access resource-access component; the lease owner; who computes health.
- **integration-api (amended):** a read-only gate-status tool, additive under D2; named in component-design.
- **code-implementation:** the secret-scan tool and pre-commit hook ("no new dependency" first); the CI job names behind the required checks.
- **ui-ux:** the admin page shows "connector behind" so you know to pull a new image.
- **Runbook (plan):** the registry name and resource group as deploy-time values; the Ring login, S1 secrets, enrollment, WORM lock after the pilot, restore drill, and one end-to-end test alert.
- **Pilot:** confirm the App Service health check and auto-heal on one instance, and the managed-identity federated credential to Entra on App Service.

## Questions to the human

1. Hosting the core: App Service B1 (the agent's lean, $14.45 flat) or Container Apps (about $20 while connections stay open)?
2. Does the gate app run on the Mac Mini, with its key in the Keychain?
3. Will the repository live on GitHub? Public from the start, or private until the first release (protection on a private repository needs a paid plan)? Copilot automated review: on or off?
4. Are DO2-DO7 right as proposed?

## Pacing

The lens has 7 decision points. The agent offered: answer all at once, or go one at a time starting with hosting. The human answered all at once on 2026-10-26; the agent then asked the open follow-ups ?1-?3 and DO1's remaining parts, which the human answered. The agent presented the lens summary and asked whether to change anything or move on.

## Lens closed

2026-10-26: the human, verbatim: "move on". Lens 7 is closed; next is lens 8, ui-ux (light).

## Amendments from later lenses

- **2026-10-28, component-design (human-confirmed):** the gate part of DO1 is reversed. The bridge does not read the gate status from FliessGateControl, and there is no function key in Key Vault (DO4). The gate is seen only through Ring camera frames (G1, frames only). FliessGateControl is not touched and stays outside the bridge. See `component-design.md`.
- **2026-10-28, component-design A1 (human-confirmed):** DO6 changes for two secrets. The core's identity also gets Key Vault Secrets Officer, scoped to the secrets `pin-hash` and `issuer-signing-keys` only; it keeps Key Vault Secrets User on the rest. The deploy identity's limited role assignment adds Key Vault Secrets Officer to its allow-list. Placeholders for both secrets are created on the first deploy, and later deploys never touch their values (to settle at plan). See `component-design.md`.
- **2026-10-28, component-design (human-confirmed need):** DO2 gains a need: a bootstrap script, run once by the human from their PC. It covers the sign-in, picking the subscription at run time, the resource group, the deploy identity with its GitHub OIDC federated credential, the deploy identity's limited roles, and the GitHub environment variables. Nothing about the human's subscription goes into git. It is written at implementation; the proposed scope is in `component-design.md`.
