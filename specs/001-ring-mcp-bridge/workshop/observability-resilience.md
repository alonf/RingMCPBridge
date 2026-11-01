# Observability & Resilience — Ring MCP Bridge

**Depth**: Medium.
**Status**: CLOSED 2026-10-26. The human said "move on" after the lens summary. Confirmation: human-confirmed, scope lens-question, per decision point OR1-OR6 and the four amendments (answered 2026-10-26: "1. Email and SMS 2. Reasinable as yo suggested 3. Yes").
**Inputs**:
- `requirements-nfr.md`: priorities 2-4 (bridge-internal <= 0.5 s p95; HIGH end to end goal 5 s, ceiling 10 s; no HIGH event lost; reconnect within 60 s; stale within 2 min reported as health; >= 7 days without re-login); the freshness test;
- `architecture-core.md`: topology H; B7 (one connector, one core replica, single-instance lease); B10; B11 (media never delays an event); B12 (as_of, stale marker, home-offline HIGH within 2 min, which needs H); the scheduler ticks; O10 (no second replica in v1);
- `integration-api.md`: D4 (events at least once, commands at most once), D7 (the error-code table, the 60 s deadline, TIMEOUT), get_health, health events;
- `security-compliance.md`: SC4 (logs never hold tokens, PINs, keys or images), SC5 (the daily audit-copy check), SC6 (security events, the shared Ring limiter), SC7 (no telemetry to the project);
- `data-storage.md`: DS3 (Azure SQL Basic, Blob, WORM), DS4, DS5 (epoch), the carry-forward to this lens.

## Carried in (decided earlier; not re-asked)

- Events at least once with dedupe on event_id; commands at most once; the 60 s deadline and TIMEOUT with outcome unknown; late results reach the audit (D4, D7).
- The D7 error codes, with HOME_OFFLINE, RING_UNAVAILABLE (backoff), RATE_LIMITED (retry_after_s) and TIMEOUT.
- Home offline and Ring lost: HIGH health events within 2 minutes; reads degrade to stale with `as_of` (B12, NFR).
- Reconnect within 60 s of a drop (NFR 4); the shared Ring limiter (SC6).
- Security events: PIN lockout, rate limit hit, the daily audit-copy check (SC5, SC6).
- No telemetry sent to the project (SC7). Mode A has no outside watcher (B12 records the limitation; not designed here).
- **Cost matters** (lens 5: the human questioned a $21 database). Every proposal here is priced against the ~$6.5 database.

## Decision points OR1-OR6 (from the lens; 2026-10-26, proposals awaiting the human)

