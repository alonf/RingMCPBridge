# Research: Ring MCP Bridge (Phase 0)

**Feature**: `001-ring-mcp-bridge` | **Date**: 2026-11-02 | **Spec**: `specs/001-ring-mcp-bridge/spec.md`
**Iteration in scope**: 001, part 1 of design-analysis Option B (hybrid walking skeleton), approved by the owner on 2026-11-02. At plan the owner split the Option B slice into iterations 001 and 002.

This file consolidates decisions that were already made and human-confirmed in the design workshop (ten lenses, closed 2026-10-23 to 2026-11-01), the clarify session (2026-11-01) and the design analysis (2026-11-02). It makes no new decision. Where a later amendment overrides earlier text, the entry states the later decision and names the superseded text in its rationale. The items the records left open, and the conflicts between records, were resolved at plan on 2026-11-02 (see "Plan-time resolutions" and "Conflicts resolved at plan"). The owner reviews them at the plan boundary.

**Record abbreviations used in the Source lines** (all under `specs/001-ring-mcp-bridge/` unless noted):

- **PD**: `workshop/product-domain.md`
- **NFR**: `workshop/requirements-nfr.md`
- **AC**: `workshop/architecture-core.md`
- **IA**: `workshop/integration-api.md`
- **SEC**: `workshop/security-compliance.md`
- **DS**: `workshop/data-storage.md`
- **OR**: `workshop/observability-resilience.md`
- **DO**: `workshop/devops-operations.md`
- **CD**: `workshop/component-design.md`
- **CODE**: `workshop/code-implementation.md`
- **IR**: `implementation-rules.yml`
- **DA**: `iterations/001/design-analysis.md`
- **HG**: `iterations/001/quality/hardening-gate.md`
- **RG**: `.specrew/repository-governance.yml` (project root)

## Decisions

### R1. Language and runtime

- **Decision**: TypeScript on Node everywhere: the Azure core, the home connector, all-in-one mode A and the channel shim. Node 26 LTS on every part. The fallback is Node 24.11 or later (the floor comes from Babel 8 through Stryker; the runtime alone needs 24.7 for `crypto.argon2`). `devEngines.runtime` sits in the root `package.json` (node `^24.11 || ^26`, onFail error). `engine-strict` is not used. The LTS is re-checked at each feature.
- **Rationale**: Ring access is the most volatile part, and everything hard for it already exists in TypeScript: ring-client-api, its push receiver, and live view through werift. The reference MCP SDK is TypeScript. Its v2 serves the 2026-07-28 revision and the legacy handshake from one server factory, which met the owner's condition for choosing TypeScript (verified 2026-10-24). One codebase makes the topology a deployment setting. Node 26 has `node:sqlite` (release candidate) and `crypto.argon2` built in. `engine-strict` would make every install fail on Node 26, because ring-client-api 14.3.0 was published before Node 26 existed and does not name it in its declared range.
- **Alternatives considered**:
  - C# on .NET 10, the owner's first preference, released by the owner on 2026-10-24. It was rejected for three reasons: there is no usable C# Ring client (writing one would take about 5 to 9 person-weeks), the push receiver has no .NET port, and there is no usable managed WebRTC.
  - A .NET core with a Node Ring sidecar, the runner-up. Rejected because it needs a cross-language contract, two toolchains, and about 1 to 2 extra weeks.
  - .NET plus Node plus a Go media sidecar. Redundant unless 2K/4K H.265 is needed.
  - Python only. Rejected because its Ring library has no Ring Alarm support.
  - Go only. Rejected because no Go Ring client exists.
  - Starting the connector on Node 24 (I6 finding 1). The owner kept Node 26.
- **Source**: AC "Decided by the human so far" (stack, 2026-10-24), "Language strategy comparison", B2; CODE "I2 decided" (I2.1), "The human on I6" (finding 1); IR `code-rule.lts-version-check`, `project.supply-chain-policy`.

### R2. TypeScript toolchain and module system

- **Decision**:
  - **Compiler**: TypeScript 6.0.3 alone, pinned exactly, with settings that are ready for TypeScript 7. The move to 7.1 is a tracked follow-up, made once typescript-eslint declares support.
  - **Syntax**: erasable syntax only, so no enums, parameter properties, runtime namespaces or decorators. Node runs the `.ts` files directly while coding, and `tsc` builds JS for the container images.
  - **Modules**: ES modules only, with `module` and `moduleResolution` set to `nodenext`.
  - **Strictness**: `strict` plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `verbatimModuleSyntax`, `erasableSyntaxOnly` and `rewriteRelativeImportExtensions`.
  - **Imports**: relative imports with the `.ts` extension, and no path aliases.
- **Rationale**: one compiler. typescript-eslint supports TypeScript `>=4.8.4 <6.1.0`, and TypeScript 7.0 ships no compiler API. ring-client-api, oidc-provider and the MCP server package are all ES modules, and TypeScript 7 removed the older module-resolution modes. Node's type stripping accepts only erasable syntax and ignores tsconfig `paths`.
- **Alternatives considered**:
  - TypeScript 7.0 with TypeScript 6 aliased in for linting. This is Microsoft's recommended path, but it means two compilers.
  - TypeScript 7.0 with no typed linting. Conflicts with I1 (a).
  - A classic build with full syntax. Needs a build or watch step while coding.
  - Node running `.ts` in production. Node refuses `.ts` under `node_modules`, and the images would carry the sources.
  - Path aliases or `#` subpath imports. They would need a `.ts`/`.js` switch.
- **Source**: CODE "I2 decided" (I2.2 to I2.5), "I5 decided" (I5.2); IR `code-rule.ts.strictness-posture`, `code-rule.shared-code-packaging`.

### R3. Lint, format and code rules

- **Decision**:
  - **ESLint**: ESLint 10 with flat config and typescript-eslint `strictTypeChecked` plus `stylisticTypeChecked`, versions locked, with typed linting everywhere.
  - **Key lint rules**: `no-floating-promises`, `no-misused-promises`, `switch-exhaustiveness-check`, `no-explicit-any` and `consistent-type-imports`. `max-depth` is set to 3.
  - **Formatting**: Prettier defaults, plus `eslint-config-prettier`. Lint and format run at pre-commit and in CI.
  - **Code rules**: Specrew's 19 baseline rules apply, minus exception 1 (CD4 replaces "DTOs between services"). Magic numbers are checked in review only.
  - **Lighter choices**: L1 to L5 (copy semantics, no locks on the one event loop, strategy/state maps, declarative collections, evidence-driven performance).
  - **Naming**: N1 to N5:
    - kebab-case files, with `index.ts` as the entry file;
    - named exports only;
    - typescript-eslint `naming-convention`;
    - no `I` prefix on interfaces;
    - `#private` fields.
- **Rationale**: the enforced layer is the compiler, the linter and the formatter, all checked in CI (I1 (a)). ESLint's `max-depth` counts a `try` block, and I3 puts one at each client edge.
- **Alternatives considered**:
  - Specrew's defaults as shipped (I1 (c)).
  - The same with the Google TypeScript Style Guide added (I1 (b)).
  - `private readonly` instead of `#private` fields.
- **Source**: CODE "I1 decided", "I2 decided" (I2.6), "I7 decided"; IR `code-rule.avoid-deep-nesting`, `code-rule.no-magic-numbers`, custom rules `project.n1` to `project.n5`.

### R4. Key runtime dependencies

- **Decision**: these packages, at exact versions, recorded with full FR-013 dependency records in IR.

| Package | Version | Licence | Used only in |
| --- | --- | --- | --- |
| ring-client-api | 14.3.0 | MIT | Ring Adapter and Live Media (home); never in CI |
| werift (transitive) | 0.22.4 | MIT | through ring-client-api; its five `werift-*` parts pinned by npm overrides |
| @eneris/push-receiver (transitive) | 4.3.0 | MIT | through ring-client-api |
| ffmpeg (system package) | the base image distribution's package | LGPL or GPL (assumed) | called by path; never `ffmpeg-for-homebridge`'s download |
| @modelcontextprotocol/server | 2.4.0 | Apache-2.0 | MCP Endpoint and the shim |
| @modelcontextprotocol/client | 2.4.0 | Apache-2.0 | the shim and the end-to-end tests |
| @modelcontextprotocol/hono | 2.0.2 | Apache-2.0 | MCP Endpoint |
| hono | 4.13.14 | MIT | MCP Endpoint and Web route handlers |
| @hono/node-server | 2.1.5 | MIT | the HTTP listener under Hono |
| oidc-provider | 9.13.3 | MIT | Issuer and Grants; a second instance is the fake Entra in tests |
| ws | 8.22.0 | MIT | the Link transport, both ends |
| zod | 4.6.7 | MIT | edge parsers, Public Contract, JSON Schema export (`z.toJSONSchema`) |
| mssql (tedious 20.3.8) | 12.7.13 | MIT | the Query layer's T-SQL side (managed identity) |
| @azure/identity | 4.14.1 | MIT | Secrets, Media Cache, Audit, T-SQL Query layer |
| @azure/keyvault-secrets | 4.12.0 | MIT | Secrets |
| @azure/storage-blob | 12.34.0 | MIT | Media Cache and Audit |
| `node:sqlite` | built in | (Node) | Outbox Store, mode A, the Query layer's SQLite side |
| `crypto.argon2` | built in | (Node) | the PIN hash (iteration 004) |

