# Connector Link Protocol (home connector to cloud core)

**Feature**: `001-ring-mcp-bridge` | **Stage**: plan (Phase 1 design artifact) | **Date**: 2026-11-02

This is the contract between the home connector and the cloud core in hybrid mode (H). It transcribes:

- integration-api D1-D4 and D8;
- security-compliance SC2;
- component-design X2, CD4 and A4;
- observability-resilience OR2 and OR5;
- the plan-time resolutions CRP 1, CRP 4, PT-07, PT-08, PT-25, PT-26 and PT-30 of 2026-11-02 (`../research.md`).

Citation keys are in `../data-model.md`. **[P]** marks a name proposed here, not in the records or the resolutions.

In all-in-one mode (A) there is no link: Ring Access calls Execute in process, and Connector Link and Core Link are not used (CD map v3).

## Transport and identity

| Rule | Source |
|---|---|
| One WebSocket over TLS (WSS), dialed out from home. No inbound ports at home; no Azure Web PubSub or Relay | IA D1, AC B6, AC P7 |
| One duplex session: events up, commands down, replies correlated | IA D3 |
| The core proves itself with its TLS certificate | IA §Auth per boundary (4), SC2 |
| The connector proves itself at every hello by signing a fresh challenge with its own key pair, made at home. It gets no OAuth token | SC2 |
| One connector per Ring account: a new enrollment revokes the old key | AC B7, SC2, FR-032 |
| Both ends use the Link transport utility. It knows frame types, versions and priority only, never Ring or bridge words. The Host owns its lifetime, one instance per process | CD X2 |
| In the core, Connector Link receives events, state messages and heartbeats, and checks the hello. Ring Access sends commands and correlates replies. At home, Core Link does both | CD X2, CD map v3 |
| Frame encoding and framing belong to the Link transport. The wire encoding is not recorded | CD X2 |

## Versioning

- The protocol version is stated at hello. The core accepts the current version (N) and the previous one (N-1) (FR-046, IA D2).
- The receiver declares each message (CD4):
  - Connector Link declares `EventMessage` and the other home-to-core messages at N and N-1, including the catch-up-done marker (CD-A4);
  - Core Link declares `CommandMessage`.
- Contract tests run both ends against N and N-1 fixtures (IA D6, CD4).
- A connector older than the core shows as "connector behind" on the admin page (DO carry-forward to ui-ux). The hello therefore carries the connector's version [P field].
- Iterations 001 and 002 ship link version 1 together. Iteration 001 implements its session and state messages, and iteration 002 adds `event` and `catchup_done`, which are part of version 1's message set (PT-07). Version 1 is not released to other owners before iteration 004, so this needs no version bump. The catch-up-done marker is part of the message set at every version, and the N-1 contract test is added with the first version bump (PT-07).

## Frames

