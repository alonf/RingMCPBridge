// The Security utility's one error class (I3).

/** What went wrong in the Security utility. */
export type SecurityErrorKind = "invalid_key" | "open_failed";

/**
 * Thrown for a key of the wrong type or size, or sealed data that does not open (a wrong key, a
 * different purpose, or changed bytes). The message never holds key or data bytes.
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