- **Rationale**: each package was chosen by an earlier lens. Then I6 checked its registry metadata, advisories, licences and declared Node range. Hono with the SDK's Hono adapter is lean, and Express 5 is the fallback. zod already comes with the MCP server package and writes JSON Schema itself.
- **Alternatives considered**:
  - The SDK's Node or Express adapter instead of Hono.
  - `tedious` used directly instead of mssql.
  - Calling the Azure REST APIs by hand instead of the Azure SDKs.
  - better-sqlite3. It is also synchronous, so B5 would stand either way.
  - A native argon2 package.
- **Source**: CODE "I6 at a glance", "I6 decided" (groups A and B); IR `dependency_policy.selected`.

### R5. Dev and CI tooling

- **Decision**: the following tools are dev dependencies, except the CI images and gitleaks:

  - typescript 6.0.3 (Apache-2.0)
  - @types/node 26.6.6 (MIT)
  - eslint 10.14.0 (MIT)
  - typescript-eslint 8.72.1 (MIT)
  - prettier 3.9.10 (MIT)
  - eslint-config-prettier 10.1.8 (MIT). Its July 2025 hijacked versions do not include 10.1.8.
  - vitest 5.0.5 and @vitest/coverage-v8 5.0.5 (MIT)
  - vite 8.3.5 (MIT; a peer of Vitest)
  - @stryker-mutator/core and @stryker-mutator/vitest-runner 10.1.1 (Apache-2.0)
  - @playwright/test 1.64.1 (Apache-2.0)
  - dependency-cruiser 18.7.0 (MIT)
  - gitleaks 8.30.1 (MIT): a pinned binary checked by checksum, not an npm package
  - CI images, not npm dependencies: the SQL Server container and Azurite
- **Rationale**: the owner asked for the best coverage, with simulation of the real devices and services. Vitest gives coverage thresholds, fake timers, snapshots and a dedicated Stryker runner. dependency-cruiser checks what is reachable from each wiring file, not only direct imports. gitleaks needs no GitHub Action and no licence key.
- **Alternatives considered**:
  - Node's built-in test runner. Its coverage is experimental, and mutation testing works only through a TAP runner.
  - A hand-written import-graph walk instead of dependency-cruiser.
  - gitleaks-action.
- **Source**: CODE "I4 decided" (I4.2), "I6 decided"; IR `dependency_policy.selected`.

### R6. Built-in-first choices and dependency policy

- **Decision**:
  - **B3 to B12, the built-in choices**:
    - B3: our own JSON-lines logger, with an allow-list of fields;
    - B4: dependency injection wired by hand in the Host's wiring files, with no DI container;
    - B5: `node:sqlite` (`Database` when present, otherwise `DatabaseSync`);
    - B6: hand-written SQL per dialect, with numbered, forward-only migration files that the Host applies under the lease;
    - B7: tagged templates that escape by default;
    - B8: `crypto.argon2`;
    - B10: git `core.hooksPath` pointing at a committed `.githooks` folder, set by npm `prepare`;
    - B11: `npm sbom` with a licence allow-list;
    - B12: GitHub Actions service containers in CI, and compose locally.
  - **Group C, the supply-chain policy**:
    - exact versions, one lockfile, and `npm ci` everywhere;
    - install scripts switched off only in the CI and image install commands (`npm ci --ignore-scripts`), not in the committed `.npmrc`;
    - no `engine-strict`, and `devEngines` at the root;
    - npm overrides pin werift's five parts;
    - `npm audit` fails on high or critical findings across the whole tree, with a written exception list. Its first entry is `ip` through werift 0.22.4, GHSA-2p57-rm9w-gvfp, until ring-client-api ships werift 0.25.
  - **The licence allow-list**:
    - at runtime: MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, 0BSD, BlueOak-1.0.0 and Unlicense;
    - for dev only: also MPL-2.0 and CC-BY-4.0;
    - use-restricted licences are never allowed (B15);
    - ffmpeg comes from the Linux distribution.
  - **Ongoing dependency hygiene**: Dependabot alerts and weekly grouped updates. An FR-013 record goes into IR before any new dependency merges (stance `approved-new-dependencies`).
  - **Needs for implement**: an audit-exception script over `npm audit --json`, and a licence check over `npm sbom`.
- **Rationale**: nine of the twelve I6 choices add no dependency. Install scripts are switched off so that the nonfree static ffmpeg build is never downloaded.
- **Alternatives considered**:
  - A dependency-adding option for each B choice (CODE "I6 in detail").
  - `engine-strict`. It would block Node 26.
  - A CI check over the lockfile's engine declarations, with exceptions. Not chosen: little gain while CI tests run on the image's Node.
- **Source**: CODE "I6 decided"; IR custom rules `project.built-in-first` and `project.supply-chain-policy`; AC B15.

### R7. Repository and source layout

- **Decision**: I5 (b), one npm workspace with two packages:
  - `bridge`: the core and the connector, one package with two modes;
  - `shim`: depends on the MCP SDK only.

  Inside them:

  - The root is private and holds the dev tools and the single lockfile.
  - The Host's `main.ts` reads the run mode (a Config setting) and loads one wiring file (`core.ts`, `connector.ts` or `all-in-one.ts`) through a dynamic import of a literal path.
  - A seam's `index.ts` exports only its interface and DTOs. Each implementation lives in its own file, and only the Host's wiring files import those files.
  - Unit tests sit beside the code. Integration and end-to-end tests live in `bridge/test/`.
  - Generated JSON Schema goes in `schemas/`, Bicep in `infra/`, and PowerShell 7 scripts in `scripts/`.

```text
ring-mcp-bridge/                repository root, npm workspaces root (private)
|-- package.json                workspaces: bridge, shim; dev tools; devEngines
|-- package-lock.json           one lockfile
|-- tsconfig.base.json          the I2 settings
|-- eslint.config.js  vitest.config.ts  playwright.config.ts
|-- bridge/                     core + connector: one package, two modes
|   |-- package.json            runtime libraries
|   |-- Dockerfile              one image; run mode is a Config setting
|   |-- src/
|   |   |-- host/               main.ts + wiring: core.ts, connector.ts, all-in-one.ts
|   |   |-- core/
|   |   |   |-- clients/        mcp-endpoint/ issuer/ web/ connector-link/ ...
|   |   |   |-- managers/       inquiry/ control/ media/ event/ admin/
|   |   |   |-- engines/        summary/ safety/ capture/ classify/ health/
|   |   |   '-- access/         ring-access/ state/ event-log/ ... secrets/
|   |   |-- connector/
|   |   |   |-- clients/        setup-cli/ core-link/ push-listener/ home-scheduler/
|   |   |   |-- managers/       execute/ ingest/
|   |   |   |-- engines/        normalize/
|   |   |   '-- access/         ring-adapter/ live-media/ outbox-store/ secrets-file/
|   |   |-- utilities/          security/ logging/ pub-sub/ config/ clock/
|   |   |                       link-transport/ query-layer/
|   |   '-- contract/           Public Contract (schemas only, no logic)
|   '-- test/                   integration and end to end, by subject
|       |-- scenarios/          generic scenarios; local/ is git-ignored
|       '-- fixtures/ring/      recorded payloads, after scrub and owner review
|-- shim/                       channel shim: package.json (MCP SDK only), src/
|-- schemas/                    Public Contract as JSON Schema (generated; CI fails if stale)
|-- infra/                      Bicep
|-- scripts/                    PowerShell 7 scripts
'-- .github/ .specify/ specs/   CI workflows and Spec Kit
```

- **Rationale**: this follows the real reuse boundary. The core and the connector share the utilities, the Link transport and the link messages, and they run together in mode A. The shim runs on another machine and shares no code with them. Loading one wiring file per run mode keeps each process from loading the other side's libraries.
- **Alternatives considered**:
  - (a) One package. The shim would then carry every bridge library.
  - (c) One package per deployable, seven `package.json` files in all. It needs a `.ts`/`.js` condition switch and two spikes, and it would amend "one package, two modes".
  - pnpm. Not shipped with Node through Corepack from v25.
- **Source**: CODE "I5 decided" (I5.1 to I5.3); IR `code-rule.shared-code-packaging`.

### R8. Decomposition and component contracts

- **Decision**: IDesign volatility-based decomposition is binding (B1), and the component map v3 is unchanged.
  - **Call rules**:
    - clients call managers;
    - managers call engines and resource access;
    - a manager never calls another manager except through queued calls over Pub/Sub;
    - engines do no I/O;
    - any layer may call a utility.
  - **The two exceptions**:
    - X1: the Issuer calls Grants directly;
    - X2: the Link transport is a shared utility owned by the Host.
  - **Interfaces (CD3)**: only where there is more than one implementation, as a TypeScript type taken in the constructor, with no base classes.
    - Production seams: Ring Access, Delivery, Media Cache, Audit, Secrets, Query layer.
    - Test-only seams: Clock, Link transport, the simulated home, the fake Entra sign-in.
  - **Contracts (CD4)**:
    - each component exports its own DTOs and its own error class from its one `index.ts`, and the callee declares them;
    - there is no shared types file, and over the link the receiver declares;
    - only MCP Endpoint and Delivery import the Public Contract (Q1 (a));
    - per-component string-named brands are applied at the zod edge parsers (Q2 (c));
    - dependency-cruiser checks all of this in CI.
  - **Extension (CD5)**:
    - composition at start, where the Host binds the seams from Config;
    - policy as data: Settings, audited, and Config for pilot-tuned values;
    - Pub/Sub for queued manager calls;
    - no inheritance trees and no plugins.
- **Rationale**: each component hides one thing that will change. CD4 overrides Specrew's baseline "the caller defines the DTOs" (I1 row 8, exception 1), following the owner's own direction.
- **Alternatives considered**:
  - A shared types file.
  - Caller-defined DTOs.
  - The other options for Q1 and Q2 in CD4.
  - A DI container. Decorator-based containers are ruled out by erasable syntax.
