# Iteration Plan: 003

**Schema**: v1
**Spec**: [../../spec.md](../../spec.md)
**Status**: planning
**Capacity**: 42/42 story_points
**Started**: 2026-11-23
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

The first milestone is a real detection followed by a second service fetching the matching JPEG and event clip with its own credentials. M01 through M05 form that vertical slice. A local file, a callback receipt or a URL opened by the requesting agent alone cannot pass it. The test receiver stands in for the future recognition service. [Approved Option B and settings screen](design-analysis.md) · [Design verdict](../../gates/design-analysis-003.md)

The full feature-map slice is estimated at 49 points. This plan proposes 42 points and a **seven-point deferral for confirmed arm/light control**. If approved, carry FR-022 through FR-025 and the control-specific part of FR-035 forward together: 2 points for adapter capability and switch checks, 3 for prepare/confirm, deduplication and audit, and 2 for negative cases, unknown outcomes and field verification. Preserve the two-minute bound confirmation and at-most-once semantics. Disarm already belongs to later work. These seven points are excluded from the estimates below and the feature requirement remains open. If control must ship in 003, replace seven points of named scope or explicitly revise capacity before tasks. The settings page and camera grant enforcement are dependencies of the first milestone.

## Tasks

| Task | Title | Requirement | Story | Effort | Owner | Owner File Globs | Status | Agent | Actual | Verdict |
| --- | --- | --- | --- | ---: | --- | --- | --- | --- | --- | --- |
| M01 | Prove that the linked official API can identify a specific event JPEG and clip; run clip playback spike S7 | FR-014, FR-016, FR-018 | US3 | 3 | Implementer | bridge/dev/ring-pilot/** | planned | — | — | — |
| M02 | Stage event-matched media privately with capture metadata, concurrent-request deduplication, retention and delete-now | FR-014, FR-016, FR-018, FR-021, FR-037 | US3 | 5 | Implementer | bridge/src/core/**, infra/** | planned | — | — | — |
| M03 | Implement authenticated handoff, receiver registration lookup, item grants, revocation and media-access audit | FR-018, FR-020, FR-026, FR-030, FR-034, FR-035 | US3 | 5 | Implementer | bridge/src/core/**, bridge/src/contract/** | planned | — | — | — |
| M04 | Build the approved household settings screen, camera permissions, sound setting and durable approval changes | FR-020, FR-036, FR-039 | US3, US8 | 3.5 | Implementer | bridge/src/core/** | planned | — | — | — |
| M05 | Deliver a real event JPEG and clip to a separate test receiver; verify withdrawal between reads | FR-016, FR-018, FR-020 | US3 | 2 | Implementer | bridge/test/** | planned | — | — | — |
| M06 | Implement direct cached/fresh frame, bounded burst and finite clip capture with rate and battery guards | FR-016, FR-017, FR-018, FR-019, FR-026 | US3 | 4 | Implementer | bridge/src/connector/**, bridge/src/core/** | planned | — | — | — |
| F01 | Implement household sensor-type and individual-camera event rules, per-client opt-ins and policy precedence | FR-008, FR-009, FR-010, FR-011, FR-036 | US2, US8 | 3.5 | Implementer | bridge/src/core/** | planned | — | — | — |
| Q01 | Implement motion windows, active rooms, occupancy and paged device/household history, including existing control entries | FR-003, FR-004 | US1 | 3 | Implementer | bridge/src/core/** | planned | — | — | — |
| Q02 | Add per-crossing battery alerts, Ring low flag, threshold settings and periodic digest | FR-007, FR-010 | US1, US2 | 2 | Implementer | bridge/src/core/** | planned | — | — | — |
| V01 | Close delivery and cursor coverage gaps with end-to-end and interruption tests | FR-010, FR-011, FR-030, FR-042 | cross-cutting | 2 | Implementer | bridge/test/** | planned | — | — | — |
| V02 | Collect T049, T056 and T061 field evidence with the owner | FR-010, FR-042, FR-043 | pilot | 2 | Implementer | specs/001-ring-mcp-bridge/iterations/003/** | planned | — | — | — |
| RV | Independent hardening and review of access, media handling and delivery evidence | FR-018, FR-020, FR-030, FR-034, FR-035 | cross-cutting | 3 | Reviewer | — | planned | — | — | — |
| RW | Correct findings and rerun the affected tests and pilot assertions | FR-018, FR-020, FR-030, FR-042 | cross-cutting | 4 | Implementer | — | planned | — | — | — |

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

M01 verifies provider capabilities before M02 commits to an event-correlation mechanism. M02 and M03 agree on item identity and readiness before the UI and test receiver consume the contract. M05 exercises M01–M04 together. Keep the established home connector for sensors and alarm until device-specific official support is proven. No cloud-direct login is needed for this milestone. S2 still requires separate owner approval for its account-sensitive test method.

Read-side work Q01/Q02 can use synthetic events while the media pilot awaits a detection. Sequence F01 with M04 to avoid conflicting policy and settings writes. V02 depends on people, a seven-day observation window and the billing calendar; start collecting available evidence early. Code writer is Codex; independent reviewer is Claude under the existing review-round process.

## Phase Baseline

| Phase | Estimated effort | Basis |
| --- | ---: | --- |
| Planning | outside cap | Requirements, design verdict and this proposal |
| Discovery | 3 | M01 |
| Implementation | 26 | M02, M03, M04, M06, F01, Q01, Q02 |
| Verification and pilot | 6 | M05, V01, V02 |
| Review | 3 | RV |
| Rework | 4 | RW |
| Total | 42 | 42 available, ratio 1.00 |

These are planning estimates, not measured velocity. Iteration 002 recorded no final actuals. There is no unallocated headroom beyond RW. Failure to correlate an event or deliver a clip triggers a scope decision after M01; never substitute the latest snapshot and mark the requirement complete.

## Traceability Summary

| Work | Acceptance evidence |
| --- | --- |
| M01–M05 | Record the event identity, source household, camera, capture time and readiness. Match the retrieved bytes at the separate receiver. Verify both a still and an event clip under one camera approval. Test an unapproved receiver, another camera, wrong item, five-minute expiry, withdrawal between range requests, and reapproval with an old grant. No raw images, recipient tokens or upstream URLs enter the public evidence. |
| M02, M03 | On a partial write, expose no ready item. Concurrent requests reuse one staged item. Verify configurable seven-day retention and delete-now on supported stores. A repeated removal webhook cannot reinstate access. Validate upstream media destinations on redirects. Audit media access with identifiers; the full tamper-evident chain remains later scope (SC-009). |
| M06 | Test 5–8 frames from one bounded session, desired freshness, unavailable/stale results, the direct finite-clip path, sound suppression and SC-008 on a battery camera. Receiver live view is outside Option B. Preserve the shared provider limiter and device constraints. |
| F01 | On two households and two clients, exercise push, store only and drop. Verify ownership/source identity and shared-home defaults. A client’s opt-in cannot restore a dropped event or override the household's store-only rule. Muting a push preserves access to retained history. |
| Q01, Q02 | Use fixed clocks and deterministic histories to verify time bounds, paging, household isolation and unknown state. A threshold crossing or Ring low flag yields one alert, handles recovery and can alert on a subsequent crossing. Verify the digest schedule. |
| V01 | Measure receive-through-push p95 against 0.5 s (SC-001). Kill/restart a process and resume by cursor (SC-002). Cover oversized outbound deliveries, two-client restart isolation, denied subscribe without read scope, and signed delivery before and after unsubscribe. |
| V02 | T049 measures user-visible latency separately from callback acceptance. T056 stays open until alert email receipt; SMS fired/resolved was already observed. T061 needs the actual seven-day soak and clock check (SC-003) and month-end bill against $30 (SC-011). Log observed alert timing against SC-010. |
| RV, RW | Run lint, dependency and schema checks, unit/integration tests and the coverage gate. Independently review concurrency, resilience, retry/idempotency and negative authorization tests. Validate the hardening gate before implementation. Retest and document any remaining gap. |

## Notes

- Proposed receiver contract, stored relationships and live-test procedure are in the [tool contract](../../contracts/mcp-tools.md), [data model](../../data-model.md) and [quickstart](../../quickstart.md). The [interaction diagram](review-diagrams.md) identifies which credential is used for each read.
- Receiver grants start only when an item is ready. A transfer already authorized can finish; each subsequent GET or Range must recheck current approval. Registry and camera-media switches apply even on cache hits. Missing storage or authorization state fails closed.
- The owner-approved household filters and camera approvals serve different purposes. Delegated media permission grants no control or additional household visibility. Receiver delivery and test scope stop at a fetch by an authenticated second identity.
- Request any physical scenario and operational changes separately when the pilot needs them. No deployment or real alarm operation is part of plan approval.
