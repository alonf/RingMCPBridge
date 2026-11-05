// The Ring Adapter's error. Its messages are the bridge's own text; nothing Ring sends is copied
// into one (FR-034).

/**
 * - `ring_unavailable`: Ring is down or refusing (a 5xx, a 429 past the backoff, a 406, a timeout);
 *   it passes, so the caller may try again later;
 * - `session_lost`: Ring refused the token; the owner must sign in again with the Setup CLI.
 */
export type RingAdapterErrorKind = "ring_unavailable" | "session_lost";

/** A Ring read that did not succeed. */
export class RingAdapterError extends Error {
  readonly kind: RingAdapterErrorKind;

  constructor(
    kind: RingAdapterErrorKind,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "RingAdapterError";
    this.kind = kind;
  }
}
