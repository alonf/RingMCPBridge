// Mapping Ring's data into the port's own entries (T013, written first): a tolerant reader. Names
// stay exactly as Ring wrote them, unknown kinds become `other`, and nothing of Ring's own objects
// is kept.
import { describe, expect, it } from "vitest";
import {
  alarmModeOf,
  cameraEntry,
  deviceEntry,
  deviceTypeOf,
  locationEntry,
} from "./ring-mapping.ts";

const LOCATION_ID = "loc-1";

describe("deviceTypeOf", () => {
  it("maps Ring's device kinds onto the bridge's types, and anything else to other", () => {
    expect(deviceTypeOf("sensor.contact")).toBe("contact");
    expect(deviceTypeOf("sensor.zone")).toBe("contact");
    expect(deviceTypeOf("sensor.motion")).toBe("motion");
    expect(deviceTypeOf("motion-sensor.beams")).toBe("motion");
    expect(deviceTypeOf("sensor.flood-freeze")).toBe("flood");
    expect(deviceTypeOf("sensor.water")).toBe("flood");
    expect(deviceTypeOf("security-keypad")).toBe("keypad");
    expect(deviceTypeOf("hub.redsky")).toBe("base_station");
    expect(deviceTypeOf("hub.kili")).toBe("base_station");
    expect(deviceTypeOf("switch.multilevel.beams")).toBe("light");
    expect(deviceTypeOf("group.light-group.beams")).toBe("light");
    expect(deviceTypeOf("range-extender.zwave")).toBe("other");
    expect(deviceTypeOf("a-kind-ring-adds-next-year")).toBe("other");
  });

  it("leaves out entries that are not devices", () => {
    expect(deviceTypeOf("security-panel")).toBeUndefined();
    expect(deviceTypeOf("access-code")).toBeUndefined();
    expect(deviceTypeOf("access-code.vault")).toBeUndefined();
  });
});

describe("alarmModeOf", () => {
  it("maps Ring's modes, and anything unknown to absent", () => {
    expect(alarmModeOf("none")).toBe("disarmed");
    expect(alarmModeOf("some")).toBe("home");
    expect(alarmModeOf("all")).toBe("away");
    expect(alarmModeOf("cool")).toBeUndefined();
    expect(alarmModeOf(undefined)).toBeUndefined();
  });
});

describe("locationEntry", () => {
  const details = {
    name: "בית סבתא",
    owner_id: 7,
    address: { timezone: "Asia/Jerusalem" },
  };

  it("keeps the name exactly, and tells owned from shared", () => {
    expect(
      locationEntry({ id: LOCATION_ID, locationDetails: details }, 7, "home"),
    ).toEqual({
      location_id: LOCATION_ID,
      name: "בית סבתא",
      time_zone: "Asia/Jerusalem",
      alarm_mode: "home",
      ownership: "owned",
    });
    expect(
      locationEntry(
        { id: LOCATION_ID, locationDetails: details },
        8,
        undefined,
      ),
    ).toEqual({
      location_id: LOCATION_ID,
      name: "בית סבתא",
      time_zone: "Asia/Jerusalem",
      ownership: "shared",
    });
  });

  it("falls back to UTC for a time zone Intl does not know", () => {
    const odd = { ...details, address: { timezone: "" } };
    expect(
      locationEntry({ id: LOCATION_ID, locationDetails: odd }, 7, undefined)
        .time_zone,
    ).toBe("UTC");
  });
});

