import { describe, expect, it, vi } from "vitest";
import { FakeClock } from "../clock/index.ts";
import { QueryLayer, QueryLayerError, RETRY_PAUSE_MS } from "./index.ts";
import type { SqlSession, SqlStatement } from "./index.ts";
import type {
  DriverFailure,
  DriverTransaction,
  FailureClass,
  SqlDriver,
  StatementResult,
} from "./sql-driver.ts";

type Step =
  "execute" | "begin" | "tx-execute" | "commit" | "rollback" | "close";

class FakeFailure extends Error {
  readonly fakeClass: FailureClass;

  constructor(fakeClass: FailureClass) {
    super(`fake ${fakeClass} failure`);
    this.fakeClass = fakeClass;
  }
}

function failure(fakeClass: FailureClass): FakeFailure {
  return new FakeFailure(fakeClass);
}

/** A driver whose steps succeed unless a test plans otherwise, and which logs every step. */
class FakeDriver implements SqlDriver {
  readonly dialect = "sqlite";
  readonly serial: boolean;
  readonly calls: Step[] = [];
  readonly #plans = new Map<Step, (() => Promise<void>)[]>();

  constructor(serial: boolean) {
    this.serial = serial;
  }

  fail(step: Step, ...errors: Error[]): void {
    for (const error of errors) {
      this.#plan(step, () => Promise.reject(error));
    }
  }

  hold(step: Step, gate: Promise<void>): void {
    this.#plan(step, () => gate);
  }

  async execute(statement: SqlStatement): Promise<StatementResult> {
    await this.#step("execute");
    return { rows: [{ sql: statement.sql }], changes: 1 };
  }

  async begin(): Promise<DriverTransaction> {
    await this.#step("begin");
    return {
      execute: async (statement) => {
        await this.#step("tx-execute");
        return { rows: [{ sql: statement.sql }], changes: 1 };
      },
      commit: () => this.#step("commit"),
      rollback: () => this.#step("rollback"),
    };
  }

  classify(error: unknown): DriverFailure {
    return {
      failureClass: (error as FakeFailure).fakeClass,
      label: "fake error 7",
    };
  }

  close(): Promise<void> {
    return this.#step("close");
  }

  #plan(step: Step, behaviour: () => Promise<void>): void {
    const plans = this.#plans.get(step) ?? [];
    plans.push(behaviour);
    this.#plans.set(step, plans);
  }

  async #step(step: Step): Promise<void> {
    this.calls.push(step);
    await this.#plans.get(step)?.shift()?.();
  }
}

function setUp(serial = false): {
  driver: FakeDriver;
  clock: FakeClock;
  layer: QueryLayer;
} {
  const driver = new FakeDriver(serial);
  const clock = new FakeClock(0);
  return { driver, clock, layer: new QueryLayer(driver, { clock }) };
}

function statement(sql = "SELECT 1"): SqlStatement {
  return { sql, params: {} };
}

function never(): AbortSignal {
  return new AbortController().signal;
}

function gate(): { promise: Promise<void>; open: () => void } {
  let open = (): void => undefined;
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open };
}

async function passRetryPause(clock: FakeClock): Promise<void> {
  await vi.waitFor(() => {
    expect(clock.pendingTimers).toBe(1);
  });
  await clock.advance(RETRY_PAUSE_MS);
}

function rejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error("expected a rejection");
    },
    (error: unknown) => error,
  );
}

