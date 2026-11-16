# Retro: Iteration 001 — the read-only bridge: core, connector, link, Issuer and the first agent trials

**Schema**: v1
**Date**: 2026-11-16
**Status**: complete

## Estimation Accuracy

| Metric           | Value                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Planned / Actual | 42 / about 75.75 SP. The actuals are the implementer's own SP figures per task, so they are estimates too.                                                                                                                                                                                                                                                                       |
| Variance         | About +33.75 SP: the iteration took about 1.8 times its plan.                                                                                                                                                                                                                                                                                                                    |
| On or near plan  | CP-01 to CP-05 and CP-11a, exactly; CP-09 at 3.25 of 3.                                                                                                                                                                                                                                                                                                                          |
| Honesty note     | The rework reserve, CP-RW, reads 3.25 of 3, but most of the rework sits inside the tasks' own actuals: each checkpoint's co-review fixes were booked to the task under review (CP-09, CP-10, CP-14, CP-16). The review packet called the overrun "about 0.25 SP over the reserve". That was the reserve alone. The iteration as a whole ran about 1.8 times its plan (estimate). |

The tasks that overran, largest first:

| Task                     | Planned | Actual (estimate) | Where it went                                                                                                                                                    |
| ------------------------ | ------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CP-14 Inquiry path       | 3       | 9                 | The Summary, Health and Inquiry parts (DRIFT-001-31 to -34), Ring outages noticed with no read running (DRIFT-001-35), and review rounds 3 to 5 (DRIFT-001-36 to -38). |
| CP-10 Host               | 2       | 8.5               | T026's lease and T027's six parts: both run modes, the connector, one image (DRIFT-001-46 to -53); then CP-10's review rounds (DRIFT-001-54 to -56).            |
| CP-16 Issuer             | 3       | 6.5               | Entra sign-in, the binding to the browser that started a link, the follow-ups (DRIFT-001-39 to -41, -45, -61).                                                 |
| CP-21a First agent trial | 1       | 6                 | The pilot: agent sign-in, the connector's VM, and the fixes and requests it raised (DRIFT-001-65, -72 to -83).                                                 |
| CP-19 Bicep and deploy   | 3       | 5.5               | The first deploy's real-world stops: the bootstrap, GitHub's OIDC subject, the registry name's case (DRIFT-001-62 to -64, -68 to -71).                         |
| CP-17 Admin page         | 1       | 4                 | Safe connector approval, and the page in a real browser at three widths (DRIFT-001-59, -60).                                                                    |
| CP-15 MCP Endpoint       | 2       | 4                 | Both protocol eras on one endpoint, the read rate limit (DRIFT-001-42, -44).                                                                                    |
| CP-07 Ring Adapter       | 2       | 3.75              | Working around ring-client-api's own retries and logging, the call limits (DRIFT-001-17, -18, -20).                                                            |
| CP-06 and CP-08a         | 2 and 1 | 3 and 2           | The Setup CLI's details and the outbox's rules (DRIFT-001-19, -57).                                                                                             |

## Phase Variance

| Phase                           | Planned                   | Actual (estimate)                                        |
| ------------------------------- | ------------------------- | -------------------------------------------------------- |
| Planning                        | 2 (spent, outside the 42) | Not tracked separately                                   |
| Discovery/Spikes (CP-21a)       | 1                         | 6                                                        |
| Implementation (CP-01 to CP-19) | 35                        | 62.5                                                     |
| Review (CP-RV)                  | 3                         | 4                                                        |
| Rework (CP-RW)                  | 3                         | 3.25, plus the review fixes booked inside implementation |

**The systemic bias:** the plan priced each work item at building it once. Two things the estimates left out roughly doubled them:

- the review loop: a co-review about every 5 SP, repeated until clean;
- first contact with the outside world: Azure, Ring's library, the agent hosts and the home's VM.

The tasks that touch the outside world or long-lived state overran. The library tasks with no outside contact came in on plan.

## Drift Summary

