// Grants' error. Its messages are the bridge's own text and never quote a record, which can hold
// tokens' claims and text a client sent (FR-034).

/**
 * - `unavailable`: the database could not be reached or could not take the work. A change may not
 *   have been made; the caller may try again later.
 * - `failed`: the database refused a statement, or holds a record this store did not write.
 */
export type GrantsStoreErrorKind = "unavailable" | "failed";

/** A Grants operation that did not succeed. */
export class GrantsStoreError extends Error {
  readonly kind: GrantsStoreErrorKind;

  constructor(
    kind: GrantsStoreErrorKind,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "GrantsStoreError";
    this.kind = kind;
  }
}
