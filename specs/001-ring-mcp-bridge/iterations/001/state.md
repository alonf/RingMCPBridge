# Iteration State: 001

**Schema**: v2
**Last Completed Task**: T006
**Tasks Remaining**: T007-T036 (30 tasks, 36 story_points)
**In Progress**: none; next is T007 (the Query layer), after the first codex co-review, which waits for the owner's typed approval
**Baseline Ref**: ae40fa10981259acab40787c0b60e38366a1cdde
**Updated**: 2026-11-03T17:16:32Z

## Execution Summary

- Implementation started 2026-11-03 after the owner's "approved for before-implement".
- T006 (Clock, Pub/Sub, Config, Security) is done. Commit 384ff11 has the first four parts; the Entra sign-in client follows in its own commit. The owner chose jose 6.2.15 as a direct dependency (option 1 of 3, 2026-11-03), recorded in implementation-rules.yml. The client is the authorization code flow with PKCE, state and nonce. It uses a managed-identity client assertion and no client secret. The ID token is checked against the issuer's keys, with RS256 pinned, plus issuer, audience, expiry, nonce and the authorized party. Entra's error text is never copied into an error. The managed-identity assertion is a .live.ts file that only the core's wiring imports. Freshness uses `auth_time`, which is an optional claim on the app registration; quickstart step 6 now lists it, with the ID token's `iat` as the fallback. A manual mutation check broke the nonce, state, algorithm and freshness checks one at a time, and a test caught each. The algorithm pin needed test keys without `alg`, as Entra publishes them. Checks: 184 tests; 100% lines, 97.4% branches; lint, tsc, prettier, depcruise (35 modules), audit, licences and gitleaks are clean.
- T005 is committed as 2328706.
- T005 (the Logging utility) is done: an allow-list JSON-lines logger with a redaction layer. The FR-034 redaction test was written first: it feeds an OAuth token (JWT and opaque), a PIN, a private key (PEM, DER and JWK) and image bytes (six forms) through every log path and error shape. Two deliberate breaks of the redaction rules were each caught by the test. Coverage of the utility: 100% lines, 98.6% branches.
- Phase 2 commits: 3543c47 (T002), bc3ba58 (T003), 8d0fc6f (T004). While making them, the gitleaks runner was fixed to use Windows' own tar (Git's tar, first on PATH inside git hooks, cannot read the .zip) and now re-extracts the binary from the verified archive on every run.
- Phase 2 (setup) is done: T002 npm workspace, T003 lint, format, pre-commit hook and test config, T004 CI and the dependency rules. Checks green on the empty packages: npm ci, tsc, ESLint, Prettier, Vitest, dependency-cruiser, the audit gate, the licence gate, gitleaks over the history, markdownlint.
- T001 (the hardening review) is done: codex, 2 rounds, review sign-off at 2026-11-02T23:41:25Z. See quality/hardening-gate.md.
- This artifact was scaffolded before task execution so resume state can be updated after each task.

## Notes

- Update this file after each task completes.
- Keep task identifiers aligned to plan.md.

<!-- >>> specrew-managed escalation-state >>> -->
## Repair Escalation

- **Status**: inactive
- **Artifact**: (none)
- **Gate**: (none)
- **Failure Count**: 0
- **Current Tier**: efficiency
- **Current Owner**: (none)
- **Locked Out Agents**: (none)
- **Last Escalated**: (none)
- **Resolved At**: (none)
- **Notes**: (none)
<!-- <<< specrew-managed escalation-state <<< -->