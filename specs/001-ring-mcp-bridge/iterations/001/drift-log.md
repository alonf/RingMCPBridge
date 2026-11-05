# Drift Log: Iteration 001

**Schema**: v2

<!--
  Markdown authoring note (Specrew lifecycle convention):

  When you add new drift events to this file, watch for MD032 (blanks-around-lists).
  A sentence ending with a colon, immediately followed by a bullet list, is the most
  common violation. Always put a BLANK LINE between the colon line and the list:

      BAD:                              GOOD:
      Resolution steps:                 Resolution steps:
      - Step one                        <— blank line here
      - Step two                        - Step one
                                        - Step two

  The F-033 pre-boundary markdownlint gate runs markdownlint-cli --fix on .md
  changes before every boundary-sync write, so most violations auto-fix — but the
  blank line you write in the first place avoids the cleanup churn.
-->

## Summary

**Total drift events**: 15
**Resolution rate**: 100% (3 resolved at plan and 1 at tasks on 2026-11-02; 4 before implement and 2 in implement on 2026-11-03; 1 in implement on 2026-11-04; 4 in implement on 2026-11-05)
**Specification drift**: None detected (two tooling-output drifts, one record-to-record conflict, one owner re-slicing of the design analysis's first slice, two gaps between plan artifacts, and two link-contract defects found by the hardening review, all against the spec)

## Events

### DRIFT-001-01: the quality resolver's profile does not match the spec

- **Detected**: 2026-11-01, before-plan, by `resolve-quality-profile.ps1` (Specrew 0.40.0-beta41)
- **Kind**: governed tooling output contradicts the spec (no spec or code change)
- **Observed**: the resolver returned `quality-profile.custom-composition.v1` with the stack `mixed-or-unknown`, because no code exists yet. It marked `concurrency-correctness`, `resiliency` and `retry-idempotency-and-recovery` as not applicable, and the hardening focus area "Retry and idempotency expectations" as not applicable.
- **Requirement citation**: FR-024 (each command at most once, never retried, outcome unknown on timeout); FR-042 (reconnect within 60 s with backoff, resend after 10 s, catch-up); FR-010 and FR-011 (at-least-once push deduplicated by event id, cursors that never skip); FR-044 (single active instance, lease); FR-013 (late events and the recovery summary); `implementation-rules.yml` resolves the stack as `typescript-javascript`, and code-implementation I7 accepts synchronous SQLite calls on the event loop.
- **Resolution**: human-decision, accepted 2026-11-02 with the design-analysis verdict (Option B), and applied the same day: plan.md (Phase 1 Risk Dimensions, Required Quality Gates, Hardening Focus Areas) and `quality/hardening-gate.md` (`retry-idempotency-requirements` and `operational-resilience-concerns` flipped to `addressed`) carry it. The decision: plan.md's quality section and `quality/hardening-gate.md` override the three dimensions and the focus area as `required`, each with its FR rationale, and record the stack as TypeScript on Node. The resolver's other rows stand.
- **Class closure**: NONE — the resolver is Specrew-owned machinery outside this project; the per-feature override in plan.md and the hardening gate keeps this instance visible and reviewable.

### DRIFT-001-02: two workshop records name different error codes for a command caught by a home-link drop

- **Detected**: 2026-11-02, plan, during research consolidation (research.md, "Conflicts resolved at plan" 1)
- **Kind**: the workshop records disagree with each other. No spec or code change
- **Observed**:
  - component-design (CD2, X2) fails in-flight commands with `BRIDGE_UNAVAILABLE` when the link drops;
  - integration-api (D7) defines `HOME_OFFLINE` for "home link down (control and media)";
  - the observability amendment reserves `BRIDGE_UNAVAILABLE` for a core dependency being down.
- **Requirement citation**: spec Edge Cases ("in-flight commands fail with outcome unknown and are never retried; ... control and media report that the home is offline"); FR-024.
- **Resolution**: plan decision, 2026-11-02, for the owner to review at the plan boundary. `HOME_OFFLINE`, outcome unknown, never retried; the spec decides WHAT. contracts/errors.md and research.md carry it. Applies from iteration 003, when commands arrive.
- **Class closure**: NONE — this is a one-off conflict between closed workshop records; the contract tests in iteration 003 pin the code.

### DRIFT-001-03: the owner split the design analysis's first slice into two iterations

- **Detected**: 2026-11-02, plan, at the capacity check (58 SP planned against the configured 20)
- **Kind**: the plan's iteration slicing differs from the design-analysis record. No spec or code change
- **Observed**: the design analysis (Option B) puts US1 and US2 together in iteration 001 and numbers the later work as iterations 002 and 003. The owner chose capacity option 2 at the plan stage, so plan.md now has four iterations:
  - 001: US1 reads after Entra sign-in (42 SP);
  - 002: US2 events, the dot and the out-of-band alerts (16 SP, forecast);
  - 003: the old 002 (media, control, the rest of US1 and US2);
  - 004: the old 003 (full admin, disarm, the README, shared locations).
- **Requirement citation**: no requirement moved out of v1 or changed. FR-008 to FR-015, FR-042 (the 24-hour catch-up), FR-043 (part), SC-001, SC-002 and SC-010 move from iteration 001 to iteration 002.
- **Resolution**: human-decision. The owner chose option 2 on 2026-11-02. The planner placed the items and set the capacity, for the owner to review at the plan boundary: CP-17 (the minimal admin page) stays in iteration 001 because enrollment needs it, CP-08 is split because the home sends device state through the Outbox, CP-11 is split because the core's Event manager receives that state and the heartbeats, CP-21 is split so real clients sign in during iteration 001, and the capacity is set to 42 in `.specrew/iteration-config.yml`. plan.md, research.md, data-model.md, quickstart.md, contracts/ and `quality/hardening-gate.md` carry the new numbering. The design-analysis record and its gate packet keep the numbering the owner decided on, and this entry maps it.
- **Class closure**: NONE — this is a one-off owner decision at the plan boundary. Iteration 002 gets its own design analysis and plan stage, which re-check the forecast.

### DRIFT-001-04: the data model starts two audit chains in iteration 001, but no iteration 001 work item builds them

- **Detected**: 2026-11-02, tasks, while breaking iteration 001 into tasks
- **Kind**: two plan artifacts disagree. No spec or code change
- **Observed**: data-model.md ("Iteration needs" and the Audit ownership row) and research.md PT-33 start the `audit-90d` and `audit-1y` hash chains in iteration 001, with security and configuration entries. But:
  - no iteration 001 work item (CP-01 to CP-21a) builds the Audit accessor;
  - FR-035 is outside iteration 001's requirement scope;
  - the feature plan puts FR-035 in iterations 003 and 004, and the event audit in CP-11b (iteration 002).

  So enrollment approvals and the agent-allowlist seeding in iteration 001 would not be audited.
- **Requirement citation**: FR-035 (a tamper-evident audit of every security event and configuration change, kept 1 year); FR-032 (enrollment checked by the owner); PT-33 and PT-23 in research.md.
- **Resolution**: human-decision, 2026-11-02, at the tasks boundary. Two options were offered:
  1. Keep the plan as it is: 0 SP and $0. Iteration 001 writes no audit entries, and the chains start with the Audit accessor in a later iteration.
  2. Add a minimal Audit accessor that writes the enrollment and configuration entries in iteration 001: about 1 SP and $0, taken from the rework reserve (T036).

  The owner approved the tasks without instructions, which the packet defined as option 1. Applied the same day:
  - data-model.md (the Audit ownership row, the Audit entry iteration line, the Iteration needs row and the closing note on G13 and N1) and research.md PT-33 now start the chains in iterations 002 to 004 (`events-30d` in 002 with CP-11b, `audit-90d` in 003, `audit-1y` in 004, following plan.md's iteration table);
  - tasks.md's note records the decision.

  Iteration 002's plan stage re-checks when the security and configuration entries start.
- **Class closure**: NONE — this is a one-off gap between plan artifacts. The traceability check at the tasks boundary is what found it, and iteration 002's plan stage re-checks the audit work.

### DRIFT-001-05: the tasks and the quickstart create placeholder secrets, which PT-03 ruled out

- **Detected**: 2026-11-03, before-implement, by the T001 hardening review (codex, run `run-20261102-220201538-797ac437`)
- **Kind**: plan artifacts disagree with a plan decision. No spec or code change
- **Observed**: T030, quickstart Step 5 and research.md R13 still said the first deploy creates `issuer-signing-keys` and `pin-hash` as placeholders. That is the workshop's plan (CD A1), but PT-03, decided at plan, says no deploy creates a secret value and `/readyz` stays not ready until the secret is set. Nothing defined how the first signing key gets set.
- **Requirement citation**: FR-032 (secrets never exposed); FR-029 (the Issuer's tokens); research.md PT-03 and PT-04.
- **Resolution**: human-decision, 2026-11-03 (the owner's "fix and stop"). The changes:
  - T030 creates no secret values;
  - T031's bootstrap gains step 7, which sets the first signing key with the owner's sign-in after the first deploy;
  - T032's smoke test expects the missing key on the very first deploy;
  - quickstart Step 5 and research.md R13 follow PT-03;
  - `pin-hash` arrives with disarm in iteration 004.
- **Class closure**: NONE — this is a one-off leftover from before PT-03; the hardening review caught it before any code.

### DRIFT-001-06: device state sent as changed fields can lose a field under latest-wins

- **Detected**: 2026-11-03, before-implement, by the T001 hardening review (same run)
- **Kind**: the link contract's design is unsafe. No spec or code change
- **Observed**: `device_state` carried only the changed fields, but the core keeps or drops a whole message by one `state_version` per device (PT-30). Example: version 10 changes the battery and fails to commit, then version 11 changes `online` and commits. The resend of version 10 is then dropped, and the battery stays wrong until the next inventory. Out-of-order delivery has the same effect.
- **Requirement citation**: FR-006 (replies state when the data was true); FR-042 (the resend after 10 s); SC-005.
- **Resolution**: human-decision, 2026-11-03 (the owner's "fix and stop"). The changes:
  - `device_state` and every state-bearing event carry the device's full current entry, never a delta (contracts/connector-link.md, data-model.md consistency rule 3, research.md PT-30);
  - T014 sends the full entry;
  - T018 adds the test from the example above.
  - Cost: 0 SP and $0. Each message grows to one device record.
- **Class closure**: T018's test makes a return to deltas fail CI.

### DRIFT-001-07: the CI workflow that Specrew installed calls scripts this repository does not have

- **Detected**: 2026-11-03, before-implement, by the T001 hardening review (same run)
- **Kind**: governed tooling output does not fit this project. No spec or code change
- **Observed**: `.github/workflows/specrew-ci.yml` runs `./extensions/specrew-speckit/scripts/validate-governance.ps1` and `tests/integration/*.ps1`, which exist only in Specrew's own repository. This project's extension lives under `.specify/extensions/`. A push to `main` would fail the workflow even when the product's checks pass.
- **Requirement citation**: plan.md Required Quality Gates (the CI checks); research.md PT-15 (the required check names).
- **Resolution**: human-decision, 2026-11-03 (the owner's "fix and stop"). T004 fixes the governance path, removes the lanes that cannot run here, checks the other Specrew-installed workflows, and re-checks after each Specrew update.
- **Class closure**: NONE — the file is Specrew-managed machinery outside this project's control, and an update may restore it. T004's re-check after each update keeps the problem visible.

### DRIFT-001-08: a location's fields had no version, so a resent older inventory could roll back an alarm mode

- **Detected**: 2026-11-03, before-implement, by the T001 hardening review, round 2 (codex, run `run-20261102-225005395-dde0dcc8`)
- **Kind**: the link contract's design is unsafe. No spec or code change
- **Observed**: `inventory` carries each location's `alarm_mode`, `time_zone` and `ownership`, but only device entries had a `state_version`. If inventory A fails to commit, newer inventory B commits with a changed alarm mode, and A is resent after 10 s, nothing rejects A's older location fields. The overview would show the old alarm mode.
- **Requirement citation**: FR-001 (the overview's alarm mode); FR-006 (replies state when the data was true); FR-042 (the resend after 10 s).
- **Resolution**: human-decision, 2026-11-03. The owner stopped the review and signed it off, with this finding kept as a follow-up and fixed straight after. The changes:
  - each location entry carries its own `state_version` from the same home counter, applied latest-wins per location (contracts/connector-link.md, the data-model.md Location entity and consistency rule 3, research.md PT-30);
  - T014 sends the version, T018 and T019 apply it, and T018 adds the A-fails, B-commits, A-resent test.
  - Cost: 0 SP and $0.
- **Class closure**: T018's location test makes a regression fail CI.

The same round also found that PT-19 and data-model.md G4 still started the audit chain in iteration 001. Both now follow DRIFT-001-04.

### DRIFT-001-09: T002 pins the runtime libraries except two that arrive later

- **Detected**: 2026-11-03, implement, while doing T002
- **Kind**: task wording versus a plan decision. No spec change
- **Observed**: T002 says to pin the dependency versions in plan.md "Technical Context". Two of them are not added in T002:
  - `ring-client-api` 14.3.0: research.md PT-10 says it is added in T013 (CP-07), only after the repositories of its two packages without a declared licence are checked;
  - `@azure/storage-blob` 12.34.0: no iteration 001 component uses Blob storage. Media arrives in iteration 003 and the write-once audit copy in iteration 004.
- **Requirement citation**: plan.md Technical Context; research.md PT-10; implementation-rules.yml `project.supply-chain-policy`.
- **Resolution**: implementation choice, recorded here for the review. All the other runtime libraries and every development tool are pinned exactly in T002. T013 adds `ring-client-api` after the PT-10 licence check, and the iteration that first uses Blob adds `@azure/storage-blob`.
- **Class closure**: NONE — a one-off ordering of the same pinned versions; the licence gate (`scripts/license-gate.mjs`) blocks any unlisted licence when the libraries arrive.

### DRIFT-001-10: the first implement co-review was refused because the campaign's round allowance was used up

- **Detected**: 2026-11-03, implement, when starting the codex co-review of the work through T006 (checkpoint `cp-02-utilities-review`)
- **Kind**: review tooling versus the plan's co-review checkpoint. No spec change
- **Observed**: the owner typed `approved for review round`, and the hook recorded it as a round approval that is still unspent. The live run `run-20261103-173033330-f07a8975` in campaign `cmp-001-ring-mcp-bridge-i001` stopped with `allowance-exhausted` before invoking codex: no codex call, no quota used. The two T001 hardening rounds on 2026-11-02 had used this campaign's round allowance. Earlier records counted it as "2 of 4 rounds", which was wrong.
- **Requirement citation**: iteration 001 plan, the co-review checkpoints; `specrew review --help`, where `--remediate allowance-reset` is "the separate human-approved replenish of the round allowance".
- **Resolution**: human-decision. The owner typed `approved for allowance reset`, and `specrew review --remediate allowance-reset` replenished the rounds on 2026-11-03. The first run after the reset (`run-20261103-180948553-869009d3`) was refused again with `allowance-exhausted`, before codex was invoked. Specrew's reset message names `--live --approve-round` as the way to run the next round, so the review was started again with that flag, carrying the owner's typed round approval. That run (`run-20261103-181059697-dfcd1e9c`) reserved a round and completed: 9 minutes, 5 minor findings, budget 1 of 4 used. Resolved.
- **Class closure**: NONE — this is a decision about review budget, not a defect. The refusal is already loud: Specrew refuses before contacting the reviewer.<!--
  Every new ### DRIFT-... event includes:

  - **Class closure**: the executable mechanism that makes the next instance impossible or loud

  If the change fixes only this instance, write NONE — <why class closure is not in scope>.
  A bare Resolution: FIXED is not class closure.
-->

### DRIFT-001-11: review sign-off was refused because a fix had moved the code after the last reviewed round

- **Detected**: 2026-11-04, implement, when carrying the owner's `stop the review here` after co-review round 3 (campaign `cmp-001-ring-mcp-bridge-i001`)
- **Kind**: review tooling versus the fix-then-stop order. No spec change
- **Observed**: round 3 (`run-20261103-212946051-f209bba6`) reviewed commit 13eb127. Its one finding was then fixed in the working tree with a test, and state.md recorded the round. `specrew review --live --pause-choice 2` refused with `latest-result-not-current`: the latest result targets an earlier snapshot and cannot authorize the current tree. Specrew offered partial sign-off for the exact tree (refresh the request, the owner's typed `approved for partial review signoff - <why>`, then the same command again, with no commits or record writes between).
- **Requirement citation**: iteration 001 plan, the co-review checkpoints; Specrew's review sign-off gate (a sign-off binds to the reviewed tree).
- **Resolution**: human-decision. The owner chose the last round over partial sign-off. Round 4 (`run-20261104-135642595-1d72f246`, about 9 minutes, budget 4 of 4) reviewed the current tree, found nothing wrong with the round-3 fix, and found 1 new minor finding. The owner typed `stop the review here`, and sign-off completed on 2026-11-04 on exactly the tree round 4 reviewed. The round-4 finding was saved as a follow-up, then fixed with a test after sign-off. Resolved.
- **Class closure**: NONE — the gate works as designed and refuses loudly. The working practice is already stated by Specrew: a fix after the last reviewed round needs another round or an explicit partial sign-off.

### DRIFT-001-12: T008 names the storage columns the data model leaves open, and cannot migrate under a lease that does not exist yet

- **Detected**: 2026-11-05, implement, while doing T008
- **Kind**: data-model names and a research reading versus the migration. No spec change
- **Observed**:
  - data-model.md calls `oidc_item`'s expiry `expires`. The column is `expires_at`, like the other time columns.
  - These names are new at implement, marked [P]:
    - the health snapshot's columns: `snapshot_id` (one row), `home_link_status` and `home_link_since`, `ring_session_status` and `ring_session_since`, `push_status` and `push_since`, `last_event_at`, `stale_since`, `outbox_depth`, `connector_version` and `as_of`;
    - `setting (name, value, updated_at)` and `lease (name, holder, expires_at)`;
    - `connector.requested_at`, and `connector.expires_at` for the pending request's expiry (PT-32);
    - the runner's own table `schema_migration`.
  - `location.monitoring` and `agent.elicitation_only` belong to iteration 003, so migration 1 leaves them out. They arrive later as nullable columns.
  - research.md R6 (B6) says the Host applies migrations "under the lease", but migration 1 creates the lease table, so the first start cannot hold a lease. The runner therefore locks on its own: BEGIN IMMEDIATE on SQLite and an application lock on SQL Server. Two starts at once apply each migration once, whichever order CP-10 gives the Host.
  - Times are stored as UTC milliseconds in integer columns, because the T-SQL driver returns no date type the layer carries, so a DATETIME2 column would fail every read. data-model.md's "timestamp is UTC ISO 8601" stays the contract's form. The accessor converts at its DTO boundary; whether a DTO carries milliseconds or ISO text is settled with the first accessor (`bridge/src/core/access/README.md`).
- **Requirement citation**: data-model.md "Agent client and grant" (PT-11), "Home part enrollment" (PT-32), "Other stored state", "Names proposed here" and "Schema lifecycle"; research.md R6 (B6).
- **Resolution**: implementation choice, recorded for the CP-03 co-review and the owner. Cost: 0 SP and $0.
- **Class closure**: two tests fail CI on a later drift. `bridge/test/query-layer/migrations-contract.ts` checks each dialect's tables and columns against one expected list. `bridge/src/utilities/query-layer/migrations/migrations.test.ts` fails when the two dialects' statements differ or a statement is not additive.

### DRIFT-001-13: the CP-03 co-review was refused because the round allowance was spent, and Specrew still shows round 4's question as open

- **Detected**: 2026-11-05, implement, when starting the codex co-review of T007 and T008 (checkpoint `cp-03-query-layer-review`, commits 81d909b and eb7d22d)
- **Kind**: review tooling versus the plan's co-review checkpoints. No spec change
- **Observed**:
  - The owner typed `approved for review round`. Specrew recorded it as `cmp-001-ring-mcp-bridge-i001-round-7`; the approval is not spent.
  - Run `run-20261105-144312659-3572c2dc` stopped with `review-round-paused:review-round-budget-exhausted` before invoking codex (Invoked: False, elapsed 0.0 s). No codex call, no quota used.
  - Specrew reports 4 of 4 rounds used. The 2026-11-03 reset gave this campaign 4 rounds, and CP-02 spent them (rounds 1 to 4).
  - Specrew also presents round 4 (`run-20261104-135642595-1d72f246`) as still waiting for an answer, offering only "stop the review here" or "abandon". This project's records say the owner typed `stop the review here` and sign-off completed on 2026-11-04 (DRIFT-001-11, state.md). Not investigated; reported as seen.
  - The hook read the typed `approved for review round` as a verdict for the `review` boundary and said nothing was recorded for it. The round approval was captured anyway (above).
- **Requirement citation**: iteration 001 plan, the co-review checkpoints (about every 5 SP of committed tasks); `specrew review --help`, where `--remediate allowance-reset` is the human-approved replenish of the round allowance.
- **Resolution**: human-decision. The owner typed `approved for allowance reset`, and `specrew review --remediate allowance-reset` replenished the rounds on 2026-11-05 ($0). The round then ran with `--live --approve-round`, carrying the owner's unspent round approval: `run-20261105-144818639-e501294a`, 15 minutes, budget 1 of 4 used, 3 minor findings. After the reset Specrew no longer presented round 4's question. The owner typed `stop the review here`, and sign-off completed on 2026-11-05. Resolved.
- **Class closure**: NONE — the refusal is already loud and happens before the reviewer is contacted. With one 4-round allowance per campaign and a checkpoint about every 5 SP, a reset per checkpoint is likely; that is the owner's budget decision, not a defect.

### DRIFT-001-14: T009 declares the Ring Adapter's port ahead of T013, and T010 types oidc-provider locally

- **Detected**: 2026-11-05, implement, while doing T009 and T010
- **Kind**: task order and names left open, versus the code. No spec change
- **Observed**:
  - T009 says the engine "implements the Ring Adapter's port", but the adapter arrives with T013 (CP-07). T009 declares the port, types only plus the adapter's error, in `bridge/src/connector/access/ring-adapter/` (CD4: the callee declares). Its scope is T013's list: locations, devices, change notifications and the session status.
  - These names are new, marked [P]:
    - `RingPort` with `sessionStatus`, `locations`, `devices` and `watch`;
    - `RingChange` with the kinds `device`, `location` and `session`. A location change carries an alarm-mode change, which T013 does not list;
    - `RingAdapterError` with the kinds `ring_unavailable` (Ring down, a 5xx, a 406) and `session_lost`.
  - The port's fields are the link contract's, without `as_of` and `state_version`, which Ingest and the Outbox Store add. Ring history for a gap (R25) is left out: no iteration 001 checkpoint reads events. Names are plain strings documented as untrusted; T011 marks them in the Public Contract (`x-untrusted`).
  - T009 asks for link drops, delays and duplicates, but the link arrives with CP-09. `FaultyChannel` wraps any message sink on the fake clock; CP-09's tests put it in front of the link transport.
  - oidc-provider 9.13.3 ships no type declarations. T010 declares only what the stand-in uses in `bridge/test/support/oidc-provider.d.ts`, so no package is added. The Issuer (CP-16) chooses between widening that file and DefinitelyTyped's package, a new development dependency that is the owner's decision.
  - `docker-compose.yml`: Azurite has no consumer before iteration 003 (DRIFT-001-09); it is there because T010 names it. SQL Server is pinned to 2022-CU14, the image already used locally; CI uses 2022-latest.
- **Requirement citation**: tasks.md T009, T010 and T013; plan.md "The Ring boundary stays swappable"; `contracts/connector-link.md` "Device inventory and state"; research.md R25; implementation-rules.yml `project.cd4-callee-declares-dtos` and `dependency_policy`.
- **Resolution**: implementation choice, recorded for the CP-04 co-review and for T013. Cost: 0 SP and $0.
- **Class closure**: `bridge/test/scenarios/scenario-engine.test.ts` assigns the engine to `RingPort`, so tsc fails if the two drift apart; T013's Ring-boundary contract test adds the same check for the real adapter.

### DRIFT-001-15: T011 publishes three cumulative documents and settles the contract's open details

- **Detected**: 2026-11-05, implement, while doing T011
- **Kind**: names and details left open, versus the code. No spec change
- **Observed**:
  - **The published files.** `schemas/` holds `tool-inputs.schema.json`, `tool-replies.schema.json` and `tool-error.schema.json` (names [P]). They grow with each iteration, so their `$id`s carry no iteration number. The inputs document keeps the shape of `contracts/iteration-001-tools.schema.json` (one `$defs` entry per tool), and a test checks that its structure matches the plan's file. Descriptions are not compared: the plan's carry [P] marks and trace ids, while the published ones are written for agents.
  - **Untrusted marking.** Field descriptions start with "UNTRUSTED.", as in `events.schema.json`. The location's `time_zone` is marked too: it is text from Ring, although the catalog lists only names and rooms. The marking check treats any free text or open object in a reply as Ring's unless the bridge writes it (`id`, `location_id`, `device_id`, the error's `message` and `details`).
  - **Optional reply fields.** Under the additive rule, a published required field can never become optional, so only what iteration 001 always fills is required. Optional: `alarm_mode` (a location with no alarm), `room`, `battery_pct` (including in `low_batteries`, when Ring gives only its low flag), `battery_low`, `get_health`'s `push` and `last_event_at` (filled from iteration 002), and `stale_since`. The error envelope lists all fourteen codes now.
  - **The narrowing rules**, per direction:
    - inputs fail on a removed field, a field that became required, a removed enum value, a tighter bound or format, or unknown fields becoming rejected;
    - replies fail on a removed field, a field that is no longer always present, a removed enum value, or a looser bound or format. New fields and enum values pass;
    - any change to another keyword fails;
    - a new zod rendering of the date-time `pattern` is ignored while the `format` is unchanged;
    - the check errs on the safe side: an input that drops its `enum` entirely, and so accepts any string, is still reported as having its values removed.
  - **The snapshot guard** uses Vitest's file snapshots. `schemas:generate` is `vitest --update` on the snapshot test, and the narrowing check runs before each write. A document not yet published fails unless `SCHEMAS_BOOTSTRAP=1` is set for the run that first writes it, which T011 used once. `.gitattributes` keeps `schemas/*.json` at LF, so the test passes on a Windows checkout.
  - **Where the checks live.** The checks are test code in `bridge/test/contract/`. The Public Contract holds only schemas and their JSON Schema publication.
  - **Two gaps are left open:**
    - A hand edit to the committed `schemas/` files, followed by a matching code change, still passes. Closing that means comparing with the base branch in CI, a `ci.yml` change (`fetch-depth`) for the owner to decide.
    - FR-046 lets a deprecated tool be removed later, but the check has no override for that yet.
  - **For MCP Endpoint (T024)**, from a probe of SDK 2.4.0:
    - the SDK lists exactly what `z.toJSONSchema` generates, marks included;
    - the client checks `structuredContent` against the listed output schema, which rejects unknown fields, so the endpoint must parse each reply through its reply schema (that drops extra fields);
    - the SDK answers an unknown input field with its own text error (`isError: true`, "Input validation error: …"), not the contract's `INVALID_ARGUMENT` envelope.
  - `tool-replies.schema.json` is 34 KB, mostly the date-time `pattern` zod writes for each time field. Noted only.
- **Requirement citation**: tasks.md T011 and T024; `contracts/mcp-tools.md` "Conventions"; `contracts/errors.md`; `contracts/iteration-001-tools.schema.json`; FR-033, FR-046, FR-047, FR-048.
- **Resolution**: implementation choices, recorded for the next co-review and for T024. Cost: 0 SP and $0.
- **Class closure**: the three checks run in CI's lint job (`npm run schemas:check`) and in the test suite. A deliberate break of each part was caught.

### Resolution Strategies (Unused)

The following resolution strategies remain available if drift is detected later in execution:

- **spec-updated**: Update the spec to reflect implementation choice
- **implementation-reverted**: Revert implementation to match spec
- **deferred**: Mark drift as deferred to next iteration
- **human-decision**: Escalate to the owner for resolution

### Notes

- This artifact was scaffolded before review starts so drift can be logged immediately when detected.
- Replace the zero-drift summary with real counts when the first drift event is recorded.
