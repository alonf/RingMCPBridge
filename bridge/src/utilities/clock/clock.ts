// The Clock seam: the system clock in the bridge, the fake clock in tests and the scenario engine.

/** Stops a scheduled callback. Calling it again, or after the callback ran, does nothing. */
export type Cancel = () => void;

/** Time and timers. Two implementations: `SystemClock` and `FakeClock`. */
export interface Clock {
  /** The current time in epoch milliseconds. */
  now(): number;
  /** Resolves after `ms`; rejects with the signal's reason if the signal aborts first. */
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
  /** Runs `callback` once, `ms` from now. */
  schedule(ms: number, callback: () => void): Cancel;
  /** Runs `callback` every `ms`, first `ms` from now. */
  every(ms: number, callback: () => void): Cancel;
}

/** `sleep` built on a clock's `schedule`, so both clocks abort the same way. */
export function sleepOn(
  schedule: (ms: number, callback: () => void) => Cancel,
  ms: number,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted === true) {
      reject(signal.reason as Error);
      return;
    }
    const onAbort = (): void => {
      cancel();
      reject(signal?.reason as Error);
    };
    const cancel = schedule(ms, () => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    });
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** The real clock: `Date.now` and Node's timers. */
export class SystemClock implements Clock {
  now(): number {
    return Date.now();
  }

  sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return sleepOn(
      (delay, callback) => this.schedule(delay, callback),
      ms,
      signal,
    );
  }

  schedule(ms: number, callback: () => void): Cancel {
    const timer = setTimeout(callback, ms);
    return () => {
      clearTimeout(timer);
    };
  }

  every(ms: number, callback: () => void): Cancel {
    const timer = setInterval(callback, ms);
    return () => {
      clearInterval(timer);
    };
  }
}
