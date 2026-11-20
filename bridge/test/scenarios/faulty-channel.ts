// Link faults for tests (T009): drops, delays and duplicates in front of any message sink, on the
// fake clock. The link (CP-09) puts one in front of its transport in its tests; nothing here knows
// the transport.
import type { Clock } from "../../src/utilities/clock/index.ts";

/** Passes messages to `sink`, except for the drops, delays and duplicates it is told to make. */
export class FaultyChannel<T> {
  readonly #clock: Clock;
  readonly #sink: (message: T) => void;
  #dropsLeft = 0;
  #duplicatesLeft = 0;
  #delayMs = 0;
  #dropped = 0;

  constructor(clock: Clock, sink: (message: T) => void) {
    this.#clock = clock;
    this.#sink = sink;
  }

  /** How many messages were dropped so far. */
  get dropped(): number {
    return this.#dropped;
  }

  /** Drops the next `count` messages. */
  dropNext(count: number): void {
    this.#dropsLeft += count;
  }

  /** Delivers each of the next `count` messages twice. */
  duplicateNext(count: number): void {
    this.#duplicatesLeft += count;
  }

  /** Delivers every later message `ms` late on the clock, until set back to 0. */
  delayBy(ms: number): void {
    this.#delayMs = ms;
  }

  send(message: T): void {
    if (this.#dropsLeft > 0) {
      this.#dropsLeft -= 1;
      this.#dropped += 1;
      return;
    }
    this.#deliver(message);
    if (this.#duplicatesLeft > 0) {
      this.#duplicatesLeft -= 1;
      this.#deliver(message);
    }
  }

  #deliver(message: T): void {
    if (this.#delayMs === 0) {
      this.#sink(message);
      return;
    }
    this.#clock.schedule(this.#delayMs, () => {
      this.#sink(message);
    });
  }
}
