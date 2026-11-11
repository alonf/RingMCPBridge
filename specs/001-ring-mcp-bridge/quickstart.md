# Quickstart: validating iteration 001

**Feature**: `001-ring-mcp-bridge` | **Iteration**: 001 (design-analysis Option B, part 1) | **Date**: 2026-11-02

This quickstart is for a developer validating iteration 001. That iteration delivers US1 (state) on the real hybrid path: agents read the home after signing in. The path has five parts:

- the home connector;
- the WSS link;
- the Azure core;
- the bridge's own Issuer, with Entra sign-in;
- the read scope only.

Iteration 001 also delivers:

- a minimal admin page (health, and comparing the enrollment code);
- Bicep with the GitHub Actions deploy;
- the first agent trial: ChatGPT and Claude sign in and read the home, and the 7-day Ring-session soak starts.

Mode A (all-in-one) runs for development and CI.

Iteration 002 adds US2 (real-time events): pushed events, `get_events`, the dot, and the out-of-band heartbeat and home-offline alerts. Its steps and rows are kept here and marked **iteration 002**. They are not checked in iteration 001.

**How to read the steps**: the records decide the tools, the paths and a few commands. Where no command is named, the step is described in words, and the exact command or script name is set at implement. Values that belong to the owner are always shown as placeholders: `<subscription>`, `<resource-group>`, `<registry>`, `<owner>/<repo>`, `<core-host>`. Real values never go into the repository.

Decisions and their sources are in `research.md` (entries R1 to R29). The items the records left open, and the conflicts between them, were resolved at plan: see its "Plan-time resolutions" and "Conflicts resolved at plan" sections.

## Step 1: Prerequisites

**Development machine.** The record's dev environment is a Windows desktop (DO3).

- **Node and npm**:
  - Node 26 LTS. The fallback is Node 24.11 or later. The root `devEngines` stops any other version with an error: node `^24.11 || ^26`.
  - npm 10.9 or later, which `devEngines` needs.
- **Docker Desktop with compose**, used for:
  - the SQL Server container;
  - Azurite;
  - building and running the connector image.

  Compose is the local counterpart of the CI service containers (B12).
  - **Architecture**: the SQL Server container runs on x86-64 only, and emulation is not supported. On an ARM machine, mode A on SQLite works, but the T-SQL tests cannot run locally.
- **Other tools**:
  - PowerShell 7, for the scripts in `scripts/` and for the bootstrap.
  - git. The repository's hooks are wired through `core.hooksPath` to `.githooks`, set once by hand (Step 2), because installs run with install scripts off.
  - gitleaks 8.30.1, a pinned binary checked by checksum. It is used by the pre-commit hook and by CI.

**For the hybrid deployment**:

- **An Azure subscription you own** (`<subscription>`), with the rights to create:
  - a resource group;
  - a user-assigned managed identity;
  - role assignments.
- **The Azure CLI** (`az`): the bootstrap signs in with `az login`. The sign-in is the owner's own, and the agent never runs it.
- **An Entra ID tenant** where the owner signs in. For the record's deployment, this is the owner's organization tenant. For other owners, the identity that comes with their subscription is assumed to be enough (spec "Assumptions").
- **A GitHub repository with Actions**, and the GitHub CLI (`gh`). The bootstrap sets the environment variables with `gh`.
- **A container registry** (`<registry>`) for the core image. The record reuses the owner's existing one, and it stays outside this project's Bicep. For other owners, the registry is decided in iteration 004 (`research.md` PT-17).
- **An alert email address and phone number** (iteration 002). They are entered as GitHub Actions secrets at deploy time and are never committed.

**At home**:

- **An always-on Linux VM** with Docker: Ubuntu 24.04 LTS on Hyper-V, with 2 vCPU, 2 GB and 20 GB.
  - automatic security updates;
  - starts with the host;
  - kept out of backups and checkpoints;
  - on its own switch or VLAN if the router allows.
- **A Ring account.** Only the owner performs the Ring login and 2FA.

**Agents (for Step 7)**:

- Claude Code. Its channels feature (iteration 002) is a research preview that needs a dev-channel flag.
- claude.ai or Claude Desktop.
- ChatGPT. The dot comes in iteration 002.

