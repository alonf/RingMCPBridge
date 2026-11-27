// Event's error (I3: a manager passes on only its own declared errors, with the original as the
// cause). Its messages are the bridge's own text and never quote what the home sent.

/**
 * - `unavailable`: the core's database could not be reached: nothing was committed, and the home
 *   sends the message again.
 * - `failed`: something the bridge did not expect, such as a row State did not write.
 */
export type EventErrorKind = "unavailable" | "failed";

/** An Event use case that did not succeed. */
export class EventError extends Error {
  readonly kind: EventErrorKind;

  constructor(kind: EventErrorKind, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "EventError";
    this.kind = kind;
  }
}
