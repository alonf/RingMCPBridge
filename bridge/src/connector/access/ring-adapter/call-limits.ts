// The limits on every outgoing Ring call (FR-026, FR-042, R25; spec Edge Cases "Ring blocks or
// rate-limits the bridge"). One gate is shared by every call the Ring Adapter makes:
//   - one call at a time, each starting at least `spacingMs` after the last, so there is no burst.
//     A call that reaches Ring later than its turn began books the spacing again from then;
//   - after a `ring_unavailable` failure, the next call waits a growing, randomised backoff;
//   - after 5 such failures in a row the circuit opens: calls are refused without reaching Ring,
//     and one probe goes through each minute. A success closes it.
// The circuit is checked when a call reaches the front of the queue, so calls already waiting when
// it opens are refused too. Only `ring_unavailable` counts as a failure: a lost session, an abort
// or any other error neither counts nor keeps a probe slot.
import type { Clock } from "../../../utilities/clock/index.ts";
import { RingAdapterError } from "./ring-adapter-error.ts";

/** How the wait grows after consecutive failures. */
export interface BackoffPolicy {
  readonly initialMs: number;
  readonly capMs: number;
}

/** When the circuit opens and how often it probes. */
export interface CircuitPolicy {
  readonly failureThreshold: number;
  readonly probeIntervalMs: number;
}

/** The gate's settings. */
export interface RingCallLimits {
  /** The least time between the starts of two Ring calls. */
  readonly spacingMs: number;
  readonly backoff: BackoffPolicy;
  readonly circuit: CircuitPolicy;
}

/** The bridge's settings: R25's backoff (2 s doubling to a 60 s cap) and circuit (5, 1 minute). */
export const RING_CALL_LIMITS: RingCallLimits = {
  spacingMs: 1_000,
  backoff: { initialMs: 2_000, capMs: 60_000 },
  circuit: { failureThreshold: 5, probeIntervalMs: 60_000 },
};

const PAUSED_MESSAGE =
  "Ring calls are paused after repeated failures; one try is made each minute.";

/**
 * The wait before the next call after `failures` failures in a row: a random time between half
 * and all of `initialMs × 2^(failures − 1)`, capped at `capMs`. No failures, no wait.
 */
export function backoffDelayMs(
  failures: number,
  policy: BackoffPolicy,
  random: () => number,
): number {
  if (failures < 1) {
    return 0;
  }
  const ceiling = Math.min(
    policy.capMs,
    policy.initialMs * 2 ** (failures - 1),
  );
  const half = ceiling / 2;
  return Math.round(half + half * random());
}

/** What the circuit allows now: an ordinary call, the minute's probe, or nothing. */
export type CircuitAdmission = "call" | "probe" | "refuse";

/** Counts failures in a row and opens after the threshold, probing once per interval. */
export class Circuit {
  readonly #clock: Clock;
  readonly #policy: CircuitPolicy;
  #failures = 0;
  #nextProbeAt = 0;
  #probing = false;

  constructor(clock: Clock, policy: CircuitPolicy) {
    this.#clock = clock;
    this.#policy = policy;
  }

  /** Failures in a row since the last success. */
  get failures(): number {
    return this.#failures;
  }

  get isOpen(): boolean {
    return this.#failures >= this.#policy.failureThreshold;
  }

  admit(): CircuitAdmission {
    if (!this.isOpen) {
      return "call";
    }
    if (this.#probing || this.#clock.now() < this.#nextProbeAt) {
      return "refuse";
    }
    this.#probing = true;
    return "probe";
  }

  succeeded(): void {
    this.#failures = 0;
    this.#probing = false;
  }

  failed(): void {
    this.#failures += 1;
    this.#probing = false;
    if (this.isOpen) {
      this.#nextProbeAt = this.#clock.now() + this.#policy.probeIntervalMs;
    }
  }

  /** A call ended without saying whether Ring is up; a probe slot is freed. */
  ended(): void {
    this.#probing = false;
  }
}

/** Waits for `previous`, or rejects with the signal's reason as soon as it aborts. */
function turnOrAbort(
  previous: Promise<void>,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason as Error);
      return;
    }
    const onAbort = (): void => {
      reject(signal.reason as Error);
    };
    signal.addEventListener("abort", onAbort, { once: true });
    void previous.then(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    });
  });
}

function isRingUnavailable(error: unknown): boolean {
  return error instanceof RingAdapterError && error.kind === "ring_unavailable";
}

/** The one gate every Ring call passes through. */
export class RingCallGate {
  readonly #clock: Clock;
  readonly #limits: RingCallLimits;
  readonly #random: () => number;
  readonly #circuit: Circuit;
  // Settles when every call queued so far has finished or left the queue; it never rejects.
  #tail: Promise<void> = Promise.resolve();
  #nextStartAt = Number.NEGATIVE_INFINITY;

  constructor(
    clock: Clock,
    limits: RingCallLimits = RING_CALL_LIMITS,
    random: () => number = Math.random,
  ) {
    this.#clock = clock;
    this.#limits = limits;
    this.#random = random;
    this.#circuit = new Circuit(clock, limits.circuit);
  }

  /** True while the circuit is open and calls are refused between probes. */
  get isPaused(): boolean {
    return this.#circuit.isOpen;
  }

  /**
   * Books the spacing again from now. For work whose Ring call starts later than its turn did,
   * such as one that first waits for an earlier call to end: the next call then starts at least
   * `spacingMs` after this one really reached Ring.
   */
  markCallStarted(): void {
    this.#nextStartAt = Math.max(
      this.#nextStartAt,
      this.#clock.now() + this.#limits.spacingMs,
    );
  }

  /**
   * Runs `work` when its turn comes. Throws `RingAdapterError` (`ring_unavailable`) without
   * calling Ring while the circuit is open, the signal's reason if it aborts first, and whatever
   * `work` throws. Only work that `reachesRing` closes the circuit when it succeeds: a read the
   * library answers from its own memory proves nothing about Ring (CP-09 review round 5).
   */
  async call<T>(
    signal: AbortSignal,
    work: (signal: AbortSignal) => Promise<T>,
    reachesRing = true,
  ): Promise<T> {
    const release = await this.#takeTurn(signal);
    try {
      return await this.#callInTurn(signal, work, reachesRing);
    } finally {
      release();
    }
  }

  async #takeTurn(signal: AbortSignal): Promise<() => void> {
    const previous = this.#tail;
    let release: () => void = () => undefined;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    // The next call waits for this one and for every call before it, even if this one leaves early.
    this.#tail = Promise.all([previous, released]).then(() => undefined);
    try {
      await turnOrAbort(previous, signal);
    } catch (error) {
      release();
      throw error;
    }
    return release;
  }

  async #callInTurn<T>(
    signal: AbortSignal,
    work: (signal: AbortSignal) => Promise<T>,
    reachesRing: boolean,
  ): Promise<T> {
    if (this.#circuit.admit() === "refuse") {
      throw new RingAdapterError("ring_unavailable", PAUSED_MESSAGE);
    }
    try {
      const wait = this.#nextStartAt - this.#clock.now();
      if (wait > 0) {
        await this.#clock.sleep(wait, signal);
      }
      this.#nextStartAt = this.#clock.now() + this.#limits.spacingMs;
      const value = await work(signal);
      if (reachesRing) {
        this.#circuit.succeeded();
      } else {
        this.#circuit.ended();
      }
      return value;
    } catch (error) {
      this.#settleFailure(error);
      throw error;
    }
  }

  #settleFailure(error: unknown): void {
    if (!isRingUnavailable(error)) {
      this.#circuit.ended();
      return;
    }
    this.#circuit.failed();
    const holdUntil =
      this.#clock.now() +
      backoffDelayMs(
        this.#circuit.failures,
        this.#limits.backoff,
        this.#random,
      );
    this.#nextStartAt = Math.max(this.#nextStartAt, holdUntil);
  }
}
