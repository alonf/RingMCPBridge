# Iteration 002 — architecture-core (light)

**Closed**: 2026-11-17, the owner typed "Yes" and "move on" to the presentation below.

## Decided

- **The method stays IDesign**, as decided for the feature: clients, managers, engines, resource access.
- **The topology stays hybrid (home connector and Azure core) plus the all-in-one mode.** No open ports at home, one
  core instance, and the $30 ceiling (SC-011).
- **The only new running piece is the channel shim on the owner's PC.** It relays events to Claude Code. It is in the
  feature design and is built for the first time in iteration 002.
- **Volatile parts stay behind their own boundaries:**
  - Ring's push format is known only to the Push Listener and Normalize;
  - each agent platform's event envelope stays inside its own adapter in Delivery.
- **Out of iteration 002:** Control (arm/disarm, lights), Media (frames, clips), motion opt-ins (iteration 003), Ring's
  official API (waits for Spike S1 and iteration 003), and admin-page changes.

## Diagram

```text
 AGENTS: ChatGPT (MCP events -> the dot)   Claude Code (via the channel shim)   other clients
                 ^ events                           ^ events                       ^ listen stream
 ================|==================== AZURE CORE (one instance) ===============|==========
                 +---------------- the event path is added here ---------------+
                 |  Connector Link -> Event manager -> event log / state / audit -> Delivery
 =================================================^=========================================
                                                  | WSS, dialed out from home (no open ports)
 ================================= HOME CONNECTOR (Docker, the home VM) ====================
                 Ring push -> Push Listener -> Ingest (normalize, outbox, catch-up) -> Core Link
 Mode A (all at home): the same parts in one process, no link.
 New outside both: the channel shim on the owner's PC (in the feature design; first built now)
```
