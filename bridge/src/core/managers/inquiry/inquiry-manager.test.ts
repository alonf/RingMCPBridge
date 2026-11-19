// The Inquiry manager (T021) over a real State and Settings on SQLite and the fake clock: the four
// read tools, an omitted location_id, NOT_FOUND, shared locations hidden, the reply's freshness
// (cached, stale while the home is silent or Ring is down, stale for a home that never reported),
// the store down as `unavailable`, and the whole reply within the budget on the 100-device home.
import { afterEach, describe, expect, it } from "vitest";
import { standardHome } from "../../../../test/scenarios/index.ts";
import { EventLog } from "../../access/event-log/index.ts";
import { SettingsStore } from "../../access/settings/index.ts";
import { CursorStore } from "../../access/subscriptions/index.ts";
import { StateStore, StateStoreError } from "../../access/state/index.ts";
import type { DeviceState, LocationState } from "../../access/state/index.ts";
import {
  afterHeartbeat,
  afterRefresh,
  afterSessionOpened,
} from "../../engines/health/index.ts";
import type { HealthView } from "../../engines/health/index.ts";
import { estimateTokens, TOKEN_BUDGET } from "../../engines/summary/index.ts";
import { FakeClock, formatUtc } from "../../../utilities/clock/index.ts";
import {
  CORE_MIGRATIONS,
  openSqliteQueryLayer,
  QueryLayerError,
  runMigrations,
} from "../../../utilities/query-layer/index.ts";
import type { QueryLayer } from "../../../utilities/query-layer/index.ts";
import { inquiryEventParts } from "../../../../test/support/index.ts";
import { InquiryError, InquiryManager } from "./index.ts";

const START = Date.UTC(2026, 10, 7, 9, 0, 0);
const OFFLINE_AFTER_MS = 120_000;
const THRESHOLD = 20;
const never = new AbortController().signal;

const HOME: LocationState = {
  location_id: "loc-1",
  name: "בית",
  ownership: "owned",
  time_zone: "Asia/Jerusalem",
  alarm_mode: "home",
  as_of: START,
  state_version: 1,
};

function device(id: string, extra: Partial<DeviceState> = {}): DeviceState {
  return {
    device_id: id,
    location_id: HOME.location_id,
    name: `Device ${id}`,
    type: "contact",
    power_mode: "battery",
    online: true,
    state: { open: false },
    as_of: START,
    state_version: 2,
    ...extra,
  };
}

const DOOR = device("d-door", {
  name: "דלת כניסה",
  room: "כניסה",
  battery_pct: 80,
  state: { open: true },
});
const MOTION = device("d-motion", {
  type: "motion",
  room: "סלון",
  battery_pct: 15,
  state: { motion: false },
});
const LIGHT = device("d-light", {
  type: "light",
  room: "כניסה",
  power_mode: "wired",
  state: { on: true },
});

// A session whose own inventory is stored, then a heartbeat: the data is fresh.
const UP: HealthView = afterHeartbeat(
  afterRefresh(afterSessionOpened(undefined, "0.1.0", START)),
  { ring_session: "ok", outbox_depth: 0, inventory_owed: false },
  START,
);

/** The real Query layer, whose reads can be made to fail as the store being down. */
function failing(layer: QueryLayer): {
  store: QueryLayer;
  cut: () => void;
} {
  let down = false;
  const store = new Proxy(layer, {
    get(target, property) {
      if (down && (property === "get" || property === "all")) {
        return () =>
          Promise.reject(new QueryLayerError("store_down", "The test cut it."));
      }
      const value: unknown = Reflect.get(target, property, target);
      if (typeof value !== "function") {
        return value;
      }
      const method = value as (...args: unknown[]) => unknown;
      return method.bind(target);
    },
  });
  return {
    store,
    cut: () => {
      down = true;
    },
  };
}

interface Harness {
  readonly clock: FakeClock;
  readonly state: StateStore;
  readonly settings: SettingsStore;
  readonly inquiry: InquiryManager;
  readonly cut: () => void;
  readonly layer: QueryLayer;
  readonly events: EventLog;
}

