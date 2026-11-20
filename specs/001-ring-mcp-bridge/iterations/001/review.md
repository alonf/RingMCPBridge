# Review: Iteration 001

**Schema**: v1
**Reviewed**: 2026-11-15
**Overall Verdict**: accepted

## Task Verdicts

| Task | Requirement | Verdict | Notes |
| ---- | ----------- | ------- | ----- |
| CP-01 | FR-046, FR-047 | pass | T002 to T004: the scaffold, the toolchain and CI (lint, types, tests, dependency check, schema snapshot), green on every commit. Reviewed in the first implement round (cp-02) |
| CP-02 | FR-034 | pass | T005, T006: the utilities, with an allow-list logger (identifiers only, FR-034). Co-review cp-02-utilities-review, 4 rounds, every finding fixed with a test and a deliberate break |
| CP-03 | FR-006, FR-044 | pass | T007, T008: the query layer for SQLite and T-SQL, and migrations. Store tests run on both databases in CI. Co-review cp-03-query-layer-review. Migration 6 adds when a motion began, additive only, with an upgrade test from schema 5 as released (DRIFT-001-86) |
| CP-04 | FR-029, FR-001 | pass | T009, T010: the scenario engine (about 100 devices) and the Entra stand-in. Co-review cp-04-test-harness-review, round 2 passed |
| CP-05 | FR-033, FR-047, FR-048 | pass | T011: the four read tools' public contract, with untrusted marking. `schemas/` is checked in CI. Co-review cp-05-public-contract-review. `last_motion_at` is when the home first reported the motion, and its description says so; only the description changed in `schemas/` (DRIFT-001-86) |
| CP-06 | FR-032 | pass | T012, T028: the Setup CLI and the Secrets File. Live in the pilot: the owner's Ring login and 2FA, and a missing key now says to run the setup first (DRIFT-001-72). Reviewed in the CP-08a round. The Setup CLI keeps no answer history, so the hidden Ring password cannot come back on screen (DRIFT-001-87) |
| CP-07 | FR-026, FR-042 | pass | T013: the Ring Adapter behind the Ring boundary: limiter, circuit and backoff. Rooms added in the pilot (DRIFT-001-80). Reviewed in the CP-08a and CP-09 rounds, then CP-21a. A hub Ring calls offline counts Ring unavailable past the grace (DRIFT-001-86), and so does a live connection closed past the grace, from its reopen until each hub's device list comes (DRIFT-001-89) |
| CP-08a | FR-042 | pass | T014: the outbox: durable queue, ack, resend after 10 s. Co-review cp-08a-outbox-ingest-review |
| CP-09 | FR-032, FR-042, FR-046 | pass | T015 to T017: the link, versioned hello, enrollment check, heartbeat, reconnect. CP-09 rounds 3 to 5 found and fixed defects (DRIFT-001-27 to DRIFT-001-29). The request id is logged at both ends since T035 (DRIFT-001-84) |
| CP-10 | FR-044 | pass | T026, T027: the host for modes A and H, the single-instance lease, `/livez`, `/readyz`. CP-10 rounds 1 and 2 fixed (DRIFT-001-54, DRIFT-001-55). The Docker health check added in the pilot (DRIFT-001-72). Mode A ends on a stuck Ring connection, as the connector does (DRIFT-001-89) |
| CP-11a | FR-005, FR-006 | pass | T018: the link intake into State and the Health engine; the home is offline after 2 minutes. Live: the stale check in the pilot (T033 step 4) |
| CP-14 | FR-001, FR-002, FR-005, FR-006 | pass | T019 to T021: the Inquiry path, freshness and stale. CP-14 rounds 3 to 5 fixed the ways old data could look current (DRIFT-001-36 to DRIFT-001-38). The owner's time zone rule added in the pilot (DRIFT-001-81). A reply reads the health before the data, so it is never fresher than what it shows, and the overview gives when each motion began (DRIFT-001-86) |
| CP-15 | FR-026, FR-030 | pass | T024, T025: the MCP endpoint for both protocol eras, read scope and the read limit, within the 0.5 s latency budget. The reply's text carries its JSON since the pilot (DRIFT-001-82). Co-review in CP-15's round |
| CP-16 | FR-029, FR-030 | pass | T022, T023: the Issuer with Entra sign-in, listed agents only, token lifetimes. The link log added in the pilot (DRIFT-001-76). Co-review in CP-16's round. A registration naming a `sector_identifier_uri` is refused before the provider fetches anything, and its fetches for clients are bounded in size and number until their bodies are done (DRIFT-001-86, DRIFT-001-88) |
| CP-17 | FR-005, FR-032, FR-040 | pass | T029: the minimal admin page, at three widths, dark and light, in real browsers. The time zone card added in the pilot. Co-review in CP-17's round (run-20261110-230343975-312e4ebf) |
| CP-19 | FR-032, FR-044 | pass | T030 to T032: the Bicep and the deploy workflow. Deployed four times in the pilot, with a rollback ready. Co-review in CP-19's round (run-20261112-223556945-3034eaa2), signed off |
| CP-21a | FR-029, FR-042 | pass | T033: ChatGPT, claude.ai and Claude Code linked and read the home. The stale check and the Docker health check passed on the owner's home. The 7-day soak and the month's checks are deferred to iteration 002 with the owner's approval (DEC-001-01). The pilot's changes were co-reviewed in CP-21a's round, signed off partially on the owner's approval (DRIFT-001-83) |
| CP-RV | FR-001, FR-002, FR-005, FR-006, FR-026, FR-029, FR-030, FR-032, FR-033, FR-034, FR-040, FR-042, FR-044, FR-046, FR-047, FR-048 | pass | T001 (the hardening review, 2 rounds), T034 (co-review of every group, the last CP-21a) and T035 (this review's evidence: the drift check, `quality/`, the lenses, the reviewer artifacts, the quickstart walk). After T035: an independent review of `f3884bb` and the campaign's rounds 30 to 33, the last clean on `0431bcf` (Notes) |
| CP-RW | FR-001, FR-002, FR-005, FR-006, FR-026, FR-029, FR-030, FR-032, FR-033, FR-034, FR-040, FR-042, FR-044, FR-046, FR-047, FR-048 | pass | T036, the rework reserve: about 3.25 of 3 SP used (estimate), over the reserve by about 0.25: DRIFT-001-83's VM-script fix, the `request_id` logging (DRIFT-001-84), the writer test's seam, the independent review of `f3884bb` (DRIFT-001-86, the motion's own time on the owner's choice), and the co-review rounds' findings (DRIFT-001-87 to DRIFT-001-89), each fixed test-first. The overrun is reported at the retro |

<!--
  Review evidence marker (validator-enforced):
    The line below names the run(s) this record RESTS ON. Only what is named here - and the run named
    by the derived independent-review block - is checked against the review store. Run ids appearing
    anywhere else in this document are treated as NARRATIVE and are never checked, so a retraction may
    name a failed run freely without the record being refused for it.
    Leave it empty when the record rests on no campaign run. Do not name a run you are only discussing.
-->
<!-- SPECREW-REVIEW-EVIDENCE: run-20261115-170156800-64511f10 -->

<!-- SPECREW-DERIVED-INDEPENDENT-REVIEW v1 -->
<!-- Derived from the review authority store. Do not hand-edit: the validator recomputes it. -->
- Run: run-20261115-170156800-64511f10 (harness codex-cli-file-primary)
- Outcome: pass, complete, current, valid - 0 finding(s)
- Reviewed tree: d1d7e8f2a35bd04fe51adcd2796cca2a01cd98b6
- Coverage: 107 source path(s) of 116 declared and checked against the frozen target.
<!-- /SPECREW-DERIVED-INDEPENDENT-REVIEW -->

<!--
  Gap Ledger schema (validator-enforced):
    EVERY non-empty line MUST be a bullet entry classified with one of two tokens:

      - "fixed-now"  — the gap was repaired during this iteration
      - "deferred"   — the gap is parked with explicit human approval (the approval
                       reference must be recorded in .squad/decisions.md)
    Free-form intro prose between the heading and the bullets is REJECTED by the
    validator (it scans every non-empty line for a classification token).

  When there are no gaps, write ONE line:

    - "No requirement (FR/SC) gaps: all in-scope requirements verified: fixed-now."

-->

## Gap Ledger

- SC-003 (the 7-day Ring-session soak, running since 2026-11-14): deferred to iteration 002, checked around 2026-11-21, with the owner's approval. Defer entry `rmb-i001-sc003-soak-deferred` in `.squad\decisions.md` (DEC-001-01, DRIFT-001-85).
- SC-011 (the bill for the month against the $30 ceiling): deferred to iteration 002 with the owner's approval. Defer entry `rmb-i001-sc011-bill-deferred` in `.squad\decisions.md` (DEC-001-01). So far about $0.47 for the first day.
- The clock check on the VM and the core, at the soak's end: deferred to iteration 002 with the owner's approval. Defer entry `rmb-i001-clock-check-deferred` in `.squad\decisions.md` (DEC-001-01).
- FR-007's wording ("below" against the bridge's "at or below"): fixed-now. The spec says "at or below", the owner's decision (DEC-001-02, DRIFT-001-85).

