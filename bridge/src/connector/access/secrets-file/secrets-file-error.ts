// The Secrets File's error. Its messages are the bridge's own text and never hold a secret or the
// file's contents (FR-034). A cause is kept only where it cannot quote the contents.

/**
 * - `key_unusable`: the key's Docker secret is missing, unreadable, or not a 32-byte key;
 * - `open_failed`: the file exists but did not open: a wrong key, a changed byte, unknown
 *   contents, or a read error. Nothing is written after this;
 * - `already_exists`: a new Secrets File was asked for where one already exists;
 * - `write_failed`: the new contents could not be written; the previous file is unchanged.
 */
export type SecretsFileErrorKind =
  "key_unusable" | "open_failed" | "already_exists" | "write_failed";

/** A Secrets File operation that did not succeed. */
export class SecretsFileError extends Error {
  readonly kind: SecretsFileErrorKind;

  constructor(
    kind: SecretsFileErrorKind,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "SecretsFileError";
    this.kind = kind;
  }
}
