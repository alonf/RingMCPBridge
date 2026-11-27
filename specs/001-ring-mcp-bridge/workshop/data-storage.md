# Data & Storage — Ring MCP Bridge

**Depth**: Medium.
**Status**: CLOSED 2026-10-26. The human said "move on" after the lens summary. Confirmation: human-confirmed, scope lens-question, per decision point DS1-DS6 (DS3 on 2026-10-25; DS1, DS2, DS4-DS6 on 2026-10-26 by "Do as you recomanded"). The human also asked two questions of their own (cost; SQLite vs a server database), recorded below.
**Inputs**:
- `architecture-core.md`: topology H, B7 (one core replica, a single writer), B10 (durable before delivery), B12 (reads degrade to stale), P4, P9, the resource-access blocks;
- `integration-api.md`: D2 (additive changes), D4 (event_id, command_id, one-time tokens), the per-location `seq` cursor, get_history;
- `security-compliance.md`: SC4 (only the core's identity has database rights; connector secrets), SC5 (the audit database copy and WORM), SC7 (delete-now, per-camera switches, owners' agreements);
- `requirements-nfr.md`: restart durability, events 30 days, media 7 days.

## Carried in

- **P4 widened.** P4 was framed as "SQLite vs Azure Tables + Blob". Mode A (all at home) already needs SQLite (CORRECTION 2026-10-26: SQLite in Mode A was the agent's proposal, never decided in an earlier lens; see "The human on SQLite vs a server database"), so the real question for topology H is whether the Azure store speaks SQL too, or needs a second, non-SQL adapter. The agent therefore adds PostgreSQL and Azure SQL as candidates.
- **Cost.** P9 said cost is not a driver (the human: Azure is "practically free" for them). REVISED 2026-10-25: the human questioned the PostgreSQL price for DS3 (see "The human on cost"), so the agent now weighs cost in the store choice.
- **Retention:** events 30 days; media 7 days; audit 90 days or 1 year (SC5 supersedes the 90 days in requirements-nfr). Delete-now covers events and media only, never the audit (SC7).
- **Rights:** only the core's managed identity has database and blob data rights (SC4).

## Decision points DS1-DS6 (from the lens; 2026-10-25, proposals awaiting the human)

- **DS1 Is persistent storage required?** Yes. The event log, cursors, state, issuer data, config and the audit copy must survive a restart (B10, B12). Rate-limit counters and open listen streams can stay in memory.
- **DS2 What owns each data type?** See the inventory.
- **DS3 Which storage model?** For topology H: one SQL database for records (the choice below), Blob for media and the WORM audit. At the connector, a SQLite outbox and the encrypted secrets file. In Mode A, the same schema in one SQLite file.
- **DS4 Consistency.** One writer (B7), so strong consistency inside one database. Proposed:
  - one transaction per incoming event: dedupe on event_id, take the next seq, append, update state, commit; only then ack the connector (B10) and push;
  - used one-time tokens and command_ids are stored, so a core restart cannot let a 2-minute token or a command be replayed;
  - a pending disarm fails closed on restart (the human starts again);
  - the audit hash chain is extended inside the same transaction, and a `shipped_to_worm` flag ships each entry to WORM at least once (deduped by hash);
  - media: write the blob, then its row; purge removes the row, then the blob;
  - rate-limit counters live in memory and reset on a restart (to accept or reject).
- **DS5 Schema, migrations, backup, restore, retention.** Proposed:
  - forward-only, additive migrations run at start (one replica, so no race), so code N-1 still runs on schema N (D2);
  - CI upgrades a database from the previous release on both engines;
  - point-in-time restore from the Azure store; one restore drill in the pilot;
  - cursors carry a log epoch, a new value after any restore or reset, so an agent sees the reset and re-syncs (additive under D2); a seq is never reused, including after delete-now;
  - audit purge keeps an anchor (the oldest kept entry and its hash), so the chain still verifies; WORM stays the proof;
  - purge on the scheduler ticks already in architecture-core;
  - the Ring token is not backed up (a backup is another copy of it): losing the VM means redoing the Ring login and 2FA (question to the human).
- **DS6 No direct access to another component's data.** Only the core's identity has database rights. Each resource-access component owns its tables, and no other one reads them. The admin page reads through the managers. The connector and the agents never touch the core database.

**Inventory and ownership (DS1, DS2):**

```text
 +-----------------------+-------------+---------------+-----------------+---------------+
 | Data                  | Where       | Owner         | Kind            | Kept          |
 +-----------------------+-------------+---------------+-----------------+---------------+
 | Event log (events,    | core DB     | Event Log     | record          | 30 days       |
 | seq per location)     |             |               |                 |               |
 | Device and alarm      | core DB     | State         | projection;     | overwritten   |
 | state                 |             |               | kept for stale  |               |
 |                       |             |               | reads (B12)     |               |
 | Agent cursors,        | core DB     | Subscriptions | record          | until revoked |
 | subscriptions,        |             |               |                 |               |
 | last-read marks       |             |               |                 |               |
 | Issuer: clients,      | core DB     | Issuer        | record; lost =  | 30 d unused,  |
 | grants, hashed        |             | (Security)    | every agent     | 90 d max      |
 | refresh tokens        |             |               | re-links        |               |
 | Config: switches,     | core DB     | Config        | record; every   | until changed |
 | listed agents,        |             |               | change audited  |               |
 | owners' agreements,   |             |               |                 |               |
 | connector key         |             |               |                 |               |
 | Used one-time tokens, | core DB     | Control,      | working state   | 2 min to 24 h |
 | command_ids, pending  |             | Safety *      |                 |               |
 | disarm                |             |               |                 |               |
 | Audit copy            | core DB     | Audit         | projection of   | 90 d or 1 y   |
 |                       |             |               | WORM            |               |
 | Audit proof           | Blob (WORM) | Audit         | record          | 90 d or 1 y   |
 | Frames, bursts, clips | Blob        | Media Cache   | cache           | 7 days        |
 | Rate-limit counters   | core memory | core          | disposable;     | -             |
 |                       |             |               | reset on        |               |
 |                       |             |               | restart         |               |
 | Outbox                | connector   | Outbox + link | record until    | until acked   |
 |                       | SQLite      |               | acked           |               |
 | Ring token, push      | connector   | Ring adapter  | record (SC4)    | until         |
 | creds, device ID,     | file        |               |                 | re-login      |
 | connector key         | (encrypted) |               |                 |               |
 | Ring history          | not stored  | -             | read from Ring  | -             |
 |                       |             |               | when asked      |               |
 +-----------------------+-------------+---------------+-----------------+---------------+
 * Which resource-access component owns these is set in component-design.
```

**Entities and keys (the lens diagram):**

```text
 CORE DATABASE (Azure; one schema; each group owned by one component)

 Event Log                     State                         Subscriptions
 +------------------------+    +------------------------+    +------------------------+
 | event                  |    | location               |    | subscription           |
 | PK (location_id, seq)  |    | PK location_id         |    | PK (sub_id, location)  |
 | UQ event_id (dedupe)   |    | owned or shared, tz    |    | client_id, user_sub    |
 | FK device_id -> device |    +------------------------+    | kind, epoch, last_seq  |
 | FK media_id -> media   |    | device                 |    | last_read_at (dots)    |
 | type, priority, ts     |    | PK device_id           |    +------------------------+
 | data (json)            |    | location_id, kind      |
 +------------------------+    | name (untrusted)       |
 | log_meta: epoch,       |    | state (json), as_of    |
 | next_seq               |    +------------------------+
 +------------------------+

 Media Cache                   Audit (copy of WORM)          Issuer (Security)
 +------------------------+    +------------------------+    +------------------------+
 | media                  |    | audit_entry            |    | oidc_item              |
 | PK media_id            |    | PK seq                 |    | PK (model, id)         |
 | FK device_id -> device |    | prev_hash, hash        |    | grant_id, uid          |
 | kind, ts               |    | kind, client_id, sub   |    | data (json), expires   |
 | blob_name, expires_at  |    | action, result, ts     |    +------------------------+
 +------------------------+    | shipped_to_worm        |
                               +------------------------+
                               | audit_anchor: oldest   |
                               | kept seq and its hash  |
                               +------------------------+

 Config                        Control, Safety *
 +------------------------+    +------------------------+
 | setting PK key         |    | command PK command_id  |
 | agent PK client_id     |    | used_token PK jti      |
 | connector PK key_id    |    | pending_disarm         |
 | owner_agreement        |    |  PK request_id         |
 |  PK (location, owner)  |    +------------------------+
 +------------------------+

 BLOB (core only): media/ (7 days)   audit-90d/  audit-1y/ (WORM, SC5)
 HOME CONNECTOR (its own files, never in the core DB): outbox (SQLite),
   secrets file (encrypted, SC4)
 MODE A (all at home): the same schema in one SQLite file, media in a folder,
   no WORM (hash chain only).
 * Which resource-access component owns these is set in component-design.
```

**The Azure store (DS3; the one consequential choice). Revised 2026-10-25 after the human's cost question; the lens-open version led with PostgreSQL at ~$21:**

```text
 +-------------+------------------------+------------------------------------+-----------+
 | Option      | What                   | Fit                                | Month     |
 +-------------+------------------------+------------------------------------+-----------+
 | Azure SQL   | Azure SQL Database     | NEW LEAN. SQL, transactions,       | ~$6.5     |
 |             | Basic (5 DTU, up to 2  | point-in-time restore. Our data is |           |
 |             | GB)                    | about 0.3 GB (under 0.6 GB with    |           |
 |             |                        | indexes), well inside 2 GB. Its    |           |
 |             |                        | SQL is further from SQLite, so a   |           |
 |             |                        | few queries need two versions.     |           |
 |             |                        | Outgrowing it is a tier change,    |           |
 |             |                        | not a redesign.                    |           |
 | PostgreSQL  | Flexible Server,       | SQL closest to SQLite. The price   | ~$21      |
 |             | Burstable B1ms, 32 GiB | is a floor, not data: ~$16 for the |           |
 |             | disk (the minimum)     | smallest server running all month, |           |
 |             |                        | ~$5 for the minimum disk. Storing  |           |
 |             |                        | less changes nothing.              |           |
 | Tables (P4) | Azure Table Storage.   | Almost free. A non-SQL adapter     | <$0.10    |
 |             | Cosmos DB serverless   | beside SQLite: key-range queries   |           |
 |             | (~$2) is the same      | only, no cross-partition           |           |
 |             | family                 | transactions, no point-in-time     |           |
 |             |                        | restore (Tables).                  |           |
 | SQL free    | Azure SQL serverless,  | Rejected. At the 0.5 vCore floor   | dark, or  |
 | tier        | 100,000 free           | that is about 2.3 days of          | ~$232     |
 |             | vCore-seconds a month  | always-on, and the core's open     |           |
 |             |                        | connection stops auto-pause. Then  |           |
 |             |                        | it pauses until next month (bridge |           |
 |             |                        | dark) or bills the rest. No SLA.   |           |
 | SQLite in   | On the shared volume   | Rejected. SQLite warns against     | ~$0       |
 | Azure       | (Azure Files), or on   | network file systems. Litestream   |           |
 |             | the container's disk   | copies after the commit, so a      |           |
 |             | copied to Blob by      | crash can lose an event already    |           |
 |             | Litestream             | acked (breaks B10); two copies     |           |
 |             |                        | during a deploy can make restore   |           |
 |             |                        | impossible.                        |           |
 +-------------+------------------------+------------------------------------+-----------+
 List prices, Israel Central, Azure Retail Prices API, read 2026-10-25.
 Blob for media and WORM is the same in every option (under $1 a month).
```

**Agent's lean (revised 2026-10-25): Azure SQL Database Basic, about $6.5 a month.** It keeps everything the safety points need: transactions for B10 and the hash chain, point-in-time restore for the issuer grants and config, and sign-in with the core's managed identity. Our data fits its 2 GB with room to spare. The trade, for about $15 a month: its SQL (T-SQL) is further from SQLite than PostgreSQL's, so the shared schema needs a query layer that speaks both, and a few statements (insert-or-update, paging) need two versions. That cost sits inside the resource-access components, and CI already upgrades a database on both engines. The lens-open lean was PostgreSQL, because its SQL is closest to SQLite; it stays the choice if the human prefers fewer dialect differences over the price.

**Evidence tags:**
- **Known:** list prices from the Azure Retail Prices API, read 2026-10-25, Israel Central:
  - PostgreSQL Flexible B1MS $0.022 an hour (about $16.06 a month) plus storage $0.164 per GB-month (the 32 GiB minimum is about $5.25);
  - Azure SQL Basic $0.21252 a day (about $6.46 a month);
  - Azure SQL General Purpose serverless Gen5 $0.68872 per vCore-hour;
  - Cosmos DB serverless $0.311 per million RUs;
  - Table storage $0.0594 per GB-month and $0.00036 per 10,000 operations.
- **Known:** the Azure SQL free tier gives each database 100,000 vCore-seconds, 32 GB of data and 32 GB of backup a month. At the limit it either pauses until next month or bills at serverless rates, and the choice to bill cannot be undone. An open connection prevents auto-pause. It has no SLA (Microsoft Learn, free-tier page, updated 2026-10-21).
- **Derived:** always-on at the 0.5 vCore floor is 365 vCore-hours a month; the free 27.8 vCore-hours last about 2.3 days; the rest is about (365 - 27.8) x $0.68872 = $232.
- **Known:** Litestream replicates out of band from the transaction, so a crash loses the last window of writes (1 second by default); synchronous replication is not implemented; several applications replicating to one path can make restore impossible (Litestream tips page).
- **Known:** SQLite's own guidance warns against using it over a network file system.
- **Assumed:** our Node drivers sign in to PostgreSQL or Azure SQL with the core's managed identity, and the default point-in-time restore window is 7 days. To check in code-implementation and devops-operations.
- **Assumed:** volume. About 1,000-3,000 events a day (40 contacts, 18 motion sensors, 6 cameras), so under 100,000 rows and under 100 MB in 30 days. Media under about 1 GB in 7 days. The pilot measures it.
- **Assumed:** database size about 0.3 GB at steady state (events about 0.1 GB, the 1-year audit copy about 0.2 GB at 500 entries a day, the rest small), under 0.6 GB with indexes; inside Azure SQL Basic's 2 GB. The pilot measures it.
- **Assumed:** Cosmos DB serverless about $2 a month at our volume (a few million RUs).
- **Carry-forward to devops-operations:** network access to the database (a private endpoint or not).
- **Carry-forward to code-implementation:** the drivers and the query layer ("no new dependency" first). If DS3 is Azure SQL, the query layer must speak both SQLite and T-SQL.

## The human on cost (2026-10-25)

The human, verbatim: "I am looking at the cost, just for the BD 21 usd? I do not think we are going to store so much data"

The agent's answer: yes, about $21 is the database alone, but it is not driven by data. About $16 is the smallest PostgreSQL server running all month and about $5 is the minimum 32 GiB disk; storing less changes almost nothing. The agent revised the options (above) and moved its lean to Azure SQL Basic. DS3 is still the human's choice; this was a question, not a pick.

## DS3 decided (2026-10-25)

The human, verbatim, answering "Which Azure store do you want: Azure SQL Basic, PostgreSQL, or Tables?": "Yes Azure managed SQL"

- **Decision:** the core's records live in Azure SQL Database, Basic tier (the agent's revised lean, about $6.5 a month). The agent reads "managed SQL" as Azure SQL Database, not Azure SQL Managed Instance, and said so to the human. Confirmation: human-confirmed, scope lens-question (DS3).
- **Unchanged:** Blob for media and the WORM audit; the SQLite outbox and encrypted secrets file at the connector; Mode A on one SQLite file with the same schema.
- **Consequences:**
  - the query layer speaks SQLite and T-SQL; a few statements (insert-or-update, paging) have two versions, inside the resource-access components;
  - CI upgrades a database from the previous release on SQLite and on SQL Server (for example a SQL Server container in CI);
  - outgrowing Basic (2 GB, 5 DTU) is a tier change, not a redesign; the pilot measures size and load.
