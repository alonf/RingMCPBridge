# Quality Evidence: Iteration 001

**Profile Ref**: `quality-profile.custom-composition.v1`
**Preset Refs**: none (the plan's bounded custom composition, with the stack recorded as TypeScript on Node)
**Findings Ref**: `specs/001-ring-mcp-bridge/iterations/001/quality/mechanical-findings.json`
**Reviewed By**: Reviewer (claude), with codex's co-review rounds (the last, Specrew's round 33, clean on `0431bcf`, `run-20261115-150558819-d9da95a1`)
**Reviewed At**: 2026-11-15T15:26:37Z

## Gate Matrix

| Gate | Requirement | Evidence Source | Status | Exception |
| --- | --- | --- | --- | --- |
| `dead-field` | mechanical quality bar, unused-state hygiene | `specs/001-ring-mcp-bridge/iterations/001/quality/mechanical-findings.json` | `excepted` | DRIFT-001-84: all 26 findings checked against the code. Each field is read, a link close-reason constant or an interface method, and the one field no end read (`request_id`) now is (T036) |
| `anti-pattern` | mechanical quality bar, deterministic anti-pattern scan | `specs/001-ring-mcp-bridge/iterations/001/quality/mechanical-findings.json` | `pass` | `—` |
| `test-integrity` | mechanical quality bar, assertion-driven tests | `specs/001-ring-mcp-bridge/iterations/001/quality/mechanical-findings.json` | `pass` | `—` |
| `stack-tooling-evidence` | stack tooling evidence | `specs/001-ring-mcp-bridge/iterations/001/quality/quality-evidence.md` | `pass` | `—` |
| `quality-lens-review` | quality-lens review | `specs/001-ring-mcp-bridge/iterations/001/quality/lenses/` | `pass` | `—` |
| `concurrency-correctness-review` | the plan's restored dimension (DRIFT-001-01) | `specs/001-ring-mcp-bridge/iterations/001/quality/quality-evidence.md` | `pass` | `—` |
| `resiliency-semantics-review` | the plan's restored dimension (DRIFT-001-01) | `specs/001-ring-mcp-bridge/iterations/001/quality/quality-evidence.md` | `pass` | `—` |
| `retry-idempotency-review` | the plan's restored dimension (DRIFT-001-01) | `specs/001-ring-mcp-bridge/iterations/001/quality/quality-evidence.md` | `pass` | `—` |
| `bridge-latency-budget` | 0.5 s p95 inside the bridge for the read tools | `bridge/test/mcp-endpoint/mcp-endpoint.test.ts` ("the read latency budget") | `pass` | `—` |
| `contract-snapshot` | FR-046, FR-047 | `bridge/test/contract/` (`npm run schemas:check`) | `pass` | `—` |
| `dependency-boundaries` | the call rules and the Ring boundary | `.dependency-cruiser.cjs` (`npx depcruise bridge shim`) | `pass` | `—` |

## Mechanical Checks

`run-mechanical-checks.ps1` (Specrew 0.40.0), run 2026-11-15:

- **`anti-pattern` and `test-integrity`:** no finding.
- **`dead-field`:** 26 findings, all of one rule, `dead-field.websocket-payload-unused`. Each was checked against the code (DRIFT-001-84):
  - 25 are fields read where the rule does not look: link close-reason constants read in `switch` cases; the hello's challenge signature, which `verifyChallenge` reads; `shut`, an interface method the link calls; and inventory and heartbeat fields that `intake-mapping.ts` reads.
  - One was real: the connector never read `request_id` in the core's `inventory_request`, which the link contract keeps for correlation (OR2). Both ends now log it (T036). The rule still lists it, since it does not see a read through `message.body`.

Re-run at `0431bcf` (T036): the same 26 findings, none in the code T036 added.

The checks pass in that sense only: these results, as triaged here, and nothing wider.

## Stack Tooling

Run on 2026-11-15 on the owner's PC (Windows, Node 24.13.0), and in CI on Linux for every commit:

| Tool | Result |
| --- | --- |
| `tsc --noEmit` (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) | no error |
| ESLint 10 with typescript-eslint `strictTypeChecked` and `stylisticTypeChecked` (`--max-warnings 0`) | no warning |
| Prettier (`format:check`) | every file formatted |
| Vitest with coverage, on SQLite | 1,296 tests pass, 134 skip without SQL Server. Lines 96.52%, branches 92.64%, statements 96.34%, functions 96.48%, against the gates of 90% and 85% |
| Vitest on SQL Server | CI runs every store test against SQL Server (`requireSqlServerInCi`); green on every commit of the pilot, the last `cef1144` |
| Playwright, the admin page | 132 checks in 6 projects (folded phone, unfolded phone, PC; dark and light), on Windows and in CI on Linux |
| dependency-cruiser | no violation: 341 modules, 1,523 dependencies |
| The schema snapshot (`schemas:check`) | 61 tests pass; `schemas/` matches the contract |
| The read latency budget | both tests pass: the four read tools at most 0.5 s at the 95th percentile, over loopback HTTP |
| The image smoke test (`scripts/image-smoke.mjs`) | 9 checks pass on a locally built image, and on every deploy in CI: each mode starts and stops on what it lacks, `health` answers in each mode, the image declares its `HEALTHCHECK`, and holds no tests or dev dependencies |
| `npm audit` gate (`scripts/audit-gate.mjs`) | passes. In production dependencies, one advisory chain only: GHSA-2p57-rm9w-gvfp in `ip`, through `werift` 0.22.4 in `ring-client-api` 14.3.0. It is on the written exception list until `ring-client-api` ships `werift` 0.25; `werift` serves only Ring live media, which iteration 001 does not use |
| gitleaks 8.30.1 | no leak, in the pre-commit hook on every commit and in CI |

