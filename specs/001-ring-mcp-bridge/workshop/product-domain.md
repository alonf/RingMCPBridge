# Product & Problem Domain — Ring MCP Bridge

**Depth**: Deep. This is a new product. It controls physical security, and Ring itself enforces no PIN. There is legal and privacy exposure. The distribution model shapes every later decision.
**Confirmation**: human-confirmed (lens-question), 2026-10-23.
**Structured record**: `product-domain.yml` (same folder).
**Research basis**: `reports/Ring MCP bridge research.md`.

## Context

```
   +--------------------+        MCP         +---------------------------+
   | AI agents          |<------------------>|  RING MCP BRIDGE          |
   | Claude Code,       |  tools / events /  |  devices, sensors, events,|
   | ChatGPT, others    |  snapshots         |  media, gated control     |
   +--------------------+                    +------+-------------+------+
                                                    |             |
                                     official (likely N/A   unofficial (primary:
                                     in Israel; optional)   alarm + control + events)
                                                    v             v
                                     +----------------+   +---------------------+
                                     | Ring Partner   |   | api.ring.com + alarm|
                                     | API            |   | websocket + FCM push|
                                     +----------------+   +---------------------+
                                                    \             /
                                                     v           v
                                              Ring cloud -> devices
                                   (no local API: Ring cloud down = nothing works)
```

## Users and stakeholders

- **Primary user:** the author, who owns the Ring account and uses AI agents daily (known).
- **Secondary users:** other Ring owners who use the public MIT-licensed GitHub project (known).
- **Who can be harmed:**
  - The author's household, through a wrong arm/disarm or a missed alert.
  - The owners of the shared locations (the mother-in-law and the brother). Their consent and privacy are involved.
  - Visitors and passers-by who appear on camera.
  - The author's Ring account, which can be blocked or terminated.

## Pain and current workaround

- **Today:** the Ring app, Alexa Announce, and Ring notification emails that ChatGPT reads and reacts to (known).
- **The gap:** information reaches the agent late, the agent sees no device or sensor state, and it cannot act.

## The author's installation (known)

- **Owned location:** one location, in Israel. It has a Ring Alarm with roughly 40 contact sensors, 18 motion detectors, 3 flood sensors, keypads and a base station. There are 6 cameras and doorbells, 2 of them battery-powered. The plan is Ring Multi, and end-to-end encryption is off.
- **Shared locations:** the mother-in-law's home (same yard and same LAN, with its own Ring Alarm) and the brother's location. The author is a shared user on both.

## Constraints

- **Official API availability (unknown, accepted; load-bearing):** the official API's Appstore is US-only, and the author's location is in Israel. Whether a private app works there is unverified. See "Accepted unknowns" below.
- **Unofficial path risks (known):**
  - It conflicts with the Ring ToS, section 2(h).
  - Ring's Cloudflare firewall blocks datacenter IPs (HTTP 406).
  - Breaking changes happen roughly once a year.
- **Hosting:** local or Azure. Whether the unofficial path works from Azure is unknown and load-bearing (accepted, see "Accepted unknowns" below).
- **People:** a solo author, who has the time.

## MVP (confirmed)

1. **Owned locations:** device inventory and health, plus **sensor battery levels** with low-battery tracking.
2. **Alarm:** the alarm mode, plus full sensor state (contact, motion and flood).
3. **Events:** a prioritized event log with a durable `get_events` cursor. Flood, alarm and doorbell events are high priority; motion is low.
4. **Real-time push** to **both** Claude Code (channels) and ChatGPT (MCP Events).
5. **Media:** snapshots on demand, and the clip for a given event.
6. **Control:** arm Home/Away with confirmation; floodlight on/off.
7. **Disarm:** built in v1 but **off by default**. When enabled, it requires a PIN that is never in the model's context, plus out-of-band human confirmation.

**Optional in v1:** shared locations, read-only by default, behind a configuration option.

## Non-goals (v1)

- Face recognition.
- Hosted multi-user SaaS.
- Changing Ring settings.
- Two-way audio.
- Continuous recording.
- Panic or emergency dispatch.
- Blink, shutters, Echo devices and other non-Ring devices.

## Success metrics (confirmed)

- A high-priority event reaches the agent within 10 seconds.
- The bridge runs a week without a manual re-login.
- Zero unconfirmed high-risk actions.
- A new user gets their first event within 15 minutes.

## Alternatives beaten

- **Home Assistant + ring-mqtt + ha-mcp:** a heavy stack with no MCP push.
- **Existing Ring MCP servers:** stale, unfinished, fragile or read-only.
- **Ring's official MCP:** documentation search only.
- **Alexa:** "Control not supported", and no read API. It was considered and rejected as a backend.

## Rollout and name

- **Rollout:** pilot on the author's homes first, then publish as public MIT open source.
- **Name:** **Ring MCP Bridge** (`ring-mcp-bridge`), chosen by the human. It follows the ring-mqtt naming precedent. It needs an "unofficial, not affiliated with Ring or Amazon" disclaimer and no Ring logo.

## Accepted unknowns (owner decision, 2026-11-02)

At the design-analysis stop, the owner accepted the two load-bearing gaps as unknown. Planning goes ahead without them. The research is postponed to development time, on the owner's condition: the known options stay open, and the research is what chooses between them.

**S1, official Ring access for an Israel-located account.** The known options for how the bridge reaches Ring:

1. **The unofficial cloud API** (ring-client-api), called from the home connector. This is the v1 default and is what Option B builds.
2. **The official Partner API** through a private app (OAuth sign-in, webhooks). It is available only if an Israel-located account can register and link one.
3. **Both:** the official API for what it covers, and the unofficial one for the rest.

The research decides whether options 2 and 3 are open. Only Ring Access (core) and Ring Adapter (home) change between options.

**S2, unofficial Ring calls from a datacenter IP.** The known options for where the bridge's Ring calls originate:

1. **The home connector**, over residential egress. This is topology H and the v1 default.
2. **The cloud core directly**, from Azure. That would make a cloud-only deployment possible for owners with no machine at home. The known evidence (Ring's firewall returns HTTP 406 to datacenter IPs) points against it.
3. **The cloud core through a residential egress proxy.** This adds cost and carries the same ToS conflict.

The research decides whether a cloud-only mode is worth offering to other owners later. v1 does not depend on the answer. The test itself can get the account flagged, so its method is chosen when the task runs.

## Follow-up research

- **Israel-located account + official Private App:** can one register and link? Load-bearing; accepted as unknown; spike S1 during development.
- **Unofficial login and push from Azure egress vs a residential IP:** load-bearing; accepted as unknown; spike S2 during development.
- **Shared-location visibility:** whether shared locations' devices are visible through Ring's v3 endpoints.
- **Sensor batteries:** whether per-sensor battery fields appear on the author's actual devices.
- **Name:** a trademark check before the first public release.