| Frame | Direction | Purpose | Fields | Through the outbox | Declared by | Iteration | Source |
|---|---|---|---|---|---|---|---|
| `enroll` [P] | home to core | "enroll me": asks to be trusted | `public_key`, `code` (the code the connector printed) [P names] | no | Connector Link | 001 | SC2 |
| `enrolled` [P] | core to home | the owner approved; older keys are revoked | `key_id` [P] | - | Core Link | 001 | SC2 |
| `hello` | home to core | opens a session | `version`, `key_id`, `connector_version`, `session_id` [P names] | no | Connector Link | 001 | IA D2, SC2, OR2 |
| `challenge` [P] | core to home | a fresh challenge for this session | `nonce` [P] | - | Core Link | 001 | SC2 |
| `challenge_response` [P] | home to core | the challenge signed with the connector's private key | `signature` [P] | no | Connector Link | 001 | SC2 |
| `hello_ok` [P] | core to home | the session is accepted at a version | `version` [P] | - | Core Link | 001 | IA D2 |
| `event` (`EventMessage`) | home to core | one normalized event | see "EventMessage" | yes | Connector Link | 002 | CD4, IA D7 |
| `inventory` [P] | home to core | a full snapshot of the locations, devices and device state | see "Device inventory and state" | yes | Connector Link | 001 | PT-30 |
| `device_state` [P] | home to core | one device's state changed | see "Device inventory and state" | yes | Connector Link | 001 | PT-30 |
| `inventory_request` [P] | core to home | asks the home for a fresh `inventory` | `request_id` [P] | - | Core Link | 001 | PT-30 |
| `catchup_done` [P] | home to core | the outbox is drained and the catch-up is finished | `message_id` [P] | yes | Connector Link | 002 | CD-A4, PT-07 |
| `ack` [P] | core to home | the message is committed; the outbox may clear it | `message_id` [P] (an event's `message_id` is its `event_id`) | - | Core Link | 001 | AC B10, DS4, OR §journey |
| `heartbeat` [P] | home to core | every 15 s; the home's health summary | Ring session, push, outbox depth, last Ring event, error counts [P names] | no | Connector Link | 001 | OR §journey, OR1, OR5 |
| `cmd` (`CommandMessage`) | core to home | one command, sent once | see "CommandMessage" | - | Core Link | 003 | IA D8 step 7, CD4 |
| `result` | home to core | the command's outcome | `command_id`, `outcome`, `alarm_mode` (D8: "mode"), `as_of`, `error_code` [P] | not recorded | not named; the CD4 receiver rule points to Ring Access | 003 | IA D8 step 10 |
| `media_chunk` [P] | home to core | capture bytes, in small chunks | `command_id`, `index`, `final`, the bytes [P] | no | not named | 003 | CD X2 |

"Through the outbox" means the message is written to the Outbox Store first, sent at least once, resent after 10 s without an `ack`, and cleared only on its `ack` (AC B10, OR5, PT-07, PT-30).

WSS ping and pong belong to the Link transport (CD X2).

A connection the core refuses is closed with a reason [P]: version not accepted, key not enrolled or revoked, or challenge failed.

### EventMessage

Fields [P names unless noted]: `event_id`, `location_id` (PT-24), `kind`, `occurred_at`, `received_at`, `device_id`, the device's `name` and `room` (untrusted), `summary` (untrusted-derived), `from_history`, `state_version`, `data`.

- Normalize builds it from Ring's payload as a tolerant reader. An unknown Ring kind becomes `ring.other`, with Ring's name kept as untrusted text (CD4).
- Ring strings are marked untrusted at the edge (CD map v3 Normalize, FR-033).
- It carries no priority: Classify sets the priority in the core from policy data (FR-009, CD map v3 Classify).
- It carries no `late` flag. Ingest stamps `received_at` (the connector's own receive time), and the core's Classify engine decides `late` (PT-25).
- `from_history` [P] is `true` for an event Ingest read from Ring history after a gap. It states where the event came from, not whether it is late. Classify needs it because such an event is received at home long after it occurred (see Open item 1 in `../data-model.md` "Resolved at plan").
- `state_version` [P] is present when the event changes a device's state, together with the device's full current entry (as in `device_state`). State applies it latest-wins, like a `device_state` message (PT-30, DRIFT-001-06).

### Device inventory and state

These two messages fill the core's State (PT-30).

| Message | When it is sent | Fields [P names] |
|---|---|---|
| `inventory` | on every session start, after the catch-up (from 002), on `inventory_request`, and when a location's alarm mode changes, because no other message carries a location (DRIFT-001-19) | `message_id`; `snapshot_version` [P]; `session_id` [P], present when a session was open as it was composed; `locations` (each: `location_id`, `name`, `time_zone`, `alarm_mode`, `ownership`, `as_of`, `state_version`); `devices` (each: `device_id`, `location_id`, `name`, `type`, `room`, `battery_pct`, `battery_low`, `power_mode`, `online`, `state`, `as_of`, `state_version`) |
| `device_state` | when one device's state changes without an event | `message_id`, and the device's full current entry: the same fields as a device in `inventory` (`device_id`, `location_id`, `name`, `type`, `room`, `battery_pct`, `battery_low`, `power_mode`, `online`, `state`, `as_of`, `state_version`) |

Rules:

- **Latest-wins:** the core keeps the highest `state_version` applied per device. It applies a snapshot entry, a `device_state` message or an event's state only if its `state_version` is higher (PT-30).
- **Full state, never a delta:** every message that carries a `state_version` carries the device's complete state, never only the changed fields. So when latest-wins drops an older or resent message, no field is lost (the T001 hardening review, 2026-11-03; DRIFT-001-06).
- **Locations too:** each location entry carries its own `state_version`, from the same home counter as devices. The core applies a location's fields only if that version is higher than the one it holds for that location, so a resent older inventory cannot roll back an alarm mode (DRIFT-001-08).
- **The counter:** the home keeps `state_version` in the Outbox Store, so it survives a connector restart [P].
- **Snapshots in order** [P] (CP-14 review round 3): an inventory's `snapshot_version` comes from the same counter, drawn before its entries' versions. The core keeps the newest one it applied. It acks, but skips, an inventory at or below that one, so a resent older inventory cannot bring back what a newer one removed. A newer inventory removes each stored entry it leaves out whose version is below its `snapshot_version`, so an empty one clears the home.
- **A session's own inventory** [P] (CP-14 review round 3): `session_id` names the session the inventory was composed for. After a session opens, the core keeps the home's data stale until an inventory composed for that session is stored (FR-006). A heartbeat says the link is up, not that the data has caught up.
- **A new enrollment:** when a session of a newly enrolled key opens, the core resets its stored versions and forgets the newest snapshot, because the new connector's counter starts again [P] (DRIFT-001-32).
- **Field names:** they are the contract names. A device's type is `type` on the link and in the tools; State maps it to its storage column `kind` (PT-26, CD4).
- **Untrusted text:** names and rooms are untrusted text (FR-033).

### CommandMessage

Fields: `command_id`, `action`, the bypass list (`bypass`, device ids), `deadline_at` (IA D8 step 7). Also [P names]:

- `location_id`, `device_id` and `auto_off_s` for lights;
- `request_id` and `client_id`, for correlation (OR2).

Captures for frames, bursts and clips travel as commands to Execute (CD map v3 Execute). Their action names are [P], set with the media work in 003.

## Sequences

### Session start (001)

```text
 HOME (Core Link)                         CORE (Connector Link)
   |--- WSS connect (dialed out) ------------>|  TLS: the core's certificate
   |--- hello {version, key_id, ...} -------->|  version N or N-1? key enrolled? (Settings)
   |<-- challenge {nonce} --------------------|
   |--- challenge_response {signature} ------>|  verified against the enrolled public key
   |<-- hello_ok {version} -------------------|
   |--- inventory (through the outbox) ------>|  State: latest-wins by state_version
   |=== events, state, heartbeats up; commands down; media chunks last ===|
```

Sources: SC2, IA D2, CD X2, PT-30.

### Event upload, ack and resend (002)

```text
 Ring push -> Push Listener -> Ingest (stamps received_at) -> Normalize -> Outbox Store
 HOME --- event (EventMessage) ---------------------------> CORE
          Event manager: Classify sets priority and late (from received_at);
          ONE transaction: dedupe on event_id, next seq, append (Event Log),
          update State, append the audit entry (event_ingested); commit
 HOME <-- ack {message_id} --------------------------------- CORE (only after the commit)
 Outbox Store clears the row.          Then Delivery pushes (<= 0.5 s p95 inside the bridge)

 No ack within 10 s: the home resends. On reconnect, unacked messages go oldest first.
 A repeat is dropped on event_id. A failed commit is not acked, so the home resends.
```

Sources: AC B10, DS4, OR5, FR-042, CD key flow 1, SC-001, PT-23, PT-25.

### Reconnect, catch-up and the recovery summary (002; reconnect 001)

```text
 link drops -> HOME: reconnect with backoff 1 s, doubling, capped at 30 s, full jitter
                     (a returning core is reached within 60 s)
 link back  -> Ingest:
   1. drain the outbox, oldest first (every row keeps the received_at it was stamped with)
   2. if Ring pushes were missed: one Ring history read per location for the gap
      (up to 24 h), through the shared Ring limiter; each event found: from_history = true
   3. catchup_done, then a fresh inventory, both through the outbox
 CORE: Classify marks late = true for an event that arrives more than 2 min after its
       received_at, and for an event with from_history = true. Late events are stored
       like any event and are readable by cursor, not pushed one by one.
       On catchup_done: one bridge.events_recovered event to every agent, whatever its
       priority (priority = the highest among the late events); none late: no summary.
```

Sources: OR5, CD-A4, FR-013, FR-042, PT-07, PT-25, PT-30. `catchup_done` goes through the durable outbox, so a lost marker cannot hide a late HIGH event (PT-07). The summary covers the events Classify marked late since the session opened [P].

### Heartbeat and home offline (001; alerts and health events 002)

```text
 HOME --- heartbeat every 15 s {Ring session, push, outbox depth, last Ring event,
          error counts} ---> CORE (Health engine via Event)
 CORE: 2 min without a heartbeat  -> home offline: reads stale (stale_since),
                                     control and media HOME_OFFLINE,
                                     HIGH health.home_offline to every agent (002)
       heartbeat again             -> health.home_online (002)
       10 min                      -> out-of-band alert to the owner (email and SMS; H only; 002)
 Ring unavailable for 2 min -> HIGH health.ring_unavailable; when it answers again
       -> health.ring_restored (both 002)
 heartbeat reports the Ring session lost -> the admin page's health banner (001) and
       HIGH ring.session_lost to every agent (002); its out-of-band alert comes in 004
```

Sources: OR5, OR §Failure modes rows 1-3, AC B12, FR-015, FR-043, DA Option B, CRP 4, PT-29. Connector logs stay at home; only the health summary rides the heartbeat (OR1, SC7).

### Command and result (003)

```text
 CORE (Ring Access)                       HOME (Core Link -> Execute)
   |--- cmd {command_id, action, bypass, deadline_at, ...} -->|  sent ONCE
   |                                       command_id already seen? -> stored result
   |                                       past deadline_at?       -> drop: not_done
   |                                       action not allowlisted? -> refuse
   |                                       else Ring Adapter call (shared limiter)
   |<-- result {command_id, outcome, alarm_mode, as_of} -------|
 no result within 60 s: TIMEOUT, outcome unknown, never retried;
 a late result still reaches the audit and the event.
 link drops with the command in flight: HOME_OFFLINE, outcome unknown, never re-sent
 and never retried; Execute still runs it at most once and reports the late result
 when the link reconnects.
```

Sources: IA D8 arm table, IA §Rules surfaced 1, CD X2, FR-024, spec Edge Cases, CRP 1. `BRIDGE_UNAVAILABLE` is reserved for the core's own database or Blob being down (CRP 1). A light's auto-off timer is kept at home by Execute and Outbox Store, so it fires even if the core or the link is down (CD C3, CD key flow 2).

### Media chunks (003)

Capture bytes travel over the link, not by a Blob upload from home (CD X2 decided). They are sent in small chunks behind commands, events and heartbeats, so a clip never delays a HIGH event (CD X2, AC B11). The chunk size is set in iteration 003's plan (PT-08).

### Enrollment and re-enrollment (001)

```text
 HOME: Setup CLI makes a key pair (the private key never leaves home)
       and prints an enrollment code
 HOME --- enroll {public_key, code} ------------------------> CORE: holds the request
 OWNER: on the admin page, after a fresh sign-in, checks that the code matches the
        connector's log, then approves (a typed confirmation, sign-in < 5 min old)
 HOME <-- enrolled {key_id} --------------------------------- CORE: any older key revoked
 then: a normal session start; at every hello, a fresh challenge is signed
```

Sources: SC2, FR-032, US6 scenario 1, UX U4. How long a pending request lives is carried to a later plan (G13 in `../data-model.md`).

## Ordering, priority and guarantees

| Rule | Source |
|---|---|
| Events, `inventory`, `device_state` and `catchup_done`: at least once, through the outbox; events deduped by `event_id`, state applied latest-wins by `state_version` | IA D4, AC B10, PT-07, PT-30 |
| Commands: at most once; never re-sent after a drop; each `command_id` runs once at home | IA §Rules surfaced 1, IA D8 step 8 |
| Sending order: commands, events, state messages and heartbeats before media chunks | CD X2 |
| A command's reply and the event it causes arrive in the order the home sent them (one session) | CD X2 |
| Correlation: `event_id` end to end; `request_id`, `command_id` and `client_id` carried in link messages; a connector session id on every log line | OR2 |
| Never on the link: the Ring token, push credentials or Ring's session hardware ID (the "device ID" of SC4, not a sensor's `device_id`). Connector logs stay at home | AC B5, SC4, FR-032, OR1 |
