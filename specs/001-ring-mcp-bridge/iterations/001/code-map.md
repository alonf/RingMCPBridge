# Code Map: Iteration 001

**Schema**: v1
**Reviewed**: 2026-11-15
**Baseline Ref**: ae40fa10981259acab40787c0b60e38366a1cdde
**Test-to-Code Ratio**: 117:188

> **⚠️ Review Evidence Warning** _(Form-vs-Meaning Gap Detected)_
>
> This iteration's task tracking declares **19 completed task(s)**, but the git diff against baseline `ae40fa10981259acab40787c0b60e38366a1cdde` contains **393 file(s)**.
>
> **Severity**: WARNING
> **Implication**: Review evidence may be incomplete or misleading.
>
> **Possible causes**:
>
> - Implementation work was not committed before scaffolding review artifacts
> - Task status markers in plan.md or review.md do not match actual progress
> - Baseline reference in state.md is stale or incorrect
>
> **Remediation**:
>
> 1. Verify implementation is committed: `git diff ae40fa10981259acab40787c0b60e38366a1cdde...HEAD --stat`
> 2. If uncommitted work exists: `git add . && git commit -m "Implementation complete"`
> 3. Re-run scaffolder with `-Force` flag to regenerate review artifacts after commit
> 4. Re-run `validate-governance.ps1` to clear pre-review commit gate error
>
> _See Proposal 073 (Review Evidence Integrity) for background on this validation._

---

## Files Touched

| Path | Lines Added | Lines Removed | Owning Task ID(s) | Owning Role |
| ---- | ----------- | ------------- | ----------------- | ----------- |
| .dependency-cruiser.cjs | 160 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| .dockerignore | 10 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| .gitattributes | 10 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| .githooks/pre-commit | 9 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| .github/workflows/admin-page.yml | 44 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| .github/workflows/ci.yml | 118 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| .github/workflows/deploy.yml | 246 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| .github/workflows/specrew-ci.yml | 18 | 123 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| .github/workflows/specrew-confidence-lane.yml | 3 | 2 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| .github/workflows/specrew-project-sync.yml | 3 | 11 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| .github/workflows/weekly.yml | 33 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| .gitignore | 23 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| .gitleaks.toml | 31 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| .gitleaksignore | 3 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| .npmrc | 1 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| .prettierignore | 30 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| .prettierrc.json | 1 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| .specrew/handoff-evidence.json | 35 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| .specrew/iteration-config.yml | 1 | 1 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| .squad/decisions.md | 145 | 1 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| .squad/events/lifecycle-events.jsonl | 6 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| .squad/identity/now.md | 5 | 5 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| CLAUDE.md | 2 | 1 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| LICENSE | 21 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| README.md | 114 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/Dockerfile | 33 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/dev/admin-pages.ts | 255 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/dev/all-in-one-scenario.ts | 66 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/package.json | 25 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/connector/.gitkeep | 0 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/connector/access/outbox-store/index.ts | 22 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/connector/access/outbox-store/outbox-migrations.ts | 36 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/connector/access/outbox-store/outbox-store-error.ts | 24 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/connector/access/outbox-store/outbox-store.test.ts | 324 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/src/connector/access/outbox-store/outbox-store.ts | 375 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/connector/access/ring-adapter/alarm-devices.ts | 141 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/connector/access/ring-adapter/call-limits.test.ts | 274 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/src/connector/access/ring-adapter/call-limits.ts | 260 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/connector/access/ring-adapter/hub-sessions.ts | 153 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/connector/access/ring-adapter/index.ts | 34 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/connector/access/ring-adapter/ring-adapter-error.ts | 24 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/connector/access/ring-adapter/ring-api-adapter.test.ts | 1345 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/src/connector/access/ring-adapter/ring-api-adapter.ts | 798 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/connector/access/ring-adapter/ring-client.live.ts | 28 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/connector/access/ring-adapter/ring-client.ts | 159 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/connector/access/ring-adapter/ring-failure.ts | 61 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/connector/access/ring-adapter/ring-library.live.ts | 17 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/connector/access/ring-adapter/ring-login.live.test.ts | 186 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/src/connector/access/ring-adapter/ring-login.live.ts | 105 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/connector/access/ring-adapter/ring-login.ts | 45 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/connector/access/ring-adapter/ring-mapping.test.ts | 323 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/src/connector/access/ring-adapter/ring-mapping.ts | 199 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/connector/access/ring-adapter/ring-port.ts | 102 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/connector/access/ring-adapter/room-lists.ts | 39 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/connector/access/secrets-file/index.ts | 21 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/connector/access/secrets-file/secrets-file-error.ts | 27 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/connector/access/secrets-file/secrets-file-key.test.ts | 77 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/src/connector/access/secrets-file/secrets-file-key.ts | 52 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/connector/access/secrets-file/secrets-file.test.ts | 391 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/src/connector/access/secrets-file/secrets-file.ts | 285 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/connector/clients/core-link/core-link.test.ts | 650 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/src/connector/clients/core-link/core-link.ts | 152 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/connector/clients/core-link/home-session.ts | 301 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/connector/clients/core-link/index.ts | 10 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/connector/clients/core-link/messages/core-messages.ts | 111 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/connector/clients/core-link/messages/index.ts | 23 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/connector/clients/home-scheduler/home-scheduler.test.ts | 129 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/src/connector/clients/home-scheduler/home-scheduler.ts | 103 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/connector/clients/home-scheduler/index.ts | 9 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/connector/clients/setup-cli/enrollment-code.test.ts | 61 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/src/connector/clients/setup-cli/enrollment-code.ts | 32 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/connector/clients/setup-cli/index.ts | 15 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/connector/clients/setup-cli/setup-console.ts | 16 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/connector/clients/setup-cli/setup.test.ts | 373 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/src/connector/clients/setup-cli/setup.ts | 333 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/connector/clients/setup-cli/terminal-console.test.ts | 108 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/src/connector/clients/setup-cli/terminal-console.ts | 99 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/connector/managers/ingest/home-view.ts | 109 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/connector/managers/ingest/index.ts | 6 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/connector/managers/ingest/ingest.test.ts | 1154 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/src/connector/managers/ingest/ingest.ts | 574 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/contract/envelopes.test.ts | 93 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/src/contract/envelopes.ts | 115 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/contract/index.ts | 56 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/contract/inquiry-tools.test.ts | 127 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/src/contract/inquiry-tools.ts | 271 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/contract/json-schema.ts | 89 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/contract/shapes.ts | 89 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/contract/untrusted.ts | 42 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/core/.gitkeep | 0 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/core/access/README.md | 45 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/core/access/grants/grants-store-error.ts | 24 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/core/access/grants/grants-store.ts | 412 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/core/access/grants/index.ts | 14 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/core/access/lease/index.ts | 20 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/core/access/lease/lease.ts | 248 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/core/access/secrets/core-secrets.ts | 32 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/core/access/secrets/index.ts | 22 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/core/access/secrets/key-vault-client.live.ts | 35 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/core/access/secrets/key-vault-secrets.test.ts | 186 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/src/core/access/secrets/key-vault-secrets.ts | 116 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/core/access/secrets/sealed-file-secrets.test.ts | 303 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/src/core/access/secrets/sealed-file-secrets.ts | 170 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/core/access/secrets/secrets-error.ts | 22 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/core/access/settings/index.ts | 26 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/core/access/settings/settings-store-error.ts | 24 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/core/access/settings/settings-store.ts | 660 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/core/access/state/index.ts | 24 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/core/access/state/state-store-error.ts | 25 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/core/access/state/state-store.ts | 837 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/core/clients/connector-link/connector-link.test.ts | 1159 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/src/core/clients/connector-link/connector-link.ts | 167 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/core/clients/connector-link/core-session.ts | 689 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/core/clients/connector-link/index.ts | 15 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/core/clients/connector-link/intake-mapping.ts | 94 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/core/clients/connector-link/messages/home-messages.test.ts | 76 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/src/core/clients/connector-link/messages/home-messages.ts | 195 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/core/clients/connector-link/messages/index.ts | 30 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/core/clients/issuer/bounded-fetch.test.ts | 233 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/src/core/clients/issuer/bounded-fetch.ts | 90 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/core/clients/issuer/first-signing-key.test.ts | 64 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/src/core/clients/issuer/first-signing-key.ts | 29 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/core/clients/issuer/grants-adapter.test.ts | 254 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/src/core/clients/issuer/grants-adapter.ts | 190 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/core/clients/issuer/index.ts | 40 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/core/clients/issuer/issuer-error.ts | 22 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/core/clients/issuer/issuer.ts | 682 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/core/clients/issuer/listed-agents.ts | 114 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/core/clients/issuer/pending-sign-ins.test.ts | 57 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/src/core/clients/issuer/pending-sign-ins.ts | 63 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/core/clients/issuer/provider-configuration.ts | 218 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/core/clients/issuer/registration-limit.ts | 41 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/core/clients/issuer/signing-keys.ts | 110 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/core/clients/mcp-endpoint/index.ts | 25 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/core/clients/mcp-endpoint/listed-input.ts | 24 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/core/clients/mcp-endpoint/mcp-endpoint.ts | 288 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/core/clients/mcp-endpoint/read-limit.test.ts | 52 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/src/core/clients/mcp-endpoint/read-limit.ts | 55 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/core/clients/mcp-endpoint/read-tools.ts | 402 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/core/clients/web/admin-sign-ins.ts | 67 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/core/clients/web/contrast.test.ts | 99 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/src/core/clients/web/cookies.ts | 65 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/core/clients/web/health-panel.test.ts | 75 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/src/core/clients/web/health-panel.ts | 207 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/core/clients/web/index.ts | 22 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/core/clients/web/owner-sessions.ts | 141 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/core/clients/web/page-script.ts | 89 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/core/clients/web/pages.ts | 542 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/core/clients/web/styles.ts | 198 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/core/clients/web/web.test.ts | 1048 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/src/core/clients/web/web.ts | 735 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/core/engines/health/health-engine.test.ts | 269 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/src/core/engines/health/health-engine.ts | 226 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/core/engines/health/index.ts | 18 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/core/engines/summary/index.ts | 29 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/core/engines/summary/summary-engine.test.ts | 399 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/src/core/engines/summary/summary-engine.ts | 410 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/core/managers/admin/admin-error.ts | 20 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/core/managers/admin/admin-manager.test.ts | 140 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/src/core/managers/admin/admin-manager.ts | 125 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/core/managers/admin/index.ts | 18 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/core/managers/event/event-error.ts | 20 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/core/managers/event/event-intake.ts | 186 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/core/managers/event/event-manager.test.ts | 740 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/src/core/managers/event/event-manager.ts | 361 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/core/managers/event/index.ts | 28 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/core/managers/inquiry/index.ts | 30 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/core/managers/inquiry/inquiry-error.ts | 44 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/core/managers/inquiry/inquiry-manager.test.ts | 683 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/src/core/managers/inquiry/inquiry-manager.ts | 389 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/host/.gitkeep | 0 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/host/all-in-one.ts | 288 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/host/connector-health.test.ts | 202 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/src/host/connector-health.ts | 213 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/host/connector.ts | 135 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/host/core-assembly.ts | 127 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/host/core-service.ts | 420 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/host/core.ts | 71 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/host/first-signing-key.ts | 80 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/host/home-assembly.ts | 88 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/host/home-files.ts | 110 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/host/host-error.ts | 34 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/host/leased-links.ts | 171 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/host/main.ts | 170 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/host/ring-home.live.ts | 60 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/host/setup.ts | 73 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/host/version.ts | 13 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/types/oidc-provider.d.ts | 325 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/utilities/clock/clock-error.ts | 15 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/utilities/clock/clock.test.ts | 199 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/src/utilities/clock/clock.ts | 68 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/utilities/clock/fake-clock.ts | 119 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/utilities/clock/index.ts | 18 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/utilities/clock/time-format.ts | 81 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/utilities/config/config-error.ts | 18 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/utilities/config/index.ts | 36 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/utilities/config/mode-settings.ts | 234 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/utilities/config/section.ts | 37 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/utilities/config/settings.test.ts | 420 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/src/utilities/config/settings.ts | 199 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/utilities/link-transport/dial-link.ts | 100 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/utilities/link-transport/index.ts | 44 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/utilities/link-transport/link-connection.ts | 188 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/utilities/link-transport/link-frame.test.ts | 138 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/src/utilities/link-transport/link-frame.ts | 173 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/utilities/link-transport/link-pair.test.ts | 225 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/src/utilities/link-transport/link-pair.ts | 101 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/utilities/link-transport/link-server.ts | 58 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/utilities/link-transport/link-slot.ts | 26 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/utilities/link-transport/send-queue.test.ts | 106 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/src/utilities/link-transport/send-queue.ts | 92 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/utilities/link-transport/socket-link.test.ts | 420 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/src/utilities/link-transport/socket-link.ts | 140 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/utilities/logging/format-line.ts | 57 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/utilities/logging/index.ts | 23 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/utilities/logging/log-fields.ts | 60 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/utilities/logging/logger.test.ts | 341 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/src/utilities/logging/logger.ts | 100 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/utilities/logging/redaction-paths.test.ts | 309 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/src/utilities/logging/redaction.test.ts | 155 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/src/utilities/logging/redaction.ts | 177 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/utilities/logging/serialize-error.ts | 113 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/utilities/logging/stdout-sink.ts | 22 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/utilities/pub-sub/index.ts | 10 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/utilities/pub-sub/pub-sub.test.ts | 123 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/src/utilities/pub-sub/pub-sub.ts | 89 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/utilities/query-layer/index.ts | 43 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/utilities/query-layer/migrations/0001-iteration-001-schema.ts | 206 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/utilities/query-layer/migrations/0002-connector-enrollment-code.ts | 19 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/utilities/query-layer/migrations/0003-one-pending-enrollment.ts | 15 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/utilities/query-layer/migrations/0004-state-source.ts | 33 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/utilities/query-layer/migrations/0005-snapshot-order.ts | 35 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/utilities/query-layer/migrations/0006-motion-since.ts | 19 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/utilities/query-layer/migrations/core-migrations.ts | 18 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/utilities/query-layer/migrations/migration.ts | 72 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/utilities/query-layer/migrations/migrations.test.ts | 254 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/src/utilities/query-layer/migrations/run-migrations.ts | 193 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/utilities/query-layer/parameters.ts | 142 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/utilities/query-layer/query-layer-error.ts | 45 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/utilities/query-layer/query-layer.test.ts | 754 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/src/utilities/query-layer/query-layer.ts | 356 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/utilities/query-layer/serial-queue.test.ts | 114 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/src/utilities/query-layer/serial-queue.ts | 34 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/utilities/query-layer/sql-driver.ts | 96 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/utilities/query-layer/sql-types.ts | 42 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/utilities/query-layer/sqlite.test.ts | 36 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/src/utilities/query-layer/sqlite.ts | 151 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/utilities/query-layer/statements.test.ts | 249 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/src/utilities/query-layer/statements.ts | 194 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/utilities/query-layer/tsql-managed-identity.live.ts | 33 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/utilities/query-layer/tsql.test.ts | 177 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/src/utilities/query-layer/tsql.ts | 373 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/utilities/query-layer/until-aborted.ts | 26 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/utilities/security/atomic-write.ts | 81 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/utilities/security/entra-discovery.ts | 126 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/utilities/security/entra-sign-in.test.ts | 846 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/src/utilities/security/entra-sign-in.ts | 481 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/utilities/security/index.ts | 61 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/utilities/security/managed-identity-assertion.live.ts | 26 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/utilities/security/sealing.ts | 100 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/utilities/security/secret.test.ts | 14 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/src/utilities/security/secret.ts | 32 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/utilities/security/security-error.ts | 39 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/src/utilities/security/security.test.ts | 228 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/src/utilities/security/signing.ts | 148 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| bridge/test/contract/flat-inputs.test.ts | 108 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/test/contract/flat-inputs.ts | 83 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/test/contract/narrowing.test.ts | 314 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/test/contract/narrowing.ts | 268 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/test/contract/public-contract.test.ts | 232 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/test/contract/schema-node.ts | 39 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/test/contract/untrusted-marking.test.ts | 96 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/test/contract/untrusted-marking.ts | 79 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/test/core-access/grants-store.test.ts | 534 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/test/core-access/lease.test.ts | 492 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/test/core-access/settings-store.test.ts | 640 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/test/core-access/state-store.test.ts | 707 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/test/fixtures/qcow2/every-cluster-kind.qcow2 | - | - | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/test/fixtures/ring/.gitkeep | 0 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/test/host/admin-page.test.ts | 228 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/test/host/all-in-one-lease.test.ts | 173 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/test/host/all-in-one.test.ts | 155 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/test/host/assembly.test.ts | 325 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/test/host/connector-health.test.ts | 201 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/test/host/connector.test.ts | 401 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/test/host/core-fixture.ts | 172 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/test/host/core-service.test.ts | 237 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/test/host/first-signing-key.test.ts | 134 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/test/host/hybrid-end-to-end.test.ts | 240 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/test/host/leased-links.test.ts | 68 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/test/host/one-home-part.test.ts | 214 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/test/infra/bootstrap-harness.ps1 | 50 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/test/infra/bootstrap.test.ts | 652 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/test/infra/core-deployment.test.ts | 122 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/test/infra/deploy-workflow.test.ts | 421 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/test/infra/home-vm-harness.ps1 | 111 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/test/infra/home-vm.test.ts | 546 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/test/issuer/issuer.test.ts | 1920 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/test/link/link-contract.test.ts | 923 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/test/mcp-endpoint/core-fixture.ts | 76 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/test/mcp-endpoint/mcp-endpoint.test.ts | 830 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/test/mcp-endpoint/stdio-fixture.ts | 33 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/test/pages/admin-page.spec.ts | 339 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/test/query-layer/migrations-contract.ts | 635 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/test/query-layer/query-layer-contract.ts | 472 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/test/query-layer/sqlite.test.ts | 134 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/test/query-layer/tsql.test.ts | 390 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/test/ring-boundary/ring-boundary.test.ts | 186 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/test/scenarios/.gitkeep | 0 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/test/scenarios/faulty-channel.test.ts | 78 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/test/scenarios/faulty-channel.ts | 62 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/test/scenarios/index.ts | 25 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/test/scenarios/scenario-engine.test.ts | 339 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/test/scenarios/scenario-engine.ts | 274 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/test/scenarios/simulated-home.test.ts | 84 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/test/scenarios/simulated-home.ts | 185 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/test/support/drive-clock.ts | 47 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/test/support/entra-stand-in.test.ts | 157 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/test/support/entra-stand-in.ts | 275 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/test/support/fake-ring-client.ts | 365 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/test/support/index.ts | 48 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/test/support/mcp-client.test.ts | 92 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/test/support/mcp-client.ts | 64 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/test/support/owner-browser.ts | 64 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/test/support/recording-intake.ts | 93 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/test/support/store-matrix.test.ts | 56 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/test/support/store-matrix.ts | 167 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| bridge/test/support/throwaway-certificate.ts | 67 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| docker-compose.yml | 28 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| eslint.config.js | 104 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| infra/.gitkeep | 0 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| infra/bicepconfig.json | 17 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| infra/bootstrap/bootstrap.ps1 | 449 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| infra/bootstrap/entra-app-registration.md | 137 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| infra/home/convert-qcow2.ps1 | 273 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| infra/home/new-connector-vm.ps1 | 459 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| infra/main.bicep | 176 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| infra/main.example.bicepparam | 17 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| infra/modules/app-service.bicep | 209 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| infra/modules/key-vault.bicep | 52 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| infra/modules/monitoring.bicep | 35 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| infra/modules/network.bicep | 50 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| infra/modules/sql.bicep | 74 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| infra/modules/storage.bicep | 47 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| package-lock.json | 7702 | 0 | CP-01 | Implementer |
| package.json | 63 | 0 | CP-01 | Implementer |
| playwright.config.ts | 42 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| schemas/tool-error.schema.json | 83 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| schemas/tool-inputs.schema.json | 77 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| schemas/tool-replies.schema.json | 828 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| scripts/audit-exceptions.json | 10 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| scripts/audit-gate.mjs | 98 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| scripts/deploy-parameters.mjs | 176 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| scripts/deploy-smoke.mjs | 153 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| scripts/image-smoke.mjs | 169 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| scripts/license-exceptions.json | 26 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| scripts/license-gate.mjs | 95 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| scripts/run-gitleaks.mjs | 114 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| shim/package.json | 7 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| shim/src/.gitkeep | 0 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| specs/001-ring-mcp-bridge/contracts/connector-link.md | 228 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| specs/001-ring-mcp-bridge/contracts/errors.md | 140 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| specs/001-ring-mcp-bridge/contracts/events.schema.json | 189 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| specs/001-ring-mcp-bridge/contracts/iteration-001-tools.schema.json | 75 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| specs/001-ring-mcp-bridge/contracts/iteration-002-tools.schema.json | 46 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| specs/001-ring-mcp-bridge/contracts/mcp-tools.md | 343 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| specs/001-ring-mcp-bridge/contracts/mechanical-findings.schema.json | 77 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| specs/001-ring-mcp-bridge/contracts/web-endpoints.md | 105 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| specs/001-ring-mcp-bridge/data-model.md | 730 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| specs/001-ring-mcp-bridge/gates/design-analysis-001.md | 59 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| specs/001-ring-mcp-bridge/implementation-rules.yml | 49 | 1 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| specs/001-ring-mcp-bridge/iterations/001/design-analysis.md | 340 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| specs/001-ring-mcp-bridge/iterations/001/drift-log.md | 3119 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| specs/001-ring-mcp-bridge/iterations/001/lens-applicability.json | 51 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| specs/001-ring-mcp-bridge/iterations/001/plan.md | 124 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| specs/001-ring-mcp-bridge/iterations/001/quality/hardening-gate.md | 58 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| specs/001-ring-mcp-bridge/iterations/001/quality/lenses/robustness-baseline.md | 51 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| specs/001-ring-mcp-bridge/iterations/001/quality/lenses/security-baseline.md | 51 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| specs/001-ring-mcp-bridge/iterations/001/quality/lenses/test-integrity.md | 51 | 0 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| specs/001-ring-mcp-bridge/iterations/001/quality/mechanical-findings.json | 506 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| specs/001-ring-mcp-bridge/iterations/001/quality/quality-evidence.md | 109 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| specs/001-ring-mcp-bridge/iterations/001/state.md | 721 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| specs/001-ring-mcp-bridge/plan.md | 368 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| specs/001-ring-mcp-bridge/quickstart.md | 326 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| specs/001-ring-mcp-bridge/research.md | 928 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| specs/001-ring-mcp-bridge/spec.md | 6 | 6 | CP-01, CP-04, CP-11a, CP-RV | Implementer |
| specs/001-ring-mcp-bridge/tasks.md | 659 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| specs/001-ring-mcp-bridge/workshop/product-domain.md | 34 | 4 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| specs/001-ring-mcp-bridge/workshop/product-domain.yml | 4 | 4 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| stryker.config.mjs | 13 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| tsconfig.base.json | 27 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| tsconfig.json | 18 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |
| vitest.config.ts | 27 | 0 | CP-01, CP-02, CP-03, CP-04, CP-05, CP-06, CP-07, CP-08a, CP-09, CP-10, CP-11a, CP-14, CP-15, CP-16, CP-17, CP-19, CP-21a, CP-RW | Implementer |

