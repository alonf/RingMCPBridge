# Security Surface: Iteration 002

**Schema**: v1
**Reviewed**:

## Trust Boundaries Touched

- bridge/dev/ring-pilot/app.ts
- bridge/dev/ring-pilot/client.ts
- bridge/dev/ring-pilot/links.ts
- bridge/dev/ring-pilot/main.ts
- bridge/dev/ring-pilot/snapshot.ts
- bridge/src/connector/access/outbox-store/index.ts
- bridge/src/connector/access/outbox-store/outbox-migrations.ts
- bridge/src/connector/access/outbox-store/outbox-store.ts
- bridge/src/connector/access/ring-adapter/index.ts
- bridge/src/connector/access/ring-adapter/ring-api-adapter.ts
- bridge/src/connector/access/ring-adapter/ring-client.ts
- bridge/src/connector/access/ring-adapter/ring-mapping.ts
- bridge/src/connector/access/ring-adapter/ring-port.ts
- bridge/src/connector/clients/home-scheduler/home-scheduler.ts
- bridge/src/connector/clients/home-scheduler/index.ts
- bridge/src/connector/clients/push-listener/index.ts
- bridge/src/connector/clients/push-listener/push-listener.ts
- bridge/src/connector/clients/push-listener/push-shape.ts
- bridge/src/connector/clients/push-listener/push-sighting.ts
- bridge/src/connector/engines/normalize/history-events.ts
- bridge/src/connector/engines/normalize/hub-events.ts
- bridge/src/connector/engines/normalize/index.ts
- bridge/src/connector/engines/normalize/normalize.ts
- bridge/src/connector/managers/ingest/home-view.ts
- bridge/src/connector/managers/ingest/index.ts
- bridge/src/connector/managers/ingest/ingest.ts
- bridge/src/contract/event.ts
- bridge/src/contract/events-tool.ts
- bridge/src/contract/index.ts
- bridge/src/contract/inquiry-tools.ts
- bridge/src/contract/json-schema.ts
- bridge/src/contract/tool-contract.ts
- bridge/src/core/access/audit/audit.ts
- bridge/src/core/access/audit/index.ts
- bridge/src/core/access/event-log/event-log.ts
- bridge/src/core/access/event-log/index.ts
- bridge/src/core/access/secrets/core-secrets.ts
- bridge/src/core/access/state/state-store.ts
- bridge/src/core/access/subscriptions/cursor-store.ts
- bridge/src/core/access/subscriptions/delivery-key.ts
- bridge/src/core/access/subscriptions/index.ts
- bridge/src/core/access/subscriptions/subscriptions-store.ts
- bridge/src/core/clients/connector-link/core-session.ts
- bridge/src/core/clients/connector-link/intake-mapping.ts
- bridge/src/core/clients/connector-link/messages/home-messages.ts
- bridge/src/core/clients/connector-link/messages/index.ts
- bridge/src/core/clients/delivery/callback-transport.ts
- bridge/src/core/clients/delivery/delivery.ts
- bridge/src/core/clients/delivery/index.ts
- bridge/src/core/clients/delivery/webhook-signature.ts
- bridge/src/core/clients/issuer/issuer.ts
- bridge/src/core/clients/mcp-endpoint/events-handler.ts
- bridge/src/core/clients/mcp-endpoint/index.ts
- bridge/src/core/clients/mcp-endpoint/listen-stream.ts
- bridge/src/core/clients/mcp-endpoint/mcp-endpoint.ts
- bridge/src/core/clients/mcp-endpoint/read-tools.ts
- bridge/src/core/clients/scheduler/index.ts
- bridge/src/core/engines/classify/classify-engine.ts
- bridge/src/core/engines/classify/index.ts
- bridge/src/core/engines/health/health-engine.ts
- bridge/src/core/engines/health/index.ts
- bridge/src/core/engines/summary/summary-engine.ts
- bridge/src/core/managers/event/event-intake.ts
- bridge/src/core/managers/event/event-manager.ts
- bridge/src/core/managers/event/event-writer.ts
- bridge/src/core/managers/event/index.ts
- bridge/src/core/managers/inquiry/events-read.ts
- bridge/src/core/managers/inquiry/index.ts
- bridge/src/core/managers/inquiry/inquiry-manager.ts
- bridge/src/host/all-in-one.ts
- bridge/src/host/connector.ts
- bridge/src/host/core-assembly.ts
- bridge/src/host/core-service.ts
- bridge/src/host/first-signing-key.ts
- bridge/src/host/home-assembly.ts
- bridge/src/host/leased-links.ts
- bridge/src/host/main.ts
- bridge/src/host/priority-policy.ts
- bridge/src/host/push-shapes-file.ts
- bridge/src/host/ring-home.live.ts
- bridge/src/utilities/config/event-rules.ts
- bridge/src/utilities/config/index.ts
- bridge/src/utilities/config/mode-settings.ts
- bridge/src/utilities/config/settings.ts
- bridge/src/utilities/logging/log-fields.ts
- bridge/src/utilities/logging/logger.ts
- bridge/src/utilities/query-layer/migrations/0007-event-log-and-audit.ts
- bridge/src/utilities/query-layer/migrations/0008-webhook-subscriptions.ts
- bridge/src/utilities/query-layer/migrations/0009-event-cursors.ts
- bridge/src/utilities/query-layer/migrations/0010-recovery-health.ts
- bridge/src/utilities/query-layer/migrations/core-migrations.ts
- bridge/src/utilities/security/sealing.ts
- infra/bootstrap/bootstrap.ps1
- infra/bootstrap/set-alert-contacts.ps1
- infra/home/new-connector-vm.ps1
- infra/home/start-ring-pilot.ps1

## Sensitive Data Touchpoints

- none | No changed files matched reviewer.sensitive_data_patterns.

## Security Specialist Findings

- No security specialist was present for this iteration.

## Vulnerability Highlights

"severity": "high", "severity": "high", "severity": "high", "severity": "high", "high": 3, "critical": 0,
