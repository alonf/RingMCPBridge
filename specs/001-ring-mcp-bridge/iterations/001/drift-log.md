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

**Total drift events**: 61
**Resolution rate**: 100% (3 resolved at plan and 1 at tasks on 2026-11-02; 4 before implement and 2 in implement on 2026-11-03; 1 in implement on 2026-11-04; 4 in implement on 2026-11-05; 4 in implement on 2026-11-06; 16 in implement on 2026-11-07; 3 in implement on 2026-11-08)
**Specification drift**: None detected (three tooling-output drifts, one record-to-record conflict, one owner re-slicing of the design analysis's first slice, two gaps between plan artifacts, and two link-contract defects found by the hardening review, all against the spec)

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
    - inputs fail on a removed field, a field that became required, a removed enum value, a new enum on a field that took any value, a tighter bound or format, or unknown fields becoming rejected;
    - replies fail on a removed field, a field that is no longer always present, a removed enum value, a dropped enum, or a looser bound or format. New fields and enum values pass;
    - any change to another keyword fails;
    - a `pattern` is compared strictly, like a format. A new or changed pattern fails an input, and a dropped or changed one fails a reply, even when the `format` is unchanged;
    - an input that drops its `enum` entirely passes, because that only loosens it.
  - **The CP-05 co-review (2026-11-06) found gaps in two of these rules.**
    - Round 3 found that an enum added to an input that took any value went unreported. The enum rule now handles each direction separately, as listed above. The same change let a dropped input enum pass; before, the check reported it as removed values.
    - Round 4 found that the `pattern` exception is too wide. UTC and local times share `format: date-time`, and only the pattern tells them apart, so a reply time switched from UTC to an offset passes unseen. It was saved as a follow-up at sign-off, and fixed afterwards: patterns are now compared strictly, as listed above.
      - A test using zod's real UTC and local-time patterns fails on the old rule and passes on the new one.
      - Switching the error envelope's `as_of` to local time now fails the snapshot test.
      - zod is pinned at exactly 4.6.7, so only a deliberate zod upgrade could change the generated pattern. The check would then stop that upgrade until the owner decides (the same missing override as the deprecated-tool removal below).
  - **The snapshot guard** uses Vitest's file snapshots. `schemas:generate` is `vitest --update` on the snapshot test, and the narrowing check runs before each write. A document not yet published fails unless `SCHEMAS_BOOTSTRAP=1` is set for the run that first writes it, which T011 used once. `.gitattributes` keeps `schemas/*.json` at LF, so the test passes on a Windows checkout.
  - **Where the checks live.** The checks are test code in `bridge/test/contract/`. The Public Contract holds only schemas and their JSON Schema publication.
  - **Two gaps, one closed:**
    - A hand edit to the committed `schemas/` files, followed by a matching code change, passed every check. **Closed on 2026-11-05** at the owner's typed choice (`close the schema gap`):
      - CI's lint job now runs a step, "Public Contract against the base commit". It fetches the base commit (the pull request's base, or main's previous commit on a push), extracts that commit's `schemas/` into `SCHEMAS_BASE_DIRECTORY`, and runs the contract checks again;
      - with that variable set, the snapshot test also compares each document with the base copy, and fails if the base published a document that is now gone;
      - a missing base directory fails, and an empty one means the base published nothing yet;
      - a whole-branch `fetch-depth` was not needed, because the step fetches the one base commit.
      - Tested locally on real commits. A removed reply field, with the committed file edited to match, passed the existing checks (74 of 74) and failed the base comparison. The CI step first ran on GitHub on 2026-11-05, in draft pull request #1 of the new private repository, and passed: it ran the 62 contract checks against a base with no published schemas.
    - Still open: FR-046 lets a deprecated tool be removed later, but the check has no override for that yet.
  - **For MCP Endpoint (T024)**, from a probe of SDK 2.4.0:
    - the SDK lists exactly what `z.toJSONSchema` generates, marks included;
    - the client checks `structuredContent` against the listed output schema, which rejects unknown fields, so the endpoint must parse each reply through its reply schema (that drops extra fields);
    - the SDK answers an unknown input field with its own text error (`isError: true`, "Input validation error: …"), not the contract's `INVALID_ARGUMENT` envelope.
  - `tool-replies.schema.json` is 34 KB, mostly the date-time `pattern` zod writes for each time field. Noted only.
- **Requirement citation**: tasks.md T011 and T024; `contracts/mcp-tools.md` "Conventions"; `contracts/errors.md`; `contracts/iteration-001-tools.schema.json`; FR-033, FR-046, FR-047, FR-048.
- **Resolution**: implementation choices, recorded for the next co-review and for T024. Cost: 0 SP and $0.
- **Class closure**: the three checks run in CI's lint job (`npm run schemas:check`, then again against the base commit) and in the test suite. A deliberate break of each part was caught.

### DRIFT-001-16: T012 settles the Secrets File's key format, contents and write rules

- **Detected**: 2026-11-06, implement, while doing T012
- **Kind**: details left open, versus the code. No spec change
- **Observed**:
  - **The key's Docker secret** holds the 32-byte key as base64url text (43 characters). Surrounding whitespace, such as a trailing newline, is ignored. `encodeSecretsFileKey` writes this form, and T028's Setup CLI must use it. An error about the key never quotes what the secret holds.
  - **The contents** are sealed JSON with the bridge's stored names: `format` (1), `ring_refresh_token`, `ring_hardware_id`, `push_credentials` and `connector_private_key` (PKCS#8 DER as base64url). Push credentials are an opaque JSON object, optional until Ring's push registration has run. This file does not import ring-client-api types, which keeps T013's adapter as its only import site.
  - **Values stay hidden.** The token, hardware ID and push credentials come back as `Secret` values, which print and serialize to JSON as `[secret]`; only `reveal()` hands out a value. The private key comes back as a `KeyObject`, which never prints its bytes. Error messages are the bridge's own. A cause is attached only where it cannot quote the contents, so a JSON or zod parse error is never attached.
  - **Failing closed.** Only a successful `open` or `create` gives an object that can write. A wrong key, a changed byte or unknown contents throws `open_failed`, and the file is left as it was. A missing file is a normal result (`undefined`), because the Setup CLI has not run yet.
  - **Writes.**
    - Each write goes to a temporary file in the same folder, is flushed, and is renamed over the file. On Linux the folder is flushed too.
    - `create` places the file with a hard link, which never replaces an existing file, so a second setup cannot overwrite the first one (`already_exists`).
    - Writes run one at a time, in call order, and each one writes the whole file. Overlapping token rotations therefore leave the newest token on disk (rule L2).
    - A failed write leaves the previous file. The new values stay in use, and the next write carries them.
    - The file is owner-only (0600) on Linux.
  - **Where paths come from.** The file and key paths are passed in by the caller. No setting was added here; T028 and the connector's wiring decide them.
  - **Carry-forward to T016 (Core Link).** T012 tests that the secrets serialize as placeholders in a JSON frame. The link does not exist yet, so T016 should also test that no Secrets File value appears in the frames it sends.
- **Requirement citation**: tasks.md T012, T016 and T028; data-model.md "Ring secrets"; SC4, DS3; FR-032, FR-034.
- **Resolution**: implementation choices, recorded for the CP-06 co-review and for T028. Cost: 0 SP and $0.
- **Class closure**: the Secrets File's tests cover the round trip, the wrong key, the changed byte, unknown contents, an existing file, a failed write, overlapping writes, and leaks through errors, log lines and JSON. A deliberate break of five parts was caught: unordered writes, an attached JSON error, a temporary file left behind, a `Secret` that serializes its value, and a `create` that replaces an existing file.

### DRIFT-001-17: T013's Ring call limits fill in two numbers, and the licence check of PT-10 needs the owner

- **Detected**: 2026-11-06, implement, while doing T013
- **Kind**: a record-to-record conflict, a value the records leave open, and a PT-10 owner decision. No spec change
- **Observed**:
  - **The call limits** are in `bridge/src/connector/access/ring-adapter/call-limits.ts`, built test-first on the fake clock. One gate takes every Ring call: one call at a time, a backoff after each `ring_unavailable` failure, and a circuit that opens after 5 failures in a row and probes once a minute.
    - The circuit is checked when a call reaches the front of the queue. Calls already waiting when it opens are refused without reaching Ring.
    - Only `ring_unavailable` counts as a failure. A lost session, an abort or an unmapped error neither counts nor holds the probe slot.
    - A caller that aborts while queued leaves at once, and the calls behind it still wait their turn.
  - **The spacing between calls is not in the records.** FR-026 says only "no polling bursts". The default is 1 s between the starts of two calls (`RING_CALL_LIMITS.spacingMs`).
  - **The backoff numbers conflict.** tasks.md T013 says "1 to 30 s, randomised", which matches FR-042's link reconnect. Research R25 says Ring's 429 and 5xx back off "from 2 s to a 60 s cap, with jitter". The default follows R25, because it is the Ring-specific decision: each wait is a random time between half and all of 2 s × 2^(failures − 1), capped at 60 s. Only the first four waits differ between the two, because the circuit opens at the fifth failure. **The owner kept R25 on 2026-11-06** (`Accept your suggestion`).
  - **The PT-10 licence check** of the two packages that come with ring-client-api and declare no licence:
    - `@shinyoshiaki/jspack` (through werift) is a republish of `birchroad/node-jspack`, whose repository is BSD-3-Clause. This is the permissive licence PT-10 asks for, so it becomes a reviewed exception in `scripts/license-exceptions.json` when the library is installed.
    - `ffmpeg-for-homebridge` has no LICENSE file in its repository and no licence field, and its source says "Copyright(C) 2019-2026, The Homebridge Team. All rights reserved." It is a hard dependency of `@homebridge/camera-utils` (MIT), which imports it when the module loads and falls back to plain `ffmpeg` when it exports nothing. Its install script downloads an ffmpeg binary, which the supply-chain policy already forbids. **Owner decision pending (PT-10).** The options were to accept it as a reviewed exception, to replace it through an npm override with a small local stub that exports nothing, or to ask upstream for a licence.
    - **The owner's decision (2026-11-06):** "If there is no security issue, it is ok to use the package."
    - **The security check.** No advisory names the package. Its only risk is the install script, which downloads an ffmpeg program over HTTPS with no checksum and marks it executable. That never happens where it matters: CI and the image install with `--ignore-scripts`, and the adapter passes the system ffmpeg to ring-client-api by path (its `ffmpegPath` option), so a downloaded program would not be used either. On a developer machine, installs must use `--ignore-scripts` too, because a plain `npm install` would run the download.
    - **The stub was tried and dropped.** npm 11.9.0 applied a `file:` override of this nested package in a fresh test project, but wrote it into the lockfile relative to the wrong folder (`node_modules/@homebridge/camera-utils/stubs/...`). In this repository, it did not apply the override at all. `npm ci` could not reproduce either result, so the real package is used, as the owner allowed.
    - **The developer install.** On 2026-11-06 the owner accepted the fix for the last place the download could run: quickstart.md Step 2 now says `npm ci --ignore-scripts`, followed once per clone by `git config core.hooksPath .githooks`, because the skipped npm `prepare` would otherwise set the commit hooks. The hook's own comment says the same.
    - **A third package came to light:** `mediabunny` (MPL-2.0, through `werift-rtp` 0.8.9), which the licence gate allows for development only. It is used unmodified, only by Ring live media (iteration 003). The owner accepted it as a runtime exception on 2026-11-06.
    - **mediabunny is pinned to 1.62.1** (released 2026-10-22), as the owner accepted, instead of 1.65.2 (released 2026-11-04, two days before the install). Both declare the same dependencies, and both satisfy werift-rtp's `^1.45.2`. The pin is a nested override under `werift-rtp` in the root `package.json`. npm 11.9.0 does not apply it when it re-resolves the package: it drops mediabunny from the tree, in either override form. So the lockfile entry was set to 1.62.1 by hand (version, tarball and the registry's integrity hash). `npm ci` then installs 1.62.1, a plain `npm install` keeps it, and `npm ls` reports a valid tree. **If a later install moves it back to 1.65.2 or drops it, set the lockfile entry by hand again.**
  - **The install.** `ring-client-api` 14.3.0 was added to `bridge/package.json` with `--ignore-scripts`. The root `overrides` pin werift's five wildcard parts to the versions the workshop recorded, which are still the latest: `werift-common` 0.0.3, `werift-dtls` 0.5.8, `werift-ice` 0.2.3, `werift-rtp` 0.8.9 and `werift-sctp` 0.0.11. The audit gate passes, with only the recorded `ip` exception. The licence gate passes, with three reviewed exceptions in `scripts/license-exceptions.json`: jspack, ffmpeg-for-homebridge and mediabunny.
- **Requirement citation**: tasks.md T013; research.md R25 and PT-10; spec FR-026, FR-042 and Edge Cases; implementation-rules.yml `project.supply-chain-policy` and `dependency_policy`.
- **Resolution**: the call limits are implementation choices. The owner kept R25's backoff and accepted ring-client-api's unlicensed package on the condition that it raises no security issue, which the check above supports once installs skip install scripts everywhere. The owner also accepted mediabunny and its pin to 1.62.1. After the pin, the audit gate and the licence gate pass (126 runtime and 401 dev-only packages). Cost: 0 SP and $0.
- **Class closure**: the limits' tests run in the suite. A deliberate break of six parts was caught: the circuit checked on entry, a probe slot kept after an unmapped error, an abort that waits its turn, no spacing, no backoff, and a queue that lets a call pass the one before it.

### DRIFT-001-18: T013's adapter works around ring-client-api's own retries and logging, and reads no rooms yet

