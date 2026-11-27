// The standard home has what the tests downstream rely on (T009, SC-006).
import { describe, expect, it } from "vitest";
import { isValidTimeZone } from "../../src/utilities/clock/index.ts";
import type { RingDeviceType } from "../../src/connector/access/ring-adapter/index.ts";
import {
  HEBREW_DEVICE_ID,
  HEBREW_DEVICE_NAME,
  STANDARD_LOCATION_ID,
  standardHome,
} from "./index.ts";

const ALL_TYPES: readonly RingDeviceType[] = [
  "contact",
  "motion",
  "flood",
  "keypad",
  "base_station",
  "camera",
  "doorbell",
  "light",
  "other",
];

describe("the standard home", () => {
  const home = standardHome();

  it("has one location with a time zone and an alarm mode", () => {
    expect(home.locations).toHaveLength(1);
    const [location] = home.locations;
    expect(location?.location_id).toBe(STANDARD_LOCATION_ID);
    expect(isValidTimeZone(location?.time_zone ?? "")).toBe(true);
    expect(location?.alarm_mode).toBe("disarmed");
  });

  it("has 100 devices with distinct ids, all at that location", () => {
    expect(home.devices).toHaveLength(100);
    expect(new Set(home.devices.map((device) => device.device_id)).size).toBe(
      100,
    );
    expect(
      home.devices.every(
        (device) => device.location_id === STANDARD_LOCATION_ID,
      ),
    ).toBe(true);
  });

  it("has every supported device type", () => {
    expect(new Set(home.devices.map((device) => device.type))).toEqual(
      new Set(ALL_TYPES),
    );
  });

  it("has a device named in Hebrew", () => {
    expect(
      home.devices.find((device) => device.device_id === HEBREW_DEVICE_ID)
        ?.name,
    ).toBe(HEBREW_DEVICE_NAME);
  });

  it("has low batteries, wired devices with no battery, and offline devices", () => {
    const low = home.devices.filter((device) => device.battery_low === true);
    const wired = home.devices.filter(
      (device) => device.power_mode === "wired",
    );
    const offline = home.devices.filter((device) => !device.online);

    expect(low.length).toBeGreaterThan(0);
    expect(low.every((device) => (device.battery_pct ?? 100) <= 10)).toBe(true);
    expect(wired.length).toBeGreaterThan(0);
    expect(
      wired.every(
        (device) =>
          device.battery_pct === undefined && device.battery_low === undefined,
      ),
    ).toBe(true);
    expect(offline.length).toBeGreaterThan(0);
  });

  it("is the same home every time, and cannot be changed", () => {
    expect(standardHome()).toEqual(home);
    expect(Object.isFrozen(home.devices)).toBe(true);
    expect(Object.isFrozen(home.devices[0]?.state)).toBe(true);
  });
});
