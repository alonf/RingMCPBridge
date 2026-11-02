# Reply and Error Contract

**Feature**: `001-ring-mcp-bridge` | **Stage**: plan (Phase 1 design artifact) | **Date**: 2026-11-02

This contract states the reply envelope, the error envelope and the error codes every tool uses. It transcribes integration-api D7 and its amendments, plus the plan-time resolution CRP 1 of 2026-11-02 (`../research.md`). Citation keys are those in `../data-model.md`. **[P]** marks a name proposed here, not in the records.

## Reply envelope (every successful tool call)

A reply carries a one-line text summary as content, plus `structuredContent` that matches the tool's output schema (IA §Reply, error and event shapes).

```json
{
  "as_of": "2026-10-25T09:12:03Z",
  "as_of_local": "2026-10-25T12:12:03+03:00",
  "freshness": "stale",
  "stale_since": "2026-10-25T09:05:40Z",
  "data": {}
}
```

| Field | Type | Required | Rule | Source |
|---|---|---|---|---|
| `as_of` | string, date-time, UTC | yes | when the data was true | FR-006, IA D7 |
| `as_of_local` | string, date-time with offset | yes | the same instant in the location's time zone | FR-006, IA D7 |
| `freshness` | enum `live`, `cached`, `stale` | yes | | FR-006, IA D7 |
| `stale_since` | string, date-time, UTC | only when `freshness` is `stale` | when the data became stale | FR-006, AC B12 |
| `data` | object | yes | tool-specific; see `mcp-tools.md` | IA D7 |

**Freshness rules:**

- Reads never fail only because the home link is down. They return the last known state, marked `stale` with `stale_since`, and never present it as current (IA §Rules 1, FR-006, AC B12).
- When the bridge's own store is down, reads fail with `BRIDGE_UNAVAILABLE` instead of serving stale data. Stale applies only to the home link (IA §Amendments, OR §Amendments, FR-006).
- A lost Ring connection is shown as stale within 2 minutes (SC-005).

## Error envelope (a tool failure)

A tool failure is a tool result with `isError: true` and this `structuredContent` (IA §Reply, error and event shapes):

```json
{
  "error": {
    "code": "RING_UNAVAILABLE",
    "message": "Ring did not answer; last known state is 3 min old",
    "retryable": true,
    "retry_after_s": 30,
    "outcome": "not_done",
    "details": {}
  },
  "as_of": "2026-10-25T09:12:03Z"
}
```

| Field | Type | Required | Rule | Source |
|---|---|---|---|---|
| `error.code` | string, one of the codes below | yes | the list grows only additively | IA D7, IA D2 |
| `error.message` | string | yes | plain words for the agent; never tokens, the PIN, keys or images | IA D7, FR-034 |
| `error.retryable` | boolean | yes | | IA D7 |
| `error.retry_after_s` | integer, seconds | when a retry time applies | | IA D7 |
| `error.outcome` | enum `done`, `not_done`, `unknown` | control tools only | what happened to the action | IA D7, FR-024 |
| `error.details` | object | no | code-specific; see the table | IA D7 |
| `as_of` | string, date-time, UTC | yes | | IA D7 |

## Error codes

Fourteen codes: the thirteen of IA D7 (with `RING_REJECTED`, added in D8) plus `BRIDGE_UNAVAILABLE` (added by observability-resilience). A code drafted for the owner's separate gate app (out of scope) was withdrawn and is not part of the contract (IA §Amendments, CD A3).

| Code | When | Retryable | `outcome` (control) | First used | Source |
|---|---|---|---|---|---|
| `INVALID_ARGUMENT` | bad or missing input, including a broken "either/or" rule of a flat schema | no | `not_done` | 001 | IA §Error codes, FR-048 |
| `NOT_FOUND` | unknown device, camera, location or event | no | `not_done` | 001 | IA §Error codes |
| `BRIDGE_UNAVAILABLE` | reserved for a core dependency (database, Blob) being down; the lease lapses, so control stops. Never used for the home link | yes, after `retry_after_s` | `not_done` | 001 | IA §Amendments, OR §Failure modes rows 6-7, FR-006, CRP 1 |
| `RATE_LIMITED` | the bridge's own per-client limits, or the shared limiter toward Ring | yes, after `retry_after_s` | `not_done` | 001 (reads) | IA §Error codes, FR-026, SC6 |
| `TIMEOUT` | the 60 s deadline passed | read: yes; control: no, check the state first | `unknown` | 001 | IA §Error codes, FR-024, IA §Rules 2 |
| `INTERNAL` | a bug in the bridge | no | `unknown` if a command may have been sent [P] | 001 | IA §Error codes |
| `HOME_OFFLINE` | the home link is down (control and media only; reads degrade to stale), including a link drop with a command in flight | link down before sending: yes, after `retry_after_s`. Command in flight: no automatic retry; check the state first | `not_done` before sending; `unknown` in flight | 003 | IA §Error codes, spec Edge Cases, CRP 1 |
| `RING_UNAVAILABLE` | Ring is down, slow or blocking the bridge (for example a 406); the circuit is open | yes, with backoff | `not_done` | 003 | IA §Error codes, OR §Failure modes row 3 |
| `RING_REJECTED` | Ring answered but refused the command | no; fix the cause and prepare again | `not_done` | 003 | IA D8, IA §Rules surfaced 4 |
| `BATTERY_GUARD` | a fresh frame or live session on a battery camera over its hourly cap | no; use the cached frame | - | 003 | IA §Error codes, FR-019, SC-008 |
| `SNAPSHOT_BLOCKED` | Ring refuses snapshots (motion detection off, or recording) | later | - | 003 | IA §Error codes |
| `CONFIRMATION_INVALID` | the confirmation expired, was already used, belongs to another client or user, or its plan changed | no; prepare again | `not_done` | 003 | IA §Error codes, IA §Rules surfaced 2, FR-025 |
| `ACTION_DISABLED` | the action is switched off in configuration, or disarm on a client without MRTR and URL elicitation | no | `not_done` | 003 | IA §Error codes, IA D8 b, FR-027, FR-045 |
| `HUMAN_DECLINED` | the owner declined or cancelled the confirmation | no | `not_done` | 003 | IA §Error codes, IA D8 |