- **Carry-forward to devops-operations:** network access to the database. A private endpoint has its own monthly charge; a virtual-network service endpoint or the server firewall does not (assumed; to price there). Also the point-in-time restore window on Basic (assumed 7 days).
- **Carry-forward to code-implementation:** the SQL Server driver with managed-identity sign-in (assumed to work from Node), and the query layer that covers both dialects ("no new dependency" first).

**Where the data lives, as decided so far (DS3):**

```text
 WHERE THE DATA LIVES (topology H; DS3 decided: Azure SQL Database Basic)

 AZURE CORE (Container Apps, 1 replica)                     HOME VM (connector)
 +--------------------------------------------+             +--------------------------+
 | Azure SQL Database Basic (~$6.5 a month)   |             | Outbox (SQLite):         |
 |  event log, device state, cursors,         | <--events-- |  events until the core   |
 |  sign-in records, config, used tokens,     | ---ack----> |  acks them               |
 |  commands, audit copy                      |             | Secrets file (encrypted):|
 |  one schema; one owner per table group     |             |  Ring token, push creds, |
 |  only the core's identity; restore 7 d *   |             |  device ID, connector key|
 +--------------------------------------------+             |  backed up? (question 1) |
 | Blob: media/ (7 days)                      |             +--------------------------+
 |  audit-90d/ audit-1y/ (WORM, the proof)    |
 +--------------------------------------------+
 | Memory only: rate-limit counters, open     |
 |  listen streams (gone on restart)          |
 +--------------------------------------------+
 MODE A (all at home): the same schema in one SQLite file, media in a folder,
   no WORM (hash chain only).
 * Assumed point-in-time restore window for Basic; checked in devops-operations.
```

