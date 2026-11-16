# Squad Decisions

## Active Decisions

### DEC-001-01: SC-003, SC-011 and the clock check carried into iteration 002 (2026-11-15)

- **Feature**: 001-ring-mcp-bridge, iteration 001
- **Decision**: CP-21a (T033) closes with its agent trials, the stale check and the Docker health check done.
  - SC-003's 7-day Ring-session soak (running since 2026-11-14) is carried into iteration 002 and checked around 2026-11-21.
  - So are SC-011's bill for the month and the clock check.
  - If the soak fails, its fix is iteration 002's first item.
- **Approved by**: the owner, typed reply "1. a" to the choice put in the conversation on 2026-11-15
- **Record**: DRIFT-001-85

### DEC-001-02: FR-007 reads "at or below" the battery threshold (2026-11-15)

- **Feature**: 001-ring-mcp-bridge
- **Decision**: the spec's FR-007 and US1's fifth scenario count a battery at or below the threshold (default 20%) as low, as the bridge does (DRIFT-001-33). They no longer say "below".
- **Approved by**: the owner, typed reply "2. a" to the choice put in the conversation on 2026-11-15
- **Record**: DRIFT-001-85

### 2026-11-15 — Defer: SC-003's 7-day Ring-session soak past iteration 001

- **Decision ID**: rmb-i001-sc003-soak-deferred
- **Type**: defer
- **Affected Requirement**: SC-003
- **Affected Iteration**: specs\001-ring-mcp-bridge\iterations\001
- **Approving Human**: the owner
- **Recorded At**: 2026-11-15T15:26:37Z
- **Next Action**: Iteration 002 checks the soak around 2026-11-21: 7 days on the owner's home without a Ring re-login, running since 2026-11-14. If it fails, its fix is iteration 002's first item.
- **Rationale**: The owner, 2026-11-15: "1. a", typed in reply to the choice of carrying T033's soak and the month's checks into iteration 002 (DEC-001-01, DRIFT-001-85). The soak cannot finish before the review stop. Recorded in `specs\001-ring-mcp-bridge\iterations\001\review.md` (Gap Ledger).

### 2026-11-15 — Defer: SC-011's bill for the month past iteration 001

- **Decision ID**: rmb-i001-sc011-bill-deferred
- **Type**: defer
- **Affected Requirement**: SC-011
- **Affected Iteration**: specs\001-ring-mcp-bridge\iterations\001
- **Approving Human**: the owner
- **Recorded At**: 2026-11-15T15:26:37Z
- **Next Action**: Iteration 002 reads the bill for the pilot's first month against the $30 ceiling (about $0.47 for the first day, estimate).
- **Rationale**: The owner, 2026-11-15: "1. a" (DEC-001-01, DRIFT-001-85). A month's bill cannot be read before the month ends. Recorded in `specs\001-ring-mcp-bridge\iterations\001\review.md` (Gap Ledger).

### 2026-11-15 — Defer: the clock check on the VM and the core past iteration 001

- **Decision ID**: rmb-i001-clock-check-deferred
- **Type**: defer
- **Affected Requirement**: the spec's edge case "Clocks drift between the home part and the cloud part" (T033 step 6)
- **Affected Iteration**: specs\001-ring-mcp-bridge\iterations\001
- **Approving Human**: the owner
- **Recorded At**: 2026-11-15T15:26:37Z
- **Next Action**: Iteration 002 compares the VM's and the core's clocks at the soak's end.
- **Rationale**: The owner, 2026-11-15: "1. a" (DEC-001-01, DRIFT-001-85). The check belongs with the soak's end. Recorded in `specs\001-ring-mcp-bridge\iterations\001\review.md` (Gap Ledger).

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction

## 2026-11-01T18:11:46Z — Boundary enforcement: specify

- **Feature**: (none)
- **Boundary Type**: specify
- **Current Boundary**: specify
- **Requested Boundary**: specify
- **Enforcement Action**: blocked
- **Launch Mode**: (none)
- **Agent Response Snippet**: (none)
- **Reason**: No persisted authorization matched specify -> specify.

## 2026-11-01T18:11:53Z — Boundary enforcement: specify

- **Feature**: (none)
- **Boundary Type**: specify
- **Current Boundary**: specify
- **Requested Boundary**: specify
- **Enforcement Action**: blocked
- **Launch Mode**: (none)
- **Agent Response Snippet**: (none)
- **Reason**: No persisted authorization matched specify -> specify.

## 2026-11-01T19:23:08Z — Boundary enforcement: specify

- **Feature**: (none)
- **Boundary Type**: specify
- **Current Boundary**: intake
- **Requested Boundary**: specify
- **Enforcement Action**: blocked
- **Launch Mode**: (none)
- **Agent Response Snippet**: (none)
- **Reason**: No persisted authorization matched intake -> specify.

