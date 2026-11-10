// The Outbox Store's error. Its messages are the bridge's own text and never quote a message's
// body, which holds Ring names (FR-033, FR-034).

/**
 * - `unavailable`: the outbox file could not be opened, read or written, or holds a row this store
 *   did not write. Nothing was changed; the caller may try again later.
 * - `in_use`: another process holds the outbox file (a second connector on the same data folder).
 */
export type OutboxStoreErrorKind = "unavailable" | "in_use";

/** An Outbox Store operation that did not succeed. */
export class OutboxStoreError extends Error {
  readonly kind: OutboxStoreErrorKind;

  constructor(
    kind: OutboxStoreErrorKind,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "OutboxStoreError";
    this.kind = kind;
  }
}
