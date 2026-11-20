// The Query layer's one error class (I3).

/**
 * What went wrong in the Query layer:
 * - `store_down`: the database cannot be reached or cannot take the work (a lost connection, a
 *   failed login, a full disk, a busy or failing-over server that is still busy after one retry).
 *   Managers turn it into `BRIDGE_UNAVAILABLE`.
 * - `constraint_violated`: the database refused a write because of a key, unique, foreign-key,
 *   check or not-null rule.
 * - `statement_failed`: the statement could not run and running it again would not help. The
 *   bridge built it wrongly (a placeholder without a value, a bad name, a call to the layer from
 *   inside its own transaction), or the database refused it (a syntax error, an unknown table, a
 *   value it cannot hold). Managers treat it as `INTERNAL`.
 */
export type QueryLayerErrorKind =
  "store_down" | "constraint_violated" | "statement_failed";

/** Options for `QueryLayerError`: the driver's error as `cause`, and whether the failure passes. */
export interface QueryLayerErrorOptions extends ErrorOptions {
  readonly transient?: boolean;
}

/**
 * The Query layer's error. Its message is written by the bridge: it names the database's error
 * number or the driver's code, never the database's own text, which can hold row values.
 */
export class QueryLayerError extends Error {
  readonly kind: QueryLayerErrorKind;
  /**
   * True when the failure was a passing one (a deadlock, a busy database, a lost connection). The
   * layer has already given the unit of work its one retry when the retry was safe.
   */
  readonly transient: boolean;

  constructor(
    kind: QueryLayerErrorKind,
    message: string,
    options?: QueryLayerErrorOptions,
  ) {
    super(message, options);
    this.name = "QueryLayerError";
    this.kind = kind;
    this.transient = options?.transient ?? false;
  }
}
