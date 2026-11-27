// The T-SQL driver (R21): mssql 12.7.13 over tedious, for the core's Azure SQL database. Only the
// core's wiring imports this file, never index.ts, so the connector never reaches mssql (I5.3).
import mssql from "mssql";
import type {
  ConnectionPool,
  IColumnMetadata,
  IRecordSet,
  IResult,
  Request,
  Transaction,
  config as MssqlConfig,
} from "mssql";
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
import { untilAborted } from "./until-aborted.ts";

/**
 * SQL Server error numbers that mean the work did not take effect and the cause passes:
 * - Microsoft's transient fault error codes for Azure SQL ("Troubleshoot common connection issues",
 *   "List of transient fault error codes", learn.microsoft.com, 2026-04-28): 926, 4060, 40197,
 *   40501, 40613, 49918, 49919, 49920, 4221 and 615;
 * - 1205: chosen as a deadlock victim; SQL Server has rolled the transaction back.
 */
const RETRYABLE_NUMBERS: ReadonlySet<number> = new Set([
  926, 4060, 40197, 40501, 40613, 49918, 49919, 49920, 4221, 615, 1205,
]);
/**
 * 596: the server killed the session while the statement ran, and closes its connection; a
 * transaction is rolled back, but a single statement's outcome is not known.
 */
const LOST_NUMBERS: ReadonlySet<number> = new Set([596]);
/** 2627 primary key or unique constraint, 2601 unique index, 547 foreign key or check, 515 not null. */
const CONSTRAINT_NUMBERS: ReadonlySet<number> = new Set([2627, 2601, 547, 515]);
/**
 * 18456 login failed, 9002 transaction log full, 1105 file group full, 40544 the database reached
 * its size quota, 3906 the database is read-only.
 */
const UNAVAILABLE_NUMBERS: ReadonlySet<number> = new Set([
  18456, 9002, 1105, 40544, 3906,
]);
/**
 * mssql's codes for a broken or timed-out connection and for a transaction the server ended, and
 * the system's codes for a connection cut while a request ran, which mssql passes on as they are
 * (a reset connection arrives as ECONNRESET).
 */
const LOST_CODES: ReadonlySet<string> = new Set([
  "ESOCKET",
  "ETIMEOUT",
  "ECONNCLOSED",
  "EABORT",
  "ECONNRESET",
  "ECONNABORTED",
  "EPIPE",
  "ETIMEDOUT",
]);
/** mssql's codes for a connection that could not be made or is not open. */
const UNAVAILABLE_CODES: ReadonlySet<string> = new Set([
  "ELOGIN",
  "ENOTOPEN",
  "EINSTLOOKUP",
]);
const DRIVER_CODE = /^E[A-Z]+$/;
const INT_MIN = -2_147_483_648;
const INT_MAX = 2_147_483_647;

/**
 * The Query layer for the SQL Server database that `config` names. It connects on first use, and
 * again on the next use after a failed connection, so the core runs while the database is down
 * and recovers when it returns. Production settings keep `encrypt: true`.
 */
export function createTsqlQueryLayer(
  config: MssqlConfig,
  options: QueryLayerOptions,
): QueryLayer {
  return new QueryLayer(new TsqlDriver(config), options);
}

/** Sorts an mssql failure: by the server's error number when it sent one, else by the driver's code. */
export function classifyTsqlError(error: unknown): DriverFailure {
  const { number, code } = errorFields(error);
  if (number !== undefined) {
    return {
      failureClass: numberClass(number),
      label: `SQL Server error ${String(number)}`,
    };
  }
  if (code === undefined || !DRIVER_CODE.test(code)) {
    return { failureClass: "statement", label: "SQL Server driver error" };
  }
  return { failureClass: codeClass(code), label: `SQL Server driver ${code}` };
}

/**
 * Adds one parameter with an explicit type. A plain `Uint8Array` would otherwise be sent as text,
 * and a null as `NVARCHAR`, which SQL Server refuses to put in a `VARBINARY` column (error 257);
 * a null typed `VARBINARY` converts into every column type the schema uses.
 */