- **Source**: AC B1, "Building blocks"; CD "Lens 9 summary" (CD1 to CD5); CODE "I1 decided"; IR custom rule `project.cd4-callee-declares-dtos`; DA "Co-Design Record".

### R9. Topology H plus mode A, and Ring reached only from home

- **Decision**:
  - **Topology H (hybrid)** for the owner's deployment. The core runs in Azure, and the home connector dials out to it.
  - **Mode A (all-in-one)** is the same code wired by the Host in one process at home. It serves local MCP clients only and is used for development, CI and open-source users without a cloud. Topology C (all in Azure) is never used.
  - **Ring only from home (B4)**: unofficial Ring access happens only from the home connector, never from Azure.
  - **Ring secrets stay home (B5)**: the Ring token, the push credentials and the device ID stay on the connector, and no tool exposes them.
  - **No inbound ports at home (B6)**: the connector only connects out.
  - **One of each (B7)**: exactly one connector per Ring account owns its session, and exactly one core replica runs.
  - **Mode A specifics** (clarify, 2026-11-01):
    - arm and lights are off by default;
    - disarm is never offered;
    - the admin page is served on localhost and opened with a one-time link;
    - there are no out-of-band alerts and no write-once copy.
- **Rationale**:
  - **The firewall**: Ring's firewall blocks datacenter IPs (HTTP 406).
  - **The blocking pattern**: blocking is reputation-based and "can start at any time", so a passing test would not make cloud access safe.
  - **Tokens**: Ring tokens are tied to a hardware ID and to one owner process.
  - **Why the cloud core still helps**: H gives native public HTTPS for ChatGPT and claude.ai. It also lets the cloud still answer, and send "home offline", when the home is down (B12).
  - **The weakness of mode A**: it needs a tunnel for cloud agents, and it cannot report its own outage.
- **Alternatives considered**:
  - A only. It needs a tunnel and OAuth at home, and has no home-offline alert.
  - C. Blocking is a risk, and the official API alone has no alarm or control.
  - A user-supplied tunnel in front of mode A. Considered and left for later.
- **Source**: AC "Topology comparison", B3 to B7, B12, O12; PD "Constraints"; spec "Clarifications" (2026-11-01), FR-045.

### R10. Home connector host

- **Decision**:
  - **The VM**: an Ubuntu 24.04 LTS VM on Hyper-V (2 vCPU, 2 GB, 20 GB) with Docker and automatic security updates. It starts with the host and is kept out of backups and checkpoints (DS5). It gets its own Hyper-V switch or VLAN if the router allows it (SC6).
  - **The connector image**: amd64 and arm64, published to ghcr.io. While the repository is private, it is pulled at home with a read-only token kept on the VM. It is never updated automatically: the admin page shows when it is behind, and the owner pulls the new image.
  - **Health and logs**: a Docker health check, and Docker log rotation. Connector logs stay at home.
- **Rationale**: no GPU is needed for occasional frames and short clips. A dedicated VM keeps the bridge away from other home systems.
- **Alternatives considered**: other always-on machines at home were considered and kept for other uses. Running the connector on the dev PC was also rejected: the dev PC keeps only the shim.
- **Source**: AC "Home box candidates" and "Chosen" (2026-10-24); DO1, DO5, "Lens 7 summary"; OR carry-forwards (Docker log rotation).

### R11. Hosting the core

- **Decision**:
  - **The service**: App Service B1 Linux in Israel Central, one instance, with Always On and WebSockets switched on in the Bicep.
  - **The image**: the core runs as a container from the owner's existing container registry. It is pulled with the core's managed identity (AcrPull). The registry is referenced by name as a deploy-time value and stays outside this project's Bicep.
  - **Networking**: VNet integration with service endpoints.
  - **Health**: App Service's health check on `/readyz` and auto-heal on `/livez`.
  - **Deploys**: a deploy may overlap the old and new containers briefly, so the single-instance lease keeps only one of them acting.
- **Rationale**: one flat price whatever the traffic. The connector's WebSocket and the agents' listen streams are always open, which would keep Container Apps at its active rate. Reusing the existing registry adds no cost.
  - **Superseded text**: OR3, the DS diagrams and the SEC pilot checks still name Container Apps. The DO1 knock-on list replaces them: health check and auto-heal instead of probes, and the managed-identity federated credential is confirmed on App Service.
- **Alternatives considered** (prices agent-derived, Israel Central, read 2026-10-26):
  - Container Apps with 1 replica: about $20 a month while connections stay open, about $6 if idle.
  - A small Linux VM: about $12 or more, and the owner would patch the OS and run TLS. Not offered.
  - Foundry hosted agents. Not suitable: they expose agent protocols, not an MCP endpoint with our own OAuth; they run in per-session sandboxes that idle out; they support Python and C# only; and the region is not offered.
  - Functions MCP: stateless, with no push.
  - APIM: MCP tools only.
  - Deploying the core as code to App Service's Node runtime.
  - A new Azure Container Registry Basic: about $5 a month.
  - A ghcr.io token in App Service: a secret that expires. Not offered.
- **Source**: DO1, DO "Knock-on changes", DO "Follow-up answers" (?3), DO "Lens 7 summary"; AC "Amendments from later lenses" (2026-10-26, P1 and P2).

### R12. Cloud resources: Azure SQL, Blob with WORM, Key Vault, Entra ID

- **Decision**:
  - **Azure SQL Database Basic** (2 GB, 5 DTU):
    - point-in-time restore for 7 days by default, included in the price;
    - Entra-only sign-in, with an empty break-glass group as the SQL Entra admin;
    - reachable only from the app's subnet through free service endpoints, with no private endpoint.
  - **Blob**:
    - `media/` is kept 7 days;
    - `audit-90d/` and `audit-1y/` are the write-once (WORM) audit copy;
    - the WORM lock is applied after the pilot, as an irreversible runbook step.
  - **Key Vault**:
    - runtime secrets are referenced from the app settings, never stored in plaintext;
    - the core's identity has Secrets User on everything, plus Secrets Officer on `pin-hash` and `issuer-signing-keys` only (A1).
  - **Entra ID**:
    - the owner signs in through their organization tenant (passkey, MFA);
    - one Entra app registration;
    - the core's user-assigned managed identity acts as a federated credential, so there is no client secret.
  - **Monitoring**: Log Analytics and one Azure Monitor action group.
- **Rationale**: Azure SQL Basic is the cheapest managed SQL option with transactions (about $6.5 a month, agent-derived, Israel Central, read 2026-10-25). The cost of a PostgreSQL server is a floor, not driven by data. WORM gives tamper evidence (SC5).
- **Alternatives considered** (prices agent-derived, Israel Central, read 2026-10-25):
  - PostgreSQL Flexible: about $21.
  - Azure Tables: under $0.10, but needs a non-SQL adapter.
  - Cosmos DB serverless: about $2, assumed.
  - Azure SQL serverless: about $232 always on.
  - SQLite on a shared volume. Rejected.
  - Private endpoints: a monthly charge.
- **Source**: DS "DS3 decided", "Lens 5 summary"; DO1, DO4, DO6, DO evidence; SEC SC4, SC5 decided; CD "A1 decided".

### R13. Infrastructure as code

- **Decision**: Bicep, deployed by GitHub Actions: a what-if on each PR, and a deploy on `main` after the owner's approval. azd is not used.
  - **Deploy-time values**: the alert email and phone, the subscription, tenant and client IDs, the resource group and the registry name. None is ever committed.
  - **Placeholder secrets**: the first deploy creates `pin-hash` and `issuer-signing-keys` with placeholder values, and later deploys never touch their values (A1; to settle at plan).
  - **Manual runbook steps**:
    - the Ring login at home;
    - S1's secrets into Key Vault, only if S1 runs;
    - the connector enrollment;
    - the WORM lock after the pilot;
    - the restore drill;
    - one end-to-end test alert.
  - **A bootstrap script** (a need, written at implementation) is run once by the owner from their PC. It:
    - signs in with `az login`;
    - picks the subscription at run time;
    - creates the resource group;
    - creates the deploy identity with its GitHub OIDC federated credential;
    - gives that identity its limited roles;
    - sets the GitHub environment variables.

    Nothing about the owner's subscription goes into git.
- **Rationale**: one deploy path and fewer tools. Open-source users get the same Bicep and a README command.
- **Alternatives considered**: azd (`azd up`). Dropped.
- **Source**: DO2 decided, DO "Amendments from later lenses" (2026-10-28); CD "A1 decided", "The bootstrap: recorded as a need".

### R14. CI/CD, environments and identities

- **Decision**:
  - **Environments**:
    - **dev**: the owner's Windows desktop, with Node, Docker Desktop, and mode A on SQLite;
    - **CI**: throwaway, with SQLite, a SQL Server container and Azurite;
    - **production**: the owner's Azure and VM.

    There is no staging: the pilot runs on production with disarm off. The same images run everywhere, and only config differs.
  - **Pipeline** (GitHub Actions):
    - **On every PR**:
      - lint and types;
      - unit tests;
      - the MCP contract tests for both protocol eras;
      - integration tests on SQLite and on SQL Server;
      - the upgrade test from N-1 to N;
      - the latency test;
      - the licence check;
      - the secret scan;
      - the Bicep what-if.
    - **On `main`**:
      - the mode H end-to-end job (a new CI job);
      - the core image to the owner's registry (AcrPush);
      - the connector image to ghcr.io (amd64 and arm64);
      - deploy after the owner's approval;
      - a smoke test (`/readyz`, `get_health`).
    - **Rollback**: redeploy the previous image, which the additive schema allows.
    - **Template lanes**: the Specrew template lanes are kept, with their branch filters fixed.
  - **Identities**:
    - **Core**: a user-assigned managed identity with these rights:
      - Key Vault Secrets User, plus Secrets Officer on the two secrets;
      - Storage Blob Data Contributor;
      - a database user that reads, writes and migrates;
      - AcrPull.
    - **Deploy**: Contributor, plus role assignment limited to an allow-list that includes Key Vault Secrets Officer, on the resource group only. It also has AcrPush on the registry only, and signs in from GitHub by OIDC, so no Azure password is stored in GitHub.
