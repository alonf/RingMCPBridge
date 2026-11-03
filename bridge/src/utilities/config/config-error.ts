// The Config utility's one error class (I3).

/** What went wrong in the Config utility. */
export type ConfigErrorKind = "invalid_settings";

/** Thrown at start when settings are missing or out of range. It names variables, never values. */
export class ConfigError extends Error {
  readonly kind: ConfigErrorKind;
  /** The environment variables that failed their check. */
  readonly variables: readonly string[];

  constructor(kind: ConfigErrorKind, variables: readonly string[]) {
    super(`Invalid settings: ${variables.join(", ")}.`);
    this.name = "ConfigError";
    this.kind = kind;
    this.variables = Object.freeze([...variables]);
  }
}
