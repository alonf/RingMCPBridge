# Iteration State: 001

**Schema**: v2
**Last Completed Task**: T013
**Tasks Remaining**: T014-T036 (23 tasks, 26 story_points)
**In Progress**: none; CP-07 (T013) is complete, and its co-review choice waits for the owner; next T014 (CP-08a). T028 completes CP-06 later
**Baseline Ref**: ae40fa10981259acab40787c0b60e38366a1cdde
**Updated**: 2026-11-06T20:30:00Z

## Execution Summary

- T013 (the Ring Adapter; completes CP-07) is done, in `bridge/src/connector/access/ring-adapter/`. Besides the call limits and the install (below), it adds:
  - **the adapter** (`RingApiAdapter`). Every call passes through the shared gate with a 30 s deadline, because ring-client-api retries a missing answer on its own, without end. Its failures become `RingAdapterError` in the bridge's own words, with nothing of the library attached. A lost session stays lost until the owner signs in again. A rotated token is saved at once as a `Secret` through the Secrets File's update;
  - **the mapping**, a tolerant reader written test-first: device kinds onto the bridge's types (anything unknown is `other`), wired versus battery, battery levels, online state, the alarm mode, owned versus shared, and names kept exactly as Ring wrote them;
  - **changes**: after a read, each alarm device's later data is reported as a device change, and the alarm panel's mode as a location change;
  - **the live client** (`ring-client.live.ts`), the only file that imports ring-client-api. It silences the library's own log lines, which quote Ring's content, and keeps its polling off. The compiler checks that the real `RingApi` fits the adapter's narrow client types;
  - **the Ring-boundary contract test** (`bridge/test/ring-boundary/`): only the live client imports ring-client-api, and the same checks run against the scenario engine and the adapter.

  The choices are in DRIFT-001-18. Rooms are not read in iteration 001: Ring's room list has no reviewed recorded payload yet, so `room` stays absent until the pilot (a carry-forward).

  A deliberate break of five parts of the adapter was caught. Checks:
  - 578 tests: 529 pass and 49 skip without SQL Server;
  - coverage without SQL Server: 95.1% of lines and 95.0% of branches. The adapter's folder is at 98.8% of lines;
  - lint, tsc, prettier and depcruise (133 modules) are clean.

- T013, part 2: ring-client-api 14.3.0 is installed, after the owner's two decisions on 2026-11-06. The details are in DRIFT-001-17.
  - **Backoff:** R25's numbers stay (`Accept your suggestion`).
  - **ffmpeg-for-homebridge:** the owner allowed it if it raises no security issue. Its only risk is its install script's unchecked download, and that never runs: CI and the image install with `--ignore-scripts`, and the adapter will pass the system ffmpeg by path. A local stub was tried and dropped, because npm 11.9.0 does not apply a `file:` override of a nested package in a way `npm ci` can reproduce.
  - **A third package:** `mediabunny` (MPL-2.0, through werift) came to light. It is a reviewed exception, and it was added to the dependency record in `implementation-rules.yml`.
  - **Pins and gates:** werift's five wildcard parts are pinned by root `overrides`. The audit gate passes with only the recorded `ip` exception, and the licence gate passes with three reviewed exceptions.

- The T012 commits were pushed at the owner's request (`You can push them and continue the implementation`). CI passed every job on them, including the Linux-only checks of the Secrets File.
- T013 (the Ring Adapter), part 1: the Ring call limits are done in `bridge/src/connector/access/ring-adapter/call-limits.ts`, written test-first on the fake clock. T013 stays open.
  - **What they do:** one gate takes every Ring call, one at a time and at least 1 s apart. Each `ring_unavailable` failure adds a randomised backoff. After 5 failures in a row the circuit opens: calls are refused without reaching Ring, and one probe goes through each minute.
  - A deliberate break of six parts was caught.
  - Checks: 10 new tests pass. Lint, tsc and prettier are clean.
  - **Waiting for the owner (DRIFT-001-17):**
    - the backoff numbers: tasks.md says 1 to 30 s, while research R25 says 2 s to a 60 s cap. The code follows R25 for now;
    - PT-10: `ffmpeg-for-homebridge` has no licence and its source says "All rights reserved". ring-client-api is not installed until the owner decides.

