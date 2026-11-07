---

description: "Iteration 001 task list for the Ring MCP Bridge"
---

# Tasks: Ring MCP Bridge, iteration 001

**Input**: design documents in `specs/001-ring-mcp-bridge/`: `plan.md` (approved 2026-11-02), `iterations/001/plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`
**Scope**: iteration 001 only, 42 story points: US1 reads after Entra sign-in, read scope only, on the real hybrid path, plus the minimal admin page (US6 in part). Iterations 002 to 004 get their own design analysis, plan and tasks stages.
**Tests**: requested.

- code-implementation I4.4: the failing test comes first for the engines, the edge parsers, Normalize and every bug fix. Elsewhere, tests are written with the code, in the same task.
- plan.md (`verification-confidence`): each FR gets a positive and a negative test, and failure-mode FRs are not covered by smoke tests only.

**Organization**: one phase per delivery step. Tasks that serve the US1 read path carry `[US1]`, and the admin-page and enrollment tasks carry `[US6]`. Setup, foundation, deploy and review tasks carry no story label.

## Format: `- [ ] T### [P?] [US#?] [assigned_to: <role>] [effort: <SP>] Description with exact file path(s) (Trace: ...)`

- **[P]**: can run in parallel: different files, and no dependency on an unfinished task.
- **[US#]**: the user story the task serves.
- **[assigned_to]**: the role from `.specrew/role-assignments.yml`.
- **[effort]**: story points. The tasks sum to 42, the configured capacity.
- **Trace**: the FRs and SCs the task serves (iteration 001 scope only), then the plan work item (CP-xx).

## Path Conventions

From plan.md "Project Structure" (code-implementation I5.2): one npm workspace with the `bridge` and `shim` packages.

- `bridge/src/host/`, `bridge/src/core/`, `bridge/src/connector/`, `bridge/src/utilities/`, `bridge/src/contract/`: product code. Inside `core/` and `connector/`, IDesign layers are folders: `clients/`, `managers/`, `engines/`, `access/`.
- `bridge/test/`: integration and end-to-end tests. Unit tests sit beside the code as `x.test.ts`.
- `schemas/` (generated), `infra/` (Bicep and the bootstrap), `scripts/` (dev helpers), `.github/` (workflows).
- Owner values are placeholders everywhere: `<subscription>`, `<resource-group>`, `<registry>`, `<owner>/<repo>`, `<core-host>`. Real values never go into the repository.

## Work Item to Task Map (capacity check)

| Work item | Planned SP | Tasks | Task SP |
| --- | --- | --- | --- |
| CP-01 Scaffold, toolchain, CI | 3 | T002, T003, T004 | 1 + 1 + 1 = 3 |
| CP-02 Utilities | 2 | T005, T006 | 1 + 1 = 2 |
| CP-03 Query layer, migrations, DTOs | 3 | T007, T008 | 2 + 1 = 3 |
| CP-04 Test harness | 3 | T009, T010 | 2 + 1 = 3 |
| CP-05 Public Contract | 1 | T011 | 1 |
| CP-06 Setup CLI and Secrets File | 2 | T012, T028 | 1 + 1 = 2 |
| CP-07 Ring Adapter | 2 | T013 | 2 |
| CP-08a Outbox Store | 1 | T014 | 1 |
| CP-09 The link | 3 | T015, T016, T017 | 1 + 1 + 1 = 3 |
| CP-10 Host and Lease | 2 | T026, T027 | 1 + 1 = 2 |
| CP-11a Event manager, link intake | 1 | T018 | 1 |
| CP-14 Inquiry path | 3 | T019, T020, T021 | 1 + 1 + 1 = 3 |
| CP-15 MCP Endpoint | 2 | T024, T025 | 1 + 1 = 2 |
| CP-16 Issuer | 3 | T022, T023 | 1 + 2 = 3 |
| CP-17 Minimal admin page | 1 | T029 | 1 |
| CP-19 Bicep and deploy | 3 | T030, T031, T032 | 1 + 1 + 1 = 3 |
| CP-21a First agent trial | 1 | T033 | 1 |
| CP-RV Review | 3 | T001, T034, T035 | 1 + 1 + 1 = 3 |
| CP-RW Rework | 3 | T036 | 3 |
| **Total** | **42** | **36 tasks** | **42** |

---

## Phase 1: Hardening Review (before any code)

**Goal**: the hardening gate is signed off before implementation starts (plan.md "Phase 2 Hardening").
**Independent test**: `iterations/001/quality/hardening-gate.md` records the effective review class, the reviewer and the approval reference, and no critical concern is open without the owner's approved deferral.
**Depends on**: the owner's tasks approval. Implementation also needs the before-implement approval.

- [x] T001 [assigned_to: Reviewer] [effort: 1] Run the hardening review of `specs/001-ring-mcp-bridge/iterations/001/quality/hardening-gate.md` with the reviewer host (codex, `.specrew/reviewer-hosts.json`) at the strongest available class. Record Effective Review Class, Reviewed By and Approval Ref in the gate. Any unresolved critical security, resilience or operational concern needs the owner's explicit approved deferral before the before-implement boundary (Trace: FR-029, FR-030, FR-032, FR-033, FR-034, FR-042, FR-044; CP-RV)

**Verification**: `pwsh -File .specify/extensions/specrew-speckit/scripts/validate-governance.ps1 -ProjectPath .`

---

## Phase 2: Setup (shared infrastructure)

**Goal**: an installable workspace whose checks run on every commit and in CI.
**Independent test**: `npm ci` succeeds on Node 26; the pre-commit hook and the CI workflow run green on the empty packages.
**Depends on**: Phase 1.

- [x] T002 [assigned_to: Implementer] [effort: 1] Create the npm workspace at the repository root: `package.json` (workspaces `bridge` and `shim`; `devEngines` node `^24.11 || ^26` and npm `>=10.9`), `package-lock.json`, `tsconfig.base.json` (TypeScript 6.0.3 pinned, erasable syntax only, ES modules, `nodenext`), `bridge/package.json`, `shim/package.json`, and the folders of plan.md "Source Code": `bridge/src/{host,core,connector,utilities,contract}/`, `bridge/test/{scenarios,fixtures/ring}/`, `schemas/`, `infra/`, `scripts/`. Pin the dependency versions in plan.md "Technical Context". Add `.gitignore` entries for `bridge/test/scenarios/local/`, `.specrew/handover/` and `.specrew/runtime/` (Trace: FR-046, FR-047; CP-01)
- [x] T003 [P] [assigned_to: Implementer] [effort: 1] Add the lint, format, hook and test configuration:
  - `eslint.config.js`: ESLint 10.14.0 flat config with typescript-eslint 8.72.1 `strictTypeChecked` and `stylisticTypeChecked`, plus `eslint-config-prettier`.
  - `.prettierrc`: Prettier 3.9.10.
  - `.githooks/pre-commit`: lint, format check, and gitleaks 8.30.1 (a pinned binary checked by checksum), with the no-GUID rule in `.gitleaks.toml`. The npm `prepare` script sets `core.hooksPath` to `.githooks`.
  - `vitest.config.ts`: Vitest 5 with the `@vitest/coverage-v8` gate at 90% lines and 85% branches. It excludes the real Ring Adapter, the Key Vault and managed-identity SQL implementations, and the Host wiring.
  - `playwright.config.ts`: Playwright 1.64.1 at three widths (folded phone, unfolded phone, PC), in the dark and the light theme.

  (Trace: FR-032, FR-034, FR-040; CP-01)
- [x] T004 [assigned_to: Implementer] [effort: 1] Add CI and the boundary rules:
  - `.github/workflows/ci.yml`, on PRs and pushes:
    - `npm ci --ignore-scripts`, `tsc --noEmit`, ESLint and the Prettier check;
    - Vitest unit and integration tests, with SQL Server and Azurite service containers;
    - dependency-cruiser, the schema snapshot check and gitleaks;
    - `npm audit --json` through a script in `scripts/` that applies the written exception list and fails on high or critical findings;
    - `npm sbom` against the licence allow-list.
  - `.github/workflows/weekly.yml`: StrykerJS 10.1.1 on `bridge/src/core/engines/**`.
  - `.dependency-cruiser.cjs`, for dependency-cruiser 18.7.0:
    - from the connector wiring, nothing reaches `@azure/*`, oidc-provider or mssql;
    - from the core wiring, nothing reaches ring-client-api;
    - ring-client-api is imported only inside `bridge/src/connector/access/ring-adapter/`;
    - another component is imported only through its `index.ts`;
    - `shim/` imports nothing from `bridge/`;
    - only MCP Endpoint (and Delivery, from iteration 002) imports `bridge/src/contract/`.
  - The Specrew-installed `.github/workflows/specrew-ci.yml` (DRIFT-001-07):
    - point its governance step at `.specify/extensions/specrew-speckit/scripts/validate-governance.ps1`;
    - remove the steps that call `tests/integration/*.ps1`, which exist only in Specrew's own repository;
    - check the other Specrew-installed workflows the same way;
    - re-check after each Specrew update, which may restore the file.

  (Trace: FR-046, FR-047, FR-026 with TG-004; CP-01)

**Verification**: `npm ci`, `tsc --noEmit`, `npx eslint .`, `npx prettier --check .`, `npx depcruise bridge shim --config .dependency-cruiser.cjs`

---

## Phase 3: Foundational (blocking prerequisites)

**Goal**: the utilities, the two-dialect query layer, the iteration 001 schema and the test harness that every later task uses.
**Independent test**: the redaction test passes; the query layer's integration suite passes on SQLite and on the SQL Server container; the scenario engine serves a 100-device home on the fake clock.
**Depends on**: Phase 2. **No user-story task starts before this phase is done.**

- [x] T005 [P] [assigned_to: Implementer] [effort: 1] Logging utility in `bridge/src/utilities/logging/`:
  - structured JSON lines that carry identifiers only (`request_id`, `client_id`, the connector session id, event and device ids);
  - a redaction layer for values shaped like tokens, keys, PINs and images.

  Write the redaction test first. It feeds an OAuth token, a PIN-shaped value, a private key and image bytes through every log path and every error message, and asserts that none of them appears (Trace: FR-034; CP-02)
- [x] T006 [P] [assigned_to: Implementer] [effort: 1] Utilities, each with its unit tests:
  - `bridge/src/utilities/security/`: Ed25519 key pairs, challenge signing and verification, AES-256-GCM helpers for the encrypted files, and the Entra sign-in client. The client uses a managed-identity federated credential, with no client secret.
  - `bridge/src/utilities/pub-sub/`: typed, in-process publish and subscribe.
  - `bridge/src/utilities/config/`: zod-validated settings. It holds the run mode (core, connector or all-in-one) and defaults such as reads at 600 an hour and the battery threshold at 20%.
  - `bridge/src/utilities/clock/`: a real clock and a fake clock, plus formatting in UTC and in a location's time zone.

  (Trace: FR-006, FR-029, FR-032; CP-02)
- [x] T007 [assigned_to: Implementer] [effort: 2] Query layer in `bridge/src/utilities/query-layer/`:
  - one interface over `node:sqlite` and mssql 12.7.13 (T-SQL);
  - two-dialect versions of insert-or-update and paging, for use inside the accessors;
  - a transaction helper that retries once on a transient error;
  - a store-down error that managers turn into `BRIDGE_UNAVAILABLE`.

  Integration tests run on SQLite and on the SQL Server container (Trace: FR-006; CP-03)
- [x] T008 [assigned_to: Implementer] [effort: 1] Migrations and the iteration 001 schema in `bridge/src/utilities/query-layer/migrations/`:
  - a forward-only, additive runner that runs at start;
  - the tables `location`, `device` (with the column `kind` and `state_version`), the health snapshot, `setting`, `agent`, `connector`, `oidc_item` (PT-11) and `lease`.

  The upgrade test (previous release to this one, on SQLite and on SQL Server) starts from an empty schema, because no release exists yet. Write the per-component DTO rule in `bridge/src/core/access/README.md`: rows map to DTOs inside each accessor, and State maps `kind` to the contract's `type` (PT-26) (Trace: FR-002, FR-006, FR-044; CP-03)
- [x] T009 [P] [assigned_to: Implementer] [effort: 2] Scenario engine in `bridge/test/scenarios/`:
  - **The simulated home:** about 100 devices of every supported type (contact, motion, flood, keypad, base station, camera, doorbell, light). It has:
    - one location with a time zone and an alarm mode;
    - a device named in Hebrew;
    - low batteries and wired devices;
    - offline devices.
  - **Scripts and faults:** scripted state changes, and fault injection:
    - Ring down, a 406, slow answers, and a lost session;
    - link drops, delays and duplicates.
  - **Driving:** the engine runs on the fake clock and implements the Ring Adapter's port. It replaces the adapter in tests and in the dev-only script.

  Mirrors of the owner's home go only in the git-ignored `bridge/test/scenarios/local/` (Trace: FR-001, FR-002, FR-005, SC-006; CP-04)
- [x] T010 [P] [assigned_to: Implementer] [effort: 1] Test support in `bridge/test/support/`:
  - a second oidc-provider 9.13.3 standing in for Entra;
  - MCP SDK client helpers for end-to-end tests (`@modelcontextprotocol/client` 2.4.0);
  - a store-matrix fixture that runs an integration suite on SQLite and on SQL Server.

  Also add `docker-compose.yml` at the root for the SQL Server container and Azurite (Trace: FR-029, FR-006; CP-04)

**Verification**: `docker compose up -d`, `npx vitest run bridge/src/utilities bridge/test/scenarios bridge/test/support`

**Checkpoint**: the foundation is ready.

---

## Phase 4: User Story 1, ask about the home right now (Priority: P1) 🎯 MVP

**Goal**: an agent that signed in through the bridge's own Issuer reads the overview, the device list, one device and the bridge's health. The data comes from the home connector over the WSS link, and every reply says when it was true and whether it is stale.
**Independent test** (spec US1; quickstart Steps 3 and 4):

- with the 100-device scenario engine, the mode A end-to-end suite calls the four read tools through the MCP SDK client;
- the mode H integration tests sign in through the fake Entra and read through the real link on localhost;
- checks: content, freshness markers, reply size (SC-006), and stale within 2 minutes after a loss (SC-005).

**Depends on**: Phase 3. The order inside the phase is under "Dependencies".

### The Public Contract

- [x] T011 [US1] [assigned_to: Implementer] [effort: 1] Public Contract in `bridge/src/contract/`, following `contracts/mcp-tools.md` and `contracts/errors.md`:
  - zod 4.6.7 schemas for the inputs and outputs of `get_overview`, `list_devices`, `get_device` and `get_health`;
  - the reply envelope (`as_of`, `as_of_local`, `freshness`, `stale_since`, `data`) and the error envelope;
  - every Ring-sourced field carries `x-untrusted: true` and says so in its description;
  - every tool description ends with the untrusted-content sentence;
  - a generator writes `schemas/` with `z.toJSONSchema`.

  With the code, add three checks:
  - the flat-schema check, which rejects `anyOf`, `oneOf`, `allOf`, `not`, `if`/`then`/`else`, `dependentRequired` and nullable types in inputs;
  - the untrusted-marking check;
  - the schema snapshot test, which fails on stale files or on any removal or narrowing.

  The generated schemas match `contracts/iteration-001-tools.schema.json` (Trace: FR-033, FR-046, FR-047, FR-048; CP-05)

### Home side

- [x] T012 [P] [US1] [assigned_to: Implementer] [effort: 1] Secrets File in `bridge/src/connector/access/secrets-file/`:
  - an encrypted file at home, whose key comes from a Docker secret;
  - it holds the Ring refresh token, the push credentials, Ring's session hardware ID and the connector private key;
  - writes are atomic when the token rotates;
  - its values are never logged and never sent on the link.

  Tests: a round trip; a wrong key fails closed; none of its values appears in logs or link frames (Trace: FR-032, FR-034; CP-06)
- [x] T013 [P] [US1] [assigned_to: Implementer] [effort: 2] Ring Adapter in `bridge/src/connector/access/ring-adapter/`, over ring-client-api 14.3.0 (its only import site):
  - **The interface:** only the bridge's own DTOs cross it:
    - locations;
    - devices, with `type`, room, battery, power mode, online state and state;
    - device-change notifications;
    - the session status: ok, unavailable or lost.
  - **Names:** kept exactly as written, in any language, and marked untrusted.
  - **The token:** the refresh token is saved to the Secrets File when it rotates.
  - **The limits:**
    - one shared limiter for every outgoing Ring call, with no polling bursts;
    - a circuit that opens after 5 failures and probes once a minute;
    - backoff of 1 to 30 s, randomised;
    - a 406 counts as Ring unavailable.

  Write the limiter, circuit and backoff tests first, on the fake clock. The Ring-boundary contract test asserts two things:
  - no ring-client-api type, error or event crosses the adapter's interface;
  - the scenario engine implements the same port.

  (Trace: FR-026, FR-042, FR-002, FR-033, TG-004 with FR-026; CP-07)
- [x] T014 [US1] [assigned_to: Implementer] [effort: 1] Outbox Store in `bridge/src/connector/access/outbox-store/` (the connector's own SQLite file), and Ingest's state path in `bridge/src/connector/managers/ingest/`:
  - **Outbox rules:**
    - a message is written before it is sent and cleared only on its `ack`;
    - it is resent after 10 s without an ack, and the oldest is sent first on reconnect;
    - the `state_version` counter is stored, so it survives a restart.
  - **Ingest:** sends `inventory` (locations and devices) at every session start and on `inventory_request`, and sends `device_state` when a device changes. A `device_state` message carries the device's full current entry, never only the changed fields (DRIFT-001-06). Each location entry in `inventory` carries its own `state_version` from the same counter (DRIFT-001-08).

  Tests:
  - a restart with unacked messages;
  - the resend timing, on the fake clock;
  - versions that keep increasing across a restart.

  (Trace: FR-042, FR-006; CP-08a)

### The link

- [x] T015 [US1] [assigned_to: Implementer] [effort: 1] Link transport in `bridge/src/utilities/link-transport/`, over ws 8.22.0:
  - frame types and the protocol version;
  - send priority: commands, events, state messages and heartbeats go before media chunks;
  - WSS ping and pong;
  - an in-memory link pair for tests.

  It knows no Ring words and no bridge words (Trace: FR-046, FR-042; CP-09)
- [x] T016 [US1] [assigned_to: Implementer] [effort: 1] Core Link and Home Scheduler at home, in `bridge/src/connector/clients/core-link/` and `bridge/src/connector/clients/home-scheduler/`:
  - **Connecting:**
    - dial out over WSS, with no inbound port;
    - send `hello` with version 1, `key_id`, `connector_version` and `session_id`;
    - sign the `challenge` with the connector key.
  - **Messages:**
    - send from the Outbox, and clear a message on its `ack`;
    - answer `inventory_request`;
    - send `enroll` with the public key and the printed code until `enrolled` arrives.
  - **Staying connected:**
    - reconnect with randomised backoff of 1 to 30 s, and be back within 60 s;
    - send a heartbeat every 15 s, with the Ring session, push, outbox depth, last Ring event and error counts;
    - run the 10 s resend tick.

  (Trace: FR-032, FR-042, FR-005; CP-09)
- [x] T017 [US1] [assigned_to: Implementer] [effort: 1] Connector Link in the core, in `bridge/src/core/clients/connector-link/`, the WSS upgrade endpoint:
  - **Version:** accept version 1. The N-1 rule is coded now, and its test comes with the first version bump (PT-07).
  - **Identity:**
    - check that the key is enrolled in Settings;
    - issue a fresh challenge and verify its signature;
    - close with a reason when the version is not accepted, the key is not enrolled or is revoked, or the challenge fails.
  - **Enrollment:** hold `enroll` requests for the admin page.
  - **Messages:** declare the home-to-core messages. Hand `inventory`, `device_state` and heartbeats to the Event manager, and send `ack` only after the commit.

  Tests:
  - the link version-1 contract test on both ends;
  - the real WSS on localhost with drops, delays and duplicates, reconnecting within 60 s.

  (Trace: FR-032, FR-046, FR-042; CP-09)

### Core state and the read path

- [x] T018 [US1] [assigned_to: Implementer] [effort: 1] Event manager intake in `bridge/src/core/managers/event/`, and the Health engine's link rules in `bridge/src/core/engines/health/`:
  - **State:**
    - apply `inventory` and `device_state` to State latest-wins by `state_version`, per device and per location, in one transaction, and only then ack (a failed commit is not acked);
    - a new enrollment resets the stored versions.
  - **Health:**
    - heartbeats update the Ring session and the outbox depth;
    - after 2 minutes without a heartbeat, the home shows offline, with `stale_since`;
    - health changes are published on Pub/Sub.

  Write the Health engine tests first, on the fake clock:
  - offline after 2 minutes, and the recovery;
  - lower or equal versions are ignored;
  - no field is lost (DRIFT-001-06). Version 10 changes the battery and its commit fails. Version 11 changes `online` and commits. The resend of version 10 is then ignored, and State holds version 11's full entry, which already includes version 10's battery change;
  - no location rolls back (DRIFT-001-08). Inventory A fails to commit. Newer inventory B commits with a changed alarm mode. Then A is resent: its location fields are ignored, and the overview still shows B's alarm mode.

  (Trace: FR-005, FR-006, SC-005; CP-11a)
- [x] T019 [P] [US1] [assigned_to: Implementer] [effort: 1] State accessor in `bridge/src/core/access/state/`:
  - holds `location`, `device` and the health snapshot;
  - inserts or updates devices and locations latest-wins by `state_version` (DRIFT-001-08);
  - its DTOs carry `type`, mapped from `kind` (PT-26);
  - raises the store-down error.

  Integration tests run on SQLite and on SQL Server (Trace: FR-002, FR-006; CP-14)
- [x] T020 [US1] [assigned_to: Implementer] [effort: 1] Summary engine in `bridge/src/core/engines/summary/`:
  - it composes the overview: alarm mode, open contacts, active motion, offline devices, low batteries below the configured threshold, and health;
  - it composes the default device list;
  - both stay within about 8,000 tokens, estimated as characters ÷ 3, rounded up (PT-22).

  Write its tests first. The agent-economy test runs `get_overview` and `list_devices` on the 100-device fixture and asserts the budget (Trace: FR-001, SC-006; CP-14)
- [x] T021 [US1] [assigned_to: Implementer] [effort: 1] Inquiry manager in `bridge/src/core/managers/inquiry/`:
  - **Tools:**
    - `get_overview`;
    - `list_devices`, with the filters `type` and `room`;
    - `get_device`, with `NOT_FOUND` for an unknown id;
    - `get_health`.
  - **Freshness:**
    - every reply carries `as_of` in UTC, `as_of_local` in the location's time zone, and `freshness`;
    - while the home link is down, the last known state is returned as `stale`, with `stale_since`;
    - when the store is down, reads fail with `BRIDGE_UNAVAILABLE` (retryable), never with stale data.
  - **An omitted `location_id`:** resolves to the only owned location. Otherwise the call fails with `INVALID_ARGUMENT`, listing the location ids.

  Tests:
  - the freshness test: Ring down by fault injection, on the fake clock, must show stale within 2 minutes;
  - stale while the home link is down;
  - the store-down test;
  - the Hebrew-name test, through `list_devices`.

  (Trace: FR-001, FR-002, FR-005, FR-006, SC-005; CP-14)

### Agent access

- [x] T022 [US1] [assigned_to: Implementer] [effort: 1] Core accessors for sign-in, with their tests:
  - `bridge/src/core/access/grants/`: the generic `oidc_item` `(model, id)` table (PT-11).
  - `bridge/src/core/access/settings/`:
    - the agent allowlist, seeded from deployment configuration: client ids, redirect URIs and scopes, read only in iteration 001 (PT-18);
    - the `connector` rows: pending, enrolled or revoked;
    - the global battery threshold.
  - `bridge/src/core/access/secrets/`: Key Vault in mode H, through `@azure/identity` 4.14.1 and `@azure/keyvault-secrets` 4.12.0, and the encrypted local file in mode A. It holds `issuer-signing-keys`.

  (Trace: FR-029, FR-030, FR-032; CP-16)
- [ ] T023 [US1] [assigned_to: Implementer] [effort: 2] Issuer in `bridge/src/core/clients/issuer/`, with oidc-provider 9.13.3 under `/oauth`:
  - **Metadata:** the authorization-server metadata advertises PKCE `S256`, `client_id_metadata_document_supported: true`, and `none` among the token auth methods.
  - **Clients:** CIMD first, DCR as the fallback, and listed agents only. The owner consents through the Entra sign-in.
  - **Tokens:**
    - access tokens last 1 hour;
    - refresh tokens rotate and end after 30 days unused or 90 days at most, then answer `invalid_grant`;
    - tokens are bound to the owner's `sub` and to the client;
    - only the `read` scope is granted in iteration 001.
  - **Keys:** signing keys come from Secrets, and the previous key is kept for checking.

  Tests against the fake Entra:
  - sign-in;
  - an unlisted client is refused;
  - lifetimes and rotation, on the fake clock;
  - a reused refresh token is refused.

  (Trace: FR-029, FR-030; CP-16)
- [ ] T024 [US1] [assigned_to: Implementer] [effort: 1] MCP Endpoint in `bridge/src/core/clients/mcp-endpoint/`, with `@modelcontextprotocol/server` 2.4.0, `@modelcontextprotocol/hono` 2.0.2 and hono 4.13.14:
  - **Transport:** Streamable HTTP serving both protocol eras (2026-07-28 and the earlier one) on one endpoint in mode H. In mode A, stdio or an endpoint bound to localhost.
  - **Tools:** the four read tools from the Public Contract.
  - **Tokens:** bearer tokens are checked against the Issuer before the manager is called:
    - 401 with `WWW-Authenticate` when a token is missing or invalid;
    - 403 when the `read` scope is missing.
  - **Discovery:** the protected-resource metadata (RFC 9728).
  - **Deadline:** 60 s, answered with `TIMEOUT`.

  Tests:
  - contract tests for both eras, through the MCP SDK client;
  - the completeness check: every iteration 001 tool and error code has a test.

  (Trace: FR-029, FR-030, FR-047; CP-15)
- [ ] T025 [US1] [assigned_to: Implementer] [effort: 1] Read rate limit in `bridge/src/core/clients/mcp-endpoint/`:
  - 600 reads an hour per client by default (from Config);
  - counters live in memory and reset on restart;
  - `RATE_LIMITED` comes with `retry_after_s`.

  Add the CI read-latency check: tool reads take at most 0.5 s at the 95th percentile inside the bridge (plan.md "Performance Goals", the `bridge-latency-budget` gate) (Trace: FR-026, FR-030, FR-001; CP-15)

### Host

- [ ] T026 [US1] [assigned_to: Implementer] [effort: 1] Lease accessor in `bridge/src/core/access/lease/`:
  - one lease row per Ring account, renewed every 15 s, expiring after 45 s;
  - an instance without the lease controls nothing (fail closed) and reports that it lacks the lease.

  Tests: two instances on the fake clock; the lease lapses when the database is down (Trace: FR-044; CP-10)
- [ ] T027 [US1] [assigned_to: Implementer] [effort: 1] Host in `bridge/src/host/`:
  - **Wiring:** `main.ts` loads `core.ts`, `connector.ts` or `all-in-one.ts` by the Config run mode. Each process has one Link transport, and mode A wires the home side to the core side in the same process.
  - **Health endpoints:**
    - `/livez`: the process and its event loop are alive;
    - `/readyz`: the database is reachable, the lease is held, and secrets are loaded.
  - **Dev script:** a dev-only npm script starts all-in-one with the scenario engine in place of Ring Adapter. It is left out of the production image.
  - **Image:** `bridge/Dockerfile` builds one image for core and connector, for amd64 and arm64.

  Test: the mode A end-to-end suite, driven by the MCP SDK client against the scenario engine, calls the four read tools (Trace: FR-044, FR-001, FR-002, FR-005, FR-006; CP-10)

**Verification**: `tsc --noEmit`, `npx vitest run --coverage` (90% lines, 85% branches), `npx depcruise bridge shim --config .dependency-cruiser.cjs`, the schema snapshot check

**Checkpoint**: US1 works end to end in mode A and in the mode H integration tests.

---

## Phase 5: User Story 6 in part, enrollment and the minimal admin page (Priority: P2)

**Goal**: the owner sets up the home connector and approves its enrollment on a minimal admin page that also shows health (US6 scenario 1; FR-040 in part).
**Independent test**:

- the Setup CLI, run against the scenario engine, creates the key pair and prints a code;
- on the admin page, the owner compares and approves the code, and an older key is revoked;
- Playwright checks the page at three widths, in both themes.

**Depends on**: T012 and T013 (Setup CLI); T017, T021 and T023 (admin page).

- [ ] T028 [US6] [assigned_to: Implementer] [effort: 1] Setup CLI in `bridge/src/connector/clients/setup-cli/`:
  - the owner runs the Ring login with 2FA; the agent never does;
  - it saves the Ring secrets to the Secrets File;
  - it creates the connector key pair, and the private key never leaves home;
  - it prints the one-time enrollment code, which the connector also logs.

  Tests use the scenario engine in place of Ring (Trace: FR-032; CP-06)
- [ ] T029 [US6] [assigned_to: Implementer] [effort: 1] Minimal admin page in `bridge/src/core/clients/web/`: server-rendered with hono, for the owner only, behind a fresh Entra sign-in.
  - **The Health section:**
    - the `get_health` data, read through Inquiry and polled every 15 s;
    - "connector behind";
    - banners with what to do when the home is offline, the Ring session is lost or the store is down.
  - **The Enroll connector section:**
    - shows the pending request's code, to compare with the connector's log;
    - approving needs a sign-in under 5 minutes old and a typed confirmation;
    - approval writes the enrollment to Settings, revokes any older key, and resets the stored state versions.
  - **The page:**
    - three widths;
    - dark by default, with a light switch remembered per browser;
    - every status as a word and an icon;
    - keyboard use and readable contrast;
    - English.

  Playwright smoke checks run at the three widths, in both themes, one per page state (Trace: FR-040, FR-005, FR-032; CP-17)

**Verification**: `npx vitest run bridge/src/connector/clients/setup-cli bridge/src/core/clients/web`, `npx playwright test`

---

## Phase 6: Hybrid Deployment and the First Agent Trial

**Goal**: the core runs on Azure from a gated pipeline, and real agents read the home through Entra sign-in. The 7-day Ring-session soak starts.
**Independent test**: quickstart Steps 5 to 8. The deploy's smoke test passes on `/readyz` and `get_health`. Claude Code, claude.ai and ChatGPT read the home after signing in.
**Depends on**: T030 and T031 can start after T002. T032 needs T027 and T030. T033 needs T028, T029 and T032.

- [ ] T030 [P] [assigned_to: Implementer] [effort: 1] Bicep in `infra/`: `main.bicep` and its modules, in the region Israel Central.
  - **App Service B1 Linux:**
    - one instance, Always On, WebSockets, VNet integration;
    - the health check on `/readyz`, and auto-heal on `/livez`.
  - **Other resources:** Azure SQL Basic, Blob, Key Vault, the core's user-assigned managed identity, and Log Analytics.
  - **Secrets:** no deploy creates or writes a secret value, and nothing is a placeholder (PT-03, DRIFT-001-05). Until `issuer-signing-keys` is set, `/readyz` reports not ready and names it. `pin-hash` arrives with disarm in iteration 004.
  - **Owner values:** a committed example parameter file holds placeholders only, and the real values stay in a git-ignored local file.

  Checks: `az bicep build` and the PR what-if (Trace: FR-044, FR-032, SC-011; CP-19)
- [ ] T031 [P] [assigned_to: Implementer] [effort: 1] The bootstrap and the Entra runbook.

  The bootstrap is `infra/bootstrap/bootstrap.ps1`, in PowerShell 7 (PT-05):
  - **Parameters:** `-SubscriptionName`, `-GitHubRepo <owner>/<repo>`, `-RegistryName` and `-Apply`.
  - **Safety:**
    - it only prints its steps unless `-Apply` is passed;
    - there is no default subscription;
    - every step checks first and skips work already done.
  - **Its steps:**
    1. The owner signs in with `az login`.
    2. Pick `<subscription>`.
    3. Create `<resource-group>`.
    4. Create the deploy identity: a user-assigned managed identity with a GitHub OIDC federated credential, and no password or secret.
    5. Give it its roles:
       - Contributor on the resource group;
       - role assignment limited to an allow-list that includes Key Vault Secrets Officer;
       - AcrPush on `<registry>` only.
    6. Set the GitHub environment variables with `gh`.
    7. After the first deploy (T032), set the first issuer signing key (PT-03, DRIFT-001-05):
       - with the owner's own sign-in, generate the key in memory and write it straight to Key Vault as `issuer-signing-keys`;
       - it never touches the disk, the console output or the repository;
       - skip if the secret already exists. Later keys come from the core's 90-day rotation (PT-04).

  The runbook is `infra/bootstrap/entra-app-registration.md`. It covers the owner's one-time Entra app registration and the SQL break-glass group (PT-06). The IDs go into GitHub environment variables and are never committed (Trace: FR-029, FR-032; CP-19)
- [ ] T032 [assigned_to: Implementer] [effort: 1] Deploy workflow `.github/workflows/deploy.yml`:
  - **On a PR:** a Bicep what-if on `infra/`.
  - **On a merge to `main`:**
    1. The mode H end-to-end job: the core and connector containers run with SQL Server and Azurite, and an agent signs in through the fake Entra and reads through the link.
    2. Push the core image to `<registry>`, and the connector image to ghcr.io (amd64 and arm64).
    3. Wait for the owner's approval on the GitHub environment.
    4. Deploy the Bicep and the core.
    5. Run the smoke test on `https://<core-host>/readyz` and `get_health`. On the very first deploy, `/readyz` reports `issuer-signing-keys` missing. The owner runs the bootstrap's step 7 (T031), then reruns the smoke test.
  - **Rollback:** redeploy the previous image.

  (Trace: FR-044, FR-029, FR-001; CP-19)
- [ ] T033 [US1] [assigned_to: Implementer] [effort: 1] The first agent trial and the soak, with the owner. The owner performs every sign-in and the Ring login.
  1. Deploy to the owner's subscription.
  2. On the home VM, run the Setup CLI. Start the connector with `unless-stopped`, the Docker health check and log rotation (PT-02). Approve its code on the admin page.
  3. Connect Claude Code, claude.ai and ChatGPT through Entra. From each, call `get_overview`, `list_devices`, `get_device` and `get_health`.
  4. Stop the connector for 3 minutes, and check that replies come back stale, with `stale_since`.
  5. Start the SC-003 7-day Ring-session soak.
  6. Check the clock sync, the App Service health check and auto-heal, and the bill against the $30 ceiling.

  Results go in the owner's pilot journal, outside the repository, with no owner identifiers in git (Trace: SC-003, SC-005, SC-011, FR-029, FR-001, FR-042; CP-21a)

**Verification**: `az bicep build --file infra/main.bicep`, `pwsh -File infra/bootstrap/bootstrap.ps1` (print-only), the workflow's smoke test, and the pilot journal entries

---

## Phase 7: Review and Rework

**Goal**: the reviewed, signed-off iteration, with its evidence and the fixes its findings need.
**Independent test**: the review-signoff evidence gate finds every reviewer artifact. `validate-governance.ps1` passes.
**Depends on**: T034 runs alongside Phases 2 to 6. T035 needs T033. T036 follows the findings.

- [ ] T034 [assigned_to: Reviewer] [effort: 1] Run continuous co-review during implement, with the reviewer host (codex) through specrew-review: one run per finished group (foundation, home side, link, core read path, sign-in, admin page, deploy). Findings are recorded for rework (Trace: FR-001, FR-002, FR-005, FR-006, FR-026, FR-029, FR-030, FR-032, FR-033, FR-034, FR-040, FR-042, FR-044, FR-046, FR-047, FR-048; CP-RV)
- [ ] T035 [assigned_to: Reviewer] [effort: 1] Assemble the review-signoff evidence:
  - the drift check (specrew-drift-check) into `iterations/001/drift-log.md`;
  - `iterations/001/quality/mechanical-findings.json` (dead-field, anti-pattern, test-integrity);
  - `iterations/001/quality/quality-evidence.md`: the stack tooling, plus the three restored reviews (concurrency, resiliency, retry and idempotency);
  - the lens evidence under `iterations/001/quality/lenses/`: security-baseline, robustness-baseline and test-integrity;
  - the reviewer artifacts: `review.md`, `code-map.md`, `coverage-evidence.md`, `reviewer-index.md`, `review-diagrams.md` and `dependency-report.md`;
  - a walk through the iteration 001 rows of quickstart.md Step 9.

  (Trace: FR-001, FR-002, FR-005, FR-006, FR-026, FR-029, FR-030, FR-032, FR-033, FR-034, FR-040, FR-042, FR-044, FR-046, FR-047, FR-048, SC-003, SC-005, SC-006, SC-011; CP-RV)
- [ ] T036 [assigned_to: Implementer] [effort: 3] Rework reserve: fixes for review findings, about 10% of the iteration. Points left unused are reported at the retro, never spent on new scope (Trace: FR-001, FR-002, FR-005, FR-006, FR-026, FR-029, FR-030, FR-032, FR-033, FR-034, FR-040, FR-042, FR-044, FR-046, FR-047, FR-048; CP-RW)

**Verification**: `pwsh -File .specify/extensions/specrew-speckit/scripts/validate-governance.ps1 -ProjectPath .`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (hardening review)** comes first. No implementation task starts before the hardening sign-off and the owner's before-implement approval.
- **Phase 2 (setup)**, then **Phase 3 (foundational)**. Phase 3 blocks every story task.
- **Phase 4 (US1)** needs Phase 3.
- **Phase 5 (US6 in part)** needs the US1 tasks named in its header.
- **Phase 6:** T030 and T031 can run early. T032 and T033 close the iteration.
- **Phase 7:** T034 runs alongside, and T035 and T036 come last.

### Inside Phase 4 (US1)

- T011 is needed by T024.
- T012 and T013 run in parallel after T006 and T009.
- T014 needs T007 and T008.
- T015 is needed by T016 and T017.
- T016 needs T012, T014 and T015.
- T017 needs T015 and T022 (enrolled keys live in Settings).
- T018 needs T017 and T019.
- T019 needs T008.
- T020 needs T019.
- T021 needs T018 and T020.
- T022 needs T008.
- T023 needs T010 and T022.
- T024 needs T011, T021 and T023.
- T025 needs T024.
- T026 needs T008.
- T027 needs T016, T017, T024 and T026.

### Shared Files (why some tasks are serial)

- `bridge/src/utilities/**` is shared by CP-02, CP-03 and CP-09, so T005 and T006 run in parallel only because their subfolders differ. T007, T008 and T015 run one at a time.
- T024 and T025 share `bridge/src/core/clients/mcp-endpoint/`, so they run in order.
- `.github/**` is shared by T004 and T032, which are far apart in time.

---

## Parallel Examples

```text
# Phase 3, after Phase 2:
Task: "T005 Logging utility in bridge/src/utilities/logging/"
Task: "T006 Utilities in bridge/src/utilities/{security,pub-sub,config,clock}/"
Task: "T009 Scenario engine in bridge/test/scenarios/"
Task: "T010 Test support in bridge/test/support/ and docker-compose.yml"

# Phase 4, home side, after Phase 3:
Task: "T012 Secrets File in bridge/src/connector/access/secrets-file/"
Task: "T013 Ring Adapter in bridge/src/connector/access/ring-adapter/"
Task: "T019 State accessor in bridge/src/core/access/state/"

# Phase 6, at any point after Phase 2:
Task: "T030 Bicep in infra/"
Task: "T031 Bootstrap and runbook in infra/bootstrap/"
```

---

## Implementation Strategy

### MVP First

1. Phase 1: hardening sign-off, then the owner's before-implement approval.
2. Phases 2 and 3: the foundation.
3. Phase 4 up to T027: **stop and check that US1 runs end to end in mode A**, with the four read tools against the 100-device scenario engine and the freshness and agent-economy tests green.
4. Then the mode H path: the link integration tests, sign-in through the fake Entra.

### Incremental Delivery

1. Mode A, end to end (T027).
2. The admin page and enrollment (T028, T029).
3. The hybrid deploy (T030 to T032).
4. Real agents and the soak (T033).

---

## Traceability Check (both directions)

Run on 2026-11-02 against `iterations/001/plan.md` (the requirement scope) and `spec.md`.

**Requirements to tasks**: every in-scope FR and SC has at least one task.

| Requirement | Tasks |
| --- | --- |
| FR-001 | T009, T020, T021, T025, T027, T032, T033, T034, T035, T036 |
| FR-002 | T008, T009, T013, T019, T021, T027, T034, T035, T036 |
| FR-005 | T009, T016, T018, T021, T027, T029, T034, T035, T036 |
| FR-006 | T006, T007, T008, T010, T014, T018, T019, T021, T027, T034, T035, T036 |
| FR-026 | T004, T013, T025, T034, T035, T036 |
| FR-029 | T001, T006, T010, T022, T023, T024, T031, T032, T033, T034, T035, T036 |
| FR-030 | T001, T022, T023, T024, T025, T034, T035, T036 |
| FR-032 | T001, T003, T006, T012, T016, T017, T022, T028, T029, T030, T031, T034, T035, T036 |
| FR-033 | T001, T011, T013, T034, T035, T036 |
| FR-034 | T001, T003, T005, T012, T034, T035, T036 |
| FR-040 | T003, T029, T034, T035, T036 |
| FR-042 | T001, T013, T014, T015, T016, T017, T033, T034, T035, T036 |
| FR-044 | T001, T008, T026, T027, T030, T032, T034, T035, T036 |
| FR-046 | T002, T004, T011, T015, T017, T034, T035, T036 |
| FR-047 | T002, T004, T011, T024, T034, T035, T036 |
| FR-048 | T011, T034, T035, T036 |
| SC-003 | T033, T035 |
| SC-005 | T018, T021, T033, T035 |
| SC-006 | T009, T020, T035 |
| SC-011 | T030, T033, T035 |

**Tasks to requirements**: all 36 tasks cite at least one in-scope FR or SC. TG-004 appears only paired with FR-026 (T004, T013). No task cites a requirement outside iteration 001's scope.

**Result**: PASS.

- FR coverage: 16/16.
- SC coverage: 4/4.
- Orphan tasks: 0.
- Every task has an owner role and an effort.
- Effort: 42 SP against a capacity of 42.

**Partly delivered in iteration 001** (as `iterations/001/plan.md` states):

- FR-005: push reception and the last event are filled from 002.
- FR-026: the read limit and the shared Ring limiter only.
- FR-030: the read scope only.
- FR-040: the minimal admin page only.
- FR-042: the 24-hour catch-up is 002.
- FR-046: link version 1, completed in 002 without a bump.

---

## Notes

- **The audit chain (DRIFT-001-04).** data-model.md and research.md PT-33 start the `audit-90d` and `audit-1y` chains in iteration 001, but no iteration 001 work item builds the Audit accessor, and FR-035 is outside 001's scope. These tasks follow the approved iteration plan, so iteration 001 writes no audit entries. Resolved at the tasks boundary on 2026-11-02: the owner kept the plan as it is, and data-model.md and PT-33 now start the chains in iterations 002 to 004.
- **Owner values.** The owner's subscription, tenant, IDs and home details never enter the repository. Scrubbed Ring payloads are committed only after the owner's review.
- **Commits.** Commit after each task or logical group, and only with the owner's go-ahead.
- **Rules.** The implement-time code rules come from `implementation-rules.yml`, through the specrew-code-rules skill. Workshop question 16 (`code-rules.local.yml`) is still open, so the shipped catalog applies.
