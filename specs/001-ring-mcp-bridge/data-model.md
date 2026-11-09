# Data Model: Ring MCP Bridge

**Feature**: `001-ring-mcp-bridge` | **Stage**: plan (Phase 1 design artifact) | **Date**: 2026-11-02

This file transcribes the data decisions the design workshop made, and the plan-time resolutions of 2026-11-02 recorded in `research.md`. It decides nothing new itself. Every rule cites the record or resolution that decided it. Where a contract needs a name that neither gives, the name is marked **[P]** (proposed here) and collected in "Names proposed here". Conflicts between records, and between a record and the spec, are listed with their resolutions in "Resolved at plan". Items for later iterations are in "Carried to the iteration 003/004 plans".

The contracts under `contracts/` use the same entity and field names:

- `contracts/mcp-tools.md`: the tool catalog;
- `contracts/events.schema.json`: the event shape;
- `contracts/iteration-001-tools.schema.json`: iteration-001 tool inputs (the four read tools);
- `contracts/iteration-002-tools.schema.json`: the iteration-002 tool input (`get_events`);
- `contracts/errors.md`: the reply and error envelopes;
- `contracts/connector-link.md`: the home-to-core link;
- `contracts/web-endpoints.md`: the core's HTTP surface.

## Citation keys

| Key | Record | Decision ids used |
|---|---|---|
| spec | `spec.md` | FR-001 to FR-048, SC-001 to SC-011, Key Entities, Clarifications |
| IA | `workshop/integration-api.md` | D1-D8, §Error codes, §Rules, §Amendments |
| DS | `workshop/data-storage.md` | DS1-DS6, §Inventory, ERD (the "Entities and keys" diagram), §Amendments |
| CD | `workshop/component-design.md` | map v3, CD1-CD5, X1, X2, C1-C10, CD-A1 to CD-A4, key flows |
| SC | `workshop/security-compliance.md` | SC1-SC7 (SC7 C1-C7) |
| OR | `workshop/observability-resilience.md` | OR1-OR6, §Failure modes, §Retry and recovery detail |
| AC | `workshop/architecture-core.md` | B1-B15, IN1-IN7, AC-A5 |
| RN | `workshop/requirements-nfr.md` | §Event priority, §Mandatory behaviors, §Amendments |
| UX | `workshop/ui-ux.md` | U1-U5 |
| DO | `workshop/devops-operations.md` | DO1-DO7 |
| CODE | `workshop/code-implementation.md` | I1-I8 |
| DA | `iterations/001/design-analysis.md` | Option B (the chosen iteration plan) |
| PT, CRP | `research.md` | PT-01 to PT-31 (§Plan-time resolutions); CRP 1-4 (§Conflicts resolved at plan, items 1-4) |

## Plan-time resolutions applied

The planner decided these on 2026-11-02, for the owner to review at the plan boundary. No workshop record holds them. They are recorded in `research.md` and applied in this file and the contracts:

