// Start-up settings from the environment, checked with zod (CD5: values tuned in the pilot).
// Iteration 001's values; later iterations add theirs here. Defaults are the recorded ones
// (data-model.md "Configuration"). Each run mode adds its own section (T027, mode-settings.ts).
import { z } from "zod";
import { ConfigError } from "./config-error.ts";
import {
  CORE_HOST_SCHEMA,
  CORE_HOST_VARIABLES,
  HOME_SCHEMA,
  HOME_VARIABLES,
  LOCAL_SCHEMA,
  LOCAL_VARIABLES,
  SETUP_SCHEMA,
  SETUP_VARIABLES,
} from "./mode-settings.ts";
import type {
  CoreHostSettings,
  HomeSettings,
  LocalSettings,
  SetupSettings,
} from "./mode-settings.ts";
import { readSection } from "./section.ts";
import type { SectionResult } from "./section.ts";

const READS_PER_HOUR_DEFAULT = 600;
const BATTERY_THRESHOLD_PCT_DEFAULT = 20;
const STALE_AFTER_S_DEFAULT = 120;
const EVENT_RETENTION_DAYS_DEFAULT = 30;
const MS_PER_SECOND = 1000;
const MAX_PERCENT = 100;
const MAX_READS_PER_HOUR = 100_000;
const MAX_STALE_AFTER_S = 3600;
const MAX_RETENTION_DAYS = 3650;

/** Which wiring the process runs: the cloud core, the home connector, or both in one (mode A). */
export type RunMode = "core" | "connector" | "all-in-one";

/** The log levels, matching the Logging utility's. */
export type SettingsLogLevel = "debug" | "info" | "warn" | "error";

/** The settings every mode reads. */
export interface CommonSettings {
  readonly mode: RunMode;
  readonly logLevel: SettingsLogLevel;
  /** Read tool calls allowed per agent per hour (FR-026, SC6). */
  readonly readsPerHour: number;
  /** A battery at or below this percentage is low (FR-001, FR-007). */
  readonly batteryThresholdPct: number;
  /** Home data older than this is marked stale (OR3). */
  readonly staleAfterMs: number;
  /** How long events are kept (FR-008). */
  readonly eventRetentionDays: number;
}

/** The checked start-up settings: the common ones and the run mode's own. */
export type Settings =
  | (CommonSettings & {
      readonly mode: "core";
      readonly core: CoreHostSettings;
    })
  | (CommonSettings & {
      readonly mode: "connector";
      readonly home: HomeSettings;
    })
  | (CommonSettings & {
      readonly mode: "all-in-one";
      readonly local: LocalSettings;
    });

/** The environment variable behind each common setting. */
export const SETTING_VARIABLES = {
  mode: "BRIDGE_MODE",
  logLevel: "BRIDGE_LOG_LEVEL",
  readsPerHour: "BRIDGE_READS_PER_HOUR",
  batteryThresholdPct: "BRIDGE_BATTERY_THRESHOLD_PCT",
  staleAfterS: "BRIDGE_STALE_AFTER_S",
  eventRetentionDays: "BRIDGE_EVENT_RETENTION_DAYS",
} as const;

/** A whole number written in decimal digits, within bounds, or the default when unset. */
function wholeNumber(
  defaultValue: number,
  min: number,
  max: number,
): z.ZodType<number> {
  return z
    .string()
    .regex(/^\d{1,9}$/)
    .transform(Number)
    .pipe(z.number().int().min(min).max(max))
    .optional()
    .transform((value) => value ?? defaultValue);
}

const COMMON_SCHEMA = z
  .object({
    mode: z.enum(["core", "connector", "all-in-one"]),
    logLevel: z.enum(["debug", "info", "warn", "error"]).default("info"),
    readsPerHour: wholeNumber(READS_PER_HOUR_DEFAULT, 1, MAX_READS_PER_HOUR),
    batteryThresholdPct: wholeNumber(
      BATTERY_THRESHOLD_PCT_DEFAULT,
      0,
      MAX_PERCENT,
    ),
    staleAfterS: wholeNumber(STALE_AFTER_S_DEFAULT, 1, MAX_STALE_AFTER_S),
    eventRetentionDays: wholeNumber(
      EVENT_RETENTION_DAYS_DEFAULT,
      1,
      MAX_RETENTION_DAYS,
    ),
  })
  .transform(({ staleAfterS, ...rest }): CommonSettings => ({
    ...rest,
    staleAfterMs: staleAfterS * MS_PER_SECOND,
  }));

type Environment = Readonly<Record<string, string | undefined>>;

/** The run mode's own settings. */
type ModeSection =
  | { readonly mode: "core"; readonly core: CoreHostSettings }
  | { readonly mode: "connector"; readonly home: HomeSettings }
  | { readonly mode: "all-in-one"; readonly local: LocalSettings };

const RUN_MODE = z.enum(["core", "connector", "all-in-one"]);

function modeSection(
  mode: RunMode,
  environment: Environment,
): SectionResult<ModeSection> {
  switch (mode) {
    case "core":
      return mapSection(
        readSection(CORE_HOST_SCHEMA, CORE_HOST_VARIABLES, environment),
        (core) => ({ mode, core }),
      );
    case "connector":
      return mapSection(
        readSection(HOME_SCHEMA, HOME_VARIABLES, environment),
        (home) => ({ mode, home }),
      );
    case "all-in-one":
      return mapSection(
        readSection(LOCAL_SCHEMA, LOCAL_VARIABLES, environment),
        (local) => ({ mode, local }),
      );
  }
}

function mapSection<T>(
  section: SectionResult<T>,
  build: (value: T) => ModeSection,
): SectionResult<ModeSection> {
  return section.ok ? { ok: true, value: build(section.value) } : section;
}

/**
 * Reads and checks the settings: the common ones and, once the run mode is known, the mode's own.
 * Throws `ConfigError` (`invalid_settings`) naming every bad variable of both; the error never holds
 * a value, which could be a pasted secret (FR-034).
 */
export function loadSettings(environment: Environment): Settings {
  const common = readSection(COMMON_SCHEMA, SETTING_VARIABLES, environment);
  const mode = RUN_MODE.safeParse(environment[SETTING_VARIABLES.mode]);
  const section = mode.success
    ? modeSection(mode.data, environment)
    : undefined;
  if (!common.ok || section?.ok !== true) {
    const failed = [
      ...(common.ok ? [] : common.variables),
      ...(section === undefined || section.ok ? [] : section.variables),
    ];
    throw new ConfigError("invalid_settings", failed);
  }
  return deepFreeze({ ...common.value, ...section.value });
}

/**
 * Reads the Setup CLI's settings (T028): the data folder and the Secrets File key's path, under the
 * names the connector and mode A use, and nothing else, so the setup runs before the rest is set.
 * Throws `ConfigError` (`invalid_settings`) naming the bad variables.
 */
export function loadSetupSettings(environment: Environment): SetupSettings {
  const section = readSection(SETUP_SCHEMA, SETUP_VARIABLES, environment);
  if (!section.ok) {
    throw new ConfigError("invalid_settings", section.variables);
  }
  return Object.freeze({ ...section.value });
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const inner of Object.values(value)) {
      deepFreeze(inner);
    }
    Object.freeze(value);
  }
  return value;
}
