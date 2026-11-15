# Reviewer Index: Iteration 001

**Schema**: v1
**Reviewed**: 2026-11-15
**Overall Verdict**: accepted

## Summary

- Header: feature=001-ring-mcp-bridge | iteration=001 | branch=001-ring-mcp-bridge | commit_range=ae40fa10981259acab40787c0b60e38366a1cdde..fa291a7f981c8aace3d6a9abdd8aa43eda6d54ab
- Verdict: accepted
- Requirements: covered=FR-046, FR-047, FR-034, FR-006, FR-044, FR-029, FR-001, FR-033, FR-048, FR-032, FR-026, FR-042, FR-005, FR-002, FR-030, FR-040 | not_covered=(none)
- Code Surface: files=402 | hotspots=90 | test_to_code=117:188
- Dependencies: changed=14 | new_to_project=14 | vulnerability=6
- Coverage: kind=qualitative | signal=not_executed
- Operational Signals: escalations=0 | routing_fallbacks=0
- Drift: 90/0 resolved
- Reviewer Index: specs\001-ring-mcp-bridge\iterations\001\reviewer-index.md
- Implementation Briefing: (unavailable)
- Local Open Hints: specs\001-ring-mcp-bridge\iterations\001\reviewer-index.md; specs\001-ring-mcp-bridge\iterations\001\review-diagrams.md; specs\001-ring-mcp-bridge\current-architecture.md

## Read Order

1. [review.md](review.md)
2. [code-map.md](code-map.md)
3. [dependency-report.md](dependency-report.md)
4. [coverage-evidence.md](coverage-evidence.md)
5. [security-surface.md](security-surface.md)
6. [dashboard.md](dashboard.md)
7. [review-diagrams.md](review-diagrams.md)
8. [..\..\current-architecture.md](..\..\current-architecture.md)
9. Implementation briefing unavailable for this iteration

## Artifact Links

- [review.md](review.md)
- [code-map.md](code-map.md)
- [dependency-report.md](dependency-report.md)
- [coverage-evidence.md](coverage-evidence.md)
- [security-surface.md](security-surface.md)
- [dashboard.md](dashboard.md)
- [review-diagrams.md](review-diagrams.md)
- [..\..\current-architecture.md](..\..\current-architecture.md) *(mutable current view)*
- Implementation briefing unavailable
- [.squad\decisions.md](.squad\decisions.md)

## Triage Hints

