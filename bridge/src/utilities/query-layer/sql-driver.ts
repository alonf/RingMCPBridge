// What each dialect gives the shared Query layer logic. Two implementations: sqlite.ts and tsql.ts.
import { QueryLayerError } from "./query-layer-error.ts";
import type { SqlDialect, SqlRow, SqlStatement } from "./sql-types.ts";

/**
 * How a driver failure is sorted:
 * - `retryable`: the database says the work did not take effect and the cause passes (a deadlock
 *   victim, a busy or reconfiguring server, a locked SQLite file). Safe to run again.
 * - `lost`: the connection broke or timed out. Inside a transaction, before commit, the work did
 *   not take effect, so it is safe to run again; for a single statement the outcome is unknown.
 * - `unavailable`: the database cannot take work now (a failed login, a full disk, a file that
 *   cannot be opened). Running it again at once would not help.
 * - `constraint`: a key, unique, foreign-key, check or not-null rule refused a write.
 * - `statement`: anything else; the statement itself is wrong, or the database cannot run it.
 */
export type FailureClass =
  "retryable" | "lost" | "unavailable" | "constraint" | "statement";

/** A sorted driver failure, with a label safe to log: an error number or a driver code. */
export interface DriverFailure {
  readonly failureClass: FailureClass;
  readonly label: string;
}

/** What the caller wants back: the rows (`all`, `get`) or the number of rows changed (`run`). */
export type ResultMode = "rows" | "changes";

/** What one statement returned. A driver may leave out the part the caller did not ask for. */
export interface StatementResult {
  readonly rows: readonly SqlRow[];
  readonly changes: number;
}

/** One open transaction on one connection. */
export interface DriverTransaction {
  execute(
    statement: SqlStatement,
    mode: ResultMode,
    signal: AbortSignal,
  ): Promise<StatementResult>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

/** One database, as the shared layer logic sees it. */
export interface SqlDriver {
  readonly dialect: SqlDialect;
  /**
   * True when the driver has one connection (SQLite): the layer then runs one unit of work at a
   * time, so a statement never lands inside another caller's transaction.
   */
  readonly serial: boolean;
  /** Runs one statement outside a transaction. */
  execute(
    statement: SqlStatement,
    mode: ResultMode,
    signal: AbortSignal,
  ): Promise<StatementResult>;
  begin(signal: AbortSignal): Promise<DriverTransaction>;
  classify(error: unknown): DriverFailure;
  close(): Promise<void>;
}

/** The layer error for a sorted driver failure, with the driver's error as its cause. */
export function failureError(
  failure: DriverFailure,
  cause: unknown,
): QueryLayerError {
  const options = { cause, transient: isPassing(failure.failureClass) };
  switch (failure.failureClass) {
    case "retryable":
    case "lost":
    case "unavailable":
      return new QueryLayerError(
        "store_down",
        `The database could not take the work (${failure.label}).`,
        options,
      );
    case "constraint":
      return new QueryLayerError(
        "constraint_violated",
        `The database refused the write under a key or constraint rule (${failure.label}).`,
        options,
      );
    case "statement":
      return new QueryLayerError(
        "statement_failed",
        `The database refused the statement (${failure.label}).`,
        options,
      );
  }
}

function isPassing(failureClass: FailureClass): boolean {
  return failureClass === "retryable" || failureClass === "lost";
}
