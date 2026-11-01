# Feature Specification: Ring MCP Bridge

**Feature Branch**: `001-ring-mcp-bridge`  
**Created**: 2026-11-01  
**Status**: Draft  
**Input**: User description: "I want to create an MCP bridge for all Ring API capabilities and maybe also other ways to talk to Ring, include door bells, video cameras and if possible ring alarm sensors and status. I want to have the ability to connect any AI agent and system that support MCP to ring, for data and event injestion and if possible for controlling ring device and settings."

**Lens-informed**: this spec is written from the ten closed design-workshop lenses and the product-domain record (see "Design Workshop Inputs" below). It states WHAT the bridge must do and WHY; HOW each part is built is recorded in the lens records and decided at plan.

## Product Context *(from the product-domain record, human-confirmed)*

- **Who it is for:** the primary user is the project's author, a Ring account owner who uses AI agents every day. Secondary users are other Ring owners who install the public, MIT-licensed open-source project and run it themselves. Each operator self-hosts.
- **The pain:** agents learn about events at home late (today through Ring notification emails that an agent reads). They get no device or sensor state and cannot act. Today's workaround is the Ring app by hand, voice-assistant announcements and those emails.
- **The job:** let any MCP-capable AI agent know what is happening at home (doorbell, motion, sensors, alarm, flood) in real time, reason about it, and act within safe limits.
- **People affected beyond the user:** the household (a wrong arm or disarm, a missed alert), owners of shared Ring locations (privacy and consent), visitors and passers-by on camera (privacy), and the Ring account itself (the risk of being blocked on the unofficial path).
- **Outcomes:** a high-priority event (flood, alarm, doorbell) reaches the agent within 10 seconds, with a snapshot where one applies; the bridge runs a week without a manual re-login; no high-risk action ever runs without human confirmation; a new open-source user reaches their first event within 15 minutes of cloning.
- **Non-goals for v1:** face recognition or identifying people; a hosted multi-user service; changing Ring settings (motion zones, schedules, notifications); two-way audio; continuous recording; panic or emergency dispatch; non-Ring devices; a built-in automation rules engine (vision, not v1).
- **Vision:** the home as a safe, queryable, event-driven MCP surface that any AI agent can use.

## Clarifications

### Session 2026-11-01

- Q: How do other users connect cloud agents (ChatGPT including the dot, Claude), and what does all-in-one mode offer? → A: Option H. Other users who want cloud agents deploy hybrid on their own cloud subscription with the project's infrastructure code and README. All-in-one mode stays local-only: arm and lights are off by default and switched on only in configuration, disarm is never offered, and the admin page is served on localhost and opened with a one-time link printed at startup.
- Q: Is the monthly cost criterion (SC-011) an estimate or a pass/fail ceiling? → A: A ceiling of $30 a month for the author's deployment, checked on the bill in the pilot; about $23 stays the expected figure.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ask about the home right now (Priority: P1)

An agent asks the bridge what is going on at home and gets one honest, compact answer: the alarm mode, which contacts are open, where there is motion, which devices are offline, which batteries are low, and whether the bridge itself is healthy. It can drill into a device list, one device, recent motion, Ring's own history, or the bridge's health. Every answer says when it was true, and old data is never passed off as current.

**Why this priority**: knowing the current state is the foundation for everything else, and it is useful on its own even before events and control exist.

**Independent Test**: with a simulated home of about 100 devices, ask for the overview, filtered device lists, one device, motion in the last N minutes and health. Check the content, the freshness markers and the reply size.

**Acceptance Scenarios**:

1. **Given** a home with an alarm, contact and motion sensors, cameras and doorbells, **When** an agent asks for the overview, **Then** it receives the alarm mode, open contacts, active motion, offline devices, low batteries and bridge health in one reply of at most about 8,000 tokens, stamped with the time it was true in UTC and in the location's time zone.
2. **Given** the connection to Ring has been lost for 3 minutes, **When** an agent asks for any state, **Then** the reply returns the last known state, marked stale with the time it became stale, and never presents it as current.
3. **Given** a device named in Hebrew, **When** an agent lists devices, **Then** the name is returned as written, together with its type, room, battery level, power mode and online status.
4. **Given** motion sensors that fired while the alarm was disarmed, **When** an agent asks for motion in the last 15 minutes, **Then** it receives the recorded motion, the rooms active now and an occupancy summary.
5. **Given** a sensor battery that drops below the configured threshold (default 20%), **When** the level is read, **Then** one battery alert is raised for that crossing, and the sensor appears in the periodic battery digest.

---

### User Story 2 - Hear about important events in real time, with nothing lost (Priority: P1)