- **Rationale**: no secret in the source code, even while the repository is private. Only the core's identity has rights to the database, Blob and Key Vault.
- **Alternatives considered**: a staging environment, which was not chosen.
- **Source**: DO3 to DO6, DO "Lens 7 summary"; CODE "I4 decided" (I4.5); SEC SC4; DS DS6.

### R15. Repository governance

- **Decision**:
  - **Hosting**: GitHub, private until the owner judges the project stable and ready, then public.
  - **Branches**: trunk-based, with `main` protected by rulesets (falling back to CI-only enforcement if the plan proves not to support them). No force pushes or deletions.
  - **Rules for everyone**: the rules apply to admins, and there are no bypass actors.
  - **Review gate**:
    - 0 required approvals, with comment resolution required;
    - GitHub Copilot reviews every PR automatically, and its comments must be resolved before a merge.
  - **Secret scanning**: gitleaks runs as a required PR check and as a pre-commit hook. GitHub push protection is switched on when the repository goes public.
  - **Work-kind check**: advisory at first.
  - **Release**: MIT licence, `SECURITY.md`, GitHub private vulnerability reporting, and no telemetry.
- **Rationale**: a solo maintainer cannot approve their own PR, so comment resolution plus automated review takes the place of approvals.
- **Alternatives considered**: public from the start; automated review off.
- **Source**: DO7 decided, DO "Follow-up answers" (?2); RG; SEC SC7.

### R16. Agent authentication: the bridge's own Issuer with Entra for the human

- **Decision** (SC1 option B):
  - **The Issuer**: an Issuer in the core on oidc-provider. Listed agents link through CIMD or DCR (listed agents only), and the owner's own machines are static entries.
  - **Sign-in**: the owner signs in with Entra ID in their organization tenant.
  - **Tokens and keys**:
    - access tokens last 1 hour;
    - refresh tokens rotate and end after 30 days unused or 90 days at most;
    - refresh grants are stored hashed;
    - signing keys live in Key Vault and are rotated every 90 days by the Scheduler (a daily tick) and Admin, with the old key kept for checking.
  - **Binding and fresh sign-ins**: tokens and confirmations are bound to the OAuth `sub` and the client. The admin and confirm pages require a fresh Entra sign-in (`prompt=login`).
  - **Machine identities** (SC2):
    - **Connector**: its own key pair, an enrollment code that the owner checks on the admin page, and a signed challenge at each hello. It gets no OAuth token.
    - **Shim**: OAuth with PKCE as a static Issuer entry, signed in once. Its refresh token is kept in Windows Credential Manager, and it gets the read scope.
    - **Azure-hosted agents**: their own managed identity.
    - **Core**: its managed identity.
  - **Mode A**: stdio, or an endpoint bound to localhost only, with no owner sign-in.
- **Rationale**: ChatGPT and the dot use CIMD or DCR, their documented paths. The bridge's own Issuer is the only way to enforce the lifetimes the owner confirmed. It costs $0, and Entra keeps the owner's passkey, MFA and admin control.
- **Alternatives considered**:
  - **(A) Auth0**: out, because there were not enough free app slots, and the paid tier starts at $35 a month (agent-derived, read 2026-10-25).
  - **(C) Entra only**: no CIMD or DCR, so every client is registered by hand. It cannot enforce the confirmed lifetimes (Entra refresh tokens are fixed at 90 days unused), and AADSTS9010010 errors are reported with MCP clients.
  - **An AWS-based sign-in**: dropped.
- **Source**: SEC "SC1 decided", "SC1 answers" (token lifetimes), SC2, "SC4 decided", "Lens 4 summary"; CD "A1 decided"; spec FR-029, FR-032.

### R17. Scopes and rate limits

- **Decision**:
  - **Scopes**: `read`, `media` and `control`, and configuration switches override scopes.
  - **Disarm**: off unless switched on. When it is on, it needs MRTR with URL elicitation and the PIN.
  - **Control** (arm and lights) goes to:
    - ChatGPT, the dot included (T10 option 2; residual risk accepted);
    - every Claude surface.
  - **Other clients**:
    - the shim gets read only;
    - Azure-hosted agents get read and media.
  - **Iteration 001**: grants the read scope only.
  - **Per-agent limits**, kept in memory and reset on restart:
    - control 20 an hour, counted on confirm;
    - reads 600 an hour;
    - fresh frames and bursts 60 an hour;
    - clips 20 an hour.
  - **Toward Ring**: one shared limiter for all outgoing Ring calls.
- **Rationale**: the owner's lights are outside only, and an unattended dot is accepted for arm and lights. Disarm keeps the strongest gate.
- **Alternatives considered**:
  - For ChatGPT: (1) no control, or (3) control with elicitation only.
  - Control for no Claude surface.
- **Source**: SEC "SC3 decided", SC6 decided; DS DS1; DA Option B ("the read scope only"); spec FR-026, FR-030.

### R18. MCP endpoint, protocol eras and the public contract

- **Decision**:
  - **One endpoint over HTTPS** serves both eras from one server factory, using SDK v2's dual-era support:
    - the 2026-07-28 revision, negotiated through `server/discover`;
    - the legacy era (2025-11-25 and earlier).
  - **The adapter**: Hono with `@modelcontextprotocol/hono`.
  - **Tools**: synchronous, with a 60 s deadline.
  - **The catalog**: the 13-tool D7 catalog. Iteration 001 uses the read-scope tools.
  - **Shapes**:
    - reply, error and event envelopes, each carrying `as_of`, `as_of_local`, `freshness` and `stale_since`;
    - the D7 error codes, plus `RING_REJECTED` and `BRIDGE_UNAVAILABLE`;
    - flat input schemas, with no `anyOf` and no nullable unions (IN7);
    - Ring strings marked as untrusted.
  - **Publishing**: the Public Contract is published as JSON Schema in `schemas/`, and changes are additive only (deprecate before removing).
  - **Claude Code**: the channel shim speaks the legacy handshake toward Claude Code, because Claude Code refuses a channel server that negotiates 2026-07-28.
- **Rationale**: one endpoint serves every target client. Flat schemas let every target client call the tools.
- **Alternatives considered**:
  - The C# SDK v2.3. Same dual-era support, but no OAuth server and no MCP Events.
  - APIM. MCP tools only.
- **Source**: AC "Decided by the human so far" (condition verified), B2, IN3, IN7; IA D2, D3, D7 ("v1 tool catalog", "Reply, error and event shapes", "Error codes", "Rules"); IA and OR "Amendments from later lenses"; CD CD4 Q1.

### R19. Event delivery to both protocol eras

- **Decision**:
  - **Durable before delivery (B10)**, in this order:
    1. the home outbox;
    2. one database transaction in the core (dedupe on `event_id`, next `seq`, append, state, audit link);
    3. the ack to home;
    4. Delivery.

    Push is a hint, and the log and cursor are the truth.
  - **Delivery adapters**, one per platform, each keeping its platform's envelope inside the adapter:
    - **ChatGPT MCP Events** webhooks, hand-built. They need 2026-07-28 and OAuth. S4 checks the `capabilities.events` key.
    - **Listen streams** on the modern era. The shim's connection to the core is one.
    - **The channel shim**, which relays push to Claude Code:
      - it runs over stdio with the legacy handshake;
      - Claude Code channels are a research preview behind a dev-channel flag;
      - the shim is push-only, and Claude Code keeps its tools on its normal remote HTTP connection.
  - **Other clients**:
    - claude.ai, Desktop and mobile get tools only, with no push, and pull through `get_events`.
    - The dot works on schedules from its own `get_events` cursor, with a per-client last-read mark in Subscriptions as the fallback.
  - **Delivery retries**: 3 tries (1 s, 5 s, 30 s), after which the event waits in the log.
  - **What is pushed**:
    - HIGH and MEDIUM are pushed by default, and opt-ins go through `set_push_filter`.
    - Late events are stored with `late: true` and not pushed. One `bridge.events_recovered` summary is pushed instead.
    - A snapshot never delays an event.
- **Rationale**: late alerts are the core pain, and the durable log makes the push trustworthy. A push-only shim stays tiny and keeps tools working if the channels preview changes.
- **Alternatives considered**:
  - A tool-proxying shim, with one connection and one credential. Not chosen: Claude Code's tools would then depend on the channels dev flag.
  - Pushing late events one by one, each marked late (A4 (b)).
  - Delivery into Foundry. Later (O4).
- **Source**: AC "Research verdicts" (stdio), "Flow: a HIGH event"; IA D1 (shim option), D3, "Contracts by boundary"; CD "Lens 9 summary" (Delivery, Subscriptions, A4); OR5; NFR "Event priority and motion policy" and its amendment; spec FR-010 to FR-014.

### R20. The home-to-core link