## Step 2: Get the code and install

1. Clone the repository. It is one npm workspace with two packages, `bridge` and `shim`, and one lockfile.
2. Install from the repository root, with install scripts switched off. This is the same command CI and the image builds use:

   ```powershell
   npm ci --ignore-scripts
   ```

   Never run a plain `npm ci` or `npm install`. ring-client-api brings in ffmpeg-for-homebridge, whose install script downloads an ffmpeg program without checking a checksum. The bridge never uses that program: it uses the system ffmpeg (DRIFT-001-17). The flag is given on each command rather than in the committed `.npmrc`, so the rule stays visible where it applies.

3. Turn on the commit checks once per clone. A plain install would do this through npm `prepare`, which the flag above skips:

   ```powershell
   git config core.hooksPath .githooks
   ```

   The pre-commit hook runs lint, the format check and gitleaks on what is staged.

4. On Node 26, one `EBADENGINE` warning for ring-client-api 14.3.0 is expected. That release predates Node 26 and does not name it in its declared range. It is not evidence of a break: the tracked Node 26 spike and the CI tests on the image's Node are the checks (`research.md` R1).

## Step 3: Run mode A locally against the scenario engine (no Ring account needed)

Mode A is the same `bridge` package wired by the Host into one process. It has these parts:

- **Storage**: one SQLite file (`node:sqlite`).
- **Media**: a folder.
- **Secrets**: an encrypted file.
- **Agent access**: stdio, or an MCP endpoint bound to localhost only.

The scenario engine stands in for the Ring Adapter. It is the simulated home grown to every supported device type, with scripted scenarios and fault injection.

1. **The decided way to exercise mode A against the scenario engine** is the mode A end-to-end suite. It is driven by the MCP SDK's own client and runs under Vitest (see Step 4). The suite needs no Ring account and no Azure.
2. **Starting mode A by hand** uses the Host entry `bridge/src/host/main.ts`. Node 26 runs the `.ts` directly while coding. The run mode (a Config setting) is set to all-in-one, and `main.ts` then loads the `all-in-one.ts` wiring file.
   - The Config key, its value and the npm script name are not in the records; they are set at implement.
   - Outside the test suite, a dev-only npm script starts the all-in-one Host with the scenario engine in place of Ring Adapter (`research.md` PT-20). It is excluded from the production image.
3. **Connect a local MCP client** over stdio or the localhost endpoint, and call the read tools:
   - `get_overview`, `list_devices` and `get_device`;
   - `get_health`;
   - `get_events` with a saved cursor (**iteration 002**).
4. **Optional, the owner's own home mirrored**: a local-only scenario file under `bridge/test/scenarios/local/`. That folder is git-ignored, and nothing from the owner's home goes into git.
5. **Not in iteration 001**: the mode A admin page, opened by a one-time localhost link printed at startup (US7, iteration 004).

## Step 4: Run the tests and quality checks

Everything below runs at pre-commit or in CI (GitHub Actions). Locally, start the SQL Server container and Azurite with compose first.

**Type check.** The command is recorded:

```powershell
tsc --noEmit
```

**Lint and format**:

- ESLint 10 runs with the flat config in `eslint.config.js` and typescript-eslint's `strictTypeChecked` plus `stylisticTypeChecked`.
- Prettier checks formatting, with `eslint-config-prettier`.

The script names are not in the records.

**Tests** run under Vitest 5, configured in `vitest.config.ts`:

- **Unit tests** sit beside the code (`x.test.ts`).
- **Integration and end-to-end tests** live in `bridge/test/`.
- **Integration runs** on three stores: SQLite, the SQL Server container and Azurite. They use the scenario engine, the fake clock, the in-memory link pair, and the real WSS on localhost with drops, delays and duplicates.
- **Sign-in**: a second oidc-provider stands in for Entra, so the real sign-in code runs over the real protocol.
- **Mode A end to end** is driven by the MCP SDK client.
- **The coverage gate** (`@vitest/coverage-v8`) requires 90% lines and 85% branches. These are excluded:
  - the real Ring Adapter;
  - Live Media;
  - the Key Vault and managed-identity SQL implementations;
  - the Host's wiring.
- **The completeness check**: every MCP tool, D7 error kind, event kind and page state has a test.