export function bindParameter(
  request: Request,
  name: string,
  value: SqlValue,
): void {
  if (value === null) {
    request.input(name, mssql.VarBinary, null);
  } else if (typeof value === "string") {
    request.input(name, mssql.NVarChar, value);
  } else if (typeof value === "number") {
    request.input(name, numberType(value), value);
  } else {
    request.input(
      name,
      mssql.VarBinary,
      Buffer.from(value.buffer, value.byteOffset, value.byteLength),
    );
  }
}

/**
 * One row as the layer carries it: a `BIGINT` (which mssql returns as text) becomes a number, a
 * `BIT` becomes 0 or 1, and bytes become a plain `Uint8Array`. Any other value type is refused.
 */
export function normalizeTsqlRow(
  row: Readonly<Record<string, unknown>>,
  columns: Readonly<Record<string, Pick<IColumnMetadata[string], "type">>>,
): SqlRow {
  const normalized: Record<string, SqlValue> = {};
  for (const [column, value] of Object.entries(row)) {
    normalized[column] = normalizeValue(value, columns[column]?.type);
  }
  return normalized;
}

function normalizeValue(value: unknown, type: unknown): SqlValue {
  if (value === null || typeof value === "number") {
    return value;
  }
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  if (typeof value === "string") {
    return type === mssql.BigInt ? safeInteger(value) : value;
  }
  if (value instanceof Uint8Array) {
    return new Uint8Array(value);
  }
  throw new QueryLayerError(
    "statement_failed",
    "SQL Server returned a value of a type the Query layer does not carry.",
  );
}

function safeInteger(text: string): number {
  const value = Number(text);
  if (!Number.isSafeInteger(value)) {
    throw new QueryLayerError(
      "statement_failed",
      "SQL Server returned an integer beyond the safe range.",
    );
  }
  return value;
}

function numberType(value: number): typeof mssql.Int {
  if (!Number.isInteger(value)) {
    return mssql.Float;
  }
  return value < INT_MIN || value > INT_MAX ? mssql.BigInt : mssql.Int;
}

function numberClass(number: number): FailureClass {
  if (RETRYABLE_NUMBERS.has(number)) {
    return "retryable";
  }
  if (LOST_NUMBERS.has(number)) {
    return "lost";
  }
  if (CONSTRAINT_NUMBERS.has(number)) {
    return "constraint";
  }
  return UNAVAILABLE_NUMBERS.has(number) ? "unavailable" : "statement";
}

function codeClass(code: string): FailureClass {
  if (LOST_CODES.has(code)) {
    return "lost";
  }
  return UNAVAILABLE_CODES.has(code) ? "unavailable" : "statement";
}

interface ErrorFields {
  readonly number?: number;
  readonly code?: string;
}

// A connection error raised while a request runs reaches the caller wrapped: mssql 12.7.13 makes a
// RequestError with the code EREQUEST and no number, and keeps the connection's error, with its
// code, at `originalError.info`. Only that shape is unwrapped; a server error keeps its number.
function errorFields(error: unknown): ErrorFields {
  const fields = ownFields(error);
  if (fields.number !== undefined || fields.code !== "EREQUEST") {
    return fields;
  }
  const { code } = ownFields(
    property(property(error, "originalError"), "info"),
  );
  return code === undefined ? fields : { code };
}

function ownFields(error: unknown): ErrorFields {
  const number = property(error, "number");
  const code = property(error, "code");
  return {
    ...(typeof number === "number" ? { number } : {}),
    ...(typeof code === "string" ? { code } : {}),
  };
}

