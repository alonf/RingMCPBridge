import { describe, expect, it } from "vitest";
import { ConfigError, loadSettings } from "./index.ts";

function configErrorFrom(environment: Record<string, string>): ConfigError {
  try {
    loadSettings(environment);
  } catch (error) {
    if (error instanceof ConfigError) {
      return error;
    }
    throw error;
  }
  throw new Error("expected a ConfigError");
}

describe("loadSettings", () => {
  it("applies the recorded defaults", () => {
    expect(loadSettings({ BRIDGE_MODE: "core" })).toEqual({
      mode: "core",
      logLevel: "info",
      readsPerHour: 600,
      batteryThresholdPct: 20,
      staleAfterMs: 120_000,
      eventRetentionDays: 30,
    });
  });

  it("reads every variable", () => {
    const settings = loadSettings({
      BRIDGE_MODE: "all-in-one",
      BRIDGE_LOG_LEVEL: "debug",
      BRIDGE_READS_PER_HOUR: "300",
      BRIDGE_BATTERY_THRESHOLD_PCT: "15",
      BRIDGE_STALE_AFTER_S: "90",
      BRIDGE_EVENT_RETENTION_DAYS: "14",
    });

    expect(settings).toEqual({
      mode: "all-in-one",
      logLevel: "debug",
      readsPerHour: 300,
      batteryThresholdPct: 15,
      staleAfterMs: 90_000,
      eventRetentionDays: 14,
    });
  });

  it("treats an empty value as unset", () => {
    expect(
      loadSettings({ BRIDGE_MODE: "connector", BRIDGE_LOG_LEVEL: "" }).logLevel,
    ).toBe("info");
  });

  it("returns frozen settings", () => {
    expect(Object.isFrozen(loadSettings({ BRIDGE_MODE: "core" }))).toBe(true);
  });

  it("requires the run mode", () => {
    expect(configErrorFrom({}).variables).toEqual(["BRIDGE_MODE"]);
  });

  it.each([
    ["an unknown mode", { BRIDGE_MODE: "cloud" }, "BRIDGE_MODE"],
    [
      "a percentage over 100",
      { BRIDGE_BATTERY_THRESHOLD_PCT: "101" },
      "BRIDGE_BATTERY_THRESHOLD_PCT",
    ],
    ["a fraction", { BRIDGE_READS_PER_HOUR: "1.5" }, "BRIDGE_READS_PER_HOUR"],
    [
      "a negative number",
      { BRIDGE_STALE_AFTER_S: "-5" },
      "BRIDGE_STALE_AFTER_S",
    ],
    [
      "zero retention",
      { BRIDGE_EVENT_RETENTION_DAYS: "0" },
      "BRIDGE_EVENT_RETENTION_DAYS",
    ],
    ["an unknown level", { BRIDGE_LOG_LEVEL: "verbose" }, "BRIDGE_LOG_LEVEL"],
  ])("refuses %s", (_, overrides, variable) => {
    const error = configErrorFrom({ BRIDGE_MODE: "core", ...overrides });
    expect(error.kind).toBe("invalid_settings");
    expect(error.variables).toEqual([variable]);
  });

  it("names every bad variable at once", () => {
    const error = configErrorFrom({
      BRIDGE_READS_PER_HOUR: "x",
      BRIDGE_STALE_AFTER_S: "y",
    });
    expect(error.variables).toEqual([
      "BRIDGE_MODE",
      "BRIDGE_READS_PER_HOUR",
      "BRIDGE_STALE_AFTER_S",
    ]);
  });

  it("never puts a setting's value in the error (FR-034)", () => {
    const pastedSecret = Buffer.from(
      "not-a-number-but-a-pasted-token",
    ).toString("base64url");
    const error = configErrorFrom({
      BRIDGE_MODE: pastedSecret,
      BRIDGE_READS_PER_HOUR: pastedSecret,
      BRIDGE_LOG_LEVEL: "4821",
    });

    const everything = `${error.message} ${String(error.stack)} ${JSON.stringify(error)}`;
    expect(everything).not.toContain(pastedSecret);
    expect(everything).not.toContain("4821");
    expect(error.message).toBe(
      "Invalid settings: BRIDGE_MODE, BRIDGE_LOG_LEVEL, BRIDGE_READS_PER_HOUR.",
    );
  });
});
