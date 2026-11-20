# Integration & API — Ring MCP Bridge

**Depth**: Full.
**Status**: CLOSED 2026-10-25. The human moved on ("move on") after the lens summary.
**Confirmation**: human-confirmed (lens-question). Each decision point was answered in its own turn: D1-D6 together, then D7, then D8 with its three answers.
**Inputs**: `architecture-core.md` (closed 2026-10-25), `requirements-nfr.md`, `product-domain.md`, and the research in `research_notes/`.

**Carried in from architecture-core:**
- IN7: no `anyOf` in tool input schemas, so Foundry agents can call the tools.
- From the yard-gate decision (G1):
  - the frame tool takes a freshness bound (`max_age_s`), and refreshes go through the Ring rate limiter;
  - the gate app subscribes to motion events from the two gate cameras;
  - whether a LAN path for home apps is warranted is decided here.
- P7: the home-to-Azure link transport is decided here.

## Integration map (human-confirmed with D1-D6, 2026-10-25)

```text
 YOUR PC                          AZURE CORE (1 replica)           HOME VM
 +------------------------+       +------------------------+       +-----------------+
 | Claude Code            |       | MCP endpoint           |       | Connector       |
 |   tools ---------------+--(1)->| HTTP: 2026-07-28 and   |       | Ring adapter    |
 |   channel <-stdio-     |       | legacy; OAuth 2.1      |<-(4)--| Capture         |
 |             [shim] ----+--(2)->|                        |       | Outbox + link   |
 +------------------------+       |                        |       +--------+--------+
 ChatGPT ---- tools ---------(1)->|                        |                | (5)
         <--- MCP Events ---(3)---| Delivery               |                v
 claude.ai, Desktop,              |                        |         Ring cloud
 Foundry, your gate app -----(1)->|                        |         (unofficial)
                                  | official adapter       |<-(6)-- Ring official API
                                  | (only if S1 passes)    |        REST + HMAC webhooks
                                  +------------------------+
```

## Contracts by boundary (human-confirmed with D1-D6)

```text
 +---+--------------------+-----------------------+----------------+--------------------+
 | # | Boundary           | Style                 | Contract owner | Versioning         |
 +---+--------------------+-----------------------+----------------+--------------------+
 | 1 | Agents and apps -> | MCP tools + resources | us             | additive changes;  |
 |   | core               |                       |                | bridge semver      |
 | 2 | Shim -> core       | MCP client on the     | us + MCP spec  | legacy only toward |
 |   |                    | modern era; listen    |                | Claude Code        |
 |   |                    | stream                |                |                    |
 | 3 | Core -> ChatGPT    | MCP Events webhooks   | OpenAI         | follow their spec  |
 |   |                    |                       |                | (S4)               |
 | 4 | Connector <-> core | messages over WSS,    | us: one shared | version at hello;  |
 |   |                    | dialed from home      | TS package     | core accepts N and |
 |   |                    |                       |                | N-1                |
 | 5 | Connector -> Ring  | library call          | Ring, via the  | none: pin the      |
 |   |                    | (ring-client-api)     | library        | version, run a     |
 |   |                    |                       |                | canary             |
 | 6 | Ring official ->   | REST + HMAC webhooks  | Ring           | only if S1 passes  |
 |   | core               |                       |                |                    |
 +---+--------------------+-----------------------+----------------+--------------------+
```

## Auth per boundary (human-confirmed with D1-D6; mechanisms in security-compliance)