- Hotspot: bridge/dev/admin-pages.ts (255 changed lines)
- Hotspot: bridge/src/connector/access/outbox-store/outbox-store.test.ts (324 changed lines)
- Hotspot: bridge/src/connector/access/outbox-store/outbox-store.ts (375 changed lines)
- Hotspot: bridge/src/connector/access/ring-adapter/call-limits.test.ts (274 changed lines)
- Hotspot: bridge/src/connector/access/ring-adapter/call-limits.ts (260 changed lines)
- Hotspot: bridge/src/connector/access/ring-adapter/ring-api-adapter.test.ts (1345 changed lines)
- Hotspot: bridge/src/connector/access/ring-adapter/ring-api-adapter.ts (798 changed lines)
- Hotspot: bridge/src/connector/access/ring-adapter/ring-mapping.test.ts (323 changed lines)
- Hotspot: bridge/src/connector/access/secrets-file/secrets-file.test.ts (391 changed lines)
- Hotspot: bridge/src/connector/access/secrets-file/secrets-file.ts (285 changed lines)
- Hotspot: bridge/src/connector/clients/core-link/core-link.test.ts (650 changed lines)
- Hotspot: bridge/src/connector/clients/core-link/home-session.ts (301 changed lines)
- Hotspot: bridge/src/connector/clients/setup-cli/setup.test.ts (373 changed lines)
- Hotspot: bridge/src/connector/clients/setup-cli/setup.ts (333 changed lines)
- Hotspot: bridge/src/connector/managers/ingest/ingest.test.ts (1154 changed lines)
- Hotspot: bridge/src/connector/managers/ingest/ingest.ts (574 changed lines)
- Hotspot: bridge/src/contract/inquiry-tools.ts (271 changed lines)
- Hotspot: bridge/src/core/access/grants/grants-store.ts (412 changed lines)
- Hotspot: bridge/src/core/access/secrets/sealed-file-secrets.test.ts (303 changed lines)
- Hotspot: bridge/src/core/access/settings/settings-store.ts (660 changed lines)
- Hotspot: bridge/src/core/access/state/state-store.ts (837 changed lines)
- Hotspot: bridge/src/core/clients/connector-link/connector-link.test.ts (1159 changed lines)
- Hotspot: bridge/src/core/clients/connector-link/core-session.ts (689 changed lines)
- Hotspot: bridge/src/core/clients/issuer/grants-adapter.test.ts (254 changed lines)
- Hotspot: bridge/src/core/clients/issuer/issuer.ts (682 changed lines)
- Hotspot: bridge/src/core/clients/mcp-endpoint/mcp-endpoint.ts (288 changed lines)
- Hotspot: bridge/src/core/clients/mcp-endpoint/read-tools.ts (402 changed lines)
- Hotspot: bridge/src/core/clients/web/pages.ts (542 changed lines)
- Hotspot: bridge/src/core/clients/web/web.test.ts (1048 changed lines)
- Hotspot: bridge/src/core/clients/web/web.ts (735 changed lines)
- Hotspot: bridge/src/core/engines/health/health-engine.test.ts (269 changed lines)
- Hotspot: bridge/src/core/engines/summary/summary-engine.test.ts (399 changed lines)
- Hotspot: bridge/src/core/engines/summary/summary-engine.ts (410 changed lines)
- Hotspot: bridge/src/core/managers/event/event-manager.test.ts (740 changed lines)
- Hotspot: bridge/src/core/managers/event/event-manager.ts (361 changed lines)
- Hotspot: bridge/src/core/managers/inquiry/inquiry-manager.test.ts (683 changed lines)
- Hotspot: bridge/src/core/managers/inquiry/inquiry-manager.ts (389 changed lines)
- Hotspot: bridge/src/host/all-in-one.ts (288 changed lines)
- Hotspot: bridge/src/host/core-service.ts (420 changed lines)
- Hotspot: bridge/src/types/oidc-provider.d.ts (325 changed lines)
- Hotspot: bridge/src/utilities/config/settings.test.ts (420 changed lines)
- Hotspot: bridge/src/utilities/link-transport/socket-link.test.ts (420 changed lines)
- Hotspot: bridge/src/utilities/logging/logger.test.ts (341 changed lines)
- Hotspot: bridge/src/utilities/logging/redaction-paths.test.ts (309 changed lines)
- Hotspot: bridge/src/utilities/query-layer/migrations/migrations.test.ts (254 changed lines)
- Hotspot: bridge/src/utilities/query-layer/query-layer.test.ts (754 changed lines)
- Hotspot: bridge/src/utilities/query-layer/query-layer.ts (356 changed lines)
- Hotspot: bridge/src/utilities/query-layer/tsql.ts (373 changed lines)
- Hotspot: bridge/src/utilities/security/entra-sign-in.test.ts (846 changed lines)
- Hotspot: bridge/src/utilities/security/entra-sign-in.ts (481 changed lines)
- Hotspot: bridge/test/contract/narrowing.test.ts (314 changed lines)
- Hotspot: bridge/test/contract/narrowing.ts (268 changed lines)
- Hotspot: bridge/test/core-access/grants-store.test.ts (534 changed lines)
- Hotspot: bridge/test/core-access/lease.test.ts (492 changed lines)
- Hotspot: bridge/test/core-access/settings-store.test.ts (640 changed lines)
- Hotspot: bridge/test/core-access/state-store.test.ts (707 changed lines)
- Hotspot: bridge/test/host/assembly.test.ts (325 changed lines)
- Hotspot: bridge/test/host/connector.test.ts (401 changed lines)
- Hotspot: bridge/test/infra/bootstrap.test.ts (652 changed lines)
- Hotspot: bridge/test/infra/deploy-workflow.test.ts (421 changed lines)
- Hotspot: bridge/test/infra/home-vm.test.ts (546 changed lines)
- Hotspot: bridge/test/issuer/issuer.test.ts (1920 changed lines)
- Hotspot: bridge/test/link/link-contract.test.ts (923 changed lines)
- Hotspot: bridge/test/mcp-endpoint/mcp-endpoint.test.ts (830 changed lines)
- Hotspot: bridge/test/pages/admin-page.spec.ts (339 changed lines)
- Hotspot: bridge/test/query-layer/migrations-contract.ts (635 changed lines)
- Hotspot: bridge/test/query-layer/query-layer-contract.ts (472 changed lines)
- Hotspot: bridge/test/query-layer/tsql.test.ts (390 changed lines)
- Hotspot: bridge/test/scenarios/scenario-engine.test.ts (339 changed lines)
- Hotspot: bridge/test/scenarios/scenario-engine.ts (274 changed lines)
- Hotspot: bridge/test/support/entra-stand-in.ts (275 changed lines)
- Hotspot: bridge/test/support/fake-ring-client.ts (365 changed lines)
- Hotspot: infra/bootstrap/bootstrap.ps1 (449 changed lines)
- Hotspot: infra/home/convert-qcow2.ps1 (273 changed lines)
- Hotspot: infra/home/new-connector-vm.ps1 (459 changed lines)
- Hotspot: package-lock.json (7702 changed lines)
- Hotspot: schemas/tool-replies.schema.json (828 changed lines)
- Hotspot: specs/001-ring-mcp-bridge/contracts/mcp-tools.md (343 changed lines)
- Hotspot: specs/001-ring-mcp-bridge/data-model.md (730 changed lines)
- Hotspot: specs/001-ring-mcp-bridge/iterations/001/code-map.md (1545 changed lines)
- Hotspot: specs/001-ring-mcp-bridge/iterations/001/dependency-report.md (483 changed lines)
- Hotspot: specs/001-ring-mcp-bridge/iterations/001/design-analysis.md (340 changed lines)
- Hotspot: specs/001-ring-mcp-bridge/iterations/001/drift-log.md (3133 changed lines)
- Hotspot: specs/001-ring-mcp-bridge/iterations/001/quality/mechanical-findings.json (506 changed lines)
- Hotspot: specs/001-ring-mcp-bridge/iterations/001/review-diagrams.md (624 changed lines)
- Hotspot: specs/001-ring-mcp-bridge/iterations/001/state.md (726 changed lines)
- Hotspot: specs/001-ring-mcp-bridge/plan.md (368 changed lines)
- Hotspot: specs/001-ring-mcp-bridge/quickstart.md (326 changed lines)
- Hotspot: specs/001-ring-mcp-bridge/research.md (928 changed lines)
- Hotspot: specs/001-ring-mcp-bridge/tasks.md (659 changed lines)
- Unknown license: typescript-eslint
- Unknown license: prettier
- Unknown license: @playwright/test
- Unknown license: dependency-cruiser
- Unknown license: @types/ws
- Unknown license: typescript
- Unknown license: @stryker-mutator/core
- Unknown license: @vitest/coverage-v8
- Unknown license: @types/node
- Unknown license: vitest
- Unknown license: @stryker-mutator/vitest-runner
- Unknown license: eslint
- Unknown license: eslint-config-prettier
- Unknown license: vite
- Coverage execution: not_executed
- Unresolved drift remains: 90
- Gap concern: SC-003 (the 7-day Ring-session soak, running since 2026-11-14): deferred to iteration 002, checked around 2026-11-21, with the owner's approval. Defer entry `rmb-i001-sc003-soak-deferred` in `.squad\decisions.md` (DEC-001-01, DRIFT-001-85).
- Gap concern: SC-011 (the bill for the month against the $30 ceiling): deferred to iteration 002 with the owner's approval. Defer entry `rmb-i001-sc011-bill-deferred` in `.squad\decisions.md` (DEC-001-01). So far about $0.47 for the first day.
- Gap concern: The clock check on the VM and the core, at the soak's end: deferred to iteration 002 with the owner's approval. Defer entry `rmb-i001-clock-check-deferred` in `.squad\decisions.md` (DEC-001-01).
- Gap concern: FR-007's wording ("below" against the bridge's "at or below"): fixed-now. The spec says "at or below", the owner's decision (DEC-001-02, DRIFT-001-85).

## Replay Digest

SPECREW_REVIEW schema=v1 iter=001 feature=001-ring-mcp-bridge verdict=accepted tasks=19/19 reqs=19 files=402 new_deps=14 vuln=6 cov=not_executed escalations=0 drift=90/0 index=specs\001-ring-mcp-bridge\iterations\001\reviewer-index.md
