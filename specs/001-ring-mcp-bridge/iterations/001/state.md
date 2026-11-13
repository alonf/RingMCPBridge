# Iteration State: 001

**Schema**: v2
**Last Completed Task**: T032
**Tasks Remaining**: T033-T036 (4 tasks, 6 story_points)
**In Progress**: T033 (the first agent trial and the soak), which the owner runs: Claude Code's loopback sign-in fixed and the pilot's agent list written (DRIFT-001-65)
**Baseline Ref**: ae40fa10981259acab40787c0b60e38366a1cdde
**Updated**: 2026-11-13T00:30:00Z

## Execution Summary

- **The deploy's IDs and the registry's name are GitHub secrets** (2026-11-13; DRIFT-001-68): the repository's logs are public now, and GitHub hides only secrets in them. This deploy reuses the owner's existing registry. The owner's direction on a registry for other owners is recorded for PT-17 (iteration 004).
- **The core's HTTP layer patched before the first deploy** (2026-11-13; DRIFT-001-67): `hono` 4.13.16 and `@hono/node-server` 2.1.6 fix moderate advisories. One of them, a crash on a dropped WebSocket upgrade, applies to the connector's link. No new dependency.
- **The repository is public** (2026-11-13, the owner's choice), so standard Actions runners are free. Workflows from outside contributors' pull requests now need approval.

- **A LICENSE and a work-in-progress README** (2026-11-13; DRIFT-001-66, the owner's choice): MIT, as in `specrew`. The README says the project is not ready to use yet and gives each iteration's status. The full README stays with US7 in iteration 004.

- **CP-19's review is signed off** (2026-11-13):
  - One round (run-20261112-223556945-3034eaa2), about 12 minutes, $0 (estimate). It covered everything changed since CP-17's round: CP-17's follow-up, T030, T031, T032 and T033's loopback fix. Round budget: 2 of 4 used since the reset.
  - It found nothing: the verdict is pass, current for the files as they were.

- **T033 has started** (2026-11-13; DRIFT-001-65): Claude Code's sign-in, which comes back on a loopback port it picks each time, was refused by the Issuer and is fixed. The runbook's Part B lists the pilot's agents, from each agent's published document. The owner runs the bootstrap, the deploy and the trial.

- **T032, the deploy workflow, is done** (2026-11-11; DRIFT-001-64):
  - `.github/workflows/deploy.yml`: Azure changes only when the owner starts it by hand (`preview`, `deploy`, `smoke`, and `image_tag` for a rollback), after CI passed on the commit. Pushes only build the Bicep, with no Azure access.
  - A deploy builds the image on amd64 and arm64 runners, smoke-tests each, pushes both to ghcr.io and the amd64 one to the owner's registry, deploys the Bicep, and runs the smoke test (`/livez`, `/readyz`, and `/mcp` asking for a sign-in). The first deploy skips the smoke test until the bootstrap's second stage.
  - The mode H end-to-end test runs in-process in every CI run, on SQLite and SQL Server: an agent signs in through the Entra stand-in and reads through the connector's link. Containers would have needed test settings in the deployed image.
  - The owner chose the manual deploy and no Azure on pull requests; the plan is Pro. About 2 SP (estimate) against 1, and $0. Running it: about $0.10 a deploy, inside Pro's included compute (estimate).
  - **For T033**: the workflow's first real runs, including the registry push with AcrPush alone; the ghcr.io package's visibility or a read token for the home server; and `get_health` from a signed-in agent.

- **T031, the bootstrap and the runbook, are done** (2026-11-11; DRIFT-001-63):
  - `infra/bootstrap/bootstrap.ps1` runs in two stages around the first deploy, printing its plan unless `-Apply` is passed. Before the deploy: the resource group, the deploy identity with its GitHub OIDC credential and limited roles, and the GitHub variables. After it: AcrPull, the Entra app's federated credential and redirect URI, the first signing key, and the database user's T-SQL.
  - `infra/bootstrap/entra-app-registration.md` gives the owner's one-time steps and their order.
  - Tested against stand-ins only; the agent ran no `az login` and no `-Apply`. About 2 SP (estimate) against 1, and $0.
  - **For T032, owner decisions**: which identity runs the PR what-if (it needs deploy rights), and what the approval gate is while the repository is private (required reviewers need a public repository on Free, Pro and Team).

- **T030, the core's Bicep, is done** (2026-11-11; DRIFT-001-62):
  - `infra/main.bicep` and six modules: App Service B1 running the core's image, Azure SQL Basic (Entra-only, reachable from the core's subnet alone), Key Vault (no secret created), Blob (the account only), Log Analytics (30 days, capped at 0.05 GB a day, at most about $5 a month) and the core's identity, in Israel Central.
  - Checked against Microsoft's docs: with one instance the health check on `/readyz` never takes the core out of rotation, and a switch-over waits on App Service's own ping, never on `/readyz`.
  - Nothing deployed: `az bicep build` only. About 1.5 SP (estimate) against 1, and $0. Deployed, about $23 a month as recorded.
  - **For T031**: AcrPull on the registry for the core's identity, the core's database user, the identity as the Entra app's federated credential, the owner's role to write the first key, and the deploy identity's allow-list (Key Vault Secrets User, Storage Blob Data Contributor). These follow the first deploy, which creates the identity; DRIFT-001-62 gives the order.

- **CP-17's review follow-up is fixed** (2026-11-11; DRIFT-001-61):
  - New agent registrations are limited per hour across the Issuer (`BRIDGE_REGISTRATIONS_PER_HOUR`, 10 by default); over it, 429 and a security event. A registration the owner never links ends after 7 days; the owner's consent keeps it.
  - The Issuer removes every record whose time is up once it serves, then every hour.
  - About 1.5 SP (estimate), booked to CP-16, and $0. Deliberate breaks: 13, all caught.
  - **For T030 and the deployment docs**: `BRIDGE_REGISTRATIONS_PER_HOUR` is optional, 10 by default.

- **CP-17's review is signed off** (2026-11-11):
  - The owner reset the round allowance, then approved one round (run-20261110-230343975-312e4ebf), about 14 minutes, $0 (estimate). It covered T029, CP-06's two follow-ups and the admin page's CI workflow. Round budget: 1 of 4 used since the reset.
  - It found one problem, outside T029, demoted to a note for naming no concrete failure; it holds up against the code. Anyone can register a listed agent's public redirect URIs at the Issuer as often as they like, and each registration is a stored row that is never removed. The security design's T11 called for rate limits on the Issuer's open endpoints, but no task carried them.
  - Checking it found the wider class: the Issuer never deletes its expired records (registrations, unfinished sign-ins, used tokens), so anything that makes it store a record grows the database.
  - The owner chose to stop the review there. The follow-up is fixed before T030, booked to CP-16, and reviewed in the next round.
- **The admin page's browser checks run in CI** (2026-11-11, the owner's choice): a separate workflow, not a required check, only on pushes that change the page (c41b29e). The first run billed 2 minutes.