- T012 (the Secrets File; the first half of CP-06) is done, in `bridge/src/connector/access/secrets-file/`. What it adds:
  - **the file**: Ring's refresh token, Ring's session hardware ID, the push credentials and the connector's private key, sealed with the Security utility's AES-256-GCM under a key from a Docker secret. `open` returns nothing when there is no file yet. `create` is for the Setup CLI (T028) and never replaces an existing file. `update` writes a rotated token or new push credentials;
  - **failing closed**: a wrong key, a changed byte or unknown contents throws `open_failed` and leaves the file as it was. Only an opened or created file can write;
  - **atomic, ordered writes**: each write goes to a flushed temporary file that is renamed over the file. Writes run one at a time, so overlapping token rotations leave the newest token on disk. A failed write leaves the previous file;
  - **hidden values**: the token, hardware ID and push credentials are `Secret` values that print and serialize as `[secret]`, and the private key is a `KeyObject`. Errors never quote a secret or the contents.

  The choices made here are in DRIFT-001-16, including the key's format for T028 and a carry-forward to T016: the link does not exist yet, so T016 should test its own frames for Secrets File values.

  A deliberate break of five parts was caught: unordered writes, an attached JSON error, a temporary file left behind, a `Secret` that serializes its value, and a `create` that replaces an existing file. Checks:
  - 536 tests: 487 pass and 49 skip without SQL Server. One of the skips is the owner-only file mode check, which runs on Linux in CI;
  - coverage without SQL Server: 94.3% of lines and 95.6% of branches. The Linux-only folder flush is not covered on Windows, and CI runs it;
  - lint, tsc, prettier and depcruise (120 modules) are clean. No dependency was added.

- The CP-05 round-4 follow-up is fixed. The contract check now compares a `pattern` strictly, like a format, even when the `format` is unchanged. Before, it skipped the pattern whenever the format matched, so a reply time switched from UTC to an offset passed unseen.
  - Two tests fail on the old rule. One uses zod's real UTC and local-time patterns.
  - A deliberate break was caught: with the error envelope's `as_of` switched to local time, the snapshot test fails with "pattern changed".
  - Cost of the strict rule: a deliberate zod upgrade that rewrites the date-time pattern would also fail, until the owner decides (DRIFT-001-15).
  - The CP-06 co-review will see this fix.

- The round-3 fixes, made before round 4 at the owner's choice:
  - **A new enum on an input.** The contract check now reports an enum added to an input that took any value, and an enum dropped from a reply. An input that drops its enum now passes, because that only loosens it. Before, it was reported as having its values removed. Two tests cover these cases, including the review's `room` example, and both fail on the old rule.
  - **Milliseconds in local time.** `formatInTimeZone` now writes milliseconds, as `formatUtc` does, so `as_of` and `as_of_local` name the same instant (FR-006). A test checks 250, 7 and 999 ms, and that the two forms parse to the same instant. The published `as_of_local` pattern already accepted fractional seconds, so the Public Contract is unchanged. Nothing called this function yet.
  - Checks: 518 tests, with 470 passing and 48 skipped without SQL Server. Coverage without SQL Server is 94.2% of lines and 95.5% of branches. Lint, tsc, prettier and depcruise (110 modules) are clean.
