# Architecture Core — Ring MCP Bridge

**Depth**: Full.
**Status**: CLOSED 2026-10-25. The human moved on ("Yes, continue") after the balance check.
**Confirmation**: human-confirmed (lens-question). Each decision point was answered by the human in its own turn: decomposition style, stack, topology, home box, building blocks, binding vs preferences, scope (plus the yard-gate requirement), and the balance check.
**Not approved by closing this lens**: spikes S1 (official-API PoC) and S2 (one-request Ring test from Azure) still need the human's separate go.
**Research basis**: `research_notes/Ring MCP bridge architecture options/` (6 notes) and `reports/Ring MCP bridge architecture options.md`.

## Decided by the human so far (2026-10-24)

- **Decomposition style:** IDesign (volatility-based decomposition). Binding.
- **Stack preference:** C# on .NET 10, with dependency injection through the standard .NET container (Microsoft.Extensions.DependencyInjection).
  - **Condition:** if .NET is problematic for Ring, the human accepts another language or a polyglot design of several services in different languages.
  - **Released by the human (2026-10-24):** ".NET 10 is not a must, it is up to you to say what is the best approach and the cons and pro." The stack was reopened, and proposal v3 below answered it.
- **Stack: TypeScript everywhere (human-confirmed, 2026-10-24).** The human said: "Yes, I confirm TypeScript Everywhere as long as the MCP SDK uses the latest protocol standard."
  - **Condition verified (2026-10-24):**
    - The current MCP revision is 2026-07-28 (modelcontextprotocol.io versioning page).
    - TS SDK v2 (`@modelcontextprotocol/server` 2.4.0, released 2026-10-23) negotiates 2026-07-28 through `server/discover`. It also serves clients on 2025-11-25 and earlier from the same server factory, as its `examples/dual-era` shows.
    - The SDK's `LATEST_PROTOCOL_VERSION = '2025-11-25'` constant is only the legacy `initialize` list. Modern revisions live in `SUPPORTED_MODERN_PROTOCOL_VERSIONS = ['2026-07-28']`.
  - **Exception imposed by a client, not by the SDK:** the Claude Code channel shim must connect on the legacy handshake. Claude Code does not register a channel server that negotiates 2026-07-28. The C# plan had the same constraint.
  - **Dependency injection:** MS DI is superseded. The TS container choice is deferred to the code-implementation lens.
- **Topology (human-confirmed, 2026-10-24):** H, hybrid, for the author's deployment. A is kept as an all-in-one mode of the same codebase, for development and for open-source users without Azure. C is out. The human said: "Yes, agree. go on".
  - **Home box candidates (given by the human, 2026-10-24):**
    - a Hyper-V server (2 Xeon CPUs, 128 GB RAM, weak display-only GPU) that can host a new VM, including Linux;
    - an always-on, idle Mac Mini M6 with 24 GB RAM;
    - the human's always-on dev PC;
    - an older, always-on home automation machine that hosts the KNX API bridge.
  - **Chosen (human-confirmed, 2026-10-24, "Yes, continue"):** a dedicated Linux VM on the Hyper-V server, running the connector in Docker.
    - No GPU is needed for occasional frames and short clips.
    - The dev PC keeps only the channel shim, which Claude Code starts itself.
    - Leave the KNX machine alone, so the bridge cannot put the KNX bridge at risk.
    - Keep the Mac Mini free for a possible local vision model later (vision, not v1).