const stops: (() => Promise<void>)[] = [];

afterEach(async () => {
  for (const stop of stops.splice(0).reverse()) {
    await stop();
  }
});

async function harness(
  locations: readonly LocationState[] = [HOME],
  devices: readonly DeviceState[] = [DOOR, MOTION, LIGHT],
  health: HealthView | "never_reported" = UP,
): Promise<Harness> {
  const clock = new FakeClock(START);
  const layer = openSqliteQueryLayer(":memory:", { clock });
  stops.push(() => layer.close());
  await runMigrations(layer, CORE_MIGRATIONS, { clock }, never);
  const { store, cut } = failing(layer);
  const state = new StateStore({ store });
  const settings = new SettingsStore({
    store,
    clock,
    defaultBatteryThresholdPct: THRESHOLD,
  });
  await state.applyInventory(
    { snapshot_version: 0, locations, devices },
    never,
  );
  if (health !== "never_reported") {
    await state.saveHealth(health, never);
  }
  const inquiry = new InquiryManager({
    state,
    settings,
    clock,
    homeOfflineAfterMs: OFFLINE_AFTER_MS,
    store,
    eventLog: new EventLog({ clock }),
    cursors: new CursorStore({ store, clock }),
  });
  return {
    clock,
    state,
    settings,
    inquiry,
    cut,
    layer,
    events: new EventLog({ clock }),
  };
}

async function rejection(work: Promise<unknown>): Promise<InquiryError> {
  const error: unknown = await work.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  if (!(error instanceof InquiryError)) {
    throw new Error("The call did not fail with an InquiryError.");
  }
  return error;
}

describe("the Inquiry manager: the read tools", () => {
  it("gives the overview of the only owned location when none is named, as of the home's last sign of life", async () => {
    const test = await harness();
    await test.clock.advance(30_000);

    const reply = await test.inquiry.getOverview({}, never);

    expect(reply).toMatchObject({
      as_of: "2026-11-07T09:00:00.000Z",
      as_of_local: "2026-11-07T11:00:00.000+02:00",
      freshness: "cached",
    });
    expect(reply).not.toHaveProperty("stale_since");
    expect(reply.data).toMatchObject({
      location: { location_id: "loc-1", name: "בית", ownership: "owned" },
      alarm_mode: "home",
      open_contacts: [{ id: "d-door", name: "דלת כניסה", room: "כניסה" }],
      low_batteries: [
        {
          device: { id: "d-motion", name: "Device d-motion" },
          battery_pct: 15,
        },
      ],
      health: { home_link: { status: "up" }, ring_session: { status: "ok" } },
    });
  });

  it("counts a battery low by the owner's threshold in Settings", async () => {
    const test = await harness();
    await test.settings.setBatteryThresholdPct(80, never);

    const reply = await test.inquiry.getOverview({}, never);

    expect(reply.data.low_batteries.map((entry) => entry.device.id)).toEqual([
      "d-door",
      "d-motion",
    ]);
  });

  it("lists the devices, filtered by type and by room, names as written", async () => {
    const test = await harness();

    const all = await test.inquiry.listDevices({}, never);
    const lights = await test.inquiry.listDevices({ type: "light" }, never);
    const entrance = await test.inquiry.listDevices({ room: "כניסה" }, never);

    expect(all.data.count).toBe(3);
    expect(all.data.devices.map((entry) => entry.name)).toContain("דלת כניסה");
    expect(lights.data).toEqual({
      devices: [
        {
          id: "d-light",
          name: "Device d-light",
          type: "light",
          room: "כניסה",
          power_mode: "wired",
          online: true,
        },
      ],
      count: 1,
    });
    expect(entrance.data.devices.map((entry) => entry.id)).toEqual([
      "d-door",
      "d-light",
    ]);
  });

  it("gives one device's full entry", async () => {
    const test = await harness();

    const reply = await test.inquiry.getDevice({ device_id: "d-door" }, never);

    expect(reply.freshness).toBe("cached");
    expect(reply.data).toEqual({
      device: {
        id: "d-door",
        location_id: "loc-1",
        name: "דלת כניסה",
        type: "contact",
        room: "כניסה",
        battery_pct: 80,
        power_mode: "battery",
        online: true,
        state: { open: true },
        as_of: "2026-11-07T09:00:00.000Z",
      },
    });
  });

  it("answers NOT_FOUND for an unknown device and an unknown location", async () => {
    const test = await harness();

    const noDevice = await rejection(
      test.inquiry.getDevice({ device_id: "d-none" }, never),
    );
    const noLocation = await rejection(
      test.inquiry.listDevices({ location_id: "loc-none" }, never),
    );

    expect(noDevice.kind).toBe("not_found");
    expect(noLocation.kind).toBe("not_found");
  });

  it("gives the bridge's health in the owned location's local time", async () => {
    const test = await harness();

    const reply = await test.inquiry.getHealth(never);

    expect(reply.as_of_local).toBe("2026-11-07T11:00:00.000+02:00");
    expect(reply.data).toEqual({
      home_link: { status: "up", since: "2026-11-07T09:00:00.000Z" },
      ring_session: { status: "ok", since: "2026-11-07T09:00:00.000Z" },
      database: { status: "ok" },
    });
  });
});

