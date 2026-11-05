# Iteration State: 001

**Schema**: v2
**Last Completed Task**: T008
**Tasks Remaining**: T009-T036 (28 tasks, 33 story_points)
**In Progress**: none; CP-03 is reviewed and signed off (2026-11-05), and its three review follow-ups are fixed; next T009 and T010 (CP-04)
**Baseline Ref**: ae40fa10981259acab40787c0b60e38366a1cdde
**Updated**: 2026-11-05T16:42:54Z

## Execution Summary

- CP-03 co-review (codex; checkpoint cp-03-query-layer-review; T007 and T008). Specrew first refused the round because the round allowance was spent (DRIFT-001-13). The owner typed `approved for allowance reset`, and the reset cost $0. Round 1 (run-20261105-144818639-e501294a, 15 minutes, 1 of 4 used) found 3 minor findings, all verified. The owner typed `stop the review here`, and review sign-off completed on 2026-11-05 on exactly the tree the round reviewed. The three follow-ups were then fixed, each with a test:
  - the SQL Server connection pool now has an error listener. mssql 12.7.13 raises some connection errors as an "error" event on the pool, and Node ends the process on one that nothing listens for. The same failure still reaches the caller through its request. Codex rated this major; Specrew demoted it because it named no trigger;
  - a connection cut during a statement is now a transient `store_down`, not `statement_failed`. Reproduced on the test server through a TCP relay: the cut arrives as `ECONNRESET`. Codex's shape (an `ESOCKET` error wrapped in a RequestError with the code EREQUEST) and a session the server kills (error 596) are sorted the same way. A transaction whose connection drops now runs again; a single statement does not, because its outcome is unknown;
  - a caller's abort while a transaction starts now ends the wait at once on SQL Server, and the work never runs. A start that succeeds after the abort is rolled back, so its connection goes back to the pool.

  A deliberate break of each of 7 parts of the fixes was caught by a test. Checks:
  - 394 tests. With SQL Server, 393 pass and the CI-only check skips; without it, 40 skip;
  - coverage: 99.7% lines and 97.5% branches with SQL Server, 93.8% lines and 95.5% branches without;
  - lint, tsc, prettier, depcruise (71 modules), markdownlint and gitleaks are clean. No dependency changed, so the audit and licence gates were not re-run.

  The next co-review checkpoint (CP-04) will see these fixes.