describe("QueryLayer single statements", () => {
  it("returns the rows, the first row and the change count", async () => {
    const { layer } = setUp();

    await expect(layer.all(statement(), never())).resolves.toEqual([
      { sql: "SELECT 1" },
    ]);
    await expect(layer.get(statement(), never())).resolves.toEqual({
      sql: "SELECT 1",
    });
    await expect(layer.run(statement(), never())).resolves.toBe(1);
    expect(layer.dialect).toBe("sqlite");
  });

  it("retries once, after the pause, when the database says the statement did not take effect", async () => {
    const { driver, clock, layer } = setUp();
    driver.fail("execute", failure("retryable"));

    const result = layer.run(statement(), never());
    await passRetryPause(clock);

    await expect(result).resolves.toBe(1);
    expect(driver.calls).toEqual(["execute", "execute"]);
  });

  it("fails with a transient store_down when the retry fails the same way", async () => {
    const { driver, clock, layer } = setUp();
    const second = failure("retryable");
    driver.fail("execute", failure("retryable"), second);

    const result = rejection(layer.run(statement(), never()));
    await passRetryPause(clock);
    const error = await result;

    expect(error).toBeInstanceOf(QueryLayerError);
    expect(error).toMatchObject({
      kind: "store_down",
      transient: true,
      cause: second,
    });
    expect(driver.calls).toEqual(["execute", "execute"]);
  });

  it("does not retry a single statement whose connection was lost, because it may have taken effect", async () => {
    const { driver, layer } = setUp();
    driver.fail("execute", failure("lost"));

    await expect(layer.run(statement(), never())).rejects.toMatchObject({
      kind: "store_down",
      transient: true,
    });
    expect(driver.calls).toEqual(["execute"]);
  });

  it.each([
    [
      "unavailable",
      "store_down",
      "The database could not take the work (fake error 7).",
    ],
    [
      "constraint",
      "constraint_violated",
      "The database refused the write under a key or constraint rule (fake error 7).",
    ],
    [
      "statement",
      "statement_failed",
      "The database refused the statement (fake error 7).",
    ],
  ] as const)(
    "turns a %s failure into %s at once",
    async (fakeClass, kind, message) => {
      const { driver, layer } = setUp();
      const cause = failure(fakeClass);
      driver.fail("execute", cause);

      await expect(layer.run(statement(), never())).rejects.toMatchObject({
        kind,
        message,
        transient: false,
        cause,
      });
      expect(driver.calls).toEqual(["execute"]);
    },
  );

  it("passes on an error the layer raised itself, without retrying it", async () => {
    const { driver, layer } = setUp();
    const own = new QueryLayerError("statement_failed", "own");
    driver.fail("execute", own);

    await expect(layer.run(statement(), never())).rejects.toBe(own);
    expect(driver.calls).toEqual(["execute"]);
  });

  it("refuses a placeholder without a parameter before the database sees it", async () => {
    const { driver, layer } = setUp();

    await expect(
      layer.run({ sql: "SELECT @missing", params: {} }, never()),
    ).rejects.toMatchObject({ kind: "statement_failed" });
    expect(driver.calls).toEqual([]);
  });

  it("passes on the caller's abort and never runs an aborted statement", async () => {
    const { driver, layer } = setUp();
    const controller = new AbortController();
    const reason = new Error("caller gone");
    controller.abort(reason);

    await expect(layer.run(statement(), controller.signal)).rejects.toBe(
      reason,
    );
    expect(driver.calls).toEqual([]);
  });

  it("passes on an abort that arrives during the statement, without retrying", async () => {
    const { driver, layer } = setUp();
    const controller = new AbortController();
    const reason = new Error("caller gone");
    driver.hold(
      "execute",
      Promise.resolve().then(() => {
        controller.abort(reason);
        throw failure("retryable");
      }),
    );

    await expect(layer.run(statement(), controller.signal)).rejects.toBe(
      reason,
    );
    expect(driver.calls).toEqual(["execute"]);
  });

  it("passes on an abort during the retry pause and does not retry", async () => {
    const { driver, clock, layer } = setUp();
    const controller = new AbortController();
    const reason = new Error("caller gone");
    driver.fail("execute", failure("retryable"));

    const result = rejection(layer.run(statement(), controller.signal));
    await vi.waitFor(() => {
      expect(clock.pendingTimers).toBe(1);
    });
    controller.abort(reason);

    await expect(result).resolves.toBe(reason);
    expect(driver.calls).toEqual(["execute"]);
  });
});