- **T029, the admin page, is done** (2026-11-10; DRIFT-001-60):
  - Playwright checks it in a real browser at three widths, dark and light: 19 checks in each of the six projects, 114 in all, against a dev server with stand-ins.
  - That found that every form would have failed in a browser: the page's referrer policy made browsers send `Origin: null`. It now sends no referrer only to other sites. Refresh now refreshes; an approval that gets no answer says its outcome is unknown; form bodies are limited.
  - Running the page checks in CI is offered to the owner: about 3 minutes more per push (estimate), from the private repository's Actions allowance.
  - T029 took about 4 SP (estimate) against its 1, and $0.
  - **For the deployment docs task**: the quickstart's approval step should give the page's address, `https://<core>/admin`, and say the owner types the code shown to approve. The admin page always signs in fresh, so it needs the `auth_time` optional claim on the ID token, which step 6 already lists; without it, the owner cannot sign in to the page.

- **T029 part 1, the admin page's server side, is done** (2026-11-10; DRIFT-001-59):
  - The owner signs in afresh at `/admin` and sees the Health section, polled every 15 s, with a banner and what to do for the home offline, Ring signed out, the store down and stale data, and "connector behind".
  - The Enroll section shows the waiting connector's code. To approve, the owner types that code, with a sign-in under 5 minutes old; the page approves only the key it showed, and only on the instance holding the lease.
  - About 2.5 SP so far (estimate) against T029's 1, and $0. 54 new tests; deliberate breaks: 14, all caught.

- **CP-06's review follow-ups are fixed** (2026-11-10; DRIFT-001-58):
  - **A device-list refresh that is not queued is now reported**: the heartbeat tells the core its device list is out of date until the session's own inventory is queued, whether the outbox could not be written, Ring could not be read, or the read failed.
  - **One guard for both home run modes**: mode A now holds the outbox before it opens Ring, as the connector does, so a connector and mode A on the same data folder cannot both reach Ring. Both modes close Ring before they let the outbox go.
  - About 0.75 SP (estimate), booked to CP-08a and CP-10, and $0. Seven tests; deliberate breaks: 7, all caught.

- **CP-06's review is signed off** (2026-11-10):
  - One round (run-20261110-071004856-9c5b0f5d), about 14 minutes, $0 (estimate). It covered T028 and its follow-up.
  - It found two problems, both demoted to notes because neither named a concrete failure. Both hold up against the code, though each needs an unusual situation. The owner chose to stop the review there; both are fixed before T029:
    - a device-list refresh that cannot be written to the outbox is retried, but the heartbeat does not tell the core its device list is out of date;
    - mode A and connector mode guard against a second copy of themselves with different guards, so one of each on the same data folder could both reach Ring with the same saved token.
  - The review's round budget (4 rounds) is spent.