| Id | Decision | Effect here |
|---|---|---|
| CRP 2 | Iterations 001 and 002 are exactly the Option B slice, split in two at plan. Iteration 001: US1 overview, device list, one device, health and freshness (FR-001, FR-002, FR-005, FR-006). Iteration 002: US2 HIGH and MEDIUM push, reading after a cursor, late events and the recovery summary, the Ring-down health event (FR-008, FR-009, FR-010 without per-client opt-ins, FR-011 to FR-015). Motion queries (FR-003), Ring history (FR-004), battery alerts and the digest (FR-007) and per-client push filters move to 003 | `get_motion`, `get_history`, `set_push_filter` and the Push filter entity are 003 |
| CRP 1 | A command in flight when the home link drops fails with `HOME_OFFLINE`, outcome `unknown`, never retried. `BRIDGE_UNAVAILABLE` is reserved for a core dependency (database or Blob) being down. Follows the spec Edge Cases and the OR amendment | Command transitions, `contracts/errors.md`, `contracts/connector-link.md` |
| CRP 4 | The out-of-band "Ring session lost" alert is 004. In 001 a lost Ring session shows on the admin page; from 002 it is also a HIGH health event | `contracts/web-endpoints.md` |
| PT-19 | WORM shipping of the audit is 004. Iteration 001 keeps the audit hash chain in Azure SQL only | Audit entry |
| PT-11 | The oidc-provider storage is one generic `(model, id)` table | Agent client and grant (confirms CD's assumption and the DS ERD) |
| PT-07 | The catch-up-done marker travels through the durable outbox and is part of the link message set at every version. Link version 1 ships in 001; the N-1 contract test comes with the first version bump | `contracts/connector-link.md` |
| PT-18 | The agent allowlist lives in Settings, seeded from deployment configuration (client identifiers, redirect URIs, scopes). 001 grants read only; the admin page's agents view comes in 004 | Agent client and grant |
| PT-23 | Every ingested event appends an audit entry with identifiers only, in the same transaction as Event Log and State. These entries follow event retention (30 days). FR-035's list is the minimum set | Audit entry, Consistency rules |
| PT-24 | `location_id` is part of the event | Event, `contracts/events.schema.json` |
| PT-25 | The core's Classify engine applies the 2-minute late rule, measured from the home-received time. Home Ingest stamps `received_at` and does not mark lateness | Event, `contracts/connector-link.md` |
| PT-26 | The public contract says `type` for the device field and the `list_devices` filter. Storage keeps the column `kind`; State's DTO maps it | Device, `contracts/mcp-tools.md` |
| PT-27 | The mode A audit is the same schema in SQLite, with no write-once copy. SC5's append-only file is superseded | Audit entry |
| PT-28 | `get_events` with a cursor from an older epoch returns events from the start of the current epoch, with `epoch_changed: true`; the agent dedupes by event id | Cursor, `contracts/mcp-tools.md` |
| PT-29 | The health and recovery event kinds are named in the events schema. From 001 the home-link and Ring-session states show in `get_health` and on the admin page. From 002 these kinds are events, and the Ring-down and recovery kinds arrive | `contracts/events.schema.json` |
| PT-30 | Two link messages, both through the durable outbox: an inventory snapshot (on connect, after catch-up from 002, on request) and a device-state change, applied latest-wins by device and a home-side version counter | Device, `contracts/connector-link.md` |
| PT-31 | `subscription.kind` is defined here from the DS ERD context | Cursor |

## Stores by mode

| Store | Hybrid (H): cloud core | All-in-one (A) | Home connector (H) | Source |
|---|---|---|---|---|
| Records (one schema) | Azure SQL Database, Basic | the same schema in one SQLite file | none | DS3 |
| Media bytes | Blob, container `media/` | a folder | none (bytes travel over the link) | DS3, CD X2 |
| Audit proof (write-once) | Blob WORM, `audit-90d/` and `audit-1y/` | none: hash chain only | none | SC5, DS3, FR-035, FR-045 |
| Core secrets | Key Vault | an encrypted local file | none | SC4, CD3 |
| Outbox, executed command ids, timers, catch-up mark | none | SQLite (the connector's own file) | SQLite | DS3, CD map v3 Outbox Store |
| Ring token, push credentials, Ring's session hardware ID ("device ID" in SC4, not a sensor's `device_id`), connector key | never | the Secrets File | the Secrets File (encrypted; key from a Docker secret) | SC4, DS3 |
| Memory only | rate-limit counters, open listen streams | the same | none | DS1, CD-A2 |

The query layer speaks SQLite and T-SQL. A few statements (insert-or-update, paging) have two versions, kept inside the resource-access components (DS3 decided).

## Ownership: component to tables and containers

Each table belongs to exactly one resource-access component. No other component reads it. The admin page reads through the managers. The connector and the agents never touch the core database (DS6, CD4, CD map v3).

| Owner (resource access) | Tables / containers | H store | A store | Iteration |
|---|---|---|---|---|
| Event Log | `event`, `log_meta` | Azure SQL | SQLite | 002 |
| State | `location`, `device`, health snapshot [P name] | Azure SQL | SQLite | 001 |
| Subscriptions | `subscription` (002); push-filter rules [P name `push_filter`] (003) | Azure SQL | SQLite | 002 / 003 |
| Delivery | none stored (open listen streams in memory) | memory | memory | 002 |
| Audit | `audit_entry`, `audit_anchor`; Blob `audit-90d/`, `audit-1y/` | Azure SQL + Blob WORM | SQLite, no WORM | 002 (chain in Azure SQL only, starting with `events-30d`); 003 (`audit-90d`); 004 (`audit-1y`, WORM shipping) (PT-19, DRIFT-001-04) |
| Settings | `setting`, `agent`, `connector`, `owner_agreement` | Azure SQL | SQLite | 001 (`owner_agreement`: 004) |
| Grants | `oidc_item` | Azure SQL | SQLite | 001 |
| Lease | the lease row [P name `lease`] | Azure SQL | SQLite | 001 |
| Secrets | `issuer-signing-keys`, `pin-hash`, the requestState key, the plan-token key, the S1 secrets | Key Vault | encrypted file | 001 (signing keys); 002 (the S1 secrets); 003 (plan-token key); 004 (PIN hash, requestState key) |
| Media Cache | `media`; Blob `media/` | Azure SQL + Blob | SQLite + folder | 003 |
| Command | `command`, `used_token`, `pending_disarm`, the disarm-lock row [P name `disarm_lock`] | Azure SQL | SQLite | 003 (`pending_disarm`, `disarm_lock`: 004) |
| Outbox Store (home) | outbox, executed command ids, auto-off timers, catch-up mark | home SQLite | SQLite | 001 (event rows, catch-up mark: 002; command ids, timers: 003) |
| Secrets File (home) | Ring token, push credentials, Ring's session hardware ID, connector private key | encrypted file | encrypted file | 001 |

Owner names follow component-design, which assigned the owners data-storage left open:

- data-storage's "Config" box is now Settings;
- its "Issuer (Security)" box is Grants;
- its "Control, Safety" box is Command.

Sources: DS §Inventory footnote, CD C2, CD C5, CD map v3. Ring history is not stored; it is read from Ring when asked (DS §Inventory).

Table and column names are private to the owning accessor (CD4: "rows are mapped inside each accessor"). The field names below are the contract names. Where the ERD uses another word for the same column, the field row says so.

## Entities

Types:

- `string`, `integer` and `boolean` are as usual;
- `timestamp` is UTC ISO 8601;
- `json` is a document column;
- "untrusted" marks Ring-sourced text, which is data and never instructions (FR-033, AC B13).

### Location

**Iteration**: 001. **Owner**: State. **Store**: `location` (Azure SQL / SQLite).

| Field | Type | Notes | Source |
|---|---|---|---|
| `location_id` | string | primary key | DS ERD |
| `name` | string, untrusted | [P] field | spec Key Entities |
| `ownership` | enum `owned`, `shared` | [P] name; ERD "owned or shared" | DS ERD, FR-036 |
| `time_zone` | string (IANA zone) | ERD `tz`; used for every `*_local` time | DS ERD, FR-006 |
| `alarm_mode` | enum `disarmed`, `home`, `away` | [P] name and values; IA D8 calls it "mode" | spec Key Entities, IA D8 |
| `monitoring` | enum `on`, `off`, `unknown` | whether Ring exposes it is a pilot check; 003 (arm summary) | IA D8 step 3 |
| `as_of` | timestamp | when the stored state was true | CD map v3 State |
| `state_version` | integer | the highest home-side version applied to this location's fields, from the same home counter as devices; internal, not in the tool contract; [P] name | PT-30, DRIFT-001-08 |

- **Relationships:** one Location has many Devices and many Events (DS ERD). A shared Location has one or more owners' agreements in Configuration (SC7 C5).
- **Validation:**
  - a shared location is invisible unless switched on (FR-036);
  - when on, it is read-only, so control is refused (FR-036, US8 scenario 2);
  - its media is off by default (FR-036, SC7 C5);
  - it is turned on only after its owners' agreement is recorded (FR-036, SC7 C5).
- **Retention:** overwritten (a projection kept for stale reads; DS §Inventory, AC B12). A newer full snapshot removes a location Ring no longer lists, once none of its devices is left (DRIFT-001-31).

### Device

**Iteration**: 001. **Owner**: State. **Store**: `device`.

| Field | Type | Notes | Source |
|---|---|---|---|
| `device_id` | string | primary key; the contract calls it `id` inside a device reference | DS ERD, IA D7 |
| `location_id` | string | foreign key to Location | DS ERD |
| `name` | string, untrusted | any language, returned as written | FR-002, FR-033 |
| `type` | enum `contact`, `motion`, `flood`, `keypad`, `base_station`, `camera`, `doorbell`, `light`, `other` | the contract name, and the `list_devices` filter; the storage column stays `kind` (ERD), mapped by State's DTO; values [P] from the spec's device list | FR-002, IA D7, PT-26, CD4, spec Key Entities |
| `room` | string, untrusted | | FR-002 |
| `battery_pct` | integer 0-100, optional | [P] name | FR-002, FR-007 |
| `battery_low` | boolean, optional | [P] name; Ring's own low flag | FR-007, RN §Sensor battery alerts |
| `power_mode` | enum `battery`, `wired` | | FR-002, AC-A5 |
| `online` | boolean | | FR-002 |
| `state` | json | current device state | DS ERD |
| `as_of` | timestamp | when `state` was true | CD map v3 State |
| `state_version` | integer | the highest home-side version applied; internal, not in the tool contract; [P] name | PT-30 |

- **Relationships:** a Device belongs to one Location. It has many Events and, for cameras, many Media items (DS ERD).
- **How State is filled:** from the link's `inventory` snapshot (on connect, after the catch-up from 002, on request), `device_state` messages, and events that change a device. Every source is applied latest-wins by device and `state_version` (PT-30; `contracts/connector-link.md`).
- **Validation:**
  - names are stored and returned as written, in any language (FR-002);
  - names are never logged (OR6);
  - the battery alert is raised once per device per crossing of the threshold, or when Ring flags low (FR-007, RN §Sensor battery alerts). Battery alerts and the digest are 003 (CRP 2); `battery_pct` is listed from 001 (FR-002).
- **Retention:** overwritten (DS §Inventory). A newer full snapshot removes a device Ring no longer lists, and only an inventory adds one (DRIFT-001-31).

### Event

**Iteration**: 002. **Owner**: Event Log. **Store**: `event`, plus `log_meta` for the per-location counter.

| Field | Type | Notes | Source |
|---|---|---|---|
| `event_id` | string | unique; the dedupe key | IA D7, DS ERD (UQ) |
| `location_id` | string | part of the primary key `(location_id, seq)`; a contract field | DS ERD, FR-008, PT-24 |
| `seq` | integer | per location, from `log_meta.next_seq`; never reused | IA D7, DS5 |
| `kind` | string, open list | ERD `type`; unknown Ring kinds become `ring.other` | IA D7, CD4 |
| `priority` | enum `HIGH`, `MEDIUM`, `LOW` | set by Classify from policy data | IA D7, FR-009 |
| `occurred_at` | timestamp | Ring's time (`ring_ts`); ERD `ts` | IA D7, OR §journey |
| `received_at` | timestamp | the connector's receive time, stamped by Ingest; the late rule measures from it | IA D7, CD-A4, PT-25 |
| `stored_at` | timestamp | the core's commit time; internal, not in the contract | OR §journey |
| `device_id` | string, optional | foreign key to Device; health and bridge events have none | DS ERD |
| `summary` | string, untrusted-derived | one line; built from Ring names | IA D7, FR-033 |
| `media_id` | string, optional | foreign key to Media item; becomes the `frame` link; 003 | DS ERD, FR-014 |
| `late` | boolean | default false; set by the core's Classify engine | IA §Amendments (OR, CD-A4), PT-25 |
| `data` | json | kind-specific detail: Ring's own kind name for `ring.other` (untrusted), the recovery-summary fields for `bridge.events_recovered` | DS ERD, CD4, CD-A4 |

`log_meta` (one row per location): `location_id`, `epoch`, `next_seq` (DS ERD).

Contract-only fields derived at the edge: `occurred_at_local` and `received_at_local` [P names] (IA D7 "UTC, plus local"), `device` `{id, name, room}` (IA D7), `frame` (IA D7) and `recovered` [P name] (CD-A4). See `contracts/events.schema.json`.

- **Relationships:** an Event belongs to one Location and at most one Device. It may point to one Media item (DS ERD).
- **Validation:**
  - order is set by the per-location `seq`, and repeats are recognised by `event_id` (spec Edge Cases, IA D4);
  - priority comes from policy data, not code (FR-009, CD5).
- **Priority policy:**

  | Situation | Priority | Pushed by default |
  |---|---|---|
  | flood, alarm triggered, doorbell, contact while armed, motion while armed, Ring connection lost | HIGH | yes |
  | contact while disarmed, camera motion with a person | MEDIUM | yes |
  | motion while disarmed, other camera motion | LOW | no (opt-in per sensor and per client, from 003) |

  Sources: FR-009, RN §Event priority. In 002 only the defaults apply: HIGH and MEDIUM go to every connected client, and LOW is never pushed (CRP 2). One exception in every iteration from 002: `bridge.events_recovered` is pushed to every agent whatever its priority (CD-A4: "to every agent").

- **Never delayed:** an event never waits for a snapshot. It carries `frame` only if a frame was already captured (FR-014, AC B11).
- **Retention:** 30 days (FR-008). Delete-now removes events but never reuses a `seq` (FR-037, DS5).

**State transition: the late marker** (CD-A4, OR §Amendments, RN §Amendments, FR-013, PT-25):

```text
 HOME: Ingest stamps received_at -> Outbox Store; it does not mark lateness
 CORE: Classify decides late when the event arrives:
   +-- arrives within 2 min of received_at ------------> late = false
   |                                                     pushed if the policy says so
   +-- arrives more than 2 min after received_at ------> late = true (held at home)
   +-- from_history = true (read from Ring history ----> late = true, keeps Ring's time
       after a gap of up to 24 h)                        (from_history: see Readings 1)
                                                          |
 late = true: stored, readable by cursor, keeps its priority, NOT pushed one by one
                                                          |
 catch-up-done marker reaches the core --> if any were late: ONE bridge.events_recovered
   event to every agent: count, oldest and newest times, seq range;
   its priority = the highest among the late events; it is pushed to every agent
   even when that priority is LOW. Nothing late: no summary.
```

The 2 minutes is policy data, tuned in the pilot. The home VM and Azure clocks are assumed NTP-synced (CD-A4).

### Cursor

**Iteration**: 002. **Owner**: Subscriptions (the per-client marks); Event Log (the epoch). **Store**: `subscription`, `log_meta`.

A Cursor is an agent's position in one location's log. The agent holds it as an opaque string. The server keeps each client's last-read mark.

| Field | Type | Notes | Source |
|---|---|---|---|
| `cursor` / `next_cursor` | string, opaque | encodes `location_id`, `epoch` and `seq`; the encoding is [P] | IA D7, DS5, spec Key Entities |
| `epoch` | integer | in `log_meta`; a new value after any restore or reset | DS5 |
| `seq` | integer | the last seq read | IA D7 |

`subscription` row (DS ERD): `sub_id` and `location_id` (the primary key), `client_id`, `user_sub`, `kind`, `epoch`, `last_seq`, `last_read_at`.

`kind` (PT-31): the ERD lists it without a definition. The ERD sits beside Delivery's push routes and Subscriptions' cursors and last-read marks, so this plan reads it as how the client receives this location's events [P values]:

- `webhook`: MCP Events webhooks (ChatGPT);
- `listen`: a listen stream, including the channel shim's;
- `pull`: no push; the client reads with `get_events` from its cursor or last-read mark (claude.ai, Desktop, mobile).

Sources: DS ERD, CD map v3 Delivery and Subscriptions, PT-21.

- **Relationships:** a Cursor belongs to one agent client and one Location.
- **Validation:**
  - never skips, and survives restarts (FR-011, AC B10);
  - `(epoch, seq)` is never reused (spec Key Entities, DS5);
  - `get_events` without a cursor returns what is new since that client's last-read mark (CD C4).
- **Retention:** until the client is revoked (DS §Inventory).

**State transition: the cursor epoch** (DS5, PT-28):

```text
 log_meta(location): epoch E, next_seq N
   append       -> seq N, next_seq N+1 (never reused, also after delete-now)
   restore/reset-> epoch E' (a new value); cursors from epoch E no longer match
 get_events with an epoch-E cursor -> events from the start of epoch E',
   with epoch_changed: true; the agent dedupes by event_id; nothing is skipped
```

### Push filter

**Iteration**: 003 (CRP 2: FR-010's per-client opt-ins). **Owner**: Subscriptions. **Store**: push-filter rules [P table name `push_filter`].

A push filter holds, per client, which sensors and priorities are pushed beyond the defaults (spec Key Entities). It only adds opt-ins; HIGH and MEDIUM are always pushed to every connected client (FR-010).

| Field | Type | Notes | Source |
|---|---|---|---|
| `client_id` | string | the agent client the rule belongs to | FR-010 |
| `location_id` | string | | DS ERD (subscriptions are per location) |
| `device_id` | string, optional | the sensor; omitted means every device in the location | FR-010, RN §Event priority ("opt-in per sensor and per client") |
| `kind` | string, optional | event kind, for example `motion` | [P] |
| `priority` | enum `HIGH`, `MEDIUM`, `LOW`, optional | only `LOW` changes what is pushed | FR-010 |

- **Validation:**
  - per client: another agent's push is unchanged (US2 scenario 4);
  - the device must exist in the location (`NOT_FOUND`);
  - scope `read` (IA D7).
- **Retention:** until the client is revoked or the rule is removed.

### Media item

**Iteration**: 003. **Owner**: Media Cache. **Store**: `media` row plus the blob in `media/` (H), or a file in a folder (A).

| Field | Type | Notes | Source |
|---|---|---|---|
| `media_id` | string | primary key | DS ERD |
| `device_id` | string | the camera; foreign key to Device | DS ERD |
| `event_id` | string, optional | [P] link to the event whose frame or clip this is | FR-014, FR-018 |
| `kind` | enum `frame`, `burst`, `clip` | values [P] | DS ERD `kind` |
| `source` | enum `forced`, `cached`, `event`, `live` | | FR-016, IA D7 |
| `captured_at` | timestamp | [P] name; ERD `ts`; the reply's `as_of` | DS ERD, FR-016 |
| `blob_name` | string | | DS ERD |
| `expires_at` | timestamp | capture time plus the retention | DS ERD, FR-021 |
| `has_sound` | boolean, clips only | [P] name; clips keep Ring's sound unless the camera's switch drops it | FR-020, SC7 C3 |

`age_s` is computed at read time (FR-016).

- **Validation:**
  - frames are JPEG and at most 1280 px (FR-016, IA §Rules 4);
  - no public or pre-signed links: clips are links read with the requesting agent's own token (FR-018);
  - nothing is returned for a camera whose media switch is off (FR-020);
  - battery cameras are capped per hour, with no unprompted live view (FR-019, AC B9);
  - images are never logged or written to the audit (FR-034, SC7 C6).
- **Retention:** 7 days by default, configurable (FR-021). Delete-now removes them (FR-037).

### Action plan and confirmation

**Iteration**: 003 (tier a: arm, lights); 004 (tier b: disarm). **Owner**: Command (stored parts); Safety engine (builds and checks the plan; no storage).

There is no plan table. The Safety engine builds the plan from live state. A one-time token, signed with the plan-token key, binds it to the user, the client and the exact plan. Only used token ids are stored (IA D8 arm table, IA §Rules surfaced 2, SC4, DS ERD).

| Field (in the plan and token) | Type | Notes | Source |
|---|---|---|---|
| `action` | enum `arm_home`, `arm_away`, `light_on`, `light_off`, `disarm` | `disarm`: 004 | IA D7, FR-022 |
| `location_id` / `device_id` | string | the target; `device_id` for lights (`device` reference in the reply) | FR-022 |
| `summary` | string | plain words: what will happen | FR-023 |
| `consequence` | string | for arming: the exit-delay rule (any contact opened after the delay sounds the alarm) and the monitoring state | FR-023, IA §Rules surfaced 3 |
| `bypass` | list | open contacts the arm bypasses: device references in the reply, device ids in the token and the link `cmd`; [P] name for D8's "bypass list" | IA D8 steps 3 and 7 |
| `exit_delay_s` | integer | [P] name | IA D8 step 3 |
| `monitoring` | enum `on`, `off`, `unknown` | | IA D8 step 3 |
| `auto_off_s` | integer, optional | lights only | SC3, CD key flow 2 |
| `client_id`, `sub` | string | the binding | SC3, FR-023 |
| `jti` | string | the token's id; the token itself reaches the agent as `token` | DS ERD (`used_token PK jti`), IA D8 |
| `expires_at` | timestamp | issue time plus 2 minutes | FR-023 |

Stored rows (Command):

- `used_token`: `jti` (primary key) and an expiry for the purge [P] (DS ERD, DS4).
- `pending_disarm`: `request_id` (primary key), `command_id`, `sub`, `client_id`, `expires_at` (2 min) and `status` [P]. The sealed (AEAD) `requestState` points to it (IA D8 disarm step 3, DS ERD).

**Validation:**

- valid for 2 minutes, one use, and only from the client and user it was issued to (FR-023, FR-025);
- if the plan changed between prepare and confirm, the confirm fails with `CONFIRMATION_INVALID` (IA §Rules surfaced 2);
- disarm is off by default, offered only to MRTR clients that declare URL elicitation, and never in mode A (FR-027, IA D8 b, FR-045).

**State transition: tier a confirmation** (IA D8 arm table, IA §Rules 6):

```text
 prepare_action --(already in that state: "no change", no token)--> end
   |
   v
 [issued] --2 min pass------------------------------> [expired] (confirm: CONFIRMATION_INVALID)
   | confirm_action: same client, same sub, unused, not expired
   v
 [used]  (jti stored in used_token at once)
   | state read again
   +-- plan changed --> CONFIRMATION_INVALID, "prepare again"
   +-- plan same ----> Command created (command_id)

 Client with elicitation: prepare_action asks the owner directly;
   accept --> Command created, prepare_action returns the result
   decline -> HUMAN_DECLINED, nothing sent home
```

**State transition: tier b pending disarm** (IA D8 disarm table, DS4, FR-028):

```text
 [requested] (pending_disarm row; 2 min; requestState sealed)
   | the retried call waits up to 60 s, then input_required again
   +-- 2 min pass ---------------------------------> [expired]
   +-- the bridge restarts ------------------------> [cancelled] (fail closed)
   +-- confirm page: fresh sign-in, same sub, PIN right -> [confirmed] -> Command
   +-- PIN wrong ----------------------------------> Disarm lock: tries + 1
```

### Command

**Iteration**: 003. **Owner**: Command (core); Outbox Store (home: executed command ids). **Store**: `command`.

| Field | Type | Notes | Source |
|---|---|---|---|
| `command_id` | string | primary key | DS ERD, FR-024 |
| `action` | enum (as above) | | IA D7 |
| `location_id`, `device_id` | string | target | IA D8 |
| `client_id`, `sub` | string | who confirmed | SC3 |
| `request_id` | string | correlation | OR2 |
| `deadline_at` | timestamp | sent time plus 60 s | IA D8 step 7, FR-024 |
| `outcome` | enum `done`, `not_done`, `unknown` | | FR-024, IA §Reply, error and event shapes |
| `error_code` | string, optional | for example `RING_REJECTED`, `TIMEOUT` | IA §Error codes |
| `result` | json | for example `alarm_mode`, `as_of`, `auto_off_at` | IA D8 step 10 |

Only the primary key is in the ERD. The other columns are [P].

- **Validation:**
  - one row per command id; at most once; never retried automatically (FR-024, IA §Rules surfaced 1);
  - the token is marked used and the command id stored together, in one row (CD key flow 2);
  - control needs the single-instance lease (FR-025, FR-044, CD C6);
  - only allowlisted actions run at home (IA D8 step 8).
- **Retention:** used tokens, command ids and the pending disarm are kept from 2 minutes to 24 hours (DS §Inventory). The audit keeps the lasting record.

**State transition: command outcome** (IA D8, OR §Failure modes, CD X2):

```text
 CORE
 [created] --link down before sending--> not_done (HOME_OFFLINE)
   | cmd sent once (never re-sent after a drop)
   v
 [sent] --result: Ring accepted--------------------> done
 [sent] --result: Ring refused---------------------> not_done (RING_REJECTED)
 [sent] --result: dropped at home, past deadline---> not_done
 [sent] --60 s, no result--------------------------> unknown (TIMEOUT); never retried
 [sent] --home link drops--------------------------> unknown (HOME_OFFLINE); never retried (CRP 1)
 a late result still reaches the audit and the event (IA D8 step 11)

 HOME (Execute)
 command_id already seen --> return the stored result; never call Ring twice
 past deadline_at --------> drop (not_done)
```

### Audit entry

**Iteration**: 002 (the Audit accessor and the hash chain in Azure SQL only, starting with `event_ingested` entries on the `events-30d` chain); 003 (control and media-access entries, on the `audit-90d` chain); 004 (security and configuration entries on the `audit-1y` chain, with the rest of FR-035 in plan.md's iteration table; WORM shipping and the daily copy check) (PT-19, PT-23, PT-33). Iteration 001 writes no audit entries: the owner kept the plan as it is at the tasks boundary on 2026-11-02 (DRIFT-001-04), and iteration 002's plan stage re-checks when the security and configuration entries start. **Owner**: Audit. **Store**: `audit_entry`, `audit_anchor`, plus WORM Blob in H from 004. **One hash chain per retention class** (PT-33): `events-30d`, `audit-90d`, `audit-1y`.

| Field | Type | Notes | Source |
|---|---|---|---|
| `chain` | enum `events-30d`, `audit-90d`, `audit-1y` | the retention class; each chain has its own order and anchor | PT-33 |
| `seq` | integer | chain order within `chain`; the key is (`chain`, `seq`) | DS ERD, PT-33 |
| `prev_hash`, `hash` | string | the hash chain | DS ERD, SC5 |
| `kind` | enum `event_ingested`, `control`, `media_access`, `security`, `config` | values [P]: `event_ingested` for PT-23's per-event entry, the others from SC5's four kinds | SC5, PT-23 |
| `event_id`, `location_id`, `event_seq` | string, string, integer | `event_ingested` entries only; identifiers only, never content; [P] names | PT-23 |
| `client_id`, `sub` | string | who | DS ERD |
| `action`, `result` | string | what happened and how it ended | DS ERD |
| `ts` | timestamp | | DS ERD |
| `shipped_to_worm` | boolean | at-least-once shipping flag | DS4 |

`audit_anchor`: one row per chain, holding the oldest kept `seq` and its hash, so each chain still verifies after its own purge (DS5, PT-33). A purge only ever removes the oldest entries of one chain, so retention classes never interleave.

- **WORM (H):** two containers, `audit-90d/` (control, media access) and `audit-1y/` (security, config), one append blob per day. The core may only append. Unlocked during the pilot (SC5).
- **Validation:**
  - every control action, confirmation, media access, security event and configuration change is audited (FR-035). FR-035's list is the minimum set (PT-23);
  - every ingested event appends one `event_ingested` entry in the same transaction as Event Log and State (CD key flow 1, DS4, PT-23);
  - entries hold who, what and when, never images, tokens or the PIN (SC7 C6, FR-034);
  - a daily check compares the two copies and raises an event on a mismatch (SC5; from 004, PT-19).
- **Sizing:** about 1,000 to 3,000 `event_ingested` entries a day plus about 500 others, which fits Azure SQL Basic's 2 GB (agent estimate; PT-23, DS §Evidence tags).
- **Mode A:** the same schema in SQLite, with no write-once copy. SC5's append-only file is superseded (FR-035, FR-045, DS3, PT-27).
- **Retention:**
  - `event_ingested` entries follow event retention, 30 days (PT-23);
  - control and media-access entries 90 days, security and configuration entries 1 year (FR-035, SC5);
  - never deleted by delete-now (SC7 C6, DS §Carried in);
  - WORM lifecycle rules delete each blob once its retention ends (SC5).

### Agent client and grant

**Iteration**: 001. **Owners**: Settings (the listing and policy); Grants (the Issuer's records). **Store**: `agent`, `oidc_item`.

| Field | Type | Notes | Source |
|---|---|---|---|
| `client_id` | string | primary key of `agent` | DS ERD |
| `platform` | string | [P] name; the admin page shows it | UX layout (Agents) |
| `scopes` | set of `read`, `media`, `control` | config switches override scopes; 001 grants `read` only | FR-030, SC3, PT-18 |
| `redirect_uris` | list of string | seeded from deployment configuration with the client id and scopes; [P] name | PT-18 |
| `elicitation_only` | boolean, default false | [P] name for the per-agent switch | SC6 |
| `revoked_at` | timestamp, optional | [P] | FR-031 |
| `last_seen_at` | timestamp | [P] | UX layout (Agents) |

`oidc_item` (Grants; node-oidc-provider's adapter): one generic table, `model` and `id` (the primary key), `grant_id`, `uid`, `data` (json), `expires`. It holds clients (CIMD or DCR), grants and refresh tokens, stored hashed (DS ERD, SC4, CD X1, PT-11).

- **Default scopes:**
  - control for the chosen chat and coding agents;
  - read only for the local desktop relay (the shim);
  - read and media for cloud-hosted agents acting under their own identity.

  Sources: FR-030, SC3.
- **Validation:**
  - only listed agent clients may link (FR-029, SC1);
  - access tokens last 1 hour; refresh tokens rotate and end after 30 days unused or 90 days at most (FR-029, SC1);
  - revoke one or all; "revoke all" needs a sign-in under 5 minutes old plus a typed confirmation (FR-031, FR-039, UX U4).
- **How the list is seeded:** in 001 the allowlist in Settings is seeded from deployment configuration (client identifiers, redirect URIs, scopes, set as GitHub environment variables). The admin page's agents view arrives in 004 (PT-18).
- **Lifecycle:** listed (Settings) -> linked (a grant in Grants) -> revoked (Settings marks it; Grants destroys the grant) (FR-031, CD X1).
- **Retention:** grants end after 30 days unused or 90 days at most (DS §Inventory). Listing rows last until changed.

### Home part enrollment

**Iteration**: 001. **Owner**: Settings (the enrolled key); Secrets File at home (the private key). **Store**: `connector`.

| Field | Type | Notes | Source |
|---|---|---|---|
| `key_id` | string | primary key | DS ERD |
| `public_key` | string | the connector's key; the private key never leaves home | SC2 |
| `status` | enum `pending`, `active`, `revoked` | [P] | SC2 |
| `enrolled_at`, `revoked_at` | timestamp | [P] | SC2 |
| `connector_version` | string | [P]; from the hello; feeds "connector behind" on the admin page | DO carry-forward to ui-ux, IA D2 |
| `enrollment_code` | string, optional | [P]; the code a pending request carries, shown on the admin page for the owner to compare; cleared on approval. Added at T022 by migration 2 (DRIFT-001-25) | SC2, PT-32 |

- **Validation:**
  - one home part per Ring account: approving a new enrollment revokes the old one (FR-032, AC B7, SC2);
  - the owner checks that the code on the admin page matches the code the connector printed (SC2);
  - enrolling a new connector needs a sign-in under 5 minutes old plus a typed confirmation (UX U4).

**State transition: enrollment and re-enrollment** (SC2):

```text
 Setup CLI makes a key pair and an enrollment code
 [none] --Core Link dials out: "enroll me" + public key--> [pending]
                                (the admin page lists the request and its code)
 [pending] --owner approves after comparing the codes---> [active]
                                every older key ---------> [revoked]
 [active]  --at every hello: the core sends a fresh challenge; the connector signs it
 [active]  --a newer enrollment is approved-------------> [revoked]
 (a pending request lives 10 minutes as a `pending` row with its expiry in Settings' `connector` table; one per Ring account, a new one replaces it; PT-32; a unique index allows one `pending` row, migration 3, DRIFT-001-28)
```

### Disarm lock

**Iteration**: 004. **Owner**: Command (one row). **Store**: the disarm-lock row [P name `disarm_lock`].

| Field | Type | Notes | Source |
|---|---|---|---|
| `tries` | integer | wrong PIN tries | CD-A2 |
| `last_wrong_at` | timestamp | | CD-A2 |
| `locked_until` | timestamp, optional | when the lock ends | CD-A2 |

Field names are [P]. The content is CD-A2's.

- **Validation:**
  - the PIN is checked only on the bridge's own confirm page, against an argon2id hash in Secrets (FR-028, SC4);
  - each wrong try is saved in the same transaction as its audit entry (CD-A2);
  - 5 tries and 15 minutes are policy data (CD-A2).

**State transition** (CD-A2, FR-028):

```text
 [open, tries 0] --wrong PIN--> [open, tries n] (n < 5)
 [open, tries n] --right PIN--> [open, tries 0] -> disarm proceeds
 [open, tries 4] --wrong PIN--> [locked until now + 15 min] + HIGH event
 [locked] --PIN entered--> refused "locked until hh:mm"; the PIN is not checked
 [locked] --15 min pass--> [open] (whether tries reset then is not recorded)
 restart, deploy, auto-heal: the row survives; the count and the lock hold
```

### Configuration

**Iteration**: 001 (the global battery threshold, listed agents, connector key); 002 (priority policy and push defaults); 003 (per-device battery thresholds, per-camera switches, auto-off default, elicitation-only); 004 (disarm switch, shared locations, mode-A control switch). **Owners**: Settings (what the owner changes on the admin page; every change audited); Config utility (start-up values tuned in the pilot) (CD5).

| Value | Default | Held in | Source | Iteration |
|---|---|---|---|---|
| Priority policy and push defaults | the FR-009 table | policy data (Settings or Config; CD5 allows either) | FR-009, CD5 | 002 |
| Battery threshold, global | 20% | policy data | FR-001 (`low_batteries` in the overview), FR-007, RN §Sensor battery alerts | 001 |
| Battery threshold per device; the crossing alert and the digest that use it | the global value | policy data | FR-007 | 003 |
| Late-event age limit | 2 minutes | policy data in Classify | CD-A4 | 002 |
| Health thresholds | stale 2 min; out of band 10 min | Config | CD map (Health), OR3, CD5 | 001 (out of band: 002) |
| Rate limits per agent | control 20/h (counted on confirm); reads 600/h; fresh frames and bursts 60/h; clips 20/h | Config | FR-026, SC6, CD5 | see `contracts/errors.md` |
| Retention | events 30 d; media 7 d; audit 90 d / 1 y | Config | FR-008, FR-021, FR-035, CD5 | 001 |
| Listed agents and their scopes | control off for unlisted clients | Settings `agent` | SC3, SC7 C7 | 001 |
| The owner's Entra object id: the only person who signs in | none: every sign-in is refused | deployment configuration | SC1, DRIFT-001-39 | 001 |
| Enrolled connector key | none | Settings `connector` | SC2, CD map v3 Settings | 001 |
| Per-camera "media to agents" | not recorded for owned cameras; off for shared locations | Settings | FR-020, FR-036, SC7 C2 | 003 |
| Per-camera "keep sound" | keep | Settings | FR-020, SC7 C3 | 003 |
| Battery-camera cap per hour | not recorded | Settings (per camera, on the admin page) | FR-019, UX layout (Cameras) | 003 |
| Light auto-off default | not recorded | Settings | UX layout (Settings) | 003 |
| Per-agent elicitation-only switch | off | Settings `agent` | SC6 | 003 |
| Disarm switch | off | Settings | FR-027, SC3 | 004 |
| Shared locations, and the owners' agreement (who, date) | off | Settings `setting`, `owner_agreement` | FR-036, SC7 C5 | 004 |
| Mode-A control switch (arm, lights) | off | configuration | FR-045, spec Clarifications | 004 |

**Validation:** turning disarm on, revoke all, delete now and enrolling a connector need a sign-in under 5 minutes old plus a typed confirmation. In mode A they need the typed confirmation only (FR-039, FR-045, UX U4), except mode A's own home part: it runs in the same process with no network link, so no other home can enroll, and its key is approved at start (the owner's choice (i), 2026-11-10, DRIFT-001-53).

### Other stored state (supporting the entities)

| State | Owner | Fields | Source | Iteration |
|---|---|---|---|---|
| Health snapshot | State | home link, Ring session, push, last event, `stale_since`, outbox depth, connector version, and since when a session's own inventory is owed [P] (CP-14 review round 3) | CD map v3 State, OR §journey | 001 (push and last event: filled from 002) |
| Single-instance lease | Lease | holder, expiry; renewed every 15 s, expires after 45 s | OR §Amendments, CD C6 | 001 |
| Outbox | Outbox Store (home) | `event_id`, `received_at`, the normalized event, send state | CD map v3, DS §Inventory | 001 (event rows: 002) |
| Executed command ids | Outbox Store (home) | `command_id`, the stored result | CD map v3, IA D8 step 8 | 003 |
| Auto-off timers | Outbox Store (home) | device, off time, the state to restore | CD C3, CD key flow 2 | 003 |
| Catch-up mark | Outbox Store (home) | the last point Ring history was read up to | CD map v3 | 002 |
| Ring secrets | Secrets File (home) | Ring refresh token, push credentials, Ring's session hardware ID, connector private key | SC4 | 001 |
| Core secrets | Secrets | `issuer-signing-keys` (rotated every 90 days, old key kept for checking), `pin-hash`, requestState key, plan-token key, S1 secrets | SC4, CD-A1 | 001 / 002 / 003 / 004 |

## Consistency rules

1. **One transaction per incoming event.** Dedupe on `event_id`, take the next `seq`, append to Event Log, update State, append the `event_ingested` audit entry, commit. Only then ack the connector and push (DS4, CD key flow 1, AC B10, PT-23).
2. **Durable before delivery.** The home outbox row is cleared only on the core's ack. Unacked messages (events, `inventory`, `device_state`, `catchup_done`) are resent after 10 s, oldest first on reconnect. The core dedupes events on `event_id` (AC B10, OR5, FR-042, PT-07, PT-30).
3. **State is latest-wins.** State applies an inventory entry, a `device_state` message or an event's state change only if its home-side `state_version` is higher than the one it holds for that device (PT-30). Each of them carries the device's full state, never only the changed fields, so a dropped older version loses nothing (DRIFT-001-06). Locations follow the same rule: each location entry in `inventory` carries its own `state_version`, and State applies a location's fields only if that version is higher than the one it holds for the location (DRIFT-001-08).
4. **A failed commit is not acked.** The database transaction is retried once on a transient error; otherwise the connector resends (OR5). With the database down, events wait in the outbox and calls fail `BRIDGE_UNAVAILABLE` (OR §Failure modes row 6).
5. **Used one-time tokens and command ids are stored,** so a core restart cannot replay a token or a command. The token is marked used and the command id stored in one row (DS4, CD key flow 2).
6. **A pending disarm fails closed on restart** (DS4, FR-028).
7. **The audit chain is extended inside the transaction of the change it records.** From 004, `shipped_to_worm` ships each entry to WORM at least once, deduped by hash (DS4, PT-19).
8. **PIN tries are saved in the same transaction as their audit entry** (CD-A2).
9. **Media:** write the blob, then its row. A purge removes the row, then the blob (DS4).
10. **Seq and epoch:**
    - a `seq` is never reused, including after delete-now;
    - a restore or reset gives a new epoch (DS5).
11. **Single writer:**
    - one core replica holds the lease (renewed every 15 s, expires after 45 s);
    - no lease, no control (fail closed);
    - `/readyz` reports it (AC B7, OR §Amendments, CD C6, FR-044).
12. **Rate-limit counters live in memory** and reset on restart (DS1, DS4, CD-A2).
13. **Each table belongs to one accessor.** Only the core's identity has database and Blob rights (DS6, SC4, CD4).
14. **Commands reach home at most once; events at least once** (IA §Rules surfaced 1).

## Retention and purge

| Data | Kept | Purged by | Source |
|---|---|---|---|
| Events | 30 days | a Scheduler tick | FR-008, AC §Call rules |
| Media items | 7 days (configurable) | a Scheduler tick; row, then blob | FR-021, DS4 |
| Audit: `event_ingested` | 30 days (event retention), chain `events-30d` | a Scheduler tick, oldest first, moving the chain's anchor | PT-23, PT-33 |
| Audit: control, media access | 90 days, chain `audit-90d` | Admin, keeping the chain's anchor; WORM lifecycle rules | FR-035, SC5, DS5, CD (Admin), PT-33 |
| Audit: security, configuration | 1 year, chain `audit-1y` | the same | FR-035, SC5, PT-33 |
| Used tokens, command ids, pending disarm | 2 minutes to 24 hours | token and pending-disarm expiry | DS §Inventory |
| Grants | 30 days unused, 90 days at most | the Scheduler's token-expiry tick | FR-029, DS §Inventory, CD map v3 Scheduler |
| Cursors, subscriptions, push filters | until the client is revoked | Admin (revoke) | DS §Inventory |
| Settings | until changed (every change audited) | none | DS §Inventory |
| State (location, device, health) | overwritten | none | DS §Inventory |
| Disarm lock row | kept | none | CD-A2 |
| Outbox rows (home) | until acked | Outbox Store | DS §Inventory |
| Ring token (home) | until re-login; never backed up | none | DS5 |
| Rate-limit counters, listen streams | memory; gone on restart | none | DS1 |

**Delete now** removes cached media and events, never the audit (FR-037, SC7 C6).

## Schema lifecycle

- Migrations are forward-only and additive, and run at start (one replica, so no race). Code N-1 still runs on schema N (DS5, IA D2).
- CI upgrades a database from the previous release on SQLite and on SQL Server (DS5, DS3 consequences).
- Azure SQL has point-in-time restore, with one restore drill in the pilot. A restore gives a new log epoch (DS5).

## Iteration needs

| Entity | 001 | 002 | 003 | 004 |
|---|---|---|---|---|
| Location | yes | | `monitoring` for the arm summary | shared locations (US8) |
| Device | yes | | battery alerts and digest; camera media switches | |
| Event | | yes (no `frame` yet; LOW never pushed) | `frame` links; `battery.low`; LOW opt-ins | |
| Cursor | | yes | | |
| Push filter | | | yes | |
| Media item | | | yes | |
| Action plan and confirmation | | | tier a | tier b (disarm) |
| Command | | | yes | disarm |
| Audit entry | none (DRIFT-001-04) | the Audit accessor and the chain in Azure SQL only: `event_ingested` entries (the `events-30d` chain) | control and media-access entries (the `audit-90d` chain) | security and configuration entries (the `audit-1y` chain), WORM shipping, daily check, full admin audit view |
| Agent client and grant | yes | | elicitation-only switch | |
| Home part enrollment | yes | | | |
| Disarm lock | | | | yes |
| Configuration | the global battery threshold, agents, connector | priority policy and push defaults | per-device battery thresholds, per-camera switches | disarm, shared, mode-A control |

Iteration scope: Option B (DA Human Decision) as narrowed at plan (CRP 2), its slice split in two at plan:

- 001 is part 1 of the Option B slice: US1 reads on the hybrid path after sign-in, read scope only: FR-001, FR-002, FR-005, FR-006;
- 002 is part 2: US2 events: FR-008 to FR-015 (FR-010 without per-client opt-ins);
- 003 is US3 and US4, plus FR-003 (motion), FR-004 (history), FR-007 (battery alerts and digest) and the per-client push filters;
- 004 is US6 in full, US5 (shipped off), US7 and US8, plus WORM shipping and the out-of-band "Ring session lost" alert.

## Names proposed here

These names appear in the contracts but in no record. They are proposals for the plan boundary, not decisions.

| Name | Where | Why it is needed |
|---|---|---|
| `occurred_at_local`, `received_at_local` | events schema | IA D7 says "UTC, plus local" without field names |
| `health.home_online`, `health.ring_unavailable`, `health.ring_restored` | events schema | PT-29 asks for the health and recovery kinds (001 and 002), names [P] |
| `event_ingested`; `event_id`, `location_id`, `event_seq` on that audit entry | Audit entry | PT-23 gives the content and "something like `event-ingested`"; written in snake case to match the other audit kinds |
| `inventory`, `device_state`, `inventory_request`, `message_id`, `state_version` | `contracts/connector-link.md`, Device | PT-30 gives the content, names [P] |
| `from_history` | `contracts/connector-link.md` | see Readings 1 under "Resolved at plan" |
| `subscription.kind` values `webhook`, `listen`, `pull` | Cursor | PT-31 asks for a meaning from the ERD context |
| `redirect_uris` | Agent client | PT-18 lists redirect URIs without a field name |
| `recovered` `{count, oldest_at, newest_at, seq_from, seq_to}` | events schema | CD-A4 gives the content, not the names |
| `ring_kind` (inside `data`) | Event | CD4 keeps Ring's name for `ring.other` without naming the field |
| `alarm_mode` values `disarmed`, `home`, `away` | Location, tools | IA D8 says "mode" |
| Device `type` values; `battery_pct`, `battery_low` | Device, `list_devices` | the spec lists device types in words (the field name `type` is PT-26) |
| `ownership`, Location `name` | Location | the ERD says "owned or shared" |
| The cursor encoding | Cursor | DS5 fixes the content, not the format |
| Tool input names other than `max_age_s`, `fresh`, `cursor`, `action`, `token` | `contracts/mcp-tools.md` | IA D7 names only these |
| Media `kind` values, `captured_at`, `event_id`, `has_sound` | Media item | the ERD gives `kind` and `ts` only |
| `bypass`, `consequence`, `exit_delay_s`, `status` on `prepare_action` | Action plan | IA D8 describes them in prose |
| `command` columns beyond `command_id` | Command | the ERD gives the primary key only |
| `disarm_lock`, `push_filter`, `lease` table names; health-snapshot fields | stores | the ERD does not draw them |
| `status`, `enrolled_at`, `revoked_at`, `connector_version`, `enrollment_code` | Home part enrollment | SC2 describes the flow, not the row |
| `platform`, `elicitation_only`, `revoked_at`, `last_seen_at` | Agent client | UX and SC6 describe them, not their names |
| Untrusted marker keyword `x-untrusted` | schemas | FR-033 and IA §Rules 5 ask for marking; no mechanism is recorded |
| Link frame names other than `hello`, `cmd`, `result`, `EventMessage`, `CommandMessage` | `contracts/connector-link.md` | the records describe the rest in prose |

## Resolved at plan

The planner resolved every conflict and every iteration-001 and iteration-002 gap below on 2026-11-02, for the owner to review at the plan boundary (`research.md`). The ids are kept from the earlier draft. The spec decides WHAT; the records decide HOW.

### Conflicts between sources

| # | Topic | The two sides | Resolution |
|---|---|---|---|
| 1 | Error code for a command in flight when the home link drops | CD X2: `BRIDGE_UNAVAILABLE`. IA §Error codes and the OR amendment: `HOME_OFFLINE` for the home link, `BRIDGE_UNAVAILABLE` for a core dependency | `HOME_OFFLINE`, outcome `unknown`, never retried (CRP 1) |
| 2 | An audit entry for every ingested event | CD key flow 1 and DS4: yes. SC5's kinds and FR-035's list: not listed | Yes: one `event_ingested` entry, identifiers only, 30-day retention. FR-035's list is the minimum set (PT-23) |
| 3 | Location on the event | IA D7: no field. DS ERD: key `(location_id, seq)` | `location_id` is part of the event (PT-24) |
| 4 | Who applies the 2-minute late rule | the CD-A4 diagram: home Ingest. CD-A4's decided text and the OR amendment: Classify | the core's Classify engine, from `received_at`. Ingest only stamps `received_at` (PT-25) |
| 5 | Device "type" or "kind" | IA D7 and FR-002: "type". DS ERD: `kind` | the contract says `type` (field and filter). Storage keeps `kind`, mapped by State's DTO (PT-26) |
| 6, 7 | The iterations of `get_history` and motion | the spec traceability map and the first brief; DA Option B | both in 003 (CRP 2) |
| 8 | The mode A audit store | SC5: an append-only file. DS3 and the DS ERD: the same schema in SQLite | the same schema in SQLite, no write-once copy (PT-27) |

### Gaps resolved

| # | Gap | Resolution |
|---|---|---|
| G3 | How a reply signals a cursor from an old epoch | events from the start of the current epoch, with `epoch_changed: true`; the agent dedupes by `event_id` (PT-28) |
| G4 | Whether WORM ships in 001 | no: in 004. The chain in Azure SQL starts in iteration 002, and iteration 001 writes no audit entries (PT-19, DRIFT-001-04) |
| G6 | The meaning of `subscription.kind` | the delivery kind: `webhook`, `listen` or `pull` [P] (PT-31; see Cursor) |
| G7 | The health and recovery kind names (001 states, 002 events) | `health.home_offline`, `health.home_online` [P], `health.ring_unavailable` [P], `health.ring_restored` [P], `ring.session_lost` (PT-29). Security-event and battery-digest kinds are named in the 003 and 004 plans |
| G9 | The catch-up-done marker across N and N-1 | part of the message set at every version. Link version 1 ships in 001; the N-1 contract test comes with the first version bump (PT-07) |
| G15 | How device inventory and state reach the core | `inventory` and `device_state` [P], through the outbox, latest-wins by `state_version` (PT-30) |
| G16 | How agents are listed in 001 | the allowlist in Settings, seeded from deployment configuration; read only in 001 (PT-18) |

### Readings applied (to confirm at the plan boundary)

Where a resolution needed a detail it did not state, this plan applied the reading below.

1. **History-recovered events under PT-25.** PT-25 has Ingest stamp only `received_at`. An event read from Ring history after a gap reaches home long after it occurred, so `received_at` alone cannot show that it is late. The link therefore carries `from_history: true` [P], a fact about the event's origin rather than a lateness judgment, and Classify sets `late` for it, as CD-A4 and OR5 require.
2. **Recovery-event priority under PT-29.** `health.home_online` and `health.ring_restored` are HIGH [P], like the losses they end, so every agent receives them (US2 scenario 6). `health.ring_restored` also ends a `ring.session_lost` [P].
3. **The inventory under PT-30.** The snapshot also carries the locations (name, time zone, alarm mode, ownership), which State needs for US1. The home keeps `state_version` in the Outbox Store so it survives a restart, and events that change a device carry it too. A new enrollment resets the core's stored versions [P].
4. **The audit kind under PT-23** is written `event_ingested`, in snake case, to match `media_access`.

## Carried to the iteration 003/004 plans

| # | Topic | Iteration | Records |
|---|---|---|---|
| G1 | The refusal code for disarm requested while the PIN lock runs | 004 | UX U4, CD-A2 |
| G2 | Refusal codes for media on a camera whose switch is off, and for control without the lease while the database is up | 003 | FR-020, FR-044, OR §Failure modes row 6 |
| G2 | The refusal code for control on a shared location | 004 | FR-036 |
| G5 | How "revoke" ends already-issued access tokens at once | 004 (the admin revoke, US6) | FR-031, SC1 |
| G8 | The media chunk size on the link | 003 (PT-08) | CD X2 |
| G10 | The clip length cap | 003 | IA D3 |
| G11 | Defaults: the battery digest period, the battery-camera cap, the light auto-off, "media to agents" for owned cameras | 003 | FR-007, FR-019, FR-020, UX layout, SC7 C2 |
| G12 | Whether wrong-PIN tries reset when the lock ends | 004 | CD-A2 |
| G14 | Authorization for local MCP clients in mode A | 004 (US7, with PT-16) | AC B14, spec Assumptions |
| N2 | `event_ingested` entries do not ship to the write-once copy; WORM keeps FR-035's kinds in its two containers (PT-34) | 004 (PT-19), decided | SC5, PT-23, PT-34 |

G13 (enrollment request lifetime) is decided as PT-32 for iteration 001, because enrollment ships in 001. N1 (purging between retention classes) is decided as PT-33 and applies from iteration 002, when the first chain (`events-30d`) starts, so its first 30-day purge falls 30 days after 002 goes live. The `audit-90d` and `audit-1y` chains start with their entries in iterations 003 and 004 (DRIFT-001-04).
