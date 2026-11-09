// Config utility (CP-02, T006): start-up settings from the environment. The only entry point (CD4).

/** Reads and checks the settings; the Host calls it once with `process.env`. */
export { loadSettings, SETTING_VARIABLES } from "./settings.ts";

/** The checked settings and the run mode. */
export type {
  CommonSettings,
  RunMode,
  Settings,
  SettingsLogLevel,
} from "./settings.ts";

/** Each run mode's own settings, and the variables behind them (T027). */
export {
  CORE_HOST_VARIABLES,
  HOME_VARIABLES,
  LOCAL_VARIABLES,
} from "./mode-settings.ts";
export type {
  CoreHostSettings,
  HomeSettings,
  ListedAgentScope,
  ListedAgentSetting,
  LocalSettings,
} from "./mode-settings.ts";

/** The utility's error: `invalid_settings`, naming the bad variables only. */
export { ConfigError } from "./config-error.ts";
export type { ConfigErrorKind } from "./config-error.ts";