## The human on SQLite vs a server database (2026-10-26)

The human, verbatim: "Is SQLite better then any containerized read DB such as MongoDB, PostgreSQL or MSSQL?" (the agent reads "read DB" as "real DB").

The agent's answer: not better in general, better for the two jobs it has here, where one process writes a small amount of data to a local disk: the connector's outbox, and Mode A (all at home, "for development and for open-source users without Azure", architecture-core; IN2: one process at home). A server database wins when several processes or machines write the same data, or other tools query it over the network; neither is in this design (B7). In Azure, a database container would be worse than the managed Azure SQL: Container Apps' persistent volumes are Azure Files network shares (the same problem as SQLite there), and the bridge would own patching, backups and restore. DS3 for Azure stands.

```text
 +----------------+--------------------------------+------------------------------------+
 |                | SQLite (in the process)        | Server DB in a container           |
 +----------------+--------------------------------+------------------------------------+
 | What runs      | A library inside our Node      | A second container beside ours,    |
 |                | process; the data is one file  | with its own process, port,        |
 |                |                                | upgrades and patches               |
 | Secrets        | None to keep: only our process | A database password on the box,    |
 |                | opens the file                 | one more secret (SQL Server        |
 |                |                                | Express has no Entra sign-in at    |
 |                |                                | home without Azure Arc)            |
 | Memory         | A few MB                       | PostgreSQL: tens of MB. SQL        |
 |                |                                | Server: at least 2 GB              |
 | Hardware       | Anywhere, including ARM        | PostgreSQL: anywhere. SQL Server:  |
 |                | (Apple-silicon Macs, Raspberry | x86-64 only; emulation is not      |
 |                | Pi)                            | supported                          |
 | Our load       | Fine: one writer (B7), a few   | Fine, but its strengths (many      |
 |                | thousand events a day, local   | writers, network access,           |
 |                | disk                           | replication) go unused             |
 | Backup         | Copy one file (SQLite's online | Its own backup tooling             |
 |                | backup)                        |                                    |
 | Same SQL as    | No: a few statements in two    | SQL Server Express: yes, the same  |
 | Azure SQL      | versions                       | T-SQL. PostgreSQL: a third         |
 |                |                                | dialect. MongoDB: not SQL, a third |
 |                |                                | data model                         |
 +----------------+--------------------------------+------------------------------------+
```

