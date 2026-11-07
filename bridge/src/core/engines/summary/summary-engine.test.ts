// The Summary engine (T020), written before the engine: the overview's parts, the default device
// list, the health in the contract's shape, and the agent-economy budget on the 100-device home
// (SC-006, PT-22: tokens estimated as characters ÷ 3, rounded up).
import { describe, expect, it } from "vitest";
import { standardHome } from "../../../../test/scenarios/index.ts";
import {
  DATA_BUDGET_TOKENS,
  deviceList,
  estimateTokens,
  healthData,
  overview,
  TOKEN_BUDGET,
} from "./index.ts";
import type { SummaryDevice, SummaryLocation } from "./index.ts";

const NOW = Date.UTC(2026, 10, 7, 9, 0, 0);
const SEEN = NOW - 60_000;
const THRESHOLD = 20;

const HOME: SummaryLocation = {
  location_id: "loc-1",
  name: "בית",
  time_zone: "Asia/Jerusalem",
  ownership: "owned",
  alarm_mode: "home",
};

function device(
  id: string,
  type: SummaryDevice["type"],
  extra: Partial<SummaryDevice> = {},
): SummaryDevice {
  return {
    device_id: id,
    name: `Device ${id}`,
    type,
    power_mode: "battery",
    online: true,
    state: {},
    as_of: SEEN,
    ...extra,
  };
}

const UP = {
  home_link_status: "up",
  home_link_since: NOW - 3_600_000,
  ring_session_status: "ok",
  ring_session_since: NOW - 3_600_000,
  outbox_depth: 0,
  as_of: NOW - 10_000,
} as const;

describe("the Summary engine: the overview", () => {
  it("lists open contacts, active motion, offline devices and low batteries, each by its device reference", () => {
    const devices = [
      device("d-open", "contact", { state: { open: true }, room: "מטבח" }),
      device("d-shut", "contact", { state: { open: false } }),
      device("d-moving", "motion", { state: { motion: true } }),
      device("d-still", "motion", { state: { motion: false } }),
      device("d-gone", "light", { online: false, power_mode: "wired" }),
      device("d-at", "flood", { battery_pct: 20 }),
      device("d-above", "flood", { battery_pct: 21 }),
      device("d-flagged", "keypad", { battery_pct: 90, battery_low: true }),
    ];

    const data = overview(
      { location: HOME, devices, health: UP, now: NOW },
      { batteryThresholdPct: THRESHOLD, budgetTokens: DATA_BUDGET_TOKENS },
    );

    expect(data).toEqual({
      location: {
        location_id: "loc-1",
        name: "בית",
        time_zone: "Asia/Jerusalem",
        ownership: "owned",
      },
      alarm_mode: "home",
      open_contacts: [{ id: "d-open", name: "Device d-open", room: "מטבח" }],
      active_motion: [
        {
          device: { id: "d-moving", name: "Device d-moving" },
          last_motion_at: new Date(SEEN).toISOString(),
        },
      ],
      offline_devices: [{ id: "d-gone", name: "Device d-gone" }],
      low_batteries: [
        { device: { id: "d-at", name: "Device d-at" }, battery_pct: 20 },
        {
          device: { id: "d-flagged", name: "Device d-flagged" },
          battery_pct: 90,
        },
      ],
      health: healthData(UP, NOW),
    });
  });

  it("leaves out the alarm mode for a location without an alarm", () => {
    const noAlarm: SummaryLocation = {
      location_id: HOME.location_id,
      name: HOME.name,
      time_zone: HOME.time_zone,
      ownership: HOME.ownership,
    };

    const data = overview(
      { location: noAlarm, devices: [], health: UP, now: NOW },
      { batteryThresholdPct: THRESHOLD, budgetTokens: DATA_BUDGET_TOKENS },
    );

    expect(data).not.toHaveProperty("alarm_mode");
  });
});

