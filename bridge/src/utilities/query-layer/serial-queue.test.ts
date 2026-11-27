import { describe, expect, it } from "vitest";
import { SerialQueue } from "./serial-queue.ts";
import { untilAborted } from "./until-aborted.ts";

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

describe("SerialQueue", () => {
  it("runs jobs one at a time, in the order they arrive, past a job that fails", async () => {
    const queue = new SerialQueue();
    const order: string[] = [];
    const first = gate();

    const a = queue.run(async () => {
      order.push("a starts");
      await first.promise;
      order.push("a ends");
      throw new Error("a failed");
    }, never());
    const b = queue.run(() => {
      order.push("b");
      return Promise.resolve("b done");
    }, never());
    first.open();

    await expect(a).rejects.toThrow("a failed");
    await expect(b).resolves.toBe("b done");
    expect(order).toEqual(["a starts", "a ends", "b"]);
  });

  it("lets a waiting caller give up without letting the next job overtake the running one", async () => {
    const queue = new SerialQueue();
    const order: string[] = [];
    const first = gate();
    const controller = new AbortController();
    const reason = new Error("caller gone");

    const a = queue.run(async () => {
      await first.promise;
      order.push("a");
    }, never());
    const b = queue.run(() => {
      order.push("b");
      return Promise.resolve();
    }, controller.signal);
    const c = queue.run(() => {
      order.push("c");
      return Promise.resolve();
    }, never());
    controller.abort(reason);

    await expect(b).rejects.toBe(reason);
    expect(order).toEqual([]);
    first.open();
    await Promise.all([a, c]);
    expect(order).toEqual(["a", "c"]);
  });

  it("refuses at once when the signal has already aborted", async () => {
    const queue = new SerialQueue();
    const controller = new AbortController();
    controller.abort(new Error("gone"));

    await expect(
      queue.run(() => Promise.resolve(), controller.signal),
    ).rejects.toThrow("gone");
  });
});

describe("untilAborted", () => {
  it("settles with the work, or with the abort, whichever comes first", async () => {
    await expect(untilAborted(Promise.resolve(3), never())).resolves.toBe(3);

    const controller = new AbortController();
    const reason = new Error("caller gone");
    const waiting = untilAborted(
      new Promise(() => undefined),
      controller.signal,
    );
    controller.abort(reason);
    await expect(waiting).rejects.toBe(reason);
  });

  it("observes the work's later failure after the caller has gone", async () => {
    const unobserved: unknown[] = [];
    const record = (reason: unknown): void => {
      unobserved.push(reason);
    };
    process.on("unhandledRejection", record);
    try {
      const controller = new AbortController();
      controller.abort(new Error("gone"));
      const work = Promise.reject(new Error("work failed"));

      await expect(untilAborted(work, controller.signal)).rejects.toThrow(
        "gone",
      );
      await new Promise((resolve) => setImmediate(resolve));

      expect(unobserved).toEqual([]);
    } finally {
      process.off("unhandledRejection", record);
    }
  });
});