When a flood sensor fires, the alarm triggers, the doorbell rings, or a door opens while the home is armed, every connected agent is told within seconds. Agents can also read the event log from where they left off, so nothing is missed across disconnects or restarts. Each agent decides which lower-priority events it wants pushed.

**Why this priority**: late alerts are the core pain. The durable log is what makes the push trustworthy.

**Independent Test**: inject synthetic events of each priority into a simulated home with two connected agent clients. Measure the time inside the bridge. Kill and restart the bridge mid-stream, then read the log from a saved cursor.

**Acceptance Scenarios**:

1. **Given** the home is armed Away and two agents are connected, **When** a contact sensor opens, **Then** both agents receive one HIGH event with a unique event id, the device and room, and a one-line summary. The bridge's own processing takes at most 0.5 s (95th percentile).
2. **Given** an agent saved its cursor and then disconnected, **When** it reads events after that cursor, **Then** it receives every event since, in order, with none skipped, and a cursor for the next read.
3. **Given** the bridge restarts while events keep arriving, **When** agents reconnect and read from their cursors, **Then** no event is missing and no event appears twice, beyond repeats that carry the same event id.
4. **Given** motion while disarmed (not pushed by default), **When** an agent opts in for that sensor, **Then** that agent alone starts receiving those motion events.
5. **Given** events that reach the bridge late (recovered after a gap, or held at home for more than 2 minutes), **When** they are stored, **Then** each is readable with a late marker and keeps its priority. Instead of pushing them one by one, the bridge pushes one recovery summary with the count, the time range, the sequence range and the highest priority among them.
6. **Given** the connection to Ring is down for more than 2 minutes, **When** that threshold passes, **Then** every agent receives a HIGH health event, and a recovery event when the connection returns.
7. **Given** a snapshot is being captured for an event, **When** the event is ready to push, **Then** it is pushed without waiting for the snapshot. A frame link is attached only if one was already captured.

---

### User Story 3 - See what a camera sees (Priority: P2)

An agent asks for the latest frame from a camera, a short burst of frames, or the clip of an event, so it can describe what is happening (for example, who is at the door). The bridge protects battery cameras from being drained, and the owner decides per camera whether agents may see its media at all.

**Why this priority**: images turn an alert into understanding, but state and events must come first.

**Independent Test**: with fixed test images and short test clips standing in for cameras, request frames (cached and fresh), bursts and clips, including over the battery-camera cap and on a camera with media switched off.

**Acceptance Scenarios**:

1. **Given** a camera with media allowed, **When** an agent asks for a frame no older than 60 s, **Then** it receives one image of at most 1280 px, with when it was taken, its age and where it came from (cached, event, forced or live).
2. **Given** a battery camera that has reached its hourly cap of fresh frames, **When** an agent asks for a fresh frame, **Then** the request is refused with a battery-guard error that points to the cached frame.
3. **Given** an event with a recorded clip, **When** an agent asks for the clip, **Then** it receives a link readable only with that agent's own authorization, plus a few key frames the model can see. There is no public or pre-signed link.
4. **Given** the owner switched off media for a camera, **When** an agent asks for its frame or clip, **Then** no media is returned.

---

### User Story 4 - Arm the alarm or switch a light, safely (Priority: P2)

An agent asks to arm the alarm (Home or Away) or to switch a floodlight on or off, optionally with an automatic switch-off time. The bridge first says exactly what will happen, including the consequence (for example, that after the exit delay any opened contact sounds the alarm, and whether professional monitoring is on). The action runs only after the human confirms. Every action and confirmation is audited.

**Why this priority**: control is valuable but risky; it comes after the read and event paths are proven.

**Independent Test**: prepare and confirm each action against the simulated home, including expired, reused and foreign confirmations, a timeout, and a refusal by Ring.

**Acceptance Scenarios**:

1. **Given** an agent asks to arm Away, **When** it prepares the action, **Then** it receives a plain description of what will happen and the consequence, plus a one-time confirmation valid for 2 minutes, bound to that user, that client and that exact plan.
2. **Given** a valid confirmation, **When** the human confirms (in the client, or by the agent after showing the summary), **Then** the action runs exactly once, and the reply states its outcome (done, not done or unknown).
3. **Given** a confirmation that has expired, was already used, or belongs to another client, **When** it is used, **Then** nothing runs, and the reply says the confirmation is invalid.
4. **Given** an action that does not finish within 60 s, **When** the deadline passes, **Then** the outcome is reported as unknown, the action is never retried automatically, and the agent is told to check the state first.
5. **Given** a light switched on with a 10-minute auto-off, **When** 10 minutes pass, **Then** the light is switched off, and both steps appear in the audit.

---

### User Story 5 - Disarm only with a PIN that never passes through the model (Priority: P3)