- T008 (migrations and the iteration 001 schema; completes CP-03) is done in `bridge/src/utilities/query-layer/migrations/`. The DTO rule is in `bridge/src/core/access/README.md`. What it does:
  - `runMigrations` applies the migrations a database lacks when the Host starts. Each runs in one transaction together with its version record in `schema_migration`, under a lock: BEGIN IMMEDIATE on SQLite, and on SQL Server `sp_getapplock` with a 10 s wait. Two starts at once apply each migration once;
  - a version the code does not know is reported, not refused (code N-1 on schema N). The runner refuses three things: a recorded version under another name, a list with a gap, and a `schema_migration` table of another shape;
  - migration 1 creates `location`, `device` (with `kind` and `state_version`), `health_snapshot` (one row), `setting`, `agent`, `connector` (with the pending request's expiry, PT-32), `oidc_item` (PT-11) and `lease`, written once per dialect;
  - both dialects make the same choices: times are UTC milliseconds in integer columns, flags are 0 or 1, and JSON is text. SQLite tables are STRICT. SQL Server compares text by code point (`Latin1_General_100_BIN2`), so ids differing only in case stay apart, as on SQLite and as oidc-provider's tokens need. Enumerations have no CHECK, because SQLite cannot change one without rebuilding the table;
  - a unit test refuses a statement that is not additive (DROP, RENAME, ALTER COLUMN, or a NOT NULL column without a default). It also checks that both dialects create the same tables, columns and indexes;
  - the Query layer now refuses text that holds a second statement, on both dialects. On Node 24.13, SQLite's prepare compiles only the first statement and silently skips the rest, while SQL Server would run them all;
  - the names chosen here, and the lease reading, are in DRIFT-001-12.

  The upgrade test goes from the previous release to this one, on a SQLite file and on SQL Server 2022 (the local container). No release exists yet, so `PREVIOUS_RELEASE_SCHEMA_VERSION` is 0 and the test starts from an empty database. A deliberate break of each of 16 rules was caught by a test. Checks:
  - 381 tests. With SQL Server, 380 pass and the CI-only check skips; without it, 36 skip;
  - coverage: 99.8% lines and 97.7% branches with SQL Server, 94.5% lines and 95.8% branches without;
  - lint, tsc, prettier, depcruise (69 modules), markdownlint, audit, licences and gitleaks are clean.
- T007 (the Query layer, CP-03) is done in `bridge/src/utilities/query-layer/`. The owner chose @types/mssql 12.3.0 as a development-only package (option 1 of 3, 2026-11-04), recorded in implementation-rules.yml; mssql ships no types. What it does:
  - one `QueryLayer` over two drivers: node:sqlite (`DatabaseSync`, the only class in Node 24, which CI runs; an asynchronous class would change sqlite.ts alone) and mssql;
  - each `all`, `get` and `run` is its own unit of work, and `transaction` runs several statements as one;
  - one retry, after a 250 ms pause (`RETRY_PAUSE_MS`), only when running the work again is safe: a deadlock victim, Microsoft's documented Azure SQL transient errors, a locked SQLite file, or a lost connection inside a transaction before the commit. A failure during the commit is never retried, because the work may already have taken effect;
  - the errors are `store_down` (managers answer `BRIDGE_UNAVAILABLE`), `constraint_violated` and `statement_failed`. Messages name the error number or driver code, never the database's text, which can hold row values;
  - placeholders are checked against parameters on both dialects, because SQLite would otherwise bind NULL for a missing one;
  - a call to the layer from inside its own transaction is refused (on SQLite it would wait on itself);
  - SQLite runs one unit of work at a time; a transaction's statements run one at a time on both dialects (mssql refuses two at once);
  - the commit or rollback waits until every statement the work started has settled, and statements still waiting are refused. Found in a review before the first commit: work that fails while a statement it started is still queued could otherwise roll back first, leaving that statement to run outside any transaction (SQLite) or the rollback to meet a statement in progress (SQL Server). Three tests failed before the fix;
  - SQL Server connects on first use and again after a failed connection, so the core runs while the database is down;
  - insert-or-update is SQLite's `ON CONFLICT` and one T-SQL `MERGE` under `HOLDLOCK`, which stays atomic outside a transaction; both take an optional "only if newer" version guard. Paging is by key (`LIMIT` and `TOP`);
  - the SQL Server half (tsql.ts and the managed-identity settings in tsql-managed-identity.live.ts) is not exported from index.ts, so the connector never reaches mssql.

  The same contract tests ran on a SQLite file and on SQL Server 2022 (a local container, image CU14; CI uses 2022-latest). A deliberate break of each of 16 rules was caught by a test. Checks: 337 tests (18 need SQL Server and skip without it, and one runs only in CI to fail when its settings are missing); 99.8% lines and 97.4% branches with SQL Server, 94.5% lines and 96.2% branches without; lint, tsc, prettier, depcruise (63 modules), audit, licences and gitleaks are clean.
- Implementation started 2026-11-03 after the owner's "approved for before-implement".
- First implement co-review (codex; checkpoint cp-02-utilities-review; run-20261103-181059697-dfcd1e9c; 9 minutes; budget 1 of 4 used after the owner's allowance reset, DRIFT-001-10). It found 5 minor findings, all verified, and all fixed with tests; a deliberate break of each fix was caught:
  - a fresh sign-in now requires `auth_time` (an issue time does not prove re-entered credentials);
  - a PIN before a full stop is redacted;
  - the audit gate refuses an npm error report or one with no results, where before it passed it;
  - the caller's cancel reaches the ID-token check;
  - the stdout sink survives a closed pipe (`createStdoutSink`).
  The issuer setting must use the tenant ID, not a domain name (doc comment and quickstart step 6). The owner chose another round to check the fixes.
- Co-review round 2 (run-20261103-191955765-9ca7145b, 8 minutes, 2 of 4 used) confirmed the five fixes. It found 1 minor finding, verified: free text in error messages reached the log, so a device name went through whole (OR6) and a quoted multi-word password was only partly masked. The owner chose option A:
  - only the bridge's own errors (those with a `kind`) keep their message;
  - any other error keeps its name, code and stack frames, with its message written as `[not logged]`;
  - a thrown non-error keeps its type only;
  - stacks keep frame lines only;
  - quoted secret values are masked whole.
  A deliberate break of each part was caught by a test. Checks: 198 tests; 99.8% lines, 96.5% branches. Committed as 13eb127.
- Co-review round 3 (run-20261103-212946051-f209bba6, 8 minutes, 3 of 4 used; Specrew's total is 25 minutes over 3 rounds) found 1 minor finding, verified by a test that failed before the fix: when the caller cancelled a sign-in while the ID token was being checked, a later failure of that check (the issuer's signing keys returning 503) was left unobserved, and Node ends the process on an unobserved rejection. The fix: the abort helper (`untilAborted`) now observes the work it is given before it checks the signal. The same helper guards the shared discovery read. Checks: 199 tests; 99.8% lines, 96.5% branches; lint, tsc, prettier, depcruise (36 modules), audit, licences and gitleaks are clean. The owner typed `stop the review here`, but sign-off was refused because the fix had moved the code after round 3 (DRIFT-001-11). The owner chose the last round over partial sign-off.
- Co-review round 4 (run-20261104-135642595-1d72f246, 9 minutes, 4 of 4 used; Specrew's total is 34 minutes over 4 rounds) reviewed the tree with the round-3 fix and found nothing wrong with it. It found 1 new minor finding, verified by reading the code: a caller's abort while the token reply body was still being read was reported as `sign_in_unavailable` (an Entra fault) instead of the abort. The owner typed `stop the review here`, and review sign-off completed on 2026-11-04 on exactly the tree round 4 reviewed. The finding was saved as a follow-up.
- After sign-off, the round-4 follow-up was fixed: when the token reply cannot be read, the caller's signal is checked first, so a body cut short by the caller's abort passes on the abort. A test with a streamed body that aborts part-way failed before the fix and passes after. Checks: 200 tests; 99.8% lines, 96.5% branches; lint, tsc, prettier, depcruise (36 modules) and gitleaks are clean (no dependency changed, so the audit and licence gates were not re-run). The next co-review checkpoint will see this fix.
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