## 2026-11-01T19:35:09Z — Boundary enforcement: specify

- **Feature**: (none)
- **Boundary Type**: specify
- **Current Boundary**: intake
- **Requested Boundary**: specify
- **Enforcement Action**: blocked
- **Launch Mode**: (none)
- **Agent Response Snippet**: (none)
- **Reason**: No persisted authorization matched intake -> specify.

## 2026-11-01T19:46:49Z — Boundary sync: specify

- **Boundary Type**: specify
- **Feature Ref**: 001-ring-mcp-bridge
- **Iteration Number**: (none)
- **Task ID**: (none)
- **Auth Commit Hash**: a847e72db8343481a9a622ca73e2ece91d7e7483
- **Recorded At**: 2026-11-01T19:46:47Z

## 2026-11-01T20:15:44Z — Boundary enforcement: clarify

- **Feature**: 001-ring-mcp-bridge
- **Boundary Type**: clarify
- **Current Boundary**: specify
- **Requested Boundary**: clarify
- **Enforcement Action**: blocked
- **Launch Mode**: (none)
- **Agent Response Snippet**: (none)
- **Reason**: No persisted authorization matched specify -> clarify.

## 2026-11-01T20:18:17Z — Boundary sync: clarify

- **Boundary Type**: clarify
- **Feature Ref**: 001-ring-mcp-bridge
- **Iteration Number**: (none)
- **Task ID**: (none)
- **Auth Commit Hash**: ae40fa10981259acab40787c0b60e38366a1cdde
- **Recorded At**: 2026-11-01T20:18:15Z

## 2026-11-02T01:40:08Z — Boundary enforcement: plan

- **Feature**: 001-ring-mcp-bridge
- **Boundary Type**: plan
- **Current Boundary**: clarify
- **Requested Boundary**: plan
- **Enforcement Action**: blocked
- **Launch Mode**: (none)
- **Agent Response Snippet**: (none)
- **Reason**: No persisted authorization matched clarify -> plan.

## 2026-11-02T17:28:30Z — Constraint change detected: capacity_per_iteration

- **Change Key**: constraint-627ebe92ff603ee9807b
- **Boundary Attempt**: plan
- **Artifact**: .specrew/iteration-config.yml
- **Previous Value**: 20
- **Current Value**: 42
- **Previous Auth Commit**: ae40fa10981259acab40787c0b60e38366a1cdde
- **Current Auth Commit**: f212103fee178c774931444d196300dbb2457eb3
- **Authority**: This record makes the edit visible; it does not authorize the change.

## 2026-11-02T17:28:31Z — Boundary sync: plan

- **Boundary Type**: plan
- **Feature Ref**: 001-ring-mcp-bridge
- **Iteration Number**: 001
- **Task ID**: (none)
- **Auth Commit Hash**: f212103fee178c774931444d196300dbb2457eb3
- **Recorded At**: 2026-11-02T17:28:30Z

## 2026-11-02T18:59:18Z — Boundary sync warning: plan

- **Boundary Type**: plan
- **Latest Recorded Boundary**: plan
- **Recorded At**: 2026-11-02T18:59:18Z
- **Warning**: Expected next boundary 'tasks' but received 'plan'.

## 2026-11-02T18:59:19Z — Boundary sync: plan

- **Boundary Type**: plan
- **Feature Ref**: 001-ring-mcp-bridge
- **Iteration Number**: 001
- **Task ID**: (none)
- **Auth Commit Hash**: 7176fc828eecc4ce489c57ca17a3263ebe704581
- **Recorded At**: 2026-11-02T18:59:18Z

## 2026-11-02T19:20:50Z — Boundary enforcement: tasks

- **Feature**: 001-ring-mcp-bridge
- **Boundary Type**: tasks
- **Current Boundary**: plan
- **Requested Boundary**: tasks
- **Enforcement Action**: blocked
- **Launch Mode**: (none)
- **Agent Response Snippet**: (none)
- **Reason**: No persisted authorization matched plan -> tasks.

## 2026-11-02T19:28:21Z — Boundary enforcement: plan

- **Feature**: 001-ring-mcp-bridge
- **Boundary Type**: plan
- **Current Boundary**: clarify
- **Requested Boundary**: plan
- **Enforcement Action**: authorized
- **Launch Mode**: (none)
- **Agent Response Snippet**: (none)
- **Reason**: Persisted authorization matched the requested boundary.

## 2026-11-02T21:01:39Z — Boundary sync: tasks