Disarm exists in v1 but is off by default. When the owner turns it on, an agent may ask to disarm only from a client that supports the current MCP protocol's human-input flow. The human then confirms on the bridge's own confirm page, after a fresh sign-in, by entering a PIN. The PIN never passes through the agent or the model.

**Why this priority**: Ring enforces no PIN for disarm, so a mistaken disarm is the highest-impact risk. It ships last, switched off, behind the strongest gate.

**Independent Test**: with disarm off, any disarm request is refused. With disarm on, run the full flow on a supporting client and a refused flow on a legacy client, then enter wrong PINs until the lock engages, and restart during the lock.

**Acceptance Scenarios**:

1. **Given** disarm is switched off, **When** any agent asks to disarm, **Then** the request is refused with "action disabled".
2. **Given** disarm is on and the client lacks the current protocol's human-input flow, **When** it asks to disarm, **Then** the request is refused with "action disabled".
3. **Given** disarm is on and the client supports it, **When** the agent asks to disarm, **Then** the human is sent to the bridge's confirm page, signs in again as the same user, sees a countdown and a plain description, and enters the PIN. Only then does the disarm run.
4. **Given** 5 wrong PIN entries, **When** the fifth fails, **Then** disarm is locked for 15 minutes and a HIGH event is raised. The tries and the lock survive a restart.
5. **Given** a pending disarm when the bridge restarts, **When** it comes back, **Then** the pending disarm is cancelled.

---

### User Story 6 - The owner runs and protects the bridge (Priority: P2)

The owner sets the bridge up once (connects the home part, sets the PIN, decides which agents get which rights), glances at its health daily, and handles incidents: revoking one agent or all of them, and deleting cached media now. If the bridge itself dies, the owner hears about it out of band.

**Why this priority**: unattended operation and the ability to cut access fast are what make the bridge safe to leave running.

**Independent Test**: on the admin page, enroll the home part with a one-time code, set the PIN, grant and revoke agent rights, delete cached media, and view the audit. Stop the bridge's heartbeat and check that an out-of-band alert arrives.

**Acceptance Scenarios**:

1. **Given** a new installation, **When** the owner enrolls the home part with the one-time code shown on the admin page, **Then** the home part is trusted, and any earlier enrollment is revoked.
2. **Given** a suspected compromise, **When** the owner chooses "revoke all" (after a sign-in less than 5 minutes old and a typed confirmation), **Then** every agent's access ends at once, and the action is audited.
3. **Given** the bridge has sent no heartbeat for 10 minutes, or the home has been offline for more than 10 minutes, **When** the condition holds, **Then** the owner receives an email and an SMS.
4. **Given** the owner opens the admin page on a folded phone, an unfolded phone and a PC, **When** the page loads, **Then** the layout fits each width, every status shows as a word and an icon (never colour alone), and dark and light themes both work.

---

### User Story 7 - An open-source user runs it at home (Priority: P3)

Another Ring owner clones the public project and runs it in one of two ways. In all-in-one mode it runs entirely on one machine at home, with no cloud, and serves local MCP clients only. In hybrid mode the owner deploys it on their own cloud subscription with the same infrastructure code and README as the author's deployment, so cloud agents such as ChatGPT (including the dot) and Claude can connect, with the same tools, events and controls as the author's deployment.

**Why this priority**: open-source reach is a goal, but the author's pilot comes first.

**Independent Test**: follow the README on a clean machine, from clone to the first event seen by a local MCP client in all-in-one mode, and time it. Then deploy hybrid from the README into an empty cloud subscription and connect a cloud agent.

**Acceptance Scenarios**:

1. **Given** a clean machine and a Ring account, **When** a user follows the README for all-in-one mode, **Then** an MCP client receives its first event within 15 minutes of cloning.
2. **Given** all-in-one mode, **When** a local MCP client exercises reads, events and media, **Then** they behave as in the author's deployment.
3. **Given** all-in-one mode with default configuration, **When** a local agent asks to arm or switch a light, **Then** the request is refused with "action disabled". After the owner switches control on in configuration, the same request goes through the normal prepare and confirm steps. Disarm is always refused with "action disabled" in this mode.
4. **Given** all-in-one mode, **When** the bridge starts, **Then** it prints a one-time link that opens the admin page, which is served on localhost only.
5. **Given** a user with their own cloud subscription, **When** they deploy hybrid by following the README, **Then** cloud agents such as ChatGPT and Claude can connect and sign in as in the author's deployment.

---

### User Story 8 - Shared Ring locations, read-only, with consent (Priority: P3)

The author is a shared user on other people's Ring locations. Optionally, the bridge can read those locations, read-only, only after the owners have agreed, and with their media off by default.

**Why this priority**: optional in v1; it touches other people's privacy, and whether Ring exposes shared locations to the bridge is still unverified.