// The home reads a camera's status from Ring only at an inventory, while the reply's own time is
// the home's last heartbeat (DRIFT-001-41).
describe("the Inquiry manager: a camera's status has its own time (CP-16 review follow-up)", () => {
  it("gives a camera's status the time it was read, while the reply's time moves on with the heartbeats", async () => {
    const camera = device("d-camera", {
      type: "camera",
      name: "Front",
      battery_pct: 5,
      online: false,
      state: {},
    });
    const test = await harness([HOME], [DOOR, camera]);
    const later = START + 3 * 3_600_000;
    await test.state.saveHealth(
      afterHeartbeat(
        UP,
        { ring_session: "ok", outbox_depth: 0, inventory_owed: false },
        later,
      ),
      never,
    );
    await test.clock.advance(later + 30_000 - START);

    const listed = await test.inquiry.listDevices({}, never);
    const home = await test.inquiry.getOverview({}, never);

    expect(listed).toMatchObject({
      as_of: formatUtc(later),
      freshness: "cached",
    });
    expect(
      listed.data.devices.find((entry) => entry.id === "d-camera"),
    ).toMatchObject({ online: false, battery_pct: 5, as_of: formatUtc(START) });
    expect(
      listed.data.devices.find((entry) => entry.id === "d-door"),
    ).not.toHaveProperty("as_of");
    expect(home.as_of).toBe(formatUtc(later));
    expect(home.data.offline_devices).toEqual([
      { id: "d-camera", name: "Front", as_of: formatUtc(START) },
    ]);
    expect(home.data.low_batteries).toContainEqual({
      device: { id: "d-camera", name: "Front" },
      battery_pct: 5,
      as_of: formatUtc(START),
    });
  });
});

describe("the Inquiry manager: a motion's own time (DRIFT-001-86)", () => {
  it("keeps `last_motion_at` at the motion's first report when a battery report comes five minutes later", async () => {
    const moving = { ...MOTION, state: { motion: true } };
    const test = await harness([HOME], [DOOR, moving]);
    const later = START + 5 * 60_000;

    await expect(
      test.state.applyDevice(
        { ...moving, battery_pct: 14, as_of: later, state_version: 3 },
        never,
      ),
    ).resolves.toBe("applied");
    const home = await test.inquiry.getOverview({}, never);

    expect(home.data.active_motion).toEqual([
      {
        device: { id: "d-motion", name: "Device d-motion", room: "סלון" },
        last_motion_at: formatUtc(START),
      },
    ]);
    expect(home.data.low_batteries).toContainEqual({
      device: { id: "d-motion", name: "Device d-motion", room: "סלון" },
      battery_pct: 14,
    });
  });
});

