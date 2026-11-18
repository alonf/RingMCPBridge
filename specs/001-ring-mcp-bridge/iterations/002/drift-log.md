# Drift Log: Iteration 002

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

**Total drift events**: 17
**Resolution rate**: 100% (17/17 resolved or decided)
**Specification drift**: One deferral, decided by the owner: FR-012's local relay for a desktop coding agent (DRIFT-002-02). Three additions beyond the spec's text, decided by the owner: the backlog in the heartbeat and `get_health`, the backlog alert, and the Ring-session-lost alert brought forward (DRIFT-002-04). DRIFT-002-01 carries iteration 001's closeout facts, which its sealed drift log cannot take. DRIFT-002-03 carries iteration 001's quality override into iteration 002's plan.

## Events

### DRIFT-002-17: a doorbell press was dropped as a repeat of the person alert before it; the event id now says what happened

- **Detected**: 2026-11-18, the home run on the image with push-receiver 4.3.1. The doorbell's person alert (motion, `human`, 14:15:17 UTC) and the press 7 seconds later (`ding`, `button_press`) carried the same Ring id. Normalize used Ring's id as the event id, so the core logged `connector_link_event_duplicate` for the press and stored only the alert: the HIGH event was lost.
- **Kind**: a defect in T042, found by the first real run.
- **Observed**: Ring keeps one id for a doorbell's whole visit, across its motion, person and press notifications. The same push sent twice (seen at 14:13:57, 0.2 s apart) also carries the same id, and that repeat must still be dropped.
- **Resolution**: implementer fix inside T042. The event id is now Ring's id and a one-letter code for what happened: `d` a press, `p` motion with a person, `m` other motion, `i` an intercom ring, `o` anything else. A failing test came first (`normalize.test.ts`), and the fixtures now follow the field layout the home run recorded, with made-up values. Events stored before the fix keep their ids; the next deploy and home update carry the fix.
- **Requirement citation**: FR-008 (every event recorded, a repeat recognised by its event id), SC-002; T042.
- **Carry-forward**: the doorbell test is repeated after the next deploy and home update. A motion that Ring later upgrades to a person is now its own event (`m` then `p`), so the person alert is never lost behind a plainer one.
- **Class closure**: NONE - the real pushes are now the fixtures' layout.

### DRIFT-002-16: Ring's push failed to decrypt at home; the push library is pinned to 4.3.1, and the licence gate reads the lockfile for that one edge