- **T028, the Setup CLI, is done** (2026-11-10; DRIFT-001-57):
  - The owner runs `setup` in the connector's image: the Ring email, the password unseen, the code Ring sent (3 tries). It writes the Secrets File last: Ring's token, the session hardware ID, a new key pair and the enrollment code. It prints the code, and the connector logs it when it enrolls.
  - `BRIDGE_ENROLLMENT_CODE` is gone. A lost outbox beside a kept Secrets File now stops the connector and mode A, which say to run the setup again (closing DRIFT-001-36's limit).
  - About 2 SP (estimate) against 1, and $0. 34 new tests; deliberate breaks: 16, all caught. The image smoke passes its new `setup` case.

- **CP-10's review follow-up is fixed** (2026-11-10; DRIFT-001-56):
  - The home side's stop could wait for ever on a send a pushed-back connection never finishes. It now closes the link before waiting for its scheduler, and closing a link now settles the frame being written as well.
  - The other stop paths were checked for the same ordering.
  - About 0.5 SP (estimate), booked to CP-10 and CP-09, and $0. Two tests; 2 deliberate breaks, both caught.

- **CP-10's review is signed off** (2026-11-10):
  - Three rounds, about 38 minutes in all, $0. They covered everything changed since CP-15's review: the token race fix, T026, T027 and the owner's choice (i).
  - Rounds 1 and 2 found five minor problems, fixed between rounds as the owner chose (DRIFT-001-54, DRIFT-001-55).
  - Round 3 (run-20261110-012921571-b48e7f6f) found one more. The owner chose to stop the review there and have it fixed before T028:
    - on stop, the home side waits for its scheduler before closing the link, so a send stuck on a pushed-back connection could hold the stop forever.
  - CP-10 took about 7.75 SP against its estimate of 2 (estimates).

- **CP-10's review round 2 is fixed** (2026-11-10; DRIFT-001-55):
  - The round (about 13 minutes, $0) passed round 1's fixes and found three minor problems. The owner chose to fix them and run another round.
  - **A Ring token rotation could be lost at shutdown**: closing now waits for a token still being saved.
  - **A tenant named by its domain broke sign-in**: Config now accepts only the tenant ID.
  - **Two connectors on one folder fought**: the connector now holds its outbox file, and a second one stops before it reaches Ring.
  - About 1 SP (estimate), booked to CP-07, CP-08a and CP-10, and $0. Deliberate breaks: 5, all caught.

- **CP-10's review round 1 is fixed** (2026-11-10; DRIFT-001-54):
  - The round (about 13 minutes, $0) found two minor problems. The owner chose to fix them and run another round.
  - **A core stop hung while a home was linked**: the server's close waited for the home's WebSocket. The links now close first, and a test stops the core with a home still linked.
  - **The overview reported cut lists as totals** for a home too large for its token budget. `get_overview` now carries `counts`, the whole home's totals, and its text says when a list was cut. This adds a field to the public contract, which is allowed before release.
  - About 0.75 SP (estimate), booked to CP-10 and CP-14, and $0. Deliberate breaks: 4, all caught.

- **The owner chose (i)** (2026-11-10; DRIFT-001-53): production mode A approves its own home key at start, since its home part runs in the same process with no network link. data-model.md and the web endpoints contract are amended. About 0 SP and $0.

- **T027, the Host, is done** (2026-11-10; DRIFT-001-47 to DRIFT-001-52):
  - **Part 6**: one entry point, `main.ts`, which loads only the chosen mode's wiring; one image for the core and the connector, built for amd64 in CI and checked for arm64 here; and CI's build job now builds the image and starts each mode in it.
  - **Mode A runs end to end over stdio** (the tasks.md checkpoint), in both protocol eras, on the simulated home.
  - **Mode H's core** serves the Issuer, `/mcp`, the link, `/livez` and `/readyz`, and **the connector** links to it over WSS. The lease gates the link and Event.
  - **Found and fixed on the way**:
    - leftover handshake timers in Core Link and Connector Link;
    - a dependency rule that could never fire;
    - the MCP SDK's double start of a stdio server.
  - **Cost**: T027 took about 6 SP against its estimate of 1.5 (estimates: 1, plus 0.5 for the owner's (y)), and $0 besides about 30 s more CI runner time per run for the image (measured). CP-10 took about 7 SP against its estimate of 2, which includes fixes to CP-01's, CP-07's, CP-09's and CP-16's code.
  - CI on 0349fab passed: the build job, now building the image, took 75 s (48 s before).
  - Deliberate breaks for part 6: 5, 4 caught. The one missed removed only `--omit=dev`, which `NODE_ENV=production` already gives npm; removing both was caught once the contents check also looked for the bridge's own dev dependency.
  - **Checks**: 1,140 tests: 1,018 pass and 122 skip without SQL Server (part 6 changes no tested source; with SQL Server, part 5's run stands: 1,127 pass and 13 skip); the image smoke passes on linux/amd64 and, under emulation, linux/arm64; lint, tsc, prettier and depcruise (282 modules) clean.

- **T027 part 5, the connector, is built** (2026-11-10; DRIFT-001-51):
  - The connector runs the home part, keeps its outbox in the data folder, and dials the core over WSS. Tested against mode H's core: it enrolls with its code, waits for the owner, links, and the home's inventory lands in the core's State.
  - The owner's (y): a hub's live connection closed for 5 minutes while Ring's calls work is reported once, and the connector ends for its service to restart it.
  - The connector serves no HTTP in iteration 001: its health reaches the core in each heartbeat.
  - About 1 SP against an estimate of 1 (estimates), and $0. Deliberate breaks: 9, all caught.

- **T027 part 4, mode H's core service, is built** (2026-11-10; DRIFT-001-50):
  - The core runs behind one HTTP server: the Issuer under `/oauth` (and its metadata at the standard path), the owner's sign-in return, `/mcp`, the home's link at `/link`, `/livez` and `/readyz`.
  - It starts in order: migrations, the listed agents from the settings, the lease, then the link while the lease is held. The Issuer starts once its signing keys exist, trying again every minute.
  - `/readyz` is ready only with the database, the lease, the signing keys and the owner in place, and names what is missing.
  - The Issuer gains proxy trust for App Service, off by default.
  - Tested on SQLite with the stand-in Entra, including a home linked over WebSocket. The real wiring (Azure SQL, Key Vault, Entra) is proved in the pilot.
  - About 1.5 SP against an estimate of 1 (estimates), and $0. Deliberate breaks: 9, all caught.

- **T027 part 3, mode A, runs end to end** (2026-11-10; DRIFT-001-49):
  - The MCP SDK client starts the dev script over stdio, in each protocol era, and the four read tools answer on the simulated home of about 100 devices, about 17 s to 24 s after start.
  - That check found two things, both fixed.
    - The SDK client, pinned to 2026-07-28, starts a short-lived copy of the server first. So mode A's lease now uses a short timing (2 s and 6 s), and its home part opens only once it holds the lease.
    - A timer left behind in Core Link kept mode A alive 30 s after its client left.
  - Production mode A's home key waits for the owner's confirmation (T029); the owner is asked whether it should be approved at start.
  - About 1.5 SP against an estimate of 1 (estimates), and $0. Deliberate breaks: 7 for mode A, all caught, and 6 for the dependency rules, all caught.

- **T027 part 2, the shared assemblies and the lease gate, is built** (2026-11-09; DRIFT-001-48):
  - The core's components and the home's are assembled once, for mode H's core, the connector and mode A alike.
  - The connector link and Event, the only writer of State, run only while this instance holds the lease. A standby refuses links, and a holder that loses the lease closes its links and stops Event before another instance can take over.
  - Tested in one process: the home's inventory and a live change reach State, a standby refuses a link, and a handover never runs the link on both cores.
  - About 1 SP (estimate) and $0. Deliberate breaks: 9, all caught.

- **T027 part 1, Config's settings for each run mode, is built** (2026-11-09; DRIFT-001-47):
  - Each run mode reads its own settings once the mode is known: the core's public URL, port, proxy trust, database, vault, identity, Entra app, owner and listed agents; the connector's core URL (`wss:` only), data folder, key file, ffmpeg and enrollment code; and mode A's data folder, key file and ffmpeg.
  - An error names every bad variable, never a value.
  - About 0.5 SP (estimate) and $0. 35 tests at 100% coverage; deliberate breaks: 11, all caught.

- **T026, the Lease accessor, is built** (2026-11-09; DRIFT-001-46):
  - One row per Ring account, renewed every 15 s, expiring 45 s after the last renewal. One statement takes or keeps it, so only one instance holds it, on SQLite and on SQL Server.
  - The holder stops counting on the lease 15 s before its row expires. Two instances whose clocks differ by up to 15 s never both hold it.
  - Fail closed: a renewal that finds another holder drops the hold at once, and a failed or slow write lets it run out. A stopped instance hands the lease over at the other instance's next renewal.
  - Its status says why an instance lacks the lease, for `/readyz`.
  - For T027: the lease's name (one per deployment), wiring the connector link and State writes to it, and how the first migration runs before the `lease` table exists.
  - About 1 SP against an estimate of 1 (estimates), and $0. Deliberate breaks: 19, all caught; two missed at first, and each got a test.
  - **CI flake**: CI's first run on 9d663d8 failed three timing-based SQL Server tests in `tsql.test.ts`, which cut a connection a set time after a statement starts. A rerun passed. The Lease tests had made 13 SQL Server databases at the same moment. They now share one database per run, with a lease name per test, taking 6 s instead of 17 s locally; the 19 breaks are still all caught.
  - **Checks**:
    - 1,093 tests: 972 pass and 121 skip without SQL Server;
    - with SQL Server on 2 workers, 1,080 pass and 13 skip;
    - coverage with SQL Server: 97.7% of lines and 93.4% of branches;
    - lint, tsc, prettier and depcruise (246 modules) clean.

- **CP-15's review follow-up is fixed** (2026-11-09; DRIFT-001-45):
  - A code or refresh token redeemed twice at the same moment no longer gets two sets of tokens. The store marks it used in one statement, and the request that loses is refused. When it was used already, the grant ends, so the other request's new tokens stop working too, as for any reuse.
  - The two races are tested at the Issuer: both requests read the token before either marks it. On today's code before the fix, both answered 200.
  - SQL Server test databases now run with read-committed snapshot, Azure SQL's default, and the whole suite passes that way.
  - About 1 SP against an estimate of 0.5 (estimates), and $0. It is booked to CP-16, whose code it fixes: CP-16 has now taken about 5 SP against its estimate of 3. Deliberate breaks: 12, all caught.
  - **Checks**:
    - 1,062 tests: 957 pass and 105 skip without SQL Server;
    - with SQL Server on 2 workers, with snapshot reads, 1,050 pass and 12 skip;
    - coverage with SQL Server: 97.6% of lines and 93.3% of branches;
    - lint, tsc, prettier and depcruise (243 modules) clean.

- **CP-15's review is signed off** (2026-11-09):
  - One round (run-20261109-185805237-2a0a159a, about 13 minutes, $0) found nothing in T024 or T025.
  - It found one problem in the Issuer's token store, built in CP-16. The owner chose to stop the review there and to have it fixed as a follow-up before T026:
    - when a code or refresh token is redeemed, the store checks it is unused, reads the database a few more times, then marks it used. Two requests with the same token at the same moment can both pass, so a stolen refresh token raced against the agent's own refresh escapes the reuse check that would end the grant.
  - The reviewer called it major; Specrew demoted it to minor because it named no concrete failure scenario. The scenario above is ours, from reading oidc-provider's code.
  - CP-15 took about 4 SP against its estimate of 2 (estimates).

- **T025, the read rate limit, is built** (2026-11-09; DRIFT-001-44):
  - Each agent may make 600 reads in any hour (Config's `readsPerHour`), counted in memory. A read over the limit answers `RATE_LIMITED` with the seconds until a read is free, and a refused read does not count.
  - The read latency check runs in CI: the four tools on the 100-device home, in both eras, within 0.5 s at the 95th percentile. Calls took about 5 ms each on the developer's machine (derived).
  - The completeness check now sees every iteration 001 error code in both eras.
  - About 1 SP against an estimate of 1 (estimates), and $0. CP-15 took about 4 SP against its estimate of 2 (estimates).
  - 9 deliberate breaks, all caught.
  - **Checks**:
    - 1,051 tests: 949 pass and 102 skip without SQL Server;
    - with SQL Server on 2 workers, 1,039 pass and 12 skip;
    - coverage with SQL Server: 97.6% of lines and 93.2% of branches;
    - lint, tsc, prettier and depcruise (242 modules) clean.

- **T024, the MCP Endpoint, is built** (2026-11-09; DRIFT-001-42):
  - One endpoint, `/mcp`, serves both protocol eras. It serves the four read tools, with inputs and replies exactly as the Public Contract publishes them.
  - **Tokens**: every request's token is checked by the Issuer (`checkAccessToken`), so a revocation takes effect on the next call.
    - A missing or bad token is a 401, and a token without `read` a 403, each naming the protected-resource metadata.
    - While the Issuer cannot check, the answer is 503, so agents keep their tokens.
  - **Errors**: a bad input gets the contract's `INVALID_ARGUMENT` envelope, not the SDK's own text. A read that runs past 60 s answers `TIMEOUT`.
  - **Mode A** serves the same tools over stdio, with the log on stderr.
  - **Tests**:
    - both eras through the SDK client;
    - an agent linked at the real Issuer reading with its token, until the token ends or the agent is revoked;
    - stdio in both eras;
    - a completeness check that reads `errors.md` (`RATE_LIMITED` waits for T025).
  - 25 deliberate breaks, 23 caught. One miss is an expiry check that two others stand behind. The other showed a branch that could never run, which was removed.
  - **The owner's choice (b)** (DRIFT-001-43): the endpoint contract promised Entra tokens from Azure-hosted agents in iteration 001, but no task built them. They now come with the iteration that first lists such an agent; 0 SP now.
  - **Cost**: about 3 SP against an estimate of 1 (estimates), and $0. CP-15 is now expected to take about 4 SP against its estimate of 2 (estimate).
  - **Checks**:
    - 1,041 tests, 939 passing and 102 skipped without SQL Server;
    - with SQL Server on 2 workers, 1,029 pass and 12 skip. On 4 workers, one SQL Server suite's database setup ran past its limit under load; it passes alone, and nothing in T024 touches it;
    - coverage with SQL Server: 97.6% of lines and 93.2% of branches;
    - lint, tsc, prettier and depcruise (240 modules) clean.

- **The two follow-ups from CP-16's review are fixed** (2026-11-09; DRIFT-001-41):
  - **Camera status.** A camera's or doorbell's battery and online status now carry the time Ring last reported them, in `list_devices` and the overview. Old camera data no longer looks current. No new calls to Ring.
  - **Sensors added or removed.** An alarm sensor added or removed in Ring now shows when Ring next sends its hub's device list, on a reconnect or a restart. The connector reads the home again and sends a full inventory, and it stops watching a removed sensor. How soon that happens on the owner's home is a pilot check.
  - About 1.5 SP (estimate) and $0. A deliberate break of sixteen parts was caught.
  - Checks:
    - 991 tests: 889 pass and 102 skip without SQL Server. With it, 979 pass and 12 skip on 4 workers.
    - On the default worker count, two existing SQL Server tests run past their 5 s limit under load. They take 2.5 s and 3.1 s alone, and nothing in this change touches them.
    - Coverage with SQL Server: 97.7% of lines and 93.7% of branches.
    - lint, tsc, prettier and depcruise (233 modules) are clean.

- **CP-16's review is signed off** (2026-11-08):
  - One round (run-20261108-192725666-de16690a, about 12 minutes, $0) found nothing in the Issuer.
  - It found two minor problems in the read path, outside CP-16. The owner chose to stop the review there and to have both fixed as follow-ups before T024:
    - a camera's battery and online status are read from Ring only with an inventory, while a reply's time moves on with each heartbeat, so old camera data can look current;
    - an alarm sensor added after the connector starts is not reported until something else changes, and one removed stays listed.
  - CP-16 took about 4 SP against its estimate of 3 (estimates).

- **T023, the Issuer, is built** (2026-11-08; DRIFT-001-39):
  - oidc-provider under `/oauth`, over Grants. Listed agents link by client document or by registering themselves, and the owner consents with an Entra sign-in.
  - Only the owner signs in: the owner's object id is checked (the owner's choice (c)), and the app registration requires assignment.
  - Lifetimes: access tokens 1 hour, rotating refresh tokens 30 days unused and 90 days at most, `read` only.
  - A check before the review found that the sign-in was not bound to the browser that started the link, so someone else's link could have taken the owner's consent. It is fixed and tested (DRIFT-001-40).
  - About 3 SP against an estimate of 2 (estimates), the fix included, and $0. CP-16 has now taken about 4 SP against its estimate of 3.

- **CP-14's review is signed off** (2026-11-08):
  - Round 6 (run-20261108-162106827-bed7a0bd, 12 minutes, $0) found nothing, on exactly the committed tree (1d7ac4b).
  - Specrew completed the review on its own, with no decision needed from the owner.
  - Rounds 3 to 5 found seven real defects, all fixed test-first (DRIFT-001-36 to DRIFT-001-38).
  - CP-14 took 8 SP against its estimate of 3 (estimates), with the extra in those fixes.

- CP-14 review round 5 found two more problems, and both are fixed (DRIFT-001-38), on the owner's choice to fix both and run one more round:
  - a change the home cannot write to its outbox (a full disk) no longer leaves old data shown as current: the heartbeat names the version the home owes an inventory beyond, and the core keeps the data stale until it stores the session's inventory above it;
  - a heartbeat that waited its turn no longer counts as new: Connector Link stamps each frame as it arrives, and Event counts the heartbeat, and checks for silence, from then.

  The round-4 wording on overlapping reads is corrected in the link contract and above. About 2 SP (estimate), in CP-14's actual. A deliberate break of fifteen parts was caught. Checks:
  - 935 tests: 834 pass and 101 skip without SQL Server; with it, 923 pass and 12 skip;
  - coverage with SQL Server: 97.9% of lines and 94.6% of branches;
  - lint, tsc, prettier and depcruise (222 modules) clean.

- CP-14 review round 4 found two more problems, and both are fixed (DRIFT-001-37), after the owner reset the review allowance and chose to fix both:
  - an inventory read before a reconnect, or sent on an alarm mode change during the new session's read, no longer ends that session's refresh: an inventory names a session only when its Ring read began in it, and a read that finishes after one begun later is dropped;
  - a key check that answers late can no longer take State from a newer key's session: Connector Link runs each link's last key check and its claim of State one link at a time.

  About 1 SP (estimate), in CP-14's actual. A deliberate break of six parts was caught. Checks:
  - 924 tests: 823 pass and 101 skip without SQL Server; with it, 912 pass and 12 skip;
  - coverage with SQL Server: 97.9% of lines and 94.5% of branches;
  - lint, tsc, prettier and depcruise (222 modules) are clean.

- CP-14 review round 3 found three ways old data could look current or come back, and all three are fixed (DRIFT-001-36), on the owner's choice to fix them and run round 4:
  - a resent older inventory can no longer bring back what a newer one removed, and an empty one now clears the home: every inventory carries its own version, and State skips one older than the newest it applied (migration 5);
  - after a reconnect, the data stays stale until that session's own inventory is stored, even when the first try fails: every inventory names the session it was composed for;
  - the link contract's `inventory` gains the two fields, before version 1's release: `snapshot_version` is required, so the change is not additive, and no deployed home sends the old shape.

  About 2 SP (estimate), in CP-14's actual. The owner's (y) for the Ring library's reconnect is a carry-forward to T027 (DRIFT-001-35). A deliberate break of twelve parts was caught. Checks:
  - 920 tests: 819 pass and 101 skip without SQL Server; with it, 908 pass and 12 skip;
  - coverage without SQL Server: 96.2% of lines and 93.9% of branches;
  - lint, tsc, prettier and depcruise (222 modules) are clean.

- After T021, on the owner's choice of (c)+(a), the Ring Adapter notices Ring going away and coming back with no read running (DRIFT-001-35, CP-07):
  - a hub's live connection closed for more than 30 s makes Ring unavailable until it opens again;
  - while calls to Ring fail, it asks Ring once a minute, at most about 60 calls an hour and only during an outage (derived), and says `ok` again when Ring answers.

  Open for the owner: after a Ring outage that answers with a server error, the library may not reopen its live connection until the connector restarts. About 1 SP (estimate), in CP-07's actual. A deliberate break of nine parts was caught. Checks:
  - 902 tests: 805 pass and 97 skip without SQL Server; with it, 890 pass and 12 skip;
  - coverage without SQL Server: 96.2% of lines and 93.8% of branches;
  - lint, tsc, prettier and depcruise (221 modules) are clean.

- T021 (the Inquiry manager, last of CP-14) is done, in `bridge/src/core/managers/inquiry/`:
  - `get_overview`, `list_devices` (by type and room), `get_device` and `get_health`, each reply saying when its data was true, in UTC and the location's local time, and whether it is `cached` or `stale`;
  - the data is stale while the home link is down or the Ring session is not `ok`, since the earlier of the two (SC-005); the store down fails a read as `BRIDGE_UNAVAILABLE`, never with stale data;
  - an omitted `location_id` resolves to the only owned location; shared locations stay hidden (FR-036).

  Ring down at the simulated home shows as stale within 2 minutes, end to end. At a real home, a Ring outage is not yet detected while no read runs; that is open for the owner (DRIFT-001-34, with the other choices). A deliberate break of thirteen parts was caught. Checks:
  - 893 tests: 796 pass and 97 skip without SQL Server; with it, 881 pass and 12 skip;
  - coverage without SQL Server: 96.1% of lines and 93.8% of branches;
  - lint, tsc, prettier and depcruise (221 modules) are clean.

- T020 (the Summary engine, second of CP-14) is done, in `bridge/src/core/engines/summary/`, with its tests written first:
  - `get_overview`'s data (location, alarm mode, open contacts, active motion, offline devices, low batteries and health), the default device list, and the health, in the contract's shapes;
  - within 8,000 tokens per reply, estimated as characters ÷ 3: on the 100-device home, the overview takes about 401 tokens and the device list about 4,012 (derived);
  - a home too large for the budget has its lists cut, keeping the full count.

  The choices and the carry-forwards to T021 are in DRIFT-001-33. A deliberate break of eight parts was caught. Checks:
  - 870 tests: 773 pass and 97 skip without SQL Server; with it, 858 pass and 12 skip;
  - coverage without SQL Server: 96.1% of lines and 93.7% of branches;
  - lint, tsc, prettier and depcruise (217 modules) are clean.

- T018 (Event's intake and the Health engine's link rules, CP-11a) is done:
  - **the Health engine**, pure rules on the core's clock, with its tests written first: the home is offline and its data stale after 2 silent minutes, and comes back on the next sign of life;
  - **the Event manager** applies inventories and device changes to State latest-wins, one step at a time, and keeps the health, publishing each change on Pub/Sub;
  - **versions belong to one connector key** (migration 4): a new key's session resets them, so a newly enrolled connector wins, while a key no longer current changes nothing. This replaces resetting them at approval, which a queued message could not order;
  - **Connector Link** acks every outcome and asks the home for one inventory when a change names a device the core does not hold.
  - **A follow-up after a second look:** the key is checked once more after the signature, and Event records the session's start before `hello_ok`; if either fails the link closes and the home dials again. Before this, a failed start left every later message acked but never stored.

  The choices and the carry-forwards to T021, T027 and T029 are in DRIFT-001-32. A deliberate break of fifteen parts was caught, three of them for the follow-up. Checks:
  - 862 tests: 765 pass and 97 skip without SQL Server; with it, 850 pass and 12 skip;
  - coverage without SQL Server: 96.0% of lines and 93.9% of branches;
  - lint, tsc, prettier and depcruise (214 modules) are clean.

- T019 (State, first of CP-14) is done, in `bridge/src/core/access/state/`:
  - locations, devices and the health snapshot, with `type` mapped from `kind`;
  - latest-wins by `state_version` in one statement per row;
  - a full snapshot also removes what Ring no longer lists, safely against a resent older one;
  - both dialects take the same input: an entry with an over-long id is left out and counted, and a long name is cut to fit;
  - the store-down error for Inquiry's `BRIDGE_UNAVAILABLE`.

  The choices and the carry-forwards to T018 and T029 are in DRIFT-001-31. A deliberate break of eight parts was caught. Checks:
  - 836 tests: 740 pass and 96 skip without SQL Server; with it, 824 pass and 12 skip;
  - coverage without SQL Server: 95.9% of lines and 93.7% of branches;
  - lint, tsc, prettier and depcruise (207 modules) are clean.

- **CP-09's review is signed off** (2026-11-07). The owner typed `stop the review here` after round 6. Its one finding, that migration 3 cannot install over two waiting enrollment requests, was accepted without a code change: no such database exists, and migrations may only add (DRIFT-001-30). Over rounds 3 to 6 (46 minutes, $0), seven real defects were found and fixed test-first. The signed-off tree is 000fd89.

- CP-09's co-review round 5 (10 minutes, $0) passed the round 4 fixes and found one more real defect, in the Ring Adapter, now fixed test-first (DRIFT-001-29): reads the Ring library answers from memory reset the outage circuit and marked the session as fine. The test fake now models that memory. A deliberate break of four parts was caught. Checks:
  - 811 tests: 728 pass and 83 skip without SQL Server; with it, 800 pass and 11 skip;
  - coverage without SQL Server: 95.8% of lines and 93.8% of branches;
  - lint, tsc, prettier and depcruise (203 modules) are clean.

- CP-09's co-review round 4 (11 minutes, $0) passed the round 3 fixes and found two more real defects, now fixed test-first (DRIFT-001-28):
  - two enrollment requests at the same instant could both stay waiting on SQL Server; migration 3 allows one, and the losing request tries once more;
  - the Home Scheduler kept a timer handle for every tick it ever ran.

  The owner reset the round allowance for another round. A deliberate break of three parts was caught. Checks:
  - 808 tests: 725 pass and 83 skip without SQL Server; with it, 797 pass and 11 skip;
  - coverage without SQL Server: 95.8% of lines and 93.6% of branches;
  - lint, tsc, prettier and depcruise (203 modules) are clean.

- CP-09's co-review round 3 (13 minutes, $0) found four real defects, now fixed test-first (DRIFT-001-27):
  - a stranger's `enroll` could end an enrolled home's session;
  - a device change the home could not queue stayed lost until something else happened;
  - a link could make the core hold many frames in memory;
  - the home could queue copies of its backlog in memory after a long outage.

  A deliberate break of nine parts was caught. Checks:
  - 801 tests: 721 pass and 80 skip without SQL Server; with it, 790 pass and 11 skip;
  - coverage without SQL Server: 95.8% of lines and 93.6% of branches;
  - lint, tsc, prettier and depcruise (202 modules) are clean.

- T017 (Connector Link, the last of CP-09's three tasks) is done:
  - **Connector Link** (`bridge/src/core/clients/connector-link/`), the core's end of the link:
    - checks the signed hello through Admin: the version, the key, a fresh challenge and its signature (SC2);
    - closes with the exact reasons the home acts on, and with its own reasons, after which the home simply dials again;
    - holds an `enroll` request until the owner approves it, then says `enrolled` on the same link;
    - hands the inventory, device changes and heartbeats to Event, and acks only after Event commits;
    - takes each link's messages one at a time, in order;
    - keeps one session per key, one link waiting for the owner, and at most 8 links that have not proved a key.
  - **Ahead of their tasks:** a minimal Admin manager (the key check and the enroll request; T029 adds approval), and Event's intake, which T018 implements.
  - **Approvals and revocations are found by polling:** every 2 s while a request waits, and every 15 s for an open session's key.
  - **Prep, in its own commit (042f941):** Settings' DTOs take the records' names, the hello and enroll schemas are tighter, and `dialLink` can trust a test's throwaway certificate.

  The choices, one deviation (the hand-over to Event is an awaited call, not a queued one) and the carry-forwards to T018, T027 and T029 are in DRIFT-001-26. A deliberate break of 24 parts was caught. Checks:
  - 794 tests: 714 pass and 80 skip without SQL Server; with it, 783 pass and 11 skip;
  - the both-ends contract test ran with drops, delays and duplicates, over the in-memory pair and over real WSS with TLS on localhost;
  - coverage without SQL Server: 95.8% of lines and 93.3% of branches;
  - lint, tsc, prettier and depcruise (202 modules) are clean.

- T022 (the core's accessors for sign-in, first of CP-16's two tasks, done ahead of T017, which needs it) is done:
  - **Settings** (`bridge/src/core/access/settings/`):
    - the agent listing, seeded from configuration in one transaction; an agent still listed keeps the owner's revocation, and one no longer configured is removed and reported;
    - the enrollment keys: a request waits 10 minutes and replaces any other; approving it makes its key the one active key and revokes every older one, in one transaction;
    - the battery threshold, or Config's default until the owner sets one.
  - **Grants** (`bridge/src/core/access/grants/`): oidc-provider's records in the one `(model, id)` table (PT-11). A bearer token's id is kept only as its hash, its `jti` is not stored, and `find` gives it back. A record whose time is up is never found.
  - **Secrets** (`bridge/src/core/access/secrets/`): Key Vault in mode H, and a sealed file in mode A. A missing secret is a value, so `/readyz` can name it. Only one `.live.ts` file imports Azure.
  - **Migration 2** adds the pending request's code to the `connector` table, for the admin page.
  - `Secret` and the one-step file write moved into the security utility first, in their own commit (59490b6).

  The choices and the carry-forwards to T017, T023 and T027 are in DRIFT-001-25. A deliberate break of 22 parts was caught. Settings and Grants were also run on a local SQL Server before the push. Checks:
  - 753 tests: 675 pass and 78 skip without SQL Server; with it, 744 pass and 9 skip;
  - coverage without SQL Server: 95.7% of lines and 93.5% of branches; with it, 98.0% and 94.4%;
  - lint, tsc, prettier and depcruise (184 modules) are clean.

- T016 (Core Link and the Home Scheduler, second of CP-09's three tasks) is done:
  - **Core Link** (`bridge/src/connector/clients/core-link/`):
    - dials out, says `hello` with its key's id, signs the core's challenge, and on `hello_ok` puts the link in the `LinkSlot`;
    - enrolls with the public key and the printed code after the core says the key is not enrolled;
    - stops for good on a revoked key;
    - dials again after 1 to 30 s with jitter, starting over only after a session opened.
  - **The Home Scheduler** (`bridge/src/connector/clients/home-scheduler/`): Ingest sends what is due every 10 s and the heartbeat every 15 s.
  - **Ingest now sends** on the link in the slot.
    - A new session first makes every unacked message due again, and nothing is sent until that is done. Then it sends a fresh inventory.
    - A change goes out at once.
    - An oversized message is logged once and dropped.
  - **The link messages** are declared by their receivers in narrow `messages/index.ts` entries. Connector Link's is made ahead of T017. The owner confirmed this amendment to CD4 on 2026-11-07. The dependency rule now allows exactly this, and closes a loophole that allowed any nested `index.ts`.
  - **The key's id** is derived from its public key (`signingKeyId`), so the home keeps no enrollment state.

  The choices and the carry-forwards to T017, T027 and T028 are in DRIFT-001-23. The owner chose (a) for T017's TLS test: a throwaway `openssl` certificate. A deliberate break of fourteen parts was caught. Three of those defects were in the first version (c5322ff), found by a second look after it was pushed, and fixed test-first: a send that could overtake older unacked messages at a session's start, an unobserved failure of Core Link's loop, and an error logged on a clean stop. Checks:
  - 678 tests: 629 pass and 49 skip without SQL Server;
  - coverage without SQL Server: 95.2% of lines and 92.8% of branches;
  - lint, tsc, prettier and depcruise (166 modules) are clean.

- T015 (the Link transport, first of CP-09's three tasks) is done, in `bridge/src/utilities/link-transport/`, over ws 8.22.0 with `@types/ws` 8.18.2 (the owner's choice a):
  - **frames:** a message (a type name and a JSON body) or a chunk (a type name, a JSON header and bytes). Only the envelope is checked. A frame the link does not accept closes it as `malformed_frame`, keeping nothing of its text;
  - **the protocol version** (1) and the receiver's check for N or N-1;
  - **the sending order:** messages before chunks, one frame at a time. `send` resolves `sent` or `closed`;
  - **WSS:** `dialLink` (wss:, or ws: to this machine for tests) and `LinkServer` for the Host's upgrade requests. Frames are capped at 1 MiB and compression is off on both ends. Ping runs every 10 s, and 20 s of silence ends the link;
  - **the in-memory pair** for tests, with the same frames and order, and the controls to hold writes and drop the connection;
  - **two new dependency rules:** ws only inside the transport, and the transport imports nothing from the bridge's components.

  The choices and the carry-forwards to T016 and T017 are in DRIFT-001-22. One of them is for the owner: a certificate for T017's TLS test. A deliberate break of nine parts was caught. Checks:
  - 654 tests: 605 pass and 49 skip without SQL Server;
  - coverage without SQL Server: 95.4% of lines and 93.7% of branches; the transport is at 97.6% of lines;
  - lint, tsc, prettier and depcruise (154 modules) are clean.

- CP-08a co-review (codex; checkpoint `cp-08a-outbox-ingest-review`). The owner typed `approved for allowance reset` to review T014 and the migration-runner change now, rather than fold them into the round after T028. The reset cost $0, and Specrew counted it as the round approval.
  - **Round 1 of 4** (`run-20261106-234102754-7edcd9ba`, 9 minutes) reviewed everything since the last sign-off (T011): T012, T013, T014 and the runner change. CP-07 has therefore had its co-review. It found nothing in T012, T014 or the runner. It found two faults in the Ring Adapter, both confirmed by reading the code and both demoted to minor by Specrew:
    - a call given up on at the deadline or on abort kept reaching Ring through ring-client-api's own endless retries, and each later timeout added another loop;
    - a call queued before the session was lost still reached Ring, and could change `lost` back.
  - **The owner chose to fix now and run one more round.** Both fixes are made, each after a test that failed on the old code:
    - at most one library call runs at a time, counting one given up on;
    - the lost check runs again when a queued call's turn comes, and `lost` is final.

    A deliberate break of three parts was caught. Details are in DRIFT-001-20. Checks:
    - 612 tests: 563 pass and 49 skip without SQL Server;
    - coverage without SQL Server: 94.7% of statements and 94.1% of branches;
    - lint, tsc, prettier and depcruise (142 modules) are clean.
  - **Round 2 of 4** (`run-20261107-001546242-41b0ecfa`, 8 minutes; Specrew's total is 17 minutes over 2 rounds) found nothing wrong with the fixes. It found 1 new minor finding, confirmed by reading the code: fix 1 let the 1 s spacing pass while a call waited for an abandoned one. The owner typed `stop the review here`, and review sign-off completed on 2026-11-07 on exactly the tree round 2 reviewed (1d172a2).
  - **The follow-up is fixed:** the gate books the spacing again when a call really reaches Ring (`markCallStarted`). This came after two tests that failed on the old code.
  - **Owner's choice for T015's types:** (a) `@types/ws` 8.18.2, dev-only, MIT, $0. It is installed after the review, so the reviewed tree does not change.

- An external review of 1d172a2, pasted by the owner, found that a device read reported ring-client-api's cached camera data as fresh. With its polling off, the library never refreshes a camera after the first read.
  - **The fix:** each device read refreshes the location's cameras from one `fetchRingDevices` call through the gate, and leaves out a camera Ring no longer lists. The fake Ring client now caches as the library does.
  - **Carried forward:** recheck the `ip` advisory's reach before live media, and make CI's build step real with T027. Details are in DRIFT-001-21.
  - **Checks for both fixes:** 616 tests, of which 567 pass and 49 skip without SQL Server; coverage 95.1% of lines and 94.1% of branches; lint, tsc, prettier and depcruise (142 modules) are clean. A deliberate break of four parts was caught.

- T014 (the Outbox Store and Ingest's state path; completes CP-08a) is done:
  - **the Outbox Store** (`bridge/src/connector/access/outbox-store/`), in the connector's own SQLite file. A message is written before it is sent. It is resent 10 s after a send without an ack, sent again oldest first after a reconnect, and cleared only on its ack. The `state_version` counter is saved in the same transaction as its message, so versions keep rising across a restart;
  - **Ingest's state path** (`bridge/src/connector/managers/ingest/`): an `inventory` at session start and on `inventory_request`, and a `device_state` with the device's full entry on each change, written in arrival order. A change that arrives during a read is folded into that read's inventory. An alarm-mode change sends the inventory again, because no other iteration 001 message carries a location;
  - **the migration runner** now accepts a schema for one dialect, so the outbox needs no T-SQL.

  The choices and the carry-forwards to T016 are in DRIFT-001-19. A deliberate break of eight parts was caught. Checks:
  - 607 tests: 558 pass and 49 skip without SQL Server;
  - coverage without SQL Server: 94.7% of lines and 94.2% of branches;
  - lint, tsc, prettier and depcruise (142 modules) are clean.

- The owner's answers of 2026-11-06 on T013 are applied: installs skip install scripts everywhere (quickstart.md Step 2), mediabunny is accepted and pinned to 1.62.1, T013 stays complete with the rooms and `commStatus` checks carried to the pilot, and CP-07 is reviewed together with CP-06 after T028 (DRIFT-001-17 and DRIFT-001-18).

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