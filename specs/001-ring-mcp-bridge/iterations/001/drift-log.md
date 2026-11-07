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

**Total drift events**: 23
**Resolution rate**: 100% (3 resolved at plan and 1 at tasks on 2026-11-02; 4 before implement and 2 in implement on 2026-11-03; 1 in implement on 2026-11-04; 4 in implement on 2026-11-05; 4 in implement on 2026-11-06; 4 in implement on 2026-11-07)
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
- **Kind**: details the records leave open, one change to DRIFT-001-19's carry-forward, and one amendment to CD4's "one public entry file", for the owner to confirm or reject. No spec change
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
  - **Order at session open.** Ingest's outbox work runs one step at a time, so "everything is due again" finishes before anything is sent on the new link. A test drops a session that has an unacked inventory, and checks that the next session sends it first.
  - **Link messages: the receiver declares them, in a narrow second entry** (CD4, amended).
    - Core Link declares what the core sends: `challenge`, `hello_ok`, `enrolled`, `inventory_request` and `ack`, and the close reasons. They are in `connector/clients/core-link/messages/index.ts`.
    - Connector Link declares what the home sends: `hello`, `challenge_response`, `enroll`, `inventory`, `device_state` and `heartbeat`. They are in `core/clients/connector-link/messages/index.ts`. That folder is made now, ahead of T017, as DRIFT-001-14 did for the Ring port.
    - Each `messages/index.ts` imports only zod and the Link transport.
    - **Why a second entry:** without it, the home would reach the core's components, and their libraries, through Connector Link's own entry file. `connector-reaches-no-cloud-libraries` forbids that, and type-only imports count (`tsPreCompilationDeps`).
    - **The amendment to CD4:** a component may have a second entry, `messages/index.ts`, holding only the link messages it receives. `component-only-through-index` now allows exactly that.
      - Before, the rule allowed any nested `index.ts`. A deliberate break showed the loophole, and it is now closed.
      - **The owner may reject this.** The alternative is a separate schemas module for the link, as the Public Contract is for agents.
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
    - An outbox message too large for one frame is logged once by its `message_id`, cleared, and counted (`message_too_large`). The next inventory carries its state.
    - The logger gains a `message_id` field, an identifier.
  - **No secret on a frame.** A test runs enrollment, a session, the inventory and a heartbeat. It checks that the private key appears on no frame in any encoding: the DER and the raw seed, each as base64, base64url and hex. Only the public key, its id and the enrollment code go out (AC B5, SC4).
  - **Carry-forwards to T017:**
    - name keys with `signingKeyId`, check the signature with `verifyChallenge`, and send the close reasons above exactly;
    - put a time limit on a link that has not finished its hello, leaving room for an `enroll` that waits for the owner, up to PT-32's 10 minutes;
    - Connector Link's `onLink` handler must contain its own failures, because one thrown inside ws's upgrade callback ends the core process;
    - the TLS test uses a throwaway certificate made with `openssl` (the owner's choice a).
  - **Carry-forwards to T027 and T028:**
    - The Host wires `dial` to `dialLink` with the configured `wss:` core URL, and takes `connectorVersion` from the package.
    - The enrollment code's home store and its log line belong to T028. Logging the code needs a new log field, because the logger writes only declared fields.
- **Requirement citation**: tasks.md T016 and T017; `contracts/connector-link.md` "Frames", "Session start", "Heartbeat and home offline", "Enrollment and re-enrollment" and "Ordering, priority and guarantees"; data-model.md "Home part enrollment"; component-design.md CD4, X2 and the component map v3; spec FR-005, FR-032 and FR-042; implementation-rules.yml `code-rule.careful-retries`, `code-rule.concurrency-over-locks` and `code-rule.idiomatic-error-handling`.
- **Resolution**: implementation choices, recorded for the CP-09 co-review. The CD4 amendment awaits the owner's confirmation. Cost: 0 SP and $0.
- **Class closure**: 21 new tests run in the suite. Core Link's tests run over the in-memory pair, with the test playing the core, against the simulated home and a real outbox. A deliberate break of eleven parts was caught:
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
  - a link put in the slot before `hello_ok`.

  The narrowed dependency rule caught a nested `index.ts` that is not `messages/`.

### Resolution Strategies (Unused)

The following resolution strategies remain available if drift is detected later in execution:

- **spec-updated**: Update the spec to reflect implementation choice
- **implementation-reverted**: Revert implementation to match spec
- **deferred**: Mark drift as deferred to next iteration
- **human-decision**: Escalate to the owner for resolution

### Notes

- This artifact was scaffolded before review starts so drift can be logged immediately when detected.
- Replace the zero-drift summary with real counts when the first drift event is recorded.