describe("QueryLayer transactions", () => {
  it("runs the work on its session and commits", async () => {
    const { driver, layer } = setUp();

    const value = await layer.transaction(async (session) => {
      await session.run(statement("UPDATE a"), never());
      return session.get(statement("SELECT a"), never());
    }, never());

    expect(value).toEqual({ sql: "SELECT a" });
    expect(driver.calls).toEqual([
      "begin",
      "tx-execute",
      "tx-execute",
      "commit",
    ]);
  });

  it("rolls back and rethrows the work's own error unchanged", async () => {
    const { driver, layer } = setUp();
    const own = new Error("the work failed");

    await expect(
      layer.transaction(() => Promise.reject(own), never()),
    ).rejects.toBe(own);
    expect(driver.calls).toEqual(["begin", "rollback"]);
  });

  it("keeps the original error when the rollback fails too", async () => {
    const { driver, layer } = setUp();
    const own = new Error("the work failed");
    driver.fail("rollback", new Error("rollback failed"));

    await expect(
      layer.transaction(() => Promise.reject(own), never()),
    ).rejects.toBe(own);
  });

  it("runs the whole work again once after a lost connection before the commit", async () => {
    const { driver, clock, layer } = setUp();
    driver.fail("tx-execute", failure("lost"));
    const work = vi.fn((session: SqlSession) =>
      session.run(statement(), never()),
    );

    const result = layer.transaction(work, never());
    await passRetryPause(clock);

    await expect(result).resolves.toBe(1);
    expect(work).toHaveBeenCalledTimes(2);
    expect(driver.calls).toEqual([
      "begin",
      "tx-execute",
      "rollback",
      "begin",
      "tx-execute",
      "commit",
    ]);
  });

  it("retries a passing failure at the start of the transaction", async () => {
    const { driver, clock, layer } = setUp();
    driver.fail("begin", failure("lost"));

    const result = layer.transaction(() => Promise.resolve("done"), never());
    await passRetryPause(clock);

    await expect(result).resolves.toBe("done");
    expect(driver.calls).toEqual(["begin", "begin", "commit"]);
  });

  it("does not retry a failure at the start that is not a passing one", async () => {
    const { driver, layer } = setUp();
    driver.fail("begin", failure("unavailable"));

    await expect(
      layer.transaction(() => Promise.resolve("done"), never()),
    ).rejects.toMatchObject({ kind: "store_down", transient: false });
    expect(driver.calls).toEqual(["begin"]);
  });

  it("never runs the work again after a failure during the commit", async () => {
    const { driver, layer } = setUp();
    driver.fail("commit", failure("lost"));
    const work = vi.fn(() => Promise.resolve("done"));

    await expect(layer.transaction(work, never())).rejects.toMatchObject({
      kind: "store_down",
    });
    expect(work).toHaveBeenCalledTimes(1);
    expect(driver.calls).toEqual(["begin", "commit", "rollback"]);
  });

  it("fails with store_down when the retried work fails the same way", async () => {
    const { driver, clock, layer } = setUp();
    driver.fail("tx-execute", failure("retryable"), failure("retryable"));

    const result = rejection(
      layer.transaction(
        (session) => session.run(statement(), never()),
        never(),
      ),
    );
    await passRetryPause(clock);

    await expect(result).resolves.toMatchObject({
      kind: "store_down",
      transient: true,
    });
    expect(driver.calls.filter((call) => call === "begin")).toHaveLength(2);
  });

  it("does not retry when the work swaps a passing failure for its own error", async () => {
    const { driver, layer } = setUp();
    driver.fail("tx-execute", failure("retryable"));
    const own = new Error("handled differently");

    await expect(
      layer.transaction(async (session) => {
        try {
          await session.run(statement(), never());
        } catch {
          throw own;
        }
      }, never()),
    ).rejects.toBe(own);
    expect(driver.calls).toEqual(["begin", "tx-execute", "rollback"]);
  });

  it("passes on an error the layer raised itself inside a transaction, without retrying it", async () => {
    const { driver, layer } = setUp();
    const own = new QueryLayerError("statement_failed", "own");
    driver.fail("tx-execute", own);

    await expect(
      layer.transaction(
        (session) => session.run(statement(), never()),
        never(),
      ),
    ).rejects.toBe(own);
    expect(driver.calls).toEqual(["begin", "tx-execute", "rollback"]);
  });

  it("passes on the caller's abort during the work, rolls back, and does not retry", async () => {
    const { driver, layer } = setUp();
    const controller = new AbortController();
    const reason = new Error("caller gone");

    await expect(
      layer.transaction(async (session) => {
        controller.abort(reason);
        await session.run(statement(), controller.signal);
      }, controller.signal),
    ).rejects.toBe(reason);
    expect(driver.calls).toEqual(["begin", "rollback"]);
  });

  it("does not commit when the caller aborts after the work has finished", async () => {
    const { driver, layer } = setUp();
    const controller = new AbortController();
    const reason = new Error("caller gone");

    await expect(
      layer.transaction(() => {
        controller.abort(reason);
        return Promise.resolve("done");
      }, controller.signal),
    ).rejects.toBe(reason);
    expect(driver.calls).toEqual(["begin", "rollback"]);
  });

  it("passes on the caller's abort during the start of the transaction", async () => {
    const { driver, layer } = setUp();
    const controller = new AbortController();
    const reason = new Error("caller gone");
    driver.hold(
      "begin",
      Promise.resolve().then(() => {
        controller.abort(reason);
        throw failure("lost");
      }),
    );

    await expect(
      layer.transaction(() => Promise.resolve("done"), controller.signal),
    ).rejects.toBe(reason);
    expect(driver.calls).toEqual(["begin"]);
  });

  it("refuses a call to the layer from inside its own transaction's work", async () => {
    const { layer } = setUp(true);

    await expect(
      layer.transaction(() => layer.run(statement(), never()), never()),
    ).rejects.toMatchObject({ kind: "statement_failed" });
    await expect(
      layer.transaction(
        () => layer.transaction(() => Promise.resolve(1), never()),
        never(),
      ),
    ).rejects.toMatchObject({ kind: "statement_failed" });
  });

  it("lets work started inside a transaction use the layer once the transaction has ended", async () => {
    const { layer } = setUp(true);
    let later: Promise<number> | undefined;

    await layer.transaction(() => {
      later = Promise.resolve().then(async () => {
        await new Promise((resolve) => setImmediate(resolve));
        return layer.run(statement(), never());
      });
      return Promise.resolve();
    }, never());

    await expect(later).resolves.toBe(1);
  });

  it("refuses the session once its transaction has ended", async () => {
    const { layer } = setUp();
    let kept: SqlSession | undefined;

    await layer.transaction((session) => {
      kept = session;
      return Promise.resolve();
    }, never());

    expect(kept?.dialect).toBe("sqlite");
    await expect(kept?.run(statement(), never())).rejects.toMatchObject({
      kind: "statement_failed",
    });
  });

  it("rolls back only after every statement the work started has settled", async () => {
    const { driver, layer } = setUp();
    const running = gate();
    driver.hold("tx-execute", running.promise);
    const own = new Error("the work failed");

    const result = rejection(
      layer.transaction(
        (session) =>
          Promise.all([
            session.run(statement("held"), never()),
            vi
              .waitFor(() => {
                expect(driver.calls).toContain("tx-execute");
              })
              .then(() => {
                throw own;
              }),
          ]),
        never(),
      ),
    );
    await vi.waitFor(() => {
      expect(driver.calls).toEqual(["begin", "tx-execute"]);
    });
    await new Promise((resolve) => setImmediate(resolve));
    expect(driver.calls).toEqual(["begin", "tx-execute"]);
    running.open();

    await expect(result).resolves.toBe(own);
    expect(driver.calls).toEqual(["begin", "tx-execute", "rollback"]);
  });

  it("never runs a statement after the rollback when the work fails before it starts", async () => {
    const { driver, layer } = setUp();
    const own = new Error("the work failed");

    await expect(
      layer.transaction(
        (session) =>
          Promise.all([
            session.run(statement("waits"), never()),
            Promise.reject(own),
          ]),
        never(),
      ),
    ).rejects.toBe(own);
    await new Promise((resolve) => setImmediate(resolve));

    expect(driver.calls).toEqual(["begin", "rollback"]);
  });

  it("rolls back last when one of the statements started together fails", async () => {
    const { driver, layer } = setUp();
    driver.fail("tx-execute", failure("constraint"));

    await expect(
      layer.transaction(
        (session) =>
          Promise.all([
            session.run(statement("fails"), never()),
            session.run(statement("next"), never()),
            session.run(statement("last"), never()),
          ]),
        never(),
      ),
    ).rejects.toMatchObject({ kind: "constraint_violated" });
    await new Promise((resolve) => setImmediate(resolve));

    expect(driver.calls.at(-1)).toBe("rollback");
    expect(driver.calls.filter((call) => call === "rollback")).toHaveLength(1);
  });

  it("commits only after a statement the work left running has settled", async () => {
    const { driver, layer } = setUp();
    const running = gate();
    driver.hold("tx-execute", running.promise);
    let left: Promise<number> | undefined;

    const result = layer.transaction(async (session) => {
      left = session.run(statement("left running"), never());
      await vi.waitFor(() => {
        expect(driver.calls).toContain("tx-execute");
      });
      return "done";
    }, never());
    await vi.waitFor(() => {
      expect(driver.calls).toEqual(["begin", "tx-execute"]);
    });
    await new Promise((resolve) => setImmediate(resolve));
    expect(driver.calls).toEqual(["begin", "tx-execute"]);
    running.open();

    await expect(result).resolves.toBe("done");
    await expect(left).resolves.toBe(1);
    expect(driver.calls).toEqual(["begin", "tx-execute", "commit"]);
  });

  it("runs a transaction's statements one at a time, even when the work starts them together", async () => {
    const { driver, layer } = setUp();
    const first = gate();
    driver.hold("tx-execute", first.promise);

    const result = layer.transaction(
      (session) =>
        Promise.all([
          session.all(statement("one"), never()),
          session.all(statement("two"), never()),
        ]),
      never(),
    );
    await vi.waitFor(() => {
      expect(driver.calls).toEqual(["begin", "tx-execute"]);
    });
    first.open();

    await expect(result).resolves.toEqual([[{ sql: "one" }], [{ sql: "two" }]]);
  });
});

