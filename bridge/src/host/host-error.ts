// The Host's one error class: why a process could not start. Its messages are the bridge's own
// text, naming files and settings, never a secret (FR-034).

/**
 * - `setup_needed`: the home has no Secrets File yet; the Setup CLI makes it (T028).
 * - `key_revoked`: the owner revoked this home's key; the home must enroll a new one.
 * - `signing_keys_missing`: mode H's core has no Issuer signing keys yet (T031 writes them).
 * - `lease_lost`: mode A lost its lease to another process on the same data folder.
 * - `ring_connection_stuck`: a hub's live connection stayed closed while Ring's calls worked; the
 *   process restarts (the owner's choice (y)).
 */
export type HostErrorKind =
  | "setup_needed"
  | "key_revoked"
  | "signing_keys_missing"
  | "lease_lost"
  | "ring_connection_stuck";

/** A process that could not start. */
export class HostError extends Error {
  readonly kind: HostErrorKind;

  constructor(kind: HostErrorKind, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "HostError";
    this.kind = kind;
  }
}