- **Decision**: a direct WebSocket over TLS, dialed out from home (P7, D1). It uses `ws` on both ends inside the Link transport utility, which the Host owns and which knows only frame types, versions and priority.
  - **The stream**: one duplex stream carrying events up and commands down, with replies correlated by Ring Access.
  - **Versioning**: versioned at hello, and the core accepts versions N and N-1.
  - **Identity**: the connector signs a fresh challenge from the core at each hello, and the core proves itself with its TLS certificate.
  - **Heartbeat**: every 15 s, carrying the Ring session, push, outbox depth, last Ring event and error counts. Two minutes without one means the home is offline: data is marked stale and a HIGH event goes out.
  - **Reconnect**: exponential backoff from 1 s, doubling to a 30 s cap, with full jitter.
  - **Outbox resend**: oldest first, on reconnect or after 10 s without an ack.
  - **Commands**: sent at most once, and never re-sent after a drop.
  - **Media**: travels in small chunks behind commands, events and heartbeats.
  - **Mode A**: no transport is created, and Ring Access calls Execute in-process.
- **Rationale**: there are no inbound ports at home, and no extra Azure service or cost.
- **Alternatives considered**:
  - Azure Web PubSub or Azure Relay (P7).
  - Uploading capture bytes to Blob instead of sending them over the link.
- **Source**: IA D1 to D3, D8 "Rules surfaced by walking the sequences"; CD "CD2 decided" (X2); SEC SC2 (enrollment); OR5; AC P7.

### R21. Storage and consistency (SQLite and T-SQL through the Query layer)

- **Decision**:
  - **Where the data lives**:
    - **Core**: Azure SQL Basic.
    - **Connector**: a SQLite outbox with its own schema, and the encrypted secrets file.
    - **Mode A**: the same schema in one SQLite file, media in a folder, and no WORM.
  - **The Query layer seam**: one SQLite implementation and one T-SQL implementation (`query-layer/sqlite.ts`, `query-layer/tsql.ts`), with hand-written SQL per dialect. Only a few statements (insert-or-update, paging) have two versions.
  - **Migrations**: additive, forward-only and numbered. The Host applies them at start, under the lease. A CI upgrade test from the previous release runs on SQLite and on SQL Server.
  - **Consistency (DS4)**:
    - one transaction per event;
    - used one-time tokens and command IDs are stored;
    - a pending disarm is cancelled on restart;
    - for media, the blob is written first, then its row;
    - the audit is shipped to WORM at least once;
    - the PIN tries and the lock live in one row owned by Command (A2).
  - **Access**: each component reads only its own tables. Only the core's identity has database rights.
  - **Memory only**: the rate-limit counters and open listen streams.
  - **Cursors**: they carry an epoch, and `seq` is never reused.
  - **SQLite posture (a)**:
    - synchronous `node:sqlite` calls on the event loop are accepted and kept short;
    - the 0.5 s p95 test also runs in mode A;
    - if that test fails, SQLite moves to a worker thread.
- **Rationale**: SQLite fits one writer on a local disk (the outbox and mode A). It is a few MB, runs on ARM, and needs no password at home.
- **Alternatives considered**:
  - For mode A:
    - SQL Server Express in a container. It runs on x86-64 only, needs 2 GB, and puts a password at home.
    - PostgreSQL or MongoDB in a container. A third dialect or a third data model.
  - SQLite in a worker thread (posture (b)).
- **Source**: DS DS1 to DS6, "DS3 decided", "Answers 2026-10-26", "Amendments from later lenses" (A2); CODE "I6 decided" (B5, B6), "I7 decided" (questions 11 and 13); IR `code-rule.never-block-event-loop`.

### R22. Retention