describe("QueryLayer on a single-connection driver", () => {
  it("holds another caller's statement until the open transaction has ended", async () => {
    const { driver, layer } = setUp(true);
    const work = gate();

    const transaction = layer.transaction(() => work.promise, never());
    const outside = layer.run(statement(), never());
    await vi.waitFor(() => {
      expect(driver.calls).toEqual(["begin"]);
    });
    work.open();
    await Promise.all([transaction, outside]);

    expect(driver.calls).toEqual(["begin", "commit", "execute"]);
  });

  it("lets other callers run while a unit of work waits out its retry pause", async () => {
    const { driver, clock, layer } = setUp(true);
    driver.fail("execute", failure("retryable"));

    const retried = layer.run(statement("retried"), never());
    await vi.waitFor(() => {
      expect(clock.pendingTimers).toBe(1);
    });
    await layer.run(statement("other"), never());
    await clock.advance(RETRY_PAUSE_MS);
    await retried;

    expect(driver.calls).toEqual(["execute", "execute", "execute"]);
  });

  it("runs statements of a driver with a connection pool side by side", async () => {
    const { driver, layer } = setUp(false);
    const work = gate();

    const transaction = layer.transaction(() => work.promise, never());
    await layer.run(statement(), never());
    work.open();
    await transaction;

    expect(driver.calls).toEqual(["begin", "execute", "commit"]);
  });
});

