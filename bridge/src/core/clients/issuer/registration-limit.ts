// The Issuer's limit on new registrations (CP-17's review; the security design's T11): so many in
// any hour, across the Issuer: Config's `registrationsPerHour`, 10 by default. Registration needs no
// token, so the limit is not per agent: whoever reaches it first uses it up, and a listed agent that
// registers itself waits for the hour to pass. Linked agents and agents with a metadata document are
// not affected. The count lives in memory and starts again when the core restarts.
import type { Clock } from "../../../utilities/clock/index.ts";

const HOUR_MS = 3_600_000;

/** The registrations of the last hour. One per Issuer. */
export class RegistrationLimit {
  readonly #perHour: number;
  readonly #clock: Clock;
  #recent: number[] = [];

  constructor(perHour: number, clock: Clock) {
    if (!Number.isInteger(perHour) || perHour < 1) {
      throw new RangeError(
        "The registration limit is a whole number, 1 or more.",
      );
    }
    this.#perHour = perHour;
    this.#clock = clock;
  }

  /** How many registrations the Issuer accepts in an hour. */
  get perHour(): number {
    return this.#perHour;
  }

  /** Counts a registration now, if the limit allows one. A refused one does not count. */
  take(): boolean {
    const now = this.#clock.now();
    this.#recent = this.#recent.filter((at) => at > now - HOUR_MS);
    if (this.#recent.length >= this.#perHour) {
      return false;
    }
    this.#recent.push(now);
    return true;
  }
}