**Independent Test**: with the option off, shared locations are invisible. With it on and the owners' agreement recorded, their devices and events are readable but cannot be controlled, and their media is off until switched on.

**Acceptance Scenarios**:

1. **Given** shared locations are off (the default), **When** an agent lists locations, **Then** only owned locations appear.
2. **Given** a shared location turned on, with its owners' agreement recorded, **When** an agent asks to arm it or switch its lights, **Then** the request is refused.

---

### Edge Cases

- **The home part goes offline mid-command:** in-flight commands fail with outcome unknown and are never retried; reads degrade to stale; control and media report that the home is offline, with a retry time.
- **Ring blocks or rate-limits the bridge** (for example a firewall 406): reported as Ring unavailable, with backoff. After 5 failures, calls to Ring pause and are probed once a minute.
- **The Ring session expires or needs a new login:** a HIGH health event is raised. The owner is told on the admin page and out of band. A lost Ring session needs the owner to log in to Ring again (including 2FA); the bridge never does it for them.
- **Arming with open contacts:** whether Ring refuses or bypasses them is a pilot check. The prepare step states what Ring will do.
- **Two agents use the same confirmation:** only the client it was issued to can use it, and only once.
- **The bridge's own store is down:** reads fail with a retryable "bridge unavailable" error rather than stale data (stale applies only to the home link). Control stops, because the single-instance guarantee cannot be held.
- **A second bridge instance starts:** only the instance holding the single-instance lease may act; without the lease there is no control (fail closed).
- **A device's name or an event's text contains instructions:** the content is treated as untrusted data, and the bridge and its tool descriptions say so.
- **Events arrive out of order or twice:** order is set by the per-location sequence, and repeats are recognised by event id.
- **Clocks drift between the home part and the cloud part:** late-event age is measured from the time the home part received the event (clocks assumed time-synced; checked in the pilot).
- **Motion detectors may not report while disarmed,** and their re-trigger cooldown is unknown: verified in the pilot.
- **An MCP client cannot play a video clip:** the key frames ensure the model always sees something. An admin-page clip player is added only if the clip spike (S7) shows it is needed.

## Requirements *(mandatory)*

### Functional Requirements

**Inquiry (state)**

- **FR-001**: The system MUST return a one-reply overview per location: alarm mode, open contacts, active motion, offline devices, low batteries and bridge health, at most about 8,000 tokens for a home of about 100 devices.
- **FR-002**: The system MUST list devices with id, name (in any language), type, room, battery level, power mode and online status, filterable by kind and room, and MUST return the full state of a single device.
- **FR-003**: The system MUST always record motion, whatever the alarm mode, and MUST answer motion queries: motion in the last N minutes, rooms active now, and an occupancy summary.
- **FR-004**: The system MUST return Ring's history for a device or a location over a time range, including the bridge's own control entries.
- **FR-005**: The system MUST report its own health: the home link, the Ring session, push reception, the last event received, and since when data has been stale.
- **FR-006**: Every reply MUST state when its data was true, in UTC and in the location's time zone, and its freshness (live, cached or stale, with the time it became stale). Reads MUST return the last known state marked stale when the home link is down, and MUST fail with a retryable "bridge unavailable" error when the bridge's own store is down.
- **FR-007**: The system MUST raise a sensor battery alert when a level drops below a configurable threshold (default 20%, set globally and per device) or when Ring flags the battery as low, once per device per crossing, and MUST send a periodic battery digest.

**Events**

- **FR-008**: The system MUST record every event in a durable log, ordered per location, with a unique event id, and MUST keep events for 30 days.
- **FR-009**: The system MUST assign priorities by policy data, not code:
  - HIGH: flood, alarm triggered, doorbell, a contact while armed, motion while armed, Ring connection lost;
  - MEDIUM: a contact while disarmed, camera motion with a person;
  - not pushed by default (still recorded and queryable): motion while disarmed, other camera motion.
- **FR-010**: The system MUST push HIGH and MEDIUM events in real time to every connected agent client, at least once, deduplicated by event id. Each client MUST be able to set which sensors and priorities it receives (opt-ins for events not pushed by default).
- **FR-011**: The system MUST let an agent read events after a cursor, with filters and a next cursor. The cursor MUST never skip and MUST survive restarts. The log is the source of truth, and push is a hint.
- **FR-012**: The system MUST deliver push both to clients on the current MCP protocol version and to clients on the earlier version, including a local relay that brings events to a desktop coding agent.
- **FR-013**: The system MUST store events that arrive late (recovered after a gap of up to 24 hours, or held at home for more than 2 minutes) with a late marker and their priority. It MUST NOT push them one by one, and MUST instead push one recovery summary with the count, the time range, the sequence range and the highest priority among them.
- **FR-014**: The system MUST never delay an event for a snapshot. An event carries a frame link only if a frame was already captured.
- **FR-015**: The system MUST raise a HIGH health event when the Ring connection is down for more than 2 minutes, and a recovery event when it returns.

