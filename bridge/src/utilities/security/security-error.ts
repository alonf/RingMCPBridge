// The Security utility's one error class (I3).

/**
 * What went wrong in the Security utility:
 * - `invalid_key`: a key of the wrong type or size;
 * - `open_failed`: sealed data that does not open (a wrong key, a different purpose, changed bytes);
 * - `invalid_settings`: Entra sign-in settings that cannot be used (a programming or wiring error);
 * - `sign_in_refused`: the owner cancelled, or Entra declined to sign them in;
 * - `sign_in_invalid`: the reply failed a check (state, age, the token request, the ID token);
 * - `sign_in_unavailable`: Entra or the managed identity could not be reached. Sign-in fails closed;
 * - `sign_in_not_owner`: someone other than the configured owner signed in, the ID token named no
 *   object id, or no owner is configured.
 */
export type SecurityErrorKind =
  | "invalid_key"
  | "open_failed"
  | "invalid_settings"
  | "sign_in_refused"
  | "sign_in_invalid"
  | "sign_in_unavailable"
  | "sign_in_not_owner";

/**
 * The Security utility's error. Its message is written by the bridge and never holds key or data
 * bytes, tokens, authorization codes, or text that Entra sent.
 */
export class SecurityError extends Error {
  readonly kind: SecurityErrorKind;

  constructor(
    kind: SecurityErrorKind,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "SecurityError";
    this.kind = kind;
  }
}