- CP-05 co-review (codex; checkpoint cp-05-public-contract-review; T011 in e448f0e and the schema-gap fix in f127a04). The owner typed `approved for review round` twice.
  - Round 3 of 4 (run-20261106-101104249-3bb26085, 11 minutes) found 2 minor findings, both verified by reading the code. The contract check missed an enum added to an input that took any value. Local time dropped the milliseconds, so it named a different instant from `as_of`. Both were fixed before round 4 (above).
  - Round 4 of 4 (run-20261106-103654987-16f7e75c, 11 minutes; Specrew's total is 46 minutes over 4 rounds) found nothing wrong with the fixes. It found 1 new minor finding, also verified by reading the code. The contract check skips a `pattern` change whenever the `format` is unchanged. UTC and local times share `format: date-time` and differ only in the pattern, so a reply time switched from UTC to an offset would pass unseen.
  - The owner typed `stop the review here`. Review sign-off completed on 2026-11-06, on exactly the tree round 4 reviewed. The pattern finding was saved as a follow-up.
- The private GitHub repository was created at the owner's typed request (`create the private repo`, then `push as is`). Draft pull request #1 runs CI on this branch.
  - The first run passed every job: lint, test, build and secret-scan, plus Specrew's governance check. The new base-commit step ran the 62 contract checks against `main`, which has no published schemas yet.
  - In CI, 509 tests passed with SQL Server and Azurite, and 6 skipped as expected. Coverage was 99.7% of lines and 97.3% of branches.
  - The push used about 7 of the 2,000 free Actions minutes a month. That's an estimate, because GitHub's billing figure still showed 0.

- The T011 schema gap is closed, at the owner's typed choice (`close the schema gap`, 2026-11-05). CI's lint job now checks the Public Contract against the base commit's published schemas too, so a hand edit to the committed files cannot hide a removal or narrowing. Details are in DRIFT-001-15.
  - Tested locally on real commits. A removed reply field, with the committed file edited to match, passed the existing checks and failed the base comparison. A base document that is now gone fails, and so does a missing base directory. The CI step has not run on GitHub yet, because the repository has no remote.
  - Checks: tsc, lint, prettier and gitleaks are clean, and the contract tests pass (31, with the base comparison's 4 skipped when no base is given).
- T011 (the Public Contract; completes CP-05) is done in `bridge/src/contract/`, with its checks in `bridge/test/contract/` and the published documents in `schemas/`. What it adds:
  - **zod schemas** for the inputs and data of `get_overview`, `list_devices`, `get_device` and `get_health`, the reply envelope (with a rule that `stale_since` is present exactly when the data is stale) and the error envelope with the fourteen codes. Inputs are flat and reject unknown fields. Each tool's catalog entry holds its name, scope, MCP description, input and reply, for MCP Endpoint (T024);
  - **untrusted marking**: every Ring-sourced field (location and device names, rooms, the time zone, a device's `state`) carries `x-untrusted: true` and a description starting "UNTRUSTED.", and every tool description ends with the untrusted-content sentence;
  - **the JSON Schema documents**, built with `z.toJSONSchema`: `tool-inputs.schema.json` (the shape of `contracts/iteration-001-tools.schema.json`), `tool-replies.schema.json` and `tool-error.schema.json`. `npm run schemas:check` (which CI's lint job already calls) and `npm run schemas:generate` are new root scripts;
  - **the three checks**: the flat-schema check; the untrusted-marking check, which also requires a mark on any unmarked free text or open object in a reply unless the bridge writes it (ids, its own error text); and the schema snapshot test, which fails on a stale file, a missing or extra file, or any removal or narrowing, and checks before writing so `schemas:generate` cannot publish a narrowing. The inputs are also compared with the plan's contract file.

  The choices made here are in DRIFT-001-15. A probe showed MCP SDK 2.4.0 lists these schemas to agents unchanged, marks included.

  A deliberate break of each of 8 parts was caught: a tighter input bound (and `schemas:generate` left the published file unchanged), a removed reply field, an unmarked device name, a nullable input, a tool description without the sentence, a deleted published file, the stale rule removed, and an additive reply field (flagged as stale until generated, then accepted). Checks:
  - 511 tests: 467 pass and 44 skip without SQL Server (the test containers were stopped with the owner's approval; T011 touches no store);
  - coverage without SQL Server: 94.1% lines and 95.5% branches;
  - lint, tsc, prettier, depcruise (110 modules) and gitleaks are clean. No dependency changed, so the audit and licence gates were not re-run.
- CP-04 co-review (codex; checkpoint cp-04-test-harness-review; T009, T010 and the three CP-03 fixes in a609118, on commit 8913756). The owner typed `approved for review round`. Round 2 of 4 (run-20261105-190914063-de7ec465, 10 minutes) found nothing: verdict pass, current for the reviewed tree, so the review completed on its own with no decision owed.
- T009 and T010 (the test harness; complete CP-04) are done. What they add:
  - **The Ring Adapter's port** (`bridge/src/connector/access/ring-adapter/`), declared ahead of T013 because the engine implements it: locations, devices, change notifications and the session status (`ok`, `unavailable`, `lost`), with the link contract's field names and no ring-client-api type. The names chosen here are in DRIFT-001-14;
  - **the scenario engine** (`bridge/test/scenarios/`): a made-up home of 100 devices of every type at one location (Tokyo's time zone, disarmed), with a device named in Hebrew, low batteries, wired devices and offline devices, built the same way every time. It plays scripted changes on the fake clock and injects Ring down, a 406, slow answers and a lost session. While Ring refuses, the home still changes but nothing is reported, as when Ring's push stops. `FaultyChannel` drops, delays and duplicates messages in front of any sink, for the link's tests (CP-09);
  - **test support** (`bridge/test/support/`): an Entra stand-in (a second oidc-provider 9.13.3 with Entra's issuer path, `tid` and `oid`, and a client that signs an assertion), which the bridge's own sign-in client (T006) signs in through; MCP SDK client helpers, in memory and over Streamable HTTP with a bearer token; and the store matrix, which runs one suite on SQLite and on SQL Server with a new empty database per call. The SQL Server settings, the readiness wait and the CI check moved from the T-SQL suite into the store matrix, so only one copy remains;
  - **`docker-compose.yml`** at the root: SQL Server 2022 and Azurite, on 127.0.0.1 ports that avoid other local projects. The SA password comes from the environment.

  Checks:
  - 437 tests. With the compose stand-ins, 435 pass and the two CI-only checks skip; without SQL Server, 44 skip;
  - coverage: 99.7% lines and 97.5% branches with SQL Server, 93.8% lines and 95.5% branches without;
  - lint, tsc, prettier, depcruise (93 modules), markdownlint and gitleaks are clean. No dependency changed, so the audit and licence gates were not re-run.
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