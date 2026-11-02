# Iteration Plan: 001

**Schema**: v1
**Spec**: [../../spec.md](../../spec.md)
**Status**: planning
**Capacity**: 42/42 story_points
**Started**: 2026-11-02
**Completed**:

<!--
  Validator schema (canonical, enforced by validate-governance.ps1):
  - Iteration Status MUST be one of:
      planning | executing | reviewing | retro | complete | abandoned
    (Common mistakes the validator REJECTS: `approved`, `in-progress`, `done`, `ready`.)
  - Capacity format MUST be `<consumed>/<cap> <effort_unit>` with NO trailing prose on that line.
    Append explanatory notes in the Notes section at the bottom instead.
  - Task Status (in the Tasks table) MUST be one of:
      planned | in-progress | done | needs-rework | deferred | blocked
    (Note `in-progress` uses a hyphen, not an underscore. `done` not `completed`.)
-->

## Scope Summary

| Requirement | Summary | Stories |
| ----------- | ------- | ------- |
| FR-001 | The system MUST return a one-reply overview per location: alarm mode, open contacts, active motion, offline devices, low batteries and bridge health, at most about 8,000 tokens for a home of about 100 devices. | US1 |
| FR-002 | The system MUST list devices with id, name (in any language), type, room, battery level, power mode and online status, filterable by kind and room, and MUST return the full state of a single device. | US1 |
| FR-005 | The system MUST report its own health: the home link, the Ring session, push reception, the last event received, and since when data has been stale. | US1 |
| FR-006 | Every reply MUST state when its data was true, in UTC and in the location's time zone, and its freshness (live, cached or stale, with the time it became stale). Reads MUST return the last known state marked stale when the home link is down, and MUST fail with a retryable "bridge unavailable" error when the bridge's own store is down. | US1 |
| FR-026 | The system MUST enforce configurable per-agent rate limits (defaults: control 20 an hour, counted on confirm; reads 600 an hour; fresh frames and bursts 60 an hour; clips 20 an hour). It MUST also limit its outgoing calls to Ring through one shared limiter with backoff, with no polling bursts. | cross-cutting (US1 path) |
| FR-029 | Remote agents MUST authenticate through MCP's standard authorization, with the bridge as its own issuer and only listed agent clients allowed. The human MUST sign in with their organization identity. Access lasts 1 hour; refresh rotates and ends after 30 days unused or 90 days at most. | cross-cutting (US1 path) |
| FR-030 | The system MUST grant the scopes read, media and control per client, and configuration switches MUST override scopes. Defaults: control for the chosen chat and coding agents; read-only for the local desktop relay; read and media for cloud-hosted agents acting under their own identity. | cross-cutting (US1 path) |
| FR-032 | The Ring login token, push credentials and the home part's key MUST stay only at home, encrypted at rest, and MUST never appear in any reply, log or tool. The home part MUST only connect out. It MUST enroll with its own key pair and a one-time code checked by the owner, and a new enrollment MUST revoke the old one (one home part per Ring account). | cross-cutting (US1 path) |
| FR-033 | The system MUST treat Ring-sourced text (device names, event text) and image content as untrusted data, MUST never act on instructions found in them, and MUST mark them as untrusted in its tool descriptions and schemas. | cross-cutting (US1 path) |
| FR-034 | Logs MUST carry identifiers, never content: no tokens, PIN, keys or images. | cross-cutting (US1 path) |
| FR-040 | The admin and confirm pages MUST work at three widths (a folded phone, an unfolded phone, a PC), keep page state when a phone is unfolded mid-task, default to a dark theme with a light switch remembered per browser, show every status as a word and an icon, support keyboard use with readable contrast, and show banners with what to do when the home is offline, the Ring session is lost or the store is down. English only in v1. | US6 (part: the minimal admin page) |
| FR-042 | The system MUST run at least 7 days unattended without a manual Ring re-login. It MUST reconnect within 60 seconds of a link or push drop, with growing delays (1 to 30 seconds, randomised). It MUST resend unacknowledged events from home after 10 seconds, and after a gap MUST catch up Ring's history (up to 24 hours) through the shared Ring limiter. | cross-cutting (US1 path) |
| FR-044 | The system MUST guarantee a single active instance per Ring account. An instance that cannot hold the guarantee MUST NOT control anything. | cross-cutting (US1 path) |
| FR-046 | The tool list is the public contract and MUST change only additively: a tool is deprecated before removal. The link between the home part and the cloud part MUST be versioned, and the cloud part MUST accept the current and the previous version. | cross-cutting (US1 path) |
| FR-047 | The system MUST publish its public contract (tool inputs and outputs, the event shape) as machine-readable schemas. | cross-cutting (US1 path) |
| FR-048 | Tool input schemas MUST be flat (enums and optional fields, no alternatives or nullable unions), so that every target client can use them. | cross-cutting (US1 path) |