describe("QueryLayer.close", () => {
  it("lets queued work finish, closes the driver once, and then refuses work with store_down", async () => {
    const { driver, layer } = setUp(true);
    const work = gate();

    const transaction = layer.transaction(() => work.promise, never());
    const closing = layer.close();
    await vi.waitFor(() => {
      expect(driver.calls).toEqual(["begin"]);
    });
    work.open();
    await Promise.all([transaction, closing, layer.close()]);

    expect(driver.calls).toEqual(["begin", "commit", "close"]);
    await expect(layer.run(statement(), never())).rejects.toMatchObject({
      kind: "store_down",
    });
    await expect(
      layer.transaction(() => Promise.resolve(), never()),
    ).rejects.toMatchObject({ kind: "store_down" });
  });

  it("refuses the retry when the layer closed during the pause", async () => {
    const { driver, clock, layer } = setUp();
    driver.fail("execute", failure("retryable"));

    const result = rejection(layer.run(statement(), never()));
    await vi.waitFor(() => {
      expect(clock.pendingTimers).toBe(1);
    });
    await layer.close();
    await clock.advance(RETRY_PAUSE_MS);

    await expect(result).resolves.toMatchObject({
      kind: "store_down",
      message: "The database is closed.",
    });
    expect(driver.calls).toEqual(["execute", "close"]);
  });

  it("uses the pause it was given", async () => {
    const driver = new FakeDriver(false);
    const clock = new FakeClock(0);
    const layer = new QueryLayer(driver, { clock, retryPauseMs: 10 });
    driver.fail("execute", failure("retryable"));

    const result = layer.run(statement(), never());
    await vi.waitFor(() => {
      expect(clock.pendingTimers).toBe(1);
    });
    await clock.advance(10);

    await expect(result).resolves.toBe(1);
  });
});
