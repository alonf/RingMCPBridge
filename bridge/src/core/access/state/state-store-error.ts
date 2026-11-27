// State's error. Its messages are the bridge's own text and never quote a stored value: names,
// rooms and device state come from Ring (FR-033, FR-034).

/**
 * - `unavailable`: the database could not be reached or could not take the work: the store-down
 *   error, which managers answer as `BRIDGE_UNAVAILABLE` and never with stale data (FR-006).
 * - `failed`: the database refused a statement, or holds a row this store did not write. Callers
 *   treat it as `INTERNAL`.
 */
export type StateStoreErrorKind = "unavailable" | "failed";

/** A State operation that did not succeed. */
export class StateStoreError extends Error {
  readonly kind: StateStoreErrorKind;

  constructor(
    kind: StateStoreErrorKind,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "StateStoreError";
    this.kind = kind;
  }
}
