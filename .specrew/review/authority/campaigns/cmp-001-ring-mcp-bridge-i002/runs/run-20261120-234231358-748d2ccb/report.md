# Review Result

- **Campaign**: `cmp-001-ring-mcp-bridge-i002`
- **Run**: `run-20261120-234231358-748d2ccb`
- **Harness**: `claude-code-file-primary`
- **Target digest**: `b49ac6ed4699479402801750dcaab993862ed5cd`
- **Completion**: `partial`
- **Verdict**: `incomplete`
- **Runtime outcome**: `completed`
- **Currentness**: `current`
- **Can approve current snapshot**: `false`

## Summary

Governance check passed (exit 0). Timestamp fix verified: normalize.ts eventTimeMs/occurredAt rejects years outside 0..9999 (including NaN) and falls back trigger time, ding created_at, eventito time, receipt time; normalize.test.ts 'uses the next timestamp' asserts each step, and ingest.test.ts 'queues a doorbell press with receipt time' asserts a schema-valid outbox body. The timestamp finding looks resolved. One minor contract-test gap found: public-contract.test.ts compares published inputs only with the iteration-001 schema, not iteration-002-tools.schema.json, so get_events input drift is unchecked there. Partial: I did not read plan.md, tasks.md, the outbox, callback-transport or subscription tests, or the MCP endpoint tests, so T043, T048 and T051 coverage is not assessed. events-read.test.ts covers cursor paging, epoch change, invalid cursors, filters, and budget paging; it has no assertion on timestamp range.

## Findings

| ID | Severity | Relevance | Location | Finding |
| --- | --- | --- | --- | --- |
| `finding-477fb977b10323f4` | minor | current | bridge/test/contract/public-contract.test.ts:31 | Contract test does not compare get_events input with iteration-002 schema: public-contract.test.ts defines PLANNED_INPUTS as iteration-001-tools.schema.json only, and 'match the plan's iteration 001 inputs' loops only over that file's $defs. contracts/iteration-002-tools.schema.json (get_events: location_id, cursor, limit, min_priority, kind, device_id, additionalProperties false) is referenced only in a comment in src/contract/events-tool.ts. The snapshot and no-narrowing checks protect the published schema once it exists, but nothing asserts the published get_events input equals the plan. Add the same withoutDescriptions comparison for the iteration-002 file. I grepped bridge for iteration-002-tools and did not read the mcp-endpoint tests, so a comparison there is not ruled out. |
| `finding-f0e32e5e6f88a5cb` | note | current | bridge/src/core/managers/inquiry/events-read.test.ts:189 | get_events tests carry no out-of-range or fallback occurred_at case: events-read.test.ts stores every event with occurred_at START and asserts only a normal UTC and local formatting. The normalizer now guarantees a four-digit-year time, so formatUtc cannot throw on such rows. No read-side test pins that contract, so a regression in the connector bound would only surface in the ingest test. Optional hardening. |

_This Markdown is a controller-generated projection. Authority is the sibling immutable `result.json`._