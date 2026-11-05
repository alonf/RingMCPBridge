// The Query layer (R21, CP-03): units of work over one SQL driver, with one retry on a passing
// failure (OR5), the store-down error, and one unit at a time on a single-connection driver.
import { AsyncLocalStorage } from "node:async_hooks";
import type { Clock } from "../clock/index.ts";
import { checkStatement } from "./parameters.ts";
import { QueryLayerError } from "./query-layer-error.ts";
import { SerialQueue } from "./serial-queue.ts";
import { failureError } from "./sql-driver.ts";
import type {
  DriverTransaction,
  FailureClass,
  ResultMode,
  SqlDriver,
  StatementResult,
} from "./sql-driver.ts";
import type {
  SqlDialect,
  SqlRow,
  SqlSession,
  SqlStatement,
} from "./sql-types.ts";

/**
 * The pause before the one retry. A retry mostly helps a deadlock victim or a locked SQLite file,
 * which clear within milliseconds. Microsoft suggests 5 s before reconnecting to Azure SQL after a
 * failover, but a reconfiguration that long is better met by the connector's resend after 10 s and
 * by `BRIDGE_UNAVAILABLE`, which callers may retry, than by holding a request past the 0.5 s target.
 */
export const RETRY_PAUSE_MS = 250;

/** What a Query layer needs besides its driver. */
export interface QueryLayerOptions {
  readonly clock: Clock;
  /** The pause before the one retry; `RETRY_PAUSE_MS` when left out. */
  readonly retryPauseMs?: number;
}

/** Marks the work of one transaction, so the layer can refuse calls made from inside it. */
interface TransactionScope {
  open: boolean;
}

type Attempt<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: unknown; readonly retry: boolean };

/**
 * The bridge's way to its database. Each `all`, `get` and `run` is its own unit of work;
 * `transaction` runs several statements as one. A unit of work that hits a passing failure gets
 * one retry when running it again is safe; otherwise it fails with `store_down`. A caller's abort
 * passes through unchanged and is never retried.
 */
export class QueryLayer implements SqlSession {
  readonly #driver: SqlDriver;
  readonly #clock: Clock;
  readonly #retryPauseMs: number;
  readonly #queue = new SerialQueue();
  readonly #scope = new AsyncLocalStorage<TransactionScope>();
  #closed = false;

  constructor(driver: SqlDriver, options: QueryLayerOptions) {
    this.#driver = driver;
    this.#clock = options.clock;
    this.#retryPauseMs = options.retryPauseMs ?? RETRY_PAUSE_MS;
  }

  get dialect(): SqlDialect {
    return this.#driver.dialect;
  }

  async all(
    statement: SqlStatement,
    signal: AbortSignal,
  ): Promise<readonly SqlRow[]> {
    return (await this.#statement(statement, "rows", signal)).rows;
  }

  async get(
    statement: SqlStatement,
    signal: AbortSignal,
  ): Promise<SqlRow | undefined> {
    return (await this.#statement(statement, "rows", signal)).rows[0];
  }

  async run(statement: SqlStatement, signal: AbortSignal): Promise<number> {
    return (await this.#statement(statement, "changes", signal)).changes;
  }

  /**
   * Runs `work` in one transaction: commits when it resolves, rolls back when it throws, and
   * rethrows what it threw. `work` uses only the session it is given. It may run twice: once more
   * after a passing failure before the commit. A failure during the commit is never retried,
   * because the work may already have taken effect.
   */
  async transaction<T>(
    work: (session: SqlSession) => Promise<T>,
    signal: AbortSignal,
  ): Promise<T> {
    this.#refuseUnusable(signal);
    const first = await this.#exclusive(
      () => this.#attemptTransaction(work, signal),
      signal,
    );
    if (first.ok) {
      return first.value;
    }
    if (!first.retry) {
      throw first.error;
    }
    await this.#clock.sleep(this.#retryPauseMs, signal);
    this.#refuseUnusable(signal);
    const second = await this.#exclusive(
      () => this.#attemptTransaction(work, signal),
      signal,
    );
    if (second.ok) {
      return second.value;
    }
    throw second.error;
  }

  /** Refuses new work, lets the work already queued finish, then closes the connection. */
  async close(): Promise<void> {
    if (this.#closed) {
      return;
    }
    this.#closed = true;
    await this.#exclusive(
      () => this.#driver.close(),
      new AbortController().signal,
    );
  }

  async #statement(
    statement: SqlStatement,
    mode: ResultMode,
    signal: AbortSignal,
  ): Promise<StatementResult> {
    this.#refuseUnusable(signal);
    checkStatement(statement);
    const first = await this.#exclusive(
      () => this.#attemptStatement(statement, mode, signal),
      signal,
    );
    if (first.ok) {
      return first.value;
    }
    if (!first.retry) {
      throw first.error;
    }
    await this.#clock.sleep(this.#retryPauseMs, signal);
    this.#refuseUnusable(signal);
    const second = await this.#exclusive(
      () => this.#attemptStatement(statement, mode, signal),
      signal,
    );
    if (second.ok) {
      return second.value;
    }
    throw second.error;
  }

  // A lost connection leaves a single statement's outcome unknown, so only a failure the database
  // reports as not taken effect is retried here.
  async #attemptStatement(
    statement: SqlStatement,
    mode: ResultMode,
    signal: AbortSignal,
  ): Promise<Attempt<StatementResult>> {
    try {
      const value = await this.#driver.execute(statement, mode, signal);
      return { ok: true, value };
    } catch (error) {
      signal.throwIfAborted();
      return failedAttempt(this.#driver, error, ["retryable"]);
    }
  }

  async #attemptTransaction<T>(
    work: (session: SqlSession) => Promise<T>,
    signal: AbortSignal,
  ): Promise<Attempt<T>> {
    let transaction: DriverTransaction;
    try {
      transaction = await this.#driver.begin(signal);
    } catch (error) {
      signal.throwIfAborted();
      // Before the work starts nothing has taken effect, so any passing failure may be retried.
      return failedAttempt(this.#driver, error, ["retryable", "lost"]);
    }
    const scope: TransactionScope = { open: true };
    const session = new TransactionSession(this.#driver, transaction);
    try {
      const value = await this.#scope.run(scope, () => work(session));
      await session.finish();
      signal.throwIfAborted();
      return await this.#commit(transaction, value);
    } catch (error) {
      // The work can fail while statements it started are still queued or running; they must
      // settle before the rollback, or one could run after it, outside any transaction.
      await session.finish();
      await rollbackQuietly(transaction);
      return {
        ok: false,
        error,
        retry:
          error instanceof QueryLayerError &&
          error.transient &&
          !signal.aborted,
      };
    } finally {
      scope.open = false;
    }
  }

  async #commit<T>(
    transaction: DriverTransaction,
    value: T,
  ): Promise<Attempt<T>> {
    try {
      await transaction.commit();
      return { ok: true, value };
    } catch (error) {
      await rollbackQuietly(transaction);
      return failedAttempt(this.#driver, error, []);
    }
  }

  #exclusive<T>(job: () => Promise<T>, signal: AbortSignal): Promise<T> {
    return this.#driver.serial ? this.#queue.run(job, signal) : job();
  }

  #refuseUnusable(signal: AbortSignal): void {
    signal.throwIfAborted();
    if (this.#closed) {
      throw new QueryLayerError("store_down", "The database is closed.");
    }
    if (this.#scope.getStore()?.open === true) {
      throw new QueryLayerError(
        "statement_failed",
        "A transaction's work called the Query layer itself; it must use the session it was given.",
      );
    }
  }
}

/** The session a transaction hands its work: its statements run one at a time, in order. */
class TransactionSession implements SqlSession {
  readonly #driver: SqlDriver;
  readonly #transaction: DriverTransaction;
  readonly #queue = new SerialQueue();
  #ended = false;

  constructor(driver: SqlDriver, transaction: DriverTransaction) {
    this.#driver = driver;
    this.#transaction = transaction;
  }

  get dialect(): SqlDialect {
    return this.#driver.dialect;
  }

  async all(
    statement: SqlStatement,
    signal: AbortSignal,
  ): Promise<readonly SqlRow[]> {
    return (await this.#execute(statement, "rows", signal)).rows;
  }

  async get(
    statement: SqlStatement,
    signal: AbortSignal,
  ): Promise<SqlRow | undefined> {
    return (await this.#execute(statement, "rows", signal)).rows[0];
  }

  async run(statement: SqlStatement, signal: AbortSignal): Promise<number> {
    return (await this.#execute(statement, "changes", signal)).changes;
  }

  /**
   * Refuses new statements and those still waiting, and resolves once the one running has settled,
   * so the commit or rollback never meets a statement in progress.
   */
  async finish(): Promise<void> {
    this.#ended = true;
    await this.#queue.idle();
  }

  async #execute(
    statement: SqlStatement,
    mode: ResultMode,
    signal: AbortSignal,
  ): Promise<StatementResult> {
    this.#refuseEnded();
    checkStatement(statement);
    return this.#queue.run(async () => {
      this.#refuseEnded();
      signal.throwIfAborted();
      try {
        return await this.#transaction.execute(statement, mode, signal);
      } catch (error) {
        signal.throwIfAborted();
        throw layerError(this.#driver, error);
      }
    }, signal);
  }

  #refuseEnded(): void {
    if (this.#ended) {
      throw new QueryLayerError(
        "statement_failed",
        "The transaction has already ended; its session cannot run statements.",
      );
    }
  }
}

/** A failed attempt, retried only when its failure is of one of the `retryOn` classes. */
function failedAttempt(
  driver: SqlDriver,
  error: unknown,
  retryOn: readonly FailureClass[],
): Attempt<never> {
  if (error instanceof QueryLayerError) {
    return { ok: false, error, retry: false };
  }
  const failure = driver.classify(error);
  return {
    ok: false,
    error: failureError(failure, error),
    retry: retryOn.includes(failure.failureClass),
  };
}

/** The layer error for a driver failure; an error the layer raised itself passes as it is. */
function layerError(driver: SqlDriver, error: unknown): QueryLayerError {
  return error instanceof QueryLayerError
    ? error
    : failureError(driver.classify(error), error);
}

// The rollback is best effort: the transaction may already be gone (a lost connection, a deadlock
// victim), and its failure must never replace the error that caused it.
async function rollbackQuietly(transaction: DriverTransaction): Promise<void> {
  try {
    await transaction.rollback();
  } catch {
    // Nothing more to undo.
  }
}
