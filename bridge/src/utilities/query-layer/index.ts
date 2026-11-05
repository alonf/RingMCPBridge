// Query layer utility (CP-03, T007): one way to run SQL on SQLite and on SQL Server. The only
// entry point (CD4). The SQL Server half (tsql.ts, tsql-managed-identity.live.ts) is not exported
// here: only the core's wiring imports it, so the connector never reaches mssql (I5.3).

/** The seam types: dialects, values, statements, and the session a transaction's work receives. */
export type {
  SqlDialect,
  SqlParams,
  SqlRow,
  SqlSession,
  SqlStatement,
  SqlValue,
} from "./sql-types.ts";

/**
 * The Query layer: `all`, `get` and `run` as single units of work, and `transaction`, each with
 * one retry on a passing failure. The Host wires one per database.
 */
export { QueryLayer, RETRY_PAUSE_MS } from "./query-layer.ts";
export type { QueryLayerOptions } from "./query-layer.ts";

/** The SQLite Query layer, for the connector's outbox and for mode A. */
export { openSqliteQueryLayer } from "./sqlite.ts";

/** The utility's error: `store_down` (managers answer `BRIDGE_UNAVAILABLE`), `constraint_violated` or `statement_failed`. */
export { QueryLayerError } from "./query-layer-error.ts";
export type { QueryLayerErrorKind } from "./query-layer-error.ts";

/** The two statements written once per dialect: insert-or-update and keyset paging. */
export { keysetPageStatement, upsertStatement } from "./statements.ts";
export type { KeysetPageSpec, UpsertSpec } from "./statements.ts";