- **Total:** 91 events, all resolved or decided (the drift log's Summary).
- **Specification drift:** four items, each decided by the owner: DRIFT-001-33, -81, -82 and -86.
- **Deferred:** DRIFT-001-77 (the snooze) goes to iteration 002's design analysis, by the owner's decision. DRIFT-001-85 carries SC-003's soak, SC-011's bill and the clock check into iteration 002, with the owner's approval.
- **The rest is not spec drift.** It is:
  - decisions the records left open, settled in code and recorded per task;
  - defects the co-review rounds found, fixed test-first;
  - the owner's decisions and requests;
  - defects in the governed tooling (Specrew), the last two being DRIFT-001-90 and -91.
- **Escapes to the end:** the independent review of `f3884bb` (DRIFT-001-86) and co-review rounds 30 to 32 (DRIFT-001-87 to -89) found defects after every task was done. All were fixed in T036.

## What Went Well

- **The co-review caught the hardest class of defect again and again:** ways old data could look current (FR-006, SC-005). DRIFT-001-27 to -30, -36 to -38, -54 to -56, -86 and -89 are all that class. Each fix came test-first, with a deliberate break to prove the new test catches it.
- **The tests are strong:** 1,296 tests pass. Coverage is 96.52% of lines and 92.64% of branches, against gates of 90% and 85%.
- **The records stayed honest.** Every decision the records left open went into the drift log with a requirement citation: 91 events, all resolved or decided.
- **The pilot runs at the owner's home.** The core in Azure and the connector on the home's VM both run `411f4c5`, and agent reads through Claude Code work.
- **Privacy held in a public repository.** Every commit was scanned for the owner's specifics and for secrets. The review store went in only after a scan and the owner's say-so.
- **The owner's decisions were quick, and each one is on record:** the (y) for a stuck Ring connection, E′ and F among them.

## What Didn't Go Well

1. **The estimate was about 1.8 times too low** (estimate). See Estimation Accuracy.
2. **The co-review loop was costly.** The campaign reached round 34. Its 4-round allowance ran out again and again, and each reset needed the owner's typed approval (DRIFT-001-10, -13 and later ones).
3. **Defects escaped to the end.** The independent review of `f3884bb` found four after every task was done (DRIFT-001-86), and rounds 30 to 32 found three more (DRIFT-001-87 to -89).
4. **The review sign-off took a night** (DRIFT-001-91):
   - I asked the owner for the approval before running the sync, so it was not recorded.
   - The sync's lint could not start: 425 files on one command line of 39,211 characters. My first diagnosis, the PowerShell update, was wrong. The owner's reviewer session for Specrew found the cause.
   - I had set plan.md's Status to "reviewing" by hand (`a79514a`). The state gate refused it, and the repair made round 34 out of date over that one line. The owner then had to approve twice: a partial sign-off, then the sign-off itself.
5. **Specrew CI went red on tooling, not on code:**
   - a shallow checkout;
   - a review store CI could not see;
   - a reviewed snapshot only the owner's machine held (DRIFT-001-90);
   - then `36e501c`, during the repair above.
6. **One risk is still open.** The owner's reads from ChatGPT and claude.ai on the new core have not been reported. Until they are, an agent link stored with a `sector_identifier_uri` may fail to reconnect.

## Lessons Learned

1. **Price the review loop and first contact into each task.**
   - Owner: Planner.
   - Next action: in iteration 002's plan, each estimate includes its co-review rounds and its first real-world run.
2. **At a boundary, run the sync first, then ask for the approval.**
   - Owner: Implementer.
   - Next action: applied from the retro sync on. The crew's notes record it.
3. **Lifecycle lines are Specrew's to write.**
   - Owner: Implementer.
   - Next action: plan.md's Status is never set by hand again (DRIFT-001-91's carry-forward).
4. **Measure before blaming the environment.** A failure that happens in only one context points at that context's inputs. Measuring the command line would have found the cause in one step, where I offered a PowerShell workaround on an inference.
   - Owner: Implementer.
   - Next action: when a tool fails in one context only, measure that context's inputs (sizes, counts, lengths) before proposing a workaround.
5. **Book rework where it can be seen.**
   - Owner: Planner.
   - Next action: in iteration 002, review-round fixes are booked to the rework reserve, or to a rework column per task, so the reserve's actual shows the real rework.
6. **A review earlier finds escapes sooner.** DRIFT-001-86's four defects came from a review after every task was done.
   - Owner: Reviewer, with the owner.
   - Next action: the owner decides at iteration 002's planning whether to add an independent review at its midpoint.

## Improvement Actions

1. **Calibrate iteration 002's capacity** (owner: Planner, at iteration 002's planning; a planning-policy change). Its estimates include review rounds and first contact. See Signals for the choice.
2. **Sync first at every boundary, and leave plan.md's Status to Specrew** (owner: Implementer, from the retro sync on; a process change).
3. **Tag and push each review round's reviewed tree** until alonf/specrew#3721 lands (owner: Implementer, at each round; carried).
4. **The sync's lint limit** (owner: the project owner, at each sync on this branch until Specrew's fix lands; carried). Either a decision per sync, or a standing yes for the same one-process fallback, each use recorded in the drift log.
5. **Specrew's fixes** (owner: the project owner, as Specrew's maintainer; outside this project). These are on Specrew's bug-bash list:
   - the lint: batch it, keep to the project's lint scope, and degrade on a failed launch;
   - the readiness wording;
   - two approvals for one sign-off;
   - the state gate against a hand-set plan line;
   - alonf/specrew#3721.
6. **The agent reads on the new core** (owner: the project owner, before iteration 002's design analysis). The report closes the `sector_identifier_uri` risk, or turns it into work.
7. **A midpoint independent review** (owner: the project owner, with the Reviewer; decided at iteration 002's planning).

## Triage: Reviewer-Instruction Candidates

- **PROMOTE:** "For every reply that can carry device data, check it across a reconnect, a hub offline and back, and a connection closed past the grace. Old data must never read as current." This is the class behind DRIFT-001-36 to -38, -86 and -89. It goes into the co-review's design context for the read path in iteration 002.
- **PROMOTE:** "Check each estimate against the work's first real-world run." A task that touches Azure, Ring or an agent host has a first-contact cost the plan must show (Lesson 1).
- **DEFER:** "A boundary's inputs must scale with the branch, such as the sync's lint list." This is Specrew's fix, on its bug-bash list (Improvement Action 5).
- **DROP:** "Re-check the CI workflow after each Specrew update." The workflow's own header already says so (DRIFT-001-07, DRIFT-001-90).

## Signals for Next Iteration

- **The capacity choice, for the owner at planning (calibration, estimate):** keep 42 SP with each estimate scaled by about 1.8, or plan about 23 SP at today's way of estimating.
- **Carried in:**
  - SC-003's 7-day soak, ending about 2026-11-21, and the clock check at its end;
  - SC-011's bill for the month;
  - DRIFT-001-77, the snooze;
  - DRIFT-001-89's known limit: a hub whose device list never comes after a reconnect;
  - the push work for FR-005's events, starting from the push library's "crypto-key is missing" log line;
  - Spike S1 (CP-20).
- **Standing steps:** tag each reviewed tree (alonf/specrew#3721), and the sync's lint limit (DRIFT-001-91).
- **Open:** the agent reads on the new core, and with them the `sector_identifier_uri` risk.
- **Next stops:** the retro boundary, the iteration closeout, then iteration 002's design analysis.