**Media**

- **FR-016**: The system MUST return a single camera frame (an image of at most 1280 px) with when it was taken, its age and its source (forced, cached, event or live), honouring a requested maximum age or a request for a fresh frame.
- **FR-017**: The system MUST return a burst of 5 to 8 frames from one short live session.
- **FR-018**: The system MUST return a short clip (of an event, or N seconds live) as a link readable only with the requesting agent's own authorization, plus a few key frames. It MUST never issue public or pre-signed links.
- **FR-019**: The system MUST cap fresh frames and live sessions on battery cameras per hour (configurable), MUST never start live view on a battery camera unprompted, and MUST point to the cached frame when the cap is reached.
- **FR-020**: The owner MUST be able to switch agent access to media on or off per camera. Clips keep the sound Ring recorded unless a per-camera switch drops it.
- **FR-021**: The system MUST keep cached frames and clips for 7 days by default (configurable).

**Control**

- **FR-022**: The v1 control actions MUST be: arm Home, arm Away, light on and light off (with an optional auto-off time), and disarm (see FR-027). The system MUST NOT offer sirens, panic or emergency dispatch, or changes to Ring settings in v1.
- **FR-023**: Every control action MUST be prepared first. The prepare step states what will happen and its consequence (for arming: the exit-delay rule and the monitoring state) and issues a one-time confirmation that is valid for 2 minutes and bound to the user, the client and the exact plan. Where the client can ask the human directly, the bridge asks; otherwise the agent shows the summary and then confirms.
- **FR-024**: Each command MUST run at most once, under a unique command id. It MUST never be retried automatically, and MUST report its outcome as done, not done or unknown (unknown on timeout, after a 60-second deadline).
- **FR-025**: The system MUST refuse control when the confirmation is invalid (expired, used or from another client), when the action is switched off in configuration, or when the single-instance guarantee is not held (fail closed).
- **FR-026**: The system MUST enforce configurable per-agent rate limits (defaults: control 20 an hour, counted on confirm; reads 600 an hour; fresh frames and bursts 60 an hour; clips 20 an hour). It MUST also limit its outgoing calls to Ring through one shared limiter with backoff, with no polling bursts.

**Disarm**

- **FR-027**: Disarm MUST be off by default. When it is on, it MUST be offered only to clients that support the current MCP protocol's multi-round human-input flow with a link to a page. Every other client MUST receive "action disabled". In all-in-one mode disarm MUST never be offered (FR-045).
- **FR-028**: The PIN MUST be entered by the human on the bridge's own confirm page, after a fresh sign-in by the same user who started the request, and MUST never pass through the agent, the client or the model. The PIN MUST be stored only as a slow one-way hash. Five wrong tries MUST lock disarm for 15 minutes and raise a HIGH event, and the tries and the lock MUST survive restarts. A pending disarm MUST be cancelled on restart.

**Access and security**

- **FR-029**: Remote agents MUST authenticate through MCP's standard authorization, with the bridge as its own issuer and only listed agent clients allowed. The human MUST sign in with their organization identity. Access lasts 1 hour; refresh rotates and ends after 30 days unused or 90 days at most.
- **FR-030**: The system MUST grant the scopes read, media and control per client, and configuration switches MUST override scopes. Defaults: control for the chosen chat and coding agents; read-only for the local desktop relay; read and media for cloud-hosted agents acting under their own identity.
- **FR-031**: The owner MUST be able to revoke one client or all clients at once.
- **FR-032**: The Ring login token, push credentials and the home part's key MUST stay only at home, encrypted at rest, and MUST never appear in any reply, log or tool. The home part MUST only connect out. It MUST enroll with its own key pair and a one-time code checked by the owner, and a new enrollment MUST revoke the old one (one home part per Ring account).
- **FR-033**: The system MUST treat Ring-sourced text (device names, event text) and image content as untrusted data, MUST never act on instructions found in them, and MUST mark them as untrusted in its tool descriptions and schemas.
- **FR-034**: Logs MUST carry identifiers, never content: no tokens, PIN, keys or images.
- **FR-035**: The system MUST keep a tamper-evident audit of every control action, confirmation, media access, security event and configuration change, with a write-once copy. Control and media-access entries are kept for 90 days, and security and configuration entries for 1 year. All-in-one mode keeps the tamper-evident chain but has no write-once copy (FR-045).

**Privacy and compliance**