## Notes

- **The review rests on** the co-review campaign `cmp-001-ring-mcp-bridge-i001`, round 34 (`run-20261115-170156800-64511f10`, 15 minutes, codex). It reviewed `411f4c5` and found nothing: verdict pass, current for the files as they are. Round 33 (`run-20261115-150558819-d9da95a1`) had reviewed the code at `0431bcf` with the same result; round 34 covered what changed after it: the sign-off records, Specrew CI's checkout (DRIFT-001-90) and the review history, committed on the owner's choice (DRIFT-001-90). No code changed between the two.
- **After T035:** the owner relayed an independent review of `f3884bb`, with four findings (DRIFT-001-86). The campaign's rounds 30 to 32 then found one or two minor findings each (DRIFT-001-87 to DRIFT-001-89). Each was fixed test-first, and round 33 found nothing. The drift log calls rounds 31 and 32 "round 3" and "round 4": it counts the rounds of the allowance that began with CP-21a's round. Round 33 ran after the owner's allowance reset.
- **The evidence:**
  - `drift-log.md` (89 events: the drift check of 2026-11-15, and T036's DRIFT-001-86 to DRIFT-001-89);
  - `quality/quality-evidence.md` (11 gates) and `quality/lenses/` (3 lenses, 2 advisory rows);
  - `quality/mechanical-findings.json`, re-run at `0431bcf` with the same 26 findings, triaged in DRIFT-001-84;
  - the reviewer artifacts beside this file.

### The quickstart's Step 9, iteration 001's rows

The live column ran on the code deployed in the pilot, before T036's fixes. Those ship with the next core deploy and connector image, each with the owner's OK (DRIFT-001-86).

| Item | Checked by | Live on the owner's home | Result |
| --- | --- | --- | --- |
| US1 AS1: the overview | the Summary and Inquiry tests; the 100-device token budget for each view (DRIFT-001-82) | ChatGPT, claude.ai and Claude Code read it: alarm mode, open contacts, motion with its room, offline devices, low batteries, health, local times in `+02:00` | pass |
| US1 AS2: Ring lost, stale with `stale_since` | the freshness tests, Ring down by fault injection on the fake clock (the only check of the Ring-lost path) | the home link's variant: the connector stopped, stale past 2 minutes with `stale_since` at the last heartbeat, then fresh again (T033 step 4) | pass |
| US1 AS3: a Hebrew name as written | the scenario fixture through `list_devices`; the mapping's tests | names as written, with rooms since DRIFT-001-80 | pass |
| SC-005 (part): stale within 2 minutes | the freshness tests | stale at 2 minutes, as above | pass; the HIGH health event comes with iteration 002 |
| SC-006: within about 8,000 tokens for about 100 devices | the agent-economy test, for the text view and the structured view | the owner's home of 58 devices | pass |
| FR-032: enrollment | the Settings and admin page tests; a new key revokes the old | the connector enrolled with its key, the owner compared the code on the admin page (2026-11-14) | pass |
| SC-003: 7 days without a Ring re-login | the pilot only | running since 2026-11-14 | deferred to iteration 002 (DEC-001-01) |
