# Review Result

- **Campaign**: `cmp-001-ring-mcp-bridge-i002`
- **Run**: `run-20261121-213350389-0f2fa4c7`
- **Harness**: `claude-code-file-primary`
- **Target digest**: `94a77c9604847dd4adb7d81bae5f4636b714e709`
- **Completion**: `complete`
- **Verdict**: `findings`
- **Runtime outcome**: `completed`
- **Currentness**: `current`
- **Can approve current snapshot**: `false`

## Summary

Round-nine scope, two checks. Controller evidence: governance command exited 0, not timed out. Check 1: get_events in schemas/tool-inputs.schema.json matches contracts/iteration-002-tools.schema.json structurally (types, minLength, limit min 1 / max 9007199254740991, enum, additionalProperties false); only descriptions differ. public-contract.test.ts:189-208 is parameterized over 001 and 002, and it compares each planned $def to the generated input with descriptions removed, using toEqual. A change to limit.maximum on either side would therefore fail. The generated schema is tied to the published file by the snapshot test at lines 123-142. The comparison runs only from plan to published, so a published tool missing from both plans goes unchecked. That is acceptable today because all five published tools are planned. Check 2: in events.test.ts, the tests under 'MCP Events on the endpoint' (line 460 on) cover the capability and list, the verification challenge on subscribe, challenge failure (-32015), a host outside the allowlist (INVALID_PARAMS, callback_not_allowed, zero requests reach the stub transport), a missing key, and a client without read scope (403, nothing sent). Scope is enforced for every request in McpEndpoint.#serve before dispatch. Gaps: the no-read test sends events/list, not events/subscribe. Subscribe success checks only the reply shape and one verification request. Removal checks only that both calls resolve. Removal is verified at unit level in delivery.test.ts:662-671. Limitation: HTTPS-only, redirect, size and time-limit checks were not re-read this round. Round-eight findings were not re-examined.

## Findings

| ID | Severity | Relevance | Location | Finding |
| --- | --- | --- | --- | --- |
| `finding-423bbf3f0f00504f` | minor | current | bridge/test/mcp-endpoint/events.test.ts:561 | Read-scope refusal test calls events/list rather than events/subscribe: T048 requires a test showing that a client without the read scope cannot subscribe. The endpoint test sends only events/list in the legacy era with the no-read token, and asserts 403 with no callback sent. Scope is currently enforced for every request in McpEndpoint.#serve (mcp-endpoint.ts:201-229, 267), so subscribe is protected in practice. However, no assertion exercises events/subscribe, or the modern era, without read scope. If scope gating moved per method, this test would not catch an unguarded subscribe. Add a no-read events/subscribe case that asserts the refusal and an empty harness.sent. |
| `finding-0353a073e87b98d6` | minor | current | bridge/test/mcp-endpoint/events.test.ts:575 | Endpoint unsubscribe test does not verify the subscription was removed: 'ends a subscription, and ends it again without complaint' only asserts that both events/unsubscribe calls resolve to something defined. It never checks that a later eventStored sends nothing to the callback, or that the store no longer holds the row. The endpoint's mapping of params.id and the caller's client id to Delivery.unsubscribe is therefore unverified end to end. A no-op handler would pass. Removal is covered only at unit level (delivery.test.ts:662-671). Similarly, the subscribe success test (line 506) checks the reply shape and the verification request, but not that an event is later delivered, signed, to the new subscription through the endpoint. |

_This Markdown is a controller-generated projection. Authority is the sibling immutable `result.json`._