# Review Result

- **Campaign**: `cmp-001-ring-mcp-bridge-i001`
- **Run**: `run-20261105-144818639-e501294a`
- **Harness**: `codex-cli-file-primary`
- **Target digest**: `cdffa44d9e8dbd129081a5648ffb8c162313fded`
- **Completion**: `complete`
- **Verdict**: `findings`
- **Runtime outcome**: `completed`
- **Currentness**: `current`
- **Can approve current snapshot**: `false`

## Summary

Completed risk-based inspection of the frozen implementation through T008, covering authentication and cryptography, logging and redaction, configuration and clocks, pub/sub, both SQL drivers, transaction/retry/cancellation behavior, migrations, relevant tests, CI and published design contracts. Found three SQL Server failure-handling defects. Controller evidence records the one declared governance command as successful (exit 0, no timeout). No tests, builds or repository automation were run during this review.

## Findings

| ID | Severity | Relevance | Location | Finding |
| --- | --- | --- | --- | --- |
| `finding-d3e5714fc6b75792` | minor | current | bridge/src/utilities/query-layer/tsql.ts:241 | Attach an error listener to each SQL Server connection pool: [demoted to minor: no concrete failure scenario, so it cannot gate; reported as major by the reviewer] TsqlDriver creates a private mssql.ConnectionPool without any error listener. The connect().catch() handles promise rejection, but it cannot catch an error event emitted asynchronously by an established connection. The pinned driver forwards non-ESOCKET Tedious connection errors to the pool; an unhandled EventEmitter error terminates Node. A database connection fault can therefore take down the bridge instead of following the store_down/recovery path required by FR-006. Attach a safe pool error handler before connecting and cover an asynchronous pool error in the driver tests. The upstream behavior is visible in [mssql 12.7.13 connection-pool.js](https://raw.githubusercontent.com/tediousjs/node-mssql/v12.7.13/lib/tedious/connection-pool.js). |
| `finding-129f035b7d052bb6` | minor | current | bridge/src/utilities/query-layer/tsql.ts:184 | Recognize connection failures wrapped inside RequestError: errorFields reads only the outer number and code. When an established connection emits ESOCKET during a query, mssql 12.7.13's connection-error handler creates a RequestError with code EREQUEST and no numeric number; the original connection code is retained under originalError.info.code. This classifier consequently returns statement, and failureError produces statement_failed with transient=false. The intended BRIDGE_UNAVAILABLE mapping and the safe transaction retry are both lost for this real connection-loss path. Inspect the driver's nested error shape conservatively while preserving SQL constraint/syntax classifications and the rule against retrying an uncertain standalone write. The current tests supply top-level ESOCKET objects and only exercise initial connection failure, so they miss this case. See the pinned [request error handler](https://raw.githubusercontent.com/tediousjs/node-mssql/v12.7.13/lib/tedious/request.js). |
| `finding-35f2fb2a3ae6fcf3` | minor | current | bridge/src/utilities/query-layer/tsql.ts:218 | Honor cancellation while a SQL transaction is starting: The signal is observed while establishing the shared pool, but transaction.begin() then waits without observing it. If connection acquisition or BEGIN is delayed, aborting the caller leaves the transaction call pending. If BEGIN later succeeds, QueryLayer.#attemptTransaction invokes work(session) before checking the aborted signal; that check occurs only after the callback finishes. This starts work and holds a transaction after cancellation, contrary to the declared cancellation contract. Observe cancellation during transaction startup, avoid invoking the work callback after abort, and arrange rollback/cleanup if a pending BEGIN succeeds after the caller has gone. Add coverage for abort during a delayed successful begin; the existing begin-abort test only covers begin rejecting. |

_This Markdown is a controller-generated projection. Authority is the sibling immutable `result.json`._