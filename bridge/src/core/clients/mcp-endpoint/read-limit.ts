// The read rate limit (T025; FR-026, SC6): each agent may make so many read tool calls in any hour,
// 600 by default (Config's `readsPerHour`). The counts live in memory and start again when the core
// restarts. A call over the limit is refused with the seconds until the agent's oldest read in the
// hour leaves it, and a refused call does not count, so an agent that keeps asking is not locked
// out for longer.
import type { Clock } from "../../../utilities/clock/index.ts";

const HOUR_MS = 3_600_000;
const MS_PER_SECOND = 1000;

/** Whether a read may go ahead now, or in how many seconds one may. */
export type ReadAllowance =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly retryAfterS: number };

/** Each agent's reads in the last hour. One per core process. */
export class ReadLimit {
  readonly #perHour: number;
  readonly #clock: Clock;
  readonly #reads = new Map<string, number[]>();

  constructor(perHour: number, clock: Clock) {
    if (!Number.isInteger(perHour) || perHour < 1) {
      throw new RangeError("The read limit is a whole number, 1 or more.");
    }
    this.#perHour = perHour;
    this.#clock = clock;
  }

  /** How many reads an agent may make in an hour. */
  get perHour(): number {
    return this.#perHour;
  }

  /** Counts a read by `client` now, if its limit allows one. */
  take(client: string): ReadAllowance {
    const now = this.#clock.now();
    const recent = (this.#reads.get(client) ?? []).filter(
      (at) => at > now - HOUR_MS,
    );
    this.#reads.set(client, recent);
    const [oldest] = recent;
    if (recent.length >= this.#perHour && oldest !== undefined) {
      return {
        allowed: false,
        retryAfterS: Math.max(
          1,
          Math.ceil((oldest + HOUR_MS - now) / MS_PER_SECOND),
        ),
      };
    }
    recent.push(now);
    return { allowed: true };
  }
}