describe("the Summary engine: the health", () => {
  it("gives the get_health fields in UTC text, the store up because the reply was read from it", () => {
    expect(
      healthData(
        {
          ...UP,
          home_link_status: "down",
          home_link_since: NOW - 200_000,
          stale_since: NOW - 200_000,
        },
        NOW,
      ),
    ).toEqual({
      home_link: {
        status: "down",
        since: new Date(NOW - 200_000).toISOString(),
      },
      ring_session: {
        status: "ok",
        since: new Date(NOW - 3_600_000).toISOString(),
      },
      stale_since: new Date(NOW - 200_000).toISOString(),
      database: { status: "ok" },
    });
  });

  it("shows a home that never reported as down, and its Ring session as unavailable, since now", () => {
    expect(healthData(undefined, NOW)).toEqual({
      home_link: { status: "down", since: new Date(NOW).toISOString() },
      ring_session: {
        status: "unavailable",
        since: new Date(NOW).toISOString(),
      },
      database: { status: "ok" },
    });
  });
});

describe("the Summary engine: the device list", () => {
  it("lists each device's id, name, type, room, battery, power mode and online status, and how many there are", () => {
    const list = deviceList(
      [
        device("d-1", "contact", {
          room: "כניסה",
          battery_pct: 70,
          battery_low: false,
        }),
        device("d-2", "light", { power_mode: "wired", online: false }),
      ],
      DATA_BUDGET_TOKENS,
    );

    expect(list).toEqual({
      devices: [
        {
          id: "d-1",
          name: "Device d-1",
          type: "contact",
          room: "כניסה",
          battery_pct: 70,
          power_mode: "battery",
          online: true,
        },
        {
          id: "d-2",
          name: "Device d-2",
          type: "light",
          power_mode: "wired",
          online: false,
        },
      ],
      count: 2,
    });
  });
});

describe("the Summary engine: the agent-economy budget (SC-006)", () => {
  const home = standardHome();
  const devices: SummaryDevice[] = home.devices.map((entry) => ({
    ...entry,
    as_of: SEEN,
  }));
  const location = home.locations[0];

  it("estimates tokens as characters ÷ 3, rounded up (PT-22)", () => {
    expect(estimateTokens("abc")).toBe(Math.ceil('"abc"'.length / 3));
    expect(estimateTokens({ a: 1 })).toBe(Math.ceil('{"a":1}'.length / 3));
  });

  it("keeps the overview and the default device list of the 100-device home within 8,000 tokens", () => {
    expect(devices).toHaveLength(100);
    if (location === undefined) {
      throw new Error("The standard home has no location.");
    }

    const data = overview(
      { location, devices, health: UP, now: NOW },
      { batteryThresholdPct: THRESHOLD, budgetTokens: DATA_BUDGET_TOKENS },
    );
    const list = deviceList(devices, DATA_BUDGET_TOKENS);

    expect(estimateTokens(data)).toBeLessThanOrEqual(DATA_BUDGET_TOKENS);
    expect(estimateTokens(list)).toBeLessThanOrEqual(DATA_BUDGET_TOKENS);
    expect(list.devices).toHaveLength(100);
    expect(DATA_BUDGET_TOKENS).toBeLessThan(TOKEN_BUDGET);
  });

  it("trims a home too large for the budget, keeping the full count", () => {
    const many = Array.from({ length: 1_000 }, (_, index) =>
      device(`d-${String(index).padStart(4, "0")}`, "contact", {
        name: "חיישן דלת במטבח הגדול",
        room: "מטבח",
        state: { open: true },
        online: false,
        battery_pct: 5,
      }),
    );

    const list = deviceList(many, DATA_BUDGET_TOKENS);
    const data = overview(
      { location: HOME, devices: many, health: UP, now: NOW },
      { batteryThresholdPct: THRESHOLD, budgetTokens: DATA_BUDGET_TOKENS },
    );

    expect(estimateTokens(list)).toBeLessThanOrEqual(DATA_BUDGET_TOKENS);
    expect(list.count).toBe(1_000);
    expect(list.devices.length).toBeLessThan(1_000);
    expect(list.devices[0]?.id).toBe("d-0000");
    expect(estimateTokens(data)).toBeLessThanOrEqual(DATA_BUDGET_TOKENS);
    expect(data.open_contacts.length).toBeGreaterThan(0);
    expect(data.health).toEqual(healthData(UP, NOW));
  });
});