- **FR-036**: Shared locations MUST be off by default. When turned on, each MUST be read-only, MUST require its owners' recorded agreement first, and MUST have its media off by default.
- **FR-037**: The owner MUST be able to delete cached media and events now.
- **FR-038**: The project MUST state that it is unofficial and not affiliated with Ring or Amazon, MUST use no Ring logo, MUST point users to the agent platforms' training and memory settings, MUST ship under the MIT license with secure defaults and a security policy, and MUST send no telemetry.

**Administration pages**

- **FR-039**: The system MUST serve an admin page, for the owner only and behind a fresh sign-in. It covers first setup (enroll the home part, set or change the PIN, agent rights), a health view refreshed every 15 seconds, incident actions (revoke one or all, delete now) and a paged, filtered audit view. Risky actions MUST need a sign-in less than 5 minutes old plus a typed confirmation. In all-in-one mode the admin page is reached through a one-time localhost link instead of a sign-in, and risky actions need the typed confirmation (FR-045).
- **FR-040**: The admin and confirm pages MUST work at three widths (a folded phone, an unfolded phone, a PC), keep page state when a phone is unfolded mid-task, default to a dark theme with a light switch remembered per browser, show every status as a word and an icon, support keyboard use with readable contrast, and show banners with what to do when the home is offline, the Ring session is lost or the store is down. English only in v1.
- **FR-041**: The confirm page MUST show a countdown and a plain description of the action and its reasons.

**Operations and resilience**

- **FR-042**: The system MUST run at least 7 days unattended without a manual Ring re-login. It MUST reconnect within 60 seconds of a link or push drop, with growing delays (1 to 30 seconds, randomised). It MUST resend unacknowledged events from home after 10 seconds, and after a gap MUST catch up Ring's history (up to 24 hours) through the shared Ring limiter.
- **FR-043**: The system MUST alert the owner out of band, by email and SMS, when no heartbeat is seen for 10 minutes, the home is offline for more than 10 minutes, the Ring session is lost, the audit chain does not match, or the audit's write-once copy is more than 1 hour behind. These out-of-band alerts apply to hybrid mode; all-in-one mode has no outside watcher (FR-045).
- **FR-044**: The system MUST guarantee a single active instance per Ring account. An instance that cannot hold the guarantee MUST NOT control anything.
- **FR-045**: The same product MUST run in two modes: hybrid (a cloud part that serves agents, plus a home part that alone talks to Ring) and all-in-one (one machine at home, serving local MCP clients only). Any owner MUST be able to deploy hybrid on their own cloud subscription with the project's infrastructure code and README. In all-in-one mode:
  - arm and lights MUST be off by default and switched on only in configuration; when on, they use the same prepare and confirm steps as hybrid (FR-023 to FR-025);
  - disarm MUST never be offered;
  - the admin page MUST be served on localhost only and opened with a one-time link printed at startup, and risky admin actions MUST need a typed confirmation;
  - the out-of-band alerts (FR-043) and the audit's write-once copy (FR-035) are not provided, because the home machine cannot report its own outage and there is no cloud store.
- **FR-046**: The tool list is the public contract and MUST change only additively: a tool is deprecated before removal. The link between the home part and the cloud part MUST be versioned, and the cloud part MUST accept the current and the previous version.
- **FR-047**: The system MUST publish its public contract (tool inputs and outputs, the event shape) as machine-readable schemas.
- **FR-048**: Tool input schemas MUST be flat (enums and optional fields, no alternatives or nullable unions), so that every target client can use them.

### Traceability & Governance Requirements *(mandatory)*

- **TG-001**: Each user story MUST map to one or more functional requirements.
- **TG-002**: Each requirement MUST identify expected owner role(s).
- **TG-003**: Each requirement MUST identify intended iteration or delivery
  window.
- **TG-004**: Any known spec/implementation conflict MUST include an explicit
  reconciliation path.

**Traceability map** (owner roles: *Implementer* is the coding agent that builds it, reviewed by the chosen reviewer host; *Owner* is the author, who verifies in the pilot. Delivery windows are named here and set into iterations at plan.)

