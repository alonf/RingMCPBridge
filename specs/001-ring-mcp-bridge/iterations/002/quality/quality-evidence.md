# Quality evidence for iteration 002

Codex assembled this record at closeout from the November 20 scanner artifact, implementation, tests and Claude review reports. The product build, lint, unit and integration tests, coverage gate and secret scan passed on the retrospective commit. [Product CI](https://github.com/alonf/RingMCPBridge/actions/runs/45067636397)

## Gate matrix

| Check | Result and limits |
| --- | --- |
| Mechanical checks | The recorded scan emitted 51 unused-field candidates. Each is traced below. It emitted no anti-pattern or test-integrity findings. |
| Concurrency | Cursor updates compare and write under a transaction. The cursor tests exercise independent clients and locations. |
| Resiliency | Event-path tests cover interruption between durable commit and acknowledgement. Callback delivery and the real alert have separate field evidence. |
| Retry and idempotency | Redelivery of a committed event resolves to its existing identity. Round eight inspected the outbox retries and acknowledgements. |
| Stack tooling and lenses | [Product CI](https://github.com/alonf/RingMCPBridge/actions/runs/45067636397) · [Robustness](lenses/robustness-baseline.md) · [Security](lenses/security-baseline.md) · [Test integrity](lenses/test-integrity.md) |

## Quickstart evidence

The named 0.5 s latency test records 40 calls to the event manager and asserts the 95th percentile of durable write time. The quickstart specifies receipt through push. The separate 913 ms field sample measures Ring trigger to ChatGPT callback acceptance. Neither establishes the receive-to-push p95. The cursor store test recreates the store over the same database, and the event-path test covers replay after commit. A process-kill cursor scenario still lacks evidence. The field checks for user-visible latency, email, soak, clocks and cost retain their approved dispositions. The desktop channel shim was explicitly deferred in DRIFT-002-02. [Quickstart](../../../quickstart.md) · [Review](../review.md) · [Drift decisions](../drift-log.md)

## Mechanical findings

The ID and field below identify each original scanner row. The cited file shows the reader or the database, migration or test boundary that consumes the value. [Original scan](mechanical-findings.json)

| Finding | Field | Consumer | Disposition |
| --- | --- | --- | --- |
| mf-001 | `keyNotEnrolled` | [home-session.ts](../../../../../bridge/src/connector/clients/core-link/home-session.ts) | The handshake close handler selects the corresponding action using each named constant. |
| mf-002 | `keyRevoked` | [home-session.ts](../../../../../bridge/src/connector/clients/core-link/home-session.ts) | The handshake close handler selects the corresponding action using each named constant. |
| mf-003 | `versionNotAccepted` | [home-session.ts](../../../../../bridge/src/connector/clients/core-link/home-session.ts) | The handshake close handler selects the corresponding action using each named constant. |
| mf-004 | `challengeFailed` | [home-session.ts](../../../../../bridge/src/connector/clients/core-link/home-session.ts) | The handshake close handler selects the corresponding action using each named constant. |
| mf-005 | `request_id` | [home-session.ts](../../../../../bridge/src/connector/clients/core-link/home-session.ts) | The refresh handler echoes the request identifier. |
| mf-006 | `table` | [statements.ts](../../../../../bridge/src/utilities/query-layer/statements.ts) | The cursor store passes this SQL upsert option to the dialect statement builder. |
| mf-007 | `key` | [statements.ts](../../../../../bridge/src/utilities/query-layer/statements.ts) | The cursor store passes this SQL upsert option to the dialect statement builder. |
| mf-008 | `values` | [statements.ts](../../../../../bridge/src/utilities/query-layer/statements.ts) | The cursor store passes this SQL upsert option to the dialect statement builder. |
| mf-009 | `updated_at` | [cursor-store.ts](../../../../../bridge/src/core/access/subscriptions/cursor-store.ts) | The cursor write binds the update timestamp as a SQL column through spec.values. |
| mf-010 | `onConflict` | [statements.ts](../../../../../bridge/src/utilities/query-layer/statements.ts) | The store passes this SQL upsert option to the dialect statement builder. |
| mf-011 | `table` | [statements.ts](../../../../../bridge/src/utilities/query-layer/statements.ts) | The store passes this SQL upsert option to the dialect statement builder. |
| mf-012 | `values` | [statements.ts](../../../../../bridge/src/utilities/query-layer/statements.ts) | The store passes this SQL upsert option to the dialect statement builder. |
| mf-013 | `created_at` | [subscriptions-store.ts](../../../../../bridge/src/core/access/subscriptions/subscriptions-store.ts) | The subscription write binds the creation timestamp as a SQL column through spec.values. |
| mf-014 | `onConflict` | [statements.ts](../../../../../bridge/src/utilities/query-layer/statements.ts) | The builder reads onConflict to construct an update. |
| mf-015 | `received_at` | [home-messages.test.ts](../../../../../bridge/src/core/clients/connector-link/messages/home-messages.test.ts) | A test fixture passes the field into eventSchema.safeParse, including nested device state and optional event fields. |
| mf-016 | `power_mode` | [home-messages.test.ts](../../../../../bridge/src/core/clients/connector-link/messages/home-messages.test.ts) | A test fixture passes the field into eventSchema.safeParse, including nested device state and optional event fields. |
| mf-017 | `online` | [home-messages.test.ts](../../../../../bridge/src/core/clients/connector-link/messages/home-messages.test.ts) | A test fixture passes the field into eventSchema.safeParse, including nested device state and optional event fields. |
| mf-018 | `state` | [home-messages.test.ts](../../../../../bridge/src/core/clients/connector-link/messages/home-messages.test.ts) | A test fixture passes the field into eventSchema.safeParse, including nested device state and optional event fields. |
| mf-019 | `as_of` | [home-messages.test.ts](../../../../../bridge/src/core/clients/connector-link/messages/home-messages.test.ts) | A test fixture passes the field into eventSchema.safeParse, including nested device state and optional event fields. |
| mf-020 | `room` | [home-messages.test.ts](../../../../../bridge/src/core/clients/connector-link/messages/home-messages.test.ts) | A test fixture passes the field into eventSchema.safeParse, including nested device state and optional event fields. |
| mf-021 | `data` | [home-messages.test.ts](../../../../../bridge/src/core/clients/connector-link/messages/home-messages.test.ts) | A test fixture passes the field into eventSchema.safeParse, including nested device state and optional event fields. |
| mf-022 | `key_id` | [core-session.ts](../../../../../bridge/src/core/clients/connector-link/core-session.ts) | The handshake uses this key to check enrollment. |
| mf-023 | `connector_version` | [event-manager.ts](../../../../../bridge/src/core/managers/event/event-manager.ts) | The authenticated session supplies this version to afterSessionOpened. |
| mf-024 | `signature` | [core-session.ts](../../../../../bridge/src/core/clients/connector-link/core-session.ts) | verifyChallenge reads the signature. |
| mf-025 | `public_key` | [core-session.ts](../../../../../bridge/src/core/clients/connector-link/core-session.ts) | The enrollment handler parses the public key. |
| mf-026 | `time_zone` | [intake-mapping.ts](../../../../../bridge/src/core/clients/connector-link/intake-mapping.ts) | The link mapper reads this field when constructing a location, device, inventory, event or heartbeat. |
| mf-027 | `alarm_mode` | [intake-mapping.ts](../../../../../bridge/src/core/clients/connector-link/intake-mapping.ts) | The link mapper reads this field when constructing a location, device, inventory, event or heartbeat. |
| mf-028 | `ownership` | [intake-mapping.ts](../../../../../bridge/src/core/clients/connector-link/intake-mapping.ts) | The link mapper reads this field when constructing a location, device, inventory, event or heartbeat. |
| mf-029 | `battery_pct` | [intake-mapping.ts](../../../../../bridge/src/core/clients/connector-link/intake-mapping.ts) | The link mapper reads this field when constructing a location, device, inventory, event or heartbeat. |
| mf-030 | `battery_low` | [intake-mapping.ts](../../../../../bridge/src/core/clients/connector-link/intake-mapping.ts) | The link mapper reads this field when constructing a location, device, inventory, event or heartbeat. |
| mf-031 | `power_mode` | [intake-mapping.ts](../../../../../bridge/src/core/clients/connector-link/intake-mapping.ts) | The link mapper reads this field when constructing a location, device, inventory, event or heartbeat. |
| mf-032 | `online` | [intake-mapping.ts](../../../../../bridge/src/core/clients/connector-link/intake-mapping.ts) | The link mapper reads this field when constructing a location, device, inventory, event or heartbeat. |
| mf-033 | `locations` | [intake-mapping.ts](../../../../../bridge/src/core/clients/connector-link/intake-mapping.ts) | The link mapper reads this field when constructing a location, device, inventory, event or heartbeat. |
| mf-034 | `devices` | [intake-mapping.ts](../../../../../bridge/src/core/clients/connector-link/intake-mapping.ts) | The link mapper reads this field when constructing a location, device, inventory, event or heartbeat. |
| mf-035 | `occurred_at` | [intake-mapping.ts](../../../../../bridge/src/core/clients/connector-link/intake-mapping.ts) | The link mapper reads this field when constructing a location, device, inventory, event or heartbeat. |
| mf-036 | `received_at` | [intake-mapping.ts](../../../../../bridge/src/core/clients/connector-link/intake-mapping.ts) | The link mapper reads this field when constructing a location, device, inventory, event or heartbeat. |
| mf-037 | `ring_session` | [intake-mapping.ts](../../../../../bridge/src/core/clients/connector-link/intake-mapping.ts) | The link mapper reads this field when constructing a location, device, inventory, event or heartbeat. |
| mf-038 | `outbox_depth` | [intake-mapping.ts](../../../../../bridge/src/core/clients/connector-link/intake-mapping.ts) | The link mapper reads this field when constructing a location, device, inventory, event or heartbeat. |
| mf-039 | `event_backlog` | [health-engine.ts](../../../../../bridge/src/core/engines/health/health-engine.ts) | afterHeartbeat copies backlog count and oldest age into health state. |
| mf-040 | `count` | [health-engine.ts](../../../../../bridge/src/core/engines/health/health-engine.ts) | afterHeartbeat copies backlog count and oldest age into health state. |
| mf-041 | `oldest_age_ms` | [health-engine.ts](../../../../../bridge/src/core/engines/health/health-engine.ts) | afterHeartbeat copies backlog count and oldest age into health state. |
| mf-042 | `inventory_owed_after` | [event-manager.ts](../../../../../bridge/src/core/managers/event/event-manager.ts) | The heartbeat handler reads the outstanding inventory version when checking for refresh debt. |
| mf-043 | `last_ring_event_at` | [health-engine.ts](../../../../../bridge/src/core/engines/health/health-engine.ts) | The heartbeat updates the last-event time. |
| mf-044 | `error_counts` | [intake-mapping.ts](../../../../../bridge/src/core/clients/connector-link/intake-mapping.ts) | incomingHeartbeat copies the wire map. No downstream reporting consumer was identified. Preserve the existing wire contract. |
| mf-045 | `shut` | [link-connection.ts](../../../../../bridge/src/utilities/link-transport/link-connection.ts) | The connection calls the socket adapter method when closing. |
| mf-046 | `version` | [migration.ts](../../../../../bridge/src/utilities/query-layer/migrations/migration.ts) | The migration validator reads the number, name and statement map. |
| mf-047 | `name` | [migration.ts](../../../../../bridge/src/utilities/query-layer/migrations/migration.ts) | The migration validator reads the number, name and statement map. |
| mf-048 | `statements` | [migration.ts](../../../../../bridge/src/utilities/query-layer/migrations/migration.ts) | The migration validator reads the number, name and statement map. |
| mf-049 | `sqlite` | [migrations.test.ts](../../../../../bridge/src/utilities/query-layer/migrations/migrations.test.ts) | Migration parity tests read both dialect lists. The runner selects statements by dialect. |
| mf-050 | `tsql` | [migrations.test.ts](../../../../../bridge/src/utilities/query-layer/migrations/migrations.test.ts) | Migration parity tests read both dialect lists. The runner selects statements by dialect. |
| mf-051 | `sub_id` | [subscriptions-store.test.ts](../../../../../bridge/test/core-access/subscriptions-store.test.ts) | The test matches this property against the identifier returned from save. |