**The named checks for this iteration**:

- **The freshness test**: drop the Ring connection. The reply must be stale within 2 minutes. From iteration 002, a HIGH health event must also go out.
- **The agent-economy test**: on a 100-device fixture, the overview and the device list must stay within about 8,000 tokens.
- **Version tests**:
  - the link contract at version N, which is version 1 in iterations 001 and 002 (the N-1 test is added with the first version bump, PT-07);
  - the upgrade from the previous release to this one, on SQLite and on SQL Server.
- **Contract tests for both MCP eras**. From iteration 002 they also use a ChatGPT Events fixture (a local webhook receiver) and a fake channel.

**The named checks for iteration 002** (kept here; not checked in iteration 001):

- **The 0.5 s in-bridge latency check**: a synthetic HIGH event, measured as `pushed_at - received_at` at the 95th percentile, on every change. It also runs in mode A, where it guards SQLite posture (a).
- **The kill-and-restart test**: the cursor resumes with no gap and no repeat beyond the event id.

**The dependency and boundary check**: dependency-cruiser (dev only) checks what is reachable from each wiring file:

- From the connector's wiring, nothing reaches the Azure libraries, oidc-provider or mssql.
- From the core's wiring, nothing reaches the Ring libraries, werift or ffmpeg.
- Another component is imported only through its `index.ts`.
- The shim imports nothing from the bridge.
- Only MCP Endpoint and Delivery import the Public Contract.

**The schema snapshot test**: the Public Contract is generated from zod (`z.toJSONSchema`) into `schemas/`. CI fails if the files are stale or if a change is not additive.

**Page checks**: Playwright runs the admin-page smoke checks at 3 widths, in both themes.

**Supply chain**:

- **The audit**: `npm audit` fails on high or critical findings, with the written exception list. Its first entry is `ip` through werift. The exception script reads the JSON output.

  ```powershell
  npm audit --json
  ```

- **The licence check** runs over the SBOM against the allow-list:

  ```powershell
  npm sbom
  ```

- **gitleaks** runs as the pinned binary, in the pre-commit hook and in CI.

**Weekly in CI**:

- StrykerJS mutation testing on the engines and Normalize;
- the "simulated week": seven days of events, token refreshes, purges and key rotation on the fake clock.

**On `main`, before the deploy approval**: the mode H end-to-end job. It runs the core and connector containers with SQL Server and Azurite.

## Step 5: Deploy hybrid to your own subscription (Bicep and GitHub Actions)

