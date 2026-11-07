// State (T019) on SQLite and on SQL Server: latest-wins by state_version for locations and
// devices (PT-30, DRIFT-001-06, DRIFT-001-08), `type` mapped from `kind` (PT-26), what a full
// snapshot removes, the same input taken on both dialects, the health snapshot, and the
// store-down error.
import { expect, it } from "vitest";
import {
  StateStore,
  StateStoreError,
} from "../../src/core/access/state/index.ts";
import type {
  DeviceState,
  LocationState,
  StateStoreErrorKind,
} from "../../src/core/access/state/index.ts";
import { FakeClock } from "../../src/utilities/clock/index.ts";
import {
  CORE_MIGRATIONS,
  runMigrations,
} from "../../src/utilities/query-layer/index.ts";
import type { QueryLayer } from "../../src/utilities/query-layer/index.ts";
import { describeStoreMatrix, requireSqlServerInCi } from "../support/index.ts";

const AS_OF = Date.UTC(2026, 10, 7, 9, 0, 0);
const HEBREW_NAME = "דלת כניסה";
const HEBREW_ROOM = "מטבח";

const HOME: LocationState = {
  location_id: "loc-1",
  name: "בית",
  ownership: "owned",
  time_zone: "Asia/Jerusalem",
  alarm_mode: "home",
  as_of: AS_OF,
  state_version: 1,
};

const DOOR: DeviceState = {
  device_id: "d-door",
  location_id: "loc-1",
  name: HEBREW_NAME,
  type: "contact",
  room: HEBREW_ROOM,
  battery_pct: 80,
  battery_low: false,
  power_mode: "battery",
  online: true,
  state: { open: false },
  as_of: AS_OF,
  state_version: 2,
};

const SIREN: DeviceState = {
  device_id: "d-siren",
  location_id: "loc-1",
  name: "Siren",
  type: "other",
  power_mode: "wired",
  online: true,
  state: {},
  as_of: AS_OF,
  state_version: 3,
};

function never(): AbortSignal {
  return new AbortController().signal;
}

async function failureOf(work: Promise<unknown>): Promise<unknown> {
  try {
    await work;
  } catch (error) {
    return error;
  }
  throw new Error("expected the work to fail");
}

async function expectStoreError(
  work: Promise<unknown>,
  kind: StateStoreErrorKind,
): Promise<StateStoreError> {
  const error = await failureOf(work);
  if (!(error instanceof StateStoreError)) {
    throw new Error("expected a StateStoreError", { cause: error });
  }
  expect(error.kind).toBe(kind);
  return error;
}

requireSqlServerInCi();

