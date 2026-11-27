// The SQLite driver (R21, B5): node:sqlite, for the connector's outbox and for mode A. Posture (a):
// its calls are synchronous on the event loop, accepted and kept short. Node 24.13 has only
// `DatabaseSync`; an asynchronous class, when Node ships one, changes this file alone.
import { DatabaseSync } from "node:sqlite";
import type { SQLInputValue, SQLOutputValue } from "node:sqlite";
import { QueryLayer } from "./query-layer.ts";
import type { QueryLayerOptions } from "./query-layer.ts";
import { QueryLayerError } from "./query-layer-error.ts";
import type {
  DriverFailure,
  DriverTransaction,
  FailureClass,
  ResultMode,
  SqlDriver,
  StatementResult,
} from "./sql-driver.ts";
import type { SqlRow, SqlStatement, SqlValue } from "./sql-types.ts";

/** SQLite's primary result codes (the low byte of an extended code): https://sqlite.org/rescode.html */
const PRIMARY_CODE_MASK = 0xff;
const SQLITE_CODES: Readonly<Record<number, FailureClass>> = {
  5: "retryable", // SQLITE_BUSY: another connection holds the file's lock
  6: "retryable", // SQLITE_LOCKED: a table lock inside this connection
  8: "unavailable", // SQLITE_READONLY
  10: "unavailable", // SQLITE_IOERR
  11: "unavailable", // SQLITE_CORRUPT
  13: "unavailable", // SQLITE_FULL
  14: "unavailable", // SQLITE_CANTOPEN
  19: "constraint", // SQLITE_CONSTRAINT
  26: "unavailable", // SQLITE_NOTADB
};

/**
 * Opens the SQLite file at `path` (`:memory:` for a database that lives only in this process) and
 * returns its Query layer. Foreign keys are enforced, as on SQL Server. Fails with `store_down`
 * when the file cannot be opened.
 */
export function openSqliteQueryLayer(
  path: string,
  options: QueryLayerOptions,
): QueryLayer {
  let database: DatabaseSync;
  try {
    database = new DatabaseSync(path, { enableForeignKeyConstraints: true });
  } catch (error) {
    throw new QueryLayerError(
      "store_down",
      `The SQLite file could not be opened (${classifySqliteError(error).label}).`,
      { cause: error },
    );
  }
  return new QueryLayer(new SqliteDriver(database), options);
}

/** Sorts a node:sqlite failure by SQLite's result code. */
export function classifySqliteError(error: unknown): DriverFailure {
  const errcode = sqliteErrcode(error);
  if (errcode === undefined) {
    return { failureClass: "statement", label: "SQLite driver error" };
  }
  const failureClass = SQLITE_CODES[errcode & PRIMARY_CODE_MASK] ?? "statement";
  return { failureClass, label: `SQLite error ${String(errcode)}` };
}

function sqliteErrcode(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }
  const { code, errcode } = error as { code?: unknown; errcode?: unknown };
  return code === "ERR_SQLITE_ERROR" && typeof errcode === "number"
    ? errcode
    : undefined;
}

/** One SQLite connection. The layer runs one unit of work on it at a time. */
class SqliteDriver implements SqlDriver {
  readonly dialect = "sqlite";
  readonly serial = true;
  readonly #database: DatabaseSync;

  constructor(database: DatabaseSync) {
    this.#database = database;
  }

  execute(statement: SqlStatement, mode: ResultMode): Promise<StatementResult> {
    return settle(() => this.#execute(statement, mode));
  }

  // BEGIN IMMEDIATE takes the write lock at the start, so a busy file fails here, before any work.
  begin(): Promise<DriverTransaction> {
    const database = this.#database;
    return settle(() => {
      database.exec("BEGIN IMMEDIATE");
      return {
        execute: (statement: SqlStatement, mode: ResultMode) =>
          settle(() => this.#execute(statement, mode)),
        commit: () =>
          settle(() => {
            database.exec("COMMIT");
          }),
        rollback: () =>
          settle(() => {
            if (database.isTransaction) {
              database.exec("ROLLBACK");
            }
          }),
      };
    });
  }

  classify(error: unknown): DriverFailure {
    return classifySqliteError(error);
  }

  close(): Promise<void> {
    return settle(() => {
      this.#database.close();
    });
  }

  #execute(statement: SqlStatement, mode: ResultMode): StatementResult {
    const prepared = this.#database.prepare(statement.sql);
    const params = statement.params as Record<string, SQLInputValue>;
    if (mode === "changes") {
      return { rows: [], changes: Number(prepared.run(params).changes) };
    }
    return { rows: prepared.all(params).map(plainRow), changes: 0 };
  }
}

// node:sqlite is synchronous; a throw becomes a rejection, as the driver seam promises.
function settle<T>(call: () => T): Promise<T> {
  return new Promise((resolve) => {
    resolve(call());
  });
}

// node:sqlite rows have no prototype; a plain object compares and prints like the T-SQL rows.
function plainRow(row: Record<string, SQLOutputValue>): SqlRow {
  const plain: Record<string, SqlValue> = {};
  for (const [column, value] of Object.entries(row)) {
    if (typeof value === "bigint") {
      throw new QueryLayerError(
        "statement_failed",
        "SQLite returned an integer beyond the safe range.",
      );
    }
    plain[column] = value;
  }
  return plain;
}