describe("the Inquiry manager: which location", () => {
  const other: LocationState = { ...HOME, location_id: "loc-2", name: "דירה" };
  const shared: LocationState = {
    ...HOME,
    location_id: "loc-shared",
    name: "Neighbours",
    ownership: "shared",
  };

  it("answers INVALID_ARGUMENT with the owned locations' ids when more than one is owned", async () => {
    const test = await harness([HOME, other, shared], []);

    const error = await rejection(test.inquiry.getOverview({}, never));

    expect(error.kind).toBe("invalid_argument");
    expect(error.details).toEqual({ location_ids: ["loc-1", "loc-2"] });
  });

  it("answers INVALID_ARGUMENT with no ids before the home has reported a location", async () => {
    const test = await harness([], [], "never_reported");

    const error = await rejection(test.inquiry.listDevices({}, never));

    expect(error.kind).toBe("invalid_argument");
    expect(error.details).toEqual({ location_ids: [] });
  });

  it("reads a named shared household’s alarm status and keeps the owned default", async () => {
    const test = await harness(
      [HOME, shared],
      [DOOR, device("d-theirs", { location_id: "loc-shared" })],
    );

    const resolved = await test.inquiry.getOverview({}, never);
    const named = await test.inquiry.getOverview(
      { location_id: "loc-shared" },
      never,
    );
    const theirs = await rejection(
      test.inquiry.getDevice({ device_id: "d-theirs" }, never),
    );

    expect(resolved.data.location.location_id).toBe("loc-1");
    expect(named.data.location.location_id).toBe("loc-shared");
    expect(named.data.alarm_mode).toBe(shared.alarm_mode);
    expect(theirs.kind).toBe("not_found");
  });

  it("writes the local time in UTC when the location's time zone is not one Intl knows", async () => {
    const test = await harness([{ ...HOME, time_zone: "Mars/Olympus_Mons" }]);

    const reply = await test.inquiry.getOverview({}, never);

    expect(reply.as_of_local).toBe("2026-11-07T09:00:00.000+00:00");
  });

  it("writes the health's local time in UTC before the home has reported a location", async () => {
    const test = await harness([], [], "never_reported");

    const reply = await test.inquiry.getHealth(never);

    expect(reply.as_of_local).toBe("2026-11-07T09:00:00.000+00:00");
  });
});

// DRIFT-001-81: the owner's choice first, then Ring's zone when Intl knows it, then UTC. In
// November, Tokyo is UTC+9 and Jerusalem UTC+2, so the offsets tell the zones apart.
const TOKYO_LOCAL = "2026-11-07T18:00:00.000+09:00";

describe("the Inquiry manager: the location's time zone", () => {
  it("uses the zone the owner chose over Ring's in every reply, and names it in the overview", async () => {
    const test = await harness();
    await test.settings.setLocationTimeZone("loc-1", "Asia/Tokyo", never);

    const overview = await test.inquiry.getOverview({}, never);
    const list = await test.inquiry.listDevices({}, never);
    const device = await test.inquiry.getDevice({ device_id: "d-door" }, never);
    const health = await test.inquiry.getHealth(never);
    const owner = await test.inquiry.getOwnerHealth(never);

    for (const reply of [overview, list, device, health]) {
      expect(reply.as_of_local).toBe(TOKYO_LOCAL);
    }
    expect(overview.data.location.time_zone).toBe("Asia/Tokyo");
    expect(owner).toMatchObject({
      time_zone: "Asia/Tokyo",
      time_zone_source: "owner",
      location_id: "loc-1",
    });
  });

  it("uses Ring's zone when the owner chose none, and UTC when Intl does not know Ring's, saying which", async () => {
    const ring = await harness();
    const unknown = await harness([
      { ...HOME, time_zone: "Mars/Olympus_Mons" },
    ]);
    const before = await harness([], [], "never_reported");

    expect(await ring.inquiry.getOwnerHealth(never)).toMatchObject({
      time_zone: "Asia/Jerusalem",
      time_zone_source: "ring",
    });
    expect(
      (await unknown.inquiry.getOverview({}, never)).data.location.time_zone,
    ).toBe("UTC");
    expect(await unknown.inquiry.getOwnerHealth(never)).toMatchObject({
      time_zone: "UTC",
      time_zone_source: "utc",
      location_id: "loc-1",
    });
    const none = await before.inquiry.getOwnerHealth(never);
    expect(none).toMatchObject({ time_zone: "UTC", time_zone_source: "utc" });
    expect(none).not.toHaveProperty("location_id");
  });
});

