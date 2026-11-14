# Implementation Plan: Ring MCP Bridge

**Branch**: `001-ring-mcp-bridge` | **Date**: 2026-11-02 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/001-ring-mcp-bridge/spec.md` (approved at specify, clarified 2026-11-01)
**Design decision**: Option B, a hybrid walking skeleton, chosen by the owner on 2026-11-02 ([design-analysis.md](iterations/001/design-analysis.md), [gate packet](gates/design-analysis-001.md)). At the plan stage the owner split its first slice into iterations 001 and 002 (capacity option 2, 2026-11-02; DRIFT-001-03 in [drift-log.md](iterations/001/drift-log.md))

## Summary

The bridge lets any MCP-capable agent know what is happening at a Ring home in real time and act within safe limits. Supported agents include ChatGPT with the dot, Claude on the web, desktop and phone, and Claude Code. The architecture was decided in the design workshop and is not reopened here:

- IDesign decomposition with component map v3;
- topology H (an Azure core plus a home connector that alone talks to Ring, dialing out over WSS) and mode A (all-in-one at home);
- TypeScript on Node;
- Azure hosting with Bicep and GitHub Actions;
- the bridge as its own OAuth issuer, with Entra ID for the owner's sign-in.

The plan slices v1 into four iterations. Iterations 001 and 002 together build a thin but complete slice of US1 (state) and US2 (events) on the real hybrid path, so every risky unknown is tested while the code is small. The owner split that slice in two at the plan stage:

- iteration 001 tests the non-US Ring session (SC-003), Entra sign-in per client (FR-029) and the home connector's enrollment, with real agents reading the home;
- iteration 002 tests ChatGPT's MCP events and the dot, and the 10-second end-to-end budget (SC-001).

## Iteration Map

| Iteration | Stories | Requirements | What the owner gets | Cloud cost |
| --- | --- | --- | --- | --- |
| 001 | The Option B slice, part 1: US1 reads after sign-in, read scope only | US1: FR-001, FR-002, FR-005 and FR-006 (overview, devices, one device, health, freshness). Also FR-026 (reads), FR-029, FR-030 (read), FR-032 to FR-034, FR-042 (link reconnect, Ring backoff and the Outbox resend), FR-044 and FR-046 to FR-048. FR-040 in part (the minimal admin page) | ChatGPT, Claude and Claude Code sign in through Entra and read the home: overview, devices, one device, health and stale state. A minimal admin page shows health and the enrollment code. The 7-day Ring-session soak starts | About $21.50 a month from the first deploy (agent-derived, see Cost) |
| 002 | The Option B slice, part 2: US2 events | US2: FR-008 to FR-015 (push, cursor, late events, recovery summary, Ring-down health), with FR-010 lacking per-client opt-ins. FR-042 (the 24-hour catch-up). FR-043 in part (heartbeat and home-offline alerts) | Pushed events reach ChatGPT (with the dot), Claude and Claude Code, and `get_events` reads them from a cursor that survives restarts. Out-of-band alerts fire for heartbeat loss and the home going offline. Spike S1 runs | About $23 a month (the alert rule adds $1.50) |
| 003 | US3 media, US4 control, and the rest of US1 and US2 | FR-016 to FR-026, FR-035 (control audit), FR-003 (motion), FR-004 (Ring history), FR-007 (battery alerts and digest), FR-010 (per-client opt-ins) | Frames, bursts and clips with the battery guard. Arm and lights through prepare and confirm. Motion and occupancy queries, Ring history, battery alerts and the digest, per-agent push opt-ins | Unchanged, plus small Blob usage |
| 004 | US6 full admin, US5 disarm (shipped off), US7 README for both modes, US8 shared locations | FR-027, FR-028, FR-031, FR-035 to FR-041, FR-043 (rest), FR-045 | The full admin page, revoke, delete now and the audit view. Disarm built and switched off. The public README for all-in-one and hybrid. Shared locations behind configuration | Unchanged |

Mode A is not a later add-on. Host wires mode A or H from the same components, so development and CI run on mode A from iteration 001. Mode A's user-facing guarantees (FR-045: localhost admin link, control off by default, disarm never offered) are verified with US7 in iteration 004.

## Technical Context

Details, versions and sources for each line are in [research.md](research.md) (R1 to R29).

**Language/Version**: TypeScript 6.0.3 (pinned, erasable syntax only, ES modules with `nodenext`) on Node 26 LTS; the fallback is Node 24.11 or later (`devEngines ^24.11 || ^26`). Node 26 compatibility for oidc-provider and ring-client-api is a tracked follow-up.
**Primary Dependencies**:

- MCP: `@modelcontextprotocol/server` 2.4.0 and `/client` 2.4.0, `@modelcontextprotocol/hono` 2.0.2.
- HTTP: hono 4.13.14 and `@hono/node-server` 2.1.5.
- Identity and validation: oidc-provider 9.13.3, zod 4.6.7.
- Ring: ring-client-api 14.3.0, used only inside Ring Adapter.
- The link: ws 8.22.0.
- Azure: mssql 12.7.13, `@azure/identity` 4.14.1, `@azure/keyvault-secrets` 4.12.0, `@azure/storage-blob` 12.34.0.
- Node built-ins: `node:sqlite` and `crypto.argon2`.

**Storage**: Azure SQL Database Basic for the core (hybrid). SQLite for the connector's outbox and for mode A. Blob for media (iteration 003) and the write-once audit copy (iteration 004). Key Vault for core secrets. An encrypted secrets file at home. The Query layer speaks both SQLite and T-SQL.
**Testing**:

- Vitest 5 with coverage-v8.
- Playwright 1.64.1 at three widths in both themes.
- StrykerJS 10.1.1, weekly.
- dependency-cruiser 18.7.0.
- Stand-ins: the MCP SDK client end to end, the scenario engine for Ring, a second oidc-provider standing in for Entra, a SQL Server container, and Azurite.

**Target Platform**: Azure App Service B1 (Linux container, Israel Central) for the core. Docker on an Ubuntu 24.04 VM at home for the connector (amd64 and arm64 images). The channel shim runs on the owner's PC.
**Project Type**: an MCP web service (with the Issuer and the admin and confirm pages), a home daemon and a stdio relay, in one npm workspace. Derived from the decided layout (code-implementation I5); no record names a type.
**Performance Goals**:

- At most 0.5 s p95 inside the bridge, checked in CI.
- HIGH events within 10 s end to end, with a goal of 5 s p95. MEDIUM events within 30 s.
- Reconnect within 60 s. Stale shown within 2 minutes.
- Overview replies of about 8,000 tokens at most. A 60 s tool deadline.

**Constraints**:

- Ring is reached only from home, with no inbound ports.
- One connector per Ring account, and one active core instance under a lease; it fails closed.
- Durable before delivery: events at least once, commands at most once.
- Flat, additive-only schemas.
- Identifiers, never content, in logs.
- At most $30 a month.

**Scale/Scope**: one Ring account (the owner's), about 100 devices, a few thousand events a day. Azure SQL Basic (2 GB, 5 DTU). 13 tools across v1.

## Design Constraints Carried Into Tasks

- **The Ring boundary stays swappable** (accepted unknown S1). No `ring-client-api` type, error or event crosses the Ring Access (core) or Ring Adapter (home) interface. Both expose only the bridge's own DTOs (CD4). A contract test asserts this, and the CI dependency check forbids importing the library outside Ring Adapter. This keeps options 2 and 3 of S1 (the official Partner API, or both APIs) a change to two components.
- **Ring is reached only from home** (topology H, accepted unknown S2). No core component calls Ring. The dependency check enforces it.
- **The public contract is additive** (FR-046). The schema snapshot test fails on any removal or narrowing.
- **Flat input schemas** (FR-048). A schema check rejects `oneOf`, `anyOf` and nullable unions in tool inputs.
- **Identifiers, never content, in logs** (FR-034). A redaction test feeds tokens, a PIN-shaped value and image bytes through every log path.

## Accepted Unknowns and Research Schedule

On 2026-11-02 the owner accepted two load-bearing gaps as unknown and postponed the research to development time. The condition: the known options stay open, and the research is what chooses between them. The options are listed in the product-domain record ([product-domain.md](workshop/product-domain.md), "Accepted unknowns"). Each spike below has the decision it drives and a deadline, so no option closes by default.

| Spike | Question | Known options | Decision it drives | Scheduled | Must finish before |
| --- | --- | --- | --- | --- | --- |
| S1 | Can a non-US Ring account register and link an official private app? | 1. Unofficial API from home (v1 default); 2. the official Partner API; 3. both | Whether iteration 003 widens Ring Adapter on the unofficial path or on the official one | Iteration 002 (task CP-20) | The plan boundary of the iteration that widens Ring Adapter for media and control (iteration 003 in this map) |
| S2 | Do unofficial Ring login and push work from a datacenter (Azure) IP? | 1. Ring calls from the home connector (v1 default); 2. cloud-direct; 3. cloud through a residential proxy | Whether the README offers a cloud-only mode to other owners later. v1 does not depend on it | Iteration 003. The owner approves the test method when the task runs, because the test can get the account flagged | The README for other owners (US7, iteration 004 in this map) |

Other spikes from the records (research.md, "Accepted unknowns and pending research"):

- S3 was dropped.
- S4, S5 and S6 are proposed in the records, with no approval or run recorded. The S4 question (ChatGPT's MCP events and the dot) is exercised directly by CP-21b in iteration 002, so it needs no separate spike.
- S7 (whether clients can play clips) was agreed on 2026-10-25 and has not run. It belongs to iteration 003, with media.
- Workshop question 16 (`code-rules.local.yml`) is still waiting for the owner. Without an answer, implement uses the shipped catalog plus `implementation-rules.yml`.

## Phase 1 Quality Planning

**Phase Scope**: `phase-1-first-slice`
**Inferred Quality Profile**: `quality-profile.custom-composition.v1`, as returned by `resolve-quality-profile.ps1` on 2026-11-02
**Selected preset ref or explicit custom composition**: None. The resolver used a bounded custom composition with the stack `mixed-or-unknown`, because no code exists yet.
**Bounded custom composition**: This plan keeps the resolver's composition and corrects it in two ways:

- The stack is recorded as TypeScript on Node (`implementation-rules.yml`: `typescript-javascript`).
- Three dimensions the resolver marked `not-applicable` are overridden to `required`. See DRIFT-001-01 in [drift-log.md](iterations/001/drift-log.md); the owner accepted the override on 2026-11-02 with the design-analysis verdict.

### Stack Surfaces in Scope

| Stack Surface | Path Globs / Evidence | Recognized Stack | Why It Matters |
| --- | --- | --- | --- |
| `custom-phase1-surface` (resolver output) | `**/*`; feature specification only | `custom` | The resolver's fallback. It is replaced by the rows below once code exists |
| `core-service` | `bridge/src/core/**`, `bridge/src/host/**`, `bridge/src/utilities/**`, `bridge/src/contract/**` | `custom` (TypeScript, Node, App Service) | MCP Endpoint, Issuer, Web, Connector Link and the core managers, engines and resource access |
| `home-connector` | `bridge/src/connector/**` | `custom` (TypeScript, Node, Docker at home) | Ring Adapter, Push Listener, Ingest, Outbox, Core Link, Setup CLI |
| `channel-shim` | `shim/**` | `custom` (TypeScript, Node, stdio on the owner's PC) | The earlier-era push path to Claude Code (FR-012) |
| `infrastructure` | `infra/**`, `scripts/**`, `.github/**` | `custom` (Bicep, GitHub Actions) | The hybrid deployment and its cost |

### Risk Dimensions

| Risk Dimension | Status (`required` / `not-applicable`) | Rationale |
| --- | --- | --- |
| `code-quality` | required | Resolver: Phase 1 always evaluates code quality |
| `design-quality-and-separation-of-concerns` | required | Resolver default. The IDesign call rules and CD4's per-component DTO rule are enforced by the CI dependency check |
| `verification-confidence` | required | Resolver default. Each FR gets a positive and a negative test, and failure-mode FRs may not be covered by smoke tests only |
| `maintainability` | required | Resolver default |
| `security` | required | Resolver default. OAuth issuer, enrollment, secrets only at home, untrusted Ring text (FR-029 to FR-034) |
| `robustness` | required | Resolver default. Stale versus unavailable semantics (FR-006), the Ring circuit (Edge Cases) |
| `concurrency-correctness` | **required** (override of the resolver's `not-applicable`) | Realtime push to many clients, one transaction across Event Log, State and Audit, the single-instance lease (FR-044), per-location ordering (Edge Cases), and synchronous SQLite calls on the event loop (code-implementation I7) |
| `resiliency` | **required** (override) | Reconnect within 60 s with jittered backoff, resend after 10 s, 24-hour catch-up (FR-042). Ring-down health events (FR-015) |
| `retry-idempotency-and-recovery` | **required** (override) | At-least-once push deduplicated by event id (FR-010). Cursors that never skip and survive restarts (FR-011). Late events and the recovery summary (FR-013). Commands run at most once and are never retried (FR-024, designed now, built in 003) |

### Quality Tool Bundle

| Area | Selection | Evidence / Notes |
| --- | --- | --- |
| Bundle ID | `phase1-custom-quality-bundle` (resolver) | Extended with the stack tools below |
| Mechanical Checks | dead-field, anti-pattern, test-integrity | `iterations/001/quality/mechanical-findings.json` |
| Ecosystem Tools | ESLint 10.14.0 with typescript-eslint 8.72.1 (`strictTypeChecked` and `stylisticTypeChecked`), Prettier 3.9.10, `tsc --noEmit`, Vitest 5 (90% lines, 85% branches), Playwright, dependency-cruiser (call rules and the Ring boundary), the schema snapshot from `z.toJSONSchema`, gitleaks 8.30.1 (pre-commit and CI, plus the no-GUID rule), `npm audit --json` (fails on high or critical), and `npm sbom` against the licence allow-list | `iterations/001/quality/quality-evidence.md` |

### Required Quality Gates

| Required Quality Gate | Category | Evidence Source | Phase 1 Status |
| --- | --- | --- | --- |
| `dead-field` | mechanical | `iterations/001/quality/mechanical-findings.json` | planned |
| `anti-pattern` | mechanical | `iterations/001/quality/mechanical-findings.json` | planned |
| `test-integrity` | mechanical | `iterations/001/quality/mechanical-findings.json` | planned |
| `stack-tooling-evidence` | tooling | `iterations/001/quality/quality-evidence.md` | planned |
| `quality-lens-review` | manual-evidence | `iterations/001/quality/quality-evidence.md` | planned |
| `concurrency-correctness-review` | manual-evidence | `iterations/001/quality/quality-evidence.md` | planned (restored by the override) |
| `resiliency-semantics-review` | manual-evidence | `iterations/001/quality/quality-evidence.md` | planned (restored by the override) |
| `retry-idempotency-review` | manual-evidence | `iterations/001/quality/quality-evidence.md` | planned (restored by the override) |
| `bridge-latency-budget` | tooling | the CI latency test (0.5 s p95 inside the bridge: tool reads from iteration 001, events from iteration 002 for SC-001) | planned |
| `contract-snapshot` | tooling | the CI schema snapshot test (FR-046, FR-047) | planned |
| `dependency-boundaries` | tooling | the CI dependency check (call rules, Ring boundary) | planned |

### Not-Applicable Dimensions and Rationale

| Dimension / Gate | Why Not Applicable in This Feature | Follow-up |
| --- | --- | --- |
| none | The resolver's three `not-applicable` rows are overridden to `required` above (DRIFT-001-01) | none |

### Explicit Phase 2+ Deferrals

- Dedicated bug-hunter lens execution and strongest-class routing enforcement remain deferred, as the resolver states.
- Quality-drift logic, mixed-stack override workflows and reference-implementation comparison remain deferred.

## Phase 2 Hardening and Specialist Review Planning

**Phase 2 Slice Scope**: the iteration 001 hardening gate (US1 reads on the hybrid path, read scope only). The event path (US2) is hardened in iteration 002's own gate
**Hardening Gate Artifact**: [iterations/001/quality/hardening-gate.md](iterations/001/quality/hardening-gate.md)
**Known-Traps Corpus Location**: `.specrew/quality/known-traps.md`
**Trap Reapplication Artifact**: none yet

**The hardening gate must be signed off before implementation starts.** It records planning-time analysis and expected controls only. Runtime proof stays pending until implementation and review. Any unresolved critical security, resilience or operational concern needs the owner's explicit approved deferral before the before-implement boundary.

### Hardening Focus Areas

| Focus Area | Why It Matters in This Slice | Planned Artifact / Evidence | Status (`required` / `deferred` / `not-applicable`) |
| --- | --- | --- | --- |
| Security surface analysis | Four trust boundaries arrive in iteration 001 (Ring session, link, OAuth, admin page). Ring text reaches models | hardening-gate.md `security-surface` | required |
| Error handling and failure semantics | Stale versus unavailable, the Ring circuit, fail-closed without the lease | hardening-gate.md `error-handling-expectations` | required |
| Retry and idempotency expectations | **Overridden from the resolver's `not-applicable`.** In iteration 001: link reconnect with backoff, the Ring circuit, the Outbox resend of state messages, versioned state updates applied latest-wins, and the single-instance lease. Dedup by event id, cursor epochs, catch-up and the recovery summary are the core of US2 and go to iteration 002's gate | hardening-gate.md `retry-idempotency-requirements` | required |
| Test-integrity targets | Each FR maps to named tests. The stale-after-link-loss test proves SC-005's stale part, and the 100-device overview test proves SC-006 | hardening-gate.md `test-integrity-targets`, `quality-evidence.md` | required |
| Operational resilience | **Added.** Iteration 001 ships an Azure server and a home service. Its out-of-band alerts follow in iteration 002 | hardening-gate.md `operational-resilience-concerns` | required |

### Lens Activation Plan

| Lens / Checklist Ref | Activation (`required` / `optional` / `not-applicable`) | Why Activated or Omitted | Planned Evidence / Artifact Path |
| --- | --- | --- | --- |
| `security-baseline@v1.0.0` | required | Resolver baseline, and four trust boundaries in this slice | `iterations/001/quality/lenses/security-baseline.md` |
| `robustness-baseline@v1.0.0` | required | Resolver baseline, plus the overridden resiliency and retry dimensions | `iterations/001/quality/lenses/robustness-baseline.md` |
| `test-integrity@v1.0.0` | required | Resolver baseline | `iterations/001/quality/lenses/test-integrity.md` |

### Routing Policy

| Lens Scope | Requested Reasoning / Review Class | Effective Class (when run) | Override / Approval Record | Notes |
| --- | --- | --- | --- | --- |
| Required hardening and bug-hunter lenses | strongest-available | Recorded when the review runs | Any lower-tier override needs the owner's explicit approval | The reviewer host is codex (`implementation-rules.yml`, `.specrew/reviewer-hosts.json`) |

### Explicit Later Deferrals

- Full line-by-line lens execution evidence and runtime-only final proof stay deferred until the implementation and review of iteration 001.
- Known-traps corpus seeding and trap reapplication are deferred. The corpus does not exist yet.
- Requested-versus-effective routing evidence is deferred until the routed lens execution runs.

## Constitution Check

The project constitution (`.specify/memory/constitution.md`) is still the unfilled template, so it has no ratified principles to check. This plan is checked against the Specrew gates instead. Ratifying a constitution is the owner's call, and is raised at the plan boundary.

| Gate | Result | Evidence |
| --- | --- | --- |
| Spec Authority | pass | Scope maps to the approved and clarified spec. The iteration map traces every story to its FRs. The S1 and S2 evidence tags in the spec's Assumptions were updated to the owner's 2026-11-02 acceptance. The owner's split moves part of the design analysis's first slice into iteration 002 (DRIFT-001-03). No requirement changed |
| Layering | pass | Product code and the deployment are the product layer. `plan.md`, `research.md`, `data-model.md`, `contracts/` and `quickstart.md` are Spec Kit layer. The iteration capacity setting is team configuration, and changing it is the owner's decision (see Capacity) |
| Traceability | pass (planned) | Every iteration 001 work item below cites its FRs. `tasks.md` maps each task to FRs and SCs, checked by the traceability check at the tasks boundary |
| Ownership | pass | Roles from `.specrew/role-assignments.yml`: Planner (plan, capacity), Implementer (tasks), Reviewer (codex review, hardening review), Spec Steward (drift and spec integrity). The owner runs the pilot and every real-world control action |
| Capacity | pass | Iteration 001 plans 42 story points against a capacity of 42. The owner chose option 2 (split) on 2026-11-02, and the capacity was raised from 20 to 42 in `.specrew/iteration-config.yml` to fit its first part. Iteration 002's forecast is 16. See Capacity |
| Drift and Reconciliation | pass | `iterations/001/drift-log.md`, plus the drift check before review. DRIFT-001-01 and DRIFT-001-03 are recorded and applied in this plan |
| Verification | pass (planned) | Scenario-engine tests per FR, the CI latency, contract and boundary gates, and a pilot journal for SC-001 end to end, SC-003 and SC-011 |

## Capacity: Iterations 001 and 002 Effort Model

**Unit**: story points (uncalibrated: no historical velocity yet, so the retro calibrates them). **Configured capacity**: 42 per iteration, overcommit threshold 1.0 (`.specrew/iteration-config.yml`, raised from the default 20 by the owner's choice of option 2 on 2026-11-02). **Bounding**: scope: the iteration ends when its planned work is done, and time varies.

The owner split the Option B slice into two iterations, both on the hybrid path. Iteration 001 is planned here and goes on to tasks. Iteration 002 is a forecast: it gets its own design analysis and plan stage after iteration 001 closes, and those re-check it.

### Iteration 001 (planned): agents read the home after signing in

| ID | Work item | Requirements | Phase | SP | Owner role |
| --- | --- | --- | --- | --- | --- |
| CP-01 | Repository scaffold, toolchain, CI pipeline (lint, type check, tests, dependency check, schema snapshot) | FR-046, FR-047, implementation rules | enabling | 3 | Implementer |
| CP-02 | Utilities: Security, Logging (identifiers only), Pub/Sub, Config, Clock | FR-034 | enabling | 2 | Implementer |
| CP-03 | Query layer for SQLite and T-SQL, migrations, per-component DTOs | FR-008, FR-011, CD4 | enabling | 3 | Implementer |
| CP-04 | Test harness: scenario engine (a simulated home of about 100 devices, synthetic events, fault injection) and the stand-in identity provider | SC-001, SC-002, SC-006, FR-029 | enabling | 3 | Implementer |
| CP-05 | Public Contract: the four iteration 001 read tools, untrusted-content marking | FR-033, FR-047, FR-048 | implementation | 1 | Implementer |
| CP-06 | Setup CLI and Secrets File: the owner's Ring login and 2FA, connector key pair, enrollment code | FR-032 | implementation | 2 | Implementer |
| CP-07 | Ring Adapter behind the Ring boundary: shared limiter, circuit, backoff | FR-026, FR-042, Edge Cases | implementation | 2 | Implementer |
| CP-08a | Outbox Store: durable queue, ack, resend after 10 s, and the `state_version` counter. It carries `inventory` and `device_state` to the core | FR-042 | implementation | 1 | Implementer |
| CP-09 | The link: Link transport, Core Link, Connector Link, versioned hello, enrollment check, heartbeat, reconnect with backoff | FR-032, FR-042, FR-046 | implementation | 3 | Implementer |
| CP-10 | Host: mode A and H wiring, single-instance Lease, `/livez`, `/readyz` | FR-044, FR-045 | implementation | 2 | Implementer |
| CP-11a | Event manager, link intake: `inventory`, `device_state` and heartbeats into State (latest-wins by `state_version`) and the Health engine; the home shows offline after 2 minutes without a heartbeat | FR-005, FR-006 | implementation | 1 | Implementer |
| CP-14 | Inquiry path: Inquiry manager, Summary and Health engines, State. Covers overview, device list, one device, health, freshness and stale | FR-001, FR-002, FR-005, FR-006 | implementation | 3 | Implementer |
| CP-15 | MCP Endpoint for both protocol eras, read scope, read rate limit | FR-012, FR-026, FR-030 | implementation | 2 | Implementer |
| CP-16 | Issuer with Entra sign-in, Grants, client allowlist, token lifetimes | FR-029, FR-030 | implementation | 3 | Implementer |
| CP-17 | Minimal admin page: health and enrollment-code compare, three widths, word plus icon | FR-005, FR-032, FR-040 (part) | implementation | 1 | Implementer |
| CP-19 | Bicep (App Service, Azure SQL, Key Vault, Blob) and the GitHub Actions deploy | FR-045 (hybrid), SC-011 | implementation | 3 | Implementer |
| CP-21a | First agent trial: ChatGPT and Claude sign in through Entra and read the home; the 7-day Ring-session soak starts | SC-003, FR-029 | discovery | 1 | Owner, with the Implementer |
| | **Build, enabling and discovery subtotal** | | | **36** | |
| | Review (codex review runs, hardening review) | | review | 3 | Reviewer |
| | Expected rework (about 10%) | | rework | 3 | Implementer |
| | **Total planned for iteration 001** | | | **42** | |

CP-03 and CP-04 cite event requirements because the shared foundation is built once, in iteration 001, and the event path in iteration 002 reuses it.

### Iteration 002 (forecast): pushed events, the dot, alerts

| ID | Work item | Requirements | Phase | SP | Owner role |
| --- | --- | --- | --- | --- | --- |
| CP-08b | Push Listener, Normalize, Ingest: events into the Outbox, catch-up up to 24 h, late marker | FR-008, FR-013, FR-042 | implementation | 2 | Implementer |
| CP-11b | Event path: Classify (priorities as policy data), Event Log, State and Audit in one transaction, recovery summary, Ring-down health event | FR-008, FR-009, FR-013, FR-014, FR-015 | implementation | 3 | Implementer |
| CP-12 | Subscriptions: cursors with epochs, and each client's delivery state (opt-ins come in iteration 003) | FR-010, FR-011 | implementation | 1 | Implementer |
| CP-13 | Delivery: current-era MCP events (ChatGPT), earlier-era clients, listen stream and the channel shim | FR-010, FR-012 | implementation | 3 | Implementer |
| CP-18 | Out-of-band alerts for heartbeat loss and the home offline, with their alert rule | FR-043 (part), SC-010 | implementation | 1 | Implementer |
| CP-20 | Spike S1: an official Ring private app for a non-US account | TG-004, accepted unknown S1 | discovery | 1 | Implementer, with the owner's account |
| CP-21b | The dot and the first end-to-end event latency samples | SC-001 | discovery | 1 | Owner, with the Implementer |
| | **Build, enabling and discovery subtotal** | | | **12** | |
| | Review (codex review runs, hardening review) | | review | 2 | Reviewer |
| | Expected rework (about 10%) | | rework | 2 | Implementer |
| | **Total forecast for iteration 002** | | | **16** | |

**Capacity status: `ok`.** Iteration 001 is 42 SP against a capacity of 42 (ratio 1.0, at the threshold). Iteration 002's forecast of 16 SP also fits.

### The Owner's Choice (2026-11-02)

The first slice was 58 SP against the default capacity of 20. The owner chose from three options:

1. Keep it as one iteration and set the capacity to 58.
2. **Split it into two iterations on the hybrid path (chosen).**
3. Defer about 3 SP to the next iteration, which still did not reach 20.

The split as offered was about 38 SP and about 20 SP. Planning it in detail moved four items into iteration 001, each because iteration 001 cannot work without it, so it is now 42 and 16:

- **CP-17, the minimal admin page, moved into iteration 001.** The connector cannot enroll without it, because the owner checks the enrollment code on the admin page (FR-032, and SC2 in the security workshop, confirmed by the owner). Leaving it in iteration 002 would have needed an enrollment path that no record has.
- **CP-08 is split into CP-08a and CP-08b.** The home sends `inventory` and `device_state` to the core through the Outbox, at least once (contracts/connector-link.md). So the Outbox Store itself (CP-08a, 1 SP) is needed in iteration 001, and the event intake (CP-08b, 2 SP) stays in iteration 002.
- **CP-11 is split into CP-11a and CP-11b.** In the core, the Connector Link hands everything from home to the Event manager, heartbeats included (component design). So the Event manager's intake of `inventory`, `device_state` and heartbeats (CP-11a, 1 SP) is needed in iteration 001, and the event path itself (CP-11b, 3 SP) stays in iteration 002. Until then every device change reaches the core as `device_state`.
- **CP-21 is split into CP-21a and CP-21b.** Iteration 001 exists to test sign-in, the link and the Ring session first, so real clients sign in and read the home in iteration 001 (CP-21a). The dot and the end-to-end event latency stay with push in iteration 002 (CP-21b).

The capacity is set to 42, the size of iteration 001, so the check passes with no tolerance. Iterations 003 and 004 are planned against it at their own plan stages, and the retro of iteration 001 recalibrates it from real effort.

### Phase Baseline (for the retro)

| Phase | Iteration 001 SP | Iteration 002 SP (forecast) |
| --- | --- | --- |
| Planning | 2 (spent at this stage) | at its own plan stage |
| Discovery and spikes | 1 | 2 |
| Implementation, including enabling work | 35 | 10 |
| Review | 3 | 2 |
| Expected rework | 3 | 2 |

## Cost

All figures are agent-derived from list prices for Israel Central, read on 2026-10-26 (devops-operations), and are not taken from a bill. SC-011 sets a ceiling of $30 a month, checked on the bill in the pilot.

| Item | Monthly | Prices read | Starts |
| --- | --- | --- | --- |
| App Service B1 (Linux) | $14.45 | 2026-10-26 | Iteration 001, first deploy |
| Azure SQL Database Basic | $6.46 | 2026-10-25 | Iteration 001 |
| Log alert rule (out-of-band alerts) | $1.50 | 2026-10-26 | Iteration 002 |
| Blob storage, including the write-once copy | under $1 | 2026-10-25 | Iteration 001 (media from 003, write-once from 004) |
| Key Vault operations, and the alert SMS | cents | 2026-10-26 | Key Vault from iteration 001, SMS from iteration 002 |
| **Total** | **about $21.50 in iteration 001, about $23 from iteration 002** | | Under the $30 ceiling (SC-011) |

Not priced: the reused container registry, a private `ghcr.io` package, and Log Analytics ingestion, which is expected to stay within the free allowance at this volume (agent estimate). For other owners, a registry (for example ACR Basic, about $5 a month, agent-derived, read 2026-10-26) is decided in iteration 004 (research PT-17).

Other cost by iteration: codex review runs come out of the owner's own plan. GitHub Actions minutes are assumed free while the repository is public; that is not verified, and a private repository uses the plan's minutes.

## Project Structure

### Documentation (this feature)

```text
specs/001-ring-mcp-bridge/
├── spec.md                  # approved, clarified
├── plan.md                  # this file
├── research.md              # Phase 0: decisions, rationale, alternatives, accepted unknowns
├── data-model.md            # Phase 1: entities, owners, stores, transitions, retention
├── quickstart.md            # Phase 1: validate iteration 001
├── contracts/               # Phase 1: MCP tools, event schema, errors, link protocol, web endpoints
├── gates/                   # design-analysis gate packet
├── iterations/001/          # design analysis, drift log, state, quality gate
├── workshop/                # the design-workshop lens records (the HOW)
└── tasks.md                 # Phase 2 output (/speckit.tasks, not created here)
```

### Source Code (repository root)

Decided in code-implementation I5.2, option (b):

```text
package.json  package-lock.json  tsconfig.base.json  eslint.config.js  vitest.config.ts  playwright.config.ts
bridge/                      # one package, one image build (research PT-09)
├── package.json
├── Dockerfile
├── src/
│   ├── host/                # main.ts + core.ts | connector.ts | all-in-one.ts (mode H or A wiring)
│   ├── core/                # clients/ managers/ engines/ access/   (Azure core)
│   ├── connector/           # clients/ managers/ engines/ access/   (home connector)
│   ├── utilities/           # security logging pub-sub config clock link-transport query-layer
│   └── contract/            # Public Contract (tool and event schemas)
└── test/
    ├── scenarios/           # scenario engine; local/ is git-ignored
    └── fixtures/ring/       # scrubbed Ring payloads, committed only after the owner's review
shim/                        # the channel shim (stdio relay for Claude Code)
schemas/                     # generated machine-readable schemas (FR-047), checked by the snapshot test
infra/                       # Bicep; infra/bootstrap/ holds bootstrap.ps1 (print-only unless -Apply) and the Entra runbook (PT-05)
scripts/                     # dev helpers
.github/                     # GitHub Actions workflows
```

**Structure Decision**: one npm workspace with a `bridge` package holding both sides of the link and the all-in-one wiring, plus the `shim` package. IDesign layers map to folders, and dependency-cruiser enforces the call rules between them (code-implementation I5.3).

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
| --- | --- | --- |
| The capacity is raised from the default 20 to 42 SP | Option B tests every risky unknown on the real hybrid path while the code is thin. Even split in two, its first part carries the foundation (CP-01 to CP-04, 11 SP), sign-in, the link and the Ring session together, which is 42 SP | Keeping 20 would spread the foundation over more iterations with no agent value at their end. Option A defers ChatGPT, the dot and the sign-in unknowns by an iteration, and Option C delays all agent value to its third iteration. The owner chose B, then the split with a raised capacity, on 2026-11-02 (see Capacity) |