describe("deviceEntry", () => {
  it("maps a battery contact sensor", () => {
    expect(
      deviceEntry(
        {
          zid: "z-1",
          name: "Front door ",
          deviceType: "sensor.contact",
          batteryLevel: 87,
          batteryStatus: "ok",
          faulted: true,
          tamperStatus: "ok",
        },
        LOCATION_ID,
      ),
    ).toEqual({
      device_id: "z-1",
      location_id: LOCATION_ID,
      name: "Front door ",
      type: "contact",
      battery_pct: 87,
      battery_low: false,
      power_mode: "battery",
      online: true,
      state: { open: true, tampered: false },
    });
  });

  it("treats a device on mains power as wired, with no battery level", () => {
    expect(
      deviceEntry(
        {
          zid: "z-2",
          name: "Keypad",
          deviceType: "security-keypad",
          batteryLevel: 100,
          batteryStatus: "charged",
          acStatus: "ok",
        },
        LOCATION_ID,
      ),
    ).toMatchObject({ power_mode: "wired", battery_low: false });
    expect(
      deviceEntry(
        {
          zid: "z-3",
          name: "Hub",
          deviceType: "hub.redsky",
          batteryStatus: "none",
        },
        LOCATION_ID,
      )?.power_mode,
    ).toBe("wired");
    const keypad = deviceEntry(
      {
        zid: "z-2",
        name: "Keypad",
        deviceType: "security-keypad",
        batteryLevel: 100,
        acStatus: "ok",
      },
      LOCATION_ID,
    );
    expect(keypad).not.toHaveProperty("battery_pct");
  });

  it("reads a low battery, an offline device, and motion", () => {
    const motion = deviceEntry(
      {
        zid: "z-4",
        name: "Hall",
        deviceType: "sensor.motion",
        batteryStatus: "low",
        motionStatus: "faulted",
        commStatus: "error",
      },
      LOCATION_ID,
    );
    expect(motion).toMatchObject({
      type: "motion",
      battery_low: true,
      online: false,
      state: { motion: true },
    });
    expect(motion).not.toHaveProperty("battery_pct");
  });

  it("drops a battery level outside 0 to 100, and keeps flood and light state", () => {
    expect(
      deviceEntry(
        {
          zid: "z-5",
          name: "Basement",
          deviceType: "sensor.flood-freeze",
          batteryLevel: 140,
          flood: { faulted: true },
        },
        LOCATION_ID,
      ),
    ).toMatchObject({ state: { flood: true } });
    expect(
      deviceEntry(
        {
          zid: "z-5",
          name: "Basement",
          deviceType: "sensor.flood-freeze",
          batteryLevel: 140,
        },
        LOCATION_ID,
      ),
    ).not.toHaveProperty("battery_pct");
    expect(
      deviceEntry(
        {
          zid: "z-6",
          name: "Path",
          deviceType: "switch.multilevel.beams",
          on: true,
          level: 0.5,
        },
        LOCATION_ID,
      ),
    ).toMatchObject({ type: "light", state: { on: true, level: 0.5 } });
  });

  it("returns undefined for an entry that is not a device, or has no id", () => {
    expect(
      deviceEntry(
        { zid: "p", name: "Panel", deviceType: "security-panel" },
        LOCATION_ID,
      ),
    ).toBeUndefined();
    expect(
      deviceEntry(
        { zid: "", name: "Nameless", deviceType: "sensor.contact" },
        LOCATION_ID,
      ),
    ).toBeUndefined();
  });
});

describe("cameraEntry", () => {
  it("maps a battery doorbell and a wired camera", () => {
    expect(
      cameraEntry(
        {
          id: 42,
          name: "Doorbell",
          isDoorbot: true,
          hasBattery: true,
          batteryLevel: 55,
          hasLowBattery: false,
          isOffline: false,
        },
        LOCATION_ID,
      ),
    ).toEqual({
      device_id: "42",
      location_id: LOCATION_ID,
      name: "Doorbell",
      type: "doorbell",
      battery_pct: 55,
      battery_low: false,
      power_mode: "battery",
      online: true,
      state: {},
    });
    expect(
      cameraEntry(
        {
          id: 43,
          name: "Driveway",
          isDoorbot: false,
          hasBattery: false,
          batteryLevel: null,
          hasLowBattery: false,
          isOffline: true,
        },
        LOCATION_ID,
      ),
    ).toEqual({
      device_id: "43",
      location_id: LOCATION_ID,
      name: "Driveway",
      type: "camera",
      power_mode: "wired",
      online: false,
      state: {},
    });
  });
});
