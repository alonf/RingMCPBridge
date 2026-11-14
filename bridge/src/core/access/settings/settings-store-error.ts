// Settings' error. Its messages are the bridge's own text and never quote a stored value (FR-034).

/**
 * - `unavailable`: the database could not be reached or could not take the work. A change may not
 *   have been made; the caller may try again later (managers answer `BRIDGE_UNAVAILABLE`).
 * - `failed`: the database refused a statement, or holds a row this store did not write. Callers
 *   treat it as `INTERNAL`.
 */
export type SettingsStoreErrorKind = "unavailable" | "failed";

/** A Settings operation that did not succeed. */
export class SettingsStoreError extends Error {
  readonly kind: SettingsStoreErrorKind;

  constructor(
    kind: SettingsStoreErrorKind,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "SettingsStoreError";
    this.kind = kind;
  }
}