```text
 +---+----------------------+-------------------------------------------+---------------+
 | # | Boundary             | Who proves what                           | Mechanism     |
 +---+----------------------+-------------------------------------------+---------------+
 | 1 | Agents and apps ->   | every client presents an OAuth 2.1 bearer | security lens |
 |   | core                 | token (B14); scopes decide what it may    |               |
 |   |                      | call                                      |               |
 | 2 | Shim -> core         | the shim holds a token obtained once and  | security lens |
 |   |                      | refreshed on your PC, because Claude Code |               |
 |   |                      | starts it without a browser               |               |
 | 3 | Core -> ChatGPT      | whatever OpenAI's MCP Events spec         | S4            |
 |   |                      | requires of the sender                    |               |
 | 4 | Connector <-> core   | the connector proves which connector it   | security lens |
 |   |                      | is (one per Ring account, B7); the core   |               |
 |   |                      | proves itself with its TLS certificate    |               |
 | 5 | Connector -> Ring    | Ring refresh token, held only on the      | fixed by Ring |
 |   |                      | connector (B5)                            |               |
 | 6 | Ring official ->     | HMAC signature on webhooks; app           | S1            |
 |   | core                 | credentials for REST                      |               |
 +---+----------------------+-------------------------------------------+---------------+
```

## Decision points D1-D6 (human-confirmed 2026-10-25; D7 human-confirmed 2026-10-25; D8 open)

```text
 +-----+------------------------+-------------------------------------------------------+
 | #   | Decision point         | My proposal                                           |
 +-----+------------------------+-------------------------------------------------------+
 | D1  | Integration style per  | As in the contracts table. For (4): a direct          |
 |     | boundary               | WebSocket over TLS dialed from home (recommended),    |
 |     |                        | not Azure Web PubSub or Relay. Your gate app reaches  |
 |     |                        | the core through Azure in v1; no LAN shortcut. Your   |
 |     |                        | call: does the shim only relay push, or also proxy    |
 |     |                        | the tools (see below)?                                |
 | D2  | Contract owner and     | As in the contracts table. The MCP tool list is the   |
 |     | versioning             | contract; tools change additively, and a tool is      |
 |     |                        | deprecated before it is removed.                      |
 | D3  | Sync, async or         | Tools are synchronous with a 60 s deadline (Foundry   |
 |     | streaming              | cuts off at 100 s), so clip length is capped. Push is |
 |     |                        | async and only a hint: the event log and cursor are   |
 |     |                        | the truth. The link is one duplex stream: events up,  |
 |     |                        | commands down, replies correlated.                    |
 | D4  | Safe, idempotent,      | Reads are safe and cacheable through max_age_s.       |
 |     | cacheable, replayable  | Events are at-least-once with an event_id and replay  |
 |     |                        | from the cursor. Control has two tiers. (a) Arm       |
 |     |                        | Home/Away, lights, siren: two steps with a one-time,  |
 |     |                        | client-bound token (2 min) and a command_id, so a     |
 |     |                        | retry never acts twice; where the client supports     |
 |     |                        | elicitation, the bridge asks you directly instead of  |
 |     |                        | trusting the model. (b) Disarm: you confirm and enter |
 |     |                        | the PIN outside the model, for example through MCP    |
 |     |                        | URL-mode elicitation, where the data never passes     |
 |     |                        | through the client. The contract reserves this path;  |
 |     |                        | the mechanism and client support go to                |
 |     |                        | security-compliance.                                  |
 | D5  | Auth, throttling, API  | Auth per boundary as in the auth table. MCP scopes:   |
 |     | management             | read, media, control. Disarm also needs its config    |
 |     |                        | switch plus PIN and human confirmation (D4b).         |
 |     |                        | Per-client rate limits in the core. Only the          |
 |     |                        | connector calls Ring, through one rate limiter. No    |
 |     |                        | APIM: it handles MCP tools only, not push.            |
 | D6  | Compatibility and      | Both MCP eras; the shim against Claude Code channels; |
 |     | schema tests           | a ChatGPT Events fixture; link contract tests at N    |
 |     |                        | and N-1; the Ring adapter on recorded, scrubbed       |
 |     |                        | fixtures plus a live canary in the pilot.             |
 | D7  | Contract shape and     | Its own turn: co-designed with you once it is on      |
 |     | error envelope         | screen.                                               |
 | D8  | Key sequences          | Its own turn: arm Away (tier a) and disarm (tier b),  |
 |     |                        | walked with you through (1), (4) and (5).             |
 +-----+------------------------+-------------------------------------------------------+
```