describe("the Inquiry manager: freshness (FR-006, SC-005)", () => {
  it("marks the last known state stale since the home's last sign of life once it is silent for two minutes", async () => {
    const test = await harness();
    await test.clock.advance(OFFLINE_AFTER_MS - 1);
    const before = await test.inquiry.getOverview({}, never);
    await test.clock.advance(1);

    const reply = await test.inquiry.getOverview({}, never);

    expect(before.freshness).toBe("cached");
    expect(reply).toMatchObject({
      as_of: "2026-11-07T09:00:00.000Z",
      freshness: "stale",
      stale_since: "2026-11-07T09:00:00.000Z",
    });
    expect(reply.data.open_contacts).toHaveLength(1);
    expect(reply.data.health.home_link.status).toBe("down");
  });

  it("marks the data stale since Ring stopped being ok, while the home is still up", async () => {
    const ringDown = afterHeartbeat(
      UP,
      { ring_session: "unavailable", outbox_depth: 0, inventory_owed: false },
      START + 15_000,
    );
    const test = await harness([HOME], [DOOR, MOTION, LIGHT], ringDown);
    await test.clock.advance(30_000);

    const reply = await test.inquiry.getDevice({ device_id: "d-door" }, never);

    expect(reply).toMatchObject({
      as_of: "2026-11-07T09:00:15.000Z",
      freshness: "stale",
      stale_since: "2026-11-07T09:00:15.000Z",
    });
  });

  it("gives the admin page the same health, its time zone, and the connector's version (T029)", async () => {
    const test = await harness(undefined, undefined, {
      ...UP,
      connector_version: "0.1.0",
    });
    const before = await harness([], [], "never_reported");

    const owner = await test.inquiry.getOwnerHealth(never);

    expect(owner.health).toEqual(await test.inquiry.getHealth(never));
    expect(owner.time_zone).toBe("Asia/Jerusalem");
    expect(owner.connector_version).toBe("0.1.0");
    const none = await before.inquiry.getOwnerHealth(never);
    expect(none.time_zone).toBe("UTC");
    expect(none).not.toHaveProperty("connector_version");
  });

  it("marks a home that never reported stale since now", async () => {
    const test = await harness([], [], "never_reported");

    const reply = await test.inquiry.getHealth(never);

    expect(reply).toMatchObject({
      as_of: "2026-11-07T09:00:00.000Z",
      freshness: "stale",
      stale_since: "2026-11-07T09:00:00.000Z",
    });
    expect(reply.data.home_link.status).toBe("down");
  });
});

