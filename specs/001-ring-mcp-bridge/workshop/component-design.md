# Component Design — Ring MCP Bridge

**Depth**: Full.
**Status**: CLOSED 2026-10-29. The human said "move on" after the lens summary. Confirmation: human-confirmed, scope lens-question, per decision point (C1-C8 through the map accepted in CD1, as the summary states). Opened 2026-10-28. Decided by the human on 2026-10-28: A3 (option (a), the bridge stays Ring-only), CD1 (map v2, with Lease and Secrets kept separate), CD2 (the call rules, with X1 and X2), CD3 (ten seams, including the simulated home), CD4 (the DTO rule, Q1 (a) the Public Contract, Q2 (c) per-component brands), CD5 (composition at start, policy as data, no plugins) and A1 (a: write rights on two secrets only). Decided on 2026-10-29: A2 (a: the PIN tries and the lock in the database) and A4 (a: late events stored and readable, one summary push). All decision points are decided (C1-C8 through the map accepted in CD1, not asked one by one; C9 by A4; C10 by A3).
**Inputs**:
- `architecture-core.md`: IDesign (binding), the building-block map, call rules and volatilities (human-confirmed 2026-10-24); topology H plus mode A.
- Carry-forwards from `security-compliance.md` (issuer, auto-off timer, last-read mark), `data-storage.md` (owners of commands, tokens and the pending disarm; the issuer's storage), `observability-resilience.md` (health, lease, Ring circuit, catch-up, late events), `devops-operations.md` (Gate Access, gate status, lease, health) and `ui-ux.md` (the two pages).

## Carried in

- **The lens-2 map** (human-confirmed 2026-10-24):
  - clients: MCP endpoint, Channel shim, Connector link, Scheduler;
  - managers: Inquiry, Control, Media, Event;
  - engines: Summary, Safety, Capture, Classify;
  - resource access: Ring, State, Event Log, Audit, Media Cache, Subscriptions, Delivery;
  - utilities: Security, Logging, Pub/Sub, Config, Clock and time zones;
  - home connector: Setup CLI, Ring adapter, Capture, Outbox + link.
- **Call rules:** clients call managers; managers call engines and resource access; a manager never calls a manager except by a queued call through Pub/Sub.
- **Cost:** this lens is structure only. It adds no Azure cost.

## Decision points CD1-CD5 (from the lens; 2026-10-28, proposals awaiting the human)

- **CD1 What belongs together, and what stays separate.**
  - The map below. Each component hides one thing that changes.
  - New since lens 2: one manager (Admin), one engine (Health), five resource accessors (six at lens open; Gate dropped with A3), three core clients, two utilities, and the connector's insides.
  - Thin ones that could merge: Lease (into State), and Secrets (it goes away if A1 picks the runbook).
- **CD2 Which way dependencies point.**
  - Clients call managers. Managers call engines and resource access. Engines stay pure in practice. No manager calls a manager except by a queued call through Pub/Sub. Utilities are called from any layer.
  - Two exceptions for the human to approve:
    1. The Issuer library calls its storage (Grants) directly from the client layer, because node-oidc-provider owns that call.
    2. The WSS session is a shared utility (Link transport), used by a client (Connector Link) and a resource accessor (Ring Access).
- **CD3 The right abstraction.**
  - One package, two modes.
  - An interface only where something really varies:
    - Ring Access: link, in-process, later official;
    - Delivery: one adapter per platform;
    - Media Cache: Blob or a folder;
    - Audit: with or without WORM;
    - Secrets: Key Vault or a file;
    - Query layer: SQLite or T-SQL.
  - Everything else is a plain module with no interface.
- **CD4 Schemas kept apart from internal models.** Each mapping gets a contract test.
  - The MCP tool schemas are the contract (D2), mapped from internal models at the MCP Endpoint.
  - Link messages are versioned (N, N-1).
  - Ring payloads are mapped at the edge, in Normalize.
  - Rows are mapped inside each accessor.
- **CD5 Extension mechanism.** Composition and configuration:
  - policy is data inside the engines;
  - the Host picks the adapters at start (the DI container is code-implementation's choice, P8);
  - Pub/Sub carries the queued calls between managers;
  - no plugins and no inheritance trees.

## The proposed component map at lens open (v1; superseded by v2 below)

```text
 PROPOSED COMPONENT MAP (IDesign; each layer calls only the layers below it)
 * = new since the lens-2 map

 AGENTS: ChatGPT + dot, Claude surfaces   CHANNEL SHIM (your PC)   YOU (phone or PC)
            | HTTPS, our tokens                  | HTTPS                  | HTTPS
 ===========v============= AZURE CORE (one instance, B7) v========================v=====
 CLIENTS    [MCP Endpoint]  [Issuer]*  [Web: pages, clip links]*  [Connector Link]
            [Scheduler]  [Host: wiring, lease, /livez, /readyz]*
                 |  clients call managers only
 MANAGERS   [Inquiry]   [Control]   [Media]   [Event]   [Admin]*
                 |  a manager never calls a manager; queued calls go through Pub/Sub
 ENGINES    [Summary]   [Safety]    [Capture] [Classify] [Health]*
                 |  engines are rules only; managers call engines and resource access
 RESOURCE   [Ring Access] [State] [Event Log] [Subscriptions] [Delivery] [Media Cache]
 ACCESS     [Audit] [Command]* [Settings]* [Grants]* [Lease]* [Gate]* [Secrets]*
                 |
 RESOURCES  home link   Azure SQL   Blob (media, WORM)   Key Vault   agents' push
            endpoints   FliessGateControl function   Entra ID (your sign-in)
 UTILITIES  Security | Logging | Pub/Sub | Config | Clock | Link transport*
            | Query layer*   (any layer may call a utility)
 =======================================^===============================================
                                        | WSS, dialed out from home (no open ports)
 ====================== HOME CONNECTOR (Docker on the Ubuntu VM) ========================
 CLIENTS    [Setup CLI]   [Core Link]   [Push Listener]   [Home Scheduler]
 MANAGERS   [Execute]: commands, captures, auto-off    [Ingest]: events, outbox, catch-up
 ENGINES    [Normalize]: Ring payloads -> the bridge's event shape
 RESOURCE   [Ring Adapter]: limiter, circuit   [Live Media]   [Outbox Store]
 ACCESS     [Secrets File]
 RESOURCES  Ring cloud (REST, alarm websocket, push, live view)   SQLite   encrypted file
 Mode A (all at home): the same components in one process; Ring Access calls Execute
 directly, and the link, Connector Link and Core Link are not used.
```

## Every component and its job at lens open (v1; superseded by v2 below)

**Clients (core; entry points, no business logic):**
- **MCP Endpoint** (carried): the MCP server for both protocol eras. It checks our access token and scopes (through Security) and turns each tool call into one manager call.
- **Issuer** (NEW, from SC1 option B): node-oidc-provider under `/oauth`. It handles CIMD and DCR for listed agents only, your Entra sign-in, and issuing, refreshing and revoking tokens. It asks Admin for policy (is this agent listed, which scopes) and stores through Grants.
- **Web** (NEW, from lens 8): the admin page, the confirm page and the authenticated clip links. Server-rendered with the CSS tokens; calls Admin, Inquiry, Control and Media.
- **Connector Link** (carried): receives events and heartbeats from home and queues them to Event. It checks the connector's signed hello through Admin.
- **Scheduler** (carried): the ticks. Heartbeat check every minute, purges, the battery digest, token expiry, WORM shipping.
- **Host** (NEW, from the lens-6 lease amendment): the composition root. It wires the parts for mode H or A and holds the B7 lease through Lease: acquire before ready, renew every 15 s, fail closed. It serves `/livez` and `/readyz`.
- Outside the core: **Channel shim** (carried). It runs on your PC as a client of the MCP Endpoint and relays push to Claude Code.

**Managers (use-case sequences; never call each other except by a queued call through Pub/Sub):**
- **Inquiry** (CHANGED: adds get_events and get_gate_status): every read tool:
  - overview, devices, motion, history and health;
  - events after a cursor, or after the client's last-read mark;
  - gate status.
- **Control** (CHANGED: siren and chime removed, lights auto-off added, audit purge moved to Admin):
  - arm Home and Away, lights (with auto-off), disarm;
  - prepare, then confirm, at most once, lease checked, audited;
  - expires tokens and pending disarms.
- **Media** (CHANGED: the live viewer only as the O1 stretch): frame, burst and clip.
  - Capture picks the source; Media Cache keeps the result; Web serves the links.
  - Takes the post-event frame, queued from Event.
- **Event** (CHANGED: late events, health transitions, push filters):
  - ingest in one transaction: dedupe, seq, append, state, audit link;
  - classify, then fan out through Delivery;
  - applies Health on each heartbeat and tick, and raises HIGH health events;
  - set_push_filter.
- **Admin** (NEW): your use cases from the admin page:
  - agents and revoke (one or all), connector enrollment, switches, owners' agreements;
  - the PIN, delete-now, the audit view;
  - the Issuer's policy;
  - audit shipping to WORM, the chain check, and the purge that keeps the anchor.

**Engines (rules that change; policy as data; no I/O):**
- **Summary** (carried): token-budgeted replies per tool (overview at about 8k tokens or less).
- **Safety** (CHANGED: the PIN lockout and the fresh sign-in check made explicit):
  - one-time tokens bound to the client and the plan (2 min);
  - the disarm gate: the switch, and MRTR with URL elicitation;
  - the PIN check: 5 tries, then a 15-minute lock;
  - a sign-in under 5 minutes old for risky admin actions.
- **Capture** (carried): wired snapshot, live frame or cached; the battery cap per hour; max_age_s.
- **Classify** (CHANGED: the late-event rule, A4): priority, motion policy and opt-ins, the battery threshold, and what happens to late events.
- **Health** (NEW): turns the heartbeat, last event, database, lease and WORM lag into one health view. Its thresholds (2 min stale, 10 min out of band) are data, tuned in the pilot.

**Resource access (one per resource; each owns its own tables):**
- **Ring Access** (carried): the only way to Ring.
  - Commands and captures go over the link (mode H) or as a direct call to Execute (mode A).
  - It correlates replies, with a 60 s deadline.
  - Later the official adapter, if S1 passes.
- **State** (carried): locations, devices, alarm state and the health snapshot, each value with its `as_of`.
- **Event Log** (carried): events per location by seq, the epoch, dedupe on event_id.
- **Subscriptions** (CHANGED: the last-read mark): cursors, push filters and each client's last-read mark.
- **Delivery** (carried): push to ChatGPT Events webhooks, listen streams and the channel shim; one adapter per platform.
- **Media Cache** (carried): frames and clips in Blob (a folder in mode A) for 7 days; blob first, then its row.
- **Audit** (CHANGED: WORM shipping lives here): the hash chain, the database copy, shipping to WORM (none in mode A), the anchor on purge.
- **Command** (NEW; answers the owner DS2 left open): commands by command_id, used token ids, the pending disarm, PIN tries and the lock (A2).
- **Settings** (NEW; the stored part of the old Config utility): your switches, listed agents, owners' agreements, the connector's enrolled key, the auto-off default. Every change is audited.
- **Grants** (NEW): the Issuer's storage adapter: clients, grants, hashed refresh tokens.
- **Lease** (NEW): the B7 lease row. Renewed every 15 s, expires after 45 s; the same code on SQLite in mode A.
- **Gate** (NEW): reads the gate state from FliessGateControl with the function key, maps it, and caches it for 60 s (A3).
- **Secrets** (NEW): Key Vault in Azure, the encrypted file in mode A. Reads at start; one write, the PIN hash (A1).

**Utilities (any layer):**
- **Security** (carried): checks our tokens and scopes; the Entra sign-in client (`prompt=login` for the confirm page); client identity.
- **Logging** (carried): JSON lines with IDs only; redacts tokens, PINs, keys and device names.
- **Pub/Sub** (carried): an in-process queue for the queued calls between managers.
- **Config** (CHANGED: start-up settings only): environment settings and Key Vault references, loaded at start.
- **Clock and time zones** (carried): UTC plus the location's time zone.
- **Link transport** (NEW): the WSS session both ends share: hello at version N or N-1, the signed challenge, heartbeats, framing. Used by Connector Link, Ring Access and Core Link.
- **Query layer** (NEW, from DS3): one query API with SQLite and T-SQL dialects, plus the migrations.

**Home connector (same codebase, connector mode):**
- **Setup CLI** (carried): you log in to Ring and do the 2FA here. It makes the connector key and shows the enrollment code.
- **Core Link** (CHANGED: was "Outbox + link"): dials out to the core, receives commands, sends events and the 15 s heartbeat.
- **Push Listener** (NEW; split out of the old Ring adapter): Ring push into Ingest.
- **Home Scheduler** (NEW): heartbeat every 15 s, resend after 10 s, due auto-off timers.
- **Ingest** (NEW): normalize, write to the outbox, send. After a gap, one Ring history read per location (up to 24 h), marked late.
- **Execute** (NEW): runs each command once per command_id; captures; the auto-off timers that restore the previous state.
- **Normalize** (NEW): Ring payloads to the bridge's event shape; marks Ring strings untrusted.
- **Ring Adapter** (carried): ring-client-api for REST, the alarm websocket and history. It holds the shared limiter and the circuit (open after 5 failures, one probe a minute).
- **Live Media** (carried as the home "Capture"; renamed so there are not two Captures): werift live view and ffmpeg for frame, burst and short clip.
- **Outbox Store** (CHANGED: also timers and command_ids): SQLite for the outbox, executed command_ids, auto-off timers and the catch-up mark.
- **Secrets File** (carried, SC4): encrypted. Holds the Ring token, push credentials, device ID and connector key.

## Key flows (proposal)

```text
 KEY FLOW 1: someone presses the doorbell (a HIGH event)

 HOME   Ring push -> Push Listener -> Ingest -> Normalize -> Outbox Store (durable)
        -> Core Link ==WSS==>
 CORE   Connector Link -> Event (queued) -> Classify: doorbell = HIGH
        -> ONE transaction: Event Log (dedupe on event_id, next seq) + State + Audit
        -> ack home (Outbox Store clears the row)
        -> Delivery: ChatGPT webhook, listen streams, channel shim   (<= 0.5 s p95)
        -> Pub/Sub, queued: Media -> Capture picks the source -> Ring Access -> home
           -> Live Media or Ring's own snapshot -> Media Cache -> the event gets a
           frame link. The frame never delays the push.

 KEY FLOW 2: "turn on the yard light for 3 minutes" (lights with auto-off)

 CORE   prepare_action(light_on, auto_off 180 s) -> MCP Endpoint -> Control
        -> Safety: scope control, switch on, plan summary, one-time token (2 min)
        confirm_action(token) -> MCP Endpoint -> Control -> lease held? (Host)
        -> Safety: token valid, same client, same plan
        -> Command: mark the token used + store command_id (one row; at most once)
        -> Ring Access ==WSS==>
 HOME   Execute: command_id new? -> Ring Adapter: light on (previous state: off)
        -> Outbox Store: timer row "off at 14:05, restore off"
 CORE   <== reply -> Control -> Audit -> agent: "on until 14:05"
 HOME   14:05 Home Scheduler -> Execute -> Ring Adapter: back to off (unless someone
        changed the light meanwhile) -> Ingest: event light.auto_off -> core -> Audit
        The timer lives at home, so it fires even if the core or the link is down.
```

## What earlier lenses left for this lens (C1-C10, proposals)

```text
 +------+--------------------------+----------------------------------------------------+
 | #    | Left by an earlier lens  | Proposal                                           |
 +------+--------------------------+----------------------------------------------------+
 | C1   | The issuer component     | Issuer, a core client running node-oidc-provider;  |
 |      | (SC1, option B)          | its policy comes from Admin; its storage is Grants |
 | C2   | The issuer's storage     | Grants, on the query layer (SQLite and T-SQL)      |
 |      | adapter (DS3)            |                                                    |
 | C3   | Who owns the light       | the connector: Execute sets it, Outbox Store keeps |
 |      | auto-off timer (SC3)     | it; it fires even if the core or the link is down, |
 |      |                          | and survives a connector restart                   |
 | C4   | A last-read mark per     | yes: Subscriptions keeps it; get_events without a  |
 |      | client, for dots (SC1)   | cursor returns what is new since that client's     |
 |      |                          | mark                                               |
 | C5   | Who owns commands, used  | Command, used only by Control                      |
 |      | tokens and the pending   |                                                    |
 |      | disarm (DS2)             |                                                    |
 | C6   | Who owns the lease (OR   | Host holds it through Lease; Control and /readyz   |
 |      | amendment)               | check it; no lease means no control (fail closed)  |
 | C7   | Who computes health (OR) | the Health engine (thresholds as data); Event      |
 |      |                          | applies it on each heartbeat and minute tick;      |
 |      |                          | Inquiry serves get_health and the admin page's     |
 |      |                          | panel                                              |
 | C8   | The Ring circuit and the | the connector's Ring Adapter (shared limiter,      |
 |      | history catch-up (OR5)   | circuit) and Ingest (after a gap, one history read |
 |      |                          | per location, marked late)                         |
 | C9   | Where late events enter  | Connector Link, then Event, like any event;        |
 |      | (OR5)                    | whether they are pushed is question A4             |
 | C10  | The gate source, caching | Gate reads the stored state (GetStateFromTable),   |
 |      | and as_of (DO1)          | caches it 60 s, as_of = its LastUpdated; the tool  |
 |      |                          | is question A3                                     |
 +------+--------------------------+----------------------------------------------------+
```

## Changes to closed lenses that need the human's yes (A1-A4)

If the human agrees, each one is also recorded in that lens's "Amendments from later lenses" section.

- **A1 Changing the PIN (DO6, SC4).** DO6 gave the core read-only rights on Key Vault, so the admin page cannot write a new PIN hash. Options:
  - (a) Give the core write rights on that one secret only, as a role on a single secret (to verify at plan). This is the agent's lean, because lens 8 put "change the PIN" on the admin page.
  - (b) Change the PIN only with a runbook command on the human's PC, with a link from the admin page. Secrets then needs no write and can fold into Config.
  - Either way: $0.
- **A2 The PIN lock survives a restart (DS1).** DS1 keeps counters in memory, so a restart would reset the 15-minute lock.
  - Proposal: keep PIN tries and the lock in the database (Command). Rate limits stay in memory.
  - $0.
- **A3 The gate tool (D7, additive under D2).** `get_gate_status` (scope read) returns:
  - the states, as a list (the function's state can combine, for example Open and People);
  - last_changed, sensor_working, and `as_of` (the function's LastUpdated).

  How Gate reads it:
  - It reads GetStateFromTable, the state the function's 5-minute timer stores. It makes no live Custom Vision call. It caches the result for 60 s.
  - The reply is stale when LastUpdated is more than 6 minutes old (the function's own health rule) or the sensor is not working.
  - "No state yet" (a 200 with plain text) and the function's 400 errors count as unavailable, not as bad input.
  - If the function is down, the reply gives the last known state, marked stale. With nothing cached, a new error code, `GATE_UNAVAILABLE` (retryable).
  - Live prediction (GetGateStatus) stays off in v1; a frame from the gate camera is the fresh view.

  Cost: no new Azure cost on the bridge side. It adds a few HTTP calls a day to the human's function.
- **A4 Late events (the lens 1 priority rules, OR5).** Events recovered by the history catch-up can be hours old. Options:
  - (a) Store them and show them by cursor, but never push them as HIGH. Send one push instead: "N missed events recovered, oldest at 02:10". This is the agent's lean, because a doorbell press from 3 hours ago, pushed as HIGH, misleads.
  - (b) Push them like live events, marked late.
  - $0.

## The human's question on the gate (2026-10-28)

Verbatim:

> get_gate_status: do we just want to get the gate last picture from the two ring cameras that sees it? and the actual ML/AI based state will be done like today? or do we want to have some sort of analytics in the MCP? I mean I want to make it an Open SOurce general project, and the gate is a special case on my premises. So analytics that can answer multiple different queries is different then a specific gate case.

**The agent's reading:** the human questions A3, which would put a gate-specific tool into a general open-source bridge. A3 is on hold until the human picks.

**Options (proposal, awaiting the human):**
- **(a) The bridge stays Ring-only. This is the agent's lean.**
  - Agents get the gate pictures with the generic `get_frame` from the two Ring cameras that see it.
  - The ML gate state keeps running in FliessGateControl, as today.
  - If agents should also ask that state, FliessGateControl gets its own small MCP server later, as a separate project, and the agent combines the two servers. MCP is designed for this kind of composition.
  - Cost: $0, and less code.
  - This reverses the lens-7 gate amendment:
    - G1 goes back to frames only;
    - `get_gate_status`, `GATE_UNAVAILABLE`, the Gate accessor and the function key in Key Vault all drop;
    - resource access goes from 13 to 12.
- **(b) A3 as proposed: a gate tool inside the bridge.**
  - Cost: $0.
  - It ties an open-source project to one home's Azure Function.
- **(c) A generic "external status" source in the bridge.**
  - The owner configures named HTTP endpoints (URL, key, JSON mapping), and one tool reads them.
  - Cost: $0 in Azure.
  - It turns the bridge into a general HTTP proxy. It adds secret handling and the risk of the bridge being steered into calling unintended addresses, and none of it is Ring.
- **(d) Generic vision analytics in the bridge.**
  - It would answer any question about camera images, or watch them continuously.
  - The agents are multimodal and already answer arbitrary visual questions from frames, so this would duplicate them.
  - Each analysed image costs a vision API call (unpriced; to be priced if chosen).
  - Continuous watching is the rules engine that lens 1 kept out of v1.
  - Proposed instead: record a seam for later. An optional analyser on the post-event frame could add tags to the event; it goes on the out-of-scope list as "later".

**Generic analytics the bridge already has, at no cost:**
- the bridge passes on Ring's own detection labels: person versus other motion, as used in lens 1;
- vehicle and package labels too, where the human's Ring plan provides them (assumed; to check in the pilot).

**Diagram for option (a):**

```text
 OPTION (a): THE BRIDGE STAYS RING-ONLY; THE AGENT COMBINES TWO SOURCES

                       +--------------------------------+
                       | Agent (ChatGPT, dot, Claude)   |
                       | "Is the gate open?"            |
                       +-------+-----------------+------+
                               |                 |
               get_frame x 2   |                 |  gate state (later, optional)
                               v                 v
          +--------------------------+   +-------------------------------+
          | Ring MCP Bridge (open    |   | FliessGateControl (yours, as  |
          | source, generic): frames |   | today): its own camera and ML |
          | from the 2 Ring cameras  |   | state; its own small MCP      |
          | that see the gate        |   | server, only if you want one  |
          +--------------------------+   +-------------------------------+
          The model looks at the two pictures itself; your ML keeps running as today.
```

## A3 decided (2026-10-28)

**The human, verbatim:** "Yes, option a is the correct architecture and seperation of concerns"

**Confirmation:** human-confirmed (lens-question, scope A3 and C10).

**What was decided:**
- **Option (a). The bridge stays Ring-only.**
  - Agents see the gate through `get_frame` on the two Ring cameras that view it.
  - The ML gate state stays in FliessGateControl, as today.
  - If agents should ask that state later, FliessGateControl gets its own small MCP server, a separate project, and the agent combines the two servers.
- **Dropped:**
  - `get_gate_status`;
  - `GATE_UNAVAILABLE`;
  - the Gate resource accessor;
  - the FliessGateControl function key in the core's Key Vault.
- **Resource access** goes from 13 to 12.
- **This reverses the 2026-10-26 gate amendment from devops-operations.** It is recorded in the "Amendments from later lenses" sections of architecture-core, integration-api, security-compliance and devops-operations.
- **Noted as later** (out of v1; the agent's proposal under option (d), to which the human did not object): an optional analyser on the post-event frame that adds tags to the event. It is the seam for generic analytics, and its home is the Media path.
- **C10** is answered by this decision: the bridge has no gate source.

## The proposed component map v2 (after A3 = a; the current proposal)

```text
 PROPOSED COMPONENT MAP v2 (IDesign; A3 = a: no gate part; layers call only downward)
 * = new since the lens-2 map

 AGENTS: ChatGPT + dot, Claude surfaces   CHANNEL SHIM (your PC)   YOU (phone or PC)
            | HTTPS, our tokens                  | HTTPS                  | HTTPS
 ===========v============= AZURE CORE (one instance, B7) v========================v=====
 CLIENTS    [MCP Endpoint]  [Issuer]*  [Web: pages, clip links]*  [Connector Link]
            [Scheduler]  [Host: wiring, lease, /livez, /readyz]*
                 |  clients call managers only
 MANAGERS   [Inquiry]   [Control]   [Media]   [Event]   [Admin]*
                 |  a manager never calls a manager; queued calls go through Pub/Sub
 ENGINES    [Summary]   [Safety]    [Capture] [Classify] [Health]*
                 |  engines are rules only; managers call engines and resource access
 RESOURCE   [Ring Access] [State] [Event Log] [Subscriptions] [Delivery] [Media Cache]
 ACCESS     [Audit] [Command]* [Settings]* [Grants]* [Lease]* [Secrets]*
                 |
 RESOURCES  home link   Azure SQL   Blob (media, WORM)   Key Vault   agents' push
            endpoints   Entra ID (your sign-in)
 UTILITIES  Security | Logging | Pub/Sub | Config | Clock | Link transport*
            | Query layer*   (any layer may call a utility)
 =======================================^===============================================
                                        | WSS, dialed out from home (no open ports)
 ====================== HOME CONNECTOR (Docker on the Ubuntu VM) ========================
 CLIENTS    [Setup CLI]   [Core Link]   [Push Listener]   [Home Scheduler]
 MANAGERS   [Execute]: commands, captures, auto-off    [Ingest]: events, outbox, catch-up
 ENGINES    [Normalize]: Ring payloads -> the bridge's event shape
 RESOURCE   [Ring Adapter]: limiter, circuit   [Live Media]   [Outbox Store]
 ACCESS     [Secrets File]
 RESOURCES  Ring cloud (REST, alarm websocket, push, live view)   SQLite   encrypted file
 Mode A (all at home): the same components in one process; Ring Access calls Execute
 directly, and the link, Connector Link and Core Link are not used.
```

**Every component and its job (v2; tags compare with the lens-2 map):**

**Clients (core):**
- **MCP Endpoint** (carried): the MCP server for both protocol eras; checks token and scopes; one tool call becomes one manager call.
- **Issuer** (NEW): node-oidc-provider. Listed agents link; you sign in with Entra; it issues, refreshes and revokes tokens.
- **Web** (NEW): the admin page, the confirm page, authenticated clip links.
- **Connector Link** (carried): events and heartbeats from home, queued to Event; checks the connector's signed hello.
- **Scheduler** (carried): minute ticks for the home-offline check, purges, battery digest, token expiry and WORM shipping.
- **Host** (NEW): wires mode H or A; holds the single-instance lease; `/livez` and `/readyz`.
- **Channel shim** (carried, outside the core, on your PC): relays push to Claude Code.

**Managers:**
- **Inquiry** (CHANGED): every read tool, plus get_events with the last-read fallback.
- **Control** (CHANGED): arm Home and Away, lights with auto-off, disarm. Prepare, then confirm, at most once, lease checked. Siren and chime removed.
- **Media** (CHANGED): frame, burst and clip, including the frame taken after an event; the live viewer only as the O1 stretch.
- **Event** (CHANGED): saves each event in one transaction, sets its priority and sends it to every agent. It also handles health changes, late events and push filters.
- **Admin** (NEW): your admin-page tasks:
  - agents and revoke, enrollment, switches, owners' agreements;
  - the PIN, delete now, the audit view;
  - the Issuer's policy;
  - WORM shipping and the chain check.

**Engines:**
- **Summary** (carried): replies sized to a token budget.
- **Safety** (CHANGED): one-time tokens, the disarm gate, the PIN (5 tries, then a 15-minute lock), the fresh sign-in check.
- **Capture** (carried): snapshot, live frame or cached copy; the battery cap.
- **Classify** (CHANGED): priority, motion opt-ins, the battery threshold, the late-event rule (A4).
- **Health** (NEW): one health view from the heartbeat, last event, database, lease and WORM lag; thresholds as data.

**Resource access:**
- **Ring Access** (carried): the only way to Ring: over the link (H) or in-process (A); later the official adapter.
- **State** (carried): locations, devices, alarm state, health snapshot, each with `as_of`.
- **Event Log** (carried): events by seq, the epoch, dedupe.
- **Subscriptions** (CHANGED): cursors, push filters, the per-client last-read mark.
- **Delivery** (carried): ChatGPT webhooks, listen streams, the channel shim.
- **Media Cache** (carried): Blob (a folder in mode A), kept 7 days.
- **Audit** (CHANGED): the hash chain, the database copy, WORM shipping.
- **Command** (NEW): commands, used tokens, the pending disarm, PIN tries and the lock.
- **Settings** (NEW): your switches, listed agents, owners' agreements, the connector key.
- **Grants** (NEW): the Issuer's storage.
- **Lease** (NEW): the single-instance lease row.
- **Secrets** (NEW): Key Vault (the file in mode A); one write, the PIN hash (A1).

**Utilities:**
- Security, Logging, Pub/Sub, Clock (carried).
- Config (start-up settings only).
- **Link transport** (NEW): the WSS session both ends share.
- **Query layer** (NEW): SQLite and T-SQL.

**Home connector:**
- **Setup CLI** (carried): Ring login and 2FA; the connector key and enrollment code.
- **Core Link** (CHANGED): dials out, receives commands, sends events and the heartbeat.
- **Push Listener** (NEW): Ring push into Ingest.
- **Home Scheduler** (NEW): the heartbeat, resends, due auto-off timers.
- **Ingest** (NEW): normalize, outbox, send; after a gap, catch up and mark what is recovered as late.
- **Execute** (NEW): runs each command once; captures; the auto-off timers.
- **Normalize** (NEW): Ring payloads into the bridge's event shape; Ring strings marked untrusted.
- **Ring Adapter** (carried): ring-client-api, the shared limiter, the circuit.
- **Live Media** (renamed from the home Capture): werift and ffmpeg for frames, bursts and clips.
- **Outbox Store** (CHANGED): SQLite with the outbox, executed command_ids, timers, the catch-up mark.
- **Secrets File** (carried): the Ring token, push credentials, device ID, connector key.

## CD1 decided (2026-10-28)

**The agent asked:** looking at v2, is there anything you would rename, split, merge or move? Lease could merge into State; Secrets could merge into Config, but only if A1 goes the runbook way. The agent's lean: keep both separate, because each hides a different thing that changes.

**The human, verbatim:** "Agree"

**Confirmation:** human-confirmed (lens-question, scope CD1).

**What was decided:**
- **Map v2 above is the component map,** with no renames, splits, merges or moves.
- **Lease stays its own resource accessor,** separate from State.
- **Secrets stays its own resource accessor,** separate from Config. The agent reads the agreement as covering both A1 options: if A1 goes the runbook way, Secrets only reads, but stays its own component.

## CD2 in detail (proposal, awaiting the human)

```text
 CD2: THE CALL RULES IN THE CORE, AND THE TWO EXCEPTIONS (X1, X2)

 RULES  clients -> managers -> engines and resource access -> resources
        a manager never calls a manager; queued calls go through Pub/Sub
        engines do no I/O; any layer may call a utility; nothing calls upward

 X1  THE ISSUER CALLS ITS STORAGE DIRECTLY (a client skips the manager layer)

     agent --OAuth--> [Issuer]  (client; node-oidc-provider runs inside it)
                         |
                         +-- policy: is this agent listed? which scopes? --> [Admin]
                         |                                                  (manager)
                         +-- storage: the library calls its adapter itself -> [Grants]
                                                                 (resource access)

 X2  ONE WSS SESSION, SHARED BY A CLIENT AND A RESOURCE ACCESSOR

     CORE                                                                  HOME
     [Connector Link]   <---- events, heartbeats ----+
     (client)                                        |
                                             [Link transport] <==WSS==> [Core Link]
                                             (utility: hello, signed  (dialed out
                                              challenge, framing)      from home)
     [Ring Access]      <---- commands, replies ---->+
     (resource access)
```

- **X1, the Issuer calls Grants directly.**
  - Why: node-oidc-provider is a library that calls its own storage adapter. Grants is that adapter.
  - Every policy decision (is this agent listed, which scopes) still goes through Admin. Grants is the only accessor the Issuer touches.
  - The alternative: Admin sits in between and exposes the library's 7 storage calls (upsert, find, findByUid, findByUserCode, consume, destroy, revokeByGrantId), each only passing through to Grants. This keeps the rule but adds a layer with nothing in it.
  - The agent's lean: accept X1, kept that narrow. $0 either way.
- **X2, Link transport is a shared utility.**
  - Why: one WSS session carries both directions.
    - Events come in and start a use case, so they enter at a client (Connector Link).
    - Commands go out to Ring, so they leave from resource access (Ring Access).
  - In IDesign a live connection to an outside resource normally belongs to one resource accessor, so a utility holding it is the exception. The utility holds only the session (hello, the signed challenge, heartbeats, framing), with no business rules. At home, Core Link uses the same utility.
  - Alternatives:
    - (b) two WSS sessions, one per direction. No exception, but two connections from home, two handshakes and two heartbeats to secure and watch. $0.
    - (c) Ring Access owns the session and hands incoming events up to Connector Link. That is a call upward, which is worse than the exception.
  - The agent's lean: accept X2. $0.

## The human's question on X2 (2026-10-28)

**The human, verbatim:** "So you want the caller to "host" the accessor code in X2? what is the pros and cons?"

**The agent's answer (proposal):** no. Neither caller hosts the session. The Host (the composition root) creates one Link transport per process at start and hands the same instance to both callers. Ring Access keeps all of the accessor's logic; the transport is only the pipe.

```text
 X2 IN CODE: ONE SESSION PER PROCESS; WHO CREATES IT, WHO USES IT, WHAT EACH OWNS

 [Host] (composition root) creates ONE Link transport at start and hands it to both:

  [Connector Link] (client)                 [Ring Access] (resource access)
  owns: is this the enrolled key (through   owns: command -> frame, command_id,
  Admin); check each frame; queue events    the 60 s deadline, reply -> result;
  and heartbeats to Event                   fails in-flight commands on a drop
       ^  calls the handler Connector            |  request(frame) -> reply
       |  Link registered at start               v
  [Link transport] (utility; knows frame types and versions, never Ring or the bridge)
  owns: the socket, the hello at N or N-1, the signed challenge, ping, framing,
  reconnect, sending order, priority (commands and events before media chunks)
       ^
       |  WSS, dialed out from home; at home, Core Link uses the same utility code
```

- **A comparison the agent offered (from the IDesign book, Righting Software, recalled from memory, not checked now):**
  - Löwy puts a Message Bus in the utilities bar, so a shared communication channel as a utility is the standard case, not an odd one.
  - The home connector is then both a client (it sends us events) and a resource (we send it commands), over one channel.
  - The same book's rules say resource access does not publish events, which rules out a Pub/Sub version of option (c).
- **Pros of X2 (one shared session):**
  - One connection: one handshake, one key check, one reconnect, one thing to watch.
  - Honest health (B12): the heartbeat and the commands share the pipe, so "home online" means commands can get through too.
  - Order: a command's reply and the event it causes (for example "alarm now Away") arrive in the order the home sent them.
  - One protocol implementation, used at both ends, with one test suite. An in-memory fake pair tests Ring Access and Connector Link without sockets.
  - Mode A: neither caller's logic changes; the transport is simply not created.
- **Cons of X2:**
  - Shared state with two users. On a drop both must react: Ring Access fails in-flight commands with BRIDGE_UNAVAILABLE (outcome unknown, never retried, at most once), and the home outbox resends events. Its lifetime belongs to Host, not to either caller.
  - Logic creep: a stateful utility tempts people to put retries, dedupe or Ring words into it.
  - Head-of-line blocking: a clip or burst on the same socket could delay a HIGH doorbell event (0.5 s p95) and the heartbeat (the home-offline check).
  - One protocol version for both directions; N and N-1 covers it.
- **Option (b), two sessions:**
  - Pros: each direction belongs to its own component, so there is no exception; media on the command session never delays events.
  - Cons: two handshakes, heartbeats and reconnects at home; half-up states (events flowing, commands dead) that health must detect separately; no order between a reply and its event; more code at home.
- **Option (c), Ring Access owns the session:** events would go upward, or out through Pub/Sub from resource access. Both break the rules. Not recommended.
- **The agent's lean, refined:** accept X2, with two additions:
  1. **A rule:** the transport knows frame types, versions and priority only, never Ring or bridge words. Host owns its lifetime. A dependency check at code-implementation can keep it so.
  2. **Media in small chunks behind events:** commands, events and heartbeats are sent first, so a clip never delays a HIGH event. The chunk size is set at plan.
  - Cost: $0, code only.
- **New open point found here:** the record does not yet say how capture bytes reach the core in mode H.
  - Assumed: over the link, because the connector has no Blob rights.
  - The alternative: the home uploads to Blob with a short-lived write link per capture, which adds a credential at home.
  - Both are $0: data into Azure is free, and Blob is in the same region.

## CD2 decided (2026-10-28)

**The agent asked:** do you accept X2 with those two additions, or would you rather have two sessions? X1 (the Issuer calling Grants directly) is still open too; you can answer both together.

**The human, verbatim:** "Agree"

**Confirmation:** human-confirmed (lens-question, scope CD2: X1 and X2).

**The agent's reading:** the question invited one answer for both, so "Agree" is read as accepting both leans. The reply tells the human this, so it can be corrected.

**What was decided:**
- **The call rules stand** as listed under CD2.
- **X1:** the Issuer (a client) calls Grants directly, because node-oidc-provider calls its own storage adapter.
  - Grants is the only accessor the Issuer touches.
  - Every policy decision (is this agent listed, which scopes) goes through Admin.
- **X2:** Link transport is a shared utility, used by Connector Link and Ring Access in the core, and by Core Link at home.
  - **Host owns it:** one instance per process, created at start.
  - **The rule:** the transport knows frame types, versions and priority only, never Ring or bridge words. A dependency check, set at code-implementation, keeps it so.
  - **Media goes in small chunks behind commands, events and heartbeats,** so a clip never delays a HIGH event. The chunk size is set at plan.
  - **On a drop:** Ring Access fails in-flight commands with BRIDGE_UNAVAILABLE (outcome unknown, never retried), and the home outbox resends events.
- **Capture bytes travel over the link in mode H.** This follows from the agreed media-chunk addition; it is the agent's reading, not a separate answer. The Blob-upload alternative is not taken.
- Cost: $0.

## CD3 in detail (proposal, awaiting the human)

```text
 CD3: WHERE AN INTERFACE SITS (the Host binds one implementation at start)
 Rule: an interface only where there is more than one implementation.

 SEAM              IMPLEMENTATIONS                              WHY IT VARIES
 ----------------  -------------------------------------------  -------------------------
 PRODUCTION SEAMS (the topology or the platform picks)
 Ring Access       link to home (H) | call Execute (A) |        topology; S1
                   official API (later, only if S1 passes)
 Delivery          ChatGPT webhook | listen stream | shim       one per agent platform
 Media Cache       Blob (H) | folder (A)                        topology
 Audit             with WORM shipping (H) | without (A)         topology
 Secrets           Key Vault (H) | encrypted file (A)           topology
 Query layer       T-SQL on Azure SQL (core, H) | SQLite (A,    topology
                   and the connector's outbox)
 TEST-ONLY SEAMS (one real implementation, plus a fake so CI needs no Ring or Azure)
 Clock             real | fake time                             timers, tokens, the lock
 Link transport    WSS | in-memory pair                         no sockets in tests
 Ring Adapter      ring-client-api | simulated home             no Ring account in CI
  and Live Media   werift + ffmpeg | fixed test images          or for contributors
 Entra sign-in     Entra | fake sign-in                         the two pages in tests

 Everything else is a plain module, called directly: managers, engines, connector
 managers, and the other accessors (they vary only through the Query layer).
```

- **What "interface" means here:** a TypeScript type that a component takes in its constructor. The Host passes the implementation at start. There are no base classes (CD5), and the DI container is code-implementation's choice (P8).
- **The six production seams** are the ones listed under CD3 at lens open.
- **New in this turn, the four test-only seams:**
  - **Clock:** a fake clock for the 15 s heartbeat, the 2-minute tokens, the 15-minute lock and the auto-off timers.
  - **Link transport:** the in-memory pair already named under X2.
  - **Ring Adapter and Live Media:** a simulated home (a doorbell, a camera, the alarm and a few sensors that raise events, with fixed test images).
    - CI then runs end to end with no Ring account.
    - As a side effect, people without Ring devices can try the bridge.
  - **Entra sign-in:** a fake sign-in, for testing the admin and confirm pages.
- **Alternatives:**
  - (b) An interface on every component. More files and more indirection, with no gain: TypeScript tests can already substitute any object of the right shape.
  - (c) Only the six production seams. Tests then fake time and Ring by mocking modules, which is brittle and ties the tests to file paths.
- **Cost:** $0 in Azure. The simulated home is some build effort, which pays back in CI and for contributors.
- **The agent's lean:** the six production seams plus the four test-only seams, ten in all.

## CD3 decided (2026-10-28)

**The agent asked:** do these ten seams stand, including the simulated home? Or would you add or drop any?

**The human, verbatim:** "agree"

**Confirmation:** human-confirmed (lens-question, scope CD3).

**What was decided:**
- **Interfaces go only where there is more than one implementation.** An interface is a TypeScript type that a component takes in its constructor; the Host binds the implementation at start. There are no base classes.
- **The six production seams:** Ring Access, Delivery, Media Cache, Audit, Secrets, Query layer.
- **The four test-only seams:**
  - Clock (fake time);
  - Link transport (an in-memory pair);
  - Ring Adapter and Live Media (a simulated home with fixed test images);
  - Entra sign-in (a fake sign-in).
- **The simulated home is in v1.** CI runs end to end with no Ring account, and people without Ring devices can try the bridge.
- **Everything else is a plain module,** called directly.
- Cost: $0 in Azure; the simulated home is build effort.

## CD4 in detail (proposal, awaiting the human)

```text
 CD4: WHERE SHAPES ARE MAPPED
 Inside: one set of internal models. At each edge, one owner maps, with its own test.

 OUTSIDE SHAPE           MAPPED IN         RULE                 ITS TEST
 ----------------------  ----------------  -------------------  ------------------------
 MCP tool schemas        MCP Endpoint      the contract; only   a schema snapshot; CI
 (what agents see)                         additive (D2)        fails on a removed,
                                                                renamed or retyped field
 Push payloads (ChatGPT, Delivery, one     one shape per        a fixture per platform
 listen stream, shim)    adapter each      platform             (D6)
 Link messages           Connector Link    versioned; N and     both ends on N and N-1
 (core <-> home)         and Ring Access   N-1 both accepted    fixtures (D6)
                         (core); Core Link
                         (home)
 Ring payloads           Normalize (home)  tolerant reader;     recorded, scrubbed
                                           Ring text untrusted  fixtures, a live canary
                                                                (D6); the simulated home
 Database rows           each accessor,    a table belongs to   accessor tests on SQLite
                         its own tables    one accessor only    and SQL Server (DS5)
 Pages and clip links    Web               view models only     page tests, fake sign-in
```

- **The rule:** internal models never cross an edge. The MCP tool schemas are written on their own, not generated from internal types. The validation library is code-implementation's choice.
- **New in this turn, compared with CD4 at lens open:**
  - **D2 becomes a test.** CI compares the tool schemas with the last release and fails on a removed, renamed or retyped field. Additions pass.
  - **The Ring edge is a tolerant reader.**
    - Normalize keeps the fields it knows and ignores the rest.
    - A Ring event kind it does not know becomes kind `ring.other` at LOW, with Ring's name for it kept as untrusted text, and a log counter. It is never dropped and never crashes ingest, so a Ring change shows up in the logs instead of breaking events.
    - This is additive under D2: the kind list is already open.
  - **Two more edges are listed:** push payloads (one Delivery adapter per platform) and the pages.
- **Alternatives:**
  - (b) One shape everywhere: tool schemas and link messages are the internal types. Less mapping code, but any internal refactor changes what agents see (breaking D2) and what the home receives (breaking N-1).
  - (c) Generate the outside schemas from the internal types. Less typing, but the same coupling, only hidden.
- **Cost:** $0. The SQL Server container in CI is already part of DS5.
- **The agent's lean:** the six mapped edges, each with its test, plus the tolerant reader and `ring.other`.

## The human's direction on CD4 (2026-10-28)

**The human, verbatim:** "I like to reduce coupling in all levels, have independend DTOs. Not a common file for all of them, but the DTO is exported from the component that declare the comunication schema."

**The agent's reading:** this replaces "one set of internal models" with DTOs per component. "The component that declares the communication schema" is read as the component that is called. This reading is put to the human, not yet confirmed.

**CD4 revised (proposal, awaiting the human):**

```text
 CD4 REVISED: EACH COMPONENT DECLARES ITS OWN DTOs (the human's direction, 2026-10-28)

 Rule: the component that is called declares the call's schema. Its one public entry
 file exports its operations and its DTOs; everything else in its folder is private.
 A caller imports only that entry file and maps its own data into the callee's DTO.
 There is no shared types file and no shared internal model.

 EXAMPLE, A DOORBELL PRESS: WHO CALLS WHOM, AND WHOSE DTO IS USED
 CALLER                       CALLEE              DTO, EXPORTED BY THE CALLEE
 ---------------------------  ------------------  -----------------------------------
 Push Listener (home)         Ingest              PushReceived
 Ingest                       Normalize           RingPayload -> NormalizedEvent
 Ingest                       Outbox Store        OutboxItem
 Core Link (home), over WSS   Connector Link      EventMessage, versions N and N-1
 Connector Link               Event (queued)      IncomingEvent
 Event                        Classify            ClassifyInput -> Classification
 Event                        Event Log           AppendEvent -> Appended
 Event                        Delivery            PushRequest
 Delivery's adapters          the agents          the event shape agents see: Q1
 MCP Endpoint (get_events)    the agents          the same event shape: Q1

 The other direction over the link: Core Link (home) declares CommandMessage, and
 Ring Access (core) imports it. Rows stay private inside each accessor.
```

- **How it fits CD3:** a component's entry file exports either its class or, for the ten seams, its interface, together with its DTOs. It also stays consistent with IDesign, where each service contract carries its own data contracts.
- **Enforcement:**
  - A CI dependency check allows imports from another component only through its entry file, and fails if a shared types folder appears.
  - The tool is code-implementation's choice, "no new dependency" first.
- **The edges and tests in the CD4 table above stay as they are.** That includes D2 as a test, the tolerant reader and `ring.other`. The only change is where each DTO is declared.
- **Cost:** $0 in Azure. Managers write more mapping code (for example, Event maps into four DTOs), in exchange for components that change independently.
- **Q1: the event shape agents see, on two paths.** Agents get events by pull (MCP Endpoint, get_events) and by push (Delivery). D7 promises them one shape, and the callee here is outside the bridge, so it cannot declare it. Options:
  - (a) A **Public Contract** module declares everything agents see: the tool schemas and the event shape. It is also published as JSON Schema files for open-source users. MCP Endpoint and Delivery both import it, and the D2 check runs on this one module. It is shared by exactly two components, which speak the same schema to the same audience. **The agent's lean.**
  - (b) MCP Endpoint and Delivery each declare their own copy, and a contract test proves the copies match.
  - Both $0.
- **Q2: IDs and timestamps.** Shared, typed IDs would need a shared file. Options:
  - (a) DTOs use plain strings, with names that say what they are (`event_id`, `as_of` as a UTC ISO string). Edge validation and tests catch mix-ups. **The agent's lean,** because it keeps the human's rule with no exception.
  - (b) A small value-types utility (typed IDs, UTC time). Utilities are already shared by every layer, but it is one shared file.
  - Both $0.

## The human's question on Q1 (2026-10-28)

**The human, verbatim:** "Pros and cons of Q1 a and b? which one is better decoupling, how easy is to maintain, what is the chance that future changes will diverge these DTOs?"

**The agent's answer (proposal):**

```text
 Q1 (a) PUBLIC CONTRACT                     Q1 (b) TWO COPIES AND A TEST

   [MCP Endpoint]      [Delivery]             [MCP Endpoint]      [Delivery]
   (client)            (resource access)      event shape         event shape
          \               /                   (copy 1)            (copy 2)
           v             v                           \               /
        [Public Contract]                             v             v
        tool schemas + event shape            [CI test: copy 1 == copy 2]
        imports nothing; published
        as JSON Schema; D2 check here         JSON Schema published from one
   Only these two may import it.              copy, which becomes the master

 +-------------------+--------------------------------+--------------------------------+
 |                   | (a) Public Contract            | (b) Two copies and a test      |
 +-------------------+--------------------------------+--------------------------------+
 | Shared imports    | 2 components import 1 module   | none: the strictest reading of |
 |                   | (allow-listed)                 | your rule                      |
 | Real coupling     | the same in both: D7 binds the | the same, but duplicated and   |
 |                   | two paths to one shape; here   | held together by a test        |
 |                   | it is visible, in one place    |                                |
 | What it depends   | the most stable module in the  | nothing shared                 |
 | on                | bridge (D2: additive only)     |                                |
 | A change to the   | 1 edit; the D2 check on 1      | 2 edits plus the test; the D2  |
 | event shape       | module                         | check on 2 copies              |
 | Divergence        | impossible for the shared      | caught in CI if the test is    |
 |                   | shape                          | complete; drifts when someone  |
 |                   |                                | "fixes" the test instead       |
 | Its own risk      | it grows into a dumping        | the test is code to maintain;  |
 |                   | ground; guard: allow-list,     | it invites a deliberate split  |
 |                   | no imports, agent-visible only | that breaks D7                 |
 | Cost              | $0                             | $0                             |
 +-------------------+--------------------------------+--------------------------------+
```

- **Which decouples better.**
  - Counting shared imports, (b) wins: nothing is shared.
  - The real coupling is the same in both. D7 promises agents one event shape on both paths, so MCP Endpoint and Delivery must change together either way. (a) puts that one fact in one place. (b) writes it twice and keeps the copies together with a test, which hides the coupling rather than removing it.
  - (a) depends on the most stable module in the bridge, because D2 allows only additive changes to it. Depending on something that rarely and only additively changes is the low-risk kind of coupling.
- **How easy it is to maintain.**
  - (a): one edit per change, and the D2 check and the published JSON Schema come from one place.
  - (b): two edits per change, plus a comparison test that is itself code. The published JSON Schema must come from one copy, which then becomes the master; that is (a) in disguise.
- **The chance of future divergence.**
  - The event shape will change often. The kind list is open and grows with new Ring devices and `ring.other`; later fields, such as the analyser's tags, add to it.
  - (a): divergence of the shared shape is impossible. Each change reaches both paths, which D7 requires.
  - (b): every change is a chance to diverge. The test catches it only if it compares everything, including the field descriptions that models read. A type-equality check alone misses descriptions; a diff of the generated JSON Schema catches them.
  - (b)'s real risk is the fix. When the test fails, someone, or a coding agent, edits the test instead of the second copy.
  - The agent gives no number: there is no data for this project to base one on.
- **Why (a) still fits the human's rule.** The Public Contract is the component that declares the communication schema with agents. Internal components never import it. It holds only what agents see, so it is not a common file for internal DTOs.
- **Three guard rails for (a), all enforced by the CI dependency check:**
  1. Only MCP Endpoint and Delivery may import it (an allow-list).
  2. It imports nothing.
  3. It holds only agent-visible schemas.
  - Each platform's envelope (ChatGPT webhooks, listen stream, shim) stays inside its Delivery adapter, not in the Public Contract.
- **Other places it could live, not recommended:**
  - In MCP Endpoint, with Delivery importing from it: a resource accessor would depend on a client, which is upward.
  - In Delivery, with MCP Endpoint importing from it: a client would depend on a resource accessor, skipping the managers.
- **The agent's lean is unchanged: (a), with the three guard rails.** $0 either way.

## CD4: the rule and Q1 decided (2026-10-28)

**The agent asked:** does the revised rule (the component being called declares its DTOs) match what you meant? Which way for Q1? Which way for Q2?

**The human, verbatim:** "OK, a"

**Confirmation:** human-confirmed (lens-question, scope: the CD4 rule and Q1).

**The agent's reading:**
- "OK" confirms the revised rule.
- "a" answers Q1, the question just discussed.
- Q2 is not read as answered. The agent asks it on its own, so as not to assume.
- The reply states this reading, so the human can correct it.

**What was decided:**
- **DTOs per component.** The component that is called declares the call's schema. Its one public entry file exports its operations and DTOs; the rest of its folder is private.
  - Callers import only that entry file and map their data into the callee's DTO.
  - There is no shared types file and no shared internal model.
  - A CI dependency check enforces this.
- **Over the link, the receiver declares.** Connector Link declares EventMessage (N and N-1); Core Link declares CommandMessage.
- **Q1 = (a): the Public Contract** declares everything agents see, the tool schemas and the event shape. It is published as JSON Schema, and the D2 check runs on it. Its guard rails, enforced by the CI dependency check:
  1. Only MCP Endpoint and Delivery may import it.
  2. It imports nothing.
  3. It holds only agent-visible schemas; each platform's envelope stays in its Delivery adapter.
- **The CD4 edges and tests stand,** with D2 as a test, the tolerant reader and `ring.other`.
- Cost: $0.
- **Map effect:** the Public Contract is a new module (schemas only, no logic). Map v3 below adds it.

## The component map v3 (after CD4 Q1; the current map)

```text
 COMPONENT MAP v3 (IDesign; v2 + the Public Contract from CD4; calls go only downward)
 * = new since the lens-2 map. Each component exports its own DTOs from its entry
 file; there is no shared types file (CD4).

 AGENTS: ChatGPT + dot, Claude surfaces   CHANNEL SHIM (your PC)   YOU (phone or PC)
            | HTTPS, our tokens                  | HTTPS                  | HTTPS
 ===========v============= AZURE CORE (one instance, B7) v========================v=====
 CLIENTS    [MCP Endpoint]  [Issuer]*  [Web: pages, clip links]*  [Connector Link]
            [Scheduler]  [Host: wiring, lease, /livez, /readyz]*
                 |  clients call managers only
 MANAGERS   [Inquiry]   [Control]   [Media]   [Event]   [Admin]*
                 |  a manager never calls a manager; queued calls go through Pub/Sub
 ENGINES    [Summary]   [Safety]    [Capture] [Classify] [Health]*
                 |  engines are rules only; managers call engines and resource access
 RESOURCE   [Ring Access] [State] [Event Log] [Subscriptions] [Delivery] [Media Cache]
 ACCESS     [Audit] [Command]* [Settings]* [Grants]* [Lease]* [Secrets]*
                 |
 RESOURCES  home link   Azure SQL   Blob (media, WORM)   Key Vault   agents' push
            endpoints   Entra ID (your sign-in)
 UTILITIES  Security | Logging | Pub/Sub | Config | Clock | Link transport*
            | Query layer*   (any layer may call a utility)
 SCHEMAS    [Public Contract]*: the tool schemas and event shape agents see; no logic;
            imported only by MCP Endpoint and Delivery; published as JSON Schema
 =======================================^===============================================
                                        | WSS, dialed out from home (no open ports)
 ====================== HOME CONNECTOR (Docker on the Ubuntu VM) ========================
 CLIENTS    [Setup CLI]   [Core Link]   [Push Listener]   [Home Scheduler]
 MANAGERS   [Execute]: commands, captures, auto-off    [Ingest]: events, outbox, catch-up
 ENGINES    [Normalize]: Ring payloads -> the bridge's event shape
 RESOURCE   [Ring Adapter]: limiter, circuit   [Live Media]   [Outbox Store]
 ACCESS     [Secrets File]
 RESOURCES  Ring cloud (REST, alarm websocket, push, live view)   SQLite   encrypted file
 Mode A (all at home): the same components in one process; Ring Access calls Execute
 directly, and the link, Connector Link and Core Link are not used.
```

**Every component and its job (v3; tags compare with the lens-2 map):**

**Clients (core):**
- **MCP Endpoint** (carried): the MCP server for both protocol eras; checks token and scopes; one tool call becomes one manager call; maps manager DTOs into the Public Contract.
- **Issuer** (NEW): node-oidc-provider. Listed agents link; you sign in with Entra; it issues, refreshes and revokes tokens. Calls Grants directly (X1).
- **Web** (NEW): the admin page, the confirm page, authenticated clip links.
- **Connector Link** (carried): events and heartbeats from home, queued to Event; checks the connector's signed hello; declares EventMessage (N and N-1).
- **Scheduler** (carried): minute ticks for the home-offline check, purges, battery digest, token expiry and WORM shipping.
- **Host** (NEW): wires mode H or A; owns the Link transport; holds the single-instance lease; `/livez` and `/readyz`.
- **Channel shim** (carried, outside the core, on your PC): relays push to Claude Code.

**Managers:**
- **Inquiry** (CHANGED): every read tool, plus get_events with the last-read fallback.
- **Control** (CHANGED): arm Home and Away, lights with auto-off, disarm. Prepare, then confirm, at most once, lease checked. Siren and chime removed.
- **Media** (CHANGED): frame, burst and clip, including the frame taken after an event; the live viewer only as the O1 stretch.
- **Event** (CHANGED): saves each event in one transaction, sets its priority and sends it to every agent. It also handles health changes, late events and push filters.
- **Admin** (NEW): your admin-page tasks:
  - agents and revoke, enrollment, switches, owners' agreements;
  - the PIN, delete now, the audit view;
  - the Issuer's policy;
  - WORM shipping and the chain check.

**Engines:**
- **Summary** (carried): replies sized to a token budget.
- **Safety** (CHANGED): one-time tokens, the disarm gate, the PIN (5 tries, then a 15-minute lock), the fresh sign-in check.
- **Capture** (carried): snapshot, live frame or cached copy; the battery cap.
- **Classify** (CHANGED): priority, motion opt-ins, the battery threshold, the late-event rule (A4).
- **Health** (NEW): one health view from the heartbeat, last event, database, lease and WORM lag; thresholds as data.

**Resource access:**
- **Ring Access** (carried): the only way to Ring: over the link (H) or in-process (A); later the official adapter. Fails in-flight commands on a link drop.
- **State** (carried): locations, devices, alarm state, health snapshot, each with `as_of`.
- **Event Log** (carried): events by seq, the epoch, dedupe.
- **Subscriptions** (CHANGED): cursors, push filters, the per-client last-read mark.
- **Delivery** (carried): ChatGPT webhooks, listen streams, the channel shim; maps into the Public Contract's event shape; each platform's envelope stays in its adapter.
- **Media Cache** (carried): Blob (a folder in mode A), kept 7 days.
- **Audit** (CHANGED): the hash chain, the database copy, WORM shipping.
- **Command** (NEW): commands, used tokens, the pending disarm, PIN tries and the lock.
- **Settings** (NEW): your switches, listed agents, owners' agreements, the connector key.
- **Grants** (NEW): the Issuer's storage.
- **Lease** (NEW): the single-instance lease row.
- **Secrets** (NEW): Key Vault (the file in mode A); one write, the PIN hash (A1).

**Utilities:**
- Security, Logging, Pub/Sub, Clock (carried).
- Config (start-up settings only).
- **Link transport** (NEW): the WSS session both ends share; frame types, versions and priority only; media in chunks behind commands, events and heartbeats (X2).
- **Query layer** (NEW): SQLite and T-SQL.

**Schemas:**
- **Public Contract** (NEW, CD4 Q1): the tool schemas and the event shape agents see; published as JSON Schema; the D2 check runs on it; imported only by MCP Endpoint and Delivery; imports nothing.

**Home connector:**
- **Setup CLI** (carried): Ring login and 2FA; the connector key and enrollment code.
- **Core Link** (CHANGED): dials out, receives commands, sends events and the heartbeat; declares CommandMessage.
- **Push Listener** (NEW): Ring push into Ingest.
- **Home Scheduler** (NEW): the heartbeat, resends, due auto-off timers.
- **Ingest** (NEW): normalize, outbox, send; after a gap, catch up and mark what is recovered as late.
- **Execute** (NEW): runs each command once; captures; the auto-off timers.
- **Normalize** (NEW): Ring payloads into the bridge's event shape; a tolerant reader (unknown kinds become `ring.other`); Ring strings marked untrusted.
- **Ring Adapter** (carried): ring-client-api, the shared limiter, the circuit. The simulated home stands in for it in CI (CD3).
- **Live Media** (renamed from the home Capture): werift and ffmpeg for frames, bursts and clips. Fixed test images stand in for it in CI (CD3).
- **Outbox Store** (CHANGED): SQLite with the outbox, executed command_ids, timers, the catch-up mark.
- **Secrets File** (carried): the Ring token, push credentials, device ID, connector key.

## Q2 asked again, with a third option (proposal, awaiting the human)

```ts
// (a) Plain strings: nothing shared; the compiler cannot tell one ID from another
export interface AppendEvent { event_id: string; command_id?: string; as_of: string }

// (b) One shared value-types utility: compiler checks, but one file everyone imports
import type { EventId, CommandId, UtcIso } from "../utilities/value-types";
export interface AppendEvent { event_id: EventId; command_id?: CommandId; as_of: UtcIso }

// (c) Each component declares its own brands; the same brand name means the same type
type EventId = string & { readonly __brand: "EventId" };  // in Event Log's entry file
type CommandId = string & { readonly __brand: "CommandId" };
type UtcIso = string & { readonly __brand: "UtcIso" };
export interface AppendEvent { event_id: EventId; command_id?: CommandId; as_of: UtcIso }
// Event declares the same three lines in its own entry file: the types match by shape.
// Passing a CommandId where an EventId belongs is a compile error. A plain string is
// too, so a brand is applied only where an ID enters (the edge parsers of CD4).
```

- **(a) Plain strings:** nothing shared, but a mixed-up ID is caught only by tests and edge validation.
- **(b) One value-types utility:** the compiler catches mix-ups, but almost every component imports one shared file.
- **(c) New: per-component brands.** Each component declares its own branded types in its entry file. TypeScript compares types by shape, so two `"EventId"` brands match without a shared file.
  - The compiler catches a mix-up, and a misspelled brand fails to compile instead of passing silently.
  - It costs one line per ID in each component that uses it, and a brand applied where an ID enters.
  - It needs brands named by string, not by `unique symbol`, because symbol brands would not match across files.
- All $0.
- **The agent's lean moves from (a) to (c):** it keeps the human's rule and adds the compiler's check.

## CD4: Q2 decided (2026-10-28)

**The agent asked:** Q2, (a), (b) or (c)?

**The human, verbatim:** "c"

**Confirmation:** human-confirmed (lens-question, scope CD4 Q2).

**What was decided:**
- **Per-component brands.** Each component declares its own branded ID and time types in its entry file, for example `type EventId = string & { readonly __brand: "EventId" }`.
- **Brands are named by string, never by `unique symbol`,** so that the same brand declared in two files is the same type, with no shared file.
- **A brand is applied only where an ID enters,** in the edge parsers of CD4.
- Cost: $0.
- **CD4 is complete:** the DTO rule, Q1 (a) the Public Contract, Q2 (c) per-component brands, and the edges with their tests.

## CD5 in detail (proposal, awaiting the human)

```text
 CD5: HOW THE BRIDGE GROWS (composition at start, policy as data, no plugins)

 A CHANGE YOU MIGHT WANT         WHERE IT GOES                     HOW IT IS SWITCHED ON
 ------------------------------  --------------------------------  --------------------
 A new Ring device or event      Normalize mapping, Classify       a release; additive
 kind                            policy, a Public Contract kind    under D2
 A new agent platform (push)     a new Delivery adapter            Config at start
 Ring's official API (if S1)     a new Ring Access implementation  Config at start
 A new tool                      Public Contract, MCP Endpoint,    a release; additive
                                 one manager operation             under D2
 Priorities, thresholds, caps,   policy data the engines read:     the admin page
 opt-ins                         Settings, or start-up Config      (audited), or Config
 A new reaction to an event      a manager subscribed through      a release
 (later: the frame analyser)     Pub/Sub, queued from Event
 Run mode: core, connector or    Host wiring                       Config at start
 all-in-one (A)
 ------------------------------  --------------------------------  --------------------
 Anything beyond Ring (like      its own MCP server, outside the   nothing changes in
 your gate)                      bridge; the agent combines them   the bridge (as A3)
```

- **Inside the bridge, three mechanisms:**
  - **Composition at start:** the Host reads Config and binds one implementation for each of the ten seams (CD3). The DI container is code-implementation's choice (P8).
  - **Policy as data:** the engines read it.
    - What you change on the admin page lives in Settings, and every change is audited.
    - What is tuned in the pilot (health thresholds, rate limits, caps, retention) is start-up Config.
  - **Pub/Sub:** it carries the queued calls between managers. A new reaction to an event is a new subscriber. The later frame analyser would plug in there; v1 only reserves the place.
- **No inheritance trees.** Components implement their entry file's operations and are composed, never subclassed.
- **No plugins** (no loading of outside packages at run time).
  - The process holds the Ring token, the alarm control path and the PIN hash, so plugin code would run with all of that.
  - In an open-source security product, that is the largest supply-chain risk.
  - Contributors extend the bridge by pull request (CI, Copilot reviews) or by forking.
- **Outside the bridge, MCP composition, as decided for the gate in A3.** Anything beyond Ring is its own MCP server, and the agent combines the servers. An outside consumer can also read events and frames through the existing tools, with its own scopes.
- **Alternative:**
  - (b) A plugin system: load npm packages named in Config at start, for example Delivery adapters or analysers. Third parties could extend the bridge without forking.
  - But their code would run inside the process that holds the token and the alarm control, and the plugin API would become a second public contract to keep stable.
  - It is not recommended for v1. It could be reconsidered later.
- **Cost:** $0.
- **The agent's lean:** (a), composition at start, policy as data, Pub/Sub, no plugins, with MCP composition outside.

## CD5 decided (2026-10-28)

**The agent asked:** does this stand, or do you want room for plugins?

**The human, verbatim:** "a"

**Confirmation:** human-confirmed (lens-question, scope CD5).

**What was decided:**
- **Inside the bridge:**
  - composition at start: the Host binds the ten seams from Config;
  - policy as data: Settings for what you change on the admin page (audited), start-up Config for what is tuned in the pilot;
  - Pub/Sub for queued calls between managers; the later frame analyser has its place there.
- **No inheritance trees and no plugins.** Contributors extend the bridge by pull request or by forking.
- **Outside the bridge:** MCP composition, as with the gate (A3).
- Cost: $0.
- **CD1-CD5 are all decided.** A1, A2 and A4 remain.

## A1 in detail (proposal, awaiting the human)

**A second write found while preparing A1.** SC4 rotates the issuer's signing keys every 90 days, which also writes to Key Vault. DO6 gives the core read-only rights (Key Vault Secrets User), so the same conflict applies to the rotation, not only to the PIN.
- The agent missed this when it first raised A1.
- No lens says who rotates the keys. The agent proposes the Scheduler (a daily tick) and Admin.
- A1 now covers both writes.

```text
 A1 (a): THE CORE MAY WRITE TWO SECRETS IN KEY VAULT, AND ONLY THOSE TWO

 YOU, on the admin page                      SCHEDULER, a daily tick
   | fresh sign-in (< 5 min), new PIN twice    | is the signing key 90 days old?
   v                                           v
 [Web] -> [Admin] -> [Safety]: argon2id      [Admin]: make a new signing key; keep
            |                                  |       the old one for checking (SC4)
            v                                  v
 [Secrets] ---- write ----> Key Vault: "pin-hash"         "issuer-signing-keys"
            core role: Secrets Officer on these two secrets only,
                       Secrets User (read) on everything else
            |
            v
 [Audit]: "PIN changed" or "signing key rotated" (never the values)
 Mode A: the same flow; Secrets writes the encrypted file instead of Key Vault.
```

- **(a) Write rights on exactly two secrets.**
  - The core's identity gets Key Vault Secrets Officer scoped to `pin-hash` and to `issuer-signing-keys` only. It keeps Secrets User (read) on the rest.
  - The admin page changes the PIN; the Scheduler and Admin rotate the signing key.
  - How the Issuer picks up a new key (a reload or a restart) is settled at plan.
  - Assumed: Key Vault RBAC accepts a role on a single secret (to verify at plan).
  - $0: Key Vault operations cost cents a year at this volume, and role assignments are free.
  - **The agent's lean.** The extra right adds almost nothing, because a taken-over core can already sign tokens and command the alarm.
- **(b) A runbook on the human's PC.**
  - The core stays read-only. The human changes the PIN and rotates the key with a CLI command under their own Azure sign-in; the admin page links to the runbook.
  - Cons:
    - the PIN change leaves the admin page, which amends lens 8 (U);
    - the 90-day rotation becomes manual, with an alert as a reminder;
    - the core sees new values only after a restart or a periodic re-read.
  - $0.
- **(c) Key Vault holds only root keys and stays read-only.**
  - The PIN hash (with a pepper) and the signing keys (encrypted) live in the database, protected by a root key read from Key Vault.
  - Pros: no Key Vault writes ever; the same code in mode A.
  - Cons:
    - more crypto code of our own;
    - the database and its backups now hold protected secrets;
    - rotating the root key means re-encrypting.
  - It also amends SC4.
  - $0.
- **If accepted,** the amendment goes into devops-operations (DO6), and the rotation owner into security-compliance (SC4).

## A1 decided (2026-10-28)

**The agent asked:** A1, (a), (b) or (c)?

**The human, verbatim, with one redaction:** "a - but create a script, do an Azure Login, select [subscription name, redacted at the human's request] as the subscription. Think what should be in the git repo, or how can we store it in the git repo without telling anything about my specific subscription"

**Why the redaction:** this record is committed and will be public later. The human asked that nothing about their specific subscription goes into git, so the subscription's display name is not written here or anywhere else in the repository.

**Confirmation:** human-confirmed (lens-question, scope A1).

**What was decided:**
- **(a) Write rights on two secrets only.** The core's identity gets Key Vault Secrets Officer on `pin-hash` and on `issuer-signing-keys`, and keeps Key Vault Secrets User (read) on everything else.
- **The PIN is changed on the admin page:** a fresh sign-in, the new PIN twice, argon2id, written through Secrets, audited without the value.
- **The signing key is rotated every 90 days** by the Scheduler (a daily tick) and Admin. The old key is kept for checking (SC4). How the Issuer picks up a new key is settled at plan.
- **Mode A:** the same flow; Secrets writes the encrypted file.
- Cost: $0.
- **Amendments written:**
  - devops-operations, DO6: the allow-list gains Key Vault Secrets Officer, scoped to the two secrets;
  - security-compliance, SC4: the rotation owner.
- **Plan items:**
  - **Assumed:** Key Vault RBAC accepts a role on a single secret. To verify at plan; the bootstrap below does not create the vault, so it cannot verify this.
  - **Placeholders first:** a role can be scoped to a secret only after the secret exists, and a Bicep secret with a value writes a new version on every deploy, which would overwrite the PIN hash.
    - So the first deploy creates both secrets with placeholder values, and later deploys never touch their values.
    - The PIN placeholder is unusable until the human sets a PIN on the admin page (fail closed; disarm is off by default anyway).
    - The core writes the first signing key.

## The human's request: a bootstrap script, and nothing about the subscription in git (proposal, awaiting the human)

```text
 BOOTSTRAP: RUN ONCE BY YOU, FROM YOUR PC (it only prints the plan unless -Apply)

 pwsh infra/bootstrap/bootstrap.ps1 -SubscriptionName '<typed at run time>'
      -GitHubRepo '<owner>/<repo>' -RegistryName '<your registry>' [-Apply]

 STEP                     WHAT IT DOES
 -----------------------  ------------------------------------------------------------
 1 sign in                az login: you sign in in the browser; the script never sees
                          a password
 2 pick the subscription  by -SubscriptionName, or from a numbered list; it shows the
                          one it picked and waits for your "y"
 3 resource group         -ResourceGroup (default rg-ring-mcp-bridge), -Location
                          (default israelcentral); created if missing
 4 deploy identity        a user-assigned managed identity with a federated credential
                          for GitHub OIDC (your repo, environment "production"); no
                          password or client secret anywhere
 5 its roles              on the resource group: Contributor, and role assignment
                          limited to Key Vault Secrets User, Key Vault Secrets Officer
                          (A1), Storage Blob Data Contributor; on your registry:
                          AcrPush, and role assignment limited to AcrPull
 6 GitHub variables       subscription, tenant and client IDs, resource group and
                          registry name, set in the "production" environment with gh;
                          skipped with a message while the GitHub repo does not exist
 Every step checks first and skips what already exists, so it is safe to run again.
 Not in it (possible later, at plan): the Entra app registration, the break-glass group.
```

```text
 WHAT GOES IN GIT (public later)          WHERE YOUR VALUES LIVE (never in git)
 ---------------------------------------  ---------------------------------------------
 infra/bootstrap/bootstrap.ps1:           what you type when you run the script; the
   parameters only; nothing that names    subscription name has no default
   you, your tenant or your subscription
 infra/*.bicep: parameters only           GitHub "production" environment variables:
                                          subscription, tenant and client IDs,
                                          resource group, registry name (DO4)
 infra/main.example.bicepparam:           infra/bridge.local.json, git-ignored and
   placeholders like <your-registry>      optional, so you can rerun what-if from
                                          your PC
 .gitignore: *.local.json,                Key Vault: the runtime secrets (SC4)
   *.local.bicepparam
 a CI check: no GUID anywhere under       the Docker secret and encrypted file at home
   infra/ or scripts/; role IDs are       (SC4)
   looked up by role name at run time
 gitleaks, as a PR check and a
   pre-commit hook (DO4)
```

- **It builds on DO4,** which already puts the subscription, tenant and client IDs in GitHub Actions variables, never in code.
- **The script is PowerShell 7,** which runs on Windows, macOS and Linux, so open-source users can run it too.
- **The script's own rules:**
  - `-SubscriptionName` has no default;
  - no example file, comment or test fixture holds the human's values;
  - it never prints or stores a secret;
  - it creates nothing unless `-Apply` is passed.
- **The agent does not run `az login` or the script.** The sign-in is the human's own, and the script grants rights in their subscription. The human runs it themselves.
- **There is no git remote yet,** so `-GitHubRepo` is required, and step 6 is skipped with a message until the GitHub repository exists. Creating that repository is a separate step that needs its own yes.
- **Cost:** $0. Resource groups, managed identities, role assignments and GitHub variables are free.
- **Found while checking:** `.specrew/handover/session-handover.md` quotes the human's last messages verbatim, including the subscription name. `.specrew/handover/` is not git-ignored. Nothing has been committed.
  - Proposal: add `.specrew/handover/` (and `.specrew/runtime/`) to `.gitignore`.
  - Awaiting the human.
- **If accepted,** the bootstrap joins DO2's runbook steps (an amendment to devops-operations).

## The bootstrap: recorded as a need (2026-10-28)

**The human, verbatim:** "We are in the Workshop stage now, so you do not write any script now, just the need for such a script. We are in the analysis stage."

**Confirmation:** human-confirmed (lens-question, scope: the need for a bootstrap script).

**What was decided:**
- **The need.** A bootstrap script, run once by the human from their PC, does the steps that need the owner's own Azure rights:
  - the sign-in (`az login`);
  - picking the subscription at run time;
  - the resource group;
  - the deploy identity with its GitHub OIDC federated credential;
  - the deploy identity's limited roles;
  - setting the GitHub environment variables.
  - Nothing about the human's subscription goes into git.
- **When:** it is written at implementation, not in the workshop. The agent wrote no script.
- **Scope:** the step list and the git layout above are the agent's proposal, carried to plan. The human did not comment on them, so they are not confirmed.
- **Amendment written:** devops-operations, DO2 (the bootstrap joins the runbook steps as a need).
- **The `.specrew/handover/` finding is carried the same way, as a need:** git-ignore `.specrew/handover/` (and `.specrew/runtime/`), or clean the file, before the first commit. The human did not answer it directly; the agent applies the human's "the need only, no changes now" to it, and changed nothing.

## A2 in detail (proposal, awaiting the human)

```text
 A2 (a): THE PIN TRIES AND THE LOCK ARE KEPT IN THE DATABASE (Command)

 confirm page: PIN -> [Web] -> [Control] -> [Command]: is the lock still running?
                                    |
              yes: refuse with "locked until 14:20"; the PIN is not checked at all
              no:  [Safety]: argon2id check against the PIN hash
                     wrong: tries + 1, saved in the same transaction as its audit
                            entry; the 5th wrong try locks disarm for 15 minutes
                            and raises a HIGH event (SC4)
                     right: tries back to 0, then disarm goes on as decided (D4b)

 A restart, a deploy or an auto-heal: the row is still there, so the count and the
 lock hold. Mode A: the same row in SQLite.
 Per-client rate limits stay in memory (DS1): a restart that resets them does no harm.
```

- **Why it matters.**
  - Today DS1 keeps the PIN counters in memory, so every restart gives 5 fresh tries.
  - App Service restarts on each deploy and on auto-heal, and a crash also restarts it.
  - A PIN has few digits, so repeated restarts would allow guessing.
  - Disarm also needs your fresh Entra sign-in on the confirm page, so this is defense in depth, not the only guard.
- **(a) Keep the tries and the lock in the database.**
  - It is stored in Command: one row per bridge (one owner), holding the try count, the time of the last wrong try, and the time the lock ends.
  - Control asks Command, Safety decides (5 tries and 15 minutes are policy data), and Command saves in the same transaction as the audit entry.
  - $0: one small row on Azure SQL Basic.
  - **The agent's lean.**
- **(b) Keep DS1 as is (in memory).**
  - It needs less code, but restarts reset the count and the lock.
  - $0.
- **(c) Count the wrong tries from the audit log** (the last 15 minutes).
  - No new row, but every PIN check reads the audit chain, and Safety's rule then depends on how audit entries look.
  - $0.
  - Not recommended.
- **Rate limits stay in memory, as DS1 decided.**
- **If accepted,** the amendment goes into data-storage, DS1 (a new "Amendments from later lenses" section).

## A2 decided (2026-10-29)

**The agent asked:** A2, (a), (b) or (c)?

**The human, verbatim:** "a"

**Confirmation:** human-confirmed (lens-question, scope A2).

**What was decided:**
- **(a) The PIN tries and the disarm lock are kept in the database.**
  - Command owns one row for the bridge: the try count, the time of the last wrong try, and when the lock ends.
  - Control asks Command for the row, Safety decides (5 tries and 15 minutes are policy data), and Command saves the result in the same transaction as the audit entry.
  - The 5th wrong try locks disarm for 15 minutes and raises a HIGH event (SC4).
  - A restart, a deploy or an auto-heal no longer resets the count or the lock.
  - Mode A: the same row in SQLite.
- **Per-client rate limits stay in memory,** as DS1 decided.
- **The component map does not change:** Control already calls Command and Safety; Command gains one row.
- Cost: $0, one small row on Azure SQL Basic.
- **Amendment written:** data-storage, DS1 (a new "Amendments from later lenses" section).

## A4 in detail (proposal, awaiting the human)

```text
 A4 (a): LATE EVENTS ARE STORED AND READABLE, BUT NOT PUSHED ONE BY ONE

 HOME  after a gap: the link to the core was down, or the connector restarted
       Ingest, when the link is back:
         1. drains the outbox; an event held there more than 2 min is marked late
         2. if Ring pushes were missed: one Ring history read per location for
            the gap (up to 24 h); each event found is marked late: true and
            keeps its Ring time
         3. one "catch-up done" marker with the count of late events
       ==WSS==>
 CORE  Connector Link -> Event, the same ingest as a live event:
         dedupe on event_id (an event already stored is dropped), seq, append
         Classify: priority as usual (doorbell = HIGH); late: true = not pushed
         get_events by cursor shows them in seq order, with late: true
       on the marker: Event sends ONE event to every agent through Delivery:
         bridge.events_recovered  "3 missed events recovered, oldest at 02:10"
         its priority is the highest among them (a missed alarm -> HIGH)
         it carries the seq range, so the agent reads them with get_events
       nothing late: no push (the Ring-back health event already went out)

 Mode A: the same steps, without the link.
```

- **Why it matters.** Pushed one by one as HIGH, a doorbell press from 3 hours ago reads like someone at the door now, and after a long gap every agent gets a burst of old pushes.
- **New since A4 was first raised: the outbox case.**
  - OR5 marks only the events the history catch-up recovers as late.
  - But when the link to the core is down and the connector is up, events wait in the outbox and are sent when the link returns. After a 3-hour internet outage, they are just as old.
  - The agent proposes one age rule for both: an event held at home more than 2 minutes is late too.
  - The age is measured from the connector's own receive time, not Ring's time (whose accuracy is still to check in the pilot). Both clocks are assumed to be NTP-synced.
  - The 2 minutes is policy data in Classify, tuned in the pilot. It matches the 2-minute stale threshold, and it is far above the 10 s ceiling for HIGH events.
- **(a) Store and show late events; never push them one by one; push one summary.**
  - Classify gives a late event its usual priority, so a missed alarm still shows as HIGH in get_events and in queries. `late: true` means it is not pushed.
  - At the end, Ingest sends a "catch-up done" marker. It is a new message that Connector Link declares (additive).
  - On the marker, Event sends one `bridge.events_recovered` event to every agent. It is a new kind, additive under D2, since D7's kind list is open.
    - It carries the count, the oldest and newest times, and the seq range.
    - Its priority is the highest among the late events.
  - Nothing late: no summary.
  - $0.
  - **The agent's lean.**
- **(b) Push them like live events, marked `late: true`, each with its own priority.**
  - Simpler: no marker and no summary kind.
  - But every agent must check `late` itself. One that does not reacts to a 3-hour-old doorbell press as if someone is at the door now.
  - After a long gap, every agent gets a burst of pushes.
  - $0.
- **Dedupe stays as decided (D4):** an event already stored, for example at the edge of the gap, is dropped on event_id.
- **If (a) is accepted, amendments go to:**
  - requirements-nfr: the priority table; late events are not pushed, and the summary is pushed instead. A new "Amendments from later lenses" section.
  - integration-api, D7: the new kind; `late` also covers the outbox case.
  - observability-resilience, OR5: the age rule and the marker.

## A4 decided (2026-10-29)

**The agent asked:** A4, (a) or (b)? If (a), does the 2-minute age rule for events held at home stay?

**The human, verbatim:** "a"

**The agent's reading:** (a) as rendered. The rendered (a) included the 2-minute age rule in its diagram, so the age rule stays. The agent states this reading to the human.

**Confirmation:** human-confirmed (lens-question, scope A4).

**What was decided:**
- **Late events are stored and readable, but not pushed one by one.**
  - Late means: recovered by the history catch-up, or held at home more than 2 minutes (the outbox case).
  - The age is measured from the connector's own receive time. The 2 minutes is policy data in Classify, tuned in the pilot. Assumed: the home VM's and Azure's clocks are NTP-synced.
  - A late event keeps its priority, so a missed alarm shows as HIGH in get_events and in queries, with `late: true`.
- **One summary push instead.**
  - After draining the outbox and the catch-up, Ingest sends one "catch-up done" marker, a new message that Connector Link declares (additive).
  - On the marker, Event pushes one `bridge.events_recovered` event to every agent, with the count, the oldest and newest times, and the seq range.
  - Its priority is the highest among the late events.
  - Nothing late: no summary.
- **Dedupe stays as decided (D4).**
- **Mode A:** the same steps, without the link.
- Cost: $0.
- **Amendments written:**
  - requirements-nfr: the priority table (a new "Amendments from later lenses" section);
  - integration-api, D7: the new kind, and `late` now also covers the outbox case;
  - observability-resilience, OR5: the age rule and the marker (a new "Amendments from later lenses" section).
- **All of this lens's decision points are now decided.**

## Lens 9 summary (as decided, 2026-10-29)

**C1-C10, stated honestly:** the human did not answer C1-C8 one by one. They are settled by the map the human accepted in CD1, which places each of them, and the summary lists them so the human can change any before "move on". C9's open part was A4; C10 was answered by A3.

```text
 LENS 9 SUMMARY: COMPONENT DESIGN, AS DECIDED (all $0)

 +--------+--------------------+-------------------------------------------------------+
 | #      | Decision           | Decided                                               |
 +--------+--------------------+-------------------------------------------------------+
 | A3     | The gate           | The bridge stays Ring-only: no gate tool, no          |
 |        |                    | GATE_UNAVAILABLE. Gate logic is composed outside the  |
 |        |                    | bridge, over MCP. Later: an analyser seam on the      |
 |        |                    | post-event frame.                                     |
 +--------+--------------------+-------------------------------------------------------+
 | CD1    | Component map      | Map v3 as shown. Lease and Secrets stay separate      |
 |        |                    | components.                                           |
 +--------+--------------------+-------------------------------------------------------+
 | CD2    | Call rules         | Clients call managers; managers call engines and      |
 |        |                    | resource access; a manager never calls a manager      |
 |        |                    | except queued through Pub/Sub; engines do no I/O; any |
 |        |                    | layer may call a utility. X1: the Issuer calls Grants |
 |        |                    | directly. X2: Link transport is a shared utility      |
 |        |                    | owned by Host; on a link drop, in-flight commands     |
 |        |                    | fail with BRIDGE_UNAVAILABLE and are never retried.   |
 +--------+--------------------+-------------------------------------------------------+
 | CD3    | Interfaces         | Only where there is more than one implementation: a   |
 |        |                    | TS type taken in the constructor, bound by Host, no   |
 |        |                    | base classes. Production seams: Ring Access,          |
 |        |                    | Delivery, Media Cache, Audit, Secrets, Query layer.   |
 |        |                    | Test-only: Clock, Link transport, the simulated home, |
 |        |                    | the fake Entra sign-in.                               |
 +--------+--------------------+-------------------------------------------------------+
 | CD4    | Contracts          | Each component exports its own DTOs from its one      |
 |        |                    | entry file; the callee declares; no shared types      |
 |        |                    | file; a CI dependency check. Over the link the        |
 |        |                    | receiver declares. Q1 (a): the Public Contract,       |
 |        |                    | imported only by MCP Endpoint and Delivery, published |
 |        |                    | as JSON Schema. Q2 (c): per-component string-named    |
 |        |                    | brands, applied at edge parsers.                      |
 +--------+--------------------+-------------------------------------------------------+
 | CD5    | Extension          | Composition at start (Host binds the seams from       |
 |        |                    | Config); policy as data (Settings, audited; Config    |
 |        |                    | for pilot-tuned values); Pub/Sub for queued manager   |
 |        |                    | calls; no inheritance trees and no plugins            |
 |        |                    | (contribute by PR or fork).                           |
 +--------+--------------------+-------------------------------------------------------+
 | C1-C10 | Carry-ins from     | C1-C8 were settled by the map you accepted in CD1,    |
 |        | earlier lenses     | not asked one by one: the Issuer (C1); Grants (C2);   |
 |        |                    | the auto-off timer at home, in Execute and Outbox     |
 |        |                    | Store (C3); the last-read mark in Subscriptions (C4); |
 |        |                    | Command (C5); the lease, held by Host through Lease   |
 |        |                    | (C6); the Health engine (C7); the Ring circuit and    |
 |        |                    | the catch-up at home (C8). C9 by A4; C10 by A3.       |
 +--------+--------------------+-------------------------------------------------------+
 | A1     | Key Vault writes   | The core gets Secrets Officer on pin-hash and         |
 |        |                    | issuer-signing-keys only, Secrets User on the rest.   |
 |        |                    | The PIN is changed on the admin page; the 90-day key  |
 |        |                    | rotation is run by the Scheduler and Admin. Amends    |
 |        |                    | DO6 and SC4.                                          |
 +--------+--------------------+-------------------------------------------------------+
 | A2     | PIN lock           | The tries and the lock live in one database row owned |
 |        |                    | by Command, so a restart does not reset them. Rate    |
 |        |                    | limits stay in memory. Amends DS1.                    |
 +--------+--------------------+-------------------------------------------------------+
 | A4     | Late events        | Events recovered by the catch-up, or held at home     |
 |        |                    | over 2 min, are stored and readable with late: true   |
 |        |                    | but not pushed one by one. One                        |
 |        |                    | bridge.events_recovered push instead, with the        |
 |        |                    | highest priority among them. Amends the priority      |
 |        |                    | table, D7 and OR5.                                    |
 +--------+--------------------+-------------------------------------------------------+
 | Need   | Recorded, not      | A bootstrap script you run once (written at           |
 |        | built              | implementation; amends DO2). Git-ignore or clean      |
 |        |                    | .specrew/handover/ before the first commit.           |
 +--------+--------------------+-------------------------------------------------------+
```

**The component map, as decided (map v3; no component was added or removed after v3):**

```text
 COMPONENT MAP v3 (IDesign; v2 + the Public Contract from CD4; calls go only downward)
 * = new since the lens-2 map. Each component exports its own DTOs from its entry
 file; there is no shared types file (CD4).

 AGENTS: ChatGPT + dot, Claude surfaces   CHANNEL SHIM (your PC)   YOU (phone or PC)
            | HTTPS, our tokens                  | HTTPS                  | HTTPS
 ===========v============= AZURE CORE (one instance, B7) v========================v=====
 CLIENTS    [MCP Endpoint]  [Issuer]*  [Web: pages, clip links]*  [Connector Link]
            [Scheduler]  [Host: wiring, lease, /livez, /readyz]*
                 |  clients call managers only
 MANAGERS   [Inquiry]   [Control]   [Media]   [Event]   [Admin]*
                 |  a manager never calls a manager; queued calls go through Pub/Sub
 ENGINES    [Summary]   [Safety]    [Capture] [Classify] [Health]*
                 |  engines are rules only; managers call engines and resource access
 RESOURCE   [Ring Access] [State] [Event Log] [Subscriptions] [Delivery] [Media Cache]
 ACCESS     [Audit] [Command]* [Settings]* [Grants]* [Lease]* [Secrets]*
                 |
 RESOURCES  home link   Azure SQL   Blob (media, WORM)   Key Vault   agents' push
            endpoints   Entra ID (your sign-in)
 UTILITIES  Security | Logging | Pub/Sub | Config | Clock | Link transport*
            | Query layer*   (any layer may call a utility)
 SCHEMAS    [Public Contract]*: the tool schemas and event shape agents see; no logic;
            imported only by MCP Endpoint and Delivery; published as JSON Schema
 =======================================^===============================================
                                        | WSS, dialed out from home (no open ports)
 ====================== HOME CONNECTOR (Docker on the Ubuntu VM) ========================
 CLIENTS    [Setup CLI]   [Core Link]   [Push Listener]   [Home Scheduler]
 MANAGERS   [Execute]: commands, captures, auto-off    [Ingest]: events, outbox, catch-up
 ENGINES    [Normalize]: Ring payloads -> the bridge's event shape
 RESOURCE   [Ring Adapter]: limiter, circuit   [Live Media]   [Outbox Store]
 ACCESS     [Secrets File]
 RESOURCES  Ring cloud (REST, alarm websocket, push, live view)   SQLite   encrypted file
 Mode A (all at home): the same components in one process; Ring Access calls Execute
 directly, and the link, Connector Link and Core Link are not used.
```

**Every component and its job, as decided (the v3 list plus the A1, A2 and A4 responsibilities, marked):**

**Clients (core):**
- **MCP Endpoint** (carried): the MCP server for both protocol eras; checks token and scopes; one tool call becomes one manager call; maps manager DTOs into the Public Contract.
- **Issuer** (NEW): node-oidc-provider. Listed agents link; you sign in with Entra; it issues, refreshes and revokes tokens. Calls Grants directly (X1).
- **Web** (NEW): the admin page, the confirm page, authenticated clip links.
- **Connector Link** (carried): events and heartbeats from home, queued to Event; checks the connector's signed hello; declares EventMessage (N and N-1), now with the catch-up-done marker (A4).
- **Scheduler** (carried): minute ticks for the home-offline check, purges, battery digest, token expiry and WORM shipping; a daily tick for the 90-day signing-key rotation (A1).
- **Host** (NEW): wires mode H or A; owns the Link transport; holds the single-instance lease; `/livez` and `/readyz`.
- **Channel shim** (carried, outside the core, on your PC): relays push to Claude Code.

**Managers:**
- **Inquiry** (CHANGED): every read tool, plus get_events with the last-read fallback.
- **Control** (CHANGED): arm Home and Away, lights with auto-off, disarm. Prepare, then confirm, at most once, lease checked. Siren and chime removed.
- **Media** (CHANGED): frame, burst and clip, including the frame taken after an event; the live viewer only as the O1 stretch.
- **Event** (CHANGED): saves each event in one transaction, sets its priority and sends it to every agent. It also handles health changes and push filters. Late events are stored but not pushed; on the catch-up-done marker it pushes one `bridge.events_recovered` event (A4).
- **Admin** (NEW): your admin-page tasks:
  - agents and revoke, enrollment, switches, owners' agreements;
  - the PIN change and the 90-day signing-key rotation (A1), delete now, the audit view;
  - the Issuer's policy;
  - WORM shipping and the chain check.

**Engines:**
- **Summary** (carried): replies sized to a token budget.
- **Safety** (CHANGED): one-time tokens, the disarm gate, the PIN (5 tries, then a 15-minute lock, counted in Command's row, A2), the fresh sign-in check.
- **Capture** (carried): snapshot, live frame or cached copy; the battery cap.
- **Classify** (CHANGED): priority, motion opt-ins, the battery threshold, the late-event rule: a late event keeps its priority but is not pushed; the 2-minute age limit is data (A4).
- **Health** (NEW): one health view from the heartbeat, last event, database, lease and WORM lag; thresholds as data.

**Resource access:**
- **Ring Access** (carried): the only way to Ring: over the link (H) or in-process (A); later the official adapter. Fails in-flight commands on a link drop.
- **State** (carried): locations, devices, alarm state, health snapshot, each with `as_of`.
- **Event Log** (carried): events by seq, the epoch, dedupe.
- **Subscriptions** (CHANGED): cursors, push filters, the per-client last-read mark.
- **Delivery** (carried): ChatGPT webhooks, listen streams, the channel shim; maps into the Public Contract's event shape; each platform's envelope stays in its adapter.
- **Media Cache** (carried): Blob (a folder in mode A), kept 7 days.
- **Audit** (CHANGED): the hash chain, the database copy, WORM shipping.
- **Command** (NEW): commands, used tokens, the pending disarm, and one row for the PIN tries and the lock, kept across restarts (A2).
- **Settings** (NEW): your switches, listed agents, owners' agreements, the connector key.
- **Grants** (NEW): the Issuer's storage.
- **Lease** (NEW): the single-instance lease row.
- **Secrets** (NEW): Key Vault (the file in mode A); two writes, the PIN hash and the signing keys (A1).

**Utilities:**
- Security, Logging, Pub/Sub, Clock (carried).
- Config (start-up settings only).
- **Link transport** (NEW): the WSS session both ends share; frame types, versions and priority only; media in chunks behind commands, events and heartbeats (X2).
- **Query layer** (NEW): SQLite and T-SQL.

**Schemas:**
- **Public Contract** (NEW, CD4 Q1): the tool schemas and the event shape agents see; published as JSON Schema; the D2 check runs on it; imported only by MCP Endpoint and Delivery; imports nothing.

**Home connector:**
- **Setup CLI** (carried): Ring login and 2FA; the connector key and enrollment code.
- **Core Link** (CHANGED): dials out, receives commands, sends events and the heartbeat; declares CommandMessage.
- **Push Listener** (NEW): Ring push into Ingest.
- **Home Scheduler** (NEW): the heartbeat, resends, due auto-off timers.
- **Ingest** (NEW): normalize, outbox, send. After a gap: drain the outbox, catch up from Ring history, mark as late what was recovered or held over 2 minutes, then send one catch-up-done marker (A4).
- **Execute** (NEW): runs each command once; captures; the auto-off timers.
- **Normalize** (NEW): Ring payloads into the bridge's event shape; a tolerant reader (unknown kinds become `ring.other`); Ring strings marked untrusted.
- **Ring Adapter** (carried): ring-client-api, the shared limiter, the circuit. The simulated home stands in for it in CI (CD3).
- **Live Media** (renamed from the home Capture): werift and ffmpeg for frames, bursts and clips. Fixed test images stand in for it in CI (CD3).
- **Outbox Store** (CHANGED): SQLite with the outbox, executed command_ids, timers, the catch-up mark.
- **Secrets File** (carried): the Ring token, push credentials, device ID, connector key.

**Carry-forwards:**
- **plan:**
  - verify that Key Vault RBAC accepts a role on a single secret;
  - the placeholder-secret approach for the first deploy;
  - how the Issuer picks up a new signing key;
  - the bootstrap's step list and the git layout (the agent's proposal, not confirmed);
  - the catch-up-done marker across versions N and N-1;
  - the marker goes through the durable outbox like any event (at least once, D4), so a lost marker cannot hide a late HIGH event (the agent's proposal, found while writing the summary).
- **code-implementation:**
  - the DI container (P8);
  - the CI dependency check (CD4) and the "no GUID under infra/ or scripts/" check;
  - the validation library for the edge parsers and brands (CD4 Q2);
  - publishing the Public Contract as JSON Schema, and the MCP schema snapshot test;
  - the query layer for SQLite and T-SQL.
- **Pilot:** tune the 2-minute late limit and the Health thresholds; check the clock sync between home and Azure.
- **Before the first commit:** git-ignore or clean `.specrew/handover/`.

## Record hygiene (corrections to the lens-2 map, not decisions)

- **Siren and chime come out of Control.** The siren stayed out of v1 (D7, the human declined it), and the chime was never in the tool catalog.
- **The live viewer in Media exists only as the O1 stretch.**
- **The home "Capture" is renamed Live Media,** so that only one component is called Capture.
- **CD4 no longer maps the gate's JSON;** that line went with A3.
- The v2 and v3 named lists above still say Secrets has one write. A1 made it two (the PIN hash and the signing keys); the as-decided list in the lens summary is current.

## Evidence tags

- **Known:** FliessGateControl's behaviour, read from its code on 2026-10-28, read-only:
  - `GetStateFromTable` is GET only.
  - It returns JSON with:
    - `GateState` as a string of a flags enum (for example "Open, People");
    - `LastUpdated` and `LastStateChanged` as "yyyy-MM-dd HH:mm:ss UTC";
    - `SensorWorking` and `LastGoodSensorReading`.
  - With no state, it returns a 200 with plain text; on an error, a 400 with the message.
  - Its timer runs every 5 minutes, and its `TimerHealthCheck` calls more than 6 minutes unhealthy.
- **Assumed:** Key Vault RBAC accepts a role on a single secret (A1a). To verify at plan.
- **Assumed:** node-oidc-provider's storage adapter fits one `(model, id)` table (as in the DS ERD). To verify at plan.

## Questions to the human

1. Looking at the map and the list: what would you rename, split, merge or move? (Answered: CD1 decided.)
2. CD2: do you accept the two exceptions to the call rules, X1 and X2 (X2 now with the rule and media chunks), or an alternative? (Answered: CD2 decided.)
3. CD3: do the ten seams stand, six for production and four for tests, including the simulated home? (Answered: CD3 decided.)
4. CD4: do the six mapped edges stand, with their tests, the tolerant reader and `ring.other`? (The human set a direction: DTOs per component, exported by the component that declares the schema. The rule, Q1 = (a) and Q2 = (c) are decided: CD4 decided.)
5. CD5: does the extension mechanism stand: composition at start, policy as data, Pub/Sub, no plugins, MCP composition outside? (Answered: CD5 decided.)
6. A1 (now both Key Vault writes: the PIN hash and the signing-key rotation), A2 and A4: which way for each? (A3 and A1 are decided.)
7. The bootstrap script: does the scope match, and should it be written now or as the first implementation task? Should `.specrew/handover/` be git-ignored? (Answered: recorded as needs, written at implementation.)
8. A2: keep the PIN tries and the lock in the database (Command)? (Answered 2026-10-29: (a).)
9. A4: late events, (a) or (b)? If (a), does the 2-minute age rule for events held at home stay? (Answered 2026-10-29: (a), with the age rule.)
10. The lens summary: change anything, or move on? (Answered 2026-10-29: "move on".)

## Pacing

The lens has 5 decision points plus 4 changes to closed lenses (full depth). The agent offers two ways: answer all at once, or go one at a time, starting with CD1 (the map). Awaiting the human's pick. The human first asked about A3, the gate; the agent answered with options (a)-(d) and asked for a pick, keeping the pacing offer open for the rest. The human picked (a) without choosing a pace. The agent re-rendered the v2 map and list and went on one question at a time, starting with CD1, keeping "all at once" open. The human answered CD1 with "Agree". The agent records it and goes on to CD2, still one at a time, keeping "all at once" open. On CD2 the human asked whether the caller hosts the accessor code in X2, and for the pros and cons; the agent answered with the X2 code diagram and the pros and cons, refined the lean, and asked CD2 again. The human answered CD2 with "Agree", read as both X1 and X2. The agent goes on to CD3, still one at a time. The human answered CD3 with "agree". The agent goes on to CD4, still one at a time. On CD4 the human set a direction (independent DTOs per component, exported by the component that declares the schema); the agent revised CD4 and asked to confirm it, with Q1 (the event shape agents see) and Q2 (IDs and timestamps). The human then asked for Q1's pros and cons (decoupling, maintenance, divergence); the agent answered with a diagram and a comparison, kept its lean (a) with three guard rails, and asked again for Q1, Q2 and the revised rule. The human answered "OK, a", read as the rule and Q1 = (a); the agent asks Q2 on its own, with a new option (c). The human answered Q2 with "c"; CD4 is complete. The agent goes on to CD5, still one at a time. The human answered CD5 with "a"; CD1-CD5 are decided. The agent goes on to A1, now covering the signing-key rotation too, still one at a time. The human answered A1 with (a) and asked for a bootstrap script that keeps their subscription out of git; the agent recorded A1, wrote the DO6 and SC4 amendments, and asked to confirm the script's scope and timing before writing it, with A2 and A4 queued after. The human said the workshop records needs only; the agent recorded the bootstrap and the handover finding as needs, wrote no script, and went on to A2. The human answered A2 with "a"; the agent recorded it, wrote the DS1 amendment, and went on to A4, the last open question, adding the outbox case it found while preparing A4. The human answered A4 with "a", read as (a) with the age rule; the agent recorded it, wrote the three amendments, and presented the lens summary with the map and the as-decided list, asking whether to change anything or move on. The human said "move on".

## Lens closed

2026-10-29: the human, verbatim: "move on". Lens 9 is closed; next is lens 10, code-implementation (medium), the last lens.

## Amendments from later lenses

- **2026-11-01, code-implementation I4 (human-confirmed, 2026-10-30):** CD3's simulated home grows into a scenario engine: every device type the bridge supports, scripted scenarios (for example a doorbell at night while armed Away, a flood sensor, the link dropping mid-command) and fault injection (Ring down or slow, a 406, a push gap, a session expiring). It stays generic in the repository; the human's own home is only an optional local-only scenario file under `bridge/test/scenarios/local/`, kept out of git. No change to the component map. See `code-implementation.md`.
- **2026-11-01, code-implementation I4 (human-confirmed, 2026-10-30):** a second oidc-provider stands in for Entra in the integration tests, so the real sign-in code runs over the real protocol. CD3's fake Entra sign-in seam stays for the unit tests. No new dependency (oidc-provider is already in). See `code-implementation.md`.
