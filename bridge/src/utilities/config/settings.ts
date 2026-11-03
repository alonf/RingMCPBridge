// Start-up settings from the environment, checked with zod (CD5: values tuned in the pilot).
// Iteration 001's values; later iterations add theirs here. Defaults are the recorded ones
// (data-model.md "Configuration").
import { z } from "zod";
import { ConfigError } from "./config-error.ts";

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

/** The checked start-up settings. */
export interface Settings {
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

/** The environment variable behind each setting. */
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

const SETTINGS_SCHEMA = z.object({
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
});

type SettingKey = keyof typeof SETTING_VARIABLES;

function isSettingKey(key: PropertyKey | undefined): key is SettingKey {
  return typeof key === "string" && Object.hasOwn(SETTING_VARIABLES, key);
}

/** Empty values count as unset, so `BRIDGE_LOG_LEVEL=` falls back to the default. */
function readVariables(
  environment: Readonly<Record<string, string | undefined>>,
): Record<SettingKey, string | undefined> {
  const read = (variable: string): string | undefined => {
    const value = environment[variable];
    return value === "" ? undefined : value;
  };
  return {
    mode: read(SETTING_VARIABLES.mode),
    logLevel: read(SETTING_VARIABLES.logLevel),
    readsPerHour: read(SETTING_VARIABLES.readsPerHour),
    batteryThresholdPct: read(SETTING_VARIABLES.batteryThresholdPct),
    staleAfterS: read(SETTING_VARIABLES.staleAfterS),
    eventRetentionDays: read(SETTING_VARIABLES.eventRetentionDays),
  };
}

/**
 * Reads and checks the settings. Throws `ConfigError` (`invalid_settings`) naming every bad
 * variable; the error never holds a value, which could be a pasted secret (FR-034).
 */
export function loadSettings(
  environment: Readonly<Record<string, string | undefined>>,
): Settings {
  const parsed = SETTINGS_SCHEMA.safeParse(readVariables(environment));
  if (!parsed.success) {
    const keys = parsed.error.issues
      .map((issue) => issue.path[0])
      .filter(isSettingKey);
    const variables = [...new Set(keys)].map((key) => SETTING_VARIABLES[key]);
    throw new ConfigError("invalid_settings", variables);
  }
  const { staleAfterS, ...rest } = parsed.data;
  return Object.freeze({ ...rest, staleAfterMs: staleAfterS * MS_PER_SECOND });
}