describeStoreMatrix("State", (store) => {
  async function setUp(): Promise<{ state: StateStore; layer: QueryLayer }> {
    const clock = new FakeClock(AS_OF);
    const layer = await store.emptyDatabase();
    await runMigrations(layer, CORE_MIGRATIONS, { clock }, never());
    return { state: new StateStore({ store: layer }), layer };
  }

  it("stores an inventory and reads it back, with `type` for `kind` and names as written", async () => {
    const { state } = await setUp();

    await expect(
      state.applyInventory(
        { locations: [HOME], devices: [DOOR, SIREN] },
        never(),
      ),
    ).resolves.toEqual({ refused: 0, removed: 0 });

    await expect(state.locations(never())).resolves.toEqual([HOME]);
    await expect(state.location("loc-1", never())).resolves.toEqual(HOME);
    await expect(state.devices({}, never())).resolves.toEqual([DOOR, SIREN]);
    await expect(state.device("d-siren", never())).resolves.toEqual(SIREN);
    await expect(state.device("nope", never())).resolves.toBeUndefined();
    await expect(state.location("nope", never())).resolves.toBeUndefined();
  });

  it("filters devices by location, type and room, the room matched exactly", async () => {
    const { state } = await setUp();
    const other: LocationState = {
      ...HOME,
      location_id: "loc-2",
      state_version: 4,
    };
    const garage: DeviceState = {
      ...DOOR,
      device_id: "d-garage",
      location_id: "loc-2",
      room: "Garage",
      state_version: 5,
    };
    await state.applyInventory(
      { locations: [HOME, other], devices: [DOOR, SIREN, garage] },
      never(),
    );

    const ids = async (filter: Parameters<StateStore["devices"]>[0]) =>
      (await state.devices(filter, never())).map((device) => device.device_id);
    await expect(ids({ location_id: "loc-1" })).resolves.toEqual([
      "d-door",
      "d-siren",
    ]);
    await expect(ids({ type: "contact" })).resolves.toEqual([
      "d-door",
      "d-garage",
    ]);
    await expect(ids({ room: HEBREW_ROOM })).resolves.toEqual(["d-door"]);
    await expect(ids({ room: "garage" })).resolves.toEqual([]);
    await expect(
      ids({ location_id: "loc-2", type: "contact", room: "Garage" }),
    ).resolves.toEqual(["d-garage"]);
  });

  it("applies a device or a location only when its version is higher, keeping the full newer entry", async () => {
    const { state } = await setUp();
    await state.applyInventory({ locations: [HOME], devices: [DOOR] }, never());
    const newer: DeviceState = {
      ...DOOR,
      online: false,
      battery_pct: 10,
      state_version: 11,
    };

    await expect(state.applyDevice(newer, never())).resolves.toBe("applied");
    await expect(
      state.applyDevice(
        { ...DOOR, battery_pct: 99, state_version: 10 },
        never(),
      ),
    ).resolves.toBe("older");
    await expect(
      state.applyDevice({ ...DOOR, state_version: 11 }, never()),
    ).resolves.toBe("older");
    await expect(state.device("d-door", never())).resolves.toEqual(newer);

    await state.applyInventory(
      {
        locations: [{ ...HOME, alarm_mode: "away", state_version: 20 }],
        devices: [],
      },
      never(),
    );
    await state.applyInventory(
      {
        locations: [{ ...HOME, alarm_mode: "disarmed", state_version: 12 }],
        devices: [],
      },
      never(),
    );
    await expect(state.location("loc-1", never())).resolves.toMatchObject({
      alarm_mode: "away",
      state_version: 20,
    });
  });

  it("removes what a newer snapshot no longer lists, and nothing on a resent older one", async () => {
    const { state } = await setUp();
    const camera: DeviceState = {
      ...DOOR,
      device_id: "d-camera",
      type: "camera",
      state_version: 4,
    };
    await state.applyInventory(
      { locations: [HOME], devices: [DOOR, SIREN, camera] },
      never(),
    );
    const later = { ...SIREN, state_version: 30 };
    await state.applyDevice(later, never());

    const resent = await state.applyInventory(
      { locations: [HOME], devices: [DOOR] },
      never(),
    );
    expect(resent.removed).toBe(0);

    const fresh = await state.applyInventory(
      {
        locations: [{ ...HOME, state_version: 21 }],
        devices: [{ ...DOOR, state_version: 22 }],
      },
      never(),
    );

    expect(fresh).toEqual({ refused: 0, removed: 1 });
    await expect(
      state
        .devices({}, never())
        .then((devices) => devices.map((device) => device.device_id)),
    ).resolves.toEqual(["d-door", "d-siren"]);
  });

  it("removes a location no longer listed once none of its devices is left", async () => {
    const { state } = await setUp();
    const away: LocationState = {
      ...HOME,
      location_id: "loc-2",
      state_version: 2,
    };
    const awayDoor: DeviceState = {
      ...DOOR,
      device_id: "d-away",
      location_id: "loc-2",
      state_version: 3,
    };
    await state.applyInventory(
      { locations: [HOME, away], devices: [DOOR, awayDoor] },
      never(),
    );

    const fresh = await state.applyInventory(
      {
        locations: [{ ...HOME, state_version: 10 }],
        devices: [{ ...DOOR, state_version: 11 }],
      },
      never(),
    );

    expect(fresh.removed).toBe(2);
    await expect(
      state
        .locations(never())
        .then((locations) => locations.map((location) => location.location_id)),
    ).resolves.toEqual(["loc-1"]);
  });

  it("starts over after a version reset, so a new connector's lower versions win", async () => {
    const { state } = await setUp();
    await state.applyInventory(
      {
        locations: [{ ...HOME, state_version: 500 }],
        devices: [
          { ...DOOR, state_version: 501 },
          { ...SIREN, state_version: 502 },
        ],
      },
      never(),
    );

    await state.resetVersions(never());
    const first = await state.applyInventory(
      {
        locations: [{ ...HOME, name: "New", state_version: 1 }],
        devices: [{ ...DOOR, online: false, state_version: 2 }],
      },
      never(),
    );

    expect(first.removed).toBe(1);
    await expect(state.location("loc-1", never())).resolves.toMatchObject({
      name: "New",
      state_version: 1,
    });
    await expect(state.devices({}, never())).resolves.toEqual([
      { ...DOOR, online: false, state_version: 2 },
    ]);
  });

  it("reports a device change for a location it does not hold, changing nothing", async () => {
    const { state } = await setUp();

    await expect(state.applyDevice(DOOR, never())).resolves.toBe(
      "unknown_location",
    );
    await expect(state.devices({}, never())).resolves.toEqual([]);
  });

  it("takes the same input on both dialects: long ids left out and counted, long names cut to fit", async () => {
    const { state } = await setUp();
    const longId: DeviceState = { ...SIREN, device_id: "d".repeat(129) };
    const longZone: LocationState = {
      ...HOME,
      location_id: "loc-2",
      time_zone: "z".repeat(65),
    };
    const orphan: DeviceState = {
      ...SIREN,
      device_id: "d-orphan",
      location_id: "loc-2",
    };
    const longName: DeviceState = {
      ...DOOR,
      name: `${"א".repeat(399)}😀`,
      room: "r".repeat(401),
    };

    await expect(
      state.applyInventory(
        { locations: [HOME, longZone], devices: [longName, longId, orphan] },
        never(),
      ),
    ).resolves.toEqual({ refused: 3, removed: 0 });
    await expect(state.applyDevice(longId, never())).resolves.toBe("refused");

    const stored = await state.device("d-door", never());
    expect(stored?.name).toBe("א".repeat(399));
    expect(stored?.room).toBe("r".repeat(400));
    await expect(state.locations(never())).resolves.toHaveLength(1);
  });

  it("keeps the health snapshot, leaving out what is not known", async () => {
    const { state } = await setUp();
    await expect(state.health(never())).resolves.toBeUndefined();

    await state.saveHealth(
      {
        home_link_status: "up",
        home_link_since: AS_OF - 1_000,
        ring_session_status: "ok",
        ring_session_since: AS_OF - 2_000,
        outbox_depth: 0,
        connector_version: "0.1.0",
        as_of: AS_OF,
      },
      never(),
    );
    await state.saveHealth(
      {
        home_link_status: "down",
        home_link_since: AS_OF,
        stale_since: AS_OF,
        as_of: AS_OF + 1,
      },
      never(),
    );

    await expect(state.health(never())).resolves.toEqual({
      home_link_status: "down",
      home_link_since: AS_OF,
      stale_since: AS_OF,
      as_of: AS_OF + 1,
    });
    await expect(
      state.saveHealth(
        { connector_version: "v".repeat(65), as_of: AS_OF },
        never(),
      ),
    ).rejects.toThrow(RangeError);
  });

  it("reports a row it did not write as failed, quoting nothing from it", async () => {
    const { state, layer } = await setUp();
    await state.applyInventory({ locations: [HOME], devices: [] }, never());
    for (const sql of [
      `INSERT INTO device (device_id, location_id, name, kind, power_mode, online, state, as_of, state_version) VALUES ('bad-kind', 'loc-1', '${HEBREW_NAME}', 'toaster', 'wired', 1, '{}', 0, 1)`,
      `INSERT INTO device (device_id, location_id, name, kind, power_mode, online, state, as_of, state_version) VALUES ('bad-state', 'loc-1', 'n', 'other', 'wired', 1, '${HEBREW_NAME}', 0, 1)`,
    ]) {
      await layer.run({ sql: `DELETE FROM device`, params: {} }, never());
      await layer.run({ sql, params: {} }, never());
      const error = await expectStoreError(
        state.devices({}, never()),
        "failed",
      );
      expect(error.cause).toBeUndefined();
      expect(error.message).not.toContain(HEBREW_NAME);
    }
  });

  it("reports a database it cannot reach as unavailable: the store-down error", async () => {
    const { state, layer } = await setUp();
    await layer.close();

    for (const work of [
      () => state.applyInventory({ locations: [HOME], devices: [] }, never()),
      () => state.applyDevice(DOOR, never()),
      () => state.locations(never()),
      () => state.location("loc-1", never()),
      () => state.devices({}, never()),
      () => state.device("d-door", never()),
      () => state.health(never()),
      () => state.saveHealth({ as_of: AS_OF }, never()),
      () => state.resetVersions(never()),
    ]) {
      const error = await expectStoreError(work(), "unavailable");
      expect(error.cause).toMatchObject({ kind: "store_down" });
    }
  });

  it("lets the caller's abort through unchanged", async () => {
    const { state } = await setUp();
    const controller = new AbortController();
    const reason = new Error("caller left");
    controller.abort(reason);

    await expect(state.locations(controller.signal)).rejects.toBe(reason);
  });
});