- **Detected**: 2026-11-06, implement, while doing T013
- **Kind**: library behaviour and details left open, versus the code. No spec change
- **Observed**:
  - **ring-client-api retries on its own, without end.** It retries a request that gets no answer every 5 s, a 504 every 5 s, and a 404 with a known Ring error code every 20 s. On a 401 it refreshes the token and tries again. None of its calls take a cancel signal.
    - So the adapter gives each call a 30 s deadline (`RING_CALL_TIMEOUT_MS`), after which the call counts as `ring_unavailable`. It also passes on the caller's abort.
    - The library keeps retrying in the background after a deadline. Its late failure is observed and dropped, so it can never become an unhandled rejection. The circuit opens after 5 failures, so only a few such calls can retry at once. (Wrong: each minute's probe added another loop. Since 2026-11-07, a new call waits for the abandoned one, so only one runs; see DRIFT-001-20.)
    - The library's own polling options stay unset, so it polls nothing itself (FR-026).
  - **ring-client-api logs Ring's content.** Its log lines quote URLs and Ring's response bodies. `ring-client.live.ts` installs a silent logger through its `useLogger` hook, and failures reach the bridge's log only as `RingAdapterError` (FR-034, OR6).
  - **Errors.** Only the HTTP status and two known sign-in refusals are read ("Refresh token is not valid", and the 2FA message). A 401 that reaches the adapter (after the library's own refresh) or a refusal is `session_lost`. Anything else is `ring_unavailable`, named by its status: 406 counts as blocking, then 429, 5xx, another status, or no answer. The library's message, body and URL are never copied or attached as a cause.
  - **A lost session stays lost.** After `session_lost`, calls are refused without reaching Ring until the owner signs in again with the Setup CLI and the connector restarts. R25's "once per failure" token refresh is the library's own, on a 401.
  - **The token.** ring-client-api's refresh token is its own encoding, which also carries the session hardware ID and the push credentials. The adapter saves each rotated token whole, as a `Secret`, through `saveRefreshToken`, which the Host wires to the Secrets File's `update`. The Secrets File's hardware ID is passed as the library's `systemId`. Its separate push-credential field is not used yet. A failed save is logged without the token.
  - **Mapping, a tolerant reader** (`ring-mapping.ts`):
    - Ring's device kinds map onto the bridge's types; any other kind is `other`. The alarm panel and access codes are left out, because they are not devices.
    - A device is wired when Ring reports an AC status or no battery. A wired device reports no battery level, and a level outside 0 to 100 is dropped.
    - `online` comes from Ring's `commStatus` field, which is not in the library's types.
    - State uses the scenario engine's words (`open`, `motion`, `flood`, `on`, `level`, `tampered`). A camera's state is empty in iteration 001.
    - A location's time zone falls back to UTC when Ring's address time zone is not an IANA name.
    - Owned versus shared comes from comparing the location's owner with the account's profile id.
  - **Changes.** After a read, the adapter watches each alarm device's data stream and reports what follows, not the data the read already returned. A change of the alarm panel's mode is reported as a location change. Cameras report no changes until push arrives (iteration 002), because polling stays off. (Since 2026-11-07, each device read refreshes the cameras from Ring; see DRIFT-001-21.)
  - **No rooms yet.** Ring's room names come from a websocket room list whose payload shape no recorded data confirms, so `room` is absent in iteration 001 and `list_devices`'s room filter finds nothing on a real home. **Carry-forward to the pilot:** read the room list once a scrubbed recorded payload has been reviewed.
  - **Offline detection rests on `commStatus`**, which Ring's device documents carry but the library does not type. If Ring does not send it, every alarm device counts as online, and `get_overview` lists no offline device. **Carry-forward to the pilot:** confirm the field on the owner's home.
  - **The owner's decisions (2026-11-06):** T013 stays complete, with both carry-forwards checked in the pilot. CP-07's co-review is folded into one round with CP-06 after T028, covering T012, T013 and T028 (about 10 to 12 minutes of Codex time). That round needs a typed `approved for allowance reset` first, because all 4 rounds are used. (Overtaken on 2026-11-07: the CP-08a round reviewed T012 and T013 too; see DRIFT-001-20.)
  - **Where the parts are:**
    - The narrow client types are in `ring-client.ts`. The compiler checks that the real `RingApi` fits them, in `ring-client.live.ts`.
    - The fake client both test suites use is in `bridge/test/support/fake-ring-client.ts`.
    - The Ring-boundary contract test is `bridge/test/ring-boundary/ring-boundary.test.ts`. It checks that only `ring-client.live.ts` imports ring-client-api, and runs the same checks against the scenario engine and the adapter.
- **Requirement citation**: tasks.md T013; research.md R25; spec FR-002, FR-026, FR-033, FR-034, FR-042 and Edge Cases; implementation-rules.yml `code-rule.anti-corruption-layers` and `code-rule.idiomatic-error-handling`.
- **Resolution**: implementation choices, recorded for the co-review of CP-06 and CP-07 after T028. The room list and the `commStatus` check wait for the pilot. Cost: 0 SP and $0.
- **Class closure**: the mapping tests (written first), the adapter's tests over the fake client, and the contract test run in the suite. A deliberate break of five parts was caught: a library error kept as the cause, the library's message copied, the first device data reported as a change, a lost session that is not kept, and a ring-client-api type in the port.

### DRIFT-001-19: T014 settles the outbox's rules in code, sends the inventory again on an alarm-mode change, and lets one schema use SQLite only

- **Detected**: 2026-11-06, implement, while doing T014
- **Kind**: details the records leave open, one addition to the link contract's "when it is sent", and a change to the CP-03 migration runner. No spec change
- **Observed**:
  - **The Outbox Store** (`bridge/src/connector/access/outbox-store/`):
    - **The file and its schema.** The store opens its own SQLite file and brings its schema up to date when it opens, so the Host only opens it. Its migration list lives with the store, because no other component reads the file. Names new at implement [P]: the tables `outbox` (`seq`, `message_id`, `kind`, `body`, `created_at`, `sent_at`) and `state_counter` (one row, `last_version`). Times are UTC milliseconds, as in the core's schema.
    - **Its operations** [P names]: `append`, `takeDue(limit)`, `acknowledge`, `markAllUnsent` and `depth`.
      - `takeDue` returns the messages never sent and those sent 10 s or more ago without an ack (`RESEND_AFTER_MS`), oldest first, and marks them sent.
      - `markAllUnsent` is for a new session: every unacked message is then sent again, oldest first.
      - `acknowledge` clears one message. A repeated or unknown ack changes nothing.
    - **Message ids** are random UUIDs, made when the message is written.
    - **The counter.** `append` hands the composing code the next versions and saves the counter in the same transaction as the message. A failed write keeps neither, so no version is used twice.
    - **Code N-1 on schema N.** `kind` has no CHECK, so iteration 002 can add events and `catchup_done` without rebuilding the table. A row of a kind this release does not know stays in place, unsent, and counts in the depth.
    - **Errors.** The store's own error, `OutboxStoreError`, has one kind: `unavailable`. Its messages never quote a body, which holds Ring names. A row that does not parse fails with no cause attached, because JSON's error quotes the text it read.
  - **Ingest's state path** (`bridge/src/connector/managers/ingest/`):
    - **Order.** Writes run one at a time in the order their cause arrived, so a later state always has the higher version.
    - **Changes during a read.** A read's answer can be older than a change that arrives while the read runs. Such changes are folded into that read's inventory, which is written after them and carries the higher versions.
    - **Alarm-mode changes.** No iteration 001 message carries a location alone. So a location change (the alarm panel's mode, from the Ring Adapter) sends the whole inventory again from Ingest's view of the home: the last read plus every change since. It needs no Ring call. Before the first inventory there is no view, so nothing is sent; the next read includes the change. The contract's `inventory` row now names this trigger (`contracts/connector-link.md`).
    - **`as_of`** is the time the home last saw each entry: the end of the read, or the change's arrival.
    - **Outcomes.** An inventory returns an outcome rather than throwing: `queued`, `ring_unavailable`, `session_lost` or `outbox_unavailable`. Ingest does not retry; its caller decides when to try again. Any other failure, including the caller's abort, passes through unchanged.
    - **A change that cannot be written** is logged once, as `ingest_state_not_queued`, with the device or location id and no names. The next inventory carries that state again.
    - **Session changes** are not Ingest's: the heartbeat reads the Ring session status (T016).
  - **The migration runner (CP-03)** took a small, additive change. A migration list may name one dialect: `Migration<Dialect>`, and `checkMigrations(list, dialect)` checks the statements for the database's dialect. The core's list keeps both dialects, required by its type and compared by its test.
  - **Carry-forwards to T016**, where Core Link and the Home Scheduler use this:
    - at each new session, call `markAllUnsent`, then send what `takeDue` returns, and route each `ack` to `acknowledge`;
    - call `sessionStarted` after `hello_ok`, and try again on the 10 s tick while the outcome is not `queued`;
    - call `inventoryRequested` on `inventory_request`;
    - read the heartbeat's outbox depth from `depth`;
    - Core Link is a client, so it reaches the outbox through Ingest, which gains these pass-through operations then (the IDesign call rules). (Changed at T016: Ingest sends through the `LinkSlot` instead, and Core Link calls Ingest only for what the core sends; see DRIFT-001-23.)
  - **A carry-forward to CP-08b (iteration 002):** the contract says an event's `message_id` is its `event_id`, but `append` always makes a new UUID, and `message_id` is unique. Events need `append` to take the id they already have, and a repeat of the same event must be handled as a duplicate, not reported as `unavailable`.
- **Requirement citation**: tasks.md T014; `contracts/connector-link.md` "Frames" and "Device inventory and state"; data-model.md "Other stored state" and "Delivery rules" 2; spec FR-006 and FR-042; research R21 and PT-30; implementation-rules.yml `code-rule.robustness-state-boundaries`, `code-rule.concurrency-over-locks` and `code-rule.idiomatic-error-handling`.
- **Resolution**: implementation choices, recorded for the co-review. The contract row gains one trigger, which adds a send of an existing message and changes no field. Cost: 0 SP and $0.
- **Class closure**: 28 tests run in the suite: the store's on the fake clock and over a real file across a restart, and Ingest's over the simulated home and a real outbox. A deliberate break of eight parts was caught:
  - the store: a resend one moment late, newest first, a counter that is not saved, a reconnect that sends nothing again, and an ack that does not clear;
  - Ingest: a `device_state` that carries only the change, a read that drops the changes made during it, and an alarm-mode change that is ignored.

### DRIFT-001-20: the CP-08a co-review also reviewed T012 and T013, and found two Ring Adapter faults in how calls end

- **Detected**: 2026-11-07, implement, in the codex co-review round for checkpoint `cp-08a-outbox-ingest-review` (`run-20261106-234102754-7edcd9ba`, 9 minutes, round 1 of 4 after the reset)
- **Kind**: review scope versus the owner's plan, and two code faults found by the review. No spec change
- **Observed**:
  - **Scope.** The owner typed `approved for allowance reset` to review T014 and the migration-runner change now. Specrew measures a round from the last signed-off tree (T011), so the round reviewed T012, T013, T014 and the runner change together. CP-07 (T013) has therefore had its co-review, and the round after T028 no longer needs to carry it (this replaces the owner's 2026-11-06 fold in DRIFT-001-18). The reset cost $0, and Specrew counted the reset approval as the round approval.
  - **Findings.** Codex found nothing in T012, T014 or the runner change. Its two findings are both in `ring-api-adapter.ts`, and both were confirmed by reading the code. Specrew demoted both from major to minor, because neither stated a concrete failure scenario, so neither blocks sign-off.
    1. **Calls given up on kept reaching Ring.** At the 30 s deadline, or on the caller's abort, the adapter rejected the call and the gate let the next call start. ring-client-api, which cannot be cancelled, kept retrying the abandoned call every 5 s (DRIFT-001-18). Each call that timed out therefore left one more retry loop, and once the circuit was open, each minute's probe added another. DRIFT-001-18's "only a few such calls can retry at once" was wrong. For example, an hour of Ring answering 504 would end with about 65 loops, roughly 13 requests a second (derived). That goes against FR-026's single limiter and FR-042's backoff.
    2. **A lost session could be undone.** The lost-session check ran before a call queued at the gate. A call that had queued before another call lost the session still reached Ring when its turn came. Its success set the status to `ok`, and a timeout set it to `unavailable`. Either way, calls went on reaching Ring with a refused sign-in. This was a check-then-act across an await, which `code-rule.concurrency-over-locks` rules out.
  - **The fixes** (owner's choice, 2026-11-07: fix now, then one more round):
    1. At most one ring-client-api call runs at a time, counting one the adapter gave up on. A new call waits for the last library call to end. Its own deadline and the caller's signal cover that wait. While it waits, it never starts a second library call. A call given up on while it waits never reaches Ring, and it reports "Ring has not yet answered an earlier call", which is `ring_unavailable`. During an outage, only the one abandoned call's retries reach Ring.
    2. The lost check runs again in the same turn as the library call starts, so a queued call is refused as `session_lost` without reaching Ring. A second guard makes `lost` final where the status is set. No current path can reach that guard, because of fix 2 and one call at a time, so no test can catch its removal.
- **Requirement citation**: spec FR-026 and FR-042; research.md R25; implementation-rules.yml `code-rule.concurrency-over-locks`; DRIFT-001-18.
- **Resolution**: fixed on 2026-11-07, each fix after a test that failed on the old code. Round 2 reviewed the fixes and found no fault in them, and review sign-off completed (below). Its one new finding was fixed as a follow-up. Cost: 0 SP and $0. Codex time: 17 minutes over 2 rounds.
- **Class closure**: 5 new adapter tests run in the suite:
  - an outage of 8 calls, with probes, makes 1 Ring call (it made 8 before the fix);
  - a call waits for an earlier call given up on at the deadline;
  - a call waits for an earlier call the caller aborted;
  - a call aborted before its turn makes no Ring call;
  - a lost session stays lost for a queued call.

  A deliberate break of three parts was caught: not waiting for the earlier call, no lost check at the call's start, and a call given up on while waiting still calling Ring.
- **Round 2** (`run-20261107-001546242-41b0ecfa`, 8 minutes, round 2 of 4; Specrew's total is 17 minutes over 2 rounds) found nothing wrong with the two fixes. It found 1 new finding, which fix 1 introduced, and it was confirmed by reading the code. Specrew demoted it to minor.
  - **The finding.** The gate books the 1 s spacing when a call's turn begins. Fix 1 then makes the call wait for an abandoned call before it reaches Ring, so the booked second can pass during the wait. In Codex's example, a call reaches Ring at t=35 while its spacing ended at t=33. If it answers quickly, the next call goes at once: a burst during recovery.
  - The owner typed `stop the review here`. Review sign-off completed on 2026-11-07, on exactly the tree round 2 reviewed (1d172a2). The finding was then fixed as a follow-up, as the owner had agreed before round 2.
  - **The fix.** The gate gains `markCallStarted`, which books the spacing again from now. The adapter calls it at the moment a library call really starts. Two tests failed on the old code and pass now: one on the gate, and one on the adapter that follows Codex's example. A deliberate break, with the call removed, was caught. It is reviewed in the next co-review round.

### DRIFT-001-21: an external review found that a read reported cached camera data as fresh

- **Detected**: 2026-11-07, implement. An external reviewer the owner engaged reviewed commit 1d172a2 and ran the checks independently: 563 tests passed, 49 skipped, and coverage was 95.04% of lines and 94.10% of branches. The owner pasted the report into the session.
- **Kind**: a code fault at the Ring boundary, which the tests and both co-review rounds missed, plus two points carried forward. No spec change
- **Observed**:
  - **Cached cameras.** ring-client-api builds its locations once (`getLocations` caches them for the life of the process), and builds their cameras from one call to Ring at that first read. A camera's data changes only through the library's camera polling, and the adapter keeps that off (FR-026, DRIFT-001-18). So every later device read mapped the first read's battery and online state, and Ingest stamped it with a new `as_of` and `state_version`. The reviewer reproduced it offline with the library's own caching: a camera that went to 5% and offline still read 60% and online, marked as fresh. This was confirmed in the library's code (`api.js`: `getLocations`, `listenForDeviceUpdates`). The fake Ring client did not cache that way, so the tests could not see it.
  - **The fix.** On each device read for a location that has cameras, the adapter fetches the account's devices through the gate (one call, `fetchRingDevices`). It then refreshes each camera from that data with the library's own `updateData`, exactly as the library's polling would, before mapping it. A camera Ring no longer lists is left out, not reported from the old copy. A location without cameras makes no extra call. The narrow client types gained `fetchRingDevices` and `updateData`, and the compiler checks that the real `RingApi` still fits them. The mapping reads a camera's fields only (`RingClientCameraFields`).
  - **The fake Ring client now caches as the library does.** It returns the same location objects every time. Its cameras keep their first data until `updateData` replaces it, and `upstreamCameras` models Ring's current answer.
  - **Cost:** $0, and one extra Ring call per location with cameras on each inventory read. Inventory reads happen at session start and on `inventory_request` (derived).
  - **Limits that stay:**
    - Between reads, camera changes arrive only with push (iteration 002).
    - The library keeps its location list from the first read, so a camera or location added or renamed in Ring after the connector starts appears only after a restart. **Carry-forward to the pilot:** check this on the owner's home.
  - **Carry-forwards:**
    - **The `ip` advisory** (GHSA-2p57-rm9w-gvfp, high). It reaches the bridge through werift and ring-client-api: npm lists 3 high entries for 1 advisory. It is already an accepted exception in `scripts/audit-exceptions.json`, until ring-client-api ships werift 0.25. Before live media is enabled, recheck whether the bridge can reach it.
    - **CI's build step builds nothing yet.** The workflow runs `npm run build --if-present`, and there is no build script. It must become a real build check with T027, which adds the Host and `bridge/Dockerfile`.
- **Requirement citation**: spec FR-002 and FR-026; tasks.md T013 and T027; research.md R25; implementation-rules.yml `code-rule.anti-corruption-layers`; DRIFT-001-18.
- **Resolution**: fixed on 2026-11-07, after two tests that failed on the old code. It is reviewed in the next co-review round. Cost: 0 SP and $0.
- **Class closure**: the fake now models the library's caching, so a read that trusts the cached copy fails a test. A deliberate break of three parts was caught: a camera that is not refreshed, a camera Ring no longer lists that is kept, and a refresh call for a location without cameras.

### DRIFT-001-22: T015 builds the Link transport as a pipe only, and settles its wire format and timings

- **Detected**: 2026-11-07, implement, while doing T015
- **Kind**: details the records leave open, and a split between two records, versus the code. No spec change
- **Observed**:
  - **The scope follows the tasks, not X2's sketch.** component-design.md's X2 drawing has the transport owning the hello at N or N-1, the signed challenge and reconnect. T016 and T017 give those to Core Link and Connector Link, and T015 lists only frames, the version, the order, ping and the in-memory pair. The code follows the tasks. The transport supplies:
    - `isAcceptedLinkVersion` (N or N-1) for Connector Link's version check;
    - `dialLink`, which returns `connected` or `unreachable` so Core Link can reconnect with its own backoff;
    - `LinkServer.handleUpgrade`, for the Host's HTTPS server to pass the link's upgrade requests to.
  - **Frames** [P: the names and the wire format, which contract "Transport and identity" leaves unrecorded]:
    - A message is a text frame holding `{"type", "body"}`.
    - A chunk is a binary frame: a 4-byte header length, `{"type", "header"}`, then the bytes.
    - A type name is lower case, digits and `_`, at most 64 characters.
    - The transport checks only this envelope, with zod. The body and header are the receiver's to declare and parse (CD4), and a chunk's header carries no bridge names.
  - **A refused frame keeps nothing of itself.** A frame that is not JSON, breaks the envelope, or is over the limit closes the link as `malformed_frame`, sends close code 1007, and keeps no cause and no excerpt, because frames carry names from Ring (FR-034). A test sends a broken frame with a Hebrew device name and checks that it appears in neither the close nor the log.
  - **Limits** (SC2, raised in planning the task):
    - Frames are capped at 1 MiB (`MAX_FRAME_BYTES`, derived) on both ends, through ws's `maxPayload`. ws's default is 100 MiB, and the core accepts frames before the challenge is verified. A test checks that ws itself refuses an oversized frame (close code 1009) before reading it whole.
    - Compression (`perMessageDeflate`) is off on both ends. A test checks that the dialer does not offer it.
  - **Sending order** (CD X2): every waiting message goes before every waiting chunk, each kind in order, one frame written at a time. A chunk already being written finishes first, so priority works one frame at a time; that is why iteration 003 sets a small chunk size (PT-08). `send` resolves `sent` or `closed`, and frames still waiting when the link closes resolve `closed`, never left pending.
  - **Liveness** [P numbers]:
    - Each end pings every 10 s (`PING_INTERVAL_MS`), and any frame or pong counts as hearing the other end. 20 s of silence (`SILENCE_LIMIT_MS`) ends the link as `no_pong`, so a half-open connection is noticed within 30 s.
    - This sits inside the core's 2-minute home-offline window and leaves time for Core Link's backoff (capped at 30 s) toward the 60 s reconnect goal (FR-042).
    - A dial gives up after 10 s (`DIAL_TIMEOUT_MS`). All timers run on the injected Clock.
  - **How a link ends**: `closed_here`, `closed_by_peer` (with the other end's reason, untrusted text, at most 123 bytes), `no_pong`, `malformed_frame` or `connection_lost`.
  - **Errors.** Every outcome is a value: `send`, `dialLink` and the close cause. Misuse (a bad type name, an oversized frame, a long close reason, a URL that is not allowed) is a `RangeError`. So the transport has no error class of its own. A listener that throws is logged once as `link_listener_failed`, with the frame's type only, and the other listeners still hear the frame.
  - **WSS only (SC2).** `dialLink` dials `wss:`, which always checks the certificate, and has no option to turn that off. Plain `ws:` is allowed only to this machine (`localhost`, `127.0.0.1`, `[::1]`), for tests.
    - **Carry-forward to T017**, whose test says "the real WSS on localhost": a TLS test needs a certificate. That means either a new dev dependency to make one, or a private key in the repository, which gitleaks would flag. Until the owner decides, the link tests run `ws:` on localhost, and the TLS path is covered only by a `wss:` dial that is refused. **The owner chose (a) on 2026-11-07:** T017's test makes a throwaway certificate with the `openssl` command at test time ($0, no new package), and is skipped with a visible note where `openssl` is missing.
  - **CI check for "no Ring or bridge words"** (the workshop's CD4 check, which did not exist yet). Two dependency rules were added: `ws-only-in-link-transport`, and `link-transport-knows-no-bridge-components` (nothing from the core, the connector, the Host or the Public Contract). A deliberate break of each was caught.
  - **Found by the tests before commit:** a Node `Buffer`'s `slice` shares memory, so a received chunk's bytes were not the receiver's own. They are now copied.
  - **Carry-forwards to T016 and T017:**
    - Core Link dials with `dialLink` and reconnects on `unreachable` or any close, with its own 1 to 30 s jittered backoff.
    - Connector Link takes links from a `LinkServer` that the Host wires to its HTTPS server's upgrade event for the link's path, and checks the hello with `isAcceptedLinkVersion`.
    - The close reasons ("version not accepted", "key not enrolled", "challenge failed") are theirs, at most 123 bytes.
    - The connector's configured core URL is `wss:`; `dialLink` refuses anything else.
- **Requirement citation**: tasks.md T015, T016 and T017; `contracts/connector-link.md` "Transport and identity" and "Ordering, priority and guarantees"; component-design.md X2; spec FR-042, FR-046 and FR-034; research.md R21; implementation-rules.yml `code-rule.validation-boundaries`, `code-rule.concurrency-over-locks`, `code-rule.polymorphism-mechanism` (one interface, two carriers) and the `ws` and `@types/ws` dependency entries.
- **Resolution**: implementation choices, recorded for the CP-09 co-review. The wire format is the transport's to choose (CD X2). Cost: 0 SP and $0.
- **Class closure**: 38 tests run in the suite: the codec, the order with writes that really wait, the in-memory pair and the shared endpoint, and real sockets on localhost. A deliberate break of nine parts was caught: chunks before messages, silence that never ends the link, an envelope that is not checked, compression on, no payload cap, chunk bytes shared, a pair's close that overtakes its frames, a listener's failure that is not contained, and a refused frame that does not close the link.

### DRIFT-001-23: T016 has Ingest send through a shared link slot, declares the link messages where each receiver lives, and names the key by its hash

- **Detected**: 2026-11-07, implement, while doing T016
- **Kind**: details the records leave open, one change to DRIFT-001-19's carry-forward, and one amendment to CD4's "one public entry file", which the owner confirmed. No spec change
- **Observed**:
  - **Who sends what.** DRIFT-001-19 planned for Core Link to send through pass-throughs on Ingest. That doesn't work: the Home Scheduler is a client and cannot call Core Link, another client (the IDesign call rules), and the component map gives Ingest "normalize, outbox, send". So:
    - **Core Link** (a client) owns the connection.
      - It dials through a `dial` seam: the Link transport's `dialLink` in production.
      - It sends `enroll` or `hello`, signs the `challenge`, and on `hello_ok` puts the link in the `LinkSlot`.
      - It hands `ack` and `inventory_request` to Ingest, and dials again whenever the link is down.
    - **Ingest** (a manager) sends on the link in the slot.
      - `sessionOpened` makes every unacked message due again, and owes a fresh inventory.
      - A message written while a session is open goes out at once.
      - `sendDue` and `sendHeartbeat` are the ticks' work.
    - **The Home Scheduler** (a client) calls `sendDue` every 10 s and `sendHeartbeat` every 15 s. A tick starts when the last one ends, and a tick's unexpected failure is logged once (`home_tick_failed`).
    - **`LinkSlot`** is a bare holder in the Link transport: put, current, and clear only if the link is the same one. Only Core Link decides when a link may carry messages, because CD X2 warns against logic in the transport. A test checks that nothing from the outbox goes out before `hello_ok`.
  - **Order at session open.** Ingest's outbox work runs one step at a time. From a session's start until its "everything is due again" step is done, Ingest sends nothing, so a send step queued just before the session cannot overtake the older unacked messages.
    - A test queues a send just before a session starts, and checks that the older unacked message goes first.
    - Before this fix, the newer message went first. This was in the first version (c5322ff), found by a second look after it was pushed. Latest-wins kept the data right, but the order the contract promises was not kept.
  - **Link messages: the receiver declares them, in a narrow second entry** (CD4, amended).
    - Core Link declares what the core sends: `challenge`, `hello_ok`, `enrolled`, `inventory_request` and `ack`, and the close reasons. They are in `connector/clients/core-link/messages/index.ts`.
    - Connector Link declares what the home sends: `hello`, `challenge_response`, `enroll`, `inventory`, `device_state` and `heartbeat`. They are in `core/clients/connector-link/messages/index.ts`. That folder is made now, ahead of T017, as DRIFT-001-14 did for the Ring port.
    - Each `messages/index.ts` imports only zod and the Link transport.
    - **Why a second entry:** without it, the home would reach the core's components, and their libraries, through Connector Link's own entry file. `connector-reaches-no-cloud-libraries` forbids that, and type-only imports count (`tsPreCompilationDeps`).
    - **The amendment to CD4:** a component may have a second entry, `messages/index.ts`, holding only the link messages it receives. `component-only-through-index` now allows exactly that.
      - Before, the rule allowed any nested `index.ts`. A deliberate break showed the loophole, and it is now closed.
      - **The owner confirmed this on 2026-11-07 (choice a).** The alternative was a separate schemas module for the link, as the Public Contract is for agents.
  - **Names new at implement** [P]:
    - **`key_id`** is the first 16 base64url characters of the public key's SHA-256 (`signingKeyId`, in the security utility).
      - The home keeps no enrollment state. It says `hello` with that id, and enrolls only after the core closes with `key_not_enrolled`.
      - Core Link checks that `enrolled` names its own id, and closes with `key_mismatch` if not.
      - T017 must name keys with the same helper.
    - **The enrollment code** is an input (`identity.enrollmentCode`), not derived from the key, because T028 makes it one-time.
    - **Close reasons from the core**, sent exactly:
      - `key_not_enrolled`: enroll next time;
      - `key_revoked`: stop dialing until there is a new key, and log it once;
      - `version_not_accepted`: dial again after 30 s;
      - `challenge_failed`: dial again.
    - **The home's own close reasons:** `handshake_timeout`, `key_mismatch`, `version_mismatch` and `connector_stopping`.
    - **The heartbeat:** `ring_session`, `push` (`off` until 002), `outbox_depth` (`null` when the outbox cannot be read), `last_ring_event_at` (`null` until 002), `error_counts` (since start, by code) and `as_of`.
    - **On the wire**, an outbox message's body is its stored body plus `message_id`.
  - **Timings** [P]:
    - The reconnect backoff is 1 s, doubling to 30 s, with full jitter, and never under 1 s. It starts over only after `hello_ok`, so a core that accepts and then closes at once is not dialed every second.
    - From `hello` to `hello_ok`, the core gets 30 s (`HANDSHAKE_TIMEOUT_MS`).
    - While enrolling, the home sets no limit, because the owner may take up to the pending request's 10 minutes (PT-32).
  - **Handled once, then moved past:**
    - A core message that is not one of the five, or arrives out of turn, is logged with its type only and ignored.
    - An outbox message too large for one frame is logged once by its `message_id`, cleared, and counted (`message_too_large`).
      - For a `device_state`, the next inventory carries its state.
      - An inventory that large cannot be sent at all. At the 1 MiB cap, that means a home of several thousand devices (derived), far beyond the owner's, so it is logged, not split.
    - An unexpected failure of Core Link's own loop is logged once (`core_link_failed`) and ends the loop. An example is a URL that `dialLink` refuses. Without this, Node would end the process with nothing in the log.
    - Stopping logs no error for Ingest work it cuts short.
    - The logger gains a `message_id` field, an identifier.
  - **No secret on a frame.** A test runs enrollment, a session, the inventory and a heartbeat. It checks that the private key appears on no frame in any encoding: the DER and the raw seed, each as base64, base64url and hex. Only the public key, its id and the enrollment code go out (AC B5, SC4).
  - **Carry-forwards to T017:**
    - name keys with `signingKeyId`, check the signature with `verifyChallenge`, and send the close reasons above exactly;
    - put a time limit on a link that has not finished its hello, leaving room for an `enroll` that waits for the owner, up to PT-32's 10 minutes;
    - Connector Link's `onLink` handler must contain its own failures, because one thrown inside ws's upgrade callback ends the core process;
    - the TLS test uses a throwaway certificate made with `openssl` (the owner's choice a).
  - **Carry-forwards to T027 and T028:**
    - The Host wires `dial` to `dialLink` with the configured `wss:` core URL, and takes `connectorVersion` from the package.
    - The config refuses a URL that is not `wss:` when it loads.
    - The Host's readiness shows the link down after `core_link_failed`.
    - The enrollment code's home store and its log line belong to T028. Logging the code needs a new log field, because the logger writes only declared fields.
- **Requirement citation**: tasks.md T016 and T017; `contracts/connector-link.md` "Frames", "Session start", "Heartbeat and home offline", "Enrollment and re-enrollment" and "Ordering, priority and guarantees"; data-model.md "Home part enrollment"; component-design.md CD4, X2 and the component map v3; spec FR-005, FR-032 and FR-042; implementation-rules.yml `code-rule.careful-retries`, `code-rule.concurrency-over-locks` and `code-rule.idiomatic-error-handling`.
- **Resolution**: implementation choices, recorded for the CP-09 co-review. The owner confirmed the CD4 amendment on 2026-11-07. Cost: 0 SP and $0.
- **Class closure**: 24 new tests run in the suite. Core Link's tests run over the in-memory pair, with the test playing the core, against the simulated home and a real outbox. A deliberate break of fourteen parts was caught:
  - a signature over the wrong text;
  - no "everything is due again" at session open;
  - a backoff that does not grow;
  - a revoked key that keeps dialing;
  - a version refusal that is not slowed;
  - no handshake timeout;
  - an enrollment that is never cleared;
  - an `enrolled` id that is not checked;
  - an oversized message that is not contained;
  - out-of-turn messages that are acted on;
  - a link put in the slot before `hello_ok`;
  - a send while a session's "everything is due again" step is still pending;
  - an unobserved failure of Core Link's loop;
  - an error logged for work cut short by stopping.

  The narrowed dependency rule caught a nested `index.ts` that is not `messages/`.

### DRIFT-001-24: Specrew's session start-up rewrote state.md's header to "not started", and named T017 as next although it waits on T022

- **Detected**: 2026-11-07, implement, when the session resumed
- **Kind**: tooling output versus the records. No spec change
- **Observed**:
  - At 03:33:48Z, the session start-up rewrote the header of `iterations/001/state.md`:
    - `Iteration Status: not-started`, `Last Completed Task: (none)`, and the 19 checkpoints as remaining;
    - a managed block saying "Execution has not started yet".

    The body below the header was intact, and all work was committed and pushed at 49ca21c.
  - It also created `iterations/001/tasks-progress.yml`, with all 19 checkpoints `pending`.
  - The start-up summary then said both "16 of 36 done", from tasks.md, and "Start CP-01", from the new file.
  - It named T017 as the next task, by number. tasks.md's dependency list says T017 needs T022, because enrolled keys live in Settings, and T022 is open. I repeated that to the owner, and then corrected it.
  - Governance validation still passed, with 6 soft warnings. No documented format or command for `tasks-progress.yml` was found. The governed scripts are invoked, never read, so the cause is not investigated here.
- **Requirement citation**: tasks.md (T017 depends on T022); the launch contract's rule that a surprising result from the governed machinery is reported, not investigated.
- **Resolution**: on the owner's `restore` (2026-11-07), state.md was restored from 49ca21c. `tasks-progress.yml` stays uncommitted and unfilled, because its format is not documented. Work goes on with T022, then T017. Cost: 0 SP and $0.
- **Class closure**: NONE - the start-up is Specrew's machinery, not this repository's code. If a later start-up rewrites state.md again, it is restored and reported to the owner. The next task is read from tasks.md's dependency list, not from the start-up summary.

### DRIFT-001-25: T022 builds the core's Settings, Grants and Secrets, adds one column, and settles the time form of the accessors' DTOs

- **Detected**: 2026-11-07, implement, while doing T022
- **Kind**: details the records leave open, one column that data-model.md did not list, and a choice the access README left to the first accessor. No spec change
- **Observed**:
  - **Migration 2** adds `connector.enrollment_code`, a nullable column [P name].
    - The admin page must show a pending request's code, for the owner to compare with the code the connector printed (SC2). The table had no column for it.
    - It is additive, so code N-1 still runs on the new schema (DS5). data-model.md's "Home part enrollment" now lists it. An approval clears it.
    - The migrations' dialect-parity test now reads `ALTER TABLE ... ADD` as well.
  - **The time form in the accessors' DTOs**, which `bridge/src/core/access/README.md` left "to settle with the first accessor": UTC milliseconds, as stored. The caller that builds the contract's form turns them into ISO 8601 text. The README now says so.
  - **Settings** (`bridge/src/core/access/settings/`, `SettingsStore`):
    - **The agent listing** (PT-18):
      - `seedAgents` makes the listing match deployment configuration, in one transaction.
      - An agent still listed keeps the owner's revocation and its last-seen time.
      - An agent no longer configured is removed and reported, so a manager can end its grants through Grants. Settings cannot call Grants.
      - Each scope is stored once, in the order `read`, `media`, `control`. The listing stores all three; "only `read` in iteration 001" is the Issuer's rule (T023).
    - **Enrollment** (SC2, PT-32, FR-032):
      - `requestEnrollment` takes the public key and the code, and names the key with `signingKeyId`. The request waits 10 minutes and replaces any other waiting request. A key that is active or revoked is reported, and nothing changes. A revoked key is never trusted again.
      - `approveEnrollment(keyId)` activates the waiting request with one conditional update, so an expired or replaced request comes back `not_pending`. In the same transaction it revokes every older key, and returns their ids, so the caller can close an older key's open link.
      - `connectorKey(keyId)` gives Connector Link `active` with the public key, `revoked`, or `not_enrolled` (no row, or a pending one).
    - **The battery threshold** is the owner's value, or the Config utility's `batteryThresholdPct` until one is set. There is no second default.
    - **Not built**, because no iteration 001 task needs it: revoking one agent, recording an agent's last-seen time, and writing the connector's version. The health snapshot carries the version.
  - **Grants** (`bridge/src/core/access/grants/`, `GrantsStore`): the six storage operations of oidc-provider's adapter, by model and id. Grants imports nothing from oidc-provider. The Issuer wraps the operations in the adapter class, and answers `findByUserCode` with nothing, because the device flow is off.
    - **Bearer ids are kept as hashes (SC4).** Some models' ids are a token, a code or a request handle that is found by id alone:
      - access, refresh and client-credentials tokens;
      - authorization codes;
      - registration and initial-access tokens;
      - pushed and CIBA requests.

      For those, the id is stored as its SHA-256, and the payload's `jti`, which repeats the id, is not stored. `find` gives the `jti` back from the id it was asked for, because oidc-provider uses it to consume and destroy the record.
    - **Kept as given:** clients, grants, sessions and interactions. oidc-provider finds a session by its `uid`, which leaves no id to give back, and an interaction's record names its session's id anyway.
      - **Residual risk:** a copy of the database holds live session ids for their lifetime. Using one still needs a listed client's redirect URI to receive a code.
    - **Expiry.** A record whose time is up is never found, as with oidc-provider's memory adapter. `expiresIn` is in seconds; the column is in milliseconds.
    - **`consume` is one statement** (`json_set` on SQLite, `JSON_MODIFY` on SQL Server), so the check for a reused refresh token never reads and then writes.
    - **`revokeByGrantId` deletes by model and grant.** oidc-provider calls it once per model, and removes the grant itself only when it means to.
    - Expired records are not deleted yet.
  - **Secrets** (`bridge/src/core/access/secrets/`): the `CoreSecrets` seam, with two implementations. A missing secret, or one set to nothing, is a value (`missing`), so `/readyz` can name it (PT-03).
    - **Key Vault** (`KeyVaultSecrets`, mode H) works over a narrow client type declared here.
      - Only `key-vault-client.live.ts` imports `@azure/identity` and `@azure/keyvault-secrets`, and only the core's wiring will import that file. So mode A and the connector never reach Azure.
      - An answer of 404 is `missing`. 401, 403 and 409 (a deleted secret) are `refused`. Anything else is `unavailable`.
      - Key Vault's own error is not kept as the cause, because a failed write's request holds the value. The message names only the HTTP status or the network error's code.
    - **The sealed file** (`SealedFileSecrets`, mode A):
      - AES-256-GCM under a key the Host supplies (T027), with a new seal purpose, `core-secrets-file`, so the home Secrets File and this file never open as each other;
      - writes go one at a time, and each replaces the file in one step;
      - a file that does not open is never overwritten;
      - a secret written by a newer release is kept.
  - **Moved first, in its own commit (59490b6):** `Secret` and the one-step file write, from the home Secrets File into the security utility. A core accessor must not reach into a connector component.
  - **New in the security utility:** `parsePublicSigningKey`. It accepts only an Ed25519 key's canonical base64url spelling. Settings uses it to read a stored key back, and T017 will use it to parse `enroll`. Node does not check that the 32 bytes are a point on the curve. A bogus key fails the challenge anyway.
  - **Errors.**
    - Settings and Grants each throw one error class, of kind `unavailable` or `failed`. `unavailable` means the store is down, and managers answer `BRIDGE_UNAVAILABLE`. `failed` means a statement was refused, or a row holds what the store did not write.
    - A row that does not parse is reported with no cause, because the cause could quote the row.
    - Misuse, such as a value too long for its column, is a `RangeError` on both dialects alike.
  - **Carry-forwards:**
    - **T017:**
      - cap `enroll.code` at 64 characters in `home-messages.ts` (`MAX_ENROLLMENT_CODE_LENGTH`);
      - parse `public_key` with `parsePublicSigningKey`;
      - when an approval revokes an older key, close that key's open link.
    - **T023:**
      - wrap Grants in oidc-provider's adapter;
      - check the listing, including `revokedAt`, at each use;
      - grant `read` only;
      - keep DCR clients to the `none` auth method, because a client secret would be stored as given.
    - **T027:**
      - the agents' seed in the Config utility, and `seedAgents` at start, with the removed agents' grants ended;
      - the mode A secrets file's path and key;
      - wiring `createKeyVaultSecretClient`.
    - **A later task with a schedule:** delete expired Grants records (DS retention).
- **Requirement citation**: tasks.md T022, T017, T023 and T029; data-model.md "Agent client and grant", "Home part enrollment" and "Configuration"; research.md PT-03, PT-04, PT-11, PT-18, PT-32 and R12; spec FR-029, FR-030 and FR-032; SC2 and SC4; implementation-rules.yml `code-rule.idiomatic-error-handling`, `code-rule.concurrency-over-locks`, `code-rule.dependency-injection` and the `@azure/identity` and `@azure/keyvault-secrets` dependency entries.
- **Resolution**: implementation choices, recorded for the CP-16 co-review. Cost: 0 SP and $0 to build.
  - Running cost in mode H: Key Vault charges $0.0396 per 10,000 operations (R12, 2026-10-26).
  - Reading the signing keys every 10 minutes (PT-04) is about 4,320 reads a month, under 2 cents (derived).
- **Class closure**: 75 new tests run in the suite. Settings and Grants run on SQLite and on SQL Server, and were run on a local SQL Server before the push. A deliberate break of 22 parts was caught:
  - Settings:
    - an approval that revokes no older key;
    - a waiting request that never expires;
    - an expired request that can be approved;
    - a seed that keeps agents no longer configured;
    - a seed that clears the owner's revocation;
    - a new request that does not replace the waiting one;
    - a pending key counted as enrolled;
    - a hard-coded battery default;
    - a revoked key that may ask again.
  - Grants:
    - bearer ids stored as given;
    - the `jti` stored;
    - expiry ignored;
    - revoking by grant across models;
    - `consumed` in milliseconds;
    - the `jti` not given back;
    - a hashed model found by `uid`.
  - Secrets:
    - Key Vault's 404 as an error;
    - Key Vault's error kept as the cause;
    - sealed writes not one at a time;
    - a write over a file that does not open;
    - the home file's seal purpose.
  - Security: a public key accepted in any spelling.

### DRIFT-001-26: T017 builds Connector Link, with a minimal Admin manager and Event's intake ahead of their tasks; the hand-over to Event is an awaited call, and approvals are found by polling

- **Detected**: 2026-11-07, implement, while doing T017
- **Kind**: details the records leave open, one deviation from the component map's "queued" hand-over, and two parts built ahead of their tasks. No spec change
- **Observed**:
  - **Connector Link** (`bridge/src/core/clients/connector-link/`):
    - The Host hands it each link the `LinkServer` accepts. `accept` never throws: a failure inside ws's upgrade callback would end the core process, so it is logged once and the link is closed.
    - **Session start** (SC2):
      - `hello` at version 1, checked with `isAcceptedLinkVersion` (N or N-1). The N-1 test comes with the first version bump (PT-07);
      - the key checked through Admin, then a fresh nonce, and the signature checked with `verifyChallenge`;
      - `hello_ok` repeats the hello's version, because the home checks it for equality.
    - **Close reasons.**
      - The home acts on Core Link's four reasons, which are sent exactly. `key_revoked` is sent only when Settings reports the key revoked, because it stops the home for good.
      - The core's own reasons make the home dial again with its usual backoff: `handshake_timeout`, `message_refused`, `session_replaced`, `enrollment_expired`, `enrollment_replaced`, `too_many_links`, `core_unavailable`, `core_stopping` and `core_error`.
    - **One step at a time per link.** Frames and timers queue on one chain, so an `ack` always follows its commit, and messages reach Event in the order the home sent them (L2).
    - **One state value per phase** (L3): `first`, `challenged`, `enrolling`, `open` and `closed`, each holding only what it needs. A challenge response is checked only against the nonce this link sent, and the nonce is used once.
    - **A message out of turn.** Before a session opens, any other message, or one that does not parse, closes the link as `message_refused`. In an open session it is logged by its type and left unacked, so the home sends it again, and the link stays.
    - **Limits** [P]:
      - 30 s from a link's start to `hello_ok`. The home's own limit for the same span is also 30 s;
      - at most 8 links that have not proved a key;
      - one open session per key: a newer one replaces the older (`session_replaced`);
      - one link waiting for the owner: a newer `enroll` replaces the older (`enrollment_replaced`).
    - **Failures**, each logged once:
      - a key that cannot be checked closes the link as `core_unavailable`;
      - Event's failure leaves the message unacked (`connector_link_intake_failed`, by `message_id`);
      - an unexpected failure of a step closes the link as `core_error`.
    - **Not logged: the key id.** The logger's identifier check refuses `_`, which base64url ids often contain. The session id, a UUID, is the correlation id on every line (OR2).
  - **Admin** (`bridge/src/core/managers/admin/`) is built ahead of T029, with only the connector's part: the key check and the enroll request, over Settings, with its own error class. The component map says Connector Link checks the hello "through Admin", and clients call managers. T029 adds approval.
  - **Event's intake** (`bridge/src/core/managers/event/`) is declared ahead of T018, which implements it: `homeSessionOpened`, `inventory`, `deviceState` and `heartbeat`, in Event's own DTOs. They keep the contract's names, with times in milliseconds, and Connector Link maps the link's messages to them.
    - **Deviation:** the component map draws this hand-over as queued. It is an awaited call, because the `ack` waits for Event's commit (AC B10), and Pub/Sub tells a publisher nothing. Event may still queue its work inside.
    - The interface exists ahead of its one implementation, Event's (T018). The tests use a recorder in its place.
  - **Approvals and revocations are found by polling**, not by a message from the admin page. T029 and Connector Link are both clients, clients cannot call clients, and Pub/Sub is for calls between managers.
    - A link waiting for the owner checks every 2 s (`ENROLLMENT_POLL_MS` [P]) until the request expires at 10 minutes. On approval it sends `enrolled` on the same link and expects `hello` there.
    - An open session checks its key again every 15 s (`KEY_RECHECK_MS` [P]). When the owner approves a newer key, the older key's link closes as `key_revoked` within 15 s. A check that fails keeps the session.
    - Polling also survives a core restart while an enrollment waits. The reads cost $0 more, because Azure SQL Basic is priced by DTU, not per read (derived).
    - **An expired wait** closes the link as `enrollment_expired`. The home keeps its enroll flag, so its next connection enrolls again and renews the 10 minutes; the owner sees the request again.
  - **Prep, in its own commit (042f941):**
    - Settings' entity DTOs take the records' names (`client_id`, `redirect_uris`, `key_id`, `public_key`, `enrollment_code` and the rest), as the Ring port's do. The access README states the rule. T023 has not used them yet.
    - The hello and enroll schemas now accept only the exact form the home sends, for the fields the core reads before a key is proved:
      - a 16-character key id and a 43-character public key;
      - a UUID session id;
      - a connector version of at most 64 characters;
      - a code of at most 64 characters, Settings' column size.

      This closes DRIFT-001-25's carry-forward to T017.
    - `dialLink` takes an optional set of trusted certificates, for a test's throwaway certificate. There is still no option to turn certificate checks off. The certificate is made with `openssl` at test time (the owner's choice a), and CI fails rather than skips without `openssl`.
  - **Carry-forwards:**
    - **T018:** Event implements `EventIntake`, committing before each call resolves. `homeSessionOpened` carries the connector's version, for "connector behind".
    - **T027:**
      - wire `ConnectorLink.accept` as the `LinkServer`'s `onLink`, for the link's path on the HTTPS server, and stop it before the store closes;
      - add a dependency rule that keeps Azure out of `host/all-in-one.ts`, as the connector's rule does, or soften DRIFT-001-25's wording. Its claim that mode A never reaches Azure is not enforced yet.
    - **T029:** approving a request through Admin. The waiting link learns of it within 2 s.
- **Requirement citation**: tasks.md T017, T018, T027 and T029; `contracts/connector-link.md` "Transport and identity", "Versioning", "Frames", "Session start", "Enrollment and re-enrollment" and "Ordering, priority and guarantees"; component-design.md CD4, X2 and the component map v3 (Connector Link, Admin, Event); spec FR-032, FR-042 and FR-046; SC2; implementation-rules.yml `code-rule.concurrency-over-locks`, `code-rule.strategy-state-over-repeated-conditionals` and `code-rule.idiomatic-error-handling`.
- **Resolution**: implementation choices and one documented deviation, recorded for the CP-09 co-review. Cost: 0 SP and $0.
- **Class closure**: 36 new tests run in the suite.
  - **Connector Link's own tests** run over the in-memory pair, with the test playing the home, against real Admin and Settings on SQLite.
  - **The version 1 contract test** runs both real ends, Core Link with Ingest, its outbox and the simulated home against Connector Link:
    - over the in-memory pair, with drops, delays past the resend time, and duplicates in front of the core;
    - over real WSS with TLS on localhost, with a duplicate and a delay past the resend time over the socket, where the home is back within 60 s of the core's return after 3 minutes away (added in a follow-up commit, before the review round).

  A deliberate break of 24 parts was caught:
  - an ack before the commit;
  - no signature check;
  - no version check;
  - a key that is not enrolled accepted;
  - a revoked key reported as not enrolled;
  - steps run side by side;
  - no handshake time limit;
  - a request that never expires;
  - no key recheck in an open session;
  - a failed recheck that closes the session;
  - a failed key check logged every time;
  - a refusal before the session opens that keeps the link;
  - an enroll key in any spelling;
  - an older session not replaced;
  - an older waiting link not replaced;
  - no cap on unproven links;
  - a failure that escapes `accept`;
  - `stop` leaving links open;
  - links accepted after `stop`;
  - times not turned into milliseconds;
  - any session id accepted;
  - an enrollment code of any length;
  - `dialLink` ignoring the trusted certificates;
  - a backoff cap that misses the 60 s goal.

  The first version of the 60 s test missed that last break: its core happened to return just before the home's next dial. Both 60 s tests now bring the core back just after a failed dial, the worst moment for the home, and the in-memory one catches it.

### DRIFT-001-27: CP-09's co-review round 3 found four real defects, two in Connector Link and two in Ingest; all four fixed test-first

- **Detected**: 2026-11-07, implement, by Codex co-review round 3 (run `run-20261107-142057378-515c9071`, checkpoint `cp-09-link-and-cp-16-accessors-review`, 13 minutes, $0)
- **Kind**: defects in code written at T016 and T017, found by review. No spec change
- **Observed**: Specrew demoted all four findings to notes, because none stated its failure in Specrew's form. Checked against the code, each was real. The owner chose to fix all four and run round 4.
  1. **A stranger's `enroll` ended an enrolled home's session** (T017).
     - After a home enrolled and opened its session on the same link, Connector Link still held that link as "the one waiting for the owner".
     - A later `enroll` from anyone, even with a key nobody approved, closed the home's working link as `enrollment_replaced`. Repeated, that kept the home offline.
     - **Fixed:** a newer request closes the older link only while that link still waits for the owner.
  2. **A device change the home could not queue stayed lost** (T016, Ingest).
     - If the outbox could not take a change (a full disk, or a lock that outlasts the Query layer's one retry), Ingest logged it, and the core kept the old state until another change, an `inventory_request` or a reconnect.
     - **Fixed:** such a failure makes a fresh inventory owed, so the next 10 s tick sends the device's state again, with no other change needed.
  3. **A link could make the core hold many frames in memory** (T017).
     - Every frame was queued before it was checked. While a `hello` or `enroll` waited on the database, a peer that had proved nothing could keep sending frames of up to 1 MiB, and all of them were kept.
     - **Fixed:**
       - Before a session opens, the home sends one message and waits for the core's answer, so a second message before that answer closes the link at once (`message_refused`), unqueued.
       - An open session may have at most 256 messages waiting for Event (`MAX_PENDING_MESSAGES` [P]); one more closes the link as `too_many_messages`, and the home sends them again from its durable outbox.
     - A frame stops counting once the core has answered it. Over the in-memory pair, which mode A uses, the home answers the challenge before the core's step has ended. The first version counted until the step ended, so it refused the challenge response; the both-ends contract tests caught that before commit.
     - A step that resumes after its link closed now stops there. This is defensive: no test can observe the difference.
  4. **The home could queue copies of its backlog in memory** (T016, Ingest).
     - Ingest read the whole due backlog and handed every message to the link without waiting for any write. The outbox stamped them as sent when they were taken, so after 10 s a slow link was handed copies of messages it had not written yet.
     - **Fixed:**
       - Ingest takes one message at a time and waits for its write, so the rest stays on disk;
       - after 100 messages it continues in a new step, behind the acks that arrived meanwhile;
       - the 10 s resend counts from the finished write, through a new Outbox Store operation, `markWritten`.
- **Requirement citation**: tasks.md T016 and T017; `contracts/connector-link.md` "Session start", "Enrollment and re-enrollment" and "Ordering, priority and guarantees"; spec FR-032 and FR-042; AC B10; SC2; implementation-rules.yml `code-rule.concurrency-over-locks`, `code-rule.robustness-state-boundaries` and `code-rule.careful-retries`.
- **Resolution**: fixed on 2026-11-07, test-first, for review in round 4 (the last before an allowance reset). Cost: 0 SP and $0.
- **Class closure**: 7 new tests, each failing on the old code. A deliberate break of nine parts was caught:
  - a stranger's `enroll` ending an enrolled home's session;
  - a second message before the answer, queued;
  - no cap on an open session's waiting messages;
  - the challenge not counted as the core's answer;
  - a change that was not queued, leaving no inventory owed;
  - the backlog sent without waiting for each write;
  - the resend counted from when a message was taken;
  - `markWritten` restarting nothing;
  - `markWritten` making a message never taken look sent.

### DRIFT-001-28: CP-09's co-review round 4 found two more real defects: concurrent enrollment requests on SQL Server, and timer handles the Home Scheduler never released

- **Detected**: 2026-11-07, implement, by Codex co-review round 4 (run `run-20261107-153636996-5e841879`, checkpoint `cp-09-link-and-cp-16-accessors-review`, 11 minutes, $0). The round 3 fixes passed.
- **Kind**: defects in code written at T022 and T016, found by review. No spec change
- **Observed**: Specrew marked both as notes, not blockers. Checked against the code, both were real. The round budget was spent (4 of 4). The owner typed `approved for allowance reset`, which Specrew also counts as the approval for the next round, and asked for all issues to be fixed and another round run.
  1. **Two enrollment requests at the same instant could both stay waiting, on SQL Server only** (T022).
     - Settings replaces the waiting request in one transaction. On SQL Server two transactions run side by side and are not serialized, so two `enroll` requests from different keys within the same few milliseconds could each find none waiting, and both insert.
     - The admin page would show only one, while the other could still be approved, although Connector Link had closed its link as replaced. SQLite was not affected: its Query layer runs one unit of work at a time.
     - **A miss of mine:** I saw this race when writing T022 and let it go without recording it.
     - A new test sends five requests at once. It failed on SQL Server before the fix, leaving more than one waiting row, which confirmed the race.
     - **Fixed:**
       - Migration 3 adds a unique index over the waiting rows (`connector_one_pending`, `WHERE status = 'pending'`) on both dialects. The database refuses a second waiting request.
       - Settings tries once more after losing that race. Being the newer request, it then replaces the winner, so "the newest request wins" (PT-32) still holds.
       - The migrations' dialect-parity test now reads a partial index's `WHERE`.
  2. **The Home Scheduler kept a timer handle for every tick it ever ran** (T016).
     - Each 10 s and 15 s tick added a cancellation handle that was released only when the connector stopped: about 14,400 a day (derived).
     - **Fixed:** the scheduler keeps only the current handle of each tick, so it holds two at any time.
- **Requirement citation**: tasks.md T016 and T022; research.md PT-32; data-model.md "Home part enrollment"; spec FR-032; implementation-rules.yml `code-rule.concurrency-over-locks` and `code-rule.robustness-state-boundaries`.
- **Resolution**: fixed on 2026-11-07, test-first, for review in the round after the allowance reset. Cost: 0 SP and $0.
- **Class closure**: 4 new tests, each failing on the old code: the database refusal and the second try on both dialects, the five requests at once on SQL Server, and the scheduler's handles. A deliberate break of three parts was caught:
  - no index for one waiting request;
  - no second try after losing the race;
  - the scheduler keeping every timer it made.

### DRIFT-001-29: CP-09's co-review round 5 found that reads the Ring library answers from memory reset the outage circuit and marked the Ring session as fine

- **Detected**: 2026-11-07, implement, by Codex co-review round 5, the first after the allowance reset (run `run-20261107-160555736-14798783`, checkpoint `cp-09-link-and-cp-16-accessors-review`, 10 minutes, $0). The round 4 fixes passed.
- **Kind**: a defect in the Ring Adapter (T013), found by review because this review's span includes the camera fix (37e298d). No spec change
- **Observed**: Specrew marked it as a note. Checked against the code, it was real. The owner chose to fix it and run another round.
  - **The defect.**
    - The circuit should open after 5 Ring failures in a row (OR5). But each inventory starts by reading the locations, which ring-client-api fetches once and then answers from its memory, even while Ring is down.
    - The library also answers a location's devices and alarm mode from the state its live connection keeps; for a location without hubs, the device list is an empty one it never asks Ring for.
    - Each such answer passed through the call gate as a successful Ring call. During an outage it reset the failure count and set the session back to `ok` at every inventory, so the circuit never opened.
    - The home kept calling Ring at its shortest retry delay, and its heartbeat reported the session as fine although nothing had reached Ring.
  - **The test fake hid it:** it failed every location read during an outage, which the real library never does. It now answers from memory after the first fetch, as the library does, and fails only the requests that reach Ring (fetching devices, the profile, the first location read).
  - **Fixed:**
    - The adapter keeps the locations after the first answer and does not call the library for them again.
    - A read the library answers from memory still goes through the call gate, and its failure still counts. Its success neither closes the circuit (it ends neutrally, freeing a probe slot) nor marks the session `ok`.
    - While the session counts as unavailable, a read starts with one request that does reach Ring, the profile. Its answer decides whether Ring is back, so an account without cameras, whose other reads come from memory, still recovers.
  - **Carry-forward to the pilot and to iteration 002:** alarm devices and the alarm mode come from the state the library's live connection keeps. If that connection drops while Ring's web requests still work, those reads return the last known state, and no call outcome shows it. Health needs the connection's own state, with push, in 002. The pilot should check what a dropped connection looks like.
- **Requirement citation**: tasks.md T013; spec FR-005 and FR-042; OR5 (the Ring circuit); implementation-rules.yml `code-rule.careful-retries` and `code-rule.robustness-state-boundaries`.
- **Resolution**: fixed on 2026-11-07, test-first, for review in the next round. Cost: 0 SP and $0.
- **Class closure**: 3 new tests, and the fake now models the library's memory. A deliberate break of four parts was caught:
  - every location read going to the library again;
  - reads from memory counting as Ring calls;
  - no request to Ring while unavailable;
  - the gate closing the circuit on any success.

  The first two tests missed the second and fourth breaks. The request to Ring that comes first while unavailable made memory reads irrelevant in the inventory path, so a third test reads one location's devices on its own during an outage, and catches both.

### DRIFT-001-30: CP-09's co-review round 6 found that migration 3 cannot install over two waiting requests; the owner accepted it without a code change, and review sign-off completed

- **Detected**: 2026-11-07, implement, by Codex co-review round 6 (run `run-20261107-164316936-6403505c`, checkpoint `cp-09-link-and-cp-16-accessors-review`, 12 minutes, $0). The round 5 fix passed.
- **Kind**: a review finding the reviewer rated minor itself, accepted by the owner. No spec change
- **Observed**:
  - **The finding:** migration 3 creates a unique index that allows one waiting enrollment request. A database left at schema 2 with two waiting rows, from the race DRIFT-001-28 fixed, would fail to create it, and the migration would roll back.
  - **Why no code change:**
    - **No such database exists.** No release exists (`PREVIOUS_RELEASE_SCHEMA_VERSION` is 0), every test database starts empty, and the first deployment (T032) starts from an empty database. The reviewer noted the same.
    - **The suggested fix would delete rows inside a migration.** The project's migrations may only add (DS5), so that code N-1 still runs on schema N, and a test refuses any other statement.
    - Should a database ever hold two waiting rows before migration 3, the repair is to delete the older waiting row by hand. A waiting request lives 10 minutes anyway (PT-32).
  - **Sign-off.** The owner typed `stop the review here`. Specrew checked the tree as it was (000fd89), saved the finding as a follow-up, and completed review sign-off for the link (CP-09) and the core's accessors (T022, first of CP-16).
  - **The campaign over this span**, rounds 3 to 6 (46 minutes, $0): seven real defects found and fixed test-first (DRIFT-001-27 to DRIFT-001-29), and this one accepted. The owner reset the round allowance once, after round 4.
- **Requirement citation**: research.md PT-32; data-model.md "Home part enrollment" and "Schema lifecycle"; DS5; implementation-rules.yml `project.built-in-first` (B6, forward-only additive migrations).
- **Resolution**: accepted by the owner on 2026-11-07, with no code change. Review sign-off is complete. Cost: 0 SP and $0.
- **Class closure**: NONE - no affected database can exist before the first release, and the additive-only rule already keeps migrations from changing data.

### DRIFT-001-31: T019 builds State; a full snapshot also removes what Ring no longer lists, and both dialects take the same input

- **Detected**: 2026-11-07, implement, while doing T019
- **Kind**: details the records leave open, and one rule the task text does not state (removal). No spec change
- **Observed**:
  - **State** (`bridge/src/core/access/state/`, `StateStore`) owns `location`, `device` and `health_snapshot`. Its DTOs carry the contract's names, with a device's `type` mapped from the column `kind` (PT-26), and times in milliseconds.
  - **Latest wins** in one conditional statement per row (the Query layer's insert-or-update with `onlyIfNewer`). A version equal to or below the stored one changes nothing, so no field is lost and no location rolls back (PT-30, DRIFT-001-06, DRIFT-001-08).
  - **Writes:**
    - `applyInventory` applies a full snapshot in one transaction;
    - `applyDevice` applies one device change, reporting `applied`, `older`, `unknown_location` (its location is not stored yet) or `refused`;
    - `resetVersions` sets every stored version to 0 for a newly enrolled connector, whose counter starts again (PT-30).
  - **Removal (new rule, T019).** T019 said only "inserts or updates", but the contract calls `inventory` a full snapshot. Since 37e298d the home leaves out a camera Ring no longer lists, and the core would have kept it forever in `list_devices`.
    - The home draws an inventory's versions in one block, in one outbox write (`HomeView.inventory`).
    - So a stored entry that a snapshot leaves out, with a version below the snapshot's lowest, was not changed after the snapshot was composed: Ring no longer lists it, and it is removed.
    - A newer change keeps its higher version and stays. A resent older inventory removes nothing.
    - A location goes only once none of its devices is left.
    - Rows are deleted, not marked. Iteration 002's events will name devices by id, not by a foreign key; this is to be confirmed with 002's schema.
    - **Only an inventory adds a device** (a follow-up commit the same day, after a second look). A device change updates only a device State holds, in one conditional `UPDATE`; a change for any other device is `unknown_device`. Otherwise a late change, such as a resend landing after the inventory, would have brought back a device the snapshot had just removed. A device new at Ring therefore appears one inventory round trip later.
    - **Verified:** a partial inventory cannot leave the home. Ingest builds an inventory only from a complete read of every location and its devices; any failed read queues none.
  - **The same input on both dialects (T019).** SQL Server's columns have sizes that SQLite's do not. A long Ring name would otherwise fail on SQL Server only, inside the inventory's transaction; the inventory would never commit, and the home would send it again every 10 s.
    - An entry with an id over 128 characters, or a time zone over 64, is left out and counted (`refused`), while the rest of the inventory is stored.
    - A device whose location is neither in the snapshot nor stored is left out the same way.
    - A name or room over 400 characters is cut to fit, never between the two halves of a character.
  - **The health snapshot** keeps the `get_health` contract's values: home link `up` or `down`; Ring session `ok`, `unavailable` or `lost`; push `ok` or `down`. A field not known is left out.
  - **Errors:** one class, `unavailable` (the store-down error: Inquiry answers `BRIDGE_UNAVAILABLE`, never stale data, FR-006) or `failed`. A row State did not write is reported with no cause.
  - **Carry-forwards:**
    - **T018:**
      - answer `unknown_device` and `unknown_location` with an `inventory_request`;
      - a message that can never commit needs an end (log it, count it, ack it), as the home's rule for oversized messages does;
      - map the heartbeat's `push: off` to an absent push status;
      - log the inventory's `refused` and `removed` counts.
    - **T018 and T029:** reset the versions only once the old key's sessions are closed. Otherwise a session still open for the old key, until Connector Link's 15 s key check, can deliver high versions that beat the new connector's. A cheap tightening is for Connector Link to close every other key's open session when a key proves itself, since only one key can be active.
    - **Iteration 002 (PT-23):** State's writes already run on a session inside the store, so sharing one transaction with Event Log and Audit is a small change.
- **Requirement citation**: tasks.md T019, T018, T021 and T029; data-model.md "Location", "Device" and "Other stored state"; `contracts/connector-link.md` "Device inventory and state"; `contracts/mcp-tools.md` `list_devices` and `get_health`; research.md PT-26 and PT-30; spec FR-002, FR-005 and FR-006; implementation-rules.yml `code-rule.concurrency-over-locks` and `code-rule.robustness-state-boundaries`.
- **Resolution**: implementation choices, recorded for the next co-review. Cost: 0 SP and $0.
- **Class closure**: 25 new tests, run on SQLite and on a local SQL Server before the push. A deliberate break of nine parts was caught:
  - a stale version applied;
  - an older inventory deleting a newer device;
  - a late change bringing a removed device back (added with the follow-up);
  - `kind` not mapped to `type`;
  - a long name only one dialect accepts;
  - a device without its location breaking the inventory;
  - an unknown location thrown instead of reported;
  - nothing removed after a reset;
  - an unknown health field shown as null.

  The removal has two guards, the check in code and the `DELETE`'s own version condition, which stays safe if a version changes in between. Breaking either alone is not caught, because the other still protects; breaking both is caught.

### DRIFT-001-32: T018 builds Event's intake and the Health engine; versions now belong to one connector key and reset when a new key's session opens, not at approval

- **Detected**: 2026-11-07, implement, while doing T018
- **Kind**: details the records leave open, and one departure from T029's text ("approval ... resets the stored state versions"). No spec change
- **Observed**:
  - **The Health engine** (`bridge/src/core/engines/health/`) is pure rules with no I/O, thresholds as data (CD2), its tests written first on the fake clock:
    - a session opening or a heartbeat is a sign of life, and the home link is `up`, its `since` kept while it stays up;
    - after the Config utility's `staleAfterMs` (2 minutes) without one, the home link is `down` and the data stale. Both count from the last sign of life [P];
    - the Ring session's status and the outbox depth come from the heartbeat, the Ring session's `since` kept while its status holds;
    - `asOf(now)` gives the view as of now, so readers see a silent home as down even after a core restart.
  - **The Event manager** (`bridge/src/core/managers/event/`, `EventManager`) implements the intake over State:
    - **One step at a time.** Every State write, and every read-then-write of the health, runs on one queue (L2). The single-instance lease keeps one core writing (FR-044). No test can force the race this queue prevents, so no deliberate break covers it.
    - **The core's clock.** A sign of life counts at the time the core received it, never at the home's own time. A home clock that is off can neither flip the home offline nor keep it falsely up.
    - **Silence.** After each sign of life, a check runs once the threshold has passed. It stores the home as offline and stale and publishes the change. Its own failure goes to an injected reporter, which the Host wires to the log, as with Pub/Sub.
    - **Health changes** of the home link or the Ring session are published on Pub/Sub (`health.changed`). Nothing subscribes in iteration 001.
    - **Errors:** its own class, `unavailable` or `failed`, with State's error as the cause. Connector Link logs it, and the message stays unacked.
  - **Versions belong to one connector key** (a change from T029's text, and from DRIFT-001-31's carry-forward):
    - The session now carries the key it proved. Opening it claims State's versions for that key before any later message of that link, because Connector Link runs a link's steps in order.
    - A new key resets every version to 0 and records the key, in one transaction, so a newly enrolled connector, whose counter starts again, wins.
    - Migration 4 adds the one-row `state_source` table. Keeping the key there, not in memory, means a core restart does not reset the versions for the same connector.
    - A message or heartbeat from a key that is no longer current changes nothing (`not_current`), and is still acked.
    - Resetting at approval, through Pub/Sub, was rejected. A queued reset has no order against the link's own calls: the new connector's first inventory could lose to the old versions, or an old-key write could land after the reset.
    - T029's approval therefore only approves.
  - **The intake's outcomes**, which Connector Link turns into acks and logs:
    - an inventory is `applied`, with how many entries were left out or removed (both logged), or `not_current`;
    - a device change is `applied`, `older`, `needs_inventory`, `refused` (logged by `message_id`) or `not_current`. Every outcome ends the message and is acked;
    - `needs_inventory` sends the home one `inventory_request` per session until an inventory arrives, so a burst of such changes asks once.
  - **After a second look (a follow-up commit the same day).** A session's start that Event could not record, for example because the store failed for a moment during the claim, left Event with no current key. Every later message was then acked as `not_current`, so the home cleared data the core never stored, and its heartbeats were ignored.
    - Connector Link now checks the key once more after the signature verifies. It then has Event record the session's start, both before `hello_ok`, so the home sends nothing on a session the core cannot carry.
    - If either fails, the link closes, as `core_unavailable` or, when the owner approved a newer key mid-handshake, as `key_revoked`. The home dials again.
    - As a backstop, Event refuses a message as `unavailable` while no key has been claimed in this process, so the message stays unacked.
    - The both-ends contract test gains one scenario over the real Event manager and State: the first session's start fails to record, the next session opens, and the home's inventory lands in State.
  - **Push** is not mapped from the heartbeat in iteration 001. The heartbeat says `off` until 002, and the stored push status stays absent.
  - **Carry-forwards:**
    - **T021:** read the health through `asOf(now)` with the same threshold.
    - **T027:**
      - wire `EventManager` as Connector Link's intake, with State, the core's Pub/Sub, the clock, `homeOfflineAfterMs` from the Config utility's `staleAfterMs`, and `reportFailure` to the log;
      - stop it before the store closes.
    - **T029:** approving a request only approves; the versions reset when the new key's session opens.
    - **Iteration 002:** after a core restart, the offline change is published only after the next sign of life; read-time `asOf` keeps replies right meanwhile. 002's `health.home_offline` event may want a core tick. `last_event_at` and push are filled in 002.
- **Requirement citation**: tasks.md T018, T019, T021, T027 and T029; `contracts/connector-link.md` "Heartbeat and home offline" and "Device inventory and state"; `contracts/mcp-tools.md` `get_health`; component-design.md the component map v3 (Event, Health) and CD2; research.md PT-30; spec FR-005, FR-006 and FR-044; OR5; implementation-rules.yml `code-rule.concurrency-over-locks`, `code-rule.complex-code-stable` and `code-rule.idiomatic-error-handling`.
- **Resolution**: implementation choices and one departure from T029's text, recorded for the next co-review. Cost: 0 SP and $0.
- **Class closure**: 20 new tests:
  - the Health engine's, written first;
  - Event's over a real State on SQLite, including the two scenarios the plan names (DRIFT-001-06 and DRIFT-001-08), with a commit made to fail once;
  - Connector Link's outcome handling.

  A deliberate break of twelve parts was caught:
  - the home offline a moment late;
  - up-since reset at every heartbeat;
  - the Ring session's since reset at every heartbeat;
  - a new key not resetting the versions;
  - a key no longer current not refused;
  - liveness on the home's clock;
  - no silence check;
  - health changes not published;
  - a heartbeat from an old key counted;
  - an inventory request for every unplaced change;
  - no new request after an inventory arrives;
  - an unplaced change left unacked.

  The follow-up adds four tests, and a deliberate break of three more parts was caught:
  - a session whose start was not recorded staying open;
  - no second key check after the signature;
  - no claimed key read as `not_current`.

### DRIFT-001-33: T020 builds the Summary engine: the contract's shapes within the budget, and what a home too large for it gets

- **Detected**: 2026-11-07, implement, while doing T020
- **Kind**: details the records leave open. No spec change
- **Observed**:
  - **The Summary engine** (`bridge/src/core/engines/summary/`) has pure rules, no I/O, and its tests were written first. It composes `get_overview`'s data, the default `list_devices` data and the `health` object, in the Public Contract's shapes, with times as UTC ISO 8601 text.
    - It declares its own types, because only MCP Endpoint and Delivery may import the Public Contract (CD4). Inquiry hands it State's view of the home and the health as of now.
    - It does not call the Health engine: engines do not call each other.
  - **The budget** (SC-006, PT-22):
    - 8,000 tokens per reply, estimated as characters ÷ 3, rounded up, with no tokenizer. The `data` keeps 7,800, leaving 200 for the envelope Inquiry adds [P].
    - On the 100-device fixture, the overview takes about 401 tokens and the default device list about 4,012 (derived, from the estimate).
  - **A home too large for the budget** keeps its location and health, and its lists are cut in device-id order, every list to the same length [P].
    - The device list's `count` still says how many devices match, so an agent sees that the list was cut and can filter by type or room [P].
    - The contract's wording ("How many devices are listed") is read this way, and is to be confirmed with the contract's next additive change.
  - **The overview's parts:**
    - open contacts are contact sensors whose state says `open`;
    - active motion is motion sensors whose state says `motion`, with `last_motion_at` taken from when that state was true [P]. No events are stored in 001; from 002, the last motion event can replace it;
    - offline devices are those Ring does not see;
    - a low battery is one Ring flags as low, or one at or below the threshold, matching the Config utility's definition.
  - **The health.** A home that never reported shows its link `down` and its Ring session `unavailable`, both since now [P]. `database` is always `ok` in a reply, because a reply is read from the store; a store that is down fails the read with `BRIDGE_UNAVAILABLE` (FR-006).
  - **Carry-forwards to T021:**
    - pass the health through the Health engine's `asOf(now)`;
    - take the threshold from Settings' `batteryThresholdPct`, which falls back to the Config utility's;
    - wrap the data in the envelope within the 200-token reserve.

    T024's end-to-end test measures the whole reply through MCP.
- **Requirement citation**: tasks.md T020, T021 and T024; `contracts/mcp-tools.md` `get_overview`, `list_devices` and `get_health`; research.md PT-22; spec FR-001, FR-002 and SC-006; implementation-rules.yml `code-rule.complex-code-stable` and `code-rule.docs-as-api-test`.
- **Resolution**: implementation choices, recorded for the CP-14 co-review. Cost: 0 SP and $0.
- **Class closure**: 8 new tests, written before the engine, including the agent-economy test on the 100-device fixture and a 1,000-device home that must be cut. A deliberate break of eight parts was caught:
  - a battery at the threshold not counted low;
  - Ring's own low flag ignored;
  - closed contacts listed as open;
  - no cutting for a large home;
  - the count of a cut list shrinking with it;
  - tokens estimated at four characters each;
  - a home that never reported shown with Ring fine;
  - a stale home's `stale_since` dropped.

### DRIFT-001-34: T021 builds the Inquiry manager; a Ring session that is not `ok` makes the data stale, and Ring outages at a real home are not yet detected

- **Detected**: 2026-11-07, implement, while doing T021
- **Kind**: details the records leave open, and a gap at home for the owner to decide. No spec change
- **Observed**:
  - **The Inquiry manager** (`bridge/src/core/managers/inquiry/`) serves `get_overview`, `list_devices` (filtered by `type` and `room`), `get_device` and `get_health` over State and Settings, with the Health engine's view as of now and the Summary engine's data.
    - It declares its requests and the reply around each tool's data, in the contract's shapes; MCP Endpoint (T024) wraps them for MCP.
    - The battery threshold comes from Settings, which falls back to the Config utility's.
    - The Summary engine gains `deviceDetail`, `get_device`'s data.
  - **Freshness** (FR-006, SC-005):
    - a reply is `cached` while the home link is up and the Ring session is `ok`, and `stale` otherwise, since the earlier of the two. `live` is not used in 001, as the core never reads Ring itself [P];
    - the rule is the Health engine's `asOf`, so the reply's `stale_since`, `get_health`'s and the stored health agree;
    - `errors.md` says "stale applies only to the home link" in contrast with the store being down, and its next line says a lost Ring connection is shown as stale within 2 minutes. The engine follows both;
    - `as_of` is the home's last sign of life while the data is fresh, and the time it became stale once it is [P];
    - a home that never reported is stale since now, so DRIFT-001-33's health for it gains `stale_since`;
    - `as_of_local` is in the location's time zone. A zone Intl does not know falls back to UTC, and `get_health` uses the first owned location's zone, or UTC before the home reported one [P].
  - **Which location:**
    - an omitted `location_id` resolves to the only owned location; otherwise the call fails with `INVALID_ARGUMENT`, with the owned locations' ids in `details`, an empty list before the home reported one [P];
    - shared locations are off in 001 (FR-036), so a shared location and its devices answer `NOT_FOUND` [P].
  - **The store down** fails every read as `unavailable` (`BRIDGE_UNAVAILABLE`, retryable), never with stale data. An abort passes through unchanged.
  - **A gap at home, open for the owner.** The real Ring Adapter's session status changes only when a call reaches Ring, and nothing at home calls Ring on a timer.
    - So a Ring outage while no read is running keeps the heartbeat at `ok`, and an outage once seen stays `unavailable` until the next read (for example, a new session's inventory).
    - SC-005 is met in the simulated home, where the fault is reported at once, but not yet at a real one.
    - The options and their costs are put to the owner with CP-14's review request; nothing is changed until they choose.
- **Requirement citation**: tasks.md T021; `contracts/mcp-tools.md` the four read tools; `contracts/errors.md` the reply envelope and its freshness rules; spec FR-001, FR-002, FR-005, FR-006, FR-036, SC-005 and SC-006.
- **Resolution**: implementation choices, recorded for the CP-14 co-review. The gap at home was closed by the owner's choice of (c)+(a), built in DRIFT-001-35. Cost: 0 SP and $0.
- **Class closure**: 23 new tests.
  - The Health engine's and the Summary engine's were written first.
  - The Inquiry manager's run over a real State and Settings on SQLite: the four tools, which location, `NOT_FOUND`, shared locations hidden, the three kinds of stale, the store down, the local-time fallback, and the whole reply within 8,000 tokens on the 100-device home.
  - The link contract gains one scenario over the real Event manager, State and Inquiry: Ring down by fault injection shows as stale within 2 minutes on the fake clock, and as cached again once Ring is back.

  A deliberate break of thirteen parts was caught:
  - a Ring session not `ok` ignored;
  - stale since the later of the two;
  - every reply `cached`;
  - the store down answered as `failed`;
  - a named shared location readable;
  - a shared location's device readable;
  - an omitted `location_id` taking the first of several;
  - an unknown time zone not caught;
  - the owner's threshold ignored;
  - the type filter dropped;
  - a home that never reported not stale, in Inquiry and in the Summary engine;
  - `as_of` always now.

### DRIFT-001-35: the owner chose (c)+(a), so the Ring Adapter notices Ring going away and coming back with no read running; the library may not reopen its live connection after a Ring server error

- **Detected**: 2026-11-07, implement, after T021 (DRIFT-001-34's gap at home)
- **Kind**: an owner decision, and a library behaviour found while building it. No spec change
- **Observed**:
  - **The owner's choice**: "a+c", typed in reply to the options in CP-14's review request.
  - **(c) The live connection.**
    - For each location with an alarm hub (`hasHubs`), the adapter watches ring-client-api's `onConnected`.
    - Closed for longer than 30 s [P] after it had been open, Ring counts as unavailable until it opens again. Its first `false`, before the first connection, does not count, and a routine reconnect within the grace changes nothing.
    - With the 15 s heartbeat, an outage the connection sees shows as stale within about 45 s (derived).
  - **(a) The probe.**
    - While calls to Ring fail, the adapter asks for the profile once a minute, the gate's probe interval, so the open circuit admits it.
    - That is about 60 calls an hour at most, and only during an outage (derived); the one-call-at-a-time rule and the backoff make it fewer.
    - Its success brings the status back to `ok` with no read. It stops on success, on a lost session and on close.
  - **Both are needed for `ok`**: a probe that gets through does not hide a connection still closed.
  - **The library port**: the narrow types gain `hasHubs` and `onConnected`, and the compile-time check in `ring-client.live.ts` shows ring-client-api 14.3.0 still fits.
  - **Not covered**: an outage where only Ring's web calls fail while the live connection stays open is noticed only when a read runs, which (c) cannot see.
  - **A finding while building, open for the owner.**
    - ring-client-api 14.3.0 retries a request that gets no answer, or a 504, every 5 s without end, but throws on another status, such as 500, 502 or 503.
    - Its live connection, once closed, reconnects by first asking Ring for a ticket. If that request throws, the library makes no further attempt, and the failure is left unhandled.
    - So after a Ring outage that answers with a server error, alarm devices' changes may stop arriving until the connector restarts. The adapter shows that as `unavailable`, so replies say stale rather than present old data as current.
    - An unhandled rejection ends a Node process by default, and the connector's wiring (T027) has no handler yet. Whether Ring's real answers lead there is for the pilot.
- **Requirement citation**: spec SC-005, FR-005, FR-026 and FR-042; DRIFT-001-34; tasks.md T013 and T021.
- **Resolution**: built as the owner chose, in the Ring Adapter (CP-07). Cost: about 1 SP (estimate), recorded in CP-07's actual, and $0. For the library's reconnect after a server error, the owner chose (y), typed "Yes, agree y is the best approach": a carry-forward to T027, where the connector's process and service are set up. If Ring's web calls work but a hub's live connection stays closed for 5 minutes, the connector exits and its service restarts it; T027 also logs a library error that escapes, rather than letting the connector end without a word. About 0.5 SP (estimate) and $0.
- **Class closure**: 9 new tests on the fake client, written before the code: the grace, a short reconnect, the first `false`, hubs only, the probe's pace and recovery, no probe while fine, a closed connection outlasting a probe, and the probe stopping on a lost session and on close. A deliberate break of nine parts was caught:
  - the grace ignored;
  - the connection's first `false` counted;
  - a location without a hub watched;
  - a probe that gets through hiding a closed connection;
  - the probe not stopping once the session is lost;
  - the probe running while Ring is fine;
  - the probe not stopping on close;
  - the probe not counted as reaching Ring;
  - a reconnect within the grace not cancelling it.

### DRIFT-001-36: CP-14 review round 3 found three ways old data could look current or come back; fixed with ordered snapshots and a refresh each session owes

- **Detected**: 2026-11-07, implement, CP-14 review round 3 (Codex). The reviewer reported three findings as major; Specrew kept them as notes because they named no concrete failure. Each was checked against the code and is real.
- **Kind**: three defects against FR-006 and the link's latest-wins rules (PT-30), and a change to version 1's `inventory` before its release. No spec change
- **Observed**:
  - **A replayed older inventory could bring back what a newer one removed.**
    - A deleted row keeps no version, so an older inventory resent after a newer one (its ack lost) inserted the removed device or location again, with its old state.
  - **An empty inventory never cleared the home.**
    - State ordered a snapshot by its lowest entry version, which an empty one does not have, so nothing was removed and the old home stayed readable.
  - **A reconnect made old data look fresh before the new inventory arrived.**
    - A session's opening cleared `stale_since` at once. A delayed or failed inventory then left old door and alarm states marked `cached`, as of the reconnect.
- **Fix**:
  - **Snapshots in order** [P]:
    - every `inventory` now carries a `snapshot_version`, drawn from the home's counter before its entries' versions;
    - State keeps the newest one applied (`state_snapshot`, migration 5) and skips one at or below it as `older`: once a newer one is applied, every stored row is newer than an older one's entries;
    - a newer one removes each unlisted row below its `snapshot_version`, so an empty one clears the home;
    - a new connector key forgets the newest snapshot along with the versions;
    - Connector Link acks a skipped one, but it does not answer a pending `inventory_request`.
  - **Fresh only once the session's own inventory is stored** [P]:
    - every `inventory` names the session it was composed for (`session_id`), left out when no session was open;
    - a session's opening owes a refresh, since the last time the data was known true: the earliest of a refresh already owed, the time it became stale, and the last sign of life before the session. It is kept in the health snapshot (`refresh_owed_since`, migration 5);
    - the Health engine counts it as stale. Event ends it when an inventory composed for the current session is processed, also when State skips it as already applied, as after a health save that failed;
    - an earlier session's inventory, or a heartbeat, does not end it.
  - **The link contract** (`connector-link.md`) gains the two fields and the two rules, a change to version 1's `inventory` before its release (PT-07: version 1 is not released before iteration 004).
    - `snapshot_version` is required, so the change is not additive: a home that leaves it out is refused. No deployed home sends the old shape. `session_id` is optional.
    - The fixes' commit message called both fields additive; this record corrects it.
    - Its "new enrollment" rule now says when the reset happens, as DRIFT-001-32 decided. `data-model.md`'s health snapshot names the new field.
- **A known limit, carried to T027 and T028**:
  - The home keeps its version counter in the outbox file and its key in the Secrets File. If the outbox file is lost and made again while the key is kept, the counter starts again at 1, while the core keeps the newest snapshot and the stored versions.
  - The core then skips every inventory and device change from that home as older, until a new key is enrolled. Device changes behaved this way before the fix; ordered snapshots extend it to inventories.
  - T027 and T028 settle it: a new outbox means a new key, or the hello carries the counter.
- **Requirement citation**: spec FR-006 and SC-005; research.md PT-30; `contracts/connector-link.md` "Device inventory and state"; DRIFT-001-06, DRIFT-001-08 and DRIFT-001-32.
- **Resolution**: fixed after the owner chose (a), to fix all three and run round 4. Cost: about 2 SP (estimate after the work, against 1.5 SP estimated before it), recorded in CP-14's actual, and $0.
- **Class closure**: new tests:
  - State, on both databases: replaying A after B, an empty newer and an empty older snapshot, a new key forgetting the newest snapshot, and a bad snapshot version;
  - the Health engine: back from silence, a quick reconnect, two sessions before any inventory, and a heartbeat;
  - Event: an earlier session's inventory and a heartbeat do not end the refresh; the session's own resent inventory does, after its health save failed;
  - Connector Link and Ingest: the session named and passed on, and an older inventory not answering a request;
  - the link contract with the real Event manager, State and Inquiry: a home back from three minutes away stays stale while its first inventory fails, and is fresh once the resend is stored.

  A deliberate break of twelve parts was caught:
  - an older snapshot not skipped;
  - the newest snapshot kept across a new key;
  - an empty newer snapshot removing nothing;
  - the refresh ended by any session's inventory;
  - the refresh not ended by the session's own inventory skipped as older;
  - a heartbeat ending the refresh owed;
  - a session opening owing nothing;
  - the refresh owed since the new session rather than since the data was last known true;
  - a refresh owed not counted as stale;
  - an older inventory answering a pending request;
  - the snapshot's version drawn after its entries';
  - the inventory not naming its session.

### DRIFT-001-37: CP-14 review round 4 found that an inventory read before a reconnect could end the new session's refresh, and that a late key check could take State from a newer key; both fixed

- **Detected**: 2026-11-08, implement, CP-14 review round 4 (Codex). The reviewer reported two findings as major; Specrew kept them as notes because they named no concrete failure. Each was checked against the code and is real, and checking the first found a second way in.
- **Kind**: two defects against FR-006 and the one active key (FR-032), and a narrower meaning for the link contract's `session_id`. No spec change
- **Observed**:
  - **An inventory read before a reconnect could end the new session's refresh.**
    - Ingest named an inventory with the session open as it was written, not the one its Ring read began in.
    - An alarm mode change during the new session's own read sent the old picture at once, named with the new session. A read begun before the link dropped (the 10 s tick or an `inventory_request`) and finished after the reconnect was named with it too.
    - The core ended the refresh on either, so old states showed `cached` until the session's own read was stored. A Ring call that never answers can delay that read without limit (DRIFT-001-35).
    - Two reads that overlapped could also finish out of order, and the earlier one's older picture was then sent after the newer one, under a higher version.
  - **A late key check could take State from a newer key's session.**
    - A link's last key check and Event's claim of State were separate steps. With SQL Server's connection pool, an older key's check could read `active` before the owner approved a newer key, and answer after the newer key's session had claimed State.
    - The older session then claimed State. It closed as revoked within 15 s, but the newer session stayed open with every message acked as not current and its heartbeats ignored, so the home showed offline until that link dropped.
- **Fix**:
  - **Named only by its own read** [P]:
    - an inventory names a session only when its Ring read began in that session and the session is still open as it is written;
    - an alarm mode change's inventory, built from the newest picture, follows the same rule with that picture's read;
    - only such an inventory pays the inventory a session is owed, so Ingest reads again on the 10 s tick until one is queued.
  - **The newer read wins** [P]: reads are numbered as they begin, and one that finishes after a read begun later is dropped (`superseded`), because the later read's picture is newer.
  - **One takeover at a time** [P]:
    - Connector Link runs each link's last key check and its claim of State in one turn, one link at a time across the core;
    - approving a key revokes the older ones in the same transaction (FR-032), so a check that runs after a newer key's turn reads the older key as revoked;
    - the single-instance lease keeps one core taking turns (FR-044), and no new column is needed.
  - The link contract's `session_id` and its "A session's own inventory" rule now say which session an inventory names.
- **Requirement citation**: spec FR-006, FR-032, FR-044 and SC-005; `contracts/connector-link.md` "Device inventory and state"; DRIFT-001-35 and DRIFT-001-36.
- **Resolution**: fixed after the owner typed "approved for allowance reset" and "fix both", to fix both and run round 5. Cost: about 1 SP (estimate), recorded in CP-14's actual, and $0.
- **Class closure**: new tests:
  - Ingest: an alarm mode change during a reconnect's read; a read begun before the session while the session's own first read fails; two overlapping reads that finish out of order;
  - Connector Link: an older key's last check answering after the owner approved a newer key, with the newer session claiming State last and staying open.

  A deliberate break of six parts was caught:
  - every inventory named with the session open as it is written;
  - an alarm mode change's inventory named with the session open then;
  - a read begun before the session named with it;
  - a read begun before the session paying the inventory it owes;
  - an earlier read that finishes last kept;
  - takeovers not taken in turn.

### DRIFT-001-61: CP-17's review follow-up: what anonymous callers can make the Issuer store, bounded

- **Detected**: 2026-11-11, review, CP-17's round (run-20261110-230343975-312e4ebf). One finding, outside T029, reported as major and demoted to minor by Specrew for naming no concrete failure scenario. It holds up against the code.
- **Kind**: a gap between the security design and the tasks, found as a defect in the Issuer (T023). No spec change; `contracts/web-endpoints.md` gains the rule
- **Observed**:
  - **Registrations without bound.** DCR needs no token, and a listed agent's redirect URIs are public. Anyone could post the same registration again and again, and each one stored a new `Client` row that nothing ever removed. Unlisting the agent only made the rows unusable.
  - **The security design had named it.** T11 ("DCR floods registrations") called for rate limits on the Issuer's open endpoints, but no task carried them.
  - **The wider class, found while checking**: the Issuer never deleted any record whose time was up. Every route an anonymous caller reaches that stores a record grew the database:
    - `/oauth/reg` stores a `Client`, with no lifetime;
    - `/oauth/auth` stores an `Interaction`, and a `Session`, for 10 minutes;
    - `/oauth/request` (pushed authorization requests, on by default) stores a `PushedAuthorizationRequest` for 60 s at most.
  - Ordinary use grew it too, more slowly: used codes and old tokens.
- **Decided**:
  - **Expired records are removed.** `GrantsStore.deleteExpired` deletes every record whose time is up, of every model, using the expiry index the schema already had. The Issuer runs it once it serves, then every hour (`SWEEP_INTERVAL_MS`), never two at once, and stops on `close`. A failure is logged (`issuer_records_sweep_failed`) and the next hour tries again.
  - **Removing them changes no answer.** A record past its time was never found. The only reader of one is `consume`'s lost claim, which reads it in the moment after the record was found in time, so reuse detection is unchanged.
  - **New registrations are limited.** The Issuer accepts so many in any hour, across all agents: `BRIDGE_REGISTRATIONS_PER_HOUR`, 10 by default, 1 to 1000 [P].
    - Only a registration that passes the listed-URI check counts.
    - Over the limit, the answer is 429 `temporarily_unavailable`, with `issuer_registrations_limited` logged as a security event.
    - The count is in memory, per core process.
  - **A registration lasts 7 days unless the owner links it** [P].
    - At the owner's consent, the Issuer clears the client's lifetime (`GrantsStore.keep`) before it saves the grant.
    - If the client cannot be kept, the consent is refused or fails, and nothing is granted: its tokens are checked against that row, so a linked agent must never lose it.
  - **The trade-off, told to the owner**: one limit for the whole Issuer means someone flooding it can block a new self-registering agent for up to an hour. Linked agents, and agents with a metadata document, are unaffected.
  - **Residual risk**: a flood of requests still costs capacity, as on any public endpoint, but the storage it can fill is now bounded. There are no request limits per endpoint.
- **Requirement citation**: FR-029, FR-030; the security design's T11; CP-17's review finding.
- **Resolution**: fixed after the owner chose to stop the review there and have it fixed before T030. About 1.5 SP (estimate), booked to CP-16 (the Issuer), and $0.
- **Carry-forward**: T030's App Service settings and the deployment docs list `BRIDGE_REGISTRATIONS_PER_HOUR` as optional (10 by default).
- **Class closure**: "a record an anonymous caller can make the Issuer store, kept without bound" is closed for every route that stores one. Registrations are bounded by the hourly limit and their lifetime; every model with a lifetime is bounded by the hourly removal. The only records kept for good are the owner's own links. Tests:
  - the store on both databases: removal of only what is past its time, and keeping a record only while it is there and in time;
  - the adapter: the lifetime, the limit (429), and an unlisted registration not counted;
  - the Issuer end to end:
    - repeated anonymous registrations of a listed URI store at most the limit, and none are left after 7 days and a removal;
    - a linked self-registering agent still refreshes, and its token still checks, 8 days later after a removal, and links again;
    - a consent that cannot keep the client grants nothing;
    - the hourly removal starts when the Issuer serves and stops when it closes, the core's stop closing it;
    - one removal runs at a time, and a failed one is logged;
  - the setting's default and bounds.
  - Deliberate breaks: 13, all caught.
  - 1,265 tests: with SQL Server on 2 workers, 1,252 pass and 13 skip.

### DRIFT-001-60: T029 part 2: the admin page in a real browser, and what that found

- **Detected**: 2026-11-10, implement, T029. The first two findings came from a review of part 1 before its review round; the browser checks then showed them.
- **Kind**: defects in part 1 (DRIFT-001-59), found before review, and the task's Playwright checks. No spec change
- **Observed**:
  - **Every form would have failed in a browser.** Part 1 sent `Referrer-Policy: no-referrer`. Under it, browsers send `Origin: null` on a page's own form posts, so the Origin check refused the approval, the sign-out and the theme form. The tests set the header by hand, so none could see it. A deliberate break proves it: with `no-referrer` back, the browser's approval fails.
  - **Refresh did not refresh**: a link to `/admin#health`, on `/admin`, only scrolls.
  - **An approval that got no answer said "nothing was approved"**, though the change may have been made before the answer was lost.
  - **No limit on a form's size**: the Origin check stops browsers, not a script that sets its own headers.
  - The page had no `h1`. DRIFT-001-59 claimed that typing the code proves the owner compared it with the connector's log; the code is shown right above the field, so it does not.
  - A sign-in lands on `/admin#health`, and the fragment moves where the browser's Tab starts. That is the browser's own behaviour, and the keyboard check starts from a plain load.
- **Decided**:
  - `Referrer-Policy: same-origin`, which still sends no referrer to other sites. The Origin check stays strict and never takes `null`.
  - Refresh fetches the Health section at once through the page script, and loads the whole page without it.
  - A failure while approving says the outcome is unknown and asks the owner to reload; a failure before it still says nothing was approved.
  - Form bodies over 4 KB are refused before they are read [P], with hono's built-in body limit: no new dependency.
  - The page is titled "Bridge admin", and the Enroll section says to approve only if the code matches the one the setup printed at home.
  - **The Playwright checks** (`npm run test:pages`) run against a dev server, `bridge/dev/admin-pages.ts`, with stand-in managers and a stand-in Entra on localhost. Each check opens its own scenario, so they run side by side. They cover 19 checks in each of the six projects (three widths, dark and light): signed out, all OK, each banner, connector behind, not linked, a waiting code, approved, not pending, a wrong code, a sign-in too old, and signed out by the owner. Each asserts its theme and that nothing scrolls sideways. Further checks show the typed code kept through the poll, Refresh, the theme switch and unfolding the phone, and the approval made from the keyboard alone, with focus visible at each step.
  - Playwright 1.64.1's headless Chromium was downloaded to this machine: a browser for the existing dev dependency, not a new package.
- **Not chosen, and offered to the owner**: running the page checks in CI. The repository is private, so its Actions minutes come from the account's monthly allowance. They would add about 3 minutes per push (estimate). Until the owner says so, they run locally before each push that touches the page.
- **Requirement citation**: tasks.md T029; FR-040, FR-005, FR-032; UX U1-U5; DRIFT-001-59.
- **Resolution**: T029 done. About 4 SP in all (estimate) against its 1, and $0.
- **Class closure**: the class is "a check that only a test's hand-made request passes". The page's forms are now proven as a browser sends them, in every project; each of the browser's own behaviours the page relies on has a check and a deliberate break: the Origin under the page's referrer policy, the poll and Refresh keeping what is typed, the theme kept, the side menu once unfolded, visible focus, no sideways scroll at the folded width, the default and chosen theme (9 breaks), plus the body limit and the unknown outcome (2 more, in Vitest). All 11 were caught.
  - 1,247 tests: 1,125 pass and 122 skip without SQL Server; with SQL Server on 2 workers, 1,234 pass and 13 skip. The page checks: 114 pass.

### DRIFT-001-59: T029 part 1: the admin page's server side, and how a connector is approved safely

- **Detected**: 2026-11-10, implement, T029.
- **Kind**: the task as written, with decisions the records left open (the paths, the typed confirmation, the session's life, "connector behind"). `contracts/web-endpoints.md` now names the paths. No spec change
- **Observed**:
  - The records give the admin page's sections, a fresh sign-in, and a sign-in under 5 minutes old plus a typed confirmation for risky actions (UX U4). They leave open what the owner types, how long a session lasts, and where the page is served.
  - The return from Entra is a top-level navigation from another site, so a `SameSite=Strict` cookie never arrives on it, or on the redirect after it.
  - The page's policy allows forms to post only to the core itself (`form-action 'self'`), and browsers apply that to the redirects after a post. A stale sign-in therefore cannot be sent straight from the approval's post to Entra.
- **Decided**:
  - **Web** (`core/clients/web/`) calls Admin and Inquiry, never the tables. Admin gains the waiting request and its approval; Inquiry gains the health as the page shows it, with the home's time zone and the connector's version; the core assembly hands Admin out.
  - **Paths [P]**: the page at `/admin`, with its sign-in, sign-out, poll, approval, theme, stylesheet and script under it. Entra's return stays `/sign-in/return`: the Issuer's sign-ins first, and else the page's.
  - **Sign-in and session**:
    - every session starts with a fresh sign-in, bound to the browser that started it by a cookie whose hash only is kept, as the Issuer's are (DRIFT-001-40);
    - sessions live in memory, one instance (FR-044), and end 30 minutes after their last use or 8 hours after they began [P]; the poll counts as use;
    - the cookies are `Secure`, `HttpOnly` and `SameSite=Lax`. Every form carries its session's token and must come from the core's own origin;
    - Entra's subject and object ID are never logged.
  - **Approving a connector**:
    - the owner types the request's code, compared without dashes, spaces or case [P]: a typed confirmation tied to the request shown. The page asks the owner to approve only if it matches the code the setup printed at home (corrected in DRIFT-001-60);
    - the form posts the key the page showed. If a newer request replaced it, nothing is approved and the page shows the new code;
    - the sign-in's age is checked on the server when the form arrives. From 5 minutes on, the page asks for a new sign-in instead of the form, and the request, which waits 10 minutes, is still there after it;
    - a core instance without the lease approves nothing;
    - approval makes the key the one active key and revokes the older ones. The versions start again when the new key's first session claims them, which the end-to-end test shows: a second connector's change is applied, not skipped as older.
  - **The page**: server-rendered with hono's `html` helper, which escapes every value; the code and version from the home are never raw markup. Dark by default, with a light theme kept in a cookie the server reads, so there is no flash. The stylesheet and the script are served from their own paths, under a policy with no inline script or style, no framing, nothing cached, and no referrer sent to other sites (DRIFT-001-60). The Health section is polled alone every 15 s, so the typed code is never wiped; once the session ends, the poll shows a signed-out notice and stops.
  - **Failures as page states**: the store down is a banner, never an error page; a sign-in refused, not the owner's, from another browser, or ended says so on the sign-in page.
  - **"Connector behind" [P]**: both versions are `major.minor.patch` and the connector's is lower. Any other form is never called behind.
  - **Contrast**: a test works out WCAG ratios from both themes' colours: 4.5:1 for text, 3:1 for the focus ring. No new dependency.
  - **Not chosen**: `SameSite=Strict` cookies, which the return from Entra would not carry; sending a stale approval straight to Entra, which the page's policy blocks.
  - Mode A serves no admin page in iteration 001 (iteration 004).
- **Requirement citation**: tasks.md T029; FR-005, FR-032, FR-040; SC2; UX U1-U5; DRIFT-001-40.
- **Resolution**: part 1 done. Part 2 adds the Playwright checks at three widths in both themes, the keyboard path, and closes T029. About 2.5 SP so far (estimate) against T029's 1, and $0.
- **Class closure**: the class is "a risky action whose checks live only in the page". Each of the approval's checks runs on the server when the form arrives, and each has a test and a deliberate break: the key shown, the code typed, the sign-in's age either side of 5 minutes, the lease, the form's origin and token, the browser binding, the fresh sign-in, escaping, the store down as a banner, the session's idle end, the page's policy, and the return the Issuer does not own (14 breaks, all caught).
  - Tests: 50 for Web, 2 for Admin, 1 for Inquiry, and one end to end on the core with the Entra stand-in and two connectors.
  - 1,244 tests: 1,122 pass and 122 skip without SQL Server; with SQL Server on 2 workers, 1,231 pass and 13 skip.

### DRIFT-001-58: CP-06's review follow-ups: a failed device-list refresh not reported, and one guard for both home run modes

- **Detected**: 2026-11-10, review, CP-06's round (run-20261110-071004856-9c5b0f5d). Two findings, both reported as major and demoted to minor by Specrew for naming no concrete failure scenario. Both hold up against the code.
- **Kind**: defects in Ingest (CP-08a) and in the Host's two home run modes (CP-10). No spec change
- **Observed**:
  - **A device-list refresh that was not queued went unreported.** A device added or removed at Ring reaches the core only in a fresh inventory (DRIFT-001-41). When that inventory was not queued, because the outbox could not be written or Ring could not be read, Ingest owed one and its 10 s tick read again. But its heartbeat still said `inventory_owed_after: null`, so the core went on serving the old device list as current, its `as_of` advancing. A failed `device_state` write already reported this debt (DRIFT-001-38); a failed inventory did not. A read that failed unexpectedly did not even leave the inventory owed.
  - **The two modes guarded the data folder differently.** Mode A's lease keeps out a second mode A, and the connector's held outbox keeps out a second connector (DRIFT-001-55). Mode A opened Ring first and the outbox after, without holding it. So a connector and mode A on the same folder, in either order, could both open Ring with the same saved token and overwrite each other's rotations.
  - **Found while fixing it**: on stop, the connector let the outbox go before it closed Ring, so another process could take the folder while Ring was still saving a rotated token.
- **Decided**:
  - Ingest: an inventory that is not queued, for any reason except a newer read finishing first, leaves the same debt as a failed change: the newest version kept so far. The heartbeat reports it until the session's own inventory is queued. The core needed no change.
  - Host: one guard, `openHomeOutbox` in `host/home-files.ts`, refuses a lost outbox and then opens the outbox, holding its file. Both modes call it before they open Ring, so whichever comes second stops with `data_folder_in_use` before its home opens. Its message now says "Another bridge process is using this data folder", and the Setup CLI's says "The bridge is running on this data folder".
  - Both modes close Ring before they let the outbox go.
- **Requirement citation**: FR-005, FR-006, FR-042, FR-044; CP-06's review findings.
- **Resolution**: fixed after the owner chose to stop the review there and have both fixed before T029. About 0.75 SP (estimate): 0.25 booked to CP-08a and 0.5 to CP-10, and $0.
- **Class closure**: two classes, each closed where it lives. "A change the core learns of only from a message the home failed to queue": every path into the outbox now leaves a debt when it fails (a device change, an alarm mode change, and an inventory for any reason). "A guard one run mode takes and the other does not": the data folder's guard is one function that both modes call before Ring, and the Setup CLI holds the same file.
  - Tests: three for Ingest, one for each way the fresh read fails; four for the Host, a connector on mode A's folder and mode A on a connector's, and the folder held until Ring closes, in each mode.
  - Deliberate breaks: 7, all caught (no debt for an inventory not queued, or for one that throws; mode A not holding the outbox, or opening Ring first; either mode letting the outbox go before Ring; the guard not naming the folder in use).
  - 1,190 tests: 1,068 pass and 122 skip without SQL Server; with SQL Server on 2 workers, 1,177 pass and 13 skip.

### DRIFT-001-57: T028: the Setup CLI, with the enrollment code and a lost outbox settled

- **Detected**: 2026-11-10, implement, T028.
- **Kind**: the task as written, with decisions the tasks left open, and two carry-forwards closed (DRIFT-001-36, DRIFT-001-51). `data-model.md` amended: the Secrets File also keeps the enrollment code, and a lost outbox needs a new key
- **Observed**:
  - T027 read the enrollment code from `BRIDGE_ENROLLMENT_CODE` until the Setup CLI kept it (DRIFT-001-47, DRIFT-001-51).
  - DRIFT-001-36 left a limit to T027 and T028. An outbox lost while the key is kept restarts the home's version counter, and the core then skips the home's changes as older. It named two ways out: a new outbox means a new key, or the hello carries the counter.
  - Ring's library retries a request that gets no answer every 5 s, without end, and its own log quotes Ring's answers.
- **Decided**:
  - **The Setup CLI** (`connector/clients/setup-cli/`), which the owner runs as `docker run -it <image> setup`:
    - it asks for the Ring email, then the password unseen, then the code Ring sent. After 3 codes Ring does not accept, it stops;
    - each sign-in step waits at most 2 minutes [P], since the library never gives up on its own;
    - it makes the Secrets File's key file when there is none, a new key pair, the enrollment code, and a random session hardware ID, used for the sign-in and later by the connector's Ring client;
    - **the Secrets File is written last**, after the sign-in. A run that stops early leaves at most an empty outbox and the key file, and the next run takes them as they are. An existing Secrets File is refused and left alone, before any question;
    - it holds the outbox while it runs, so a connector running on the folder is found before the owner signs in;
    - it refuses to run without a terminal, and reads only `BRIDGE_DATA_DIR` and `BRIDGE_SECRETS_KEY_FILE`, so it runs before the rest is set;
    - **it calls the access components directly, with no manager**: the setup is the owner's one-off task at home, not a use case of the running connector.
  - **The Ring sign-in** is a port in the Ring Adapter (`RingLogin`). The live one wraps ring-client-api's `RingRestClient`:
    - it reads each step's outcome from the client's state;
    - Ring's own text is never passed on, except the prompt that says where the code went, which only the owner sees;
    - its test answers Ring's token endpoint with a stubbed `fetch`, with no network and no real credentials. The agent never runs the real one.
  - **The enrollment code**: 8 characters of Crockford's base32 in two groups, such as `7Q4K-29XM`, from 40 random bits.
    - It is kept in the Secrets File, as a new optional field, so older files still open.
    - It is logged at `core_link_enroll_sent` as `enrollment_code`. A test logs every shape of code, all digits included, and none is redacted.
    - `BRIDGE_ENROLLMENT_CODE` is gone. A home whose Secrets File holds no code is refused as `setup_needed`.
  - **A lost outbox** (DRIFT-001-36): a new outbox means a new key.
    - The connector and mode A refuse to start (`outbox_lost`) when the Secrets File is there and the outbox is not. They refuse before making a new outbox, and say to delete the Secrets File, run the setup again and approve the new code. Approving the new key resets the core's versions.
    - **Not chosen**: the hello carrying the counter. That changes the link contract and the core's handling for a rare loss, since the outbox and the Secrets File live in the same folder.
  - **Smaller moves**:
    - The file names moved into their components (`SECRETS_FILE_NAME`, `OUTBOX_FILE_NAME`), so the Setup CLI needs nothing from the Host.
    - The Secrets File is opened in `host/home-files.ts`, apart from the Ring client, so the tests open a real one over the simulated home.
    - The image smoke gains a `setup` case: the image loads the Setup CLI and Ring's sign-in, and refuses to run without a terminal.
    - The connector's dependency rule now covers the setup's wiring too.
    - CI on Linux found that the existence checks counted only `ENOENT` as missing. There, a path under a file answers `ENOTDIR`, and the check threw. Both checks now count either as missing.
- **Requirement citation**: tasks.md T028; FR-032, FR-034, SC2, SC4; DRIFT-001-36, DRIFT-001-47, DRIFT-001-51.
- **Resolution**: done. About 2 SP (estimate) against T028's 1, and $0.
- **Class closure**: the class is "a carry-forward left open past the task named to settle it". Both of T028's are closed here: the enrollment code (DRIFT-001-47 and DRIFT-001-51, whose lines now point here) and the lost outbox (DRIFT-001-36). The others on record stay with their tasks:
  - T030 must not gate the switch-over on `/readyz`;
  - no ffmpeg in the image until iteration 003;
  - the pilot's checks.
  - Tests: 34 new, among them the setup end to end (the Setup CLI's Secrets File, then the connector over it with the simulated home, the printed code matching the core's and the log's, then approval and the inventory). Deliberate breaks: 16, all caught.
  - 1,183 tests: 1,061 pass and 122 skip without SQL Server; with SQL Server on 2 workers, 1,170 pass and 13 skip.

### DRIFT-001-56: CP-10's review follow-up: a home stop held by a send that never finishes

- **Detected**: 2026-11-10, review, CP-10's round 3 (run-20261110-012921571-b48e7f6f). Minor; reported as major and demoted by Specrew for naming no failure scenario.
- **Kind**: a defect in T027's home assembly (CP-10) and in the Link transport's send queue (CP-09). No spec change
- **Observed**:
  - The home side's stop waited for the scheduler's running tick before closing the link. A tick that was resending waited on a send, and a connection that pushes back while messages still arrive may never finish a write. The stop then waited for ever, before the link, the outbox and Ring were closed.
  - **Found while testing the fix: closing the link did not release that send either.** The send queue settled the frames still waiting, but not the frame already handed to the connection, which settled only when the connection reported it written.
  - A test holds the in-memory link's writes, makes a change, and lets the resend tick start. On the old code the stop was still waiting after 2 s.
- **Decided**:
  - The home side asks the scheduler to stop (no new ticks), closes the link, then waits for the tick and Ingest.
  - The send queue's close settles the frame being written as `closed` too. Whether it got out is unknown, so its sender treats it as not sent: the outbox sends it again, and the core takes a repeat by its message id and versions. The link pair's test now expects that frame `closed`. That is also true there: the other end had closed before the held write resumed.
- **Requirement citation**: FR-042, FR-044; CP-10's review finding.
- **Resolution**: fixed after the owner chose to stop the review and have it fixed before T028. About 0.5 SP (estimate): 0.25 booked to CP-10 and 0.25 to CP-09, and $0.
- **Class closure**: the class is "a stop that waits on work only something later in the stop releases". Each stop was checked:
  - the core service (fixed in DRIFT-001-54);
  - the core assembly (the link's term, then the lease, then Pub/Sub);
  - the lease gate (Connector Link, then Event);
  - Core Link (abort, then close, then wait);
  - the connector and mode A (the home side, then the outbox, then Ring, which waits for a token being saved; DRIFT-001-58 closes Ring before the outbox);
  - this one.
  - Two tests guard it, a stop with a held send and a frame in flight settled on close, and 2 deliberate breaks, both caught.
  - 1,149 tests: 1,027 pass and 122 skip without SQL Server; with SQL Server on 2 workers, 1,136 pass and 13 skip.

### DRIFT-001-55: CP-10's review round 2: a token rotation lost at shutdown, a tenant named by domain, and two connectors on one folder

- **Detected**: 2026-11-10, review, CP-10's round 2 (run-20261110-003649007-a4d37bb5). Three findings, all minor; two were reported as major and demoted by Specrew for naming no failure scenario.
- **Kind**: three defects, in CP-07's Ring Adapter, CP-08a's Outbox Store and T027's Host. No spec change
- **Observed**:
  - **A Ring token rotation could be lost at shutdown.** When Ring rotated the refresh token, the Ring Adapter started saving it to the Secrets File without keeping the save, and closing it did not wait. A stop overlapping the save (a restart, a deploy, mode A's client leaving) could end before the new token was on disk. The next start would then use the old token, which Ring may refuse once rotated.
  - **A tenant named by its domain broke sign-in.** Config accepted `BRIDGE_ENTRA_TENANT_ID` as a tenant ID or a domain. Entra names a tenant's issuer by its ID, and the sign-in requires the exact issuer its discovery returns, so a domain passed the start-up check and then failed every sign-in.
  - **Two connectors on one data folder fought.** Nothing kept a second connector off a folder in use. Both opened Ring and dialed the core with the same key. Connector Link replaced the older session, the other reconnected within a second, and so on, while both wrote the same Secrets File and outbox.
- **Decided**:
  - **The Ring Adapter keeps each token save** until it settles, and `drained()` waits for them. The production home's close calls `close()`, which stops new rotations, then waits for `drained()`.
  - **Config accepts only the directory (tenant) ID**, and names the variable when a domain is given.
  - **The connector holds its data folder.** It opens its outbox first with a new `exclusive` option. In SQLite's exclusive locking mode, the outbox keeps its file's lock for as long as it is open, and the operating system lets the lock go if the process dies, so a crash leaves nothing to clear. A second connector finds the file in use and stops with `data_folder_in_use`, before it opens Ring or dials the core. Mode A keeps its lease for the same purpose (DRIFT-001-49).
  - The image smoke names the tenant by an ID made at run time.
- **Not covered by a test**: that the production Ring home's close waits for `drained()`. That file is live wiring, excluded from tests; the adapter's own test covers the wait.
- **Requirement citation**: FR-029, FR-042, FR-044; plan "One connector per Ring account"; CP-10's review findings.
- **Resolution**: fixed after the owner chose to run another round (typed "1"). About 1 SP (estimate), booked where each fix's code is: 0.25 to CP-07, 0.25 to CP-08a and 0.5 to CP-10. $0.
- **Class closure**: the recurrence guards are four tests and five deliberate breaks, all caught:
  - **Tests**:
    - a close waiting for a token still being saved;
    - a tenant domain refused;
    - a held outbox file refused as `in_use`, and opened once let go;
    - a second connector refused before it opens its home.
  - **Breaks**:
    - the outbox never holding its file;
    - a held file reported as unavailable;
    - the home opened before the outbox;
    - a token save not kept;
    - a tenant domain accepted.
  - 1,147 tests: 1,025 pass and 122 skip without SQL Server; with SQL Server on 2 workers, 1,134 pass and 13 skip; coverage 97.7% of lines and 93.7% of branches; the image smoke passes.

### DRIFT-001-54: CP-10's review round 1: a core stop that waited on the home's link, and overview counts taken from cut lists

- **Detected**: 2026-11-10, review, CP-10's round 1 (run-20261109-235724885-f7a7e7cc), two findings, both minor. The first was reported as major and demoted by Specrew for naming no failure scenario.
- **Kind**: two defects: one in T027's code (CP-10), one in T021's Summary engine (CP-14). One additive field in the public contract
- **Observed**:
  - **The core's stop waited for the home's link.**
    - `stop()` waited for the HTTP server's close before closing the link server. Node's `closeAllConnections` leaves upgraded connections out, and a server's close waits for every connection, so with a home linked and heartbeating, the stop never finished.
    - A deploy stopping the old core would hang until the container was killed. The lease would go unreleased, so the next instance waited out its row.
    - The core service's WebSocket test always stopped the home first, so it never saw this.
  - **The overview's counts came from cut lists.**
    - A home too large for the token budget gets its four lists cut to a shared length. The text summary then reported the cut lengths as the home's totals, for example "5 offline" when 40 were, and the reply carried no totals or sign of the cut.
    - `list_devices` already reports its full `count`.
- **Decided**:
  - The core closes the home's links before it waits for the server, and its stop can be called twice safely. A test stops the core while a home is still linked: it failed (hung past 5 s) before the fix.
  - `get_overview`'s data gains `counts`, the whole home's total for each of its four lists. A cut list is shorter than its count. The text summary reports the counts and, when a list was cut, says "Some lists are shortened to fit; the counts are the whole home's."
    - An added field in the public contract (`contracts/mcp-tools.md`, `schemas/tool-replies.schema.json`). It is additive, and version 1 is not released before iteration 004 (FR-046, PT-07).
- **Requirement citation**: FR-001, FR-044, FR-046, SC-006; `contracts/mcp-tools.md` `get_overview`; CP-10's review findings.
- **Resolution**: fixed after the owner chose to run another round (typed "1"). About 0.75 SP (estimate): 0.25 booked to CP-10 and 0.5 to CP-14, whose code each fix changes, and $0.
- **Class closure**: the recurrence guards are three tests and four deliberate breaks, all caught:
  - **Tests**:
    - the core stopping with a home linked;
    - an oversized home's counts against its cut lists;
    - the overview text in both eras, whole and cut.
  - **Breaks**:
    - counts taken from the cut lists;
    - the text counting the listed devices;
    - the text never saying a list was cut;
    - the links closed after the wait.
  - 1,143 tests: 1,021 pass and 122 skip without SQL Server; with SQL Server on 2 workers, 1,130 pass and 13 skip; coverage 97.7% of lines and 93.7% of branches.

### DRIFT-001-53: the owner's choice (i): mode A approves its own home key at start

- **Detected**: 2026-11-10, implement, while doing T027 (DRIFT-001-49 raised it)
- **Kind**: a design record versus the owner's decision. data-model.md and `contracts/web-endpoints.md` amended
- **Observed**: data-model.md "Configuration" said enrolling a connector in mode A needs the owner's typed confirmation. Mode A's admin page comes only in iteration 004 (`contracts/web-endpoints.md`), so a real mode A start would have waited for an approval with no way to give it. Only the dev script and the tests, which approved the key themselves, showed mode A working.
- **Decided**: the owner chose (i) on 2026-11-10, typed "i", after asking for the decision to be explained.
  - Production mode A approves its own home key at start: `approveLocalKey` in `main.ts`.
  - The in-process home part has no network link, and mode A listens for no home part, so no other home can enroll.
  - Anyone who could reach the data folder would already hold the Ring token, so the confirmation would not stop them either.
  - The typed confirmation for mode A's risky actions (disarm, revoke all, delete now) is unchanged.
  - data-model.md's validation sentence names the exception, and the contract's mode A table gains a row for it.
- **Also corrected in the contract's mode A table**:
  - the connector link is in memory, not "not used" (DRIFT-001-49);
  - `/livez` and `/readyz` are not served in mode A (DRIFT-001-52).
- **Requirement citation**: FR-039, FR-045; data-model.md "Configuration"; `contracts/web-endpoints.md` "All-in-one mode (A)"; DRIFT-001-49.
- **Resolution**: applied as the owner chose. About 0 SP and $0.
- **Class closure**: NONE - a one-off decision on one sentence; the mode A end-to-end test and the image smoke already run mode A with the key approved at start.

### DRIFT-001-52: T027 part 6: one entry point, one image, and a real build in CI

- **Detected**: 2026-11-10, implement, while doing T027
- **Kind**: details the records leave open, versus the code. No spec change
- **Observed and decided**:
  - **`host/main.ts` is the one entry point**, picking the wiring by `BRIDGE_MODE`.
    - Each mode loads only its own wiring, by a dynamic import, so the connector never loads the Azure libraries or oidc-provider, and the core never loads Ring's library.
    - The log goes to stdout, except in mode A, whose stdout carries the MCP protocol: there it goes to stderr.
    - SIGTERM, SIGINT and, in mode A, the client closing stdin stop it cleanly. A fatal error stops it with exit code 1, for its service to restart it: the home cannot open, mode A's lease is lost, or a Ring connection is stuck.
    - Settings that fail their check stop it before anything starts, naming the variables only.
  - **Escaped errors**, the other half of the owner's (y) (DRIFT-001-35):
    - a rejection nothing handled, such as one from Ring's library, is logged, and the process goes on, since the (y) rule restarts it if Ring stays unreachable;
    - an uncaught exception is logged and stops the process, since its state is unknown.
  - **Production mode A** does not approve its home key at start. The owner is asked whether it should (DRIFT-001-49).
  - **Mode A has no (y) restart**: no service restarts a stdio server an agent started. A stuck Ring connection there shows as Ring unavailable in `get_health`, and the agent starting the server again brings it back.
  - **Carried forward to T030**: `/readyz` is not ready while another instance holds the lease. A deploy that waits for the new container's `/readyz` before stopping the old one would never switch over. So the deploy must not gate the switch on `/readyz`; check how App Service's slot swap and health check use that path.
  - **The image**, `bridge/Dockerfile`, serves the core and the connector:
    - Node 24.13.0 on Debian bookworm-slim. Node runs the TypeScript as it is, so there is no build step.
    - Only the bridge's production dependencies are installed, with no install scripts.
    - It runs as the `node` user, with `/data` its own, and exposes 8080 for the core. Node's experimental-SQLite warning is turned off in its log.
    - `.dockerignore` lets in only the package files and the bridge's source without its tests, so the dev script, the tests and the records stay out.
    - Size: 336 MB for linux/amd64.
    - It builds and runs for linux/arm64 too, checked here under emulation: a 133 s build, and the smoke below passing in 97 s.
    - **No ffmpeg in the image yet**: ring-client-api needs it only for live video, which comes in iteration 003. Carried forward to the media tasks.
  - **CI's build job builds the image** (linux/amd64) and runs `scripts/image-smoke.mjs` against it, in place of `npm run build --if-present`, which built nothing. This closes DRIFT-001-18's carry-forward.
    - The smoke starts each mode just far enough to fail on purpose: no settings; the core on an unreachable database; the connector without its key; mode A without its Secrets File, with its stdout empty.
    - It then checks that the image holds no tests, no dev script and no dev dependencies.
    - Nothing reaches Ring, Azure or Entra.
    - On its first run the build job took 75 s, against 48 s before: 22 s to build the image and 5 s for the smoke (measured, 2026-11-10). The test job grew by about 70 s with T027's new tests. The deploy (T030) builds linux/arm64 as well.
  - **For local runs on Windows**, Git Bash rewrites an argument such as `BRIDGE_DATA_DIR=/data` into a Windows path. Set `MSYS_NO_PATHCONV=1` when passing container paths to `docker run`.
- **Requirement citation**: tasks.md T027; FR-044, FR-045; DRIFT-001-18, DRIFT-001-35, DRIFT-001-49.
- **Resolution**: implementation choices, recorded for CP-10's co-review. About 0.5 SP against an estimate of 0.5 (estimates), and $0 beyond about 30 s more runner time per CI run (measured).
- **Class closure**: the image smoke runs in CI on every change. Deliberate breaks: 5, 4 caught. The one missed removed only `--omit=dev`, which `NODE_ENV=production` already gives npm; removing both was caught once the contents check also looked for the bridge's own dev dependency.
  - 1,140 tests: 1,018 pass and 122 skip without SQL Server (part 6 changes no tested source; with SQL Server, part 5's run stands: 1,127 pass and 13 skip); the image smoke passes on linux/amd64 and, under emulation, linux/arm64; lint, tsc, prettier and depcruise (282 modules) clean.

### DRIFT-001-51: T027 part 5: the connector, and the owner's (y) for a stuck Ring connection

- **Detected**: 2026-11-10, implement, while doing T027
- **Kind**: details the records leave open, versus the code; one option added to CP-07's Ring Adapter. No spec change
- **Observed and decided**:
  - **The connector** (`host/connector.ts`) runs the home part over a home side it is handed: the Secrets File and the Ring Adapter in production (`startRingConnector`), a simulated home in the tests.
    - It keeps its outbox (`outbox.db`) in the data folder, beside the Secrets File, with the Secrets File's key apart.
    - It dials `BRIDGE_CORE_URL` with `dialLink`, and takes its version from the package.
    - This closes DRIFT-001-23's carry-forward, with part 1's `wss:` check in Config.
    - A forbidden import of Azure, oidc-provider or the SQL Server driver into `connector.ts` fails the dependency check, which only now can fire (DRIFT-001-49).
  - **The owner's (y)** (DRIFT-001-35):
    - The Ring Adapter gains `onConnectionStuck`. It hears, once, that a hub's live connection has stayed counted closed (past its 30 s grace) for 5 minutes more while no call to Ring failed.
    - The check runs on every status update, not only on a change. A connection closed while calls fail stays `unavailable` when the calls recover, and the wait starts then.
    - The connector hands it to `onFatal` as `ring_connection_stuck`. The process ends and its service restarts it; `main.ts` does that (part 6).
    - The (y) choice's other half, logging a library error that escapes, belongs with the process handlers in `main.ts` (part 6).
  - **Health** [P]: the connector serves no HTTP in iteration 001. Its link and Ring status reach the core in each heartbeat, so `get_health` and the admin page show the home link down after `core_link_failed`, and its own log says why. Its service restarts it when it exits. This settles DRIFT-001-23's carry-forward on readiness.
  - **The enrollment code** comes from `BRIDGE_ENROLLMENT_CODE` until the Setup CLI keeps it in the Secrets File (T028). Without one, only an already enrolled key can link. (T028 keeps it there and removes the setting: DRIFT-001-57.)
  - **Still with T028**: an outbox lost while its key is kept, which restarts the home's version counter (DRIFT-001-36).
  - `LocalHome` and the outbox's file name moved to `host/home-assembly.ts`, so the connector does not import mode A's file. The host tests share a core fixture.
- **Requirement citation**: tasks.md T027; FR-005, FR-042; DRIFT-001-23, DRIFT-001-35, DRIFT-001-36.
- **Resolution**: implementation choices, recorded for CP-10's co-review; the stuck option is a change to CP-07's code. About 1 SP against an estimate of 1 (estimates), and $0.
- **Class closure**: the recurrence guards are these tests, each caught by a deliberate break:
  - 4 new adapter tests:
    - stuck, reported once even after a later call;
    - not while calls fail;
    - stuck 5 minutes after calls recover with the connection still closed;
    - not once the connection opens again.
  - 3 connector tests:
    - enrolment with its code, the owner's approval, the link over a WebSocket, and the inventory in the core's State;
    - "run the setup first" with no Secrets File;
    - a stuck connection handed to `onFatal`.
  - Deliberate breaks: 9, all caught, three of them forbidden imports into `connector.ts`. One, a stuck connection reported more than once, was missed at first and got the later call.
  - 1,140 tests: 1,018 pass and 122 skip without SQL Server; with SQL Server on 2 workers, 1,127 pass and 13 skip; coverage 97.7% of lines and 93.7% of branches.

### DRIFT-001-50: T027 part 4: mode H's core service, and the carry-forwards it closes

- **Detected**: 2026-11-10, implement, while doing T027
- **Kind**: details the records leave open, versus the code; one setting added to CP-16's Issuer. No spec change
- **Observed and decided**:
  - **Two files.**
    - `host/core-service.ts` runs the HTTP server in front of the core's components. It takes its database, secrets and owner sign-in already made, so the tests start it on SQLite with the stand-in Entra.
    - `host/core.ts` makes the real ones: Azure SQL and Key Vault through the core's managed identity, and the Entra sign-in, whose client assertion that identity signs. It is excluded from coverage like the other live wiring and is proved in the pilot. A forbidden import of Ring's library, or of the home's Ring wiring, fails the dependency check.
  - **The start, in order**:
    - **The migrations run first**, under their own lock on SQL Server. Two starts migrate once (`tsql.test.ts`). The `lease` table they create must exist before the lease can be taken, so this is how "migrations under the lease" is met. This closes DRIFT-001-46's carry-forward.
    - **The listed agents are seeded** from `BRIDGE_AGENTS` at each start, and one no longer listed is removed. The Issuer checks the listing on each use, so a removed agent's tokens are refused at once. Deleting its stored records is left to the later task that removes expired records (DS retention). This closes DRIFT-001-25's carry-forward, the seeding, apart from that deletion.
    - Then the lease, and the link while it is held (DRIFT-001-48).
  - **The Issuer**:
    - It is mounted under `/oauth`, its metadata also at the RFC 8414 path `/.well-known/oauth-authorization-server/oauth`, with `/sign-in/return` for the owner's return. A return that is not the Issuer's answers 404 until the admin page (T029).
    - **Proxy trust** is a new Issuer setting, from `BRIDGE_TRUST_PROXY`, off by default. With it, a request App Service's front end took over HTTPS counts as secure, and the Issuer's cookies are marked `Secure`; without it they are not. A test shows both.
    - **Its start is retried every minute [P] while its signing keys are missing.** T031 writes the first key after the core may already run. A live key swap is not built: rotation comes with the Scheduler. This settles PT-04's 10-minute reload for iteration 001.
    - This closes DRIFT-001-39's carry-forwards, except the return route's hand-off to the admin page (T029) and the deployment's owner id (T030, T031).
  - **The MCP endpoint** is at `/mcp`, with its protected-resource metadata. Its resource is the same URL the Issuer issues tokens for. It answers the public URL's host name (its host check compares names without the port) and takes Config's `readsPerHour`. This closes DRIFT-001-42's and DRIFT-001-44's carry-forwards.
  - **The home's link** is upgraded to a WebSocket at `/link`; anything else that asks for an upgrade is closed. The link server's `onLink` is the lease-gated Connector Link. On stop, the HTTP server and the link server close before the core stops and the database closes. This closes DRIFT-001-26's carry-forward.
  - **`/livez`** answers while the process runs. **`/readyz`** answers 200 only when:
    - the database answers within 2 s;
    - this instance holds the lease;
    - the signing keys are loaded;
    - the owner's object id is configured.
    - Otherwise it answers 503, naming each check's state, never a secret.
- **Requirement citation**: tasks.md T027; FR-029, FR-030, FR-044; `contracts/web-endpoints.md`; data-model.md "Configuration"; DRIFT-001-25, DRIFT-001-26, DRIFT-001-39, DRIFT-001-42, DRIFT-001-44, DRIFT-001-46.
- **Resolution**: implementation choices, recorded for CP-10's co-review; the proxy setting is a change to CP-16's code. About 1.5 SP against an estimate of 1 (estimates), and $0.
- **Class closure**: 5 service tests and 1 Issuer test:
  - `/livez`, and `/readyz` ready;
  - not ready, naming missing signing keys and a missing owner, then the Issuer started once the keys appear;
  - not ready while another core holds the lease;
  - the RFC 8414 metadata, the MCP endpoint's metadata, 401 without a token, and 404 elsewhere;
  - a home linked over WebSocket whose inventory lands in State;
  - the listed agents seeded, and one removed at the next start;
  - the Issuer's cookies `Secure` behind a trusted proxy, and only then.
  - Deliberate breaks: 9, all caught, two of them forbidden imports into `core.ts`.
  - Not covered by a test at the service level: that the service hands `BRIDGE_TRUST_PROXY` to the Issuer.
  - 1,134 tests: 1,012 pass and 122 skip without SQL Server; with SQL Server on 2 workers, 1,121 pass and 13 skip; coverage 97.7% of lines and 93.6% of branches.

### DRIFT-001-49: T027 part 3: mode A over stdio, and what its end-to-end check found

- **Detected**: 2026-11-10, implement, while doing T027
- **Kind**: details the records leave open, versus the code; one record corrected (DRIFT-001-42); one defect in Core Link and Connector Link (CP-09's code) and one in the dependency check's configuration (CP-01's), found and fixed. No spec change
- **Observed and decided**:
  - **Mode A** (`host/all-in-one.ts`) runs the core and the home part in one process, with the MCP endpoint over stdio:
    - the core's database (`bridge.db`) and the outbox (`outbox.db`) in the data folder [P];
    - the in-process link pair, now labelled for mode A as well as tests (its hold and drop controls stay for tests);
    - no Issuer and no HTTP;
    - the log on stderr.
  - **No Azure in mode A.** A new dependency rule keeps the Azure libraries, oidc-provider and the SQL Server driver out of everything `host/all-in-one.ts` and the dev script reach. This closes DRIFT-001-26's carry-forward.
  - **The home side is handed in.** In production, `host/ring-home.live.ts` opens the Secrets File (`secrets.sealed` [P]) and the Ring Adapter, and writes a rotated Ring token back. With no Secrets File, the process stops with "run the setup first" (T028 makes the file). The dev script and the tests hand in the scenario engine.
  - **The home's key** waits for the owner's typed confirmation, as data-model.md "Configuration" says, and the admin page comes with T029. The dev script and the tests approve it at start. The owner is asked whether production mode A should do the same.
  - **The dev script**, `npm run dev:all-in-one` (`bridge/dev/all-in-one-scenario.ts`), runs mode A with the simulated home of about 100 devices, no Ring account and no secrets. `tsconfig.json` now includes `bridge/dev`. The production image leaves it out (part 6).
- **Found by the end-to-end check**:
  - **The SDK's stdio client starts the server twice when the era is pinned to 2026-07-28.** It first runs a short-lived copy to learn the era, then ends it by closing its stdin and sending SIGTERM, then SIGKILL a second later. On Windows SIGTERM ends a process at once, with no clean-up.
    - This corrects DRIFT-001-42, which said the client in `auto` mode starts the server twice and that pinning the era avoids it. Measured: the pinned client started two processes on the same data folder, and the default client started one.
    - The second process found the lease held by the first, so its home part never linked.
  - **What changed for it**:
    - **Mode A's lease timing is shorter [P]**: renewed every 2 s, the row lasting 6 s. The Lease takes an optional timing for this; mode H keeps the recorded 15 s and 45 s. A copy ended without clean-up holds the folder for at most 6 s.
    - **The home part, with its Ring connection, opens only once the process holds the lease.** So a second process on the folder never reaches Ring while the first runs. Two Ring clients on one refresh token could otherwise break each other if Ring invalidates the old token when it rotates.
    - **A process that loses the lease ends.** Mode A is a single process.
  - **A defect in CP-09's code, found and fixed.**
    - A home session started on a link that was already closed (mode A's first dial, refused before the lease) still set its 30 s handshake timer, and nothing cancelled it.
    - So mode A stayed alive for up to 30 s after stdin closed. It now ends at once.
    - In mode H the same leftover timer was harmless: it fired, logged and closed a closed link.
    - Connector Link's session had the same flaw for a link closed before it was accepted. Its timers now start only while the session is open.
- **A defect in the dependency check's configuration (CP-01's), found and fixed.**
  - Its `exclude` pattern dropped every path holding `dist/` or `coverage/`, packages in `node_modules` included. The Azure libraries ship from `dist/`, so the edge to them vanished, and a rule about reaching them could never fire.
  - So the connector's rule, "reaches no Azure library", has never been able to catch one, and the new mode A rule missed an Azure import in a deliberate break.
  - It now excludes only the project's own `dist/` and `coverage/`. The graph grew from 261 to 275 modules, with no violation.
  - A forbidden import broke each rule whose source file exists today, 6 of 6 caught: mode A reaching Azure, oidc-provider or the SQL Server driver; the dev script reaching Azure; Ring's library outside the Ring Adapter; `ws` outside the Link transport. The core's and the connector's rules get the same check when parts 4 and 5 add their files.
- **Pilot checks**:
  - At the very first start, a probing host's short-lived copy is the first process and takes the lease. It opens its home part at its first check, 1 s on. Whether a host's copy lives that long, and so briefly reaches Ring, shows in the pilot.
  - Whether Ring invalidates a refresh token when it rotates.
- **Requirement citation**: tasks.md T027 and "Checkpoint" (US1 end to end in mode A); FR-044, FR-045; data-model.md "Configuration"; DRIFT-001-26, DRIFT-001-42, DRIFT-001-46.
- **Resolution**: implementation choices, recorded for CP-10's co-review; the Core Link fix is CP-09's code. About 1.5 SP against an estimate of 1 (estimates), and $0.
- **Class closure**: a rule that cannot fire is checked by breaking each rule once, as above. The leftover timer's class is "a timer set after the thing it guards may already have ended". Each place that sets a timeout after registering an end listener was checked:
  - Core Link's handshake: fixed, with a test;
  - Connector Link's timers: the same flaw, fixed, with a test that failed before the fix;
  - the Lease's write deadline and the MCP endpoint's token-check deadline: each cancelled in `finally`.
  - Tests:
    - mode A end to end over stdio in both eras, the four read tools on the simulated home, about 17 s to 24 s each;
    - a second mode A process on one folder never opening its home part while the first holds the lease, then taking over;
    - a home that cannot open, reported;
    - Core Link and Connector Link leaving no timer on a link closed before their session;
    - the Lease's shorter timing.
  - Deliberate breaks: 7 for mode A, all caught, and 6 for the dependency rules, all caught.
  - 1,128 tests: 1,006 pass and 122 skip without SQL Server; with SQL Server on 2 workers, 1,115 pass and 13 skip; coverage 97.7% of lines and 93.6% of branches; lint, tsc, prettier and depcruise (275 modules) clean.

### DRIFT-001-48: T027 part 2: the shared assemblies, and the lease gating the link and Event

- **Detected**: 2026-11-09, implement, while doing T027
- **Kind**: details the records leave open, versus the code. No spec change
- **Observed and decided**:
  - **Two shared assemblies.**
    - `host/core-assembly.ts` builds the stores, the managers, the lease, and the connector link with Event. It reaches no Azure library, oidc-provider or SQL Server driver: mode H adds those in `core.ts`.
    - `host/home-assembly.ts` builds Ingest, Core Link and the scheduler over a Ring port it is handed: the Ring Adapter in production, the scenario engine in development and tests. It reaches no Ring library.
    - Mode H's core, the connector and mode A use these. Hand-wired, with no container (CD3, CD5).
  - **The lease's name is fixed**, `ring-account` [P]. One deployment serves one Ring account, and the core keeps no Ring account key. This closes DRIFT-001-46's carry-forward.
  - **The lease gates the link and Event**, the only writer of State. This closes DRIFT-001-46's carry-forward and makes the comments in `connector-link.ts` and `event-manager.ts` true.
    - Without the lease, a new link is closed as `core_unavailable`, and the home dials again with its backoff.
    - Each lease term gets a new Connector Link and Event manager, because Connector Link's stop is final.
    - When the lease is lost, Connector Link closes every link as `core_stopping` and finishes their last steps, then Event stops, with its timer that marks the home offline. A new term starts only once the last one has ended.
    - The gate checks the lease every second [P], well inside the 15 s between the end of a hold and the end of its row.
    - Event's intake also checks the lease on each message. A refused message stays unacked, and the home sends it again.
    - Log lines: `core_lease_acquired`, `core_lease_lost`, `core_lease_term_end_failed`, `event_silence_check_failed` and `pub_sub_handler_failed`.
  - **Test support** gains `driveUntil` and `driveFor`, which move the fake clock in small steps while real I/O runs.
- **Requirement citation**: tasks.md T027; FR-044; data-model.md "Single writer"; DRIFT-001-46.
- **Resolution**: implementation choices, recorded for CP-10's co-review. About 1 SP (estimate) and $0.
- **Class closure**: 5 tests:
  - the home and the core link up in one process, the inventory lands in State, and a live change follows on the same link;
  - a standby core refuses a link;
  - a holder that loses its lease hands the link over, both are never serving at once, and the home links to the new holder;
  - the intake's guard, held and not held.
  - Deliberate breaks: 9, all caught. One, Ingest never started, was missed at first and got the live-change check.

### DRIFT-001-47: T027 part 1: Config's settings for each run mode

- **Detected**: 2026-11-09, implement, while doing T027
- **Kind**: details the records leave open, versus the code. No spec change
- **Observed and decided**:
  - Config read only six common settings. Each run mode now adds its own, read once the mode is known. An error names every bad variable of both groups, never a value.
  - **Mode H's core**:
    - `BRIDGE_PUBLIC_URL`, the core's public origin. The Issuer (`/oauth`), the MCP endpoint (`/mcp`), the link (`/link`) and the sign-in return hang off it, and its host is the one the MCP endpoint answers to. Those uses come with part 4.
    - `BRIDGE_PORT`, 8080 by default.
    - `BRIDGE_TRUST_PROXY`, off by default.
    - `BRIDGE_SQL_SERVER` and `BRIDGE_SQL_DATABASE`, `BRIDGE_KEY_VAULT_URL`, and `BRIDGE_MANAGED_IDENTITY_CLIENT_ID`.
    - `BRIDGE_ENTRA_TENANT_ID` and `BRIDGE_ENTRA_CLIENT_ID`.
    - `BRIDGE_OWNER_OBJECT_ID`. Unset, every sign-in is refused (DRIFT-001-39).
    - `BRIDGE_AGENTS`, the listed agents as JSON, checked strictly. Unset means none, and since the listing is seeded from it at each start, an agent left out is removed.
  - **The connector**:
    - `BRIDGE_CORE_URL`, `wss:` only. This closes DRIFT-001-25's carry-forward: the config refuses a URL that is not `wss:`.
    - `BRIDGE_DATA_DIR` (the outbox and the Secrets File) and `BRIDGE_SECRETS_KEY_FILE` (the key, kept apart).
    - `BRIDGE_FFMPEG_PATH`, `ffmpeg` from the path by default.
    - `BRIDGE_ENROLLMENT_CODE`, optional, until T028 keeps the code in the Secrets File. (Removed in T028: DRIFT-001-57.)
  - **Mode A**: `BRIDGE_DATA_DIR`, `BRIDGE_SECRETS_KEY_FILE` and `BRIDGE_FFMPEG_PATH`.
  - Plain `http:` or `ws:` is accepted only to this machine, for local runs. A URL with a user name or password is refused.
  - The variable names and defaults are [P].
- **Requirement citation**: tasks.md T027; data-model.md "Configuration"; DRIFT-001-25, DRIFT-001-39 and DRIFT-001-46.
- **Resolution**: implementation choices, recorded for CP-10's co-review. About 0.5 SP (estimate) and $0.
- **Class closure**: 35 Config tests, at 100% of lines and branches. Deliberate breaks: 11, all caught:
  - an `https:` core URL;
  - plain `ws:` off this machine;
  - a public URL with a path;
  - a URL with a password;
  - an agent with unknown fields;
  - proxy trust on by default;
  - an unset owner kept as a key;
  - an unbounded enrollment code;
  - the mode's errors dropped when a common one fails;
  - settings frozen only at the top;
  - an empty value counted as set.

### DRIFT-001-46: T026's Lease: the hold ends before the row, and what T027 must decide

- **Detected**: 2026-11-09, implement, while doing T026
- **Kind**: details the records leave open, versus the code. No spec change
- **Observed and decided**:
  - **One statement takes or keeps the lease** on each dialect: SQLite's `INSERT … ON CONFLICT … DO UPDATE … WHERE`, and SQL Server's `MERGE … WITH (HOLDLOCK)`. It writes only when the row is absent, already this instance's, or expired. Five instances asking at once get one holder, on SQLite and on SQL Server with read-committed snapshot.
  - **The hold ends 15 s before the row** [P]. The records say "renewed every 15 s, expiring after 45 s", and each instance compares times on its own clock. So the holder counts on the lease for 30 s from the start of its last successful renewal, while the row blocks others for 45 s. Two instances whose clocks differ by up to 15 s never both hold it.
    - The time is read before the write, so a slow write stretches neither the hold nor the row.
    - Between the holder's hold ending and the row expiring, nobody holds the lease: up to 15 s more of the fail-closed gap, and $0.
  - **Fail closed**: a renewal that finds another holder drops the hold at once. A failed write, or one past its 10 s deadline [P], does not extend it, and the hold runs out by itself.
  - **One write at a time**: a renewal while one is in flight joins it.
  - **Stopping** drops the hold at once, waits for the write in flight, then removes only this instance's row, so the next instance takes over at its next renewal. A row it cannot remove expires by itself.
  - **Status for `/readyz`**: held until a time, or not held with a reason: `not_started`, `held_elsewhere`, `store_unavailable`, `expired` or `stopped` [P].
  - **The holder's id** is the Host's choice, or a random one by default [P].
  - Lease takes only `dialect` and `run` from the Query layer, so its tests take one instance's database down or slow on its own.
- **Carried forward to T027**:
  - **The lease's name.** The core has no Ring account key: one deployment serves one Ring account, with one home part (data-model.md, Settings). T027 names the lease with one fixed value per deployment.
  - **What the lease gates in iteration 001.** `connector-link.ts` and `event-manager.ts` say the lease keeps one core running them. T027 wires that: without the lease, the core does not run the connector link or write State.
  - **Migrations "under the lease"** (research.md, "Migrations"). On an empty database the `lease` table does not exist until migration 1 runs. T027 decides how the first migration runs.
  - `/readyz` reads `status`.
- **Requirement citation**: tasks.md T026; FR-044; data-model.md "Single writer" and the Lease row; research.md R25 "Single-instance lease"; spec Edge Cases "A second bridge instance starts".
- **Resolution**: implementation choices, recorded for CP-10's co-review. About 1 SP against an estimate of 1 (estimates), and $0.
- **Class closure**: the tests run on SQLite and on SQL Server: one holder of two and of five, renewal for 5 minutes, a lapse with the holder's database down and the handover only after the row expires, a return, clocks 15 s apart, a clock past the margin, a handover on stop, a release after the write in flight, a write past its deadline, a slow write, and start and stop guards. Deliberate breaks: 19, all caught. Two missed at first, and each got a test:
  - a renewal that finds another holder keeping the hold;
  - a start after stop leaving a timer.
  - CI: the Lease tests share one database per run, after CI's first run on 9d663d8 failed three timing-based tests in `tsql.test.ts` while they made 13 databases at once; a rerun passed.

### DRIFT-001-45: CP-15's review follow-up: a code or refresh token redeemed twice at once

- **Detected**: 2026-11-09, review, CP-15's round (run-20261109-185805237-2a0a159a), in CP-16's code (T022, T023)
- **Kind**: a defect, found by review. No spec change; one contract rule made explicit
- **Observed**:
  - oidc-provider checks that a code or refresh token is unused, reads the account and the grant, then asks the adapter to consume it. Grants marked the record without a condition, so two redemptions at the same moment both passed the check, and both got tokens.
  - A stolen refresh token sent at the same moment as the agent's own refresh therefore escaped the reuse check that ends the grant. The thief could keep refreshing for up to 90 days, unless the owner removed the agent first.
  - A test that holds both requests until each has read the record showed it: both answered 200, for a refresh token and for an authorization code.
- **Decided**:
  - Grants' `consume` marks a record only if it is unused and its time is not up, in one statement. It says what it did: marked it; found it used already, with its grant; or found nothing to use.
  - The adapter refuses the redemption that loses with `invalid_grant`. When the record was used already, it first ends the grant: `revokeGrant` removes the grant's own record and every record of it, in one statement.
  - A pushed authorization request belongs to no grant. One that loses is refused with `invalid_request_uri`, as oidc-provider refuses a used one.
  - With the grant gone, the tokens the winning request saves are refused too, because the MCP endpoint's check and the refresh flow both need the grant. So both sides lose their tokens, and the owner links the agent again, as for any reuse.
  - Every SQL Server test database now runs with read-committed snapshot on, which is Azure SQL's default, so the tests read as the bridge's database will. The whole suite passes that way. Five redemptions at once mark the record once on both databases.
  - Neither kind of reuse is logged, as before.
- **Pilot check**: an agent that refreshes the same token twice at once now always loses its link. Before, it usually kept two token chains. Whether any listed agent does that shows in the pilot, as a link the owner has to make again.
- **Requirement citation**: FR-029; `contracts/web-endpoints.md` "Rules" (refresh tokens rotate); CP-15's review finding `finding-fc255d1df613a041`.
- **Resolution**: fixed before T026, as the owner chose when stopping CP-15's review. About 1 SP against an estimate of 0.5 (estimates), the test databases' change included, and $0, with no Ring calls.
- **Class closure**: the class is "check a single-use record unused, wait on other work, then mark it used". Every single-use record in the bridge was checked:
  - codes, refresh tokens and pushed requests are marked in one statement (this fix);
  - the connector's enrollment code was already claimed by one conditional UPDATE whose count is checked (`settings-store.ts`, `ACTIVATE`);
  - a pending Entra sign-in is taken from memory in one synchronous step (`pending-sign-ins.ts`, `take`).
  - Tests: the two races at the Issuer, the store's single winner and lost claims on both databases, ending a grant, and the adapter's refusals. Deliberate breaks: 12, all caught.

### DRIFT-001-44: T025's read rate limit and the read latency check

- **Detected**: 2026-11-09, implement, while doing T025
- **Kind**: details the records leave open, versus the code. No spec change
- **Observed and decided**:
  - **The limit** is an hour that slides, for each agent: Config's `readsPerHour`, 600 by default, counted by the token's client id.
    - The counts live in memory and start again on a restart.
    - A read over the limit answers `RATE_LIMITED`, retryable, with `retry_after_s`: the seconds until the agent's oldest read in the hour leaves it.
    - A refused read is not counted, so an agent that keeps asking is not locked out for longer.
    - The limit is checked before anything is read.
    - In mode A, the local client's reads count as one client, `local` [P].
  - **The latency check** (the `bridge-latency-budget` gate, plan "Performance Goals") runs in CI with the rest of the suite.
    - It makes 25 calls to each of the four read tools on the 100-device home, in each era, and requires the 95th percentile within 0.5 s.
    - Each call is timed around the SDK client over loopback HTTP, so the client's own work counts against the bridge.
    - On the developer's machine, 100 calls took under 0.5 s in all, about 5 ms a call (derived).
    - It runs on SQLite. The pilot measures it on Azure SQL.
  - The completeness check's waiting list is now empty: `RATE_LIMITED` is seen in both eras.
- **Carried forward**: **T027** passes Config's `readsPerHour` to the endpoint.
- **Requirement citation**: tasks.md T025; FR-026, SC6; plan "Performance Goals"; `contracts/errors.md` "Notes".
- **Resolution**: implementation choices, recorded for CP-15's co-review. About 1 SP against an estimate of 1 (estimates), and $0.
- **Class closure**: the limit's own tests, the limit through MCP in both eras, the latency check, and the completeness check. Deliberate breaks: 9, all caught:
  - the limit never refusing;
  - a refused read counted;
  - every agent sharing one count;
  - an hour-long retry time;
  - a read never leaving the hour;
  - the tools not asking the limit;
  - no retry time;
  - a slow bridge (600 ms a call);
  - `RATE_LIMITED`'s test removed.

### DRIFT-001-43: Entra tokens from Azure-hosted agents are promised for iteration 001, but no task builds them

- **Detected**: 2026-11-09, implement, in the check after T024
- **Kind**: a planning gap between `contracts/web-endpoints.md` and tasks.md. No code yet
- **Observed**: the MCP endpoint's row says Azure-hosted agents may present an Entra token for the bridge's app from a listed managed identity, in iteration 001 (SC2; research.md "Machine identities"). No task builds it, and T024 accepts only the Issuer's tokens, so such an agent is answered 401.
- **Options** (the owner's choice):
  - **(a) Build it in iteration 001.**
    - The endpoint would also accept an Entra access token for the bridge's app registration, checked against Entra's published keys with jose (already a dependency).
    - The token must come from a managed identity listed in Settings, with an app role for `read`.
    - The quickstart would gain the app-role steps.
    - About 1.5 SP (estimate) and $0. It is a second way in, so a second thing to review.
  - **(b) Move it to the iteration that first lists an Azure-hosted agent**, with the contract's row saying so. 0 SP now and $0. No agent planned for iteration 001's pilot is Azure-hosted: ChatGPT, Claude and the dot link through the Issuer (research.md SC1).
- **Recommendation**: (b).
- **Requirement citation**: `contracts/web-endpoints.md` "MCP endpoint"; research.md SC1 "Machine identities"; SC2.
- **Resolution**: the owner chose (b) on 2026-11-09. The MCP endpoint's row in `contracts/web-endpoints.md` now says that Entra tokens from Azure-hosted agents come with the iteration that first lists such an agent. That iteration's plan carries the work: about 1.5 SP (estimate) and $0 as priced here. Cost now: 0 SP and $0.
- **Class closure**: NONE - a planning gap closed by the contract edit, with no code. In iteration 001 the endpoint accepts only the Issuer's tokens, which T024's tests check.

### DRIFT-001-42: T024's MCP Endpoint: both eras on one endpoint, the Issuer's token check, and the contract's own input errors

- **Detected**: 2026-11-09, implement, while doing T024
- **Kind**: implementation choices and details the records leave open, versus the code. No spec change
- **Observed and decided**:
  - **The endpoint** is `/mcp` [P], one Streamable HTTP endpoint for both protocol eras.
    - The SDK's `createMcpHandler` serves the 2026-07-28 era, and the earlier era without sessions (`legacy: "stateless"`). In the earlier era a GET or DELETE answers 405: iteration 001 sends nothing unasked. Listening comes with iteration 002, in the 2026-07-28 era.
    - The SDK serves one request per server, so a new one answers each request.
  - **Tokens.** Access tokens are opaque, so the endpoint asks the Issuer about each one (`Issuer.checkAccessToken`). The token must be:
    - stored and unexpired;
    - for the one resource;
    - under a grant still in force for the same owner and client;
    - from an agent still listed, for `read`.

    A revocation takes effect on the next call. The answers:
    - a missing or bad token: 401;
    - a token without `read`: 403;
    - each of those carries `WWW-Authenticate` naming the protected-resource metadata;
    - while the Issuer cannot check (no keys yet, or its store down): 503 with `Retry-After: 30` [P], so an agent keeps a token that may be fine instead of asking the owner to link again;
    - a check the Issuer has not answered within 5 s [P], on the Clock: also 503, never 500. The Issuer's own store calls may take up to 10 s;
    - a check that fails unexpectedly: 500, logged.
  - **The protected-resource metadata** (RFC 9728) is at `/.well-known/oauth-protected-resource/mcp`. It names the endpoint, the Issuer and the `read` scope, and may be read from any origin [P]. One configured value is the Issuer's `resource`, the endpoint's URL and the metadata's `resource`. The end-to-end test links an agent at the real Issuer and reads with its token in both eras.
  - **Hosts.** The `Host` header must be one of the core's names (DNS rebinding). A request that carries `Origin` is refused, since agents call from servers, not web pages [P]. **Carry-forward to the pilot:** confirm that the listed agents send no `Origin` header.
  - **The budget as agents receive it** (the carry-forward from T020). The whole tool result of the 100-device home's overview and of its device list stays within 8,000 tokens in both eras: the structured reply, its line of text, and the era's own metadata.
  - **Inputs** are listed exactly as `schemas/` publishes them, but checked by the endpoint, which answers the contract's `INVALID_ARGUMENT` envelope. The message names the fields and never repeats a value.
    - The SDK checks a tool's input itself and answers with its own text ("Input validation error: …"), and the method that builds that answer is private (T011 recorded this).
    - It accepts any Standard Schema for an input, though. Each tool's input is a Standard Schema that lists the contract's JSON Schema as zod writes it and accepts every value.
  - **Replies** are parsed through the tool's reply schema before they leave. That keeps out any field the contract does not declare, which the agent's client would refuse: zod writes `additionalProperties: false`.
  - **Error answers**:
    - the 60 s deadline runs on the Clock and wins even over a read that never looks at its signal. It answers `TIMEOUT`, which a read may retry;
    - `BRIDGE_UNAVAILABLE` says to retry after 30 s [P];
    - `INTERNAL` is the bridge's own words, with the failure logged and never shown.
  - **Text content**: one line per reply, with when and how fresh, and never Ring's text.
  - **Tools are marked read-only** (`readOnlyHint`) [P]: some agents ask the user before calling a tool not so marked.
  - **Mode A** serves the same tools over stdio, with no token, to the process that started the bridge. The log must go to stderr then (`createStdoutSink(process.stderr)`), since stdout carries the protocol. No unauthenticated localhost HTTP endpoint is served: how local clients would authorize one is G14, carried to iteration 004.
  - **The completeness check** reads `contracts/errors.md`. Every iteration 001 tool must answer in both eras, and every code the table lists for them must be seen by a test, plus `INTERNAL` and `BRIDGE_UNAVAILABLE`. `RATE_LIMITED` is listed as waiting for T025, and the check fails if a test sees it before it is taken off that list.
  - **The SDK's own behaviour, probed** (2.4.0): the client checks a reply against the listed output schema but not an error result, so the error envelope reaches the agent in both eras. Its stdio client in `auto` mode would start the server twice to probe the era; the bridge's tests pin the era.
- **Carried forward**:
  - **T025**: the read rate limit, and then `RATE_LIMITED` comes off the completeness check's waiting list.
  - **T027**:
    - mounting `/mcp` and the metadata path;
    - the one `resource` value for the Issuer and the endpoint;
    - the allowed `Host` names from the core's public host;
    - in mode A, stdio with the log on stderr.
- **Requirement citation**: tasks.md T024; FR-030, FR-033, FR-034, FR-046, FR-048; `contracts/mcp-tools.md`, `contracts/errors.md`, `contracts/web-endpoints.md`; DRIFT-001-39 (opaque tokens).
- **Resolution**: implementation choices, recorded for CP-15's co-review. T024 was estimated at 1 SP and took about 3 SP (estimate), with the Issuer's token check, the end-to-end test, stdio and the completeness check. Cost $0.
- **Class closure**: tests in both eras through the SDK client, an end-to-end test with the real Issuer, stdio in both eras, and the completeness check. 25 deliberate breaks, 23 caught:
  - **the Issuer's check**: another resource, an ended grant, a revoked agent, a store that is down, an Issuer without keys;
  - **the door**:
    - a bad token let in;
    - a token without `read` let in;
    - 500 instead of 503;
    - the metadata not named;
    - a foreign `Host`;
    - a web page;
    - the metadata naming no Issuer;
    - a token check not raced against its deadline;
  - **the tools**:
    - the SDK's own input text;
    - a reply not parsed;
    - a deadline that only signals;
    - `TIMEOUT` as `INTERNAL`;
    - no retry time;
    - the location ids dropped;
    - a failure shown;
    - not read-only;
    - Ring's text in a summary;
  - **the completeness check**: an error test removed.

  Two misses:
  - **An expired token treated as good by the Issuer's own check.** That check stands behind two others, as accepted for T023 (DRIFT-001-39): the store hides an expired token, and the provider's lookup refuses one. The SDK also refuses a token past its `expiresAt` in any case.
  - **A token check past its deadline answering 500.** The break showed that the branch could never run: the deadline's own reason already answers 503. The branch was removed.

### DRIFT-001-41: CP-16's review found two gaps in the read path; fixed as follow-ups before T024

- **Detected**: 2026-11-08, implement, by CP-16's review round (run-20261108-192725666-de16690a). Both were reported as minor and outside CP-16. The owner chose to stop the review there and to have both fixed before T024.
- **Kind**: two defects in the read path, against FR-006 and FR-002 (CP-14, CP-07, CP-08a). The public contract gains an optional field, an additive change (FR-046). No spec change
- **Observed**:
  - **A camera's status could look current when it was old.**
    - The home reads a camera's or doorbell's battery and online status from Ring only with an inventory (DRIFT-001-21). Inventories come at a session's start and on the core's request.
    - A reply's `as_of` is the home's last heartbeat. So `list_devices` and `get_overview` could show a camera's old status as true at the latest heartbeat, for as long as the session lasted.
  - **An alarm device added or removed after the connector started went unseen.**
    - ring-client-api's device list only grows. It changes when a hub's list names a new device, and a device removed in Ring stays in it, so `getDevices` still returns it. Ring sends a hub's full list on each (re)connect of the live connection.
    - The adapter dropped a new device's first data, so nothing was sent until that device changed again.
    - A removed device was never left out of reads, and its subscription was never released.
- **Fix**:
  - **A camera's status carries its own time** [P].
    - Wherever a camera's or doorbell's battery or online status is given, an optional `as_of` says when Ring last reported it. That covers `list_devices` entries, and the overview's `offline_devices` and `low_batteries`.
    - The time is the one the home already stamps on each entry: when the inventory read it.
    - Other devices are kept current through Ring's live connection, so they carry none, and the reply's `as_of` covers them. `get_device` already gave every device its own `as_of`.
    - It makes no new call to Ring.
    - A periodic camera read was considered and not taken. FR-026 and DRIFT-001-18 keep polling off, and the spec names the risk of the account being blocked. The review asked for truthful observation times, which this gives. If wanted later: one call per location with cameras per read, for example every 15 minutes, 4 calls an hour and 96 a day (derived), $0 but more block risk. That is the owner's decision.
  - **The adapter follows each hub's device list** (`alarm-devices.ts`):
    - the first list it sees is the baseline, which the read that started watching returns;
    - a device in a later list is new. It is watched and reported as a change of the location's device list, a new `RingChange` kind, `device_list`;
    - a device its hub's latest list leaves out is removed. It is no longer read or watched, and it is reported the same way. One its hub lists again is back;
    - a list that names no device is taken as no list, never as every device gone. A device of another hub is left alone;
    - the narrow client types gained a device's hub (`assetId`) and the hubs' own lists (`onDeviceList`), and the compiler checks that the real `RingApi` still fits them.
  - **Ingest reads the home again on a device list change**, as on `inventory_request`, and queues the inventory.
    - The core applies it as a full snapshot, so a new device is added and a removed one dropped (T019's removal rule).
    - Changes that come during that read ask for one read more, not one each.
    - A read that fails leaves an inventory owed, which the 10 s tick reads again while a session is open.
  - **Contracts**: `mcp-tools.md` (the optional `as_of`), `connector-link.md` (when `inventory` is sent), and the published `schemas/tool-replies.schema.json`, which only adds.
- **Known limits**:
  - **Carry-forward to the pilot.** An added or removed sensor shows when Ring next sends its hub's list: on a reconnect of the live connection, or after a restart. Check on the owner's home how often that happens, and whether Ring sends a list unasked when a device is added. Asking for the list on a schedule would be polling: the owner's decision.
  - **A hub's list is taken as whole.** The removal rule reads one list message as everything the hub has, as the library does: its `getList` takes the next single message of that type from the hub, and it counts a hub's devices as known once one list from it has arrived. If Ring ever split a hub's list across messages, live sensors would be left out of replies until the next list. **Carry-forward to the pilot:** check that a hub's list arrives in one message.
  - On each reconnect, the library refreshes every listed device from the list, so each device is reported once more then. That was already so before this fix.
  - A camera or location added in Ring still shows only after a restart (DRIFT-001-21).
- **Requirement citation**: FR-002, FR-006, FR-026, FR-046; `contracts/mcp-tools.md`, `contracts/connector-link.md`; DRIFT-001-18, DRIFT-001-19, DRIFT-001-21.
- **Resolution**: fixed before T024. Cost: about 1.5 SP (estimate) and $0, in the actuals of CP-07 (0.5), CP-08a (0.5) and CP-14 (0.5).
- **Class closure**: a fake Ring client that keeps its device list as the library does, new tests, and 16 deliberate breaks:
  - The fake Ring client keeps its device list as the library does: the list only grows, it is emitted when it grows, the hubs' lists arrive with no replay, and each list refreshes the devices it names. A fake friendlier than the library hid DRIFT-001-21 the same way.
  - The scenario engine can add and remove a device.
  - New tests:
    - the adapter's six: the baseline not reported, an added device, a removed device, one listed again, another hub's list, a list naming no device;
    - Ingest's four: a fresh inventory with an added device, one without a removed device, one read more for changes during a read, an unexpected failure logged;
    - the Summary engine's and Inquiry's camera times.
  - Deliberate breaks: 16, all caught:
    - **the adapter**:
      - an added device not reported;
      - the first list reported at startup;
      - a removed device still read;
      - a removed device still watched;
      - another hub's list removing a device;
      - an empty list removing every device;
      - a device listed again not watched;
      - the adapter reading every device the library keeps;
    - **Ingest**:
      - a list change ignored;
      - one read for each change;
      - a change during a read dropped;
      - flush not waiting for the read;
    - **the camera times**:
      - a camera's status with no time;
      - every device with a time;
      - a camera's time not its own;
      - the contract leaving the time out.

### DRIFT-001-40: T023's sign-in was not bound to the browser that started the link; fixed before review

- **Detected**: 2026-11-08, implement, after T023 was committed (88aa173) and before CP-16's review, in a check before asking for the review round. Confirmed with a test, which failed on 88aa173.
- **Kind**: a defect against FR-029 and SC1 in T023 [P]. No spec change
- **Observed**: the Issuer found a sign-in in flight by its `state` alone and recorded the owner's consent before anything checked which browser had come back.
  - Someone could start a link from their own account on a listed agent, stop at the Entra sign-in, and send that link to the owner.
  - Had the owner opened it and signed in, possibly with no prompt at all, the owner check would have passed, since it really was the owner, and the consent would have been recorded on the other person's link.
  - That person's browser then holds the provider's resume cookie and would have received the code, so their agent account would have held tokens to the owner's home.
  - Neither "assignment required" nor the object-id check stops this.
- **Fix** [P]:
  - When the Issuer sends a browser to Entra, it sets a random cookie (`HttpOnly`, `Secure`, `SameSite=Lax`, 10 minutes) and keeps only its SHA-256 with the sign-in in flight.
  - Web hands the return to the Issuer with the browser's cookies.
  - A return without the matching cookie is refused before Entra's code is redeemed. The sign-in is used up, and the link ends with `access_denied`, so the browser that started it gets no code either. Web is told, so it can ask the owner to start the link again from the agent.
  - A second link started in the same browser replaces the cookie, so the first one must be started again.
- **Requirement citation**: FR-029, SC1; `contracts/web-endpoints.md` "OAuth content rules"; DRIFT-001-39.
- **Resolution**: fixed before CP-16's review round. Cost: about 0.5 SP (estimate), in CP-16's actual, and $0.
- **Carried forward**: T029's return route passes the browser's `Cookie` header to the Issuer, and the admin page's own sign-in keeps its sign-in in flight per browser in the same way.
- **Class closure**: new tests:
  - the attack itself: a link started in one browser and signed in from another gives neither browser a code;
  - a forged binding cookie is refused, the sign-in is used up, and the link ends with `access_denied`.

  Deliberate breaks: 4, all caught:
  - finishing a return in any browser;
  - accepting any binding cookie;
  - leaving the link open after a refused return;
  - setting no binding cookie.

### DRIFT-001-39: the Issuer (T023): only the owner signs in, how listed agents link, and what is carried forward

- **Detected**: 2026-11-08, implement, T023. The records said the owner consents through Entra and tokens are bound to the owner, but not how the bridge tells the owner apart from anyone else in the tenant, nor how an agent that registers itself (DCR) can be listed when its client id is new each time.
- **Kind**: decisions made at implement, two by the owner; one change to the reviewed sign-in client (T006); additions to the web-endpoints contract, the quickstart and the configuration [P]. No spec change
- **Decisions**:
  - **Only the owner signs in** (the owner's choice (c), 2026-11-08):
    - The sign-in client checks that the ID token's object id (`oid`) is the configured owner's, and refuses every sign-in while none is configured.
    - The quickstart adds the runbook step: "assignment required" on the app registration, with only the owner assigned. So Entra refuses others first, and the bridge checks again.
    - `oid` is used because Entra's `sub` differs per app and cannot be looked up in advance. Entra sends `oid` only with the `profile` scope, so the sign-in now asks for `openid profile`. Entra then also sends the person's name and username, which the bridge neither keeps nor logs.
    - The same check guards the admin page (T029), which uses the same client.
    - The owner also wants a second person they name to have access later, once that person has their own agent. That is a later feature; the check is one comparison, easy to widen to a list.
  - **Self-registering agents** (announced to the owner, no objection): a DCR registration is accepted only when every redirect URI it names is listed for one agent. That agent's listed client id is then only a name. The match is made again each time the client is used, so revoking or unlisting the agent ends the client.
  - **Client documents (CIMD)**: an agent is listed under its document's URL. The URL is checked before anything is fetched, so an unlisted one is never fetched, and every redirect URI the document names must be listed for it. oidc-provider implements CIMD draft-02. Whether that matches what ChatGPT and Claude publish is for spike S7, which has not run.
  - **Every link asks the owner**: no grant is reused from the provider's browser session, so each link is a fresh Entra sign-in.
  - **No client secrets**: the token endpoint takes `none` or `private_key_jwt` only, so no secret is issued or stored (SC4). If S7 shows an agent needs a secret, this is revisited.
  - **One resource, read only**: tokens are issued for the MCP endpoint alone (RFC 8707), with `read` only in iteration 001, even when an agent asks for more or is listed for more.
  - **Opaque access tokens**: the MCP endpoint checks each one against its stored grant, so a revocation takes effect at once. The signing keys then sign only ID tokens, when an agent asks for `openid`. PT-04's retirement timing (10 minutes plus the 1-hour access-token life) assumed signed access tokens; keeping it is harmless.
  - **Lifetimes**: access tokens 1 hour. Refresh tokens rotate on every use and live 30 days from the last use, never past 90 days from the sign-in that began the chain. The grant itself lives 90 days, and a reused refresh token ends the whole grant. Tokens never end with the provider's browser session.
  - **The key document**: `issuer-signing-keys` is `{"keys": [current, previous]}`, one or two private RSA JWKs for RS256 with distinct `kid`s, newest first. The provider signs with the first and publishes both. The cookie keys are derived from them (HKDF), so there is no second secret. The Issuer exports the key generator for the bootstrap (T031). A missing secret is reported, not thrown, for `/readyz` to name.
  - **Sign-ins in flight** are kept in memory under their `state`, once, for 10 minutes, at most 100, each bound to the browser that started it (DRIFT-001-40). A restart means the owner starts the link again.
  - **One clock**: oidc-provider reads `Date.now()`, so the clock the Issuer is given must read the same time: `SystemClock` in the bridge, and a faked `Date` in tests.
  - **ID tokens**: an agent that asks for `openid` receives an ID token carrying the owner's Entra `sub` for the bridge's app registration. That identifier is opaque and means nothing outside this app, so this is accepted.
  - **Typings**: oidc-provider's declarations are widened in `bridge/src/types/`, not taken from DefinitelyTyped (a new dependency).
- **Carried forward**:
  - **T024**: checking an access token: its resource, its client still listed, its scope. Also the protected-resource metadata.
  - **T027**:
    - mounting the Issuer, and trusting App Service's proxy for `https`;
    - serving the RFC 8414 metadata URL `/.well-known/oauth-authorization-server/oauth` (clients find it today at `/oauth/.well-known/openid-configuration`);
    - PT-04's 10-minute key reload;
    - `/readyz` naming a missing key or a missing owner object id;
    - the owner object id's environment variable.
  - **T029**: the one Entra return route hands a return, with the browser's cookies, to `Issuer.finishSignIn` first. It treats the return as the admin page's own when the Issuer answers that it is not its, and keeps the admin page's own sign-ins in flight per browser in the same way (DRIFT-001-40).
  - **T030 and T031**: the owner object id in the deployment configuration. The bootstrap sets "assignment required" if it creates the app registration, and writes the first key with the Issuer's generator.
- **Known gaps, noted**:
  - Anyone can start up to 100 sign-ins in flight with a listed agent's public details, pushing out the owner's; the owner then starts the link again.
  - The interaction route's check that its path names the interaction of the browser's cookie is not covered by a test.
  - Two rules are each guarded twice, so removing one guard alone is not caught: the 90-day limit (the refresh token's cap and the grant's life) and `read` only (the owner's consent and the resource's scope). Removing both guards of either is caught.
- **Requirement citation**: FR-029, FR-030, SC1, SC3, SC4; `contracts/web-endpoints.md` "OAuth content rules"; research.md PT-03, PT-04, PT-11, PT-18; spike S7.
- **Resolution**: built in T023. Cost: about 2.5 SP (estimate) against the task's 2, and $0.
- **Class closure**: new tests:
  - the sign-in client: someone else refused without naming their object id, no object id refused, an unset or blank owner refuses everyone, the comparison ignores case and spaces;
  - the Entra stand-in: it sends `oid` only with `profile`, as Entra does, and it can sign in a stranger from the same tenant;
  - the Issuer, end to end through the MCP SDK's own OAuth helpers:
    - the metadata;
    - a link by client document, bound to the owner's `sub`, the client and the MCP endpoint;
    - `read` only;
    - a stranger refused with `access_denied`;
    - every link asking the owner;
    - PKCE required;
    - an unlisted document never fetched;
    - an unlisted redirect URI refused;
    - a revoked agent refused with its document cached;
    - DCR only for a listed agent;
    - a registered client ended by its agent's revocation;
    - 1-hour access tokens;
    - rotation and the 30-day idle limit;
    - the 90-day limit with refreshes every 29 days;
    - a reused refresh token ending its grant;
    - an agent revoked while the owner signs in: refused, and its browser not sent back to it;
    - a link whose authorization ended first: `link_expired`;
    - a return that is not the Issuer's left to Web, and each return taken once;
    - an interaction link with no cookie: 400; Entra unreachable: 503; anything else: 500, logged;
    - both keys published and the current one signing;
    - a missing key secret answering 503;
    - bad key documents refused without quoting them;
    - cookie keys per key;
  - the sign-ins in flight: once, 10 minutes, at most 100;
  - Settings lists every agent in client-id order.

  Deliberate breaks: 36 mutations of the new code and the changed sign-in, restored from memory each time. 33 were caught. The three misses:
  - removing the refresh token's own 90-day cap, which the grant's 90-day life still enforces (caught when both are removed);
  - adding `media` to the owner's consent, which the resource's `read`-only scope still filters (caught when both are changed);
  - changing the resource server's own access-token lifetime, which `ttl.AccessToken` overrode. That dead value is removed, and changing `ttl.AccessToken` is caught.

### DRIFT-001-38: CP-14 review round 5 found that a change the home could not write left old data shown as current, and that a heartbeat that waited its turn counted as new; both fixed

- **Detected**: 2026-11-08, implement, CP-14 review round 5 (Codex). The reviewer reported two findings without a failure scenario, so Specrew kept them as minor. Each was checked against the code and is real.
- **Kind**: two defects against FR-005, FR-006 and SC-005, and a field added to the link contract's heartbeat [P]. No spec change
- **Observed**:
  - **A change the home could not write left old data shown as current.**
    - When a change Ring reported could not be written to the outbox (a full disk), Ingest noted only for itself that it owed an inventory.
    - Its heartbeats still said the Ring session was ok, and the core does not use the error counts they carry, so the old state showed `cached`, its `as_of` moving every 15 s, for as long as the disk stayed full.
    - A plain "owed" flag would not have been enough. An older inventory of the same session, sent again, could end the stale time early, and a heartbeat saying nothing was owed could reach the core before the inventory that paid it.
  - **A heartbeat that waited its turn counted as new.**
    - Connector Link takes a link's messages one at a time, and Event stamped a heartbeat with the time it took it, not the time it arrived.
    - If the core's store stalled for over 2 minutes while the home fell silent with its connection still open, a heartbeat taken late counted as a fresh sign of life, and the home showed up for up to 2 more minutes.
- **Fix**:
  - **The heartbeat names the debt** [P]:
    - `inventory_owed_after` is the newest `state_version` the home wrote before a change it could not write, or the latest such if changes keep failing;
    - it is set until an inventory read in the session is queued;
    - Ingest notes the last version each write the outbox kept drew.
  - **The core keeps the data stale until the debt is paid** [P]:
    - stale from the last sign of life before that heartbeat, until the core stores an inventory for that session with a higher `snapshot_version`;
    - an older copy sent again does not pay it, a heartbeat that owes nothing does not end it, and a debt that an inventory already stored for the session paid is ignored;
    - Event keeps both in memory and forgets them when a session opens, since a newly enrolled connector's versions start again; a core restart drops the link, and the next session owes its own refresh.
  - **A heartbeat counts when it arrived** [P]:
    - Connector Link stamps each frame with the core's time as it arrives;
    - Event counts the heartbeat at that time, checks for silence from then, never moves `as_of` back, and stores a home whose heartbeat arrived 2 minutes ago or more as offline, with no return published.
  - **A session's opening still counts when the core records it**: from its signed answer until `hello_ok` the home sends nothing, so that wait is the core's, and the data stays stale until the session's own inventory is stored anyway.
  - The link contract's heartbeat row, a new "A change the home could not write" rule and the "Heartbeat and home offline" section say so. The round-4 sentence on overlapping reads is corrected: a read that finishes after one begun later is dropped.
- **Requirement citation**: spec FR-005, FR-006 and SC-005; `contracts/connector-link.md` "Device inventory and state" and "Heartbeat and home offline"; PT-07; DRIFT-001-36 and DRIFT-001-37.
- **Resolution**: fixed after the owner chose to fix both and run one more round ("1"). Cost: about 2 SP (estimate: 1.5 for the first, 0.5 for the second), recorded in CP-14's actual, and $0.
- **Known gap, noted**: a `device_state` too large for one frame is logged and cleared without making an inventory owed (DRIFT-001-22), the same lost-state class. One device's entry cannot come near the 1 MiB frame limit, and owing an inventory there would read Ring every 10 s when the inventory itself is too large, so it is noted, not changed.
- **Class closure**: new tests:
  - Ingest: the heartbeat names the newest version written before a change it could not write, the later one after a second failure, and nothing once the session's own inventory is queued, which has a higher snapshot version and the change;
  - Event:
    - a debt keeps the data stale through an older copy and a heartbeat that owes nothing, until a higher inventory;
    - a debt already paid is ignored;
    - a session's opening forgets the debt and what paid it;
    - a heartbeat counts at its arrival, and the silence check runs from then;
    - one that arrived too long ago leaves the home offline, with no return published;
  - Connector Link: a heartbeat is stamped as it arrives, though Event takes it 3 minutes later;
  - Health engine: the debt's refresh, `as_of` never moving back, and `settled`;
  - both ends, with the real Event, State and Inquiry: a door change the home cannot write shows as stale within one heartbeat and stays so; once the disk recovers, the data is fresh and the door shows open.

  A deliberate break of fifteen parts was caught:
  - the heartbeat leaves out the debt;
  - the home names the first failure's version, not the latest;
  - the home keeps the debt after the session's own inventory is queued;
  - the home does not note the versions it wrote;
  - the core ignores the debt;
  - an older copy sent again pays it;
  - a debt already paid is owed again;
  - a heartbeat that owes nothing ends it;
  - a session's opening keeps the old debt;
  - a session's opening keeps what paid it;
  - Connector Link stamps a heartbeat when Event takes it;
  - Event counts a heartbeat when it takes it;
  - the silence check counts from then;
  - a late sign of life moves `as_of` back;
  - a heartbeat that arrived too long ago brings the home up.

### Resolution Strategies (Unused)

The following resolution strategies remain available if drift is detected later in execution:

- **spec-updated**: Update the spec to reflect implementation choice
- **implementation-reverted**: Revert implementation to match spec
- **deferred**: Mark drift as deferred to next iteration
- **human-decision**: Escalate to the owner for resolution

### Notes

- This artifact was scaffolded before review starts so drift can be logged immediately when detected.
- Replace the zero-drift summary with real counts when the first drift event is recorded.