- **Detected**: 2026-11-18, the owner's home run of the push probe (T038 part 2): a doorbell press and a camera walk-by each logged `ERR_CRYPTO_ECDH_INVALID_PUBLIC_KEY` from `@eneris/push-receiver`, and the bridge saw no push at all.
- **Kind**: an upstream bug in a pinned dependency, and a dependency decision by the owner.
- **Observed**:
  1. **The cause.** FCM's `crypto-key` header now carries more than the sender's key (`dh=…; p256ecdsa=…`). push-receiver 4.3.0, which `ring-client-api` 14.3.0 pins exactly, cuts the `dh=` prefix by length and keeps the rest as part of the key. 4.3.1 reads the header's parameters by name. Its only other change is one more socket close; the rest is compiler output, with the same API, dependencies and MIT licence. A regression test (`bridge/test/ring-boundary/push-decrypt.test.ts`) builds a push in FCM's current form: it fails on 4.3.0 with the owner's error and passes on 4.3.1.
  2. **The options the owner weighed:** pin 4.3.1; move to `ring-client-api` 15.0.0-beta.0, which pulls push-receiver 4.4.0; or wait. The beta was installed and tested in a throwaway worktree. It also moves `undici` 7 to 8 (all Ring calls and the hub's live connection), breaks the setup's sign-in tests (it calls undici's own `fetch`, so the tests' stub no longer intercepts it), and pulls `mediabunny` 1.66.0, outside the owner's MPL-2.0 exception for 1.62.1. In that run, the 5 unintercepted sign-in tests reached Ring's real sign-in address with the tests' made-up credentials and were refused; no owner account was involved.
  3. **How it is pinned.** A root `overrides` entry, `@eneris/push-receiver: 4.3.1`. npm 11.9.0 does not apply it to the existing lockfile entry, so the entry was set by hand (version, tarball and the registry's integrity hash), as for `mediabunny` in DRIFT-001-17. `npm ci` installs 4.3.1, and the Docker image installs from the same lockfile.
  4. **The licence gate.** npm 11.9.0 still calls the overridden edge invalid (it requires 4.3.0), even after a clean install from scratch, and `npm sbom` then refuses to run. The edge is listed in `scripts/npm-tree-exceptions.json`. When every problem npm reports is a listed edge, `scripts/license-gate.mjs` reads the same facts from `package-lock.json`: each package's name, version, licence and whether it is development-only. Any other problem still stops the gate. The lockfile reading is stricter than npm's list: it treats 226 packages as runtime where `npm sbom --omit dev` counted 126, and it also checks the optional packages for other platforms.
- **Requirement citation**: FR-008, FR-042, SC-002 (no event without push); `implementation-rules.yml` dependency policy and `project.supply-chain-policy`; T038.
- **Resolution**: human-decision, by the owner's typed "OK, Option 1" on 2026-11-18, after the beta's review.
- **Carry-forward**: when a stable `ring-client-api` depends on push-receiver 4.3.1 or later, upgrade to it as a planned task (the owner asked to be reminded), and remove the override, the lockfile hand-edit and the `npm-tree-exceptions.json` entry. The beta review's findings are its checklist. The home connector needs the new image before the push probe can finish (T038 part 2), and T042 is checked against the real push layout only then.
- **Class closure**: NONE - an upstream bug; the regression test keeps it from returning unseen.

### DRIFT-002-15: T048's choices: where Delivery lives, the delivery key, the allowlist, and what "at least once" covers

- **Detected**: 2026-11-18, building T048, the delivery of events to ChatGPT.
- **Kind**: decisions inside the decided design, and one task wording that differs from a recorded rule.
- **Observed**:
  1. **Where Delivery lives.** `tasks.md` T048 names `bridge/src/core/access/delivery/`. The dependency rules (`.dependency-cruiser.cjs`, CD4 Q1) already reserve `core/clients/delivery/` as the only place besides the MCP Endpoint allowed to use the Public Contract, which Delivery needs for the event's shape. Delivery is built there. The subscriptions are stored in `core/access/subscriptions/` as the task says.
  2. **The delivery key.** "Stored in the database, encrypted" needs a key. The core reads Key Vault but cannot write it, so a new secret, `delivery-sealing-key`, is added. The bootstrap's `first-signing-key` step now also writes it when it is missing, and never prints it. It is not derived from the Issuer's keys, which would tie the stored subscriptions to the Issuer's key rotation. Until the owner sets it, subscribing is refused with a clear error, `/readyz` reports `delivery_key: missing`, and the core is still ready, since reading the home needs no key.
  3. **The allowlist.** The new core setting `BRIDGE_CALLBACK_HOSTS` lists the hosts a callback may use, and defaults to `connectors.api.openai.com`, the host T039 observed. This is the implementer's recommendation while the owner chooses between pinning it and OpenAI's public-address rule; either is a configuration change. Every callback also goes only to public addresses, over HTTPS, with a 5-second limit, a 64 KiB answer limit and no redirects. Each transport keeps its own connection pool, because Node's shared pool would reuse a connection made without the address check (found by the tests).
  4. **What is pushed, and how often.** HIGH and MEDIUM events that are not late. Each subscription is sent to on its own, so one slow callback never holds another or the next event: this is the planning addition from T037, built as written. A failed send is tried again with the same event id after 1, 2, 4 and 8 seconds; never after 410 or 413, and 410 ends the subscription. "At least once" holds while the process runs: an event committed just before the core stops is not pushed after it restarts. The client reads it with `get_events` (T052), and delivery state that survives restarts comes with T051.
  5. **Expiry.** A subscription lasts a day unless the client asks for less (at least a minute). ChatGPT's pause sends nothing (T039 part 2), so expiry is the end. Expired rows are skipped at once; deleting them waits for a scheduled purge.
  6. **Storage.** The table is `webhook_subscription`, keyed by a hash of the client, the event type and the callback, so a renewal updates its row and never doubles a delivery. The data model's `subscription` table, with the cursors, comes with T051.
  7. **Mode A** serves agents over stdio, which no webhook client reaches, so it has no Delivery and no event methods.
  8. **The probe is removed**, with its setting and its deploy parameter. The repository variable `BRIDGE_MCP_EVENTS_PROBE` is still set; the deploy no longer reads it, and removing it is the owner's.
  9. **The log** names a client by `client_ref`, a 16-character hash of its id, since ChatGPT's client id is a URL that the identifier form redacts (T039 part 2).
- **Requirement citation**: FR-010, FR-012, FR-013, FR-033, FR-034, SC-001; `tasks.md` T048; `.dependency-cruiser.cjs` "public-contract-only-in-mcp-endpoint-and-delivery"; research.md T039 parts 1 and 2.
- **Resolution**: implementer-decision, reported to the owner with the deploy request. The allowlist and the delivery key need the owner: the allowlist's final form, and one bootstrap command.
- **Carry-forward**: T049 needs the delivery key set and the deploy. T051 adds the cursor table and delivery state that survives restarts; T052 adds `get_events`. A scheduled purge of expired subscriptions joins T051.
- **Class closure**: NONE - decisions the design left to implementation.

### DRIFT-002-14: T044's choices: the heartbeat's backlog field, how an unusable push counts, and how "the core stopped before its ack" is tested

- **Detected**: 2026-11-18, building T044, which joins the home side to the core's event path.
- **Kind**: three choices inside the decided design.
- **Observed**:
  1. **The backlog in the heartbeat.** The heartbeat gains an optional `event_backlog`: how many events wait for their ack, and how long the oldest has waited. It is additive in link version 1. The core declares it in the same commit, and the core and the home image are deployed together. `get_health` reads it from T055.
  2. **An unusable push.** A push Normalize cannot use is logged by its device and the reason's code, and counted in the heartbeat's `error_counts` as `push_unusable`. The heartbeat's `push` stays `ok` while push is wired. This is the planning addition "counted toward push degraded" from T037, in its smallest form: a count the core can see, not a change of the push status. Making it change the status waits for the owner's decision on that addition.
  3. **"The core stopped between its commit and its ack."** End to end, it is tested as the home sending the same event again after the core has committed it: the core acks it as a duplicate, the log holds it once, and the home's backlog empties. The core restarting on the same database is tested in the Event manager's tests (T047).
- **Requirement citation**: FR-008, FR-042, SC-002; `tasks.md` T044 and T047, and Phase 3's independent tests; `contracts/connector-link.md` "Frames" (`heartbeat`).
- **Resolution**: implementer-decision, reported to the owner at the next checkpoint.
- **Carry-forward**: T047 and T044 are ticked with the end-to-end tests (`bridge/test/host/event-path.test.ts`). T042 stays open until the home run's payload shapes confirm its fixtures.
- **Class closure**: NONE - choices inside the design.

### DRIFT-002-13: T047's core side built before the home side, and the decisions the event path needed

- **Detected**: 2026-11-18, building T047 while the home run waits for daylight.
- **Kind**: task order, and five decisions inside the decided design.
- **Observed**:
  1. **Order.** DRIFT-002-09 said T047 keeps its planned order. Its core side reads no Ring payload, so it was built now: Connector Link takes `event`, and the Event manager writes each event in one transaction across Classify, the Event Log, State and the Audit, then acks.
     - Tested now: a failed State write rolls back the Event Log and the Audit; the same event after a restart (the core stopped between its commit and its ack) is found and not written again; two locations in parallel keep their own order; the ack waits for the commit.
     - Not yet tested: the three end-to-end tests in `tasks.md`. They need the home side (T044), so they come with it. T047 stays unticked until then.
  2. **`person`.** FR-009's MEDIUM row needs "a person" for camera motion. The link's `event` message gains an optional `person` flag (additive; link version 1 is not released). Normalize (T042) sets it from Ring's payload, so the core never reads Ring's own subtypes.
  3. **A session whose key is no longer current.** Its event is still written, because dropping it could lose a HIGH event. Only its State change is skipped, since State's versions belong to the current key (PT-30).
  4. **An event whose device entry is older, or names a device or location State does not hold.** The event is still written: an event is a fact, not versioned state. For an unknown device or location, Connector Link asks the home for an inventory, as it does for `device_state`.
  5. **What can never be stored.** An event whose id or kind is longer than its column is answered `refused`: acked and logged by id, not sent again forever. A summary over 1,000 characters is cut to fit.
  6. **The arrival time** for the late rule is stamped when the frame reaches the core, not when the queue reaches the event, so a backlog in the core never makes an event late.
- **Requirement citation**: FR-008, FR-009, FR-013, FR-033, FR-034, SC-002; PT-23, PT-25, PT-30; `tasks.md` T047; `contracts/connector-link.md` "EventMessage".
- **Resolution**: implementer-decision inside the decided design, reported to the owner at the next checkpoint.
- **Carry-forward**: T042 produces `person`. T044 adds the end-to-end tests and ticks T047 with them.
- **Class closure**: NONE - decisions the design left to implementation.

### DRIFT-002-12: the probes' deploy: a payload-shape capture in the home image, and the MCP Events switch as a deploy setting

- **Detected**: 2026-11-18, preparing the deploy the owner approved ("OK for all": the home update now, the MCP Events test deploy, and Spike S1).
- **Kind**: two additions inside T038 and T039, made so that one home restart and one deploy answer both probes.
- **Observed**:
  1. **The push probe's output.** T042's tests use "every fixture from T038", but the Push Listener logs codes only: the format, the kind, Ring's subtype and the delay. A home run would show that push works, not which fields Ring's real payloads carry, and finding that out later would need a second home restart during the soak.
     - So the listener also writes each distinct payload shape to `push-shapes.jsonl` in the connector's data folder, at most 50 of them.
     - A shape is field names and value types only: no value, and a field name that could be an id is hidden. The owner can send the file as it is.
     - T042's fixtures are then built from the library's types to match these shapes, with made-up values.
  2. **The MCP Events switch.** The probe's setting `BRIDGE_MCP_EVENTS_PROBE` is now an optional deploy setting, taken from a repository variable of the same name. It is off when the variable is unset. Turning the probe off again is: remove the variable and deploy again, which needs the owner's OK like any production deploy.
- **What this deploy ships besides the probes**: everything committed since iteration 001's last deploy. On the core: the event shape, the `event` message (logged and left unacked), the Classify engine, and migration 7 (four new, empty tables on Azure SQL). At home: the push listener and outbox migration 2 (two columns). All of it is additive; nothing reads or writes events end to end yet.
- **Requirement citation**: T038, T039, T042; FR-034 (no content in logs or files the owner sends); the owner's typed "OK for all" on 2026-11-18.
- **Resolution**: implementer-decision inside approved tasks, reported to the owner in the reply that gives the deploy's steps.
- **Carry-forward**: T042 builds its fixtures from the shapes file. T048 removes the probe and its setting.
- **Class closure**: NONE - a probe's output shaped to what the next task needs.

### DRIFT-002-11: FR-009's table leaves three cases open; the policy file takes one reading of each

- **Detected**: 2026-11-18, while writing the Classify engine's policy file (T045).
- **Kind**: the spec's table does not decide three cases. The policy is data, so each reading is one row in `bridge/src/core/engines/classify/priority-policy.json`.
- **Observed**:
  1. **Camera motion while armed.** FR-009 lists "motion while armed" as HIGH and "other camera motion" as not pushed. The file reads "motion while armed" as an alarm motion sensor. Camera and doorbell motion is MEDIUM with a person and LOW without, armed or not. The other reading would push every passing car while the alarm is armed.
  2. **A contact closing.** FR-009 says "a contact". The file gives a closing the same priority as an opening: HIGH while armed, MEDIUM while disarmed.
  3. **A location with no alarm.** It counts as not armed.
  - The recovery kinds (`health.home_online`, `health.ring_restored`) are HIGH, as `contracts/events.schema.json` proposes. `mode.changed` and `ring.other` get the default, LOW.
- **Requirement citation**: FR-009; `data-model.md` "Priority policy"; `contracts/events.schema.json` (`kind`, `priority`).
- **Resolution**: human-decision for reading 1, by the owner's typed reply on 2026-11-18: camera motion with no person is LOW, and a doorbell press is pushed while disarmed too (it is HIGH in every mode, as FR-009 lists it). Readings 2 and 3 were shown to the owner in the same checkpoint and stay as the implementer's decision in policy data unless the owner changes them. Changing a reading is an edit to one row of the file and its test.
- **Carry-forward**: the kinds named in the file are the ones Normalize (T042) must produce; T042 and the file are checked against each other then.
- **Class closure**: NONE - open cases in a requirement's table, settled in data and shown to the owner.

### DRIFT-002-10: T041's wording against the link contract: the existing `ack`, and the device entry inside the event

- **Detected**: 2026-11-18, while building T041.
- **Kind**: the task's wording differs from the decided contract. The contract is followed.
- **Observed**:
  1. `tasks.md` T041 names a new `event_ack` message from core to home. `contracts/connector-link.md` had already decided that the existing `ack` answers an event, with the event's `event_id` as its `message_id` (PT-07). No new message is added; Core Link at home already reads `ack`.
  2. The contract lists `state_version` as a field of `EventMessage`, "together with the device's full current entry". The entry already carries its own `state_version`, so the message has one field, `device_state`, holding the entry. The contract's text now says so.
- **Requirement citation**: FR-008, FR-046; `contracts/connector-link.md` "Frames" and "EventMessage"; PT-07, PT-30.
- **Resolution**: implementer-decision, inside the decided contract, reported to the owner at the next checkpoint. `tasks.md` is left as approved; this entry is the record.
- **Carry-forward**: T044 and T047 use `ack` and `device_state` as described here.
- **Class closure**: NONE - a wording difference between two approved records, settled by the earlier design decision.

### DRIFT-002-09: Phase 3 tasks that do not read Ring's push payloads started before T038's home run

- **Detected**: 2026-11-18, after T038 part 1 and T039's handler.
- **Kind**: task order. `tasks.md` places Phase 3 after T038, because T038's recorded payloads feed T042.
- **Observed**:
  - T038 part 2 (the run at the owner's home) waits for the owner's decision on updating the home connector during the 7-day soak.
  - T041 (the event shape and the link's event message) reads no Ring payload. It was built while that decision is open.
  - T042 (Normalize) stays behind T038 part 2, as planned: its fixtures must be the real payloads.
- **Requirement citation**: `tasks.md` "Phase Dependencies" and "Inside Phase 3"; the owner's standing instruction to continue with approved work when nothing is pending.
- **Resolution**: implementer-decision, reported to the owner at the next checkpoint. It changes no scope and no design, and the owner can reverse it.
- **Carry-forward**: T043, T045 and T046 also read no Ring payload and may follow in the same way. T042, T044 and T047 keep their planned order. Updated 2026-11-18: T047's core side was built as well, with its end-to-end tests left for T044 (DRIFT-002-13).
- **Class closure**: NONE - an ordering choice inside one iteration.

### DRIFT-002-08: a second audit exception, for a new picomatch advisory in the development tools

- **Detected**: 2026-11-17, by CI's audit step on commit 85ef659, which changed documents only.
- **Kind**: a new upstream advisory, not a change in this project.
- **Observed**:
  - GHSA-fc5q-39xc-vjpf, high: picomatch is open to a slow-pattern denial of service. Every release up to 4.0.7, the newest, is affected, so no fixed version exists.
  - picomatch reaches this project only through development tools: dependency-cruiser, vite (through tinyglobby and fdir) and vitest. The production install (`npm ls picomatch --omit=dev`) has none of it.
  - The patterns it matches here are the repository's own configuration, not Ring's text or an agent's input.
- **Requirement citation**: `implementation-rules.yml`, `project.supply-chain-policy`: npm audit fails on high or critical over the whole tree, with a written exception list.
- **Resolution**: human-decision, decided by the owner's typed "yes" on 2026-11-17: the advisory is added to `scripts/audit-exceptions.json`, the list's second entry, until a fixed picomatch ships.
- **Carry-forward**: remove the entry when a fixed picomatch is released; Dependabot's weekly update will show it.
- **Class closure**: NONE - upstream advisories arrive when they arrive. The audit gate still blocks every other high or critical advisory.

### DRIFT-002-07: the hardening review needed two repairs outside the project before it could start

- **Detected**: 2026-11-17, at T037, the hardening review before implement.
- **Kind**: tooling on the owner's PC (Specrew 0.40.0 and the reviewer's launcher). The project's files were not changed for it.
- **Observed**:
  1. **The review engine's copy on the PC differed from the project's.** The review refused with `review-engine-version-mismatch` and asked for a project update. Read-only checks (names, dates and hashes) showed the project's copy unchanged since 2026-11-01 and one file of the installed copy changed on 2026-11-17. The update was not run, because it would have copied that change into the project. The owner fixed the installed copy, and the check then passed.
  2. **The reviewer could not be launched.** The run `run-20261117-181348428-cc789c45` failed before the reviewer was invoked, with `runtime-command-shim-unsupported:codex`: on this PC `codex` resolved only to npm's launcher scripts, and the review starts only a native executable. No round was used.
  3. **The fallback**, by the owner's typed "yes", on the reviewer session's advice: for the review process only, the folder of the native `codex.exe` inside npm's own installation of codex was put first on PATH. Nothing was installed and no file changed.
  4. With it, `run-20261117-185648219-777d6e8c` ran and passed with no findings.
- **Requirement citation**: T037 and iteration 002's hardening gate; this project's rule that fallbacks on PATH need the owner's yes per run.
- **Resolution**: human-decision, decided by the owner on 2026-11-17 (the fix on the PC, and the "yes" for the fallback). The hardening gate records the review.
- **Carry-forward**: each later review round in this session needs the same fallback and the owner's yes, unless the session is started where a native `codex` is on PATH. For Specrew's bug-bash list: the review refuses npm's launcher for codex on Windows.
- **Class closure**: NONE - the launch rule is Specrew's. This project's guard: check what `codex` resolves to before asking for a review round.

### DRIFT-002-06: the tasks sync refused because state.md's phase is ahead of the authority record

- **Detected**: 2026-11-17, at iteration 002's tasks sync.
- **Kind**: a state mismatch written by governed tooling (Specrew 0.40.0). Nothing was recorded.
- **Observed**:
  - After the owner's "approved for plan", the session was resumed once. Specrew's session-start writer then created `tasks-progress.yml` (eleven work items, all pending) and rewrote state.md's header, setting Current Phase to "before-implement" and Iteration Status to "not-started". Both files were committed unchanged (840dc81).
  - The tasks sync ran once with the lint fallback (DRIFT-001-91), naming iteration 002, by the owner's typed "yes". Its iteration-state gate refused: state.md says Current Phase "before-implement", but the last authorized boundary is "plan". It wrote no crossing and no pending-verdict file.
  - The refusal's own advice for a page that is ahead of the record: correct the line by hand and record why in the drift log.
  - Separately, iteration 002's plan.md still reads Status "planning" after the approval. The crew has not changed it.
- **Requirement citation**: the tasks boundary of iteration 002; this project's rule that the crew never hand-sets state.md's Specrew header without the owner's approval.
- **Resolution**: human-decision, pending. The proposed recovery, on the owner's yes: set state.md's Current Phase line to "plan", the last authorized boundary, as the refusal advises; commit it; run the tasks sync once more. If that run refuses, stop and report.
- **The owner's "yes"** (2026-11-17) approved the one hand edit and one more sync run. state.md's Current Phase line was set from "before-implement" to "plan", the last authorized boundary, as the refusal advises. No other line was changed.
- **The second run** (2026-11-17, at 21e6290) passed the phase check and was refused by the same gate on another line: state.md's Execution Summary still says "Execution has not started yet." beside a header that now carries Current Phase "plan" and Iteration Status "not-started". It wrote no crossing. The recovery step failed on its next attempt, so the crew stopped and reported; no third attempt was made. The state page that the plan sync accepted was the scaffolded one, before the session-start writer added its header lines (f6a8746).
- **The reviewer session's reading** (advice, 2026-11-17, from Specrew 0.40.0's source): with the writer's header lines present, no value passes at the tasks sync. One check accepts only the last approved boundary, "plan"; the next refuses "plan" beside "Execution has not started yet.". A page without the two lines passes, because both checks skip an absent line. It names this a Specrew defect.
- **The owner's "1"** (2026-11-17) chose the repair: state.md restored exactly as it was at f6a8746, the scaffolded form the plan sync accepted. This also undoes the hand-set phase line. `tasks-progress.yml` is unchanged. Then one sync run.
- **Rule for iteration 002**: until the before-implement approval is recorded, avoid session starts; before each sync, if a session start added the header lines again, restore the scaffolded page and note it here. After that approval the writer's header is accepted.
- **Closed**: 2026-11-17. The third run, on the restored page (14418a8), passed every gate and recorded the tasks crossing (2026-11-17T16:14:33Z). The owner then typed "approved for tasks". The "pending" in the Resolution line above is superseded by this line.
- **Carry-forward**: for Specrew's bug-bash list: the session-start writer sets a phase that the tasks sync's gate then refuses.
- **Class closure**: NONE - Specrew's code writes the line. This project's guard: no session is resumed or started between an approval and the next sync.

### DRIFT-002-05: the first plan sync checked iteration 001 and was refused

- **Detected**: 2026-11-17, at iteration 002's plan sync.
- **Kind**: operator error in the sync's arguments, under governed tooling (Specrew 0.40.0). Nothing was recorded.
- **Observed**:
  - The plan sync ran once with the lint fallback (DRIFT-001-91: npm's and Node's folders off PATH for that one process), by the owner's typed "yes". markdownlint was skipped as expected.
  - The run did not name the iteration, following the plan sync skill's command, which passes none. The sync then took the iteration from the session's lifecycle position, which still names iteration 001.
  - Its iteration-state gate refused: iteration 001's state.md (Current Phase iteration-closeout, Iteration Status complete) and plan.md (Status complete) did not match the boundary being synced, 'plan'.
  - It wrote no crossing and no pending-verdict file. The only change is the local lifecycle file's pending next boundary, now 'plan', which git does not track.
- **Requirement citation**: the plan boundary of iteration 002; DRIFT-001-91's fallback, used once per owner yes.
- **Resolution**: human-decision, pending. The one recovery step is to run the plan sync once more, naming iteration 002 (`-IterationNumber 002`, as the retro and closeout syncs did), on the owner's yes. Iteration 001 is sealed and correct, so the refusal's advice to correct its lines by hand does not apply: those files are not edited.
- **The second run** (the owner's second "yes", 2026-11-17, naming iteration 002) passed the iteration-state gate. Then its design-analysis gate refused, again writing no crossing and no pending-verdict file:
  - Each of the three options lacks the fields iteration 001's design analysis had: Approach, Architectural pattern, Quality features considered, Effort estimate, Reversibility cost, Trade-offs, and a Mermaid diagram.
  - The Applicable Lenses section lacks an "Addressed:" line for each of the eight selected areas, pointing into the option comparison.

  That is the crew's authoring gap: iteration 002's design analysis followed the options message instead of the template. The proposed recovery, on the owner's approval: add those fields and lines without changing the options, the choice or any decision, then run the sync once more.
- **Closed**: 2026-11-17. The owner's third "yes" covered the layout fill (commit 40286f7; the options, the choice of B, the effort figures and the trade-offs unchanged) and one more sync. That third run, naming iteration 002, passed every gate and recorded the plan crossing at 40286f7 (2026-11-17T10:54:15Z). The owner then typed "approved for plan". The "pending" in the Resolution line above is superseded by this line.
- **Carry-forward**: for Specrew's bug-bash list: the plan sync skill's command passes no iteration number, and on a later iteration the sync then checks the closed one.
- **Class closure**: NONE - Specrew's code picks the default. This project's guard: every sync here names its iteration.

### DRIFT-002-04: the owner's additions beyond the spec's text: the backlog, its alert, and the Ring-session-lost alert brought forward

- **Detected**: 2026-11-17, at iteration 002's plan stage, checking the plan against the spec.
- **Kind**: scope additions and a move between iterations, decided by the owner in the design analysis. The spec is unchanged.
- **Observed**:
  1. **The backlog in the heartbeat and in `get_health`.** FR-005's health fields are the home link, the Ring session, push reception, the last event and stale-since; the backlog is not among them. The owner took it with the ack and resend design ("2 ok", component-design): the heartbeat reports the backlog's size and the oldest's age, and `get_health` shows it (observability-resilience, "all as recommended").
  2. **An alert on the backlog.** FR-043's conditions are the heartbeat, the home offline, the Ring session lost, the audit chain and the write-once copy; the backlog is not among them. The owner took an alert when the oldest unacked event has waited more than about 5 minutes (component-design, "2 ok"; devops-operations, "Yes").
  3. **The Ring-session-lost alert in iteration 002.** FR-043 lists it, but the feature plan's map placed it in iteration 004. The owner moved it here (devops-operations, "yes"): it is the failure the 7-day soak watches for, and it shares the one rule.
- **Requirement citation**: FR-005 and FR-043 (the conditions they list); FR-042 (the resend that the backlog reports on); the feature plan's iteration map (FR-043 "in part" for iteration 002).
- **Resolution**: human-decision, decided by the owner on 2026-11-17 in the design analysis (records: `workshop/component-design.md`, `workshop/observability-resilience.md`, `workshop/devops-operations.md`). Items 1 and 2 add to what the spec requires and contradict none of it; item 3 moves a listed condition earlier. Iteration 002's plan carries all three (CP-08b, CP-11b, CP-18), and the feature plan's pointer line records the move. The review's drift check treats them as authorized, not as gold-plating.
- **Carry-forward**: whether the spec should name the backlog in FR-005 and FR-043 is a spec decision for a later spec change; the owner decides it then.
- **Class closure**: NONE - a one-off set of owner decisions at the design analysis, recorded so the review can trace them.

### DRIFT-002-03: the quality resolver again marks concurrency, resiliency and retry/idempotency as not applicable

- **Detected**: 2026-11-17, at iteration 002's plan stage, by `resolve-quality-profile.ps1` (the before-plan check).
- **Kind**: governed tooling output that contradicts the spec, as in iteration 001 (DRIFT-001-01). No code changed.
- **Observed**: the resolver's `not_applicable_dimensions` list concurrency-correctness ("no … realtime concurrency behavior"), resiliency ("does not materially depend on retries, reconnect, or degraded recovery") and retry-idempotency-and-recovery ("does not present a material retry or recovery workflow"). Its hardening focus area "Retry and idempotency expectations" is likewise `not-applicable`.
- **Requirement citation**: iteration 002 is the event path, so these dimensions are its core:
  - FR-010: at least once, deduplicated by event id;
  - FR-011: a cursor that never skips and survives restarts;
  - FR-013: late events and the recovery summary;
  - FR-042: resend after 10 seconds, reconnect, the 24-hour catch-up;
  - and the decided ack after the core's commit, with the send window and backoff (component-design, 2026-11-17).
- **Resolution**: overridden to required, as in iteration 001, where the owner accepted the same override with the design-analysis verdict (DRIFT-001-01). Iteration 002's plan states the override in its Notes. Its hardening gate (`quality/hardening-gate.md`) marks the three dimensions and the retry and idempotency focus area as required, and is filled for the event path before implementation starts. The owner reviews it at the plan boundary.
- **Carry-forward**: for Specrew's bug-bash list: the resolver reads no concurrency or retry signal from a spec that states at-least-once delivery, cursors, resends and catch-up.
- **Class closure**: NONE - the resolver is Specrew's code. This project's guard is the before-plan check plus this override, applied at each plan stage.

### DRIFT-002-02: the channel shim, FR-012's desktop relay, is deferred out of iteration 002

- **Detected**: 2026-11-17, iteration 002's design analysis, component-design.
- **Kind**: scope deferral, decided by the owner. The spec is unchanged.
- **Observed**:
  - The channel shim relays events to Claude Code on the owner's PC, through Claude Code's channels (a research preview).
  - The owner: "claude code is not the intended client". The intended clients are ChatGPT, with the dot, and the Claude apps.
  - Checked on 2026-11-17: ChatGPT takes pushed events through MCP Events (signed webhooks, the dot and Work mode). The Claude apps have no documented way to take a connector's pushed message; only Claude Code has channels.
- **Requirement citation**: FR-012: "The system MUST deliver push both to clients on the current MCP protocol version and to clients on the earlier version, including a local relay that brings events to a desktop coding agent."
- **Resolution**: deferred, by the owner's typed "2" (2026-11-17), the crew's recommendation.
  - The shim is not built in iteration 002. FR-012's other parts stay in scope: push to current-era and earlier-era clients.
  - The Claude apps read events with `get_events` from their cursor (FR-011).
  - If Anthropic adds push for Claude's connectors, Delivery gets one more adapter; each platform already has its own.
  - This frees about 1 of CP-13's 3 SP, about 2 SP of effort at 1.8 (estimate).
- **Carry-forward**: the shim, and FR-012's desktop-relay clause, to a later iteration's planning. Feature closeout cannot claim FR-012 in full until then.
- **Class closure**: NONE - a scope deferral, not a defect; its carry-forward keeps it visible until a later iteration takes it.

### DRIFT-002-01: iteration 001's closeout facts, carried here because its drift log is sealed

- **Detected**: 2026-11-17, at iteration 001's closeout and just after it.
- **Kind**: governed tooling behaviour (Specrew 0.40.0), recorded for continuity. No code changed.
- **Observed**:
  1. **The lint fallback at the closeout** (DRIFT-001-91). Two closeout syncs ran with npm's and Node's folders off PATH, under the owner's standing yes and then the owner's "go". The first refused at the iteration-state gate and wrote nothing; the second passed.
  2. **The closeout dashboard** (`iterations/001/dashboard.md`, now sealed):
     - Its plan-vs-reality row reads Planned 75.8 / Actual 75.8 / Delta 0. The dashboard takes plan.md's Capacity figure, which reads the summed actuals (75.75/42), as the plan.
     - Its velocity, 5.05 SP/day, is on the effort basis (75.75 SP over 15 days). Counting delivered scope, it is about 2.8 SP/day (42 SP over 15 days, estimate).
     - It also froze the "AWAITING YOUR VERDICT" banner it was captured under.
     - The real figures are in iteration 001's retro.md. The owner approved the closeout with this disposition.
  3. **The seal listed a file git did not track.** The closeout's seal lists iteration 001's `tasks-progress.yml`, which the project kept out of git. So Specrew CI failed on `460de86` from a clean checkout: "closed-iteration-edited: … was edited after its closeout seal: tasks-progress.yml". The file was unchanged: its content matched the sealed hash.
- **Evidence**: commits `460de86` (the closeout, with these facts in its message) and `c9618dd` (the ledger). CI is green on all three workflows at `c9618dd`.
- **Requirement citation**: FR-047 (the gates run in CI on every commit); iteration 001's closeout boundary.
- **Resolution**: human-decision, decided.
  - Items 1 and 2 are recorded as the owner approved them.
  - Item 3: by the owner's "yes", iteration 001's `tasks-progress.yml` is committed once (`c9618dd`), as an exception to the rule that kept it out of git.
- **Carry-forward**:
  - **The task ledger's trap is set again.** Iteration 002's forecast tasks are CP-numbered (CP-08b, CP-11b, CP-20, CP-21b). Specrew's writer takes "done" hints only from tasks.md rows with T-ids, so the same "not started" state would stop the closeout. The prevention is chosen at iteration 002's planning: task ids that match tasks.md, or the ledger kept current as each task finishes. Whether iteration 002's ledger is committed is part of that choice.
  - **For Specrew's bug-bash list:**
    - the seal includes untracked files;
    - the dashboard reads Capacity's first figure as the plan;
    - no on-demand command runs the task-progress writer;
    - the writer ignores plan.md's Status column.
- **Class closure**: NONE - the defects are in Specrew's code. The ledger trap's prevention for this iteration is a planning decision, recorded when it is made.

<!--
  Every new ### DRIFT-... event includes:

  - **Class closure**: the executable mechanism that makes the next instance impossible or loud

  If the change fixes only this instance, write NONE — <why class closure is not in scope>.
  A bare Resolution: FIXED is not class closure.
-->

### Resolution Strategies (Unused)

The following resolution strategies remain available if drift is detected later in execution:

- **spec-updated**: Update the spec to reflect implementation choice
- **implementation-reverted**: Revert implementation to match spec
- **deferred**: Mark drift as deferred to next iteration
- **human-decision**: Escalate to Alon for resolution

### Notes

- This artifact was scaffolded before review starts so drift can be logged immediately when detected.
- Replace the zero-drift summary with real counts when the first drift event is recorded.