### Details and reasons

| Code | `details` / reason | Source |
|---|---|---|
| `ACTION_DISABLED` (disarm, client cannot confirm it) | reason "this client cannot confirm a disarm" | IA D8 b, IA §Rules surfaced 5 |
| `BATTERY_GUARD` | points to the cached frame: [P] `details.cached_as_of` | FR-019, US3 scenario 2 |
| `CONFIRMATION_INVALID` after a plan change | the message says "prepare again" | IA D8 arm table step 6 |
| `TIMEOUT` on control | the agent is told to check the state first; a late result still reaches the audit and the event | FR-024, IA D8 step 11 |
| `RATE_LIMITED` on control | hitting the control limit also raises a security event | SC6 |

### Rules that apply to every code

1. A control call that times out, or whose home link drops with the command in flight, is never retried automatically. Its outcome is `unknown`, and the agent checks the state first (IA §Rules 2, FR-024, spec Edge Cases, CRP 1).
2. Commands reach home at most once. A retry after `not_done` is a new prepare, never a re-send (IA §Rules surfaced 1).
3. Error text carries identifiers, never content: no tokens, PIN, keys or images (FR-034, OR6).
4. New codes are added only additively (IA D2, FR-046).

## Which tool can return which code

`x` = can return. Every tool can also return `INTERNAL` and `BRIDGE_UNAVAILABLE`. Iteration in brackets.

| Tool | INVALID_ARGUMENT | NOT_FOUND | RATE_LIMITED | TIMEOUT | HOME_OFFLINE | RING_UNAVAILABLE | RING_REJECTED | BATTERY_GUARD | SNAPSHOT_BLOCKED | CONFIRMATION_INVALID | ACTION_DISABLED | HUMAN_DECLINED |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `get_overview` (001) | x | x | x | x | | | | | | | | |
| `list_devices` (001) | x | x | x | x | | | | | | | | |
| `get_device` (001) | x | x | x | x | | | | | | | | |
| `get_health` (001) | x | | x | x | | | | | | | | |
| `get_events` (002) | x | x | x | x | | | | | | | | |
| `get_motion` (003) | x | x | x | x | | | | | | | | |
| `set_push_filter` (003) | x | x | x | x | | | | | | | | |
| `get_history` (003) | x | x | x | x | | x | | | | | | |
| `get_frame` (003) | x | x | x | x | x | x | | x | x | | | |
| `get_burst` (003) | x | x | x | x | x | x | | x | x | | | |
| `get_clip` (003) | x | x | x | x | x | x | | x | x | | | |
| `prepare_action` (003) | x | x | x | x | x | x | | | | | x | x |
| `confirm_action` (003) | x | | x | x | x | x | x | | | x | x | |

Notes:

- `get_history` reads Ring history live through the home (DS §Inventory). Its `HOME_OFFLINE` behaviour is not recorded. Under IA §Rules 1 it may degrade to stale instead.
- Which code refuses a disarm while the PIN lock runs, control on a shared location, media on a camera whose switch is off, or control without the lease while the database is up is not recorded. These are carried to the iteration 003 and 004 plans (G1, G2 in `../data-model.md`).
- The per-client read limit (600 an hour, SC6) applies to the iteration-001 tools. FR-026 is traced to US3 and US4, so plan decides whether the limiter lands in 001 or 003.

## Protocol-level outcomes (not tool errors)

| Situation | Response | Source |
|---|---|---|
| Malformed request, unknown tool | JSON-RPC error | IA §Error codes |
| Missing or invalid token | HTTP 401 with `WWW-Authenticate` (MCP authorization) | IA §Error codes, AC B14 |
| Token lacks the tool's scope (`read`, `media`, `control`) | HTTP 403 with `WWW-Authenticate` | IA §Error codes, FR-030 |
| Disarm on a 2026-07-28 client that declares `elicitation.url`, disarm switched on | an MRTR `InputRequiredResult` (`resultType: "input_required"`) carrying a URL-mode elicitation and a sealed `requestState`. Not an error. The legacy `-32042` path is not used | IA §Error codes, IA D8 |