**Open option for D1: the channel shim's role (the human's call).**
- **Push-only shim (the agent's lean):** Claude Code keeps tools on its normal remote HTTP connection to the core, and the shim only relays push. The shim stays tiny, and tools keep working if the channels research preview changes. The cost is two connections and two credentials, with confirmations bound to the HTTP client while push arrives through the shim.
- **Tool-proxying shim:** Claude Code talks only to the shim, which forwards tools and push over one connection with one credential. The confirmation stays bound to the same client that receives push. The cost is more shim code, and Claude Code's tools then depend on channels, which need a dev flag.

**Evidence for D4b:** the MCP 2025-11-25 elicitation spec defines URL mode for "sensitive interactions that must *not* pass through the MCP client", and forbids form mode for passwords, API keys, tokens or payment credentials. Which target clients declare `elicitation.url` is unverified (security-compliance).

**Human answer (2026-10-25):** "Looks ok for now, maybe more requirements will come later". Recorded as:
- D1-D6 accepted as proposed, answered all at once.
- Shim: push-only (the agent's lean). The human did not pick between the two shim options explicitly; this was stated back to them and can be changed.
- No other producers or consumers named for now.
- The human expects more requirements later. Additive tool versioning (D2) absorbs them without breaking clients.

**Pacing:** if the human answers D1-D6 in one go, that covers D1-D6 only. D7 (contract shape and error envelope) and D8 (the arm and disarm sequences) get their own turns, because nothing for them is on screen yet.

## D7: contract shape and error envelope (human-confirmed 2026-10-25)

**Human answer (2026-10-25):** "Agree with all, continue". This covers the tool catalog, the reply, error and event shapes, the error codes and the 7 rules as proposed.

**Later changes (all from D8, 2026-10-25):**
- **`RING_REJECTED` added.** It is an additive change, accepted with D8 ("c - no").
- **Rule 7 reopened and kept.** The human's siren observation reopened rule 7. The human then kept the siren out of v1 ("a - no").
- **`-32042` replaced for disarm.** Disarm uses the 2026-07-28 MRTR `input_required` result instead of `-32042`. This follows from the human's answer b; see D8.

### v1 tool catalog

```text
 +-----------------+---------+----------------------------------------------------------+
 | Tool            | Scope   | Returns                                                  |
 +-----------------+---------+----------------------------------------------------------+
 | INQUIRY                                                                              |
 | get_overview    | read    | alarm mode, open contacts, active motion, offline        |
 |                 |         | devices, low batteries, bridge health; one screen, <=    |
 |                 |         | ~8k tokens                                               |
 | list_devices    | read    | id, name (any language), type, room, battery, power      |
 |                 |         | mode, online; filter by kind or room                     |
 | get_device      | read    | full state of one device                                 |
 | get_motion      | read    | motion in the last N minutes, active rooms, occupancy    |
 |                 |         | summary                                                  |
 | get_history     | read    | Ring history for a device or the location, by time range |
 | get_health      | read    | home link, Ring session, push, last event, stale_since   |
 | EVENTS                                                                               |
 | get_events      | read    | events after a cursor, filtered; returns next_cursor     |
 | set_push_filter | read    | which sensors and priorities are pushed to this client   |
 |                 |         | (the lens 1 opt-ins)                                     |
 | MEDIA                                                                                |
 | get_frame       | media   | one JPEG + as_of, age_s, source (forced, cached, event,  |
 |                 |         | live); takes max_age_s and fresh                         |
 | get_burst       | media   | 5-8 frames from one short live session                   |
 | get_clip        | media   | a short clip (of an event, or N s live) as an            |
 |                 |         | authenticated resource link, plus a few key frames for   |
 |                 |         | the model                                                |
 | CONTROL                                                                              |
 | prepare_action  | control | what will happen + a one-time token (2 min). Actions:    |
 |                 |         | arm_home, arm_away, light_on, light_off, disarm (off by  |
 |                 |         | default; tier b)                                         |
 | confirm_action  | control | the result, keyed by command_id; for disarm, the human   |
 |                 |         | channel instead (D4b)                                    |
 +-----------------+---------+----------------------------------------------------------+
```

### Reply, error and event shapes

```text
 Every reply: a one-line text summary + structuredContent that matches its outputSchema
 {
   "as_of":       "2026-10-25T09:12:03Z",          when the data was true (UTC)
   "as_of_local": "2026-10-25T12:12:03+03:00",     location time zone (lens 1)
   "freshness":   "live" | "cached" | "stale",
   "stale_since": "2026-10-25T09:05:40Z",          only when stale (B12)
   "data":        { ...tool-specific... }
 }

 A tool failure: isError: true + structuredContent
 {
   "error": {
     "code":          "RING_UNAVAILABLE",
     "message":       "Ring did not answer; last known state is 3 min old",
     "retryable":     true,
     "retry_after_s": 30,
     "outcome":       "not_done" | "unknown" | "done",      control tools only
     "details":       { ... }
   },
   "as_of": "2026-10-25T09:12:03Z"
 }

 An event (get_events, push, MCP Events, channel)
 {
   "event_id":    "evt_01J...",        dedupe key (at-least-once)
   "seq":         18234,               cursor order, per location
   "priority":    "HIGH" | "MEDIUM" | "LOW",
   "kind":        "doorbell.ding" | "alarm.triggered" | "contact.open" | "motion" |
                  "flood" | "mode.changed" | "battery.low" | "health.home_offline" ...
   "occurred_at": "...", "received_at": "...",       UTC, plus local
   "device":      { "id": "...", "name": "...", "room": "..." },
   "summary":     "Front door opened while armed (Away)",
   "frame":       resource link, only if one was captured (never delays the event)
 }
```

### Error codes

```text
 +----------------------+---------------------------------------+-----------------------+
 | Error code           | When                                  | Retry?                |
 +----------------------+---------------------------------------+-----------------------+
 | INVALID_ARGUMENT     | bad or missing input                  | no                    |
 | NOT_FOUND            | unknown device, camera or event       | no                    |
 | HOME_OFFLINE         | home link down (control and media;    | yes, after            |
 |                      | reads degrade to stale instead)       | retry_after_s         |
 | RING_UNAVAILABLE     | Ring down, slow, or blocking us (406) | yes, with backoff     |
 | RING_REJECTED        | Ring answered but refused the command | no; fix the cause and |
 |                      | (outcome not_done); added in D8       | prepare again         |
 | RATE_LIMITED         | the bridge's own limits, per client   | yes, after            |
 |                      | or toward Ring                        | retry_after_s         |
 | BATTERY_GUARD        | fresh frame on a battery camera over  | no; use the cached    |
 |                      | its hourly cap                        | frame                 |
 | SNAPSHOT_BLOCKED     | Ring refuses snapshots (motion        | later                 |
 |                      | detection off, or recording)          |                       |
 | CONFIRMATION_INVALID | token expired, already used, or from  | no; prepare again     |
 |                      | another client                        |                       |
 | ACTION_DISABLED      | the action is switched off in config  | no                    |
 |                      | (e.g. disarm)                         |                       |
 | HUMAN_DECLINED       | you declined or cancelled the         | no                    |
 |                      | confirmation                          |                       |
 | TIMEOUT              | the 60 s deadline passed; for         | read: yes; control:   |
 |                      | control, outcome is "unknown"         | check state first     |
 | INTERNAL             | a bug in the bridge                   | no                    |
 +----------------------+---------------------------------------+-----------------------+
```

Protocol-level errors are not tool errors. They cover:
- a malformed request or an unknown tool (JSON-RPC errors);
- 401/403 with `WWW-Authenticate` (MCP authorization);
- for disarm, an MRTR `InputRequiredResult` (`resultType: "input_required"`) carrying a URL-mode elicitation, on the 2026-07-28 era only.
  - It is not an error.
  - The legacy `-32042` path is not used, per the human's answer b in D8.

### Rules

1. Reads never fail only because home is offline. They return the last known state with freshness "stale" (B12).
2. A control call that times out is never retried automatically. Its outcome is "unknown", and the agent checks state first.
3. Input schemas are flat, with enums and optional fields. There is no `anyOf` and no nullable union (IN7).
4. Images are inline MCP image content (JPEG, <= 1280 px). Clips are resource links read with the same OAuth token. There are no public or pre-signed URLs.
   - Which clients can play an MP4 resource is unverified; the key frames ensure the model always sees something.
5. Ring strings (names, event text) are marked as untrusted data in the schemas and tool descriptions (B13).
6. Tier a confirmation depends on the client:
   - with elicitation, `prepare_action` asks the human directly and returns the result;
   - without it, the agent must show the human the summary and then call `confirm_action`.
7. The siren is left out of v1 actions. The D4 wording mentioned it, but the MVP control list is arm Home/Away and floodlight on/off. Adding it later is a new enum value, which is additive.
   - Reopened 2026-10-25 by the human's observation (see the D8 section). The amendment is proposed and not yet confirmed.

## D8: key sequences (human-confirmed 2026-10-25)

**Human answer (2026-10-25):** "a - no / b - We can skip disarm for now for client that do not support MTTR (the new way to do elicitation) / c - no". Recorded as:
- (a) Siren: the amendment is declined, and D7 rule 7 stands, so the siren stays out of v1.
- (b) Disarm only from clients that support MRTR. The human wrote "MTTR"; this is read as MRTR (Multi Round-Trip Requests), the 2026-07-28 way to do elicitation.
  - Those clients must also declare `elicitation.url`.
  - Every other client gets `ACTION_DISABLED`.
  - The disarm sequence below was revised to the MRTR flow. It was shown to the human with the lens summary.
- (c) No changes to the arm or disarm sequences.

**Evidence (MCP 2026-07-28):**
- MRTR replaces server-initiated requests. The server returns `InputRequiredResult` with `inputRequests` and `requestState`, and the client retries the original call with `inputResponses`.
- `notifications/elicitation/complete` and `elicitationId` are removed. The client learns the outcome by retrying.
- For URL mode, `accept` means only that the user consented to open the URL.
- The server MUST verify that the user who opens the URL is the same user who started the request. The URL MUST NOT be pre-authenticated.
- `requestState` is attacker-controlled input. It needs integrity protection, and single use is enforced server-side.
- Sources: modelcontextprotocol.io/specification/2026-07-28/basic/patterns/mrtr, .../client/elicitation, .../changelog.

### Arm Away (tier a), from a client without elicitation

```text
 ARM AWAY (tier a), from a client without elicitation: the agent relays the question

 HUMAN       AGENT            CORE (Azure)            CONNECTOR (home)      RING
   |           |                   |                         |                 |
 1 |--"arm---->|                   |                         |                 |
   |   away"   |                   |                         |                 |
 2 |           |--prepare_action-->| (1)                     |                 |
 3 |           |<--summary, token--|                         |                 |
 4 |<--shows---|                   |                         |                 |
   |  summary  |                   |                         |                 |
 5 |--"yes"--->|                   |                         |                 |
 6 |           |--confirm_action-->| (1)                     |                 |
 7 |           |                   |--cmd------------------->| (4)             |
 8 |           |                   |                         |--setAlarmMode-->| (5)
 9 |           |                   |                         |<--accepted------|
10 |           |                   |<--result----------------|                 |
11 |           |<--done, mode------|                         |                 |
12 |<--"armed  |                   |--event mode.changed, to every client      |
   |   Away"   |                   |                         |                 |
```

```text
 +----+------------+---------------------------------------------------------------------+
 | #  | Where      | What is checked or recorded                                         |
 +----+------------+---------------------------------------------------------------------+
 | 2  | core       | control scope; per-client rate limit; home link up (else            |
 |    |            | HOME_OFFLINE, not_done). Already Away: "no change", no token.       |
 | 3  | core       | the Safety engine reads live state and builds the plan: the action, |
 |    |            | the open contacts it will bypass, the exit delay. The summary says  |
 |    |            | plainly: after the exit delay, any contact that opens (a door, or a |
 |    |            | shutter moved by another system) sounds the alarm; monitoring: on,  |
 |    |            | off or unknown (whether Ring exposes it is a pilot check). Token:   |
 |    |            | one-time, this client only, 2 min, bound to this exact plan.        |
 |    |            | Audit: requested.                                                   |
 | 6  | core       | token unused, same client, not expired; marked used at once. State  |
 |    |            | is read again: if the plan changed (another door opened), the call  |
 |    |            | fails CONFIRMATION_INVALID, "prepare again". Audit: confirmed.      |
 | 7  | core->home | cmd {command_id, action, bypass list, deadline_at}, sent once. Link |
 |    |            | down: HOME_OFFLINE, outcome not_done.                               |
 | 8  | connector  | a cmd past its deadline is dropped (not_done); a command_id already |
 |    |            | seen returns the stored result and never calls Ring twice; only     |
 |    |            | allowlisted actions run.                                            |
 | 9  | Ring       | accepts, or refuses: new code RING_REJECTED, outcome not_done       |
 | 10 | home->core | result {command_id, outcome, mode, as_of}. Audit: done or failed.   |
 | 11 | core       | no result within the 60 s deadline: TIMEOUT, outcome unknown, never |
 |    |            | retried; a late result still reaches the audit and the event.       |
 +----+------------+---------------------------------------------------------------------+
```

**The same sequence from a client with elicitation (D7 rule 6):**
- In form mode, the bridge asks the human to accept or decline. This replaces steps 3-6.
- The form carries the same summary and no secret.
- On accept, `prepare_action` returns the result itself, and no `confirm_action` call follows.
- On decline, the reply is `HUMAN_DECLINED` and nothing is sent home.
- How elicitation works on each protocol era, and which clients support it, is checked in security-compliance. The contract does not change.

### Disarm (tier b), revised for MRTR after the human's answer b

```text
 DISARM (tier b): only from a client that speaks 2026-07-28 (MRTR) and declares URL
 elicitation. The PIN never passes through the client or the model.

 HUMAN       CLIENT           CORE (Azure)            CONNECTOR (home)      RING
   |           |                   |                         |                 |
 1 |--"disarm">|                   |                         |                 |
 2 |           |--prepare_action-->| (1) action: disarm      |                 |
 3 |           |<--input_required--| URL elicitation and a   |                 |
   |           |                   | sealed requestState     |                 |
 4 |<--the client shows the full URL and asks consent (not the model)          |
 5 |--yes----->|--retry + accept-->| waits up to 60 s        |                 |
 6 |--page: sign in, PIN, ok------>| HTTPS, outside MCP      |                 |
 7 |           |                   |--cmd------------------->| (4)             |
 8 |           |                   |                         |--setAlarmMode-->| (5)
 9 |           |                   |                         |<--accepted------|
10 |           |                   |<--result----------------|                 |
11 |<--page: "Disarmed"------------|                         |                 |
12 |           |<--done------------| retried call returns    |                 |
   |           |                   |--event mode.changed, to every client      |
```

```text
 +----+------------+---------------------------------------------------------------------+
 | #  | Where      | What is checked or recorded                                         |
 +----+------------+---------------------------------------------------------------------+
 | 2  | core       | disarm enabled in config (default off), else ACTION_DISABLED. The   |
 |    |            | client must speak 2026-07-28 (MRTR) and declare elicitation.url;    |
 |    |            | otherwise ACTION_DISABLED, reason "this client cannot confirm a     |
 |    |            | disarm" (your decision: no disarm there for now)                    |
 | 3  | core       | a pending disarm kept in the core: command_id, your identity (OAuth |
 |    |            | sub) and client, used once, expires in 2 min. requestState is       |
 |    |            | sealed (AEAD) and points to it. No token comes back, so the model   |
 |    |            | has nothing to confirm with. The URL holds no secret and is not     |
 |    |            | pre-signed. Audit: requested.                                       |
 | 4  | client     | the spec requires it to show the full URL and its domain, ask       |
 |    |            | consent, and open it where neither the client nor the model can     |
 |    |            | read the page                                                       |
 | 5  | core       | "accept" only means you agreed to open the page. The retried call   |
 |    |            | waits up to 60 s; if you are not done yet, it answers               |
 |    |            | input_required again and the client retries, until the 2 min expiry |
 | 6  | core       | the page signs you in and checks you are the same person who asked  |
 |    |            | (a MUST in the spec, against phishing; how: security-compliance).   |
 |    |            | It shows who asked, when, and the mode. The PIN is checked against  |
 |    |            | a stored hash; N wrong PINs: lockout plus a HIGH event. Audit:      |
 |    |            | confirmed or failed.                                                |
 | 7  | as arm     | steps 7-10 follow the same command_id, deadline, once-only and      |
 |    |            | audit rules                                                         |
 | 12 | core       | the retried call returns the result; mode.changed goes to every     |
 |    |            | client                                                              |
 +----+------------+---------------------------------------------------------------------+
```

### Rules surfaced by walking the sequences

1. **Commands reach home at most once; events at least once.** The core sends a `cmd` once and never re-sends it after a link drop. The connector runs each `command_id` at most once and reports late results when the link reconnects.
2. **The token binds the plan, not only the action.** If the state changes between prepare and confirm, the confirm fails and the agent prepares again.
3. **The arm summary states the consequence** (from the human's siren observation): after the exit delay, any contact that opens sounds the alarm. That includes a shutter moved by another system the bridge cannot see. The summary also shows whether monitoring is on, off or unknown.
4. **New error code `RING_REJECTED`** (added to the D7 table; additive).
5. **Decided by the human (answer b):** on a client without MRTR and `elicitation.url`, disarm is refused for now with `ACTION_DISABLED` and the reason "this client cannot confirm a disarm".
   - The URL-as-text alternative was not chosen.
   - Tier a still works on every client: through elicitation where the client supports it (MRTR on 2026-07-28, server-initiated on the legacy era), and through the two-step `confirm_action` otherwise.

### Siren: the human's observation and the amendment (declined)

**Human (2026-10-25, during D8):** "Even now it is very easy to trigger a siren for the home alarm. I can just arm the alarm and raise a shutter from remote."

**How the agent reads it:** leaving the siren out of v1 protects little. Once the alarm is armed, any remote actuator (a shutter, the gate, another MCP server the agent holds) can sound it by opening a contact. Because of this, the arm path carries the real risk, and the arm summary now says so (rule 3 above).

**Proposed amendment (declined by the human, "a - no"; D7 rule 7 stands):**

```text
 +---------------------------+------+--------------------------------------------------+
 | Siren action              | Tier | Why                                              |
 +---------------------------+------+--------------------------------------------------+
 | siren_on, Alarm base      | a    | arming plus an opened contact already sounds it, |
 | station                   |      | so leaving it out protects little. Enabled only  |
 |                           |      | after the pilot shows it does not alert the      |
 |                           |      | monitoring center (lens 1: never dispatch)       |
 | siren_off, Alarm base     | a    | stops a siren the bridge started                 |
 | station, no alarm         |      |                                                  |
 | siren_off, Alarm base     | b    | silencing a real alarm helps an intruder, so it  |
 | station, alarm triggered  |      | is handled like disarm: PIN, outside the model   |
 | siren_on / siren_off,     | a    | a local deterrent ("sound the gate camera");     |
 | camera with a siren       |      | it stays at the camera and calls no one          |
 +---------------------------+------+--------------------------------------------------+
```

Because the amendment was declined, the v1 control list is unchanged, and nothing changes in architecture-core or product-domain. The arm-summary rule (rule 3 above) is kept as part of D8.

**Pilot checks:**
- whether ring-client-api exposes the monitoring state, for the arm summary;
- what Ring does when arming with open contacts: refuse, or bypass.

## Lens summary (human-confirmed 2026-10-25: "move on")

```text
 +-----+-------------------------+-----------------------------------------------------+
 | #   | Decision                | Outcome                                             |
 +-----+-------------------------+-----------------------------------------------------+
 | D1  | Style per boundary      | MCP tools + resources; direct WSS dialed from home; |
 |     |                         | the gate app goes through Azure; shim push-only     |
 | D2  | Contract and versioning | the MCP tool list is the contract; additive only;   |
 |     |                         | link versioned at hello, core accepts N and N-1     |
 | D3  | Sync / async            | tools synchronous, 60 s deadline; push is a hint,   |
 |     |                         | the event log and cursor are the truth              |
 | D4  | Idempotency and safety  | events at least once; commands at most once; tier a |
 |     |                         | two-step or elicitation; tier b disarm outside the  |
 |     |                         | model, only on MRTR clients with URL elicitation    |
 | D5  | Auth and throttling     | scopes read, media, control; per-client limits;     |
 |     |                         | only the connector calls Ring; no APIM              |
 | D6  | Compatibility tests     | both MCP eras, shim, ChatGPT fixture, link N/N-1,   |
 |     |                         | Ring fixtures plus a live canary                    |
 | D7  | Contract shape          | 13 tools; reply, error and event envelopes; 13      |
 |     |                         | error codes (RING_REJECTED added); 7 rules; siren   |
 |     |                         | stays out of v1                                     |
 | D8  | Key sequences           | arm Away and disarm as walked; the token binds the  |
 |     |                         | plan; the arm summary states the consequence        |
 +-----+-------------------------+-----------------------------------------------------+
```

**Carried to security-compliance:**
- the auth mechanism for each boundary (1)-(6);
- confirmation binding to the OAuth `sub` and client, because 2026-07-28 has no sessions;
- the confirm page:
  - sign-in and the same-user check (a MUST);
  - PIN storage, the lockout count N, and the HIGH alarm on lockout;
- the key that seals `requestState`;
- the connector's identity, and the Ring refresh token at rest;
- which target clients support MRTR and `elicitation.url`.

## Amendments from later lenses

- **2026-10-26, observability-resilience (human-confirmed):** new error code `BRIDGE_UNAVAILABLE` (a core dependency such as the database or Blob is down; retryable with retry_after_s), additive under D2. When the database is down, reads fail with it rather than degrading to stale (stale stays for the home link). Events recovered by the history catch-up carry `late: true` (additive). See `observability-resilience.md`.
- **2026-10-26, devops-operations (human-confirmed):** a read-only gate-status tool is added to the catalog (additive under D2), sourced from the FliessGateControl function; name, shape and caching are set in component-design. See `devops-operations.md`.
- **2026-10-28, component-design (human-confirmed):** the gate-status tool is withdrawn before it was named; there is no `GATE_UNAVAILABLE` code. The catalog stays the D7 tools plus the other additive amendments. See `component-design.md`.
- **2026-10-29, component-design A4 (human-confirmed):** a new event kind `bridge.events_recovered` (additive under D2; D7's kind list is open), carrying the count, the oldest and newest times, the seq range, and the highest priority among the late events. `late: true` now also marks events held at home more than 2 minutes (the outbox case), not only those from the history catch-up. Late events are not pushed one by one. See `component-design.md`.