1. **Before the first push**, git-ignore or clean `.specrew/handover/` (and `.specrew/runtime/`). The handover file can quote the owner's messages (CD "Lens 9 summary").
2. **Run the bootstrap once, from your own PC**. It is a PowerShell 7 script, written at implement. Its decided steps are:
   1. sign in with `az login`, in the browser;
   2. pick `<subscription>` at run time;
   3. create `<resource-group>` (the core's region is Israel Central, P2);
   4. create the deploy identity, a user-assigned managed identity with a GitHub OIDC federated credential, so there is no password or client secret;
   5. give it limited roles:
      - Contributor on the resource group;
      - role assignment limited to an allow-list that includes Key Vault Secrets Officer;
      - AcrPush on `<registry>` only;
   6. set the GitHub environment variables with `gh`:
      - the subscription, tenant and client IDs;
      - the resource group;
      - the registry name.

   It is written (T031, DRIFT-001-63) as `infra/bootstrap/bootstrap.ps1`, in two stages around the first deploy: `-Stage before-deploy` does the steps above, and `-Stage after-deploy` gives the core's new identity what it needs and writes the first signing key. `infra/bootstrap/entra-app-registration.md` gives the order, including step 6 below, which comes first.

   A proposal in component-design adds the detail below. It was never confirmed in the workshop, and the plan adopts it as the default (`research.md` PT-05) for the owner's review at the plan boundary:
   - a path and parameters (`infra/bootstrap/bootstrap.ps1` with `-SubscriptionName`, `-GitHubRepo <owner>/<repo>`, `-RegistryName` and `-Apply`);
   - a print-only run unless `-Apply` is passed;
   - no default subscription;
   - a check-then-skip on every step, so it is safe to rerun.
3. **Iteration 002: add the GitHub Actions secrets** for the alert email address and the phone number. They feed the Azure Monitor action group. Never commit them.
4. **Open a PR.** The PR checks from Step 4 run, plus a Bicep what-if on `infra/`. Copilot reviews the PR, and its comments must be resolved before a merge.
5. **Merge to `main`.** The workflow then:
   1. runs the mode H end-to-end job;
   2. pushes the core image to `<registry>`;
   3. pushes the connector image to ghcr.io, for amd64 and arm64;
   4. waits for your approval, then deploys the Bicep and the core;
   5. runs a smoke test against `https://<core-host>/readyz` and `get_health`.

   The Bicep sets up:
   - App Service B1 Linux, with one instance, Always On, WebSockets, VNet integration, and a health check on `/readyz` (with one instance, App Service replaces it after an hour unhealthy; DRIFT-001-62);
   - Azure SQL Basic;
   - Blob;
   - Key Vault;
   - the managed identity;
   - Log Analytics;
   - the alert rules and the action group (iteration 002).

   No deploy creates or writes a secret value, and nothing is a placeholder (`research.md` PT-03). After the first deploy, `/readyz` reports not ready and names `issuer-signing-keys`. Run the bootstrap's signing-key step with your own sign-in: it generates the first key in memory and writes it straight to Key Vault, then rerun the smoke test. Later keys come from the core's 90-day rotation. `pin-hash` arrives with disarm in iteration 004.
6. **Create the Entra app registration** for the Issuer's owner sign-in. This is a runbook step the owner performs once. The resulting IDs go into GitHub environment variables and are never committed (`research.md` PT-06). Create the SQL break-glass group the same way. The sign-in client (T006) expects the following:
   - the issuer setting written with the tenant ID, `https://login.microsoftonline.com/<tenant-id>/v2.0`, not a domain name. Entra's discovery document names the issuer by ID, and the bridge refuses a mismatch;
   - a Web redirect URI for the bridge's sign-in return URL;
   - a federated credential that trusts the core's user-assigned managed identity: the issuer is the tenant's `https://login.microsoftonline.com/<tenant-id>/v2.0`, the subject is the managed identity's principal ID, and the audience is `api://AzureADTokenExchange`. There is no client secret;
   - the optional claim `auth_time` on the ID token. A fresh sign-in (`prompt=login`, for the admin and confirm pages) is checked against the time the owner actually entered their credentials, and fails without the claim. A plain sign-in falls back to the ID token's issue time;
   - **only you may sign in** (DRIFT-001-39). On the app's enterprise application, turn on "Assignment required" and assign only yourself, so Entra refuses anyone else in the tenant. Then put your own object ID (Entra ID, Users, you, Object ID) in the bridge's owner setting, `<owner-object-id>`, a GitHub environment variable that is never committed. The bridge checks it again on every sign-in, and refuses everyone while it is empty. The sign-in asks for `openid profile`, because Entra sends your object ID only with `profile`.
7. **Rollback**: redeploy the previous image.
8. **Cost**: expect about $21.50 a month in iteration 001, and about $23 from iteration 002, when the alert rule ($1.50) is added. That figure is agent-derived from list prices for Israel Central, read on 2026-10-25 and 2026-10-26. The ceiling is $30 a month; it was set by the owner at clarify on 2026-11-01 (SC-011), and the owner checks it on the bill in the pilot.

## Step 6: Enroll the home connector

1. **On the home VM**, pull the connector image from ghcr.io. While the repository is private, use a read-only token kept on the VM. The connector is never updated automatically: when the admin page says the connector is behind, pull the new image.
2. **Run the Setup CLI** in the connector image. The owner performs the Ring login and 2FA there; the agent never does this. The Setup CLI also creates the connector's key pair and starts the enrollment. Everything secret stays in the encrypted secrets file on the VM and is never backed up:
   - the Ring token;
   - the push credentials;
   - the device ID;
   - the connector key.
3. **Start the connector** with the run mode set to connector. It dials out to the core over WSS, with no inbound port, and its log prints a one-time enrollment code.
   - Set up Docker's health check and log rotation.
   - Run it with the restart policy `unless-stopped` (`research.md` PT-02).
4. **Approve the code.** Open the minimal admin page on the core and sign in fresh with Entra. Compare the code shown there with the code in the connector's log, then approve. Any older connector key is revoked, because there is one connector per Ring account.
5. **Check health.** The admin page's health view, and `get_health`, should show:
   - the home link connected;
   - the Ring session;
   - push reception (iteration 002);
   - the last event (iteration 002).

   From now on, the connector proves itself at each hello by signing the core's fresh challenge.

## Step 7: Connect agents (read scope only in iteration 001)

Every remote client signs in through the bridge's own Issuer at `https://<core-host>`, and the owner signs in with Entra. Only listed agents can link: through CIMD or DCR for hosted agents, or as static entries for the owner's own machines. In iteration 001 the agent list lives in Settings. It is seeded from deployment configuration (client identifiers, redirect URIs and scopes), and iteration 001 grants read only (`research.md` PT-18). Access tokens last 1 hour. Refresh tokens rotate and end after 30 days unused, or 90 days at most.

**Claude Code** uses two connections:

1. **Tools**: add the core's MCP endpoint as a remote HTTP server in Claude Code and sign in. The endpoint path is not in the records.
2. **Push (iteration 002)**: add the channel shim (the `shim` package) as a channel. Claude Code starts the shim itself on your PC, over stdio, with the legacy handshake. You must enable the channels research preview with its dev-channel flag; the flag's name is not recorded.
   - The first time, the shim signs in with OAuth and PKCE (a static Issuer entry, Entra sign-in). Its refresh token is kept in Windows Credential Manager.
   - The shim holds the read scope only and relays push. Claude Code keeps its tools on its own HTTP connection.

**Claude web and desktop** (claude.ai, Desktop, mobile):

- Add the core's MCP endpoint as a remote connector and sign in.
- These clients get tools only, with no push. Read new events with `get_events` from a saved cursor (iteration 002).

**ChatGPT, including the dot**:

- Add the core's MCP endpoint as an app, linked through CIMD or DCR, and sign in.
- **Iteration 002**: push arrives as ChatGPT MCP Events webhooks on the 2026-07-28 revision. These are hand-built, and spike S4 checks `capabilities.events`.
- **Iteration 002**: the dot works on schedules, not push. It reads "what changed" with `get_events` from its own cursor, with the per-client last-read mark as the fallback.
- **Iteration 002**: two things about the dot are unverified, and spike S7 checks them:
  - whether a custom server reaches the dot through the existing connection or must be added as a plugin;
  - whether the core can tell a dot's call from a chat call.

## Step 8: Pilot observations (the owner only, on production, disarm off)

The agent never runs the pilot. In iteration 001 the pilot is read-only. The owner:

- **Records SC-001's end-to-end latency** (iteration 002) in a pilot journal: `pushed_at - ring_ts` at the 95th percentile, against the 5 s goal and the 10 s ceiling, and MEDIUM against 30 s. To do this, the owner triggers real HIGH events at home, such as the doorbell.
- **Starts the SC-003 7-day Ring-session soak.**
- **Fires one end-to-end test alert** by email and SMS (iteration 002).
- **Checks App Service** health check and auto-heal on one instance, and the managed-identity federated credential.
- **Checks the clock sync** between home and Azure.
- **Checks the bill** against the $30 ceiling.

## Step 9: Validation checklist

The slice follows the plan's resolution of the iteration-width conflict (`research.md` "Conflicts resolved at plan", item 2). Iterations 001 and 002 are the Option B slice as approved, split in two at plan. The US2 events, the dot and the out-of-band alerts are iteration 002. Motion queries, Ring history, battery alerts and the digest, and per-client push opt-ins move to iteration 003. The rows marked **iteration 002** or **iteration 003** are not checked here.

| Item | What must hold | Checked in | Slice note |
| --- | --- | --- | --- |
| US1 AS1 | Overview: alarm mode, open contacts, active motion, offline devices, low batteries, bridge health; at most about 8,000 tokens; `as_of` in UTC and local time | Step 4: scenario-engine integration and the agent-economy test (100 devices); Step 3: mode A end to end; Step 7: `get_overview` from each agent | In Option B |
| US1 AS2 | Ring lost for 3 min: last known state, marked stale with `stale_since`, never presented as current | Step 4: the freshness test, with Ring down by fault injection and the fake clock. This is the only check of the Ring-lost path. Step 8: stopping the connector for 3 minutes, then calling `get_overview`, checks the same stale contract over the home-link-down path (B12) | In Option B |
| US1 AS3 | A device named in Hebrew is returned as written, with type, room, battery, power mode and online status | Step 4: scenario fixture with a Hebrew name, through `list_devices`; Step 7: `list_devices` | In Option B |
| US1 AS4 | Motion while disarmed: `get_motion` for 15 minutes gives the recorded motion, the active rooms and an occupancy summary | Step 4: scenario test (motion while disarmed) | **Iteration 003** |
| US1 AS5 | Battery below 20%: one alert per crossing, plus the periodic digest | Step 4: scenario test (battery crossing, Scheduler digest on the fake clock) | **Iteration 003** |
| US2 AS1 | Armed Away, two agents, a contact opens: both get one HIGH event with a unique `event_id`, the device and room, and a summary; the bridge takes at most 0.5 s at p95 | Step 4: the latency check with two MCP SDK clients; Step 8: a real HIGH event reaching two agents | **Iteration 002** |
| US2 AS2 | Read after a saved cursor: every event, in order, none skipped, plus the next cursor | Step 4: end-to-end cursor test; Step 7: `get_events` from claude.ai with a saved cursor | **Iteration 002** |
| US2 AS3 | Bridge restart mid-stream: no event missing, no repeat beyond the same `event_id` | Step 4: the kill-and-restart test, and the localhost WSS test with drops and duplicates; Step 5 or 8: a redeploy while events arrive | **Iteration 002** |
| US2 AS4 | Opt-in for motion while disarmed: only that agent receives it (`set_push_filter`) | Step 4: two-client scenario test | **Iteration 003** |
| US2 AS5 | Late events (recovered, or held at home over 2 minutes): stored with `late: true` and their priority; one `bridge.events_recovered` summary is pushed instead | Step 4: link drop of more than 2 minutes with events in the outbox, plus a push-gap catch-up through the scenario engine | **Iteration 002** |
| US2 AS6 | Ring down for more than 2 minutes: HIGH health event to every agent, then a recovery event | Step 4: the freshness test (Ring down, then back) | **Iteration 002** |
| US2 AS7 | The event is pushed without waiting for a snapshot; a frame link only if one was already captured | Step 4: the event push path has no capture dependency. Capture itself arrives with media in iteration 003, where the full check runs | **Iteration 002** (partial) |
| SC-001 (in-bridge) | Bridge-internal processing at most 0.5 s at p95, on every change | Step 4: the latency check in CI, also run in mode A | **Iteration 002** |
| SC-001 (end to end) | HIGH at most 10 s (goal 5 s at p95); MEDIUM at most 30 s | Step 8: pilot journal, `pushed_at - ring_ts` | Pilot measurement, **iteration 002** |
| SC-002 | 100% of events readable from the cursor after a kill-and-restart and across a dropped home link | Step 4: kill-and-restart and the dropped-link tests; Step 8: observe after a home internet drop | **Iteration 002** |
| SC-005 | A lost Ring connection is shown as stale within 2 minutes, and agents receive a HIGH health event | Step 4: the freshness test | In Option B: stale within 2 minutes. The HIGH health event: **iteration 002** |
| SC-006 | The default overview and device-list replies for about 100 devices stay within about 8,000 tokens | Step 4: the agent-economy test. Tokens are estimated as characters ÷ 3, rounded up (`research.md` PT-22) | In Option B |
| Also in 002: FR-043 (part) | Out-of-band email and SMS when no heartbeat (minute tick) for 10 minutes, or the home is offline for more than 10 minutes | Step 5 (alert rules in Bicep); Step 8 (one end-to-end test alert) | **Iteration 002**. The audit and WORM alerts come in iteration 004. The out-of-band copy of Ring-session-lost also comes in iteration 004 (`research.md` "Conflicts resolved at plan", item 4) |
| Also in 001: FR-032 (enrollment) | Connector enrolled with its key pair and a code compared on the admin page; a new enrollment revokes the old one | Step 6 | In Option B |