## Public-API Delta

### Added

- randomText (bridge/dev/admin-pages.ts)
- healthData (bridge/dev/admin-pages.ts)
- ownerHealth (bridge/dev/admin-pages.ts)
- waitingRequest (bridge/dev/admin-pages.ts)
- signIn (bridge/dev/admin-pages.ts)
- newScenario (bridge/dev/admin-pages.ts)
- scenarioOf (bridge/dev/admin-pages.ts)
- redirect (bridge/dev/admin-pages.ts)
- control (bridge/dev/admin-pages.ts)
- stop (bridge/dev/all-in-one-scenario.ts)
- OUTBOX_MIGRATIONS (bridge/src/connector/access/outbox-store/outbox-migrations.ts)
- OutboxStoreError (bridge/src/connector/access/outbox-store/outbox-store-error.ts)
- deviceState (bridge/src/connector/access/outbox-store/outbox-store.test.ts)
- appendOne (bridge/src/connector/access/outbox-store/outbox-store.test.ts)
- idsOf (bridge/src/connector/access/outbox-store/outbox-store.test.ts)
- OUTBOX_FILE_NAME (bridge/src/connector/access/outbox-store/outbox-store.ts)
- RESEND_AFTER_MS (bridge/src/connector/access/outbox-store/outbox-store.ts)
- OutboxStore (bridge/src/connector/access/outbox-store/outbox-store.ts)
- itemOf (bridge/src/connector/access/outbox-store/outbox-store.ts)
- isKnownKind (bridge/src/connector/access/outbox-store/outbox-store.ts)
- unreadableRow (bridge/src/connector/access/outbox-store/outbox-store.ts)
- lockHeldElsewhere (bridge/src/connector/access/outbox-store/outbox-store.ts)
- unavailable (bridge/src/connector/access/outbox-store/outbox-store.ts)
- statement (bridge/src/connector/access/outbox-store/outbox-store.ts)
- AlarmDevices (bridge/src/connector/access/ring-adapter/alarm-devices.ts)
- zidOf (bridge/src/connector/access/ring-adapter/alarm-devices.ts)
- isId (bridge/src/connector/access/ring-adapter/alarm-devices.ts)
- unavailable (bridge/src/connector/access/ring-adapter/call-limits.test.ts)
- never (bridge/src/connector/access/ring-adapter/call-limits.test.ts)
- RING_CALL_LIMITS (bridge/src/connector/access/ring-adapter/call-limits.ts)
- backoffDelayMs (bridge/src/connector/access/ring-adapter/call-limits.ts)
- Circuit (bridge/src/connector/access/ring-adapter/call-limits.ts)
- turnOrAbort (bridge/src/connector/access/ring-adapter/call-limits.ts)
- isRingUnavailable (bridge/src/connector/access/ring-adapter/call-limits.ts)
- RingCallGate (bridge/src/connector/access/ring-adapter/call-limits.ts)
- HubSessions (bridge/src/connector/access/ring-adapter/hub-sessions.ts)
- RingAdapterError (bridge/src/connector/access/ring-adapter/ring-adapter-error.ts)
- setup (bridge/src/connector/access/ring-adapter/ring-api-adapter.test.ts)
- never (bridge/src/connector/access/ring-adapter/ring-api-adapter.test.ts)
- hangUntilAnswered (bridge/src/connector/access/ring-adapter/ring-api-adapter.test.ts)
- motionSensor (bridge/src/connector/access/ring-adapter/ring-api-adapter.test.ts)
- listChanges (bridge/src/connector/access/ring-adapter/ring-api-adapter.test.ts)
- deviceChangesOf (bridge/src/connector/access/ring-adapter/ring-api-adapter.test.ts)
- sessionChanges (bridge/src/connector/access/ring-adapter/ring-api-adapter.test.ts)
- probeLines (bridge/src/connector/access/ring-adapter/ring-api-adapter.test.ts)
- signInGone (bridge/src/connector/access/ring-adapter/ring-api-adapter.test.ts)
- rooms (bridge/src/connector/access/ring-adapter/ring-api-adapter.test.ts)
- roomLines (bridge/src/connector/access/ring-adapter/ring-api-adapter.test.ts)
- RING_CALL_TIMEOUT_MS (bridge/src/connector/access/ring-adapter/ring-api-adapter.ts)
- ROOM_LIST_WAIT_MS (bridge/src/connector/access/ring-adapter/ring-api-adapter.ts)
- RING_CONNECTION_GRACE_MS (bridge/src/connector/access/ring-adapter/ring-api-adapter.ts)
- RING_CONNECTION_STUCK_MS (bridge/src/connector/access/ring-adapter/ring-api-adapter.ts)
- RING_RECOVERY_PROBE_MS (bridge/src/connector/access/ring-adapter/ring-api-adapter.ts)
- isDevice (bridge/src/connector/access/ring-adapter/ring-api-adapter.ts)
- RingApiAdapter (bridge/src/connector/access/ring-adapter/ring-api-adapter.ts)
- createRingClient (bridge/src/connector/access/ring-adapter/ring-client.live.ts)
- statusOf (bridge/src/connector/access/ring-adapter/ring-failure.ts)
- unavailableMessage (bridge/src/connector/access/ring-adapter/ring-failure.ts)
- ringFailure (bridge/src/connector/access/ring-adapter/ring-failure.ts)
- sessionLost (bridge/src/connector/access/ring-adapter/ring-failure.ts)
- RING_SESSION_NAME (bridge/src/connector/access/ring-adapter/ring-library.live.ts)
- silenceRingLibrary (bridge/src/connector/access/ring-adapter/ring-library.live.ts)
- answer (bridge/src/connector/access/ring-adapter/ring-login.live.test.ts)
- ringAnswers (bridge/src/connector/access/ring-adapter/ring-login.live.test.ts)
- login (bridge/src/connector/access/ring-adapter/ring-login.live.test.ts)
- openRingLogin (bridge/src/connector/access/ring-adapter/ring-login.live.ts)
- LiveRingLogin (bridge/src/connector/access/ring-adapter/ring-login.live.ts)
- RingLoginError (bridge/src/connector/access/ring-adapter/ring-login.ts)
- deviceTypeOf (bridge/src/connector/access/ring-adapter/ring-mapping.ts)
- alarmModeOf (bridge/src/connector/access/ring-adapter/ring-mapping.ts)
- defined (bridge/src/connector/access/ring-adapter/ring-mapping.ts)
- stateOf (bridge/src/connector/access/ring-adapter/ring-mapping.ts)
- percentOf (bridge/src/connector/access/ring-adapter/ring-mapping.ts)
- powerOf (bridge/src/connector/access/ring-adapter/ring-mapping.ts)
- locationEntry (bridge/src/connector/access/ring-adapter/ring-mapping.ts)
- deviceEntry (bridge/src/connector/access/ring-adapter/ring-mapping.ts)
- cameraEntry (bridge/src/connector/access/ring-adapter/ring-mapping.ts)
- readRoomList (bridge/src/connector/access/ring-adapter/room-lists.ts)
- SecretsFileError (bridge/src/connector/access/secrets-file/secrets-file-error.ts)
- isMissing (bridge/src/connector/access/secrets-file/secrets-file-key.ts)
- encodeSecretsFileKey (bridge/src/connector/access/secrets-file/secrets-file-key.ts)
- readSecretsFileKey (bridge/src/connector/access/secrets-file/secrets-file-key.ts)
- homeSecrets (bridge/src/connector/access/secrets-file/secrets-file.test.ts)
- privateKeyText (bridge/src/connector/access/secrets-file/secrets-file.test.ts)
- secretValues (bridge/src/connector/access/secrets-file/secrets-file.test.ts)
- expectNoSecret (bridge/src/connector/access/secrets-file/secrets-file.test.ts)
- SECRETS_FILE_NAME (bridge/src/connector/access/secrets-file/secrets-file.ts)
- checkKey (bridge/src/connector/access/secrets-file/secrets-file.ts)
- parseJson (bridge/src/connector/access/secrets-file/secrets-file.ts)
- toStored (bridge/src/connector/access/secrets-file/secrets-file.ts)
- fromStored (bridge/src/connector/access/secrets-file/secrets-file.ts)
- encode (bridge/src/connector/access/secrets-file/secrets-file.ts)
- decode (bridge/src/connector/access/secrets-file/secrets-file.ts)
- hasCode (bridge/src/connector/access/secrets-file/secrets-file.ts)
- SecretsFile (bridge/src/connector/access/secrets-file/secrets-file.ts)
- connection (bridge/src/connector/clients/core-link/core-link.test.ts)
- messagesOf (bridge/src/connector/clients/core-link/core-link.test.ts)
- RECONNECT_BACKOFF (bridge/src/connector/clients/core-link/core-link.ts)
- reconnectDelayMs (bridge/src/connector/clients/core-link/core-link.ts)
- CoreLink (bridge/src/connector/clients/core-link/core-link.ts)
- HANDSHAKE_TIMEOUT_MS (bridge/src/connector/clients/core-link/home-session.ts)
- HomeSession (bridge/src/connector/clients/core-link/home-session.ts)
- CORE_MESSAGE_TYPES (bridge/src/connector/clients/core-link/messages/core-messages.ts)
- LINK_CLOSE_REASONS (bridge/src/connector/clients/core-link/messages/core-messages.ts)
- challengeSchema (bridge/src/connector/clients/core-link/messages/core-messages.ts)
- helloOkSchema (bridge/src/connector/clients/core-link/messages/core-messages.ts)
- enrolledSchema (bridge/src/connector/clients/core-link/messages/core-messages.ts)
- inventoryRequestSchema (bridge/src/connector/clients/core-link/messages/core-messages.ts)
- ackSchema (bridge/src/connector/clients/core-link/messages/core-messages.ts)
- readCoreMessage (bridge/src/connector/clients/core-link/messages/core-messages.ts)
- read (bridge/src/connector/clients/core-link/messages/core-messages.ts)
- setup (bridge/src/connector/clients/home-scheduler/home-scheduler.test.ts)
- RESEND_TICK_MS (bridge/src/connector/clients/home-scheduler/home-scheduler.ts)
- HEARTBEAT_INTERVAL_MS (bridge/src/connector/clients/home-scheduler/home-scheduler.ts)
- HomeScheduler (bridge/src/connector/clients/home-scheduler/home-scheduler.ts)
- bytes (bridge/src/connector/clients/setup-cli/enrollment-code.test.ts)
- logged (bridge/src/connector/clients/setup-cli/enrollment-code.test.ts)
- newEnrollmentCode (bridge/src/connector/clients/setup-cli/enrollment-code.ts)
- ScriptedConsole (bridge/src/connector/clients/setup-cli/setup.test.ts)
- FakeLogin (bridge/src/connector/clients/setup-cli/setup.test.ts)
- options (bridge/src/connector/clients/setup-cli/setup.test.ts)
- setup (bridge/src/connector/clients/setup-cli/setup.test.ts)
- expectNoSecretIn (bridge/src/connector/clients/setup-cli/setup.test.ts)
- LOGIN_STEP_TIMEOUT_MS (bridge/src/connector/clients/setup-cli/setup.ts)
- MAX_WRONG_CODES (bridge/src/connector/clients/setup-cli/setup.ts)
- Refusal (bridge/src/connector/clients/setup-cli/setup.ts)
- runSetup (bridge/src/connector/clients/setup-cli/setup.ts)
- terminal (bridge/src/connector/clients/setup-cli/terminal-console.test.ts)
- Echo (bridge/src/connector/clients/setup-cli/terminal-console.ts)
- TerminalConsole (bridge/src/connector/clients/setup-cli/terminal-console.ts)
- deviceEntry (bridge/src/connector/managers/ingest/home-view.ts)
- HomeView (bridge/src/connector/managers/ingest/home-view.ts)
- startIngest (bridge/src/connector/managers/ingest/ingest.test.ts)
- takeAll (bridge/src/connector/managers/ingest/ingest.test.ts)
- inventoryOf (bridge/src/connector/managers/ingest/ingest.test.ts)
- deviceStateOf (bridge/src/connector/managers/ingest/ingest.test.ts)
- versionsOf (bridge/src/connector/managers/ingest/ingest.test.ts)
- standardDevice (bridge/src/connector/managers/ingest/ingest.test.ts)
- openDoor (bridge/src/connector/managers/ingest/ingest.test.ts)
- StaleReads (bridge/src/connector/managers/ingest/ingest.test.ts)
- fail (bridge/src/connector/managers/ingest/ingest.test.ts)
- failingWrites (bridge/src/connector/managers/ingest/ingest.test.ts)
- slowLink (bridge/src/connector/managers/ingest/ingest.test.ts)
- GatedReads (bridge/src/connector/managers/ingest/ingest.test.ts)
- recordedLink (bridge/src/connector/managers/ingest/ingest.test.ts)
- namesOf (bridge/src/connector/managers/ingest/ingest.test.ts)
- addedDevice (bridge/src/connector/managers/ingest/ingest.test.ts)
- idsOf (bridge/src/connector/managers/ingest/ingest.test.ts)
- Ingest (bridge/src/connector/managers/ingest/ingest.ts)
- inventoryDraft (bridge/src/connector/managers/ingest/ingest.ts)
- ringFailure (bridge/src/connector/managers/ingest/ingest.ts)
- replyWith (bridge/src/contract/envelopes.test.ts)
- FRESHNESS (bridge/src/contract/envelopes.ts)
- ERROR_CODES (bridge/src/contract/envelopes.ts)
- OUTCOMES (bridge/src/contract/envelopes.ts)
- staleSinceExactlyWhenStale (bridge/src/contract/envelopes.ts)
- replyEnvelope (bridge/src/contract/envelopes.ts)
- errorEnvelope (bridge/src/contract/envelopes.ts)
- getHealthInput (bridge/src/contract/inquiry-tools.ts)
- healthData (bridge/src/contract/inquiry-tools.ts)
- getOverviewInput (bridge/src/contract/inquiry-tools.ts)
- overviewData (bridge/src/contract/inquiry-tools.ts)
- listDevicesInput (bridge/src/contract/inquiry-tools.ts)
- deviceListData (bridge/src/contract/inquiry-tools.ts)
- getDeviceInput (bridge/src/contract/inquiry-tools.ts)
- deviceData (bridge/src/contract/inquiry-tools.ts)
- getOverviewTool (bridge/src/contract/inquiry-tools.ts)
- listDevicesTool (bridge/src/contract/inquiry-tools.ts)
- getDeviceTool (bridge/src/contract/inquiry-tools.ts)
- getHealthTool (bridge/src/contract/inquiry-tools.ts)
- TOOL_CATALOG (bridge/src/contract/inquiry-tools.ts)
- jsonSchemaOf (bridge/src/contract/json-schema.ts)
- toolDefinitions (bridge/src/contract/json-schema.ts)
- contractDocuments (bridge/src/contract/json-schema.ts)
- DEVICE_TYPES (bridge/src/contract/shapes.ts)
- ALARM_MODES (bridge/src/contract/shapes.ts)
- deviceType (bridge/src/contract/shapes.ts)
- alarmMode (bridge/src/contract/shapes.ts)
- ownership (bridge/src/contract/shapes.ts)
- powerMode (bridge/src/contract/shapes.ts)
- batteryPct (bridge/src/contract/shapes.ts)
- utcTime (bridge/src/contract/shapes.ts)
- localTime (bridge/src/contract/shapes.ts)
- locationId (bridge/src/contract/shapes.ts)
- deviceId (bridge/src/contract/shapes.ts)
- deviceName (bridge/src/contract/shapes.ts)
- roomName (bridge/src/contract/shapes.ts)
- deviceReference (bridge/src/contract/shapes.ts)
- locationSummary (bridge/src/contract/shapes.ts)
- UNTRUSTED_TOOL_SENTENCE (bridge/src/contract/untrusted.ts)
- UNTRUSTED_KEYWORD (bridge/src/contract/untrusted.ts)
- UNTRUSTED_PREFIX (bridge/src/contract/untrusted.ts)
- untrustedMeta (bridge/src/contract/untrusted.ts)
- toolDescription (bridge/src/contract/untrusted.ts)
- ringText (bridge/src/contract/untrusted.ts)
- ringObject (bridge/src/contract/untrusted.ts)
- GrantsStoreError (bridge/src/core/access/grants/grants-store-error.ts)
- HASHED_MODELS (bridge/src/core/access/grants/grants-store.ts)
- GrantsStore (bridge/src/core/access/grants/grants-store.ts)
- storedId (bridge/src/core/access/grants/grants-store.ts)
- withoutJti (bridge/src/core/access/grants/grants-store.ts)
- checkModel (bridge/src/core/access/grants/grants-store.ts)
- checkLength (bridge/src/core/access/grants/grants-store.ts)
- reference (bridge/src/core/access/grants/grants-store.ts)
- payloadOf (bridge/src/core/access/grants/grants-store.ts)
- isRecord (bridge/src/core/access/grants/grants-store.ts)
- unreadableRecord (bridge/src/core/access/grants/grants-store.ts)
- statement (bridge/src/core/access/grants/grants-store.ts)
- LEASE_RENEW_MS (bridge/src/core/access/lease/lease.ts)
- LEASE_EXPIRES_MS (bridge/src/core/access/lease/lease.ts)
- LEASE_HELD_MS (bridge/src/core/access/lease/lease.ts)
- LEASE_WRITE_TIMEOUT_MS (bridge/src/core/access/lease/lease.ts)
- LEASE_TIMING (bridge/src/core/access/lease/lease.ts)
- Lease (bridge/src/core/access/lease/lease.ts)
- checkText (bridge/src/core/access/lease/lease.ts)
- MISSING_SECRET (bridge/src/core/access/secrets/core-secrets.ts)
- createKeyVaultSecretClient (bridge/src/core/access/secrets/key-vault-client.live.ts)
- createOwnerKeyVaultSecretClient (bridge/src/core/access/secrets/key-vault-client.live.ts)
- never (bridge/src/core/access/secrets/key-vault-secrets.test.ts)
- restError (bridge/src/core/access/secrets/key-vault-secrets.test.ts)
- standIn (bridge/src/core/access/secrets/key-vault-secrets.test.ts)
- KeyVaultSecrets (bridge/src/core/access/secrets/key-vault-secrets.ts)
- statusOf (bridge/src/core/access/secrets/key-vault-secrets.ts)
- codeOf (bridge/src/core/access/secrets/key-vault-secrets.ts)
- vaultError (bridge/src/core/access/secrets/key-vault-secrets.ts)
- never (bridge/src/core/access/secrets/sealed-file-secrets.test.ts)
- sealedDocument (bridge/src/core/access/secrets/sealed-file-secrets.test.ts)
- SealedFileSecrets (bridge/src/core/access/secrets/sealed-file-secrets.ts)
- parseStored (bridge/src/core/access/secrets/sealed-file-secrets.ts)
- notKnownForm (bridge/src/core/access/secrets/sealed-file-secrets.ts)
- isMissingFile (bridge/src/core/access/secrets/sealed-file-secrets.ts)
- SecretsError (bridge/src/core/access/secrets/secrets-error.ts)
- SettingsStoreError (bridge/src/core/access/settings/settings-store-error.ts)
- ENROLLMENT_REQUEST_TTL_MS (bridge/src/core/access/settings/settings-store.ts)
- MAX_ENROLLMENT_CODE_LENGTH (bridge/src/core/access/settings/settings-store.ts)
- jsonText (bridge/src/core/access/settings/settings-store.ts)
- SettingsStore (bridge/src/core/access/settings/settings-store.ts)
- checkSeeds (bridge/src/core/access/settings/settings-store.ts)
- checkLength (bridge/src/core/access/settings/settings-store.ts)
- checkTimeZone (bridge/src/core/access/settings/settings-store.ts)
- knownTimeZones (bridge/src/core/access/settings/settings-store.ts)
- checkPercent (bridge/src/core/access/settings/settings-store.ts)
- agentValues (bridge/src/core/access/settings/settings-store.ts)
- agentOf (bridge/src/core/access/settings/settings-store.ts)
- parseRow (bridge/src/core/access/settings/settings-store.ts)
- unreadableRow (bridge/src/core/access/settings/settings-store.ts)
- statement (bridge/src/core/access/settings/settings-store.ts)
- StateStoreError (bridge/src/core/access/state/state-store-error.ts)
- StateStore (bridge/src/core/access/state/state-store.ts)
- fitsLocation (bridge/src/core/access/state/state-store.ts)
- fitsDevice (bridge/src/core/access/state/state-store.ts)
- fitted (bridge/src/core/access/state/state-store.ts)
- locationUpsert (bridge/src/core/access/state/state-store.ts)
- deviceUpsert (bridge/src/core/access/state/state-store.ts)
- inMotion (bridge/src/core/access/state/state-store.ts)
- deviceValues (bridge/src/core/access/state/state-store.ts)
- deviceQuery (bridge/src/core/access/state/state-store.ts)
- healthValues (bridge/src/core/access/state/state-store.ts)
- locationOf (bridge/src/core/access/state/state-store.ts)
- deviceOf (bridge/src/core/access/state/state-store.ts)
- healthOf (bridge/src/core/access/state/state-store.ts)
- present (bridge/src/core/access/state/state-store.ts)
- stateOf (bridge/src/core/access/state/state-store.ts)
- idOf (bridge/src/core/access/state/state-store.ts)
- parseRow (bridge/src/core/access/state/state-store.ts)
- unreadableRow (bridge/src/core/access/state/state-store.ts)
- statement (bridge/src/core/access/state/state-store.ts)
- connect (bridge/src/core/clients/connector-link/connector-link.test.ts)
- messagesOf (bridge/src/core/clients/connector-link/connector-link.test.ts)
- send (bridge/src/core/clients/connector-link/connector-link.test.ts)
- hello (bridge/src/core/clients/connector-link/connector-link.test.ts)
- inventory (bridge/src/core/clients/connector-link/connector-link.test.ts)
- deviceEntry (bridge/src/core/clients/connector-link/connector-link.test.ts)
- heartbeat (bridge/src/core/clients/connector-link/connector-link.test.ts)
- HeldAdmin (bridge/src/core/clients/connector-link/connector-link.test.ts)
- LateAnswerAdmin (bridge/src/core/clients/connector-link/connector-link.test.ts)
- MAX_UNPROVEN_LINKS (bridge/src/core/clients/connector-link/connector-link.ts)
- ConnectorLink (bridge/src/core/clients/connector-link/connector-link.ts)
- CORE_HANDSHAKE_TIMEOUT_MS (bridge/src/core/clients/connector-link/core-session.ts)
- ENROLLMENT_POLL_MS (bridge/src/core/clients/connector-link/core-session.ts)
- KEY_RECHECK_MS (bridge/src/core/clients/connector-link/core-session.ts)
- MAX_PENDING_MESSAGES (bridge/src/core/clients/connector-link/core-session.ts)
- CORE_CLOSE_REASONS (bridge/src/core/clients/connector-link/core-session.ts)
- CoreSession (bridge/src/core/clients/connector-link/core-session.ts)
- closeReasonFor (bridge/src/core/clients/connector-link/core-session.ts)
- incomingInventory (bridge/src/core/clients/connector-link/intake-mapping.ts)
- incomingDeviceState (bridge/src/core/clients/connector-link/intake-mapping.ts)
- incomingHeartbeat (bridge/src/core/clients/connector-link/intake-mapping.ts)
- incomingLocation (bridge/src/core/clients/connector-link/intake-mapping.ts)
- incomingDevice (bridge/src/core/clients/connector-link/intake-mapping.ts)
- HOME_MESSAGE_TYPES (bridge/src/core/clients/connector-link/messages/home-messages.ts)
- MAX_ENROLLMENT_CODE_LENGTH (bridge/src/core/clients/connector-link/messages/home-messages.ts)
- helloSchema (bridge/src/core/clients/connector-link/messages/home-messages.ts)
- challengeResponseSchema (bridge/src/core/clients/connector-link/messages/home-messages.ts)
- enrollSchema (bridge/src/core/clients/connector-link/messages/home-messages.ts)
- inventoryLocationSchema (bridge/src/core/clients/connector-link/messages/home-messages.ts)
- deviceEntrySchema (bridge/src/core/clients/connector-link/messages/home-messages.ts)
- inventorySchema (bridge/src/core/clients/connector-link/messages/home-messages.ts)
- deviceStateSchema (bridge/src/core/clients/connector-link/messages/home-messages.ts)
- heartbeatSchema (bridge/src/core/clients/connector-link/messages/home-messages.ts)
- readHomeMessage (bridge/src/core/clients/connector-link/messages/home-messages.ts)
- read (bridge/src/core/clients/connector-link/messages/home-messages.ts)
- held (bridge/src/core/clients/issuer/bounded-fetch.test.ts)
- streaming (bridge/src/core/clients/issuer/bounded-fetch.test.ts)
- FETCH_LIMITS (bridge/src/core/clients/issuer/bounded-fetch.ts)
- ISSUER_FETCHES_IN_FLIGHT (bridge/src/core/clients/issuer/bounded-fetch.ts)
- boundedFetch (bridge/src/core/clients/issuer/bounded-fetch.ts)
- once (bridge/src/core/clients/issuer/bounded-fetch.ts)
- heldUntilRead (bridge/src/core/clients/issuer/bounded-fetch.ts)
- never (bridge/src/core/clients/issuer/first-signing-key.test.ts)
- MemorySecrets (bridge/src/core/clients/issuer/first-signing-key.test.ts)
- writeFirstSigningKey (bridge/src/core/clients/issuer/first-signing-key.ts)
- never (bridge/src/core/clients/issuer/grants-adapter.test.ts)
- UNUSED_REGISTRATION_TTL_S (bridge/src/core/clients/issuer/grants-adapter.ts)
- keepRegisteredClient (bridge/src/core/clients/issuer/grants-adapter.ts)
- RegistrationsLimited (bridge/src/core/clients/issuer/grants-adapter.ts)
- adapterFor (bridge/src/core/clients/issuer/grants-adapter.ts)
- GrantsAdapter (bridge/src/core/clients/issuer/grants-adapter.ts)
- RegisteredClients (bridge/src/core/clients/issuer/grants-adapter.ts)
- IssuerError (bridge/src/core/clients/issuer/issuer-error.ts)
- SWEEP_INTERVAL_MS (bridge/src/core/clients/issuer/issuer.ts)
- Issuer (bridge/src/core/clients/issuer/issuer.ts)
- platformCode (bridge/src/core/clients/issuer/issuer.ts)
- isOnlyFor (bridge/src/core/clients/issuer/issuer.ts)
- isStoreDown (bridge/src/core/clients/issuer/issuer.ts)
- sameBrowser (bridge/src/core/clients/issuer/issuer.ts)
- sha256 (bridge/src/core/clients/issuer/issuer.ts)
- isProviderError (bridge/src/core/clients/issuer/issuer.ts)
- answer (bridge/src/core/clients/issuer/issuer.ts)
- ListedAgents (bridge/src/core/clients/issuer/listed-agents.ts)
- grantableScopes (bridge/src/core/clients/issuer/listed-agents.ts)
- isRevoked (bridge/src/core/clients/issuer/listed-agents.ts)
- covers (bridge/src/core/clients/issuer/listed-agents.ts)
- isLoopbackRedirect (bridge/src/core/clients/issuer/listed-agents.ts)
- sameRedirect (bridge/src/core/clients/issuer/listed-agents.ts)
- withoutPort (bridge/src/core/clients/issuer/listed-agents.ts)
- linkFor (bridge/src/core/clients/issuer/pending-sign-ins.test.ts)
- PendingSignIns (bridge/src/core/clients/issuer/pending-sign-ins.ts)
- ACCESS_TOKEN_TTL_S (bridge/src/core/clients/issuer/provider-configuration.ts)
- REFRESH_IDLE_TTL_S (bridge/src/core/clients/issuer/provider-configuration.ts)
- REFRESH_ABSOLUTE_TTL_S (bridge/src/core/clients/issuer/provider-configuration.ts)
- providerConfiguration (bridge/src/core/clients/issuer/provider-configuration.ts)
- refreshTokenLifetime (bridge/src/core/clients/issuer/provider-configuration.ts)
- ownerAccount (bridge/src/core/clients/issuer/provider-configuration.ts)
- RegistrationLimit (bridge/src/core/clients/issuer/registration-limit.ts)
- parseSigningKeys (bridge/src/core/clients/issuer/signing-keys.ts)
- generateSigningKey (bridge/src/core/clients/issuer/signing-keys.ts)
- signingKeyDocument (bridge/src/core/clients/issuer/signing-keys.ts)
- cookieKeyFor (bridge/src/core/clients/issuer/signing-keys.ts)
- unreadable (bridge/src/core/clients/issuer/signing-keys.ts)
- listedOnly (bridge/src/core/clients/mcp-endpoint/listed-input.ts)
- READ_SCOPE (bridge/src/core/clients/mcp-endpoint/mcp-endpoint.ts)
- TOKEN_CHECK_RETRY_AFTER_S (bridge/src/core/clients/mcp-endpoint/mcp-endpoint.ts)
- TOKEN_CHECK_TIMEOUT_MS (bridge/src/core/clients/mcp-endpoint/mcp-endpoint.ts)
- TokensUnavailable (bridge/src/core/clients/mcp-endpoint/mcp-endpoint.ts)
- rejectedOnAbort (bridge/src/core/clients/mcp-endpoint/mcp-endpoint.ts)
- McpEndpoint (bridge/src/core/clients/mcp-endpoint/mcp-endpoint.ts)
- ReadLimit (bridge/src/core/clients/mcp-endpoint/read-limit.ts)
- TOOL_DEADLINE_MS (bridge/src/core/clients/mcp-endpoint/read-tools.ts)
- UNAVAILABLE_RETRY_AFTER_S (bridge/src/core/clients/mcp-endpoint/read-tools.ts)
- LOCAL_CLIENT (bridge/src/core/clients/mcp-endpoint/read-tools.ts)
- readTool (bridge/src/core/clients/mcp-endpoint/read-tools.ts)
- present (bridge/src/core/clients/mcp-endpoint/read-tools.ts)
- asOf (bridge/src/core/clients/mcp-endpoint/read-tools.ts)
- overviewSummary (bridge/src/core/clients/mcp-endpoint/read-tools.ts)
- READ_TOOLS (bridge/src/core/clients/mcp-endpoint/read-tools.ts)
- DeadlinePassed (bridge/src/core/clients/mcp-endpoint/read-tools.ts)
- registerReadTools (bridge/src/core/clients/mcp-endpoint/read-tools.ts)
- textContent (bridge/src/core/clients/mcp-endpoint/read-tools.ts)
- withinDeadline (bridge/src/core/clients/mcp-endpoint/read-tools.ts)
- failureOf (bridge/src/core/clients/mcp-endpoint/read-tools.ts)
- invalidInput (bridge/src/core/clients/mcp-endpoint/read-tools.ts)
- rateLimited (bridge/src/core/clients/mcp-endpoint/read-tools.ts)
- timedOut (bridge/src/core/clients/mcp-endpoint/read-tools.ts)
- internal (bridge/src/core/clients/mcp-endpoint/read-tools.ts)
- errorResult (bridge/src/core/clients/mcp-endpoint/read-tools.ts)
- AdminSignIns (bridge/src/core/clients/web/admin-sign-ins.ts)
- luminance (bridge/src/core/clients/web/contrast.test.ts)
- ratio (bridge/src/core/clients/web/contrast.test.ts)
- readCookie (bridge/src/core/clients/web/cookies.ts)
- setCookie (bridge/src/core/clients/web/cookies.ts)
- clearCookie (bridge/src/core/clients/web/cookies.ts)
- sha256 (bridge/src/core/clients/web/cookies.ts)
- sameText (bridge/src/core/clients/web/cookies.ts)
- health (bridge/src/core/clients/web/health-panel.test.ts)
- UNREADABLE_PANEL (bridge/src/core/clients/web/health-panel.ts)
- healthPanel (bridge/src/core/clients/web/health-panel.ts)
- banners (bridge/src/core/clients/web/health-panel.ts)
- connectorRow (bridge/src/core/clients/web/health-panel.ts)
- connectorBehind (bridge/src/core/clients/web/health-panel.ts)
- timeIn (bridge/src/core/clients/web/health-panel.ts)
- SESSION_IDLE_MS (bridge/src/core/clients/web/owner-sessions.ts)
- SESSION_MAX_MS (bridge/src/core/clients/web/owner-sessions.ts)
- OwnerSessions (bridge/src/core/clients/web/owner-sessions.ts)
- ended (bridge/src/core/clients/web/owner-sessions.ts)
- randomText (bridge/src/core/clients/web/owner-sessions.ts)
- HEALTH_POLL_MS (bridge/src/core/clients/web/page-script.ts)
- pageScript (bridge/src/core/clients/web/page-script.ts)
- poll (bridge/src/core/clients/web/page-script.ts)
- CONFIRMATION_MAX_LENGTH (bridge/src/core/clients/web/pages.ts)
- signInPage (bridge/src/core/clients/web/pages.ts)
- adminPage (bridge/src/core/clients/web/pages.ts)
- healthSection (bridge/src/core/clients/web/pages.ts)
- signedOutHealth (bridge/src/core/clients/web/pages.ts)
- refusedPage (bridge/src/core/clients/web/pages.ts)
- frame (bridge/src/core/clients/web/pages.ts)
- navigation (bridge/src/core/clients/web/pages.ts)
- enrollSection (bridge/src/core/clients/web/pages.ts)
- enrollBody (bridge/src/core/clients/web/pages.ts)
- approveForm (bridge/src/core/clients/web/pages.ts)
- signInAgain (bridge/src/core/clients/web/pages.ts)
- timeZoneSection (bridge/src/core/clients/web/pages.ts)
- timeZoneBody (bridge/src/core/clients/web/pages.ts)
- zoneInUse (bridge/src/core/clients/web/pages.ts)
- timeZoneForm (bridge/src/core/clients/web/pages.ts)
- notice (bridge/src/core/clients/web/pages.ts)
- message (bridge/src/core/clients/web/pages.ts)
- banner (bridge/src/core/clients/web/pages.ts)
- row (bridge/src/core/clients/web/pages.ts)
- THEME_TOKENS (bridge/src/core/clients/web/styles.ts)
- variables (bridge/src/core/clients/web/styles.ts)
- STYLESHEET (bridge/src/core/clients/web/styles.ts)
- ownerHealth (bridge/src/core/clients/web/web.test.ts)
- setUp (bridge/src/core/clients/web/web.test.ts)
- get (bridge/src/core/clients/web/web.test.ts)
- post (bridge/src/core/clients/web/web.test.ts)
- cookieFrom (bridge/src/core/clients/web/web.test.ts)
- valueOf (bridge/src/core/clients/web/web.test.ts)
- formToken (bridge/src/core/clients/web/web.test.ts)
- noticeOn (bridge/src/core/clients/web/web.test.ts)
- waiting (bridge/src/core/clients/web/web.test.ts)
- zoneSection (bridge/src/core/clients/web/web.test.ts)
- selected (bridge/src/core/clients/web/web.test.ts)
- ADMIN_PATH (bridge/src/core/clients/web/web.ts)
- SIGN_IN_RETURN_PATH (bridge/src/core/clients/web/web.ts)
- ADMIN_PATHS (bridge/src/core/clients/web/web.ts)
- FRESH_SIGN_IN_MS (bridge/src/core/clients/web/web.ts)
- Web (bridge/src/core/clients/web/web.ts)
- timeZonePanel (bridge/src/core/clients/web/web.ts)
- themeOf (bridge/src/core/clients/web/web.ts)
- toSignInPage (bridge/src/core/clients/web/web.ts)
- signInProblem (bridge/src/core/clients/web/web.ts)
- comparable (bridge/src/core/clients/web/web.ts)
- isTimeout (bridge/src/core/clients/web/web.ts)
- refreshed (bridge/src/core/engines/health/health-engine.test.ts)
- afterSessionOpened (bridge/src/core/engines/health/health-engine.ts)
- afterRefresh (bridge/src/core/engines/health/health-engine.ts)
- afterHeartbeat (bridge/src/core/engines/health/health-engine.ts)
- asOf (bridge/src/core/engines/health/health-engine.ts)
- settled (bridge/src/core/engines/health/health-engine.ts)
- healthChanges (bridge/src/core/engines/health/health-engine.ts)
- isSilent (bridge/src/core/engines/health/health-engine.ts)
- staleSince (bridge/src/core/engines/health/health-engine.ts)
- knownTrueUntil (bridge/src/core/engines/health/health-engine.ts)
- homeUp (bridge/src/core/engines/health/health-engine.ts)
- device (bridge/src/core/engines/summary/summary-engine.test.ts)
- TOKEN_BUDGET (bridge/src/core/engines/summary/summary-engine.ts)
- ENVELOPE_RESERVE_TOKENS (bridge/src/core/engines/summary/summary-engine.ts)
- DATA_BUDGET_TOKENS (bridge/src/core/engines/summary/summary-engine.ts)
- estimateTokens (bridge/src/core/engines/summary/summary-engine.ts)
- healthData (bridge/src/core/engines/summary/summary-engine.ts)
- overview (bridge/src/core/engines/summary/summary-engine.ts)
- deviceList (bridge/src/core/engines/summary/summary-engine.ts)
- deviceDetail (bridge/src/core/engines/summary/summary-engine.ts)
- within (bridge/src/core/engines/summary/summary-engine.ts)
- longestList (bridge/src/core/engines/summary/summary-engine.ts)
- isLow (bridge/src/core/engines/summary/summary-engine.ts)
- reference (bridge/src/core/engines/summary/summary-engine.ts)
- listedDevice (bridge/src/core/engines/summary/summary-engine.ts)
- statusReadAt (bridge/src/core/engines/summary/summary-engine.ts)
- AdminError (bridge/src/core/managers/admin/admin-error.ts)
- never (bridge/src/core/managers/admin/admin-manager.test.ts)
- AdminManager (bridge/src/core/managers/admin/admin-manager.ts)
- EventError (bridge/src/core/managers/event/event-error.ts)
- inventory (bridge/src/core/managers/event/event-manager.test.ts)
- beat (bridge/src/core/managers/event/event-manager.test.ts)
- failingOnce (bridge/src/core/managers/event/event-manager.test.ts)
- EventManager (bridge/src/core/managers/event/event-manager.ts)
- InquiryError (bridge/src/core/managers/inquiry/inquiry-error.ts)
- device (bridge/src/core/managers/inquiry/inquiry-manager.test.ts)
- failing (bridge/src/core/managers/inquiry/inquiry-manager.test.ts)
- comingBack (bridge/src/core/managers/inquiry/inquiry-manager.test.ts)
- InquiryManager (bridge/src/core/managers/inquiry/inquiry-manager.ts)
- isOwned (bridge/src/core/managers/inquiry/inquiry-manager.ts)
- zoneOf (bridge/src/core/managers/inquiry/inquiry-manager.ts)
- reply (bridge/src/core/managers/inquiry/inquiry-manager.ts)
- CORE_DATABASE_FILE (bridge/src/host/all-in-one.ts)
- LOCAL_LEASE_TIMING (bridge/src/host/all-in-one.ts)
- startAllInOne (bridge/src/host/all-in-one.ts)
- HomePart (bridge/src/host/all-in-one.ts)
- never (bridge/src/host/all-in-one.ts)
- inProcessDial (bridge/src/host/all-in-one.ts)
- record (bridge/src/host/connector-health.test.ts)
- writer (bridge/src/host/connector-health.test.ts)
- HEALTH_FILE_NAME (bridge/src/host/connector-health.ts)
- HEALTH_WRITE_INTERVAL_MS (bridge/src/host/connector-health.ts)
- HEALTH_FILE_MAX_AGE_MS (bridge/src/host/connector-health.ts)
- LINK_DOWN_UNHEALTHY_MS (bridge/src/host/connector-health.ts)
- judgeHealth (bridge/src/host/connector-health.ts)
- unhealthy (bridge/src/host/connector-health.ts)
- readHealthRecord (bridge/src/host/connector-health.ts)
- runHealthCommand (bridge/src/host/connector-health.ts)
- HealthWriter (bridge/src/host/connector-health.ts)
- startConnector (bridge/src/host/connector.ts)
- startRingConnector (bridge/src/host/connector.ts)
- LEASE_NAME (bridge/src/host/core-assembly.ts)
- assembleCore (bridge/src/host/core-assembly.ts)
- ISSUER_PATH (bridge/src/host/core-service.ts)
- MCP_PATH (bridge/src/host/core-service.ts)
- LINK_PATH (bridge/src/host/core-service.ts)
- AUTHORIZATION_SERVER_METADATA_PATH (bridge/src/host/core-service.ts)
- SIGNING_KEYS_RETRY_MS (bridge/src/host/core-service.ts)
- startCoreService (bridge/src/host/core-service.ts)
- SigningKeysStart (bridge/src/host/core-service.ts)
- answer (bridge/src/host/core-service.ts)
- entraIssuer (bridge/src/host/core.ts)
- startCore (bridge/src/host/core.ts)
- runFirstSigningKeyCommand (bridge/src/host/first-signing-key.ts)
- vaultUrlOf (bridge/src/host/first-signing-key.ts)
- assembleHome (bridge/src/host/home-assembly.ts)
- openHomeSecrets (bridge/src/host/home-files.ts)
- openHomeOutbox (bridge/src/host/home-files.ts)
- HostError (bridge/src/host/host-error.ts)
- LEASE_CHECK_MS (bridge/src/host/leased-links.ts)
- LeasedLinks (bridge/src/host/leased-links.ts)
- leasedIntake (bridge/src/host/leased-links.ts)
- stop (bridge/src/host/main.ts)
- fatal (bridge/src/host/main.ts)
- openRingHome (bridge/src/host/ring-home.live.ts)
- runSetupCommand (bridge/src/host/setup.ts)
- BRIDGE_VERSION (bridge/src/host/version.ts)
- Provider (bridge/src/types/oidc-provider.d.ts)
- OIDCProviderError (bridge/src/types/oidc-provider.d.ts)
- OIDCProviderBaseError (bridge/src/types/oidc-provider.d.ts)
- errors (bridge/src/types/oidc-provider.d.ts)
- ClockError (bridge/src/utilities/clock/clock-error.ts)
- sleepOn (bridge/src/utilities/clock/clock.ts)
- SystemClock (bridge/src/utilities/clock/clock.ts)
- settle (bridge/src/utilities/clock/fake-clock.ts)
- FakeClock (bridge/src/utilities/clock/fake-clock.ts)
- formatterFor (bridge/src/utilities/clock/time-format.ts)
- offsetFrom (bridge/src/utilities/clock/time-format.ts)
- millisecondsOf (bridge/src/utilities/clock/time-format.ts)
- isValidTimeZone (bridge/src/utilities/clock/time-format.ts)
- formatUtc (bridge/src/utilities/clock/time-format.ts)
- formatInTimeZone (bridge/src/utilities/clock/time-format.ts)
- ConfigError (bridge/src/utilities/config/config-error.ts)
- CORE_HOST_VARIABLES (bridge/src/utilities/config/mode-settings.ts)
- HOME_VARIABLES (bridge/src/utilities/config/mode-settings.ts)
- LOCAL_VARIABLES (bridge/src/utilities/config/mode-settings.ts)
- SETUP_VARIABLES (bridge/src/utilities/config/mode-settings.ts)
- urlWith (bridge/src/utilities/config/mode-settings.ts)
- CORE_HOST_SCHEMA (bridge/src/utilities/config/mode-settings.ts)
- HOME_SCHEMA (bridge/src/utilities/config/mode-settings.ts)
- SETUP_SCHEMA (bridge/src/utilities/config/mode-settings.ts)
- LOCAL_SCHEMA (bridge/src/utilities/config/mode-settings.ts)
- readSection (bridge/src/utilities/config/section.ts)
- configErrorFrom (bridge/src/utilities/config/settings.test.ts)
- SETTING_VARIABLES (bridge/src/utilities/config/settings.ts)
- wholeNumber (bridge/src/utilities/config/settings.ts)
- modeSection (bridge/src/utilities/config/settings.ts)
- mapSection (bridge/src/utilities/config/settings.ts)
- loadSettings (bridge/src/utilities/config/settings.ts)
- loadSetupSettings (bridge/src/utilities/config/settings.ts)
- deepFreeze (bridge/src/utilities/config/settings.ts)
- DIAL_TIMEOUT_MS (bridge/src/utilities/link-transport/dial-link.ts)
- dialLink (bridge/src/utilities/link-transport/dial-link.ts)
- isAllowedTarget (bridge/src/utilities/link-transport/dial-link.ts)
- CLOSE_CODES (bridge/src/utilities/link-transport/link-connection.ts)
- LinkEndpoint (bridge/src/utilities/link-transport/link-connection.ts)
- text (bridge/src/utilities/link-transport/link-frame.test.ts)
- binary (bridge/src/utilities/link-transport/link-frame.test.ts)
- LINK_PROTOCOL_VERSION (bridge/src/utilities/link-transport/link-frame.ts)
- isAcceptedLinkVersion (bridge/src/utilities/link-transport/link-frame.ts)
- MAX_FRAME_BYTES (bridge/src/utilities/link-transport/link-frame.ts)
- encodeMessage (bridge/src/utilities/link-transport/link-frame.ts)
- encodeChunk (bridge/src/utilities/link-transport/link-frame.ts)
- decodeFrame (bridge/src/utilities/link-transport/link-frame.ts)
- decodeMessage (bridge/src/utilities/link-transport/link-frame.ts)
- decodeChunk (bridge/src/utilities/link-transport/link-frame.ts)
- parseJson (bridge/src/utilities/link-transport/link-frame.ts)
- assertTypeName (bridge/src/utilities/link-transport/link-frame.ts)
- assertFrameSize (bridge/src/utilities/link-transport/link-frame.ts)
- logger (bridge/src/utilities/link-transport/link-pair.test.ts)
- received (bridge/src/utilities/link-transport/link-pair.test.ts)
- closings (bridge/src/utilities/link-transport/link-pair.test.ts)
- endpoint (bridge/src/utilities/link-transport/link-pair.test.ts)
- createLinkPair (bridge/src/utilities/link-transport/link-pair.ts)
- wireTo (bridge/src/utilities/link-transport/link-pair.ts)
- inOrder (bridge/src/utilities/link-transport/link-pair.ts)
- LinkServer (bridge/src/utilities/link-transport/link-server.ts)
- LinkSlot (bridge/src/utilities/link-transport/link-slot.ts)
- frame (bridge/src/utilities/link-transport/send-queue.test.ts)
- setup (bridge/src/utilities/link-transport/send-queue.test.ts)
- finishNext (bridge/src/utilities/link-transport/send-queue.test.ts)
- SendQueue (bridge/src/utilities/link-transport/send-queue.ts)
- quietLogger (bridge/src/utilities/link-transport/socket-link.test.ts)
- firstOf (bridge/src/utilities/link-transport/socket-link.test.ts)
- framesOf (bridge/src/utilities/link-transport/socket-link.test.ts)
- PING_INTERVAL_MS (bridge/src/utilities/link-transport/socket-link.ts)
- SILENCE_LIMIT_MS (bridge/src/utilities/link-transport/socket-link.ts)
- linkOverSocket (bridge/src/utilities/link-transport/socket-link.ts)
- writeTo (bridge/src/utilities/link-transport/socket-link.ts)
- watchLiveness (bridge/src/utilities/link-transport/socket-link.ts)
- isFrameViolation (bridge/src/utilities/link-transport/socket-link.ts)
- closedBy (bridge/src/utilities/link-transport/socket-link.ts)
- bytesOf (bridge/src/utilities/link-transport/socket-link.ts)
- readDeclaredFields (bridge/src/utilities/logging/format-line.ts)
- formatLine (bridge/src/utilities/logging/format-line.ts)
- LOG_FIELD_KINDS (bridge/src/utilities/logging/log-fields.ts)
- captureLogger (bridge/src/utilities/logging/logger.test.ts)
- Logger (bridge/src/utilities/logging/logger.ts)
- patternBytes (bridge/src/utilities/logging/redaction-paths.test.ts)
- base64UrlJson (bridge/src/utilities/logging/redaction-paths.test.ts)
- windowsOf (bridge/src/utilities/logging/redaction-paths.test.ts)
- asFields (bridge/src/utilities/logging/redaction-paths.test.ts)
- captureLogger (bridge/src/utilities/logging/redaction-paths.test.ts)
- REDACTED (bridge/src/utilities/logging/redaction.ts)
- toIdentifier (bridge/src/utilities/logging/redaction.ts)
- toCode (bridge/src/utilities/logging/redaction.ts)
- toMeasure (bridge/src/utilities/logging/redaction.ts)
- toErrorName (bridge/src/utilities/logging/redaction.ts)
- countCharacterClasses (bridge/src/utilities/logging/redaction.ts)
- redactLongRun (bridge/src/utilities/logging/redaction.ts)
- applyRule (bridge/src/utilities/logging/redaction.ts)
- redactText (bridge/src/utilities/logging/redaction.ts)
- serializeKind (bridge/src/utilities/logging/serialize-error.ts)
- serializeCode (bridge/src/utilities/logging/serialize-error.ts)
- serializeStack (bridge/src/utilities/logging/serialize-error.ts)
- serializeCause (bridge/src/utilities/logging/serialize-error.ts)
- messageOf (bridge/src/utilities/logging/serialize-error.ts)
- fromError (bridge/src/utilities/logging/serialize-error.ts)
- fromNonError (bridge/src/utilities/logging/serialize-error.ts)
- serializeError (bridge/src/utilities/logging/serialize-error.ts)
- ignoreStreamError (bridge/src/utilities/logging/stdout-sink.ts)
- createStdoutSink (bridge/src/utilities/logging/stdout-sink.ts)
- waitTicks (bridge/src/utilities/pub-sub/pub-sub.test.ts)
- PubSub (bridge/src/utilities/pub-sub/pub-sub.ts)
- ITERATION_001_SCHEMA (bridge/src/utilities/query-layer/migrations/0001-iteration-001-schema.ts)
- CONNECTOR_ENROLLMENT_CODE (bridge/src/utilities/query-layer/migrations/0002-connector-enrollment-code.ts)
- ONE_PENDING_ENROLLMENT (bridge/src/utilities/query-layer/migrations/0003-one-pending-enrollment.ts)
- STATE_SOURCE (bridge/src/utilities/query-layer/migrations/0004-state-source.ts)
- SNAPSHOT_ORDER (bridge/src/utilities/query-layer/migrations/0005-snapshot-order.ts)
- MOTION_SINCE (bridge/src/utilities/query-layer/migrations/0006-motion-since.ts)
- CORE_MIGRATIONS (bridge/src/utilities/query-layer/migrations/core-migrations.ts)
- checkMigrations (bridge/src/utilities/query-layer/migrations/migration.ts)
- statementsFor (bridge/src/utilities/query-layer/migrations/migration.ts)
- refused (bridge/src/utilities/query-layer/migrations/migration.ts)
- coreStatements (bridge/src/utilities/query-layer/migrations/migrations.test.ts)
- oneLine (bridge/src/utilities/query-layer/migrations/migrations.test.ts)
- additiveProblem (bridge/src/utilities/query-layer/migrations/migrations.test.ts)
- shapeOf (bridge/src/utilities/query-layer/migrations/migrations.test.ts)
- columnsOf (bridge/src/utilities/query-layer/migrations/migrations.test.ts)
- migration (bridge/src/utilities/query-layer/migrations/migrations.test.ts)
- MIGRATION_LOCK_WAIT_MS (bridge/src/utilities/query-layer/migrations/run-migrations.ts)
- runMigrations (bridge/src/utilities/query-layer/migrations/run-migrations.ts)
- checkRecordedNames (bridge/src/utilities/query-layer/migrations/run-migrations.ts)
- statement (bridge/src/utilities/query-layer/migrations/run-migrations.ts)
- checkStatement (bridge/src/utilities/query-layer/parameters.ts)
- placeholderNames (bridge/src/utilities/query-layer/parameters.ts)
- scanSql (bridge/src/utilities/query-layer/parameters.ts)
- readPlaceholder (bridge/src/utilities/query-layer/parameters.ts)
- isComment (bridge/src/utilities/query-layer/parameters.ts)
- skipQuotedOrComment (bridge/src/utilities/query-layer/parameters.ts)
- skipQuoted (bridge/src/utilities/query-layer/parameters.ts)
- readName (bridge/src/utilities/query-layer/parameters.ts)
- refused (bridge/src/utilities/query-layer/parameters.ts)
- QueryLayerError (bridge/src/utilities/query-layer/query-layer-error.ts)
- FakeFailure (bridge/src/utilities/query-layer/query-layer.test.ts)
- failure (bridge/src/utilities/query-layer/query-layer.test.ts)
- FakeDriver (bridge/src/utilities/query-layer/query-layer.test.ts)
- setUp (bridge/src/utilities/query-layer/query-layer.test.ts)
- statement (bridge/src/utilities/query-layer/query-layer.test.ts)
- never (bridge/src/utilities/query-layer/query-layer.test.ts)
- gate (bridge/src/utilities/query-layer/query-layer.test.ts)
- rejection (bridge/src/utilities/query-layer/query-layer.test.ts)
- RETRY_PAUSE_MS (bridge/src/utilities/query-layer/query-layer.ts)
- QueryLayer (bridge/src/utilities/query-layer/query-layer.ts)
- TransactionSession (bridge/src/utilities/query-layer/query-layer.ts)
- failedAttempt (bridge/src/utilities/query-layer/query-layer.ts)
- layerError (bridge/src/utilities/query-layer/query-layer.ts)
- never (bridge/src/utilities/query-layer/serial-queue.test.ts)
- gate (bridge/src/utilities/query-layer/serial-queue.test.ts)
- SerialQueue (bridge/src/utilities/query-layer/serial-queue.ts)
- failureError (bridge/src/utilities/query-layer/sql-driver.ts)
- isPassing (bridge/src/utilities/query-layer/sql-driver.ts)
- sqliteError (bridge/src/utilities/query-layer/sqlite.test.ts)
- openSqliteQueryLayer (bridge/src/utilities/query-layer/sqlite.ts)
- classifySqliteError (bridge/src/utilities/query-layer/sqlite.ts)
- sqliteErrcode (bridge/src/utilities/query-layer/sqlite.ts)
- SqliteDriver (bridge/src/utilities/query-layer/sqlite.ts)
- settle (bridge/src/utilities/query-layer/sqlite.ts)
- plainRow (bridge/src/utilities/query-layer/sqlite.ts)
- withoutGuard (bridge/src/utilities/query-layer/statements.test.ts)
- upsertStatement (bridge/src/utilities/query-layer/statements.ts)
- keysetPageStatement (bridge/src/utilities/query-layer/statements.ts)
- sqliteUpsert (bridge/src/utilities/query-layer/statements.ts)
- tsqlUpsert (bridge/src/utilities/query-layer/statements.ts)
- checkUpsert (bridge/src/utilities/query-layer/statements.ts)
- checkPage (bridge/src/utilities/query-layer/statements.ts)
- checkIdentifier (bridge/src/utilities/query-layer/statements.ts)
- quoter (bridge/src/utilities/query-layer/statements.ts)
- refused (bridge/src/utilities/query-layer/statements.ts)
- managedIdentityTsqlConfig (bridge/src/utilities/query-layer/tsql-managed-identity.live.ts)
- requestError (bridge/src/utilities/query-layer/tsql.test.ts)
- wrappedRequestError (bridge/src/utilities/query-layer/tsql.test.ts)
- createTsqlQueryLayer (bridge/src/utilities/query-layer/tsql.ts)
- classifyTsqlError (bridge/src/utilities/query-layer/tsql.ts)
- bindParameter (bridge/src/utilities/query-layer/tsql.ts)
- normalizeTsqlRow (bridge/src/utilities/query-layer/tsql.ts)
- normalizeValue (bridge/src/utilities/query-layer/tsql.ts)
- safeInteger (bridge/src/utilities/query-layer/tsql.ts)
- numberType (bridge/src/utilities/query-layer/tsql.ts)
- numberClass (bridge/src/utilities/query-layer/tsql.ts)
- codeClass (bridge/src/utilities/query-layer/tsql.ts)
- errorFields (bridge/src/utilities/query-layer/tsql.ts)
- ownFields (bridge/src/utilities/query-layer/tsql.ts)
- property (bridge/src/utilities/query-layer/tsql.ts)
- TsqlDriver (bridge/src/utilities/query-layer/tsql.ts)
- ignorePoolError (bridge/src/utilities/query-layer/tsql.ts)
- TsqlTransaction (bridge/src/utilities/query-layer/tsql.ts)
- untilAborted (bridge/src/utilities/query-layer/until-aborted.ts)
- moveOverWithRename (bridge/src/utilities/security/atomic-write.ts)
- replaceAtomically (bridge/src/utilities/security/atomic-write.ts)
- createAtomically (bridge/src/utilities/security/atomic-write.ts)
- HTTP_OK (bridge/src/utilities/security/entra-discovery.ts)
- isSafeEndpoint (bridge/src/utilities/security/entra-discovery.ts)
- readJson (bridge/src/utilities/security/entra-discovery.ts)
- unavailable (bridge/src/utilities/security/entra-discovery.ts)
- endpointUrl (bridge/src/utilities/security/entra-discovery.ts)
- discoverIssuer (bridge/src/utilities/security/entra-discovery.ts)
- json (bridge/src/utilities/security/entra-sign-in.test.ts)
- FakeEntra (bridge/src/utilities/security/entra-sign-in.test.ts)
- rig (bridge/src/utilities/security/entra-sign-in.test.ts)
- rigFor (bridge/src/utilities/security/entra-sign-in.test.ts)
- randomText (bridge/src/utilities/security/entra-sign-in.ts)
- challengeFor (bridge/src/utilities/security/entra-sign-in.ts)
- sameText (bridge/src/utilities/security/entra-sign-in.ts)
- invalid (bridge/src/utilities/security/entra-sign-in.ts)
- unavailable (bridge/src/utilities/security/entra-sign-in.ts)
- errorReplyFor (bridge/src/utilities/security/entra-sign-in.ts)
- tokenFailureFor (bridge/src/utilities/security/entra-sign-in.ts)
- idTokenFailureFor (bridge/src/utilities/security/entra-sign-in.ts)
- checkSettings (bridge/src/utilities/security/entra-sign-in.ts)
- authenticationTime (bridge/src/utilities/security/entra-sign-in.ts)
- EntraOwnerSignIn (bridge/src/utilities/security/entra-sign-in.ts)
- managedIdentityAssertion (bridge/src/utilities/security/managed-identity-assertion.live.ts)
- additionalData (bridge/src/utilities/security/sealing.ts)
- checkKey (bridge/src/utilities/security/sealing.ts)
- generateSealingKey (bridge/src/utilities/security/sealing.ts)
- seal (bridge/src/utilities/security/sealing.ts)
- open (bridge/src/utilities/security/sealing.ts)
- Secret (bridge/src/utilities/security/secret.ts)
- SecurityError (bridge/src/utilities/security/security-error.ts)
- withSpareBit (bridge/src/utilities/security/security.test.ts)
- securityErrorFrom (bridge/src/utilities/security/security.test.ts)
- publicKeyText (bridge/src/utilities/security/signing.ts)
- challengeMessage (bridge/src/utilities/security/signing.ts)
- generateSigningKeyPair (bridge/src/utilities/security/signing.ts)
- exportPrivateKey (bridge/src/utilities/security/signing.ts)
- importPrivateKey (bridge/src/utilities/security/signing.ts)
- createChallengeNonce (bridge/src/utilities/security/signing.ts)
- signChallenge (bridge/src/utilities/security/signing.ts)
- verifyChallenge (bridge/src/utilities/security/signing.ts)
- parsePublicSigningKey (bridge/src/utilities/security/signing.ts)
- signingKeyId (bridge/src/utilities/security/signing.ts)
- inputs (bridge/test/contract/flat-inputs.test.ts)
- fields (bridge/test/contract/flat-inputs.test.ts)
- nullableReasons (bridge/test/contract/flat-inputs.ts)
- forbiddenInside (bridge/test/contract/flat-inputs.ts)
- fieldProblems (bridge/test/contract/flat-inputs.ts)
- toolProblems (bridge/test/contract/flat-inputs.ts)
- findNonFlatInputs (bridge/test/contract/flat-inputs.ts)
- tool (bridge/test/contract/narrowing.test.ts)
- timeField (bridge/test/contract/narrowing.test.ts)
- changes (bridge/test/contract/narrowing.test.ts)
- numberAt (bridge/test/contract/narrowing.ts)
- boundRule (bridge/test/contract/narrowing.ts)
- findNarrowing (bridge/test/contract/narrowing.ts)
- documentNamed (bridge/test/contract/public-contract.test.ts)
- readJson (bridge/test/contract/public-contract.test.ts)
- step (bridge/test/contract/public-contract.test.ts)
- dataField (bridge/test/contract/public-contract.test.ts)
- withoutDescriptions (bridge/test/contract/public-contract.test.ts)
- isSchemaNode (bridge/test/contract/schema-node.ts)
- childrenOf (bridge/test/contract/schema-node.ts)
- stringsOf (bridge/test/contract/schema-node.ts)
- pointer (bridge/test/contract/schema-node.ts)
- reply (bridge/test/contract/untrusted-marking.test.ts)
- isFreeText (bridge/test/contract/untrusted-marking.ts)
- isOpenObject (bridge/test/contract/untrusted-marking.ts)
- fieldProblems (bridge/test/contract/untrusted-marking.ts)
- walk (bridge/test/contract/untrusted-marking.ts)
- findMarkingProblems (bridge/test/contract/untrusted-marking.ts)
- never (bridge/test/core-access/grants-store.test.ts)
- sha256 (bridge/test/core-access/grants-store.test.ts)
- never (bridge/test/core-access/lease.test.ts)
- testStore (bridge/test/core-access/lease.test.ts)
- leaseFor (bridge/test/core-access/lease.test.ts)
- never (bridge/test/core-access/settings-store.test.ts)
- sensorAt (bridge/test/core-access/state-store.test.ts)
- never (bridge/test/core-access/state-store.test.ts)
- snapshot (bridge/test/core-access/state-store.test.ts)
- never (bridge/test/host/admin-page.test.ts)
- cookie (bridge/test/host/admin-page.test.ts)
- field (bridge/test/host/admin-page.test.ts)
- never (bridge/test/host/assembly.test.ts)
- core (bridge/test/host/assembly.test.ts)
- inProcess (bridge/test/host/assembly.test.ts)
- downable (bridge/test/host/assembly.test.ts)
- never (bridge/test/host/connector-health.test.ts)
- healthCommand (bridge/test/host/connector-health.test.ts)
- never (bridge/test/host/connector.test.ts)
- connectorSettings (bridge/test/host/connector.test.ts)
- quietLogger (bridge/test/host/connector.test.ts)
- owner (bridge/test/host/connector.test.ts)
- ringSignIn (bridge/test/host/connector.test.ts)
- POLL_MS (bridge/test/host/core-fixture.ts)
- AGENT (bridge/test/host/core-fixture.ts)
- OTHER_AGENT (bridge/test/host/core-fixture.ts)
- freePort (bridge/test/host/core-fixture.ts)
- memorySecrets (bridge/test/host/core-fixture.ts)
- startTestCore (bridge/test/host/core-fixture.ts)
- eventually (bridge/test/host/core-fixture.ts)
- json (bridge/test/host/core-fixture.ts)
- StandInVault (bridge/test/host/first-signing-key.test.ts)
- never (bridge/test/host/hybrid-end-to-end.test.ts)
- never (bridge/test/host/leased-links.test.ts)
- everyCall (bridge/test/host/leased-links.test.ts)
- quietLogger (bridge/test/host/one-home-part.test.ts)
- once (bridge/test/host/one-home-part.test.ts)
- startConnectorOn (bridge/test/host/one-home-part.test.ts)
- global (bridge/test/infra/bootstrap-harness.ps1)
- ids (bridge/test/infra/bootstrap.test.ts)
- json (bridge/test/infra/bootstrap.test.ts)
- run (bridge/test/infra/bootstrap.test.ts)
- roleRules (bridge/test/infra/bootstrap.test.ts)
- signedIn (bridge/test/infra/bootstrap.test.ts)
- emptySubscription (bridge/test/infra/bootstrap.test.ts)
- index (bridge/test/infra/bootstrap.test.ts)
- setNames (bridge/test/infra/bootstrap.test.ts)
- infraFile (bridge/test/infra/core-deployment.test.ts)
- allBicep (bridge/test/infra/core-deployment.test.ts)
- appSettings (bridge/test/infra/core-deployment.test.ts)
- everyVariable (bridge/test/infra/deploy-workflow.test.ts)
- jobs (bridge/test/infra/deploy-workflow.test.ts)
- job (bridge/test/infra/deploy-workflow.test.ts)
- global (bridge/test/infra/home-vm-harness.ps1)
- folder (bridge/test/infra/home-vm.test.ts)
- sha256 (bridge/test/infra/home-vm.test.ts)
- convert (bridge/test/infra/home-vm.test.ts)
- mutated (bridge/test/infra/home-vm.test.ts)
- keyFile (bridge/test/infra/home-vm.test.ts)
- parameters (bridge/test/infra/home-vm.test.ts)
- runVm (bridge/test/infra/home-vm.test.ts)
- commands (bridge/test/infra/home-vm.test.ts)
- IntervalClock (bridge/test/issuer/issuer.test.ts)
- never (bridge/test/issuer/issuer.test.ts)
- advance (bridge/test/issuer/issuer.test.ts)
- secretsWith (bridge/test/issuer/issuer.test.ts)
- RacingGrants (bridge/test/issuer/issuer.test.ts)
- publishDocument (bridge/test/issuer/issuer.test.ts)
- linkApprovals (bridge/test/issuer/issuer.test.ts)
- refresh (bridge/test/issuer/issuer.test.ts)
- textOf (bridge/test/issuer/issuer.test.ts)
- authorizeAs (bridge/test/issuer/issuer.test.ts)
- register (bridge/test/issuer/issuer.test.ts)
- fullWhen (bridge/test/link/link-contract.test.ts)
- loggerOn (bridge/test/link/link-contract.test.ts)
- withFaults (bridge/test/link/link-contract.test.ts)
- inMemoryCore (bridge/test/link/link-contract.test.ts)
- lastOf (bridge/test/link/link-contract.test.ts)
- intakeBodies (bridge/test/link/link-contract.test.ts)
- deviceStateIds (bridge/test/link/link-contract.test.ts)
- HOME_AS_OF (bridge/test/mcp-endpoint/core-fixture.ts)
- startCoreReads (bridge/test/mcp-endpoint/core-fixture.ts)
- hourFromNow (bridge/test/mcp-endpoint/mcp-endpoint.test.ts)
- tokenCheck (bridge/test/mcp-endpoint/mcp-endpoint.test.ts)
- argumentsFor (bridge/test/mcp-endpoint/mcp-endpoint.test.ts)
- textOf (bridge/test/mcp-endpoint/mcp-endpoint.test.ts)
- jsonOf (bridge/test/mcp-endpoint/mcp-endpoint.test.ts)
- textView (bridge/test/mcp-endpoint/mcp-endpoint.test.ts)
- failureOf (bridge/test/mcp-endpoint/mcp-endpoint.test.ts)
- published (bridge/test/mcp-endpoint/mcp-endpoint.test.ts)
- withoutDialect (bridge/test/mcp-endpoint/mcp-endpoint.test.ts)
- call (bridge/test/mcp-endpoint/mcp-endpoint.test.ts)
- post (bridge/test/mcp-endpoint/mcp-endpoint.test.ts)
- iteration001Codes (bridge/test/mcp-endpoint/mcp-endpoint.test.ts)
- light (bridge/test/pages/admin-page.spec.ts)
- health (bridge/test/pages/admin-page.spec.ts)
- enroll (bridge/test/pages/admin-page.spec.ts)
- notice (bridge/test/pages/admin-page.spec.ts)
- PREVIOUS_RELEASE_SCHEMA_VERSION (bridge/test/query-layer/migrations-contract.ts)
- never (bridge/test/query-layer/migrations-contract.ts)
- sql (bridge/test/query-layer/migrations-contract.ts)
- migrate (bridge/test/query-layer/migrations-contract.ts)
- insert (bridge/test/query-layer/migrations-contract.ts)
- probe (bridge/test/query-layer/migrations-contract.ts)
- describeMigrationsContract (bridge/test/query-layer/migrations-contract.ts)
- withoutGuard (bridge/test/query-layer/query-layer-contract.ts)
- never (bridge/test/query-layer/query-layer-contract.ts)
- sql (bridge/test/query-layer/query-layer-contract.ts)
- insertSample (bridge/test/query-layer/query-layer-contract.ts)
- describeQueryLayerContract (bridge/test/query-layer/query-layer-contract.ts)
- open (bridge/test/query-layer/sqlite.test.ts)
- never (bridge/test/query-layer/sqlite.test.ts)
- sql (bridge/test/query-layer/sqlite.test.ts)
- open (bridge/test/query-layer/tsql.test.ts)
- never (bridge/test/query-layer/tsql.test.ts)
- sql (bridge/test/query-layer/tsql.test.ts)
- isPlainData (bridge/test/ring-boundary/ring-boundary.test.ts)
- setUp (bridge/test/scenarios/faulty-channel.test.ts)
- FaultyChannel (bridge/test/scenarios/faulty-channel.ts)
- never (bridge/test/scenarios/scenario-engine.test.ts)
- setUp (bridge/test/scenarios/scenario-engine.test.ts)
- ScenarioEngine (bridge/test/scenarios/scenario-engine.ts)
- refusalError (bridge/test/scenarios/scenario-engine.ts)
- STANDARD_LOCATION_ID (bridge/test/scenarios/simulated-home.ts)
- STANDARD_TIME_ZONE (bridge/test/scenarios/simulated-home.ts)
- HEBREW_DEVICE_ID (bridge/test/scenarios/simulated-home.ts)
- HEBREW_DEVICE_NAME (bridge/test/scenarios/simulated-home.ts)
- HEBREW_ROOM (bridge/test/scenarios/simulated-home.ts)
- standardHome (bridge/test/scenarios/simulated-home.ts)
- device (bridge/test/scenarios/simulated-home.ts)
- battery (bridge/test/scenarios/simulated-home.ts)
- roomFor (bridge/test/scenarios/simulated-home.ts)
- DRIVE_STEP_MS (bridge/test/support/drive-clock.ts)
- DRIVE_LIMIT_MS (bridge/test/support/drive-clock.ts)
- driveUntil (bridge/test/support/drive-clock.ts)
- driveFor (bridge/test/support/drive-clock.ts)
- never (bridge/test/support/entra-stand-in.test.ts)
- signIn (bridge/test/support/entra-stand-in.test.ts)
- startEntraStandIn (bridge/test/support/entra-stand-in.ts)
- person (bridge/test/support/entra-stand-in.ts)
- accountOf (bridge/test/support/entra-stand-in.ts)
- cookieHeader (bridge/test/support/entra-stand-in.ts)
- keepCookies (bridge/test/support/entra-stand-in.ts)
- FAKE_RING_PROFILE_ID (bridge/test/support/fake-ring-client.ts)
- FAKE_RING_BODY (bridge/test/support/fake-ring-client.ts)
- FAKE_HUB (bridge/test/support/fake-ring-client.ts)
- FakeRingStream (bridge/test/support/fake-ring-client.ts)
- fakeDevice (bridge/test/support/fake-ring-client.ts)
- contactDevice (bridge/test/support/fake-ring-client.ts)
- panelDevice (bridge/test/support/fake-ring-client.ts)
- FAKE_DOORBELL (bridge/test/support/fake-ring-client.ts)
- FakeCamera (bridge/test/support/fake-ring-client.ts)
- hubSession (bridge/test/support/fake-ring-client.ts)
- noAnswer (bridge/test/support/fake-ring-client.ts)
- fakeLocation (bridge/test/support/fake-ring-client.ts)
- FakeRingClient (bridge/test/support/fake-ring-client.ts)
- ringHttpError (bridge/test/support/fake-ring-client.ts)
- driveFakeClock (bridge/test/support/fake-ring-client.ts)
- echoServer (bridge/test/support/mcp-client.test.ts)
- eraOptions (bridge/test/support/mcp-client.ts)
- connectInMemory (bridge/test/support/mcp-client.ts)
- connectOverHttp (bridge/test/support/mcp-client.ts)
- walk (bridge/test/support/owner-browser.ts)
- cookiesOf (bridge/test/support/owner-browser.ts)
- browse (bridge/test/support/owner-browser.ts)
- RecordingIntake (bridge/test/support/recording-intake.ts)
- never (bridge/test/support/store-matrix.test.ts)
- SQL_SERVER_READY_TIMEOUT_MS (bridge/test/support/store-matrix.ts)
- SQL_SERVER_SETUP_TIMEOUT_MS (bridge/test/support/store-matrix.ts)
- sqlServerTestSettings (bridge/test/support/store-matrix.ts)
- connectWhenReady (bridge/test/support/store-matrix.ts)
- requireSqlServerInCi (bridge/test/support/store-matrix.ts)
- describeStoreMatrix (bridge/test/support/store-matrix.ts)
- sqliteStore (bridge/test/support/store-matrix.ts)
- sqlServerStore (bridge/test/support/store-matrix.ts)
- OPENSSL_AVAILABLE (bridge/test/support/throwaway-certificate.ts)
- makeThrowawayCertificate (bridge/test/support/throwaway-certificate.ts)
- requireOpensslInCi (bridge/test/support/throwaway-certificate.ts)
- Write-Step (infra/bootstrap/bootstrap.ps1)
- Write-Detail (infra/bootstrap/bootstrap.ps1)
- Invoke-AzJson (infra/bootstrap/bootstrap.ps1)
- Invoke-AzQuiet (infra/bootstrap/bootstrap.ps1)
- Get-RoleId (infra/bootstrap/bootstrap.ps1)
- Grant-Role (infra/bootstrap/bootstrap.ps1)
- Get-DelegationCondition (infra/bootstrap/bootstrap.ps1)
- Get-GitHubOidcSubject (infra/bootstrap/bootstrap.ps1)
- Confirm-Owner (infra/bootstrap/bootstrap.ps1)
- Select-Subscription (infra/bootstrap/bootstrap.ps1)
- Show-Plan (infra/bootstrap/bootstrap.ps1)
- Invoke-BeforeDeploy (infra/bootstrap/bootstrap.ps1)
- Invoke-AfterDeploy (infra/bootstrap/bootstrap.ps1)
- Write-Step (infra/home/new-connector-vm.ps1)
- Write-Detail (infra/home/new-connector-vm.ps1)
- Read-SshPublicKey (infra/home/new-connector-vm.ps1)
- Get-UserData (infra/home/new-connector-vm.ps1)
- Get-MetaData (infra/home/new-connector-vm.ps1)
- Clear-Item (infra/home/new-connector-vm.ps1)
- Get-Sha256 (infra/home/new-connector-vm.ps1)
- Write-LfFile (infra/home/new-connector-vm.ps1)
- Show-Plan (infra/home/new-connector-vm.ps1)
- Get-ExpectedHash (infra/home/new-connector-vm.ps1)
- Invoke-Download (infra/home/new-connector-vm.ps1)
- Get-CloudImage (infra/home/new-connector-vm.ps1)
- Write-SeedDisk (infra/home/new-connector-vm.ps1)
- Wait-Address (infra/home/new-connector-vm.ps1)
- Invoke-Apply (infra/home/new-connector-vm.ps1)
- failIncomplete (scripts/audit-gate.mjs)
- isCompleteReport (scripts/audit-gate.mjs)
- advisoryId (scripts/audit-gate.mjs)
- PARAMETERS (scripts/deploy-parameters.mjs)
- DeployParametersError (scripts/deploy-parameters.mjs)
- isJsonArray (scripts/deploy-parameters.mjs)
- deploymentParameters (scripts/deploy-parameters.mjs)
- main (scripts/deploy-parameters.mjs)
- smokeTest (scripts/deploy-smoke.mjs)
- sbom (scripts/license-gate.mjs)
- licenceIds (scripts/license-gate.mjs)
- expressionAllowed (scripts/license-gate.mjs)
- componentAllowed (scripts/license-gate.mjs)
- sha256 (scripts/run-gitleaks.mjs)
- fail (scripts/run-gitleaks.mjs)
- tarCommand (scripts/run-gitleaks.mjs)
- extract (scripts/run-gitleaks.mjs)