| Story | Requirements | Owner roles | Delivery window |
|---|---|---|---|
| US1 Ask about the home | FR-001-FR-007, FR-033, FR-034, FR-047, FR-048 | Implementer; Owner (pilot, read-only) | v1 MVP |
| US2 Real-time events | FR-008-FR-015, FR-042, FR-044, FR-046 | Implementer; Owner (pilot latency log) | v1 MVP |
| US3 Camera media | FR-016-FR-021, FR-026 | Implementer; Owner (pilot; clip spike S7) | v1 MVP |
| US4 Safe control | FR-022-FR-026, FR-035 | Implementer; Owner (runs the real control actions in the pilot) | v1 MVP |
| US5 Disarm | FR-027, FR-028, FR-041 | Implementer; Owner (switches it on only after the pilot) | v1, shipped off |
| US6 Run and protect | FR-029-FR-032, FR-035, FR-037, FR-039, FR-040, FR-043 | Implementer; Owner | v1 MVP |
| US7 Open-source user | FR-038, FR-045 | Implementer; Owner (README walk-through, both modes) | v1 public release |
| US8 Shared locations | FR-036 | Implementer; Owner (records the owners' agreement) | v1 optional, behind configuration |

**Known conflicts and their reconciliation path (TG-004):**

- **The official Ring API vs the unofficial path:** v1 uses the unofficial path, and its terms-of-service risk is accepted. Spike S1 (an official private-app proof of concept, pending the owner's go) decides whether an official adapter replaces it later behind the same Ring boundary. The contract does not change.
- **The 10-second outcome vs unmeasured hops:** the bridge's internal 0.5-second target is enforced in CI. The end-to-end figure is measured in the pilot. If it misses 10 seconds, the slow hop is identified, and this spec is amended before release.
- **The 7-day unattended outcome vs Ring's session behaviour for non-US accounts:** verified by a 7-day soak in the pilot. A failure goes back to plan.

### Key Entities *(include if feature involves data)*

- **Location**: a Ring home the bridge reads, either owned or shared. It has an alarm mode, a time zone and devices. A shared location is read-only and has a recorded owners' agreement.
- **Device**: a sensor (contact, motion, flood), keypad, base station, camera, doorbell or light. It has a name (any language), type, room, battery level, power mode (battery or wired), online status and current state.
- **Event**: something that happened, with an event id, a per-location sequence number, a priority, a kind, when it occurred and when it was received, the device, a one-line summary, an optional frame link and a late marker.
- **Cursor**: an agent's position in a location's event log. It never skips and has an epoch, so sequence numbers are never reused.
- **Push filter**: per client, which sensors and priorities are pushed beyond the defaults.
- **Media item**: a frame or clip, with its source, capture time, age, camera and retention expiry.
- **Action plan and confirmation**: what a control action will do, plus a one-time confirmation bound to the user, the client and the plan, valid for 2 minutes.
- **Command**: one execution of a confirmed action, with a command id and an outcome (done, not done, unknown).
- **Audit entry**: one control, confirmation, media access, security event or configuration change, linked in a tamper-evident chain.
- **Agent client and grant**: an MCP client allowed to connect, with its scopes, rate limits and revocation state.
- **Home part enrollment**: the trusted home part's identity, one per Ring account.
- **Disarm lock**: the count of wrong PIN tries and any active lock, kept across restarts.
- **Configuration**: policy values (priorities, push defaults, thresholds, caps, switches such as disarm, shared locations and control in all-in-one mode, media per camera).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A HIGH event reaches every connected agent within 10 seconds of the device triggering (the acceptance ceiling). The goal is 5 seconds at the 95th percentile, measured in a pilot log. A MEDIUM event reaches agents within 30 seconds. The bridge's own processing takes at most 0.5 seconds at the 95th percentile, checked automatically on every change.
- **SC-002**: No HIGH event is lost. In a kill-and-restart test and across a dropped home link, 100% of events are readable from the agent's cursor, with none skipped and no repeats beyond the same event id.
- **SC-003**: The bridge runs at least 7 consecutive days with no manual Ring re-login, recorded in a pilot journal.
- **SC-004**: 0 high-risk actions run without a valid human confirmation. 100% of attempts with a missing, expired, reused or foreign confirmation are refused, and every disarm attempt is refused while disarm is off.
- **SC-005**: A lost Ring connection is shown as stale within 2 minutes, and agents receive a HIGH health event.
- **SC-006**: The default overview and device-list replies for a home of about 100 devices stay within about 8,000 tokens.
- **SC-007**: A new open-source user goes from clone to their first event in an MCP client within 15 minutes, in all-in-one mode.
- **SC-008**: No battery camera serves more fresh frames or live sessions in an hour than its configured cap.
- **SC-009**: 100% of control actions, confirmations and media accesses appear in the tamper-evident audit, which is kept 90 days (security and configuration entries: 1 year).
- **SC-010**: When the bridge stops working, the owner receives an out-of-band alert within 15 minutes (agent-derived from the decided alert rules: a 10-minute condition, checked every 5 minutes).
- **SC-011**: The author's deployment costs at most $30 a month, the top of the workshop's $15–30 range, checked on the bill in the pilot. A bill above the ceiling sends the design back to plan. The expected figure is about $23 a month (agent-derived: the sum of the workshop's estimates (cloud hosting about $14.45, database about $6.50, monitoring about $1.50, audit under $0.10), plus small usage charges (SMS, storage)).

## Assumptions

Each assumption carries its evidence tag from the workshop records (known, assumed, research-needed).

- **Ring access (known):** Ring is cloud-only; there is no local Ring API. If Ring or the internet is down, nothing works, and the bridge says so honestly.
- **The unofficial path (known):** v1 talks to Ring through the community client library on the unofficial path. This conflicts with Ring's terms of service, and that risk is accepted with a README disclaimer. Ring's firewall blocks datacenter addresses, which is why only the home part talks to Ring.
- **The official API (research-needed, load-bearing):** whether a non-US account can use Ring's official private-app API is unknown. Spike S1 checks it, pending the owner's go.
- **A Ring test from the cloud (research-needed, informational):** spike S2, one Ring request from the cloud, pending the owner's go. A pass would not move Ring access to the cloud.
- **Clips in clients (research-needed):** whether ChatGPT and Claude can play clips is checked by spike S7.
- **Latency (assumed):** about 1 to 3 seconds from sensor to Ring to bridge; the push latency of the agent platforms is measured in the pilot.
- **Battery levels (assumed):** per-sensor battery levels are available for Ring Alarm devices; verified on real devices in the pilot.
- **Shared locations (research-needed, not load-bearing):** whether the client library can see shared locations is unverified; US8 depends on it.
- **The pilot (decided):** the pilot runs on production with disarm off. The owner runs every real-world control action; the agent never does.
- **Ring login (decided):** the owner performs the Ring login and 2FA themselves. Nothing identifying the owner's home, cloud subscription or tenant is stored in the repository.
- **Recorded Ring payloads (decided):** they are committed only after a scrub and the owner's review.
- **Sign-in in all-in-one mode (decided in clarify, 2026-11-01):** all-in-one mode has no owner sign-in. It serves local MCP clients only (architecture-core IN2), keeps arm and lights off until the owner switches them on, never offers disarm, and opens the admin page with a one-time localhost link (FR-045). Owners who want cloud agents such as ChatGPT or Claude deploy hybrid on their own cloud subscription (devops-operations DO2). A user-supplied tunnel in front of all-in-one mode was considered and left for later; it would not change the public contract.
- **Other owners' hybrid sign-in (assumed):** the organization identity that comes with an owner's own cloud subscription is enough for the owner sign-in at no extra cost. Not verified.

## Design Workshop Inputs *(lens-informed; the HOW lives here)*

All ten lenses are closed, human-confirmed with scope lens-question. Record: `specs/001-ring-mcp-bridge/lens-applicability.json`.

- `workshop/product-domain.md` and `.yml`: users, pain, MVP, non-goals, constraints, evidence tags.
- `workshop/requirements-nfr.md`: quality priorities, latency budget, event priority and motion policy, the mandatory behaviours.
- `workshop/architecture-core.md`: IDesign decomposition; the hybrid topology plus all-in-one mode; binding constraints; v1 scope; spikes.
- `workshop/integration-api.md`: the tool catalog, reply, error and event shapes, error codes, safety tiers, key sequences.
- `workshop/security-compliance.md`: identity, enrollment, scopes, secrets, audit, risk register, rate limits, privacy.
- `workshop/data-storage.md`: data ownership, stores, consistency, retention, migrations.
- `workshop/observability-resilience.md`: logging, correlation, health, out-of-band alerts, failure modes, recovery.
- `workshop/devops-operations.md`: hosting, infrastructure as code, environments, CI/CD, identities, repository governance.
- `workshop/ui-ux.md`: the admin and confirm pages, journeys, states, layouts at three widths.
- `workshop/component-design.md`: component map v3, the call rules, seams, DTO rule, extension mechanism, amendments.
- `workshop/code-implementation.md` and `implementation-rules.yml`: the stack posture, error handling, testing, layout, dependencies, the rules for implement, and the reviewer host.

## Governance Alignment *(mandatory)*

- **Spec Steward**: the owner (the author) approves the spec at the specify boundary. The Specrew coordinator keeps the spec consistent with the lens records.
- **Iteration Facilitator**: the Specrew coordinator (the AI agent), which drives the boundaries and stops for the owner's verdict at each one.
- **Capacity Model**: set at plan with Specrew's capacity planning. Effort is estimated per task and grouped into iterations; the build effort for the scenario engine and the fake identity provider is estimated there (code-implementation I4).
- **Drift Signals**: requirement-to-task-to-test traceability checks; the drift check between spec, plan, tasks and code; the implement-time code-rules review by rule id against `implementation-rules.yml`; the schema snapshot test that guards the additive contract rule; the dependency check that guards the component boundaries.
- **Human Oversight Points**:
  - the owner's explicit approval at every lifecycle boundary;
  - the owner's go for spikes S1 and S2;
  - every real-world control action in the pilot, run by the owner;
  - switching disarm on;
  - turning on shared locations (with the owners' agreement);
  - reviewing scrubbed Ring payloads before they are committed;
  - any git commit (asked first).