- **Boundary Type**: tasks
- **Feature Ref**: 001-ring-mcp-bridge
- **Iteration Number**: 001
- **Task ID**: (none)
- **Auth Commit Hash**: ca6734d7d94fab99de218fc6473a5069211a6d94
- **Recorded At**: 2026-11-02T21:01:38Z

## 2026-11-02T21:21:02Z — Boundary enforcement: tasks

- **Feature**: 001-ring-mcp-bridge
- **Boundary Type**: tasks
- **Current Boundary**: plan
- **Requested Boundary**: tasks
- **Enforcement Action**: authorized
- **Launch Mode**: (none)
- **Agent Response Snippet**: (none)
- **Reason**: Persisted authorization matched the requested boundary.

## 2026-11-02T23:56:47Z — Boundary sync: before-implement

- **Boundary Type**: before-implement
- **Feature Ref**: 001-ring-mcp-bridge
- **Iteration Number**: 001
- **Task ID**: (none)
- **Auth Commit Hash**: 5d509013e45423209d7b52d3a5b99e970fe080da
- **Recorded At**: 2026-11-02T23:56:37Z

## 2026-11-03T00:04:17Z — Boundary enforcement: before-implement

- **Feature**: 001-ring-mcp-bridge
- **Boundary Type**: before-implement
- **Current Boundary**: tasks
- **Requested Boundary**: before-implement
- **Enforcement Action**: authorized
- **Launch Mode**: (none)
- **Agent Response Snippet**: (none)
- **Reason**: Persisted authorization matched the requested boundary.

## 2026-11-15T22:25:31Z — Boundary enforcement: review-signoff

- **Feature**: 001-ring-mcp-bridge
- **Boundary Type**: review-signoff
- **Current Boundary**: before-implement
- **Requested Boundary**: review-signoff
- **Enforcement Action**: blocked
- **Launch Mode**: (none)
- **Agent Response Snippet**: (none)
- **Reason**: No persisted authorization matched before-implement -> review-signoff.

## 2026-11-16T00:08:14Z — Boundary enforcement: review-signoff

- **Feature**: 001-ring-mcp-bridge
- **Boundary Type**: review-signoff
- **Current Boundary**: before-implement
- **Requested Boundary**: review-signoff
- **Enforcement Action**: blocked
- **Launch Mode**: (none)
- **Agent Response Snippet**: (none)
- **Reason**: No persisted authorization matched before-implement -> review-signoff.

## 2026-11-16T01:27:46Z — Boundary sync: review-signoff

- **Boundary Type**: review-signoff
- **Feature Ref**: 001-ring-mcp-bridge
- **Iteration Number**: 001
- **Task ID**: (none)
- **Auth Commit Hash**: 36e501c43a9b2b87b7a2f3d7d0e6734e03607c28
- **Recorded At**: 2026-11-16T01:27:35Z

## 2026-11-16T17:31:41Z — Boundary sync: retro

- **Boundary Type**: retro
- **Feature Ref**: 001-ring-mcp-bridge
- **Iteration Number**: 001
- **Task ID**: (none)
- **Auth Commit Hash**: 171ba0224106d096e7c2ba63c03f12262f638e81
- **Recorded At**: 2026-11-16T17:31:23Z

## 2026-11-16T17:32:18Z — Boundary sync warning: retro

- **Boundary Type**: retro
- **Latest Recorded Boundary**: retro
- **Recorded At**: 2026-11-16T17:32:18Z
- **Warning**: Expected next boundary 'iteration-closeout' but received 'retro'.

## 2026-11-16T17:32:32Z — Boundary sync: retro

- **Boundary Type**: retro
- **Feature Ref**: 001-ring-mcp-bridge
- **Iteration Number**: 001
- **Task ID**: (none)
- **Auth Commit Hash**: 171ba0224106d096e7c2ba63c03f12262f638e81
- **Recorded At**: 2026-11-16T17:32:18Z

## 2026-11-16T19:15:31Z — Boundary enforcement: iteration-closeout

- **Feature**: 001-ring-mcp-bridge
- **Boundary Type**: iteration-closeout
- **Current Boundary**: retro
- **Requested Boundary**: iteration-closeout
- **Enforcement Action**: blocked
- **Launch Mode**: (none)
- **Agent Response Snippet**: (none)
- **Reason**: No persisted authorization matched retro -> iteration-closeout.

## 2026-11-16T22:07:54Z — Boundary sync: iteration-closeout

- **Boundary Type**: iteration-closeout
- **Feature Ref**: 001-ring-mcp-bridge
- **Iteration Number**: 001
- **Task ID**: (none)
- **Auth Commit Hash**: 1dacf0563cdeb2c3339534ee05c6e5e4f24dfb10
- **Recorded At**: 2026-11-16T22:07:38Z
