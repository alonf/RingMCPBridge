# Requirements & NFR — Ring MCP Bridge

**Depth**: Medium.
**Confirmation**: human-confirmed (lens-question), 2026-10-24.
**Agreement**: the human approved the priority order and thresholds ("yes") and agreed with the refinements and all 8 additions ("Yes for all, keep all").

## Quality-attribute priorities (1 = wins every trade-off)

```text
 +----+--------------------------+--------+------------------------------------------------+
 | #  | Attribute                | Driver?| Measurable target                              |
 +----+--------------------------+--------+------------------------------------------------+
 | 1  | Safety of control        | YES    | 100% of high-risk actions need confirmation;   |
 |    |                          |        | confirm token expires in 2 min; fail closed;   |
 |    |                          |        | disarm OFF by default                          |
 | 2  | Event timeliness         | YES    | bridge-internal <= 0.5 s p95 (hard, CI-tested);|
 |    |                          |        | HIGH end-to-end goal p95 <= 5 s, ceiling 10 s; |
 |    |                          |        | MEDIUM <= 30 s; snapshot never delays event    |
 | 3  | Event completeness       | YES    | no HIGH event lost; get_events cursor never    |
 |    |                          |        | skips; at-least-once push with dedupe id;      |
 |    |                          |        | 30-day event-log retention                     |
 | 4  | Unattended operation     | YES    | >= 7 days without re-login; reconnect within   |
 |    |                          |        | 60 s of a websocket/push drop; stale detected  |
 |    |                          |        | within 2 min and reported as health            |
 | 5  | Security & privacy       | YES    | Ring token never leaves the bridge; no frames  |
 |    |                          |        | sent anywhere unless a tool asked for them     |
 | 6  | Agent economy            | YES    | default tool reply <= ~8k tokens; inline       |
 |    |                          |        | snapshot <= ~1280px JPEG; summaries over raw   |
 |    |                          |        | lists                                          |
 | 7  | Client compatibility     | YES    | Claude Code, ChatGPT, any MCP client; legacy   |
 |    |                          |        | and 2026-07-28 protocol eras                   |
 | 8  | Adaptability             | medium | a Ring API break is fixable in one module;     |
 |    |                          |        | backends swappable                             |
 | 9  | OSS setup ease           | medium | clone -> first event <= 15 min                 |
 | 10 | Battery-cam care         | medium | no unattended snapshots/live view on battery   |
 |    |                          |        | cams beyond a configured N per hour            |
 | -  | Throughput / scale       | no     | one or a few homes, ~100 devices               |
 | -  | Hosting cost             | no     | ~free locally; small Azure if used             |
 +----+--------------------------+--------+------------------------------------------------+
```

## Latency budget (where the seconds go)

```text
 +-------------------------------+--------------+------------------------------+
 | Hop                           | Typical      | Who controls it              |
 +-------------------------------+--------------+------------------------------+
 | sensor -> base -> Ring cloud  | ~1-3 s       | Ring (assumed; measure)      |
 |  -> bridge (websocket / push) |              |                              |
 | bridge: classify, store, push | <= 0.5 s p95 | bridge: hard target          |
 | bridge -> Claude Code channel | ~instant     | local                        |
 | bridge -> ChatGPT MCP Events  | unknown      | OpenAI: measure in pilot     |
 | agent notices + reasons       | seconds      | the model: not counted       |
 +-------------------------------+--------------+------------------------------+
```

The 5 s end-to-end goal is **assumed** until it is measured on the author's home during the pilot. The 10 s ceiling is the acceptance limit.

## Event priority and motion policy

```text
 +-------------------------+-----------+------------------+-----------------------------+
 | Situation               | Recorded? | Pushed to agent? | Queryable?                  |
 +-------------------------+-----------+------------------+-----------------------------+
 | Flood, alarm triggered, | always    | HIGH             | yes                         |
 | doorbell, contact while |           |                  |                             |
 | ARMED, bridge lost Ring |           |                  |                             |
 | Motion while ARMED      | always    | HIGH             | yes                         |
 | Contact while DISARMED  | always    | MEDIUM           | yes                         |
 | Camera motion: person   | always    | MEDIUM           | yes                         |
 | Motion while DISARMED   | always    | no by default;   | yes: motion in last N min,  |
 |                         |           | opt-in per sensor| active rooms now, occupancy |
 |                         |           | and per client   | summary                     |
 | Camera motion: other    | always    | no by default    | yes                         |
 +-------------------------+-----------+------------------+-----------------------------+
```

