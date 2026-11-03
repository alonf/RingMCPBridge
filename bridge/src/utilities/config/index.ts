// Config utility (CP-02, T006): start-up settings from the environment. The only entry point (CD4).

/** Reads and checks the settings; the Host calls it once with `process.env`. */
export { loadSettings, SETTING_VARIABLES } from "./settings.ts";

/** The checked settings and the run mode. */
export type { RunMode, Settings, SettingsLogLevel } from "./settings.ts";

/** The utility's error: `invalid_settings`, naming the bad variables only. */
export { ConfigError } from "./config-error.ts";
export type { ConfigErrorKind } from "./config-error.ts";
