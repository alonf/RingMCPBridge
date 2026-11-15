# Lens Checklist: robustness-baseline v1 (iteration 001)

| Field | Value |
| --- | --- |
| Lens ID | `robustness-baseline` |
| Version | `v1.0.0` |
| Purpose | Capture the Phase 1 resilience and failure-semantics checks that prevent silent operational gaps. |
| Default Row Statuses | `pass`, `fail`, `not-applicable`, `advisory` |

## Scope

Use this lens when the feature introduces service boundaries, retries, background execution, concurrency, long-lived resources, or failure-handling logic. Record explicit not-applicable rationale when resiliency-oriented checks do not materially apply.

## Row Status Vocabulary

| Status | Meaning |
| --- | --- |
| `pass` | Evidence shows the reviewed path handles the concern as required. |
| `fail` | The concern applies and the implementation leaves the risk unresolved. |
| `not-applicable` | The feature shape does not materially require this check; rationale must be recorded. |
| `advisory` | The issue is visible for follow-up but not a blocking Phase 1 requirement. |

## Checklist Items

| Item ID | Concern | Concrete Check | Acceptance Criteria | Row Status | Evidence / Notes |
| --- | --- | --- | --- | --- | --- |
| ROB-001 | Failure semantics | Trace the primary failure paths for changed operations. | Each meaningful failure mode returns or records an intentional outcome rather than a silent swallow, crash loop, or ambiguous partial success. | `pass` | Each failure has an intentional outcome. The home is down: stale with `stale_since`. The store is down: `BRIDGE_UNAVAILABLE`, to retry. Ring is down: the session is `unavailable`, and the circuit opens. The admin page shows banners. A failed link commit stays unacked. `quality-evidence.md`, Resiliency |
| ROB-002 | Retry and idempotency | Review retries, replays, or repeated requests where side effects can occur. | Retried work is explicitly idempotent or guarded against duplicate side effects; missing retry safety is recorded as a failure or not applicable. | `pass` | At least once from home, with acks after commits and idempotent re-application by `state_version`. Code or refresh-token reuse ends its grant. No command exists in 001. `quality-evidence.md`, Retry and Idempotency |
| ROB-003 | Timeouts and backoff | Inspect blocking or remote-call behavior. | Remote or long-running operations use bounded waits, timeout handling, or a documented reason the path is synchronous and safe. | `pass` | Bounded waits throughout: tools 60 s (`TIMEOUT`); a Ring call 30 s; a hub's room list 10 s (DRIFT-001-80); the link's backoff 1 to 30 s with jitter; sign-in steps and manager reads 10 s; the health check 10 s |
| ROB-004 | Resource lifecycle | Check allocation and cleanup for files, sockets, connections, and subscriptions. | Acquired resources are deterministically released or lifecycle ownership is explicit and reviewable. | `pass` | The connector stops in order: the home side, the health file, Ring (waiting for a rotated token's save), and the outbox's file lock last. The adapter unsubscribes everything on close. The lease removes its row after the renewal in flight (`lease.test.ts`) |
| ROB-005 | Concurrency correctness | Review materially concurrent paths for race or ordering hazards. | Shared-state mutation, event sequencing, and async coordination have an explicit guard, serialization strategy, or documented non-applicability. | `pass` | One active instance, writes ordered by version, serialized transactions, one Ring call at a time. `quality-evidence.md`, Concurrency |
| ROB-006 | Degraded operation | Verify behavior when downstream tools or services are unavailable. | The feature exposes a clear degraded mode, surfaced failure, or compensating evidence path instead of silently pretending success. | `pass` | Degraded modes are visible: stale replies; the admin page's banners; the connector's Docker health (`(healthy)` live on the VM, DRIFT-001-72); `/readyz` naming what is missing. Live in the pilot: the stale check and the recovery (T033 step 4) |

## Execution

Run for iteration 001 at T035 (2026-11-15), against the code at `afc6f82` and the evidence in `../quality-evidence.md`. The review scope is the iteration's whole delivered surface: the core, the home connector, the admin page and the infrastructure scripts.

## Upgrade Guidance

When new robustness traps are learned from review or production evidence:

1. Propose the new or changed rows in this source file and describe the triggering defect pattern in the change log.
2. Review each proposed row for whether it should become blocking, remain advisory, or be deferred.
3. Bump the lens version only after the reviewed checklist delta is approved.
4. Update preset references separately so stack-specific adoption stays explicit and independently versioned.

## Change Log

| Version | Date | Change | Review Notes |
| --- | --- | --- | --- |
| `v1.0.0` | 2026-05-07 | Initial Phase 1 baseline covering failure semantics, retry safety, timeouts, cleanup, concurrency, and degraded-mode handling. | Establishes the reviewed operational baseline without implying later-phase hardening workflows. |