The feature-level plan is [../../plan.md](../../plan.md): the iteration map, technical context, quality planning, capacity and cost. This file is its iteration 001 slice. The owner split the design analysis's first slice into iterations 001 and 002 on 2026-11-02 (DRIFT-001-03 in [drift-log.md](drift-log.md)).

Partly in iteration 001:

- FR-005: the home link, the Ring session and stale-since. Push reception and the last event are filled from iteration 002.
- FR-026: the read limit and the shared Ring limiter.
- FR-030: the read scope only.
- FR-040: the minimal admin page only (health and the enrollment-code compare).
- FR-042: link reconnect, Ring backoff and the Outbox resend. The 24-hour catch-up is iteration 002.
- FR-046: link version 1, completed in iteration 002 without a version bump.

Success criteria touched: SC-003 (the 7-day soak starts), SC-005 (stale within 2 minutes; the HIGH health event is iteration 002), SC-006 and SC-011.

## Tasks

| Task | Title | Requirement | Story | Effort | Owner | Owner File Globs | Status | Agent | Actual | Verdict |
| ---- | ----- | ----------- | ----- | ------ | ----- | ---------------- | ------ | ----- | ------ | ------- |
| CP-01 | Repository scaffold, toolchain, CI pipeline (lint, type check, tests, dependency check, schema snapshot) | FR-046, FR-047 | enabling | 3 | Implementer | `package.json`, `tsconfig.base.json`, `eslint.config.js`, `vitest.config.ts`, `.github/**` | planned | — | — | — |
| CP-02 | Utilities: Security, Logging (identifiers only), Pub/Sub, Config, Clock | FR-034 | enabling | 2 | Implementer | `bridge/src/utilities/**` | planned | — | — | — |
| CP-03 | Query layer for SQLite and T-SQL, migrations, per-component DTOs | FR-006, FR-044 | enabling | 3 | Implementer | `bridge/src/utilities/**` | planned | — | — | — |
| CP-04 | Test harness: scenario engine (a simulated home of about 100 devices, fault injection) and the stand-in identity provider | FR-029, FR-001 | enabling | 3 | Implementer | `bridge/test/**` | planned | — | — | — |
| CP-05 | Public Contract: the four read tools, untrusted-content marking | FR-033, FR-047, FR-048 | US1 | 1 | Implementer | `bridge/src/contract/**`, `schemas/**` | planned | — | — | — |
| CP-06 | Setup CLI and Secrets File: the owner's Ring login and 2FA, connector key pair, enrollment code | FR-032 | cross-cutting | 2 | Implementer | `bridge/src/connector/**` | planned | — | — | — |
| CP-07 | Ring Adapter behind the Ring boundary: shared limiter, circuit, backoff | FR-026, FR-042 | US1 | 2 | Implementer | `bridge/src/connector/**` | planned | — | — | — |
| CP-08a | Outbox Store: durable queue, ack, resend after 10 s, the `state_version` counter | FR-042 | US1 | 1 | Implementer | `bridge/src/connector/**` | planned | — | — | — |
| CP-09 | The link: Link transport, Core Link, Connector Link, versioned hello, enrollment check, heartbeat, reconnect with backoff | FR-032, FR-042, FR-046 | cross-cutting | 3 | Implementer | `bridge/src/utilities/**`, `bridge/src/connector/**`, `bridge/src/core/clients/**` | planned | — | — | — |
| CP-10 | Host: mode A and H wiring, single-instance Lease, `/livez`, `/readyz` | FR-044 | cross-cutting | 2 | Implementer | `bridge/src/host/**` | planned | — | — | — |
| CP-11a | Event manager, link intake: `inventory`, `device_state` and heartbeats into State (latest-wins) and the Health engine; home offline after 2 minutes without a heartbeat | FR-005, FR-006 | US1 | 1 | Implementer | `bridge/src/core/managers/**` | planned | — | — | — |
| CP-14 | Inquiry path: Inquiry manager, Summary and Health engines, State; overview, device list, one device, health, freshness and stale | FR-001, FR-002, FR-005, FR-006 | US1 | 3 | Implementer | `bridge/src/core/**` | planned | — | — | — |
| CP-15 | MCP Endpoint for both protocol eras, read scope, read rate limit | FR-026, FR-030 | US1 | 2 | Implementer | `bridge/src/core/clients/**` | planned | — | — | — |
| CP-16 | Issuer with Entra sign-in, Grants, client allowlist, token lifetimes | FR-029, FR-030 | US1 | 3 | Implementer | `bridge/src/core/**` | planned | — | — | — |
| CP-17 | Minimal admin page: health and enrollment-code compare, three widths, word plus icon | FR-005, FR-032, FR-040 | US6 (part) | 1 | Implementer | `bridge/src/core/clients/**` | planned | — | — | — |
| CP-19 | Bicep (App Service, Azure SQL, Key Vault, Blob) and the GitHub Actions deploy | FR-032, FR-044 | cross-cutting | 3 | Implementer | `infra/**`, `scripts/**`, `.github/**` | planned | — | — | — |
| CP-21a | First agent trial: ChatGPT and Claude sign in through Entra and read the home; the 7-day Ring-session soak starts | FR-029, FR-042 | US1 | 1 | Implementer (with the owner) | — | planned | — | — | — |
| CP-RV | Review: codex review runs and the hardening review | FR-001, FR-002, FR-005, FR-006, FR-026, FR-029, FR-030, FR-032, FR-033, FR-034, FR-040, FR-042, FR-044, FR-046, FR-047, FR-048 | all | 3 | Reviewer | — | planned | — | — | — |
| CP-RW | Expected rework (about 10%) | FR-001, FR-002, FR-005, FR-006, FR-026, FR-029, FR-030, FR-032, FR-033, FR-034, FR-040, FR-042, FR-044, FR-046, FR-047, FR-048 | all | 3 | Implementer | — | planned | — | — | — |

