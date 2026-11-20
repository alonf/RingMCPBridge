// Admin's error (I3: a manager passes on only its own declared errors, with the original as the
// cause). Its messages are the bridge's own text.

/**
 * - `unavailable`: the core's database could not be reached. Clients answer it as the store being
 *   down (`BRIDGE_UNAVAILABLE`), or, on the link, by closing so the home tries again.
 * - `failed`: something the bridge did not expect, such as a row Settings did not write.
 */
export type AdminErrorKind = "unavailable" | "failed";

/** An Admin use case that did not succeed. */
export class AdminError extends Error {
  readonly kind: AdminErrorKind;

  constructor(kind: AdminErrorKind, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "AdminError";
    this.kind = kind;
  }
}
