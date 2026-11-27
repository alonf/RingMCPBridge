// The Clock utility's one error class (I3).

/** What went wrong in the Clock utility. */
export type ClockErrorKind = "unknown_time_zone" | "invalid_interval";

/** Thrown for a time zone Intl does not know, or a timer interval that is not positive. */
export class ClockError extends Error {
  readonly kind: ClockErrorKind;

  constructor(kind: ClockErrorKind, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ClockError";
    this.kind = kind;
  }
}