function property(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

/** A pool of connections to one SQL Server database, opened on first use. */
class TsqlDriver implements SqlDriver {
  readonly dialect = "tsql";
  readonly serial = false;
  readonly #config: MssqlConfig;
  #pool: Promise<ConnectionPool> | undefined;

  constructor(config: MssqlConfig) {
    this.#config = config;
  }

  async execute(
    statement: SqlStatement,
    mode: ResultMode,
    signal: AbortSignal,
  ): Promise<StatementResult> {
    const pool = await this.#connected(signal);
    return query(pool.request(), statement, mode, signal);
  }

  // Waiting for a connection or for BEGIN stops at the caller's abort. The begin itself goes on;
  // if it then succeeds, the rollback gives its connection back to the pool.
  async begin(signal: AbortSignal): Promise<DriverTransaction> {
    const pool = await this.#connected(signal);
    const transaction = new mssql.Transaction(pool);
    const beginning = transaction.begin();
    try {
      await untilAborted(beginning, signal);
    } catch (error) {
      if (signal.aborted) {
        void beginning
          .then(() => transaction.rollback())
          .catch(() => undefined);
      }
      throw error;
    }
    return new TsqlTransaction(transaction);
  }

  classify(error: unknown): DriverFailure {
    return classifyTsqlError(error);
  }

  async close(): Promise<void> {
    const pending = this.#pool;
    this.#pool = undefined;
    const pool = await pending?.catch(() => undefined);
    await pool?.close();
  }

  // Every caller shares one connection attempt; a failed attempt is forgotten, so the next call
  // tries again.
  #connected(signal: AbortSignal): Promise<ConnectionPool> {
    this.#pool ??= this.#connect();
    return untilAborted(this.#pool, signal);
  }

  #connect(): Promise<ConnectionPool> {
    const pool = new mssql.ConnectionPool(this.#config);
    pool.on("error", ignorePoolError);
    const connecting: Promise<ConnectionPool> = pool
      .connect()
      .catch(async (error: unknown) => {
        if (this.#pool === connecting) {
          this.#pool = undefined;
        }
        await pool.close().catch(() => undefined);
        throw error;
      });
    return connecting;
  }
}

// mssql raises some connection errors as an "error" event on the pool, and Node ends the process
// on an "error" event that nothing listens for. The same failure reaches the caller through its
// request or its next connection, so the listener only keeps the process running.
function ignorePoolError(): void {
  // Reported to the caller elsewhere.
}

/** One mssql transaction; the layer runs its statements one at a time. */
class TsqlTransaction implements DriverTransaction {
  readonly #transaction: Transaction;

  constructor(transaction: Transaction) {
    this.#transaction = transaction;
  }

  execute(
    statement: SqlStatement,
    mode: ResultMode,
    signal: AbortSignal,
  ): Promise<StatementResult> {
    return query(new mssql.Request(this.#transaction), statement, mode, signal);
  }

  async commit(): Promise<void> {
    await this.#transaction.commit();
  }

  async rollback(): Promise<void> {
    await this.#transaction.rollback();
  }
}

// The caller's abort cancels the request; the request still settles (with ECANCEL) before this
// returns, so a rollback never meets a request in progress and no rejection goes unobserved.
async function query(
  request: Request,
  statement: SqlStatement,
  mode: ResultMode,
  signal: AbortSignal,
): Promise<StatementResult> {
  for (const [name, value] of Object.entries(statement.params)) {
    bindParameter(request, name, value);
  }
  signal.throwIfAborted();
  const onAbort = (): void => {
    request.cancel();
  };
  signal.addEventListener("abort", onAbort, { once: true });
  let result: IResult<Record<string, unknown>>;
  try {
    result = await request.query<Record<string, unknown>>(statement.sql);
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
  const changes = result.rowsAffected.reduce((sum, count) => sum + count, 0);
  // mssql's types promise a record set, but a statement that returns no rows leaves it out.
  const recordset = result.recordset as
    IRecordSet<Record<string, unknown>> | undefined;
  if (mode === "changes" || recordset === undefined) {
    return { rows: [], changes };
  }
  const columns = recordset.columns;
  return {
    rows: recordset.map((row) => normalizeTsqlRow(row, columns)),
    changes,
  };
}