**The real choice this raises (DS3, Mode A engine; open):**
- **SQLite (agent's lean):** the smallest install, runs on any home box and developer laptop including ARM, no extra secret. Cost: a few statements in two versions (SQLite and T-SQL).
- **SQL Server Express in a container:** one SQL dialect everywhere, so the two-version code goes away. Cost: x86-64 only (no Apple-silicon Mac or Raspberry Pi, natively or emulated), at least 2 GB of memory, a database password at home, a second container to patch and back up. Free; 50 GB per database.
- Either way, the connector's outbox stays SQLite (a small local queue with its own schema).

**Evidence tags (this question):**
- **Known:** SQL Server on Linux needs at least 2 GB of memory and an x64 processor; its container images are supported only on x86-64 hosts, and emulation (Rosetta 2, Prism, QEMU) is not supported (Microsoft Learn, SQL Server on Linux installation guidance, updated 2026-10-14).
- **Known:** SQL Server 2025 Express is free, limited to 50 GB per database, the lesser of 1 socket or 4 cores, and 1,410 MB of buffer pool; its Entra authentication requires Azure Arc or an Azure VM; the Developer editions are not licensed for production (Microsoft Learn, SQL Server 2025 editions, updated 2026-10-19).
- **Known:** Azure SQL Edge, the former small ARM option, was retired on 30 September 2025 (Microsoft Learn).
- **Assumed:** PostgreSQL's official container runs on ARM and x86-64 and idles in tens of MB.

## Questions to the human

1. Which Azure store? ANSWERED 2026-10-25: Azure SQL Database Basic (see "DS3 decided").
1b. Mode A engine: SQLite (the agent's lean) or SQL Server Express in a container? ANSWERED 2026-10-26: SQLite (see "Answers 2026-10-26").
2. (ANSWERED 2026-10-26: yes, never backed up.) Is it right that the Ring token is never backed up, so losing the VM means redoing the Ring login and 2FA?
   Context given to the human 2026-10-25: a backup is a second copy of the most sensitive secret (SC4); the Ring token is renewed as it is used, so an old backup copy may already be stale (assumed, from how ring-client-api hands back a new refresh token to save); undelivered outbox events on a lost VM are gone too, but Ring's own history still has them; the alternative is backing up the encrypted file with its key kept apart.
3. Are DS1, DS2 and DS4-DS6 right, including rate-limit counters resetting on a restart? ANSWERED 2026-10-26: yes, as proposed.

## Answers 2026-10-26

The agent asked (2026-10-26): "For Mode A, do you want SQLite, or SQL Server Express in a container?", noting that the two earlier questions (the Ring token never backed up; the rest of the proposals, rendered in full on 2026-10-25) were still open and could be answered together.

The human, verbatim: "Do as you recomanded"

- **Read by the agent** as accepting the agent's stated recommendation on all three open questions, and said so to the human so they can correct it:
  - 1b: Mode A uses SQLite (the same schema as Azure SQL; a few statements in two versions);
  - 2: the Ring token is never backed up; losing the VM means redoing the Ring login and 2FA;
  - 3: DS1, DS2, DS4, DS5 and DS6 as proposed, including rate-limit counters resetting on a restart.
- **Confirmation:** human-confirmed (accepting the agent's rendered recommendation), scope lens-question, per decision point DS1, DS2, DS4-DS6; DS3 was confirmed 2026-10-25.

## Lens 5 summary (as decided, 2026-10-26)

```text
 +-----+--------------------+---------------------------------------------------------+
 | #   | Decision           | Decided                                                 |
 +-----+--------------------+---------------------------------------------------------+
 | DS1 | Persistent storage | Yes. Kept across restarts: event log, device state,     |
 |     |                    | cursors, sign-in records, config, audit copy. Memory    |
 |     |                    | only: rate-limit counters (reset on restart), open      |
 |     |                    | listen streams.                                         |
 | DS2 | Ownership          | One owning component per kind of data (the inventory).  |
 |     |                    | Which resource-access component owns commands, used     |
 |     |                    | tokens and the pending disarm is set in                 |
 |     |                    | component-design.                                       |
 | DS3 | Storage model      | Azure core: Azure SQL Database Basic (~$6.5 a month),   |
 |     |                    | Blob for media (7 days) and the WORM audit (SC5).       |
 |     |                    | Connector: SQLite outbox and the encrypted secrets      |
 |     |                    | file. Mode A: the same schema on SQLite. The query      |
 |     |                    | layer speaks SQLite and T-SQL.                          |
 | DS4 | Consistency        | One transaction per event (dedupe, next seq, append,    |
 |     |                    | state, audit link), then ack and push. Used one-time    |
 |     |                    | tokens and command IDs stored. A pending disarm is      |
 |     |                    | cancelled on restart. Media: blob first, then its row.  |
 |     |                    | Audit shipped to WORM at least once.                    |
 | DS5 | Lifecycle          | Additive, forward-only migrations at start; CI upgrade  |
 |     |                    | test on SQLite and SQL Server. Point-in-time restore    |
 |     |                    | and one restore drill in the pilot. Cursor epoch; seq   |
 |     |                    | never reused. Audit purge keeps an anchor. Ring token   |
 |     |                    | never backed up: losing the VM means redoing the Ring   |
 |     |                    | login and 2FA.                                          |
 | DS6 | Access             | Only the core's identity has database and blob rights.  |
 |     |                    | Each component reads only its own tables. The connector |
 |     |                    | and agents never touch the core database.               |
 +-----+--------------------+---------------------------------------------------------+
```

**Where the data lives (the as-decided lens diagram):**

```text
 WHERE THE DATA LIVES (lens 5 as decided, topology H)

 AZURE CORE (Container Apps, 1 replica)                     HOME VM (connector)
 +--------------------------------------------+             +--------------------------+
 | Azure SQL Database Basic (~$6.5 a month)   |             | Outbox (SQLite):         |
 |  event log, device state, cursors,         | <--events-- |  events until the core   |
 |  sign-in records, config, used tokens,     | ---ack----> |  acks them               |
 |  commands, audit copy                      |             | Secrets file (encrypted):|
 |  one schema; one owner per table group     |             |  Ring token, push creds, |
 |  only the core's identity; restore 7 d *   |             |  device ID, connector key|
 +--------------------------------------------+             |  never backed up (DS5)   |
 | Blob: media/ (7 days)                      |             +--------------------------+
 |  audit-90d/ audit-1y/ (WORM, the proof)    |
 +--------------------------------------------+
 | Memory only: rate-limit counters, open     |
 |  listen streams (gone on restart)          |
 +--------------------------------------------+
 MODE A (all at home): the same schema in one SQLite file, media in a folder,
   no WORM (hash chain only).
 * Assumed point-in-time restore window for Basic; checked in devops-operations.
```

**Carry-forwards:**
- **observability-resilience:** watch the database's size and load against Basic's 2 GB and 5 DTU; WORM shipping lag; the daily audit-copy comparison (SC5); what an agent sees when the epoch changes after a restore.
- **devops-operations:** network access to the database (a private endpoint has its own monthly charge; the server firewall or a service endpoint does not; to price there); the point-in-time restore window on Basic (assumed 7 days); the restore drill; a SQL Server container in CI; Azure SQL in Israel Central.
- **component-design:** which resource-access component owns commands, used tokens and the pending disarm; the issuer's storage adapter (node-oidc-provider on SQL); the auto-off timer owner (from lens 4).
- **code-implementation:** the SQL Server driver with managed-identity sign-in from Node; the query layer and migrations covering SQLite and T-SQL ("no new dependency" first).
- **Pilot:** measure the database size and load; run the restore drill.

## Pacing

The lens has 6 decision points. The agent offered the human a choice: answer all at once, or go one at a time starting with DS3, the store. The human did not pick; they went straight to DS3 with the cost question, and DS3 is now decided. The agent next asked questions 2 and 3 as a numbered pair (the style the human has used to answer), with the remaining proposals rendered again. The human then asked two questions of their own (cost; SQLite vs a server database), and answered everything on 2026-10-26. The agent presented the lens summary and asked whether to change anything or move on.

## Lens closed

2026-10-26: the human, verbatim: "move on". Lens 5 is closed; next is lens 6, observability-resilience (medium).

## Amendments from later lenses

- **2026-10-29, component-design A2 (human-confirmed):** DS1 changes for the PIN. The PIN tries and the disarm lock are now kept in the database, in one row owned by Command (the same row in SQLite in mode A), so a restart, a deploy or an auto-heal no longer resets them. Each wrong try is saved in the same transaction as its audit entry. Per-client rate limits stay in memory, as DS1 decided. See `component-design.md`.