- **Scope for v1 (human-confirmed, 2026-10-25, "I agree"):** IN1-IN7 in v1, O1-O12 out or later, as tabled under Proposal v3. Yard gate (2026-10-25): G1 in v1; gate vision is a separate app acting as an MCP client; no outdoor contact sensor.
- **Best balance (human-confirmed, 2026-10-25, "Yes, continue"):** v3 is the best balance of simplicity, reversibility and future cost. The one-way doors are B1, B2, B4/B5, B8 and B10; the runner-up (.NET core + Node sidecar) was not chosen.
- **Binding constraints vs preferences (human-confirmed, 2026-10-24, "Yes"):** B1-B15 binding, P1-P10 preferences, A1-A4 assumptions, as tabled under Proposal v3. New and approved: B7 (one connector per Ring account owns its session, one core replica), B14 (OAuth 2.1 on the remote endpoint), B15 (licenses read from the repository's license file).

## Research verdicts (2026-10-24)

- **stdio:** needed only for push into a running Claude Code session ("channels"). Channels are a research preview, run as a local stdio subprocess, refuse protocol 2026-07-28, and require a dev-channel flag. Everything else can be remote:
  - ChatGPT gets tools plus push via MCP Events webhooks (requires 2026-07-28 and OAuth).
  - claude.ai, Desktop and mobile get tools only, with no push, so events are pulled through `get_events`; MCP Apps work on claude.ai web.
  - Claude Code gets tools over remote HTTP.
- **C# MCP SDK:** v2.3.0 (2026-10-20), net10.0. One endpoint serves both protocol eras, and it supports MCP Apps, elicitation and `subscriptions/listen`.
  - It has no OAuth authorization server, so an external one is needed. Entra requires a custom domain.
  - It has no MCP Events support, so ChatGPT Events must be hand-built. Risk: the `capabilities.events` key.
- **Ring from .NET:** there is no usable C# library; KoenZomers is stale, EPL-2.0 and returns 406.
  - Our own C# client: about 5–9 person-weeks. The push receiver has no .NET port.
  - A Node sidecar with ring-client-api plus the 2026 fixes: about 1–2 person-weeks, all MIT.
  - Ring broke things three times in 2026.
- **Live video in .NET:** SIPSorcery's license excludes use inside Israel, and the only other managed WebRTC library is experimental.
  - Recommended at the time: a Go media sidecar (the ring-mqtt v6 streamer, or go2rtc) plus ffmpeg. *Superseded by the language comparison: werift inside ring-client-api is enough for v1 H.264 frames and clips.*
  - Official live view is RTSPS or WHEP, so ffmpeg covers it without WebRTC.
- **Azure hosting:**
  - Container Apps with exactly 1 replica, or App Service B1 with Always On, can hold a background worker (about $13–15/month, unverified).
  - Functions MCP is stateless with no push, so it can only be a front.
  - APIM supports MCP tools only.
- **Ring from Azure IPs:** no direct Azure report exists. The ring-mqtt maintainer reports that "most" cloud and VPS ranges are blocked, and all REST calls fail when blocked. Tokens are tied to the hardware ID and must have one owner process. A one-request test would settle it.
- **Foundry:** cannot host a custom MCP server. Hosted agents are session-scoped, idle out, and expose no public OAuth endpoint. Foundry can be an optional client (tool calls time out at 100 s, no `anyOf` in schemas, approvals). It has no push in; the bridge would invoke a Foundry agent itself.
- **Official API for Israel:** private apps are "available to Ring accounts from any country", but whether Israeli-located devices are returned is undocumented. Azure US hosting does not change eligibility, and a cloud IP needs a static egress IP registered with Ring.
  - The API is read-only: devices, webhooks, history, clips, and live view of 30 s (battery) or 60 s (wired). The only control is playing a chime sound, all media is watermarked, and there is no SDK.
  - A PoC with a private app would settle it.

## Proposal v3 (confirmed by the human 2026-10-24/25: stack, topology, building blocks, constraints, scope, yard gate and balance check)

v2 had a C# core and shim, a Node Ring sidecar and a Go media sidecar. v3 is one TypeScript codebase. The topology itself (H vs A vs C) is still an open decision.

### Hybrid topology (recommended)

```text
 CLIENTS
 +--------------+ +---------------+ +--------------------+ +----------------+
 | Claude Code  | | ChatGPT       | | claude.ai, Desktop,| | Foundry agent  |
 | tools+channel| | tools+Events  | | mobile: tools, pull| | (optional)     |
 +---+------+---+ +-------+-------+ | + MCP Apps viewer  | +-------+--------+
     |stdio |HTTPS        |HTTPS    +---------+----------+         |HTTPS
 +---v----+ |             |                   |                    |
 | stdio  | |             |   OAuth 2.1 (external auth server)     |
 | shim   +-+-------------+-------------------+--------------------+
 | (TS)   |               |
 +--------+               v
 ====================== AZURE: Container Apps, exactly 1 replica =================
 |  BRIDGE CORE (TypeScript on Node, MCP TS SDK, both protocol eras)            |
 |  [1] MCP front  [2] tools  [3] safety gate  [4] event pipeline               |
 |  [6] notifiers (ChatGPT Events webhooks, shim channel, Foundry invoke)       |
 |  [7] store (event log, state, audit, media cache)   [8] health               |
 |  [5] Ring access = client of the home connector (seam D)                     |
 ==========================================^======================================
                                           | outbound from home (no open ports):
                                           | events, commands, media; outbox +
                                           | backfill from Ring history on reconnect
 ====================== HOME: always-on box, home IP ============================
 |  HOME CONNECTOR (same TS codebase, run in connector mode)                     |
 |    ring-client-api + 2026 fixes: owns Ring token + push credentials;          |
 |    REST, alarm websocket, push                                                |
 |    live view via werift (in the library) + ffmpeg                             |
 |      -> fresh frame, frame burst, short MP4                                   |
 ==========================================|======================================
                                           v
                                      Ring cloud
```

### Topology comparison

```text
 +---------------------------+------------------+------------------+-------------------+
 |                           | H: HYBRID        | A: ALL AT HOME   | C: ALL IN AZURE   |
 |                           | (recommended)    |                  |                   |
 +---------------------------+------------------+------------------+-------------------+
 | Unofficial Ring access    | home IP: works   | home IP: works   | cloud IP: blocking|
 |                           |                  |                  | can start anytime |
 | Public HTTPS for ChatGPT, | Azure, native    | tunnel needed,   | Azure, native     |
 | claude.ai                 |                  | OAuth at home    |                   |
 | Open ports at home        | none             | none (tunnel)    | n/a               |
 | Home box always on        | yes (connector   | yes (everything) | no                |
 |                           | only)            |                  |                   |
 | Home internet or power    | Azure still      | bridge is gone;  | n/a               |
 | drops                     | answers + sends  | no alert can     |                   |
 |                           | "home offline"   | leave the house  |                   |
 |                           | HIGH (lens 1)    |                  |                   |
 | Where events, audit and   | Azure, region of | home box         | Azure             |
 | cached frames are stored  | your choice      |                  |                   |
 | Azure cost                | ~$15-30/mo (est.)| none             | similar to H      |
 | Moving parts              | 2 deployments +  | 1 process +      | 1 deployment      |
 |                           | home-Azure link  | tunnel           |                   |
 +---------------------------+------------------+------------------+-------------------+
 C is out: Ring's blocking is reputation-based and "can start at any time", so a
 passing test would not make it safe. The official API alone cannot be C either,
 because it has no alarm or control.
 With one TS codebase, A is the same code as H run in all-in-one mode. It stays
 a supported mode for development and for open-source users without Azure.
```

### Stack by part (v3)

```text
 +-------------------+------------------------------+----------------------------------+
 | Part              | Proposed (v3)                | Why                              |
 +-------------------+------------------------------+----------------------------------+
 | Bridge core       | TypeScript on Node (LTS      | reference MCP SDK; same language |
 |                   | pinned in devops), MCP TS SDK| as the Ring library; v2 speaks   |
 |                   | v2 (@modelcontextprotocol/   | 2026-07-28 + legacy, one factory |
 |                   | server 2.4.0)                |                                  |
 | stdio shim        | TypeScript (tiny), legacy    | channels are documented on the   |
 |                   | handshake only               | TS SDK; Claude Code refuses a    |
 |                   |                              | 2026-07-28 channel server        |
 | Ring connector    | TypeScript + ring-client-api | native library; push receiver    |
 |                   | (+ 2026 fixes)               | included; fixes = version bump   |
 | Media             | werift (inside the library)  | enough for H.264 frames and      |
 |                   | + ffmpeg                     | short clips; no extra runtime    |
 | Official adapter  | TypeScript, either mode      | plain HTTP + RTSPS via ffmpeg    |
 | (if PoC passes)   |                              |                                  |
 | DI container      | deferred to code-            | TS has no standard container     |
 |                   | implementation lens          |                                  |
 +-------------------+------------------------------+----------------------------------+
 One codebase, one monorepo. The home connector and the Azure core are the same
 package run in two modes, so the topology becomes a deployment setting.
 IDesign stays binding: managers, engines and resource accessors in TS; Ring
 is a resource behind the Ring access accessor.
 Superseded (v2): C# core and shim, Node Ring sidecar, Go media sidecar.
```

### Building blocks (human-confirmed 2026-10-24)

The human answered "Yes, continue" to the question asking what is wrong or missing in this map, and requested no changes. The component-design lens refines it later.

IDesign layers. Each component hides one thing that will change.

```text
 CLIENTS (entry points; no business logic) ------------------------------------------
  [MCP endpoint]    [Channel shim]       [Connector link]     [Scheduler]
   HTTP, both eras;  stdio on your PC;    unsolicited Ring     heartbeat check,
   tools, MCP Apps   subscribes, gets     events from home     battery digest,
                     push, relays to      (queued calls)       purges, token
                     Claude Code                               expiry
 MANAGERS (use-case sequences) ------------------------------------------------------
  [Inquiry]         [Control]            [Media]              [Event]
   state, history,   arm/disarm, lights,  fresh frame, burst,  ingest, classify,
   motion, summaries siren, chime         clip, live viewer    store, fan out,
                                                               catch-up, health
 ENGINES (rules that change; policy as data) ----------------------------------------
  [Summary]         [Safety]             [Capture]            [Classify]
   token-budgeted    confirmation, PIN,   wired snapshot vs    priority, motion
   replies           disarm gate          live frame; battery  policy, battery
                                          cap per hour         threshold
 RESOURCE ACCESS (one per resource volatility) --------------------------------------
  [Ring] [State] [Event Log] [Audit] [Media Cache] [Subscriptions] [Delivery]
 RESOURCES --------------------------------------------------------------------------
  HOME CONNECTOR      store + blob             ChatGPT Events webhooks,
  (Ring behind it;    (technology: data-       channel shim, listen streams,
  owns the token)     storage lens)            Foundry invoke (later, O4)
 UTILITIES (any layer) --------------------------------------------------------------
  Security (OAuth, client identity) | Logging | Pub/Sub | Config | Clock + time zones
```

**Call rules (IDesign):**
- Clients call managers. Managers call engines and resource access, and engines call resource access.
- A manager never calls another manager directly. It sends a queued call through Pub/Sub, for example Event to Media for a post-event frame.
- Replies to commands (arm, light, capture) are request/response inside Ring Access, which correlates them. Only unsolicited events enter through the Connector link client.
- The channel shim appears once. As a client it subscribes; Delivery pushes to it.
- **Scheduler ticks call:**
  - Event Mgr: heartbeat check (stale marker and HIGH "home offline"), battery digest, event purge.
  - Media Mgr: media purge.
  - Control Mgr: audit purge and confirmation-token expiry.
- **All-in-one mode (A):** Ring Access calls the connector in-process, and the link client receives events in-process.

```text
 HOME CONNECTOR (our code; its insides are designed in the component-design lens)
  [Setup CLI]       you log in to Ring and do 2FA here; the token never leaves the box
  [Ring adapter]    ring-client-api: REST, alarm websocket, push receiver; rate limit
  [Capture]         werift live view + ffmpeg -> frame, burst, short clip
  [Outbox + link]   outbound TLS link to Azure; replays events after an outage
```

### Volatilities and where each one is hidden

```text
 +--------------------------------------+----------------------------------------+
 | What will change                     | Hidden inside                          |
 +--------------------------------------+----------------------------------------+
 | Ring's API (broke 3 times in 2026);  | Ring Access + connector. If S1 passes, |
 | official vs unofficial path          | the official adapter runs in Azure     |
 |                                      | behind the same Ring Access, and its   |
 |                                      | HMAC webhooks become one more client   |
 | Where Ring runs: link vs in-process  | Ring Access (H hybrid vs A all-in-one) |
 | How each agent gets push: ChatGPT    | Delivery                               |
 | Events, channel, listen, Foundry     |                                        |
 | MCP protocol eras and transports     | MCP endpoint                           |
 | How a frame is captured: wired       | Capture engine + Ring Access           |
 | snapshot, battery live view, RTSPS   |                                        |
 | What is HIGH; motion opt-ins;        | Classify engine (rules as data)        |
 | battery threshold                    |                                        |
 | Which actions need confirmation;     | Safety engine (policy as data)         |
 | disarm on/off; PIN                   |                                        |
 | Reply size and summaries per agent   | Summary engine                         |
 | Storage technology                   | State, Event Log, Audit, Media Cache   |
 | Identity provider (Entra or other)   | Security utility                       |
 +--------------------------------------+----------------------------------------+
```

### Flow: a HIGH event (doorbell press)

```text
 RING CLOUD      HOME CONNECTOR        AZURE CORE                      AGENTS
 1 push: ding -> 2 normalize, write
                   to outbox
                 3 send on link -----> 4 Connector link -> Event Mgr
                                         (queued)
                                       5 Classify: doorbell = HIGH
                                       6 Event Log: append (durable)
                                       7 Delivery: fan out ----------> ChatGPT webhook
                                                             --------> channel shim
                                                             --------> listen streams
                 9 outbox cleared <--- 8 ack
 10 Afterwards (queued via Pub/Sub) Media Mgr asks the Capture engine for a frame:
    wired camera   -> forced snapshot
    battery camera -> Ring's own event snapshot, or nothing until an agent asks
                      (no unprompted live view: lens 1 refusal)
    The event gets a resource_link to the frame. The frame never delays step 7.
 Budget: steps 4-7 <= 0.5 s p95 (lens 1). End to end: goal 5 s, ceiling 10 s.

 Home offline: Scheduler sees no connector heartbeat for 2 min -> Event Mgr raises
 HIGH "home offline" -> Delivery. Works because the core is in Azure (topology H).
```

### Binding constraints vs preferences (human-confirmed, 2026-10-24)

The human answered "Yes" (2026-10-24) to "Do you agree with B7, B14 and B15? Would you move anything between binding and preference, or add a constraint I missed?". Recorded as: B7, B14 and B15 approved; nothing moved between binding and preference; nothing added. The other rows restate decisions already made or lens 1 requirements.

**Wording clarified after the yes (2026-10-24; clarifications, not changes; shown to the human with the scope proposal):**
- **B7:** "one connector *per Ring account*", so it agrees with O9 (several accounts later, one connector each).
- **B12:** the home-offline alert needs topology H. In all-in-one mode A the core is the home box and cannot report its own outage.

```text
 +-----+----------------------------------------------------------+---------------------+
 | #   | Binding (breaking it means redesign)                     | Source              |
 +-----+----------------------------------------------------------+---------------------+
 | B1  | IDesign layers and call rules                            | you                 |
 | B2  | TypeScript on Node everywhere; MCP TS SDK v2 serving     | you                 |
 |     | 2026-07-28 plus the legacy handshake                     |                     |
 | B3  | Topology H for your deployment; A as all-in-one mode of  | you                 |
 |     | the same code; never C                                   |                     |
 | B4  | Unofficial Ring access only from the home connector,     | research            |
 |     | never from Azure                                         |                     |
 | B5  | Ring token, push credentials and device ID stay on the   | lens 1              |
 |     | connector; no tool exposes them                          |                     |
 | B6  | No inbound ports at home: the connector only connects    | lens 1 / H          |
 |     | out                                                      |                     |
 | B7  | Exactly one connector per Ring account owns its session, | you (new, approved) |
 |     | and exactly one core replica runs (single-instance       |                     |
 |     | lease)                                                   |                     |
 | B8  | Safety gate enforced in the core: client-bound 2-min     | lens 1              |
 |     | confirmation, PIN + human for disarm, disarm off by      |                     |
 |     | default, fail closed                                     |                     |
 | B9  | No unprompted live view on battery cameras; per-hour cap | lens 1              |
 | B10 | Durable before delivery: connector outbox, append to     | lens 1              |
 |     | event log, then push; at-least-once with dedupe id;      |                     |
 |     | cursors survive restart                                  |                     |
 | B11 | Bridge-internal latency <= 0.5 s p95; media never delays | lens 1              |
 |     | an event                                                 |                     |
 | B12 | Honest freshness: as_of on every reply; stale marker and | lens 1              |
 |     | home-offline HIGH within 2 min (the alert needs H)       |                     |
 | B13 | Ring content (names, event text, images) is data, never  | lens 1              |
 |     | instructions                                             |                     |
 | B14 | Remote MCP endpoint requires OAuth 2.1; no anonymous     | you (new, approved) |
 |     | access (provider chosen later)                           |                     |
 | B15 | Dependency licenses checked from the repository's        | you (new, approved) |
 |     | license file; no use-restricted licenses                 |                     |
 +-----+----------------------------------------------------------+---------------------+

 +-----+----------------------------------------------------------+---------------------+
 | #   | Preference (can change without redesign)                 | Decided in          |
 +-----+----------------------------------------------------------+---------------------+
 | P1  | Container Apps (1 replica) vs App Service B1             | devops              |
 | P2  | Azure region (Israel Central if services are offered)    | devops              |
 | P3  | Linux VM on the Hyper-V server (the same Docker image    | you, devops         |
 |     | runs on the Mac)                                         |                     |
 | P4  | Storage technology (SQLite vs Azure Tables + Blob)       | data-storage        |
 | P5  | Identity provider (Entra or other)                       | security            |
 | P6  | Ring library variant: ring-client-api + fixes, tsightler | S5, component       |
 |     | fork, or ring-mqtt client                                |                     |
 | P7  | Home-Azure link: direct WebSocket over TLS vs Azure Web  | integration         |
 |     | PubSub or Relay                                          |                     |
 | P8  | DI container for TypeScript                              | code-impl.          |
 | P9  | Azure budget around $15-30 a month                       | lens 1: no driver   |
 | P10 | Official API adapter, only if the S1 PoC passes          | S1                  |
 +-----+----------------------------------------------------------+---------------------+

 +-----+----------------------------------------------------------+---------------------+
 | #   | Assumption recorded as a constraint                      | Check               |
 +-----+----------------------------------------------------------+---------------------+
 | A1  | Ring cloud to connector takes about 1-3 s                | measure in pilot    |
 | A2  | Ring keeps accepting your residential IP                 | watch for 406       |
 | A3  | werift is good enough for H.264 frames on your cameras   | S6                  |
 | A4  | ChatGPT accepts capabilities.events from the TS SDK      | S4                  |
 | A5  | Both yard-gate cameras are wired (images <= ~10 s old)   | power_mode, pilot   |
 +-----+----------------------------------------------------------+---------------------+
```

### Scope for v1 (human-confirmed 2026-10-25; one new request open)

Architecture scope only. Product scope (MVP and non-goals) was confirmed in `product-domain.md` and is not reopened here. Every deferred item has a named follow-up, not vague "future work". Rows marked * are the human's call; the rest restate earlier decisions.

**Human answer (2026-10-25):** "I agree". Recorded as: every row as proposed. IN2 is local-only (the optional user-supplied tunnel was not chosen; it can be revisited in integration-api or devops). IN7 (no `anyOf` in tool input schemas) is adopted now. O1 is a stretch goal. O4 is later. The B7 and B12 wording clarifications were shown in the same message and accepted with the same answer. In the same message the human raised a new requirement: the yard gate (below).

```text
 +-----+------------------------------------------+-------------+----------------------+
 | #   | In v1 (architecture)                     | Status      | Note                 |
 +-----+------------------------------------------+-------------+----------------------+
 | IN1 | Core in Azure + home connector + Claude  | v1          | topology H           |
 |     | Code channel shim                        |             |                      |
 | IN2 | All-in-one mode: one process at home, no | v1 *        | local clients only:  |
 |     | Azure                                    |             | no ChatGPT, no home- |
 |     |                                          |             | offline alert        |
 | IN3 | One MCP endpoint, 2026-07-28 + legacy    | v1          | B2                   |
 | IN4 | Live video levels 1-3: fresh frame,      | v1          | wired and battery    |
 |     | burst, short clip                        |             | rules per B9         |
 | IN5 | ChatGPT MCP Events delivery (hand-built) | v1          | S4 de-risks it       |
 | IN6 | One Ring account per deployment (owned   | v1          | product MVP          |
 |     | locations; shared read-only optional)    |             |                      |
 | IN7 | Tool input schemas without anyOf, so a   | v1 *        | or leave to the      |
 |     | Foundry agent can call the tools         |             | integration-api lens |
 +-----+------------------------------------------+-------------+----------------------+

 +-----+------------------------------------------+-------------+----------------------+
 | #   | Out of v1, or later                      | Status      | Named follow-up      |
 +-----+------------------------------------------+-------------+----------------------+
 | O1  | Level 4: MCP Apps live viewer (1-2 fps)  | stretch *   | built last, cut      |
 |     |                                          |             | first; else v1.1     |
 | O2  | Raw HLS/WebRTC stream URL to an agent    | never       | privacy              |
 | O3  | Official Ring API adapter                | after S1    | only if S1 passes    |
 | O4  | Bridge pushing into a Foundry agent      | later *     | the map marks this   |
 |     | (Delivery to Foundry)                    |             | resource "later"     |
 | O5  | Rules engine ("when X, do Y for N min")  | vision      | lens 1 decision      |
 | O6  | Motion -> KNX lights                     | outside     | KNX side reads the   |
 |     |                                          | the bridge  | motion stream        |
 | O7  | Local vision model on the Mac Mini       | vision      | frames already       |
 |     |                                          |             | available as input   |
 | O8  | H.265 2K/4K video (Go streamer)          | later       | behind the media     |
 |     |                                          |             | access seam          |
 | O9  | Several Ring accounts per deployment     | later       | one connector each   |
 |     |                                          |             | (B7)                 |
 | O10 | Second core replica / high availability  | never in v1 | B7                   |
 | O11 | Home Assistant / MQTT export             | out         | ring-mqtt does it    |
 | O12 | Topology C (Ring access from Azure)      | never       | B4                   |
 +-----+------------------------------------------+-------------+----------------------+
 * = your call; the other rows restate earlier decisions
```

**Open choice on IN2:** mode A is local-only (Claude Code through the shim or localhost), or mode A plus an optional, user-supplied outbound tunnel (documented, not built) that exposes the endpoint behind OAuth (B14). A tunnel connects out, so B6 still holds.

### New requirement: yard gate state (raised and decided by the human 2026-10-25: G1)

**Decision (human, 2026-10-25):** "G1 is enough - I will do G2 in another app, G3 - too much". Recorded as:
- **G1 in v1:** the bridge serves the latest gate images on request through the frame tool. No change to the confirmed scope or map.
- **G2 outside the bridge:** the human will build gate vision as a separate app that is an ordinary MCP client of the bridge. O7 stays out of the bridge.
- **G3 rejected:** no outdoor contact sensor.
- **B16 withdrawn by the agent, not decided by the human:** under G1 the bridge derives no state from images, so the rule belongs to the other app. The human was told and can reinstate it.
- **Carried to integration-api:**
  - the frame tool takes a freshness bound (for example `max_age_s`), so a polling app reuses the cached image instead of calling Ring each time, and every refresh goes through the Ring rate limiter;
  - the other app can subscribe to motion events from the two gate cameras to know when to fetch a frame (the filterable motion stream is already v1);
  - under topology H the other app reaches frames through the Azure endpoint with OAuth (B14), so frames travel home -> Azure -> app. Whether a LAN path is warranted is an integration-api question.
- **New assumption A5:** both gate cameras are wired, so their images are at most ~10 s old. Verify from `power_mode` in the pilot. If one is battery-powered, its image can be up to ~10 min old.
- **Pending with the human:** check that Ring Modes keep motion detection on for the two gate cameras, or Ring returns no snapshot.

Analysis as presented to the human before the decision:

The human said: "I need to know if the yard gate is open or close and if no car is in the way. I have two ring cameras that spot this gate. I do not need the video strem, but just the last image snapshot, will I have it? Will an agent or an ML code can get this data?"

- **Last image:** yes. Wired cameras give an on-demand snapshot no more than ~10 s old without a stream, recording or battery cost (ring-client-api, ring-mqtt; see `research_notes/Ring MCP bridge architecture options/live_video_and_frame_capture.md` section 2). Battery cameras give a cached image up to ~10 min old (unverified on 2026 firmware); a fresh one needs live view, which B9 forbids unprompted.
- **Snapshot blockers:** Ring blocks snapshots when motion detection is off for the camera (Modes, or Record Motion off), and battery cameras cannot snapshot while recording.
- **Who can read it:** an agent through the frame tool, or the human's own ML code acting as an MCP client of the same tool.
- **G2 caveats:** the analyzer must run at home (connector or Mac Mini) so frames stay home, per the lens 1 privacy target. It is opt-in per camera, and its refreshes go through the Ring rate limiter: two wired cameras every 30 s (ring-mqtt's wired default) is about 5,800 Ring calls a day, which weighs on A2. Choosing G2 amends the confirmed product MVP and pulls O7 forward: record it in product-domain as an amendment, and render the map delta (Analyze engine, model access) before it is accepted.
- **G3 check:** Ring sells an Alarm Outdoor Contact Sensor (Z-Wave, through the Ring Alarm base). A Home Assistant user reports it imports through the hub with ring-mqtt. Its device type in ring-client-api is unverified: `RingDeviceType` has no outdoor-specific entry, so it probably reports as `sensor.contact`. Ring's US page says Ring Alarm ships to the US and Canada only; the human already runs Ring Alarm in Israel, so this is a sourcing check, not a blocker.
- **Proposed B16 (needs the human's yes):** a state derived from images is advisory. It carries confidence and as_of and is never a safety interlock, for example for closing a motorized gate.
- **Open questions to the human:** which two cameras (wired or battery); the use (ask on demand, alerts, or an automation precondition); whether the gate is motorized with a state output (for example on KNX).

```text
  [gate cam 1]  [gate cam 2]     wired: forced snapshot, <= ~10 s old, no stream,
        |             |          no battery cost.  battery: last cached image, up to
        v             v          ~10 min old; a fresh one needs live view (B9)
  connector Capture ---> latest image per camera (JPEG + as_of + age)
        |
        +--> agent: get_fresh_frame(cam) -> the model looks at it        G1 (v1)
        +--> your ML code (e.g. on the Mac Mini) as an MCP client,       G1 (v1)
        |    same tool, same JPEG
        +--> Gate watch: refresh on interval + on motion -> analyzer     G2 (?)
             at home (frames stay home)
             -> virtual sensor  yard_gate: open|closed|unknown,
                                blocked: yes|no|unknown, confidence, as_of
             -> events: "gate left open N min", "gate opened while armed"

  [Ring Outdoor Contact Sensor on the gate] -> alarm path -> open/closed  G3 (v1 path)

 +----+------------------------------------+-------------------------+-------------------+
 | #  | Option                             | Answers                 | Scope impact      |
 +----+------------------------------------+-------------------------+-------------------+
 | G1 | Frames on request; the agent or    | open/closed and "car in | none: levels 1-2  |
 |    | your ML code looks at them         | the way", when asked    | are already v1    |
 | G2 | Gate watch: the bridge refreshes   | both, all the time,     | reopens MVP + O7; |
 |    | the gate images; an analyzer at    | with alerts on change   | new Analyze       |
 |    | home turns them into a virtual     |                         | engine + model    |
 |    | sensor; opt-in per camera          |                         | access; more Ring |
 |    |                                    |                         | calls (rate-      |
 |    |                                    |                         | limited)          |
 | G3 | Ring Outdoor Contact Sensor on the | open/closed only;       | likely none:      |
 |    | gate                               | instant, no ML          | verify its Ring   |
 |    |                                    |                         | device type       |
 +----+------------------------------------+-------------------------+-------------------+
```

### Best balance check (human-confirmed 2026-10-25)

The human answered "Yes, continue" to "Does this balance hold for you? Would you weigh any trade-off differently? If it holds, say 'move on'". Recorded as: the balance holds, no trade-off reweighed, and move on to the next lens.

The last architecture-core decision point: which option best balances simplicity, reversibility and future cost. This checks the confirmed v3 design against those three; it does not reopen it.

```text
 +---------------+---------------------------------------------+------------------------+
 | Criterion     | How the chosen design (v3) scores           | Watch item             |
 +---------------+---------------------------------------------+------------------------+
 | Simplicity    | one language, one codebase; three           | ChatGPT Events is      |
 |               | deployables (core, connector, shim) built   | hand-built (S4)        |
 |               | from it; one core replica; no media sidecar |                        |
 | Reversibility | topology is a setting (H <-> A); Ring path  | the B rows are the     |
 |               | hidden in Ring Access (official adapter can | expensive ones to undo |
 |               | slot in); host, storage, identity, link and |                        |
 |               | DI are all preferences (P1-P8)              |                        |
 | Future cost   | a Ring break is a dependency bump in one    | TS is your second      |
 |               | module; both MCP eras in one endpoint;      | language; Ring ToS and |
 |               | Azure ~$15-30/mo                            | IP blocking (A2)       |
 +---------------+---------------------------------------------+------------------------+

 One-way doors (costly to change later)    Two-way doors (cheap to change later)
  B1 IDesign layers and call rules          P1 Container Apps vs App Service
  B2 TypeScript everywhere                  P4 storage technology
  B4/B5 Ring access and secrets at home     P5 identity provider
  B8 safety gate in the core                P7 home-Azure link
  B10 durable-before-delivery event path    H vs A topology (one setting)

 Runner-up: .NET core + Node Ring sidecar. Your strongest language for the core, but
 a cross-language contract, two toolchains and ~1-2 extra weeks. Not chosen:
 you confirmed TypeScript everywhere on 2026-10-24.
```

### Live video levels

```text
 +----+--------------------------------+-----------------------------+---------------+
 | Lv | What the agent/user gets       | Cost / caveat               | Proposed      |
 +----+--------------------------------+-----------------------------+---------------+
 | 1  | fresh frame (JPEG + its age)   | wired: forced snapshot      | v1            |
 |    |                                | <= ~10 s; battery: short    |               |
 |    |                                | live view + frame grab      |               |
 | 2  | frame burst (5-8 frames)       | ~300 tokens/frame @640x360  | v1            |
 | 3  | short live MP4 clip (N s)      | via resource_link; saved as | v1            |
 |    |                                | a recording in Ring app     |               |
 | 4  | MCP Apps live viewer (1-2 fps) | claude.ai web, ChatGPT, VS  | v1 stretch?   |
 |    |                                | Code; public endpoint+OAuth |               |
 | -  | raw HLS/WebRTC stream URL      | weakest privacy             | no            |
 +----+--------------------------------+-----------------------------+---------------+
```

### Language strategy comparison (requested by the human, 2026-10-24)

**Correction to the stack proposal above:** drop the three-runtime design as the default.
- ring-client-api already does live view through werift, and homebridge-ring ships live view on it.
- ring-mqtt v6 replaced werift with Go ringstream for "native H.265 2K/4K streams and overall higher bitrates while using significantly less CPU and memory". Its changelog states no werift defect.
- For frame grabs and short clips over H.264 (the "Compatible" path), werift is sufficient.

The channels reference says the hard requirement is "@modelcontextprotocol/sdk package and a Node.js-compatible runtime". So a TypeScript shim is the low-risk default, and a C# shim is a spike (S3).

```text
 +---------------------+----------------+----------------+------------------+----------------+
 | Aspect              | 1 TypeScript   | 2 .NET only    | 3 .NET core +    | 4 .NET + Node  |
 |                     |   only         |                |   1 Node sidecar |   + Go sidecar |
 +---------------------+----------------+----------------+------------------+----------------+
 | MCP SDK (all Tier 1 | reference SDK; | v2.3, dual-era | = 2 for the core | = 3            |
 | on 2026-07-28)      | Claude Code    | endpoint, MCP  |                  |                |
 |                     | runs on it     | Apps (exp.)    |                  |                |
 | Claude Code channel | native,        | C# shim is a   | TS shim on your  | = 3            |
 | shim                | documented     | spike          | PC (or C# spike) |                |
 | ChatGPT MCP Events  | hand-built;    | hand-built +   | = 2              | = 2            |
 |                     | TS experiments | caps.events    |                  |                |
 |                     | to borrow      | workaround     |                  |                |
 | OAuth server        | external (tie) | external (tie) | external (tie)   | external (tie) |
 | Ring REST + alarm   | native library | port 5-9 wks   | native, sidecar  | = 3            |
 | Push receiver       | native library | no .NET port   | native, sidecar  | = 3            |
 | Live video / frame  | werift in lib  | BLOCKED: no    | werift, sidecar  | Go: H.265 2K/4K|
 |                     |                | usable WebRTC  |                  | less CPU       |
 | Ring breaks (3 in   | dependency     | port each fix  | bump in sidecar  | bump, 2 places |
 | 2026)               | bump           | by hand        |                  |                |
 | Runtimes to ship    | Node + ffmpeg  | .NET + ffmpeg  | .NET + Node +    | .NET + Node +  |
 |                     |                |                | ffmpeg           | Go + ffmpeg    |
 | Internal contract   | same language  | none           | cross-language,  | two contracts  |
 |                     | both ends      |                | on home/Azure    |                |
 | Build/test stacks   | 1              | 1              | 2                | 3              |
 | OSS contributors    | Ring community | few Ring .NET  | must know both   | must know 3    |
 |                     | is TS/Node     | devs           |                  |                |
 | IDesign + DI        | works (TS DI   | natural home,  | core natural     | = 3            |
 |                     | containers)    | MS DI          |                  |                |
 | Human's stated pref | released 2026-10-24 (".NET 10 is not a must"); no longer a factor   |
 | Time to v1 (est.)   | fastest        | +5-9 wks, and  | +~1-2 wks for    | more again     |
 |                     |                | no live video  | contract (est.)  |                |
 +---------------------+----------------+----------------+------------------+----------------+
```

**Also dismissed:**
- **Python-only:** python-ring-doorbell has no Ring Alarm support.
- **Go-only:** there is no Go Ring client for REST, alarm or push (ringstream is video-only), so it has the same porting problem as .NET.

**Analysis:**
- Option 2 is out on evidence.
- Option 4 is redundant unless 2K/4K H.265 viewing is needed. If it is, the media accessor seam allows it later.
- The real contest was between option 1 and option 3. The deciding question was whether .NET for the core is a requirement or a preference. The human answered: not a must.

**Recommendation (2026-10-24; confirmed by the human the same day, with the latest-protocol condition verified above): option 1, TypeScript everywhere.** This replaces the option 3 recommendation in `reports/Ring MCP bridge architecture options.md`. That recommendation assumed .NET was a preference to keep.
- **Ring access is the most volatile part.** Ring broke it three times in 2026. In TS each fix is a dependency bump, and if the single maintainer goes quiet we can fork and patch in our own language.
- **Everything hard already exists in TS:** the push receiver, live view through werift, and the documented Claude Code channel shim.
- **No cross-language contract.** Option 3's estimated +1–2 weeks disappear; the home/Azure contract becomes one shared TS package.
- **Topology becomes a deployment setting.** One codebase runs as core, connector, or both in one process, so hybrid vs all-at-home is cheap to change later.
- **Honest costs:**
  - The human's strongest language is C#, so review and maintenance happen in their second language.
  - TS has no standard DI container; the choice is deferred to the code-implementation lens.
  - TS checks types only at compile time. For the safety gate, mitigate with strict mode, schema validation at every boundary, and the confirmation-token tests from lens 1.
- **What would reverse it:** if the human will be the long-term sole maintainer and is much faster in C#, option 3 stays defensible at the cost of the contract and two toolchains.

### Spikes proposed before plan

- **S1:** official API private-app PoC, built in TypeScript. The human must register; pending the human's go. Secrets rule, independent of tooling: the human enters the secrets themselves, the agent never sees them, and they are encrypted at rest and never printed. The concrete mechanism is TBD in the security-compliance lens.
- **S2:** one-request Ring test from Azure. Touches Ring; pending the human's go. *Downgraded to informational:* blocking is reputation-based and "can start at any time", so a pass would not move unofficial Ring access to Azure.
- **S3:** *dropped under option 1* (it was the C# shim channel check). The TS shim is the documented path.
- **S4:** prototype the ChatGPT MCP Events `capabilities.events` key on the TS SDK v2. It is unverified whether the TS SDK accepts an extra top-level capabilities key.
- **S5:** Ring sidecar push working with the fixed push library and persisted push credentials.
- **S6:** time-to-first-frame on the author's cameras.

## Amendments from later lenses

- **2026-10-26, observability-resilience (human-confirmed):** the B7 single-instance lease lives in the core database (one row, holder and expiry, renewed every 15 s, expiring after 45 s). No database, no lease, no control (fail closed). See `observability-resilience.md`.
- **2026-10-26, devops-operations (human-confirmed):** G1 amended. Besides frames on request, the bridge reads the gate status (read-only) from the human's existing FliessGateControl Azure Function, which alone opens and closes the gate. Also: P1 is App Service B1 Linux (not Container Apps), and P2 is Israel Central. See `devops-operations.md`.
- **2026-10-28, component-design (human-confirmed):** the 2026-10-26 G1 amendment is reversed. G1 is again frames only: agents see the gate through `get_frame` on the two Ring cameras that view it. The bridge does not read the gate status. FliessGateControl keeps its own ML state, and may later get its own MCP server as a separate project, so the bridge stays a general, Ring-only open-source project. An optional analyser on the post-event frame (event tags) is listed as later, out of v1. See `component-design.md`.
