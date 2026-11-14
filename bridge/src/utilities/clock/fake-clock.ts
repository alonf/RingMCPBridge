// The fake clock: time moves only when a test or the scenario engine calls `advance`.
import { sleepOn } from "./clock.ts";
import type { Cancel, Clock } from "./clock.ts";
import { ClockError } from "./clock-error.ts";

interface FakeTimer {
  readonly id: number;
  dueAt: number;
  readonly intervalMs: number | undefined;
  readonly callback: () => void;
}

/** Lets promise callbacks and anything they schedule run before the next timer fires. */
function settle(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

/**
 * A clock that stands still until `advance` moves it. Due timers fire in time order (ties in the
 * order they were scheduled), each with `now()` set to its due time.
 */
export class FakeClock implements Clock {
  #now: number;
  #nextId = 1;
  readonly #timers = new Map<number, FakeTimer>();

  constructor(startAt: number) {
    this.#now = startAt;
  }

  now(): number {
    return this.#now;
  }

  sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return sleepOn(
      (delay, callback) => this.schedule(delay, callback),
      ms,
      signal,
    );
  }

  schedule(ms: number, callback: () => void): Cancel {
    return this.#add(Math.max(0, ms), undefined, callback);
  }

  every(ms: number, callback: () => void): Cancel {
    if (!(ms > 0)) {
      throw new ClockError(
        "invalid_interval",
        "An interval must be longer than 0 ms.",
      );
    }
    return this.#add(ms, ms, callback);
  }

  /** How many timers are waiting. */
  get pendingTimers(): number {
    return this.#timers.size;
  }

  /** Moves time forward by `ms`, firing every timer that falls due on the way. */
  async advance(ms: number): Promise<void> {
    const target = this.#now + Math.max(0, ms);
    await settle();
    for (
      let timer = this.#nextDue(target);
      timer;
      timer = this.#nextDue(target)
    ) {
      this.#now = timer.dueAt;
      this.#reschedule(timer);
      timer.callback();
      await settle();
    }
    this.#now = target;
  }

  #add(
    delayMs: number,
    intervalMs: number | undefined,
    callback: () => void,
  ): Cancel {
    const id = this.#nextId++;
    this.#timers.set(id, {
      id,
      dueAt: this.#now + delayMs,
      intervalMs,
      callback,
    });
    return () => {
      this.#timers.delete(id);
    };
  }

  #nextDue(target: number): FakeTimer | undefined {
    let next: FakeTimer | undefined;
    for (const timer of this.#timers.values()) {
      const isEarlier =
        next === undefined ||
        timer.dueAt < next.dueAt ||
        (timer.dueAt === next.dueAt && timer.id < next.id);
      if (timer.dueAt <= target && isEarlier) {
        next = timer;
      }
    }
    return next;
  }

  #reschedule(timer: FakeTimer): void {
    if (timer.intervalMs === undefined) {
      this.#timers.delete(timer.id);
    } else {
      timer.dueAt += timer.intervalMs;
    }
  }
}