## Effort Model

| Setting | Value | Notes |
| ------- | ----- | ----- |
| Effort Unit | story_points | Unit used in task effort, capacity, and retro variance. |
| Capacity per Iteration | 42 | Maximum planned effort before overcommit guidance applies. |
| Iteration Bounding | scope | `scope` keeps requirements fixed; `time` enforces a time ceiling. |
| Time Limit (hours) | n/a | Only applies when iteration bounding is `time`. |
| Overcommit Threshold | 1.0 | Warn planners when total estimated effort exceeds 42 story_points (capacity 42 x threshold 1.0). |
| Defer Strategy | manual | How planning should choose deferrals when the iteration is over capacity. |
| Calibration Enabled | true | When true, retrospectives should suggest future capacity adjustments. |

## Concurrency Rationale

- Current roster snapshot: Spec Steward, Planner, Implementer, Reviewer, Retro Facilitator
- Technology and scope signals: a TypeScript service, a home daemon and the link between them dominate. The only page is the small admin page (CP-17).
- Task dependency graph: the foundation (CP-01 to CP-04) comes first. The home side (CP-06, CP-07, CP-08a) and the core side (CP-10, CP-14, CP-16) can then proceed in turn, joined by the link (CP-09) and the intake (CP-11a). CP-15 and CP-17 follow the Issuer, CP-19 deploys, and CP-21a closes the build. tasks.md sets the exact order.
- Workstream separability: Conflict-heavy signals are present, so keep same-specialty work serial unless ownership boundaries become explicit.
- Shared-surface conflict risk: elevated due to shared-state / cross-cutting cues in scope text.
- Prior reviewer ownership/hotspot evidence: No prior reviewer hotspot signals were found for this feature.
- Recommendation: do not propose Junior/Senior same-specialty expansion until the task table and ownership boundaries make safe parallelism explicit. If a same-specialty pair is approved later, record `Owner File Globs` for the parallel tasks or keep the work serial.

## Phase Baseline

| Phase | Estimated Effort | Notes |
| ----- | ---------------- | ----- |
| Planning | 2 (spent) | This plan stage; not counted in the 42 |
| Discovery/Spikes | 1 | CP-21a. Spike S1 (CP-20) is iteration 002 |
| Implementation | 35 | CP-01 to CP-19 in this table, enabling work included |
| Review | 3 | CP-RV |
| Rework | 3 | CP-RW |

## Traceability Summary

- Requirement scope for this stub: FR-001, FR-002, FR-005, FR-006, FR-026, FR-029, FR-030, FR-032, FR-033, FR-034, FR-040, FR-042, FR-044, FR-046, FR-047, FR-048
- User stories represented in current scope: US1 (overview, devices, one device, health, freshness); US6 in part (the minimal admin page).
- Every requirement in scope maps to at least one work item above. tasks.md, at the tasks stage, breaks them into tasks mapped to FRs and SCs and runs the traceability check.
- Overcommit guardrail: 42 planned against 42 (threshold 1.0), so no deferral is needed. The owner chose the split (capacity option 2) on 2026-11-02; the capacity of 42 is the planner's value, for the owner to review at the plan boundary.

## Notes

- This plan was scaffolded by `scaffold-iteration-plan.ps1` and filled from the feature-level plan on 2026-11-02.
- Add task rows only for work that is traceable to the scoped requirements above.
- Keep Status: planning until the plan is fully decomposed and approved.
- If task effort exceeds the configured threshold, make the deferral decision explicit in this plan before execution starts and name the lowest-priority requirement slices proposed for deferral.