### Removed

- none

## Module Hotspots

- Threshold: 250 changed lines per file
- bridge/dev/admin-pages.ts (255 changed lines)
- bridge/src/connector/access/outbox-store/outbox-store.test.ts (324 changed lines)
- bridge/src/connector/access/outbox-store/outbox-store.ts (375 changed lines)
- bridge/src/connector/access/ring-adapter/call-limits.test.ts (274 changed lines)
- bridge/src/connector/access/ring-adapter/call-limits.ts (260 changed lines)
- bridge/src/connector/access/ring-adapter/ring-api-adapter.test.ts (1345 changed lines)
- bridge/src/connector/access/ring-adapter/ring-api-adapter.ts (798 changed lines)
- bridge/src/connector/access/ring-adapter/ring-mapping.test.ts (323 changed lines)
- bridge/src/connector/access/secrets-file/secrets-file.test.ts (391 changed lines)
- bridge/src/connector/access/secrets-file/secrets-file.ts (285 changed lines)
- bridge/src/connector/clients/core-link/core-link.test.ts (650 changed lines)
- bridge/src/connector/clients/core-link/home-session.ts (301 changed lines)
- bridge/src/connector/clients/setup-cli/setup.test.ts (373 changed lines)
- bridge/src/connector/clients/setup-cli/setup.ts (333 changed lines)
- bridge/src/connector/managers/ingest/ingest.test.ts (1154 changed lines)
- bridge/src/connector/managers/ingest/ingest.ts (574 changed lines)
- bridge/src/contract/inquiry-tools.ts (271 changed lines)
- bridge/src/core/access/grants/grants-store.ts (412 changed lines)
- bridge/src/core/access/secrets/sealed-file-secrets.test.ts (303 changed lines)
- bridge/src/core/access/settings/settings-store.ts (660 changed lines)
- bridge/src/core/access/state/state-store.ts (837 changed lines)
- bridge/src/core/clients/connector-link/connector-link.test.ts (1159 changed lines)
- bridge/src/core/clients/connector-link/core-session.ts (689 changed lines)
- bridge/src/core/clients/issuer/grants-adapter.test.ts (254 changed lines)
- bridge/src/core/clients/issuer/issuer.ts (682 changed lines)
- bridge/src/core/clients/mcp-endpoint/mcp-endpoint.ts (288 changed lines)
- bridge/src/core/clients/mcp-endpoint/read-tools.ts (402 changed lines)
- bridge/src/core/clients/web/pages.ts (542 changed lines)
- bridge/src/core/clients/web/web.test.ts (1048 changed lines)
- bridge/src/core/clients/web/web.ts (735 changed lines)
- bridge/src/core/engines/health/health-engine.test.ts (269 changed lines)
- bridge/src/core/engines/summary/summary-engine.test.ts (399 changed lines)
- bridge/src/core/engines/summary/summary-engine.ts (410 changed lines)
- bridge/src/core/managers/event/event-manager.test.ts (740 changed lines)
- bridge/src/core/managers/event/event-manager.ts (361 changed lines)
- bridge/src/core/managers/inquiry/inquiry-manager.test.ts (683 changed lines)
- bridge/src/core/managers/inquiry/inquiry-manager.ts (389 changed lines)
- bridge/src/host/all-in-one.ts (288 changed lines)
- bridge/src/host/core-service.ts (420 changed lines)
- bridge/src/types/oidc-provider.d.ts (325 changed lines)
- bridge/src/utilities/config/settings.test.ts (420 changed lines)
- bridge/src/utilities/link-transport/socket-link.test.ts (420 changed lines)
- bridge/src/utilities/logging/logger.test.ts (341 changed lines)
- bridge/src/utilities/logging/redaction-paths.test.ts (309 changed lines)
- bridge/src/utilities/query-layer/migrations/migrations.test.ts (254 changed lines)
- bridge/src/utilities/query-layer/query-layer.test.ts (754 changed lines)
- bridge/src/utilities/query-layer/query-layer.ts (356 changed lines)
- bridge/src/utilities/query-layer/tsql.ts (373 changed lines)
- bridge/src/utilities/security/entra-sign-in.test.ts (846 changed lines)
- bridge/src/utilities/security/entra-sign-in.ts (481 changed lines)
- bridge/test/contract/narrowing.test.ts (314 changed lines)
- bridge/test/contract/narrowing.ts (268 changed lines)
- bridge/test/core-access/grants-store.test.ts (534 changed lines)
- bridge/test/core-access/lease.test.ts (492 changed lines)
- bridge/test/core-access/settings-store.test.ts (640 changed lines)
- bridge/test/core-access/state-store.test.ts (707 changed lines)
- bridge/test/host/assembly.test.ts (325 changed lines)
- bridge/test/host/connector.test.ts (401 changed lines)
- bridge/test/infra/bootstrap.test.ts (652 changed lines)
- bridge/test/infra/deploy-workflow.test.ts (421 changed lines)
- bridge/test/infra/home-vm.test.ts (546 changed lines)
- bridge/test/issuer/issuer.test.ts (1920 changed lines)
- bridge/test/link/link-contract.test.ts (923 changed lines)
- bridge/test/mcp-endpoint/mcp-endpoint.test.ts (830 changed lines)
- bridge/test/pages/admin-page.spec.ts (339 changed lines)
- bridge/test/query-layer/migrations-contract.ts (635 changed lines)
- bridge/test/query-layer/query-layer-contract.ts (472 changed lines)
- bridge/test/query-layer/tsql.test.ts (390 changed lines)
- bridge/test/scenarios/scenario-engine.test.ts (339 changed lines)
- bridge/test/scenarios/scenario-engine.ts (274 changed lines)
- bridge/test/support/entra-stand-in.ts (275 changed lines)
- bridge/test/support/fake-ring-client.ts (365 changed lines)
- infra/bootstrap/bootstrap.ps1 (449 changed lines)
- infra/home/convert-qcow2.ps1 (273 changed lines)
- infra/home/new-connector-vm.ps1 (459 changed lines)
- package-lock.json (7702 changed lines)
- schemas/tool-replies.schema.json (828 changed lines)
- specs/001-ring-mcp-bridge/contracts/mcp-tools.md (343 changed lines)
- specs/001-ring-mcp-bridge/data-model.md (730 changed lines)
- specs/001-ring-mcp-bridge/iterations/001/design-analysis.md (340 changed lines)
- specs/001-ring-mcp-bridge/iterations/001/drift-log.md (3119 changed lines)
- specs/001-ring-mcp-bridge/iterations/001/quality/mechanical-findings.json (506 changed lines)
- specs/001-ring-mcp-bridge/iterations/001/state.md (721 changed lines)
- specs/001-ring-mcp-bridge/plan.md (368 changed lines)
- specs/001-ring-mcp-bridge/quickstart.md (326 changed lines)
- specs/001-ring-mcp-bridge/research.md (928 changed lines)
- specs/001-ring-mcp-bridge/tasks.md (659 changed lines)