## Concurrency Correctness Review

The plan's restored dimension: one active instance, writes that never pass each other, and the event loop.

- **One active instance (FR-044):**
  - `bridge/test/core-access/lease.test.ts` covers:
    - exactly one of five instances that ask at the same moment gets the lease;
    - renewal every 15 s;
    - the hand-over at the next renewal when the holder stops;
    - a stopped holder never keeping it.
  - `bridge/test/host/assembly.test.ts`: the link is handed over when the holder loses the lease, never running on both.
  - `bridge/test/host/all-in-one-lease.test.ts`: a second process on the same folder stays away from Ring.
  - The admin page approves nothing on an instance without the lease (`web.test.ts`). In the pilot, a deploy showed the new core at `lease: held_elsewhere` until the old one's lease ran out (DRIFT-001-80's deploy).
- **Writes that never pass each other:**
  - State applies inventories and device changes by `state_version`, latest wins (DRIFT-001-08). CP-14's review rounds 3 to 5 found and fixed the ways old data could look current or come back (DRIFT-001-36 to DRIFT-001-38).
  - The query layer runs a transaction's statements one at a time (`query-layer.test.ts`, `serial-queue.test.ts`).
  - Pub/Sub handles a topic in publish order (`pub-sub.test.ts`).
  - When a motion began (`motion_since`) is worked out in the statement that stores each device entry, from the stored value, so an older entry State drops never touches it, and an inventory after a reconnect does not move it (`state-store.test.ts` on both databases, DRIFT-001-86).
- **Races on shared rows:**
  - Settings leaves one waiting enrollment request when several arrive at once, and retries once when another request won (`settings-store.test.ts`, CP-08a round 4).
  - A refresh token or a code used twice, even at the same moment, ends its grant (DRIFT-001-45, the Issuer's tests).
  - The owner's time zone map is read and written whole; two saves at the same moment could keep one (accepted: one owner, DRIFT-001-81).
- **One Ring call at a time:** the Ring Adapter runs one library call at a time, and makes no new call while a call it gave up on still runs (`ring-api-adapter.test.ts`, CP-09 rounds 3 to 5). The room-list wait is bounded, so a hub that never answers cannot hold the next call (DRIFT-001-80).
- **One picture per reply:** State holds no snapshot of its data and its health together, so Inquiry reads the health first, then the data. A home that comes back between the reads cannot lend its fresh health to data read before; at worst a fresh read says `stale` (`inquiry-manager.test.ts`, DRIFT-001-86).

## Resiliency Semantics Review

The plan's restored dimension: reconnect, resend, Ring outages and staleness.

- **The link (FR-042):** it backs off from 1 s, doubling to 30 s, while the core is unreachable, and starts over after a session (`core-link.test.ts`). After a drop, it dials again within a second and sends every unacked message again, oldest first. Live: the deploys of 2026-11-14 restarted the core three times, and the home link came back each time on its own.
- **Ring:**
  - The circuit opens after five failures in a row and probes once a minute; a reconnect shorter than the 30 s grace changes nothing (`ring-api-adapter.test.ts`, `call-limits.test.ts`).
  - A hub's connection stuck closed for 5 minutes past the grace ends the process, so its service restarts it (`connector.test.ts`, DRIFT-001-35).
  - A hub Ring calls offline (or on its cellular backup) past the grace counts Ring `unavailable`, so every reply is stale, until the hub is online and its device list has come again. It is never a stuck connection, since a restart would not bring the hub back (`ring-api-adapter.test.ts`, DRIFT-001-86).
  - A live connection closed past the grace keeps Ring `unavailable` from its reopen until each hub it serves has sent its device list, and mode A ends on a stuck connection as the connector does (`ring-api-adapter.test.ts`, `all-in-one-lease.test.ts`, DRIFT-001-89).
- **Staleness (FR-006, SC-005):**
  - Past 2 minutes without a heartbeat, replies read `stale` with `stale_since`, never as current. The store down is `unavailable`, never stale data (`inquiry-manager.test.ts`, `health-engine.test.ts`).
  - Live, on the owner's home (T033 step 4, 2026-11-14): `cached` at 76 s, `stale` with the link down past 2 minutes, then `cached` again after the start.
- **Docker health (DRIFT-001-72):** the connector writes its health every 15 s, and the image's `HEALTHCHECK` reads it. Live: `(healthy)` on the owner's VM.
- **Not yet shown:** SC-003's 7 days without a Ring re-login, running since 2026-11-14 (T033).

## Retry and Idempotency Review

The plan's restored dimension: at-least-once delivery from home, deduplication, and nothing done twice.

- **The outbox (CP-08a):**
  - A message is resent 10 s after it was sent without an ack, and not a moment earlier. It is cleared only on its ack, and an unknown or repeated ack changes nothing.
  - Unacked messages survive a restart (`outbox-store.test.ts`).
  - Ingest writes the backlog one message at a time and never queues copies (`ingest.test.ts`).
- **The core's side:**
  - A message is acked only after its commit. A failed commit leaves it unacked, for the home to send again (`connector-link.test.ts`).
  - Applying the same entry twice is a no-op by `state_version`.
- **The query layer** never runs a transaction's work again after a failure during the commit (`query-layer.test.ts`).
- **Commands** (FR-024, at most once, never retried) come with control in iteration 003. Iteration 001 has none.
- **Tokens:** a rotated Ring refresh token is saved at once, and shutdown waits for the save (CP-10's review). The VM's update now stops the connector gracefully first (DRIFT-001-81).

## Quality Lens Review

The three lenses the hardening gate activated are filled under `lenses/`: `security-baseline.md`, `robustness-baseline.md` and `test-integrity.md`.
