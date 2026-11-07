// The core Secrets' error. Its messages are the bridge's own text and never hold a secret value,
// nor anything Key Vault sent back (FR-034, SC4).

/**
 * - `unavailable`: Key Vault could not be reached or did not answer, or the secrets file could not
 *   be read or written. Nothing was changed; the caller may try again later.
 * - `refused`: Key Vault refused the core's identity for this secret, or holds it as deleted.
 *   Trying again does not help until the vault's access or the secret is fixed.
 * - `unreadable`: the secrets file does not open with its key, or is not in a known form.
 */
export type SecretsErrorKind = "unavailable" | "refused" | "unreadable";

/** A Secrets operation that did not succeed. */
export class SecretsError extends Error {
  readonly kind: SecretsErrorKind;

  constructor(kind: SecretsErrorKind, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "SecretsError";
    this.kind = kind;
  }
}