// DRIFT-001-86 (a review of f3884bb): State's data and its health were read apart. A home that came
// back between the two reads lent its fresh health to data read before it: an old door and alarm
// mode in a `cached` reply, while the store already held the new ones. The health is now read
// first, so the data is never older than the reply says.
describe("the Inquiry manager: one picture per reply", () => {
  type DataRead = "locations" | "devices" | "device";

  // State, where the home comes back, with new data and fresh health, just after `trigger` reads
  // and before it answers. A health read that starts after the trigger's waits for the return, as a
  // read reaching the store a moment later would see it; one that starts before reads at once.
  function comingBack(state: StateStore, trigger: DataRead): StateStore {
    let back: Promise<void> | undefined;
    const comeBack = async (): Promise<void> => {
      await state.applyInventory(
        {
          snapshot_version: 3,
          locations: [{ ...HOME, alarm_mode: "away", state_version: 4 }],
          devices: [{ ...DOOR, state: { open: false }, state_version: 5 }],
        },
        never,
      );
      await state.saveHealth(UP, never);
    };
    return new Proxy(state, {
      get(target, property) {
        if (property === trigger) {
          return async (...args: unknown[]) => {
            const method = Reflect.get(target, property, target) as (
              ...args: unknown[]
            ) => Promise<unknown>;
            const read = method.apply(target, args);
            back ??= read.then(comeBack);
            await back;
            return read;
          };
        }
        if (property === "health") {
          return async (signal: AbortSignal) => {
            await back;
            return target.health(signal);
          };
        }
        const value: unknown = Reflect.get(target, property, target);
        return typeof value === "function"
          ? (value as (...args: unknown[]) => unknown).bind(target)
          : value;
      },
    });
  }

  async function replyOf(
    tool: "getOverview" | "listDevices" | "getDevice",
    trigger: DataRead,
  ): Promise<{ readonly freshness: string }> {
    const test = await harness([HOME], [DOOR], "never_reported");
    const inquiry = new InquiryManager({
      state: comingBack(test.state, trigger),
      settings: test.settings,
      clock: test.clock,
      homeOfflineAfterMs: OFFLINE_AFTER_MS,
      ...inquiryEventParts(test.layer, test.clock),
    });
    switch (tool) {
      case "getOverview":
        return inquiry.getOverview({}, never);
      case "listDevices":
        return inquiry.listDevices({}, never);
      case "getDevice":
        return inquiry.getDevice({ device_id: DOOR.device_id }, never);
    }
  }

  it.each([
    ["getOverview", "locations"],
    ["getOverview", "devices"],
    ["listDevices", "devices"],
    ["getDevice", "device"],
  ] as const)(
    "%s calls data read before the home came back (in %s) stale, never cached",
    async (tool, trigger) => {
      const reply = await replyOf(tool, trigger);

      expect(reply.freshness).toBe("stale");
    },
  );
});

describe("the Inquiry manager: the store down (FR-006)", () => {
  it("fails every read as unavailable, never with stale data", async () => {
    const test = await harness();
    test.cut();

    const errors = await Promise.all([
      rejection(test.inquiry.getOverview({ location_id: "loc-1" }, never)),
      rejection(test.inquiry.listDevices({}, never)),
      rejection(test.inquiry.getDevice({ device_id: "d-door" }, never)),
      rejection(test.inquiry.getHealth(never)),
    ]);

    for (const error of errors) {
      expect(error.kind).toBe("unavailable");
      expect(error.cause).toBeInstanceOf(StateStoreError);
    }
  });

  it("passes an abort through unchanged", async () => {
    const test = await harness();
    test.cut();
    const controller = new AbortController();
    controller.abort(new Error("The agent went away."));

    await expect(
      test.inquiry.getHealth(controller.signal),
    ).rejects.not.toBeInstanceOf(InquiryError);
  });
});

describe("the Inquiry manager: the agent-economy budget (SC-006)", () => {
  it("keeps the whole overview and device list replies of the 100-device home within 8,000 tokens", async () => {
    const home = standardHome();
    const test = await harness(
      home.locations.map((location) => ({
        ...location,
        as_of: START,
        state_version: 1,
      })),
      home.devices.map((entry, index) => ({
        ...entry,
        as_of: START,
        state_version: index + 2,
      })),
    );

    const summary = await test.inquiry.getOverview({}, never);
    const list = await test.inquiry.listDevices({}, never);

    expect(list.data.devices).toHaveLength(100);
    expect(estimateTokens(summary)).toBeLessThanOrEqual(TOKEN_BUDGET);
    expect(estimateTokens(list)).toBeLessThanOrEqual(TOKEN_BUDGET);
  });
});
