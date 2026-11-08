// The Issuer's one error class (I3).

/**
 * What went wrong in the Issuer:
 * - `signing_keys_unreadable`: `issuer-signing-keys` is set, but is not a key document the Issuer
 *   can use. The message never quotes it: it holds private keys;
 * - `not_started`: a link was finished before `start` found the signing keys;
 * - `link_expired`: the agent's authorization ended before the owner came back from Entra.
 */
export type IssuerErrorKind =
  "signing_keys_unreadable" | "not_started" | "link_expired";

/** The Issuer's error. Its message is written by the bridge and never holds a key or a token. */
export class IssuerError extends Error {
  readonly kind: IssuerErrorKind;

  constructor(kind: IssuerErrorKind, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "IssuerError";
    this.kind = kind;
  }
}