- Push rules are configuration, not code. An agent or automation can subscribe to specific sensors.
- **Motion → lights:** the bridge exposes a filterable motion stream that any consumer can use. A built-in rules engine ("when X, do Y for N minutes") is **vision, not v1**.

## Sensor battery alerts

- **When:** alert when the level drops below the threshold (default 20%, configurable globally and per device), or when Ring flags the battery as low, whichever comes first.
- **How often:** once per device each time the level crosses the threshold, plus a periodic battery digest.

## Mandatory behaviors added in this lens

1. **Freshness honesty:** every state reply carries `as_of`. When the Ring connection is lost, replies say "stale since …". Old state is never presented as current.
2. **Ring-lost alert:** a HIGH health event when the Ring connection is down for more than 2 minutes, and a recovery event when it returns.
3. **Ring account protection:** outgoing Ring calls are rate-limited with backoff, with no polling bursts.
4. **Audit trail:** every control action and confirmation is logged with the client, action, time and result. The audit log is kept 90 days.
5. **Restart durability:** the event log and cursors survive a bridge restart, and agents catch up with no gap.
6. **Multiple concurrent clients:** each connected client gets every pushed event. A confirmation is bound to the client that requested it.
7. **Localization:** device names in any language (for example Hebrew). Times are given in the location's time zone plus UTC.
8. **Media retention:** cached snapshots and clips are kept 7 days by default, configurable.

## The system must refuse to

- Disarm without a PIN plus human confirmation (and only when disarm is enabled).
- Act on instructions found in camera images, device names or event text.
- Expose the Ring refresh token through any tool.
- Start live view on a battery camera unprompted.
- Send a panic or emergency dispatch.

## Mandatory constraints (not preferences)

- **No PIN from Ring:** Ring enforces no PIN for disarm, so the bridge enforces safety server-side.
- **Cloud-only:** there is no local Ring API. If Ring or the internet is down, nothing works, and the bridge must say so honestly.
- **Ring ToS and firewall:** the unofficial path conflicts with Ring's ToS, and Ring's firewall blocks datacenter IPs. Both bound the hosting choice.

## Unknowns carried forward

- **Ring motion detectors:** whether they report while disarmed, and their re-trigger cooldown (research-needed; verify in pilot).
- **ChatGPT MCP Events latency:** research-needed; measure in pilot.
- **Ring cloud → bridge latency:** assumed ~1-3 s; measure in pilot.
- **Azure egress and the Israel official API:** carried from product-domain (load-bearing).

## Acceptance evidence (proves quality, not only the happy path)

- **Latency:** a test that injects a synthetic HIGH event asserts bridge-internal latency at most 0.5 s p95. A pilot log measures end-to-end p95 against the 5 s goal and 10 s ceiling.
- **Safety:** tests assert every high-risk tool refuses without a valid, unexpired, client-bound confirmation token, and that disarm is refused when it is disabled.
- **Completeness:** a kill-and-restart test asserts the cursor resumes with no gap and no duplicate beyond the dedupe id.
- **Freshness:** a drop-the-Ring-connection test asserts a stale marker within 2 minutes and a HIGH health event.
- **Unattended operation:** a 7-day soak in the pilot with no manual re-login, recorded in a journal.
- **Agent economy:** a test asserts default inventory and summary replies stay under ~8k tokens against a fixture of ~100 devices.

## Amendments from later lenses

- **2026-10-29, component-design A4 (human-confirmed):** the priority table gains a rule for late events. An event recovered by the history catch-up, or held at home more than 2 minutes (a policy value tuned in the pilot, measured from the connector's receive time), is recorded and queryable with `late: true` and keeps its priority, but is not pushed. Instead, at the end of the catch-up, one `bridge.events_recovered` event is pushed to every agent, with the count, the oldest and newest times, the seq range, and the highest priority among the late events. For NFR 3 (no HIGH event lost), a missed HIGH event is stored and readable; the summary announces it once the marker is delivered (plan: the marker goes through the durable outbox, at least once). See `component-design.md`.
