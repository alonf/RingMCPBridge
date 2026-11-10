// The four read tools' inputs and data (T011; contracts/mcp-tools.md "Inquiry").
import { describe, expect, it } from "vitest";
import {
  deviceData,
  deviceListData,
  getDeviceInput,
  getHealthInput,
  getOverviewInput,
  healthData,
  listDevicesInput,
  overviewData,
  TOOL_CATALOG,
} from "./inquiry-tools.ts";

const SINCE = "2026-10-25T09:00:00Z";
const DOOR = { id: "device-001", name: "דלת הכניסה", room: "כניסה" };
const HEALTH = {
  home_link: { status: "up", since: SINCE },
  ring_session: { status: "ok", since: SINCE },
  database: { status: "ok" },
};

describe("the tool inputs", () => {
  it("reject unknown fields", () => {
    expect(getHealthInput.safeParse({ verbose: true }).success).toBe(false);
    expect(getOverviewInput.safeParse({ location: "x" }).success).toBe(false);
  });

  it("make location_id optional and reject an empty one", () => {
    expect(getOverviewInput.parse({})).toEqual({});
    expect(listDevicesInput.safeParse({ location_id: "" }).success).toBe(false);
  });

  it("filter list_devices by a known type and a room", () => {
    expect(listDevicesInput.parse({ type: "contact", room: "כניסה" })).toEqual({
      type: "contact",
      room: "כניסה",
    });
    expect(listDevicesInput.safeParse({ type: "siren" }).success).toBe(false);
  });

  it("require get_device's device_id", () => {
    expect(getDeviceInput.safeParse({}).success).toBe(false);
    expect(getDeviceInput.parse({ device_id: "device-001" })).toEqual({
      device_id: "device-001",
    });
  });
});

describe("the tool data", () => {
  it("keeps names and rooms exactly as written, in any language", () => {
    const parsed = deviceListData.parse({
      devices: [
        {
          ...DOOR,
          type: "contact",
          battery_pct: 8,
          power_mode: "battery",
          online: true,
        },
      ],
      count: 1,
    });
    expect(parsed.devices[0]).toMatchObject(DOOR);
  });

  it("leaves out what Ring does not report: room, battery, alarm mode, push", () => {
    const wired = {
      id: "device-002",
      location_id: "location-1",
      name: "Hall light",
      type: "light",
      power_mode: "wired",
      online: true,
      state: { on: false },
      as_of: SINCE,
    };
    expect(deviceData.parse({ device: wired }).device).toEqual(wired);
    expect(healthData.parse(HEALTH)).toEqual(HEALTH);
    const overview = {
      location: {
        location_id: "location-1",
        name: "Home",
        time_zone: "Asia/Tokyo",
        ownership: "owned",
      },
      open_contacts: [DOOR],
      active_motion: [],
      offline_devices: [],
      low_batteries: [{ device: { id: "device-003", name: "Gate" } }],
      counts: {
        open_contacts: 1,
        active_motion: 0,
        offline_devices: 0,
        low_batteries: 1,
      },
      health: HEALTH,
    };
    expect(overviewData.parse(overview)).toEqual(overview);
  });

  it("bounds the battery level to 0 to 100", () => {
    const low = (level: number): boolean =>
      overviewData.shape.low_batteries.element.safeParse({
        device: DOOR,
        battery_pct: level,
      }).success;
    expect([low(0), low(100), low(-1), low(101), low(8.5)]).toEqual([
      true,
      true,
      false,
      false,
      false,
    ]);
  });
});

describe("the tool catalog", () => {
  it("lists the four iteration 001 read tools, all with the read scope", () => {
    expect(TOOL_CATALOG.map((tool) => [tool.name, tool.scope])).toEqual([
      ["get_overview", "read"],
      ["list_devices", "read"],
      ["get_device", "read"],
      ["get_health", "read"],
    ]);
  });
});
