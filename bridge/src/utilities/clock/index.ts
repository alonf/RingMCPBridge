// Clock utility (CP-02, T006): time, timers and time-zone formatting. The only entry point (CD4).

/** The Clock seam, its `Cancel` handle, and the real clock the Host wires in. */
export { SystemClock } from "./clock.ts";
export type { Cancel, Clock } from "./clock.ts";

/**
 * A clock that moves only on `advance(ms)`, firing due timers in order. Used by tests and by the
 * scenario engine in place of `SystemClock`.
 */
export { FakeClock } from "./fake-clock.ts";

/** The utility's error: `unknown_time_zone` or `invalid_interval`. */
export { ClockError } from "./clock-error.ts";
export type { ClockErrorKind } from "./clock-error.ts";

/** UTC and local-time ISO 8601 timestamps, and a check for IANA time-zone names. */
export { formatInTimeZone, formatUtc, isValidTimeZone } from "./time-format.ts";