- **Decision**:
  - **Events**: 30 days.
  - **Cached frames and clips**: 7 days by default, configurable.
  - **Audit**: 90 days for control and media-access entries, and 1 year for security and configuration entries, each with a WORM copy. The audit purge keeps an anchor.
  - **Database backups**: point-in-time restore for 7 days (Basic's default).
  - **The Ring token**: never backed up. Losing the VM means redoing the Ring login and 2FA.
  - **Purges**: run on the Scheduler's minute ticks.
  - **Mode A**: keeps the hash chain only.
  - **Log Analytics retention**: see "Open decisions".
- **Rationale**: these are the NFR targets (event completeness, media retention), with audit periods split by entry type. A backup would be a second copy of the most sensitive secret, and it may be stale anyway.
- **Alternatives considered**: backing up the encrypted secrets file with its key kept separately. Not chosen.
- **Source**: NFR priority 3 and "Mandatory behaviors" (8); SEC "SC5 decided"; DS DS4, DS5, "Answers 2026-10-26"; spec FR-008, FR-021, FR-035.

### R23. Observability

- **Decision** (OR1, "Reasonable"):
  - **Logs**: structured JSON lines to stdout from our own allow-list logger, sent to Log Analytics. There is one line per tool call, event, command and minute tick.
  - **Metrics**: computed from the logs and the event timestamps. There is no vendor SDK and no OpenTelemetry in v1.
  - **Correlation (OR2)**: `event_id` end to end; `request_id`, `command_id` and `client_id` from the agent's call to the Ring call and back; and the connector session ID on every line.
  - **Never logged**: device names, tool argument values, tokens, PINs, keys, images or sound.
  - **The connector**: its logs stay at home, and only a health summary rides the heartbeat.
  - **Health**:
    - `/livez` covers the process and its event loop;
    - `/readyz` covers the database, the lease and the secrets;
    - a Docker health check runs at home;
    - `get_health`, and HIGH health events to agents.
  - **SLIs**:
    - bridge-internal latency p95 (`pushed_at - received_at`);
    - end-to-end latency p95 (`pushed_at - ring_ts`);
    - reconnect time and stale detection;
    - days since the last Ring login;
    - outbox depth;
    - delivery failures;
    - WORM lag;
    - database size and DTU;
    - Ring errors and circuit openings.
- **Rationale**: about $1.50 a month in total (agent-derived, Israel Central, read 2026-10-26), with IDs instead of content (SC4, SC7).
- **Alternatives considered**: "By the book": OpenTelemetry traces to Application Insights, dashboards and SLO burn-rate alerts, at more cost and more code.
- **Source**: OR "Lens 6 summary" (OR1, OR2, OR3, OR6), "Signals to measure"; DO "Knock-on changes"; IR `code-rule.logging-traceability`, `code-rule.vendor-neutral-observability`.

### R24. Out-of-band alerts

- **Decision**: Azure Monitor sends **email and SMS through one action group**. The owner enters the address and the number as GitHub Actions secrets at deploy time, and they are never recorded.
  - **Signals**:
    - **One log alert, evaluated every 5 minutes**: "no minute tick for 10 minutes, or any line marked out-of-band". The out-of-band lines are: home offline for over 10 minutes, Ring session lost, audit mismatch, and WORM shipping over 1 hour behind.
    - **Free metric alerts**: restarts, database size at 70% of 2 GB, and 80% DTU.
  - **Code and testing**: the alerts are defined as code. One end-to-end test alert is fired before the pilot ends.
  - **Iteration 002**: design-analysis Option B names the "out-of-band heartbeat and home-offline alerts", which are part 2 of its slice. Whether the out-of-band copy of "Ring session lost" is also in iteration 002 was contested, and is settled as iteration 004 ("Conflicts resolved at plan", item 4). The audit-mismatch and WORM-lag alerts come in iteration 004 with US6 (HG).
  - **Mode A**: has no outside watcher.
- **Rationale**: agents cannot hear a dead core, so the owner is told directly. SC-010 is within 15 minutes (agent-derived: a 10-minute condition checked every 5 minutes).
- **Alternatives considered**:
  - Azure mobile app push. Offered, not chosen.
  - An availability web test every 5 minutes: about $5.60 a month (agent-derived, Israel Central, read 2026-10-26), not the default.
- **Source**: OR3, "Answers 2026-10-26" (question 1), OR6 cost table; DO4; DA "Option B" Approach; HG row `operational-resilience-concerns`; spec FR-043, SC-010.

### R25. Resilience: limiter, circuit, backoff, lease

- **Decision**:
  - **Ring Adapter**:
    - one shared limiter for every Ring call;
    - 429 and 5xx back off from 2 s to a 60 s cap, with jitter;
    - a 406 counts as blocking;
    - the circuit opens after 5 failures in a row and lets one probe through each minute;
    - after 2 minutes, data is marked stale and a HIGH event goes out.
  - **Ring token refresh**: once per failure. A refusal is "session lost" (HIGH), with no retry loop.
  - **Push lost, or connector restart**: re-register the push. Then read Ring history once per location for the gap (up to 24 hours), through the limiter. Recovered events are marked `late: true`.
  - **Link and outbox**: reconnect with backoff from 1 to 30 s; resend from the outbox after 10 s.
  - **Delivery to agents**: 3 tries.
  - **Database**: one retry on a transient error. Otherwise there is no ack, and the connector resends.
  - **Media to Blob**: 2 retries inside the media budget.
  - **WORM shipping**: retried every tick until done.
  - **Commands**: never retried. After the 60 s deadline the result is `TIMEOUT`, with outcome unknown.
  - **Single-instance lease**:
    - one database row holding the holder and the expiry;
    - renewed every 15 s, and it expires after 45 s;
    - the Host holds it through Lease;
    - no database means no lease, which means no control (fail closed).
  - **Failure behaviour**:
    - **Database down**: reads fail with `BRIDGE_UNAVAILABLE` (retryable), and events stay unacked.
    - **Blob down**: the event goes out without a frame.
    - **Entra down**: existing tokens keep working, while new sign-ins and disarm fail closed.
  - **Concurrency (L2)**:
    - one event loop, and no locks;
    - no check-then-act across an `await` on shared state;
    - a queue per key where order matters.
- **Rationale**: the first goal is to protect the Ring account: no polling bursts, and no retry loop on a refused session. NFR 3 (no HIGH event lost) and NFR 4 (unattended operation) also apply.
- **Alternatives considered**:
  - For a database outage: an in-memory state copy served as stale. Not chosen, because it would extend B12.
- **Source**: OR4, OR5, "Retry and recovery detail", "Amendments to confirmed lenses"; AC "Amendments" (lease, 2026-10-26); CD "Lens 9 summary" (C6, C8); IR `code-rule.careful-retries`, `code-rule.concurrency-over-locks`; DA "Modifications" (DRIFT-001-01: concurrency, resiliency and retry/idempotency are required).

### R26. Error handling

- **Decision** (I3):
  - **When to throw**: exceptions are for the unexpected and for errors meant for the original caller. A known case that the caller handles on the spot is a normal return value.
  - **Declaring errors**: each component has one error class with a closed kind union, declared next to its DTOs. Control errors require an outcome in the constructor.
  - **Passing errors on**: a manager passes on only its own declared errors, with the original as the cause.
  - **Mapping by client**: each client maps errors by kind:
    - MCP Endpoint to the D7 codes;
    - the Issuer to OAuth error replies;
    - Web to page states;
    - the links to result messages;
    - Scheduler to the log and to Health.

    Any other exception becomes `INTERNAL`.
  - **Logging and messages**: each error is logged once, by the client that handles it. The caller sees only messages the bridge wrote.
  - **Cancellation and exit**: an AbortSignal is passed down every async call. Only a failure outside every handler exits the process.
- **Rationale**: the owner chose exceptions, in their own words, and confirmed the agent's reading.
- **Alternatives considered**: (b) expected failures as values and bugs as exceptions.
- **Source**: CODE "I3 decided"; IR `code-rule.idiomatic-error-handling`; IA D7 "Error codes".

### R27. Test strategy

- **Decision** (I4):
  - **A stand-in in CI for every real device or service**:
    - **Ring**: the scenario engine (see below);
    - **Ring payloads**: real Ring payloads recorded once at home by the owner, committed only after a scrub and the owner's review;
    - **Media**: fixed test images, and the real ffmpeg on short clips;
    - **The link**: the in-memory link pair, plus the real WSS on localhost with drops, delays and duplicates;
    - **Databases and storage**: SQL Server in a container, SQLite, and Azurite;
    - **Key Vault**: the encrypted-file Secrets;
    - **Entra**: a second oidc-provider acting as Entra (integration), with CD3's fake sign-in seam for unit tests;
    - **Time**: the fake clock;
    - **Agents**: the MCP SDK's own client, end to end against mode A;
    - **Push targets**: a local webhook receiver for ChatGPT Events, and a fake channel;
    - **Pages**: Playwright at 3 widths in both themes.
  - **The scenario engine**:
    - it is the simulated home grown out to every supported device type;
    - it runs scripted scenarios, with fault injection: Ring down or slow, a 406, a push gap, a session expiring, and the link dropping mid-command;
    - it is generic in the repository; the owner's own home is only an optional, git-ignored file under `bridge/test/scenarios/local/`.
  - **Runner and gates**:
    - **Runner**: Vitest 5.
    - **Coverage gate**: 90% lines and 85% branches. Excluded: the real Ring Adapter, Live Media, the Key Vault and managed-identity SQL implementations, and the Host's wiring.
    - **Completeness check**: every MCP tool, D7 error kind, event kind and page state has a test.
    - **Mutation testing**: StrykerJS, weekly, on the engines and Normalize.
    - **Test-first**: for the engines, edge parsers, Normalize and every bug fix.
  - **Named checks**:
    - **The CI dependency check**: dependency-cruiser with the I5.3 reachability rules:
      - from the connector's wiring, nothing reaches the Azure libraries, oidc-provider or mssql;
      - from the core's wiring, nothing reaches the Ring libraries, werift or ffmpeg;
      - other components are reached only through their entry files;
      - the shim imports nothing from the bridge;
      - only MCP Endpoint and Delivery import the Public Contract.
    - **The schema snapshot test**: guards D2's additive rule. CI fails if `schemas/` is stale.
    - **The 0.5 s in-bridge latency check**: a synthetic HIGH event, measured as `pushed_at - received_at` at p95, on every change. It also runs in mode A.
    - **Other named tests**: kill-and-restart; drop the Ring connection (stale within 2 minutes plus a HIGH event); agent economy (a 100-device fixture within about 8,000 tokens); link contract at N and N-1; upgrade from N-1 to N on both databases.
  - **When each layer runs**:
    - **Every PR**: about 12 minutes (estimate).
    - **`main`**: mode H end to end, before the deploy approval.
    - **Weekly**: mutation testing, and a "simulated week" on the fake clock.
    - **The pilot**: run by the owner only, with disarm off.
- **Rationale**: the owner asked for the best coverage, with simulation of the real devices and services. Ring secrets live only at home, so CI never touches the real Ring.
- **Alternatives considered**:
  - Node's built-in runner.
  - Keeping recorded payloads local-only (option (ii)).
  - A 100% coverage target. "Best" is not 100%: the last percent buys tests of trivial code.
- **Source**: CODE "I4 decided", "I5 decided" (I5.3); CD "Amendments from later lenses" (2026-11-01); NFR "Acceptance evidence"; IA D6; IR `code-rule.testing-posture`, `code-rule.evidence-driven-performance`.

### R28. The reviewer host

- **Decision**: **codex** reviews the code. It is independent of Claude, which writes the code. No model or effort is pinned, so Specrew uses the host default. The pick was recorded on 2026-11-01 (question 15) with `specrew review --host codex --authorization-ref workshop-001-ring-mcp-bridge`, which wrote `.specrew/reviewer-hosts.json`. Separately, GitHub Copilot reviews every PR automatically (R15).
- **Rationale**: an independent second host reviews the code.
- **Alternatives considered**: copilot, cursor-agent or claude as the reviewer host.
- **Source**: CODE "I8 decided", "Questions to the human" (14, 15); IR `reviewer_preference`; DO7.

### R29. Iteration slicing

- **Decision**: Option B, the hybrid walking skeleton. At plan the owner split its thin slice of US1 and US2 into iterations 001 and 002.
  - **Iteration 001**: part 1 of the slice, on the real hybrid path: agents read the home after signing in. Plus:
    - read scope only;
    - a minimal admin page (health and comparing the enrollment code);
    - Bicep and the Actions deploy.

    Mode A runs for development and CI.
  - **Iteration 002**: part 2 of the slice: pushed events (US2), the dot, and the out-of-band heartbeat and home-offline alerts.
  - **Iteration 003**: media (US3) and control (US4).
  - **Iteration 004**:
    - the full admin page (US6);
    - disarm, shipped off (US5);
    - the README for both modes (US7);
    - shared locations (US8).
  - **Quality profile**: the DRIFT-001-01 correction marks concurrency-correctness, resiliency and retry-idempotency as required.
- **Rationale**: test the riskiest uncertainty first:
  - the Ring session for a non-US account (iteration 001);
  - ChatGPT MCP Events and the dot (iteration 002);
  - Entra sign-in for each client (iteration 001);
  - the 10 s end-to-end budget (iteration 002).

  The bill is measured from the first iteration.
- **Alternatives considered**:
  - **Option A**: all-in-one first, with hybrid in its second iteration. $0 cloud at first, but ChatGPT waits.
  - **Option C**: build layer by layer. No agent connects until its third iteration.
- **Source**: DA "Option B", "Crew Recommendation", "Human Decision" (2026-11-02); `iterations/001/drift-log.md` DRIFT-001-01, DRIFT-001-03 (the split).

## Cost (agent-derived)

All figures are **agent-derived** from list prices in the Azure Retail Prices API for the **Israel Central** region. The dates the prices were read are given per line. GitHub figures are estimates checked on 2026-10-30. SC-011 sets a ceiling of **$30 a month**, checked on the bill in the pilot. The expected figure is about **$23 a month**.

| Item | Monthly | Basis | Prices read | Source |
| --- | --- | --- | --- | --- |
| App Service B1 Linux, 1 instance, Always On | $14.45 | $0.0198 an hour | 2026-10-26 | DO1, DO evidence |
| Azure SQL Database Basic | $6.46 | $0.21252 a day | 2026-10-25 | DS evidence, DS3 |
| One log alert, evaluated every 5 minutes | $1.50 | per rule | 2026-10-26 | OR6 |
| Metric alerts (first 10 signals) | $0 | free tier | 2026-10-26 | OR6 |
| Log Analytics ingestion (about 0.1 to 0.3 GB) | $0 | inside the free 5 GB (assumed per billing account; $3.29 per GB beyond) | 2026-10-26 | OR6 |
| Notifications | cents | SMS $0.016 each (rate for the owner's country); email assumed free for the first 1,000 | 2026-10-26 | OR6, OR answers |
| Blob: media and the WORM audit copy | under $1 (audit part under $0.10) | Hot LRS, $0.02 per GB-month, $0.055 per 10,000 writes | 2026-10-25 | DS, SEC SC5 |
| Key Vault | cents | $0.0396 per 10,000 operations | 2026-10-26 | DO evidence |
| VNet integration and service endpoints | $0 | no charge on Basic | 2026-10-26 | DO evidence, DO6 |
| Entra app registration, managed identities, role assignments, resource group, GitHub variables | $0 | recorded as free | not a price read | SEC SC1, CD bootstrap need |
| **Expected Azure total** | **about $23** | sum of the above plus small usage | as above | spec SC-011, DO1, DA |
| GitHub Actions CI | $0 extra | about 1,830 minutes a month, about $11 of the $18 included while private; free once public; about $0.36 an hour beyond (estimates) | 2026-10-30 | CODE I4.6 |

**Not priced in the records** (these are not in the $23):

- the owner's existing container registry: reused, an existing cost outside this project;
- the connector image on private ghcr.io, while the repository is private;
- GitHub Copilot's automated PR review;
- codex review runs, which bill on the owner's own codex plan;
- the home VM, which runs on the owner's existing Hyper-V host.

**Rejected alternatives, with their recorded prices** (agent-derived, same region and read dates):

- Container Apps: about $20 a month while connections stay open (DO1, 2026-10-26).
- Azure Container Registry Basic: $0.1666 a day, about $5 a month (DO ?3, 2026-10-26).
- A small VM, B2ats v2: $7.81, plus a disk and a public IP, about $12 or more (DO1, 2026-10-26).
- An availability web test every 5 minutes: about $5.60 a month (OR6, 2026-10-26).
- PostgreSQL Flexible B1ms: about $21 a month (DS, 2026-10-25).
- Azure SQL serverless, always on: about $232 a month (DS, 2026-10-25).
- Auth0 Essentials: from $35 a month (SEC SC1, 2026-10-25).

## Accepted unknowns and pending research

### S1: can a non-US Ring account use the official Partner API private app?

- **Status**: accepted as unknown by the owner on 2026-11-02, at the design-analysis stop. The research is postponed to development time, on the owner's condition that the known options stay open and that the research chooses between them. The owner gives the go before it runs.
- **Secrets rule**: the owner enters the secrets; the agent never sees them; they are encrypted at rest and never printed.
- **Known options** for how the bridge reaches Ring (PD "Accepted unknowns"):
  1. **The unofficial cloud API** (ring-client-api), called from the home connector. This is the v1 default, and Option B builds it.
  2. **The official Partner API** through a private app (OAuth sign-in, webhooks). Available only if an account at the owner's location can register and link one.
  3. **Both**: the official API for what it covers, and the unofficial one for the rest.
- **What the research decides**: whether options 2 and 3 are open. Only Ring Access (core) and Ring Adapter (home) change between options.
- **Known limits of the official API**: it is read-only, apart from playing a chime sound. Media is watermarked. Live view is 30 s (battery) or 60 s (wired). There is no SDK, and a cloud IP needs a static egress IP registered with Ring.
- **Source**: PD "Accepted unknowns" (S1), "Follow-up research"; AC "Spikes proposed before plan" (S1), "Research verdicts" (official API); spec "Assumptions" (the official API), TG-004.

### S2: do unofficial Ring login and push work from a datacenter (Azure) IP?

- **Status**: accepted as unknown by the owner on 2026-11-02. The research is postponed to development time, on the same condition as S1. The owner gives the go before it runs. Because the test can get the account flagged, its method is chosen when the task runs. The test is downgraded to informational.
- **Known options** for where the bridge's Ring calls originate (PD "Accepted unknowns"):
  1. **The home connector**, over residential egress. This is topology H and the v1 default.
  2. **The cloud core directly**, from Azure. That would make a cloud-only deployment possible for owners with no machine at home. The known evidence (Ring's firewall returns HTTP 406 to datacenter IPs) points against it.
  3. **The cloud core through a residential egress proxy.** This adds cost and carries the same terms-of-service conflict.
- **What the research decides**: whether a cloud-only mode is worth offering to other owners later. v1 does not depend on the answer: a pass would not move Ring access to the cloud in v1, because blocking is reputation-based (B4).
- **Source**: PD "Accepted unknowns" (S2); AC "Spikes proposed before plan" (S2), B4, O12; spec "Assumptions" (a Ring test from the cloud).

### Other spikes named in the records

| Spike | What it checks | Status | Source |
| --- | --- | --- | --- |
| S3 | A C# shim for the Claude Code channel | **Dropped** under the TypeScript-everywhere option; the TypeScript shim is the documented path | AC "Spikes proposed before plan" |
| S4 | Whether TS SDK v2 accepts ChatGPT MCP Events' top-level `capabilities.events` key (assumption A4) | **Proposed** under "Spikes proposed before plan"; no approval or run recorded. Option B tests ChatGPT events in iteration 002 | AC "Spikes proposed before plan", A4; DA "Problem Framing" |
| S5 | Ring push working with the fixed push library and persisted push credentials | **Proposed**; no approval or run recorded | AC "Spikes proposed before plan" |
| S6 | Time to first frame on the owner's cameras (A3: werift good enough for H.264 frames) | **Proposed**; no approval or run recorded; relevant to media (iteration 003) | AC "Spikes proposed before plan", A3 |
| S7 | The client capability matrix, per target client: protocol era, elicitation form and URL, MRTR, CIMD or DCR, Foundry auth options; additions: whether the dot can use the server and how (a reused connection or a plugin), whether the core can tell a dot from a chat, the Issuer with each client (CIMD first, DCR fallback, refresh rotation), whether the Issuer library's CIMD draft matches what ChatGPT and Claude send, whether ChatGPT accepts a predefined client, whether Foundry's Entra token is accepted, whether ChatGPT and Claude play an MP4 clip with sound, and whether agents' apps open the confirm-page link in the phone's browser | **Human-agreed** 2026-10-25; **not yet run**. Desk research plus a small test server; does not touch Ring | SEC "Evidence" (S7), "SC1 answers", "Lens 4 summary"; `workshop/ui-ux.md` (pilot) |
| Node 26 compatibility (unnumbered) | oidc-provider 9.13.3 (declares no engines) and ring-client-api 14.3.0 (declares Node 20, 22, 24) on Node 26; fall back to Node 24.11 or later if broken | **Tracked follow-up** from I2, widened at I6 finding 1 (2026-11-01); not yet run | CODE "Recorded for later decision points" (tracked follow-ups); IR `code-rule.lts-version-check` |

**Pilot checks** (not spikes; the owner runs them in the pilot):

- **Latency**: Ring-to-connector latency (A1), and how accurate `ring_ts` is.
- **Ring behaviour**:
  - watching for a 406 on the residential IP (A2);
  - whether motion detectors report while disarmed, and their re-trigger cooldown;
  - whether per-sensor battery fields appear;
  - whether ring-client-api exposes the monitoring state;
  - what Ring does when arming with open contacts.
- **Hosting and identity**:
  - App Service's health check and auto-heal on one instance;
  - the managed-identity federated credential on App Service.
- **Clock and tuning**:
  - clock sync between home and Azure;
  - tuning the 2-minute late limit and the Health thresholds.
- **Other**:
  - shared-location visibility;
  - a trademark check on the name before the first public release.

Sources: AC A1 to A5; NFR "Unknowns carried forward"; IA "Siren" pilot checks; DO "Carry-forwards" (pilot); CD "Lens 9 summary" (pilot); PD "Follow-up research".

### Workshop question 16: `code-rules.local.yml`

- **Status**: **still awaiting the owner.** "Move on" closed lens 10 without answering it. The file has not been written.
- **The question**: may the agent write `code-rules.local.yml` at the project root with three rules?
  - `code-rule.ts.strictness-posture`, overriding the shipped text;
  - `code-rule.ts.tooling-compiler-api`, new;
  - `code-rule.ts.erasable-syntax`, new.
- **Meanwhile**: the corrections live in the manifest's decisions:
  - rows 2 to 6 in `code-rule.ts.strictness-posture`;
  - row 7 in `code-rule.lts-version-check`;
  - row 8 in the CD4 custom rule.
- **Source**: CODE "Questions to the human" (16), "Lens closed"; DA "Human Decision" (Modifications).

## Plan-time resolutions (2026-11-02)

The records left these items open or carried them to plan. The planner resolved each one on 2026-11-02, and the owner reviews them at the plan boundary. Items marked **owner decision** are not resolved here. Each says when it is decided.

| ID | Open item | Resolution | Iteration | Source of the item |
| --- | --- | --- | --- | --- |
| PT-01 | SQLite `synchronous`: FULL or NORMAL | **FULL**, for the connector outbox and in mode A. Durability before the ack is what FR-042 and SC-002 rest on. About 1.5 ms per commit is negligible at a few thousand events a day | 001 | CODE "Recorded for later decision points" (I7) |
| PT-02 | The connector container's restart policy | **`unless-stopped`**. It restarts after a crash and after a host reboot, and stays down when the owner stops it | 001 | CODE (I3) |
| PT-03 | Key Vault role on a single secret, and placeholder secrets on first deploy | The role is "Key Vault Secrets User", scoped to each secret where Azure RBAC allows it, otherwise to the vault. The first deploy creates no secret values. `/readyz` reports not ready, naming the missing secret, until the owner sets it. Nothing is a placeholder that could be mistaken for a real value | 001 | CD "A1 decided", "Lens 9 summary" |
| PT-04 | How the Issuer picks up a rotated signing key | The Issuer loads its keys from Key Vault at startup and every 10 minutes, and publishes the current and previous keys in its JWKS. Rotation adds the new key first and retires the old one after 10 minutes plus the 1-hour access-token lifetime | 001 | CD "A1 decided" |
| PT-05 | The bootstrap script's detailed proposal | The agent's proposal is adopted as the plan default: the step table, its parameters and path, the default resource-group name and location, print-only unless `-Apply` is passed, and a committed example parameter file with git-ignored local values. Part of CP-19. **Owner review at the plan boundary**, because the proposal was never confirmed in the workshop | 001 | CD bootstrap proposal |
| PT-06 | How the Entra app registration and the SQL break-glass group are created | **A documented runbook step that the owner performs once** (quickstart.md). The resulting IDs go into GitHub environment variables and are never committed. The Bicep Microsoft Graph extension is assumed and unverified, so it is reconsidered later | 001 | DO "Evidence tags"; CD bootstrap proposal |
| PT-07 | The catch-up-done marker across link versions N and N-1, and through the outbox | The marker goes through the durable outbox (at least once) and is part of the link message set at every version. Iteration 001 ships link version 1, so the N-1 contract test is added with the first version bump | 002 | CD "Lens 9 summary" |
| PT-08 | Media chunk size on the link | Set in iteration 003's plan, with media | 003 | CD "CD2 decided" |
| PT-09 | One image build or two | **One build** (`bridge/Dockerfile`), pushed as the core and connector images. The run mode is selected by the Host entry (core, connector or all-in-one) | 001 | CODE (I5.2) |
| PT-10 | Two runtime packages that declare no licence (`@shinyoshiaki/jspack` through werift, `ffmpeg-for-homebridge`) | Both arrive with ring-client-api, so their repositories are checked in iteration 001 before ring-client-api is added (CP-07). If a permissive licence is found, it is recorded as a reviewed exception in the licence gate. If not: **owner decision**, either to accept the risk or to omit the package where it is optional | 001 | CODE "I6 in detail"; IR `project.supply-chain-policy` |
| PT-11 | Does oidc-provider's storage adapter fit one `(model, id)` table? | One table, as in the data-storage ERD, verified by the Issuer adapter tests (CP-16). If it does not fit, the fallback is one table per model kind. This is a data-model change recorded in the drift log | 001 | CD "Evidence tags" |
| PT-12 | Does dependency-cruiser follow dynamic `import()`? | Checked when first configured (CP-01). If it does not, an ESLint rule allows `import()` only in the Host wiring files, and those files are checked statically | 001 | IR `dependency_policy`; CODE (I6) |
| PT-13 | The "no GUID under `infra/` or `scripts/`" check | **Adopted.** A gitleaks custom rule fails on any GUID under `infra/` and `scripts/`, so subscription and tenant IDs cannot be committed. Part of CP-01 | 001 | CD bootstrap proposal; CODE "Carried in" |
| PT-14 | Log Analytics retention | **30 days.** Ingestion at this volume is expected to stay within the free allowance (agent estimate, not priced from a bill) | 001 | OR "Carry-forwards" |
| PT-15 | CI job names behind the required checks | The governance placeholders become the real names: `specrew-governance`, `lint`, `test`, `build`, `secret-scan`. The mode H end-to-end job is `e2e-hybrid` and runs on main | 001 | RG comment; CODE (I4.5) |
| PT-16 | How open-source users run mode A and the shim | Decided in iteration 004's plan, with the README (US7) | 004 | CODE (I5) |
| PT-17 | A container registry for other owners | **Owner decision in iteration 004's plan.** One option is ACR Basic at about $5 a month (agent-derived, Israel Central, read 2026-10-26); another is a public image | 004 | DO "Follow-up answers" |
| PT-18 | How agents are listed with the Issuer in iteration 001 | The allowlist lives in Settings, seeded from deployment configuration: client identifiers, redirect URIs and scopes, set as GitHub environment variables. Iteration 001 grants read only. The admin page's agents view arrives in iteration 004 | 001 | CD "Lens 9 summary"; DA "Option B" |
| PT-19 | Is WORM shipping built in iteration 001? | **No.** Iteration 001 builds the audit hash chain in Azure SQL. Shipping to write-once Blob storage and its lag alert arrive in iteration 004, with FR-035 and FR-043 | 004 | DA "Option B" |
| PT-20 | How a developer runs mode A against the scenario engine outside the tests | A dev-only entry point started by an npm script runs the all-in-one Host with the scenario engine in place of Ring Adapter. It lives under `bridge/test/` and is excluded from the production image | 001 | CD (CD3); CODE (I4.5) |
| PT-21 | Earlier-era push other than through the shim | Delivery sends earlier-era notifications on the listen stream to every earlier-era client that opens one, and the channel shim is the known consumer. Clients that do not listen (claude.ai, Desktop, mobile) read with `get_events` from their cursor. That meets FR-012 as far as each client allows | 002 | spec FR-012; AC "Research verdicts" |
| PT-22 | The token-count method for SC-006 | No tokenizer dependency. The test estimates tokens as characters ÷ 3, rounded up, which is conservative for JSON mixing Hebrew and English, and asserts at most 8,000 | 001 | NFR "Acceptance evidence" |
| PT-23 | Is an audit entry written for every ingested event? | **Yes, as the co-design flow says.** The owner reconfirmed it with the design-analysis verdict: Event Log, State and Audit commit in one transaction. The entry carries identifiers only and follows event retention (30 days). FR-035's list is the minimum set. Expected volume is about 1,000 to 3,000 entries a day, plus about 500 others, which fits Azure SQL Basic's 2 GB (agent estimate) | 002 | data-model.md conflict 2 (CD key flow 1, DS4 versus SC5) |
| PT-24 | Location on the event | `location_id` is part of the event (per-location order, FR-008) | 001 (events carry it from 002) | data-model.md conflict 3 (IA D7 versus DS ERD) |
| PT-25 | Who applies the 2-minute late rule | The core's Classify engine, measured from the time home received the event. Home Ingest only stamps `received_at`. The decided text wins over the A4 diagram | 002 | data-model.md conflict 4 (CD-A4, OR amendments) |
| PT-26 | Device `type` or `kind` | The public contract says `type`, both as the field and as the `list_devices` filter (FR-002, IA D7). Storage may keep `kind`, and the access DTO maps it (CD4) | 001 | data-model.md conflict 5 |
| PT-27 | The mode A audit store | The same schema in SQLite, with no write-once copy. SC5's append-only file is superseded | 001 (dev), 004 (user-facing) | data-model.md conflict 8 (SC5 versus DS3) |
| PT-28 | A cursor from an older epoch | `get_events` returns events from the start of the current epoch, with `epoch_changed: true`. The agent dedupes by event id, and nothing is skipped (FR-011) | 002 | data-model.md G3 (DS5) |
| PT-29 | Health and recovery event kinds | Named in `contracts/events.schema.json`: home link lost and restored, Ring unavailable and restored, Ring session lost. Security-event and battery-digest kinds are named in the iteration 003 and 004 plans | 001 (the home-link and Ring-session states in `get_health` and the admin page); 002 (the kinds as events, and the Ring-down and recovery kinds) | data-model.md G7 (FR-015) |
| PT-30 | How device inventory and state reach the core | Two link messages, both through the durable outbox: an inventory snapshot (on connect, after catch-up from iteration 002, and on request) and a device-state change. The core applies them latest-wins by device and version | 001 | data-model.md G15 |
| PT-31 | The meaning of `subscription.kind` | Defined in data-model.md from the DS ERD context | 002 | data-model.md G6 |
| PT-32 | How long a pending enrollment request lives, and where it is held | 10 minutes, as a `pending` row with its expiry in Settings' `connector` table. One pending request per Ring account; a new one replaces it | 001 | data-model.md G13 (SC2) |
| PT-33 | Purging audit entries with different retention from one hash chain | **One hash chain per retention class** (`events-30d`, `audit-90d`, `audit-1y`), each with its own anchor. A purge only removes the oldest entries of one chain. This is built from iteration 001, where the `audit-90d` and `audit-1y` chains start. The `events-30d` chain starts in iteration 002, so its first 30-day purge falls 30 days after that goes live | 001 (`events-30d`: 002) | data-model.md N1 (DS5, PT-23) |
| PT-34 | Do `event_ingested` entries ship to the write-once copy? | No. The write-once copy keeps FR-035's kinds in its two containers | 004 | data-model.md N2 (SC5) |

Gaps G1, G2, G5, G8, G10 to G12 and G14 in data-model.md belong to iterations 003 and 004 and are carried to those plans.

## Conflicts resolved at plan (2026-11-02)

1. **The error code for in-flight commands on a home-link drop** → **`HOME_OFFLINE`**, with outcome unknown and never retried. The spec decides WHAT: its edge case says control and media "report that the home is offline". The later observability amendment also reserves `BRIDGE_UNAVAILABLE` for a core dependency being down. The component-design text naming `BRIDGE_UNAVAILABLE` for this case is superseded. This matters from iteration 003, where commands arrive. It is recorded in the drift log.
2. **Which US1 and US2 parts iterations 001 and 002 deliver** → **the Option B slice exactly as approved, split in two at plan:**
   - US1, iteration 001: overview, device list, one device, health, and freshness and stale (FR-001, FR-002, FR-005, FR-006).
   - US2, iteration 002: HIGH and MEDIUM push, reading from a cursor, late events and the recovery summary, and the Ring-down health event (FR-008 to FR-011 without per-client opt-ins, FR-012, FR-013 to FR-015).

   FR-003 (motion queries), FR-004 (Ring history), FR-007 (battery alerts and the digest) and FR-010's per-client opt-ins move to iteration 003. The plan and the hardening gate were corrected to match. Affected: US1 AS4 and AS5, and US2 AS4, which are verified in iteration 003.
3. **What S1 decides** → the three options in the product-domain record stand: unofficial, official, or both. The spec's TG-004 wording was aligned to "replaces or complements".
4. **The out-of-band "Ring session lost" alert** → iteration 004, as the design analysis sliced it. In iteration 001 a lost Ring session shows on the admin page; from iteration 002 it also raises a HIGH health event. The hardening-gate row was corrected.