- **OR1 What is logged, measured and reported?** Structured JSON logs from the core to stdout, which Container Apps sends to Log Analytics: one line per tool call, event, command and minute tick. Metrics are computed from the logs and the event timestamps (no extra SDK). Connector logs stay at home (Docker, rotated); only a health summary rides each heartbeat. The level is a choice: **Reasonable** (this; the agent's lean) or **By the book** (OpenTelemetry traces to Application Insights, dashboards, SLO burn-rate alerts; more cost and code).
- **OR2 Correlation.** event_id from the connector to the agent; request_id, command_id and client_id from the agent's call through the link to the Ring call and back; a connector session id on every line. Carried in link messages.
- **OR3 Health checks and alerts.**
  - core `/livez` (the process and its event loop) and `/readyz` (database reachable, lease held, secrets loaded) for the Container Apps probes;
  - a Docker health check for the connector at home; get_health and the HIGH health events (carried);
  - NEW, out of band: agents cannot hear a dead core, so Azure Monitor tells the human directly: free metric alerts on replicas, restarts, database size and DTU; one log alert every 5 minutes on "no minute tick for 10 minutes, or any line marked out-of-band" (home offline over 10 minutes, Ring session lost, audit mismatch, WORM over 1 h behind). The channel (app push, email or SMS) is the human's question.
- **OR4 Expected and exceptional failures.** See the failure table. Expected and handled quietly: link drops under 2 minutes, Ring transient errors, agent input errors. Exceptional, raising a health event: everything in rows 1-8, 10 and 11.
- **OR5 Retry, timeout, idempotency, circuit, recovery.** See "Retry and recovery detail". Commands are never retried (carried).
- **OR6 Cost and what is never logged.** Default about $1.50 a month. Logs carry IDs, not content: no device names (they can name a person's room), no tool argument values, no tokens, PINs, keys, images or audio (SC4). Connector logs stay at home (SC7).

**One event's journey and who watches what (the lens diagram):**

```text
 ONE EVENT'S JOURNEY (the IDs and times it carries) AND WHO WATCHES WHAT

 Ring cloud   HOME VM: connector          AZURE: core                    AGENTS
 ring_ts ---> received_at, event_id -WSS-> stored_at: one DB commit ---> pushed_at
              outbox until acked  <-ack--  dedupe on event_id, seq        (MCP Events,
                                                                           listen, pull)
 heartbeat every 15 s --------------------> health: home link, Ring session,
  (Ring session, push, outbox depth,         push, outbox, last event, DB, lease
   last Ring event, error counts)                |                    |
                                                 v                    v
 control: request_id -> command_id ->      get_health, and HIGH health events
          Ring call -> result               to agents (carried, B12)
                                                 |
                                   structured logs, IDs only, one line per call,
                                   event, command and minute tick
                                                 v
                                   Log Analytics -> 1 log alert (5 min) --> YOUR PHONE
                                   Azure metrics -> free metric alerts  --> (out of band)

 From the times: bridge-internal = pushed_at - received_at (<= 0.5 s p95, carried);
 end to end = pushed_at - ring_ts (goal 5 s, ceiling 10 s, carried).
 Connector logs stay at home; only the health summary in the heartbeat leaves.
```

**Failure modes (OR4, OR5):**

```text
 +---------------------+------------------+-------------------------------------------+
 | Failure             | Detected by      | What happens                              |
 +---------------------+------------------+-------------------------------------------+
 | 1 Home link down    | core: no         | Carried: reads stale, control and media   |
 | (VM, Internet,      | heartbeat for 2  | HOME_OFFLINE, HIGH to agents; the outbox  |
 | power)              | min              | keeps events and replays them (dedupe).   |
 |                     |                  | NEW: out-of-band alert after 10 min.      |
 | 2 Ring session lost | connector: a     | NEW: HIGH ring.session_lost; reads stale; |
 | (token refused)     | refresh is       | you redo the Ring login at home. No retry |
 |                     | refused          | loop (protects the account).              |
 | 3 Ring slow,        | connector: the   | Carried: RING_UNAVAILABLE with backoff;   |
 | failing or blocking | shared Ring      | stale and HIGH after 2 min. NEW: the      |
 | (5xx, 429, 406)     | limiter          | circuit opens after 5 failures in a row;  |
 |                     |                  | one probe a minute.                       |
 | 4 Push lost, or     | connector: push  | NEW: re-register; then one Ring history   |
 | connector restarted | error, or a gap  | read per location for the gap (up to 24   |
 |                     | at start         | h), through the shared limiter; missed    |
 |                     |                  | events arrive marked late.                |
 | 5 Core crash, hang  | Container Apps   | Restart. The connector keeps events and   |
 | or deploy           | probes; Azure    | reconnects (backoff up to 30 s); agents   |
 |                     | Monitor          | catch up by cursor. NEW: out-of-band      |
 |                     |                  | alert.                                    |
 | 6 Database          | core: at commit  | NEW: events are not acked (they wait in   |
 | unreachable         | or lease renewal | the outbox); calls fail                   |
 |                     |                  | BRIDGE_UNAVAILABLE (new code, retryable); |
 |                     |                  | the lease lapses, so control stops (fail  |
 |                     |                  | closed).                                  |
 | 7 Blob unreachable  | core: at write   | The event goes out without a frame (B11); |
 |                     |                  | media tools fail BRIDGE_UNAVAILABLE; WORM |
 |                     |                  | shipping waits; alert if over 1 h behind. |
 | 8 Entra unreachable | issuer, confirm  | Agents keep working on our own tokens;    |
 |                     | page             | new sign-ins and disarm confirmations     |
 |                     |                  | fail (fail closed).                       |
 | 9 Push to an agent  | Delivery         | Carried: retry with backoff; the event    |
 | fails               |                  | stays in the log; the agent catches up by |
 |                     |                  | cursor.                                   |
 | 10 Audit mismatch,  | daily check;     | Carried: security events (SC5, SC6). NEW: |
 | PIN lockout, rate   | Safety           | the audit mismatch also goes out of band. |
 | limit hit           |                  |                                           |
 | 11 Database near    | Azure metrics    | NEW: free metric alert at 70% of 2 GB or  |
 | Basic's limits      |                  | 80% DTU, plus a MEDIUM health event.      |
 +---------------------+------------------+-------------------------------------------+
```

**Cost (OR6):**

```text
 +--------------------------+--------------------------------------+----------------+
 | Item                     | What                                 | Month          |
 +--------------------------+--------------------------------------+----------------+
 | Logs from the core       | about 0.1-0.3 GB a month, IDs only   | $0 inside the  |
 |                          |                                      | free 5 GB *    |
 | Metric alerts            | replicas, restarts, DB size, DTU;    | $0             |
 |                          | first 10 signals free                |                |
 | One log alert, every 5   | no minute tick for 10 min, or any    | $1.50          |
 | min                      | line marked out-of-band              |                |
 | Notifications            | app push: first 1,000 a month free;  | about $0       |
 |                          | SMS to Israel $0.016 each            |                |
 | Not default:             | a web test every 5 min from one      | about $5.60    |
 | availability test        | location                             |                |
 +--------------------------+--------------------------------------+----------------+
 Default total about $1.50 a month (the database is about $6.5).
 * Assumed: the free 5 GB is per billing account and your other workloads may use it;
   past it, $3.29 per GB. List prices, Israel Central, read 2026-10-26.
```

## Amendments to confirmed lenses (each needs its own yes)

- **New error code `BRIDGE_UNAVAILABLE`** (amends D7; additive under D2): a core dependency (database, Blob) is down; retryable with retry_after_s.
- **Database down: reads fail, not stale.** D7 degrades reads to stale only when the home link is down. When the database is down, the agent proposes failing reads with BRIDGE_UNAVAILABLE (simple, honest, rare: Azure SQL outages) rather than keeping state in memory to serve it stale. Alternative: an in-memory state copy served with `stale_since`. B12 is not silently extended.
- **History catch-up after a push gap or connector restart** (adds Ring calls): one Ring history read per location for the gap, at most 24 h, through the shared Ring limiter (SC6), from the connector only (B4). Missed events get `late: true` (additive). Serves NFR 3 (no HIGH event lost).
- **The single-instance lease lives in the database** (B7 did not say where): one row with holder and expiry, renewed every 15 s, expiring after 45 s. No database, no lease, no control: fail closed, and `/readyz` reports it. Component-design names the owner.

## Retry and recovery detail (OR5)

- **Link reconnect (connector to core):** exponential backoff from 1 s, doubling, capped at 30 s, with full jitter, so a returning core is reached within 60 s (NFR 4). Heartbeat every 15 s; 2 minutes without one is home offline (B12).
- **Outbox resend:** unacked events are re-sent oldest first on reconnect, or after 10 s without an ack; the core dedupes on event_id.
- **Ring calls:** the shared limiter; 429 and 5xx back off from 2 s to a 60 s cap with jitter; a 406 counts as blocking. The circuit opens after 5 failures in a row and lets one probe through a minute. Stale and HIGH after 2 minutes (carried).
- **Ring token refresh:** once per failure; a refusal is "session lost" (HIGH) with no retry loop.
- **Delivery to agents:** 3 tries (1 s, 5 s, 30 s); then the event waits in the log for the cursor (carried at-least-once).
- **Database transaction:** one retry on a transient error; otherwise no ack, and the connector re-sends.
- **Media to Blob:** 2 retries inside the media budget; never delays the event (B11).
- **WORM shipping:** retried every tick until done (`shipped_to_worm`); out of band if over 1 h behind.
- **Commands:** never retried; at most once (carried).

## Signals to measure (SLIs; the pilot sets the numbers it can)

- bridge-internal latency p95 (pushed_at - received_at), target <= 0.5 s (carried, CI-tested);
- end-to-end latency p95 (pushed_at - ring_ts), goal 5 s, ceiling 10 s (carried; ring_ts accuracy to check);
- link reconnect time; time to stale detection; days since the last Ring login (>= 7);
- outbox depth and resend count; late events from history catch-up;
- delivery failures per agent; WORM shipping lag;
- database size and DTU against Basic's 2 GB and 5 DTU;
- Ring errors by code, circuit openings; security events.

## Evidence tags

- **Known:** list prices from the Azure Retail Prices API, Israel Central, read 2026-10-26: Log Analytics ingestion $3.29 per GB after the first 5 GB, retention $0.132 per GB-month; metric alerts free for the first 10 signals, then $0.10 each; log alerts $0.50 (15 min), $1.50 (5 min), $3.00 (1 min) a month; push notifications free for the first 1,000; SMS to Israel $0.016; a standard web test $0.000645 a run (every 5 min from one location: about $5.60 a month).
- **Assumed:** the free 5 GB is per billing account, and the human's other workloads may already use it.
- **Assumed:** the log-alert meter is billed per rule; the email notification price (believed free for the first 1,000).
- **Assumed:** the Container Apps metric names for replicas and restarts; log volume about 0.1-0.3 GB a month (about 7,000 lines a day).
- **Assumed:** Ring history can be read per location in one paged call (ring-client-api); to check in the S-spikes or the pilot.

## Questions to the human

1. Out of band, when the bridge itself is in trouble: Azure mobile app push, email, or SMS? (The human enters the address or number in the Azure action group during devops; the agent never records it.)
2. Reasonable (structured logs, correlation, health checks, about $1.50 a month) or By the book (OpenTelemetry traces, dashboards, SLO alerts)?
3. Is the failure handling right, including the four amendments (BRIDGE_UNAVAILABLE; reads fail when the database is down; the history catch-up; the lease in the database)?

## Answers 2026-10-26

The human answered all three questions at once, verbatim:

> 1. Email and SMS
> 2. Reasinable as yo suggested
> 3. Yes

- **1 (OR3, the out-of-band channel):** email and SMS, both through one Azure Monitor action group. The human enters the address and the number during devops-operations; the agent never records them. SMS to Israel is $0.016 each; alerts are rare, so cents a month.
- **2 (OR1, the level):** Reasonable, as proposed. This covers the package presented with it: OR2 correlation and OR6 cost and logging rules.
- **3 (OR4, OR5 and the amendments):** the failure table and the retry detail as proposed, and the four amendments: `BRIDGE_UNAVAILABLE` (amends D7, additive); reads fail when the database is down (B12 not extended); the history catch-up with `late: true` (adds Ring calls through the shared limiter); the single-instance lease in the database. Amendment notes were added to `integration-api.md` and `architecture-core.md`.
- **Pacing:** the human answered everything in one go (no pacing pick needed).
- **Confirmation:** human-confirmed, scope lens-question, per decision point OR1-OR6.

## Lens 6 summary (as decided, 2026-10-26)

```text
 +-----+--------------------+---------------------------------------------------------+
 | #   | Decision           | Decided                                                 |
 +-----+--------------------+---------------------------------------------------------+
 | OR1 | Signals            | Reasonable level: structured JSON logs from the core to |
 |     |                    | Log Analytics, one line per tool call, event, command   |
 |     |                    | and minute tick; metrics from the logs and event times; |
 |     |                    | connector logs stay at home, a health summary rides the |
 |     |                    | heartbeat.                                              |
 | OR2 | Correlation        | event_id end to end; request_id, command_id and         |
 |     |                    | client_id from the agent's call to the Ring call and    |
 |     |                    | back; a connector session id on every line.             |
 | OR3 | Health and alerts  | /livez and /readyz (database, lease, secrets) for       |
 |     |                    | Container Apps; Docker health check at home; get_health |
 |     |                    | and HIGH events to agents. Out of band: email and SMS   |
 |     |                    | through one Azure action group, from free metric alerts |
 |     |                    | and one 5-minute log alert.                             |
 | OR4 | Failures           | The 11-row failure table, including: Ring session lost  |
 |     |                    | is HIGH with no retry loop; database down fails calls   |
 |     |                    | with BRIDGE_UNAVAILABLE (new code) and stops control;   |
 |     |                    | Blob down sends events without frames; Entra down       |
 |     |                    | blocks new sign-ins and disarm.                         |
 | OR5 | Retry and recovery | Reconnect backoff 1 s to 30 s with jitter; outbox       |
 |     |                    | resend after 10 s; Ring circuit opens after 5 failures, |
 |     |                    | one probe a minute; history catch-up after a gap (up to |
 |     |                    | 24 h, late: true); lease in the database, 45 s expiry;  |
 |     |                    | commands never retried.                                 |
 | OR6 | Cost, never logged | About $1.50 a month plus a few cents of SMS. Logs carry |
 |     |                    | IDs, not content: no device names, tool argument        |
 |     |                    | values, tokens, PINs, keys, images or sound.            |
 +-----+--------------------+---------------------------------------------------------+
```

**The as-decided lens diagram:**

```text
 ONE EVENT'S JOURNEY AND WHO WATCHES WHAT (lens 6 as decided)

 Ring cloud   HOME VM: connector          AZURE: core                    AGENTS
 ring_ts ---> received_at, event_id -WSS-> stored_at: one DB commit ---> pushed_at
              outbox until acked  <-ack--  dedupe on event_id, seq        (MCP Events,
                                                                           listen, pull)
 heartbeat every 15 s --------------------> health: home link, Ring session,
  (Ring session, push, outbox depth,         push, outbox, last event, DB, lease
   last Ring event, error counts)                |                    |
                                                 v                    v
 control: request_id -> command_id ->      get_health, and HIGH health events
          Ring call -> result               to agents (carried, B12)
                                                 |
                                   structured logs, IDs only, one line per call,
                                   event, command and minute tick
                                                 v
                                   Log Analytics -> 1 log alert (5 min) --> EMAIL + SMS
                                   Azure metrics -> free metric alerts  --> (out of band,
                                                                         one action group)

 From the times: bridge-internal = pushed_at - received_at (<= 0.5 s p95, carried);
 end to end = pushed_at - ring_ts (goal 5 s, ceiling 10 s, carried).
 Connector logs stay at home; only the health summary in the heartbeat leaves.
```

**Carry-forwards:**
- **devops-operations:** the action group (email and SMS, entered by the human); the log alert and metric alerts as infrastructure code; the Container Apps probes; Log Analytics retention (30 days); Docker log rotation at home; one end-to-end test alert before the pilot ends.
- **component-design:** who computes health (the [8] health block); the owner of the lease; the Ring circuit and the history catch-up in the connector's Ring adapter; where `late` events enter the Event Manager.
- **code-implementation:** the structured logger and its redaction (IDs, not content; "no new dependency" first); passing the correlation IDs through the link messages.
- **ui-ux:** a health panel on the admin page (the same data as get_health).
- **Pilot:** measure the two latencies and how accurate ring_ts is; log volume; fire one alert end to end by email and SMS.

## Pacing

The lens has 6 decision points. The agent offered: answer all at once, or go one at a time starting with the out-of-band channel. The human answered all at once. The agent presented the lens summary and asked whether to change anything or move on.

## Lens closed

2026-10-26: the human, verbatim: "move on". Lens 6 is closed; next is lens 7, devops-operations (medium).

## Amendments from later lenses

- **2026-10-29, component-design A4 (human-confirmed):** OR5 gains the age rule and the marker. An event held in the home outbox more than 2 minutes (measured from the connector's receive time; policy data in Classify, tuned in the pilot) is marked late, like the events the history catch-up recovers. After draining the outbox and the catch-up, Ingest sends one "catch-up done" marker; on it, the core pushes one `bridge.events_recovered` summary instead of pushing the late events one by one. Assumed: the home VM's and Azure's clocks are NTP-synced. See `component-design.md`.
