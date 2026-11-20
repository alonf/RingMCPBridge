// One job at a time, in the order they arrive (L2: a queue where order matters, no locks).
import { untilAborted } from "./until-aborted.ts";

/** Runs jobs one after another. A caller that gives up while waiting never blocks the jobs after it. */
export class SerialQueue {
  #tail: Promise<void> = Promise.resolve();

  /**
   * Runs `job` after every job queued before it has settled. Rejects with the signal's reason if
   * the signal aborts while the job is still waiting; a job that has started runs to its end.
   */
  async run<T>(job: () => Promise<T>, signal: AbortSignal): Promise<T> {
    signal.throwIfAborted();
    const previous = this.#tail;
    let release = (): void => undefined;
    this.#tail = new Promise((resolve) => {
      release = resolve;
    });
    try {
      await untilAborted(previous, signal);
      signal.throwIfAborted();
      return await job();
    } finally {
      // The next job starts only once the one before this one has settled, even if this caller
      // gave up while waiting.
      void previous.then(release);
    }
  }

  /** Resolves once every job queued so far has settled. */
  idle(): Promise<void> {
    return this.#tail;
  }
}
