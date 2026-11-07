// The Event manager's intake (T018) over a real State on SQLite, a real Pub/Sub and the fake clock:
// latest-wins with the two scenarios the plan names (DRIFT-001-06, DRIFT-001-08), versions that
// belong to one connector key, the home's health from heartbeats and silence, and the store-down
// error.
import { afterEach, describe, expect, it } from "vitest";
import { StateStore } from "../../access/state/index.ts";
import { FakeClock } from "../../../utilities/clock/index.ts";
import { PubSub } from "../../../utilities/pub-sub/index.ts";
import {
  CORE_MIGRATIONS,
  openSqliteQueryLayer,
  QueryLayerError,
  runMigrations,
} from "../../../utilities/query-layer/index.ts";
import type { QueryLayer } from "../../../utilities/query-layer/index.ts";
import { EventError, EventManager } from "./index.ts";
import type {
  EventTopics,
  HealthChanged,
  HomeLinkSession,
  IncomingDevice,
  IncomingInventory,
  IncomingLocation,
} from "./index.ts";

const START = Date.UTC(2026, 10, 7, 9, 0, 0);
const OFFLINE_AFTER_MS = 120_000;
const never = new AbortController().signal;

const SESSION_A: HomeLinkSession = {
  session_id: "session-a",
  key_id: "key-aaaaaaaaaaaa",
  connector_version: "0.1.0",
  version: 1,
};
const SESSION_B: HomeLinkSession = {
  ...SESSION_A,
  session_id: "session-b",
  key_id: "key-bbbbbbbbbbbb",
};

const HOME: IncomingLocation = {
  location_id: "loc-1",
  name: "בית",
  time_zone: "Asia/Jerusalem",
  alarm_mode: "home",
  ownership: "owned",
  as_of: START,
  state_version: 1,
};

const DOOR: IncomingDevice = {
  device_id: "d-door",
  location_id: "loc-1",
  name: "דלת כניסה",
  type: "contact",
  battery_pct: 80,
  power_mode: "battery",
  online: true,
  state: { open: false },
  as_of: START,
  state_version: 2,
};

/** An inventory whose own version the home drew just before its entries' versions. */
function inventory(
  messageId: string,
  locations: readonly IncomingLocation[],
  devices: readonly IncomingDevice[],
  sessionId?: string,
): IncomingInventory {
  const versions = [...locations, ...devices].map(
    (entry) => entry.state_version,
  );
  return {
    message_id: messageId,
    snapshot_version: versions.length === 0 ? 0 : Math.min(...versions) - 1,
    ...(sessionId === undefined ? {} : { session_id: sessionId }),
    locations,
    devices,
  };
}

/** The real Query layer, whose next `transaction` or `run` fails as the store being down. */
function failingOnce(layer: QueryLayer): {
  store: QueryLayer;
  failNext: (method: "transaction" | "run") => void;
} {
  let failing: "transaction" | "run" | undefined;
  const store = new Proxy(layer, {
    get(target, property) {
      if (property === failing) {
        failing = undefined;
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
    failNext: (method) => {
      failing = method;
    },
  };
}

interface Harness {
  readonly clock: FakeClock;
  readonly layer: QueryLayer;
  readonly state: StateStore;
  readonly event: EventManager;
  readonly published: HealthChanged[];
  readonly failures: unknown[];
  readonly events: PubSub<EventTopics>;
  readonly failNext: (method: "transaction" | "run") => void;
}

const stops: (() => Promise<void>)[] = [];

afterEach(async () => {
  for (const stop of stops.splice(0).reverse()) {
    await stop();
  }
});

async function harness(
  existing?: QueryLayer,
  clock = new FakeClock(START),
): Promise<Harness> {
  const layer = existing ?? openSqliteQueryLayer(":memory:", { clock });
  if (existing === undefined) {
    await runMigrations(layer, CORE_MIGRATIONS, { clock }, never);
    stops.push(() => layer.close());
  }
  const { store, failNext } = failingOnce(layer);
  const state = new StateStore({ store });
  const events = new PubSub<EventTopics>(() => undefined);
  const published: HealthChanged[] = [];
  events.subscribe("health.changed", (change) => {
    published.push(change);
  });
  const failures: unknown[] = [];
  const event = new EventManager({
    state,
    events,
    clock,
    homeOfflineAfterMs: OFFLINE_AFTER_MS,
    reportFailure: (error) => failures.push(error),
  });
  stops.push(() => event.stop());
  return { clock, layer, state, event, published, failures, events, failNext };
}

async function failureOf(work: Promise<unknown>): Promise<unknown> {
  try {
    await work;
  } catch (error) {
    return error;
  }
  throw new Error("expected the work to fail");
}

describe("Event: latest-wins into State", () => {
  it("loses no field when a change's commit fails and a newer one commits (DRIFT-001-06)", async () => {
    const test = await harness();
    await test.event.homeSessionOpened(SESSION_A, never);
    await test.event.inventory(
      inventory("m-1", [HOME], [DOOR]),
      SESSION_A,
      never,
    );
    const v10 = { ...DOOR, battery_pct: 40, state_version: 10 };
    const v11 = { ...v10, online: false, state_version: 11 };

    test.failNext("run");
    const failed = await failureOf(
      test.event.deviceState(
        { message_id: "m-10", device: v10 },
        SESSION_A,
        never,
      ),
    );
    expect(failed).toBeInstanceOf(EventError);
    expect(failed).toMatchObject({ kind: "unavailable" });
    await expect(
      test.event.deviceState(
        { message_id: "m-11", device: v11 },
        SESSION_A,
        never,
      ),
    ).resolves.toBe("applied");
    await expect(
      test.event.deviceState(
        { message_id: "m-10", device: v10 },
        SESSION_A,
        never,
      ),
    ).resolves.toBe("older");

    await expect(test.state.device("d-door", never)).resolves.toEqual(v11);
  });

  it("never rolls a location back when an older inventory's commit failed and it is resent (DRIFT-001-08)", async () => {
    const test = await harness();
    await test.event.homeSessionOpened(SESSION_A, never);
    const a = inventory(
      "m-a",
      [{ ...HOME, alarm_mode: "home", state_version: 5 }],
      [],
    );
    const b = inventory(
      "m-b",
      [{ ...HOME, alarm_mode: "away", state_version: 20 }],
      [],
    );

    test.failNext("transaction");
    await expect(
      failureOf(test.event.inventory(a, SESSION_A, never)),
    ).resolves.toMatchObject({ kind: "unavailable" });
    await expect(test.event.inventory(b, SESSION_A, never)).resolves.toEqual({
      kind: "applied",
      refused: 0,
      removed: 0,
    });
    await test.event.inventory(a, SESSION_A, never);

    await expect(test.state.location("loc-1", never)).resolves.toMatchObject({
      alarm_mode: "away",
      state_version: 20,
    });
  });

  it("ignores an equal or lower version, and asks for an inventory for a device it does not hold", async () => {
    const test = await harness();
    await test.event.homeSessionOpened(SESSION_A, never);
    await test.event.inventory(
      inventory("m-1", [HOME], [DOOR]),
      SESSION_A,
      never,
    );

    await expect(
      test.event.deviceState(
        { message_id: "m-2", device: { ...DOOR, online: false } },
        SESSION_A,
        never,
      ),
    ).resolves.toBe("older");
    await expect(
      test.event.deviceState(
        {
          message_id: "m-3",
          device: { ...DOOR, device_id: "d-new", state_version: 9 },
        },
        SESSION_A,
        never,
      ),
    ).resolves.toBe("needs_inventory");
    await expect(
      test.event.deviceState(
        {
          message_id: "m-4",
          device: { ...DOOR, device_id: "d".repeat(129), state_version: 9 },
        },
        SESSION_A,
        never,
      ),
    ).resolves.toBe("refused");
    await expect(test.state.device("d-door", never)).resolves.toMatchObject({
      online: true,
    });
  });
});

describe("Event: versions belong to one connector key", () => {
  it("lets a newly enrolled connector's first inventory win, and refuses the old key's later changes", async () => {
    const test = await harness();
    await test.event.homeSessionOpened(SESSION_A, never);
    await test.event.inventory(
      inventory(
        "m-1",
        [{ ...HOME, state_version: 500 }],
        [{ ...DOOR, state_version: 501 }],
      ),
      SESSION_A,
      never,
    );

    await test.event.homeSessionOpened(SESSION_B, never);
    await expect(
      test.event.inventory(
        inventory(
          "m-2",
          [{ ...HOME, name: "New", state_version: 1 }],
          [{ ...DOOR, battery_pct: 5, state_version: 2 }],
        ),
        SESSION_B,
        never,
      ),
    ).resolves.toMatchObject({ kind: "applied" });
    await expect(
      test.event.deviceState(
        {
          message_id: "m-3",
          device: { ...DOOR, battery_pct: 99, state_version: 600 },
        },
        SESSION_A,
        never,
      ),
    ).resolves.toBe("not_current");
    await expect(
      test.event.inventory(inventory("m-4", [], []), SESSION_A, never),
    ).resolves.toEqual({ kind: "not_current" });

    await expect(test.state.location("loc-1", never)).resolves.toMatchObject({
      name: "New",
    });
    await expect(test.state.device("d-door", never)).resolves.toMatchObject({
      battery_pct: 5,
      state_version: 2,
    });
  });

  it("keeps the versions across a core restart with the same connector", async () => {
    const first = await harness();
    await first.event.homeSessionOpened(SESSION_A, never);
    await first.event.inventory(
      inventory("m-1", [HOME], [{ ...DOOR, state_version: 50 }]),
      SESSION_A,
      never,
    );
    await first.event.stop();

    const restarted = await harness(first.layer, first.clock);
    await restarted.event.homeSessionOpened(SESSION_A, never);

    await expect(
      restarted.event.deviceState(
        {
          message_id: "m-old",
          device: { ...DOOR, online: false, state_version: 49 },
        },
        SESSION_A,
        never,
      ),
    ).resolves.toBe("older");
    await expect(
      restarted.state.device("d-door", never),
    ).resolves.toMatchObject({
      online: true,
      state_version: 50,
    });
  });
});

describe("Event: the home's health", () => {
  it("shows the home up from its session, takes the Ring session and outbox depth from heartbeats, and publishes each change", async () => {
    const test = await harness();
    await test.event.homeSessionOpened(SESSION_A, never);
    await test.clock.advance(15_000);
    await test.event.heartbeat(
      {
        ring_session: "ok",
        push: "off",
        outbox_depth: 4,
        last_ring_event_at: null,
        error_counts: {},
        as_of: START - 3_600_000,
      },
      SESSION_A,
      never,
    );
    await test.events.drain();

    await expect(test.state.health(never)).resolves.toEqual({
      home_link_status: "up",
      home_link_since: START,
      ring_session_status: "ok",
      ring_session_since: START + 15_000,
      outbox_depth: 4,
      connector_version: "0.1.0",
      as_of: START + 15_000,
      refresh_owed_since: START,
    });
    expect(test.published.map((change) => change.changed)).toEqual([
      ["home_link"],
      ["ring_session"],
    ]);
  });

  it("shows the home offline and stale after two silent minutes, publishes it, and brings it back on the next heartbeat", async () => {
    const test = await harness();
    await test.event.homeSessionOpened(SESSION_A, never);

    await test.clock.advance(OFFLINE_AFTER_MS - 1);
    await test.events.drain();
    await expect(test.state.health(never)).resolves.toMatchObject({
      home_link_status: "up",
    });
    await test.clock.advance(1);
    await test.event.inventory(inventory("m-x", [], []), SESSION_A, never);
    await test.events.drain();

    await expect(test.state.health(never)).resolves.toMatchObject({
      home_link_status: "down",
      home_link_since: START,
      stale_since: START,
    });
    expect(test.published.at(-1)?.changed).toEqual(["home_link"]);

    await test.event.heartbeat(
      {
        ring_session: "ok",
        push: "off",
        outbox_depth: 0,
        last_ring_event_at: null,
        error_counts: {},
        as_of: START,
      },
      SESSION_A,
      never,
    );
    await test.events.drain();
    const back = await test.state.health(never);
    expect(back).toMatchObject({
      home_link_status: "up",
      home_link_since: START + OFFLINE_AFTER_MS,
    });
    expect(back?.stale_since).toBeUndefined();
    expect(test.published.at(-1)?.changed).toEqual([
      "home_link",
      "ring_session",
    ]);
  });

  it("ignores a heartbeat from a key that is no longer current", async () => {
    const test = await harness();
    await test.event.homeSessionOpened(SESSION_A, never);
    await test.event.homeSessionOpened(
      { ...SESSION_B, connector_version: "0.2.0" },
      never,
    );

    await test.event.heartbeat(
      {
        ring_session: "lost",
        push: "off",
        outbox_depth: 99,
        last_ring_event_at: null,
        error_counts: {},
        as_of: START,
      },
      SESSION_A,
      never,
    );

    const health = await test.state.health(never);
    expect(health?.connector_version).toBe("0.2.0");
    expect(health?.ring_session_status).toBeUndefined();
    expect(health?.outbox_depth).toBeUndefined();
  });

  it("reports a silence check that fails, and nothing once stopped", async () => {
    const test = await harness();
    await test.event.homeSessionOpened(SESSION_A, never);
    test.failNext("run");

    await test.clock.advance(OFFLINE_AFTER_MS);
    await test.events.drain();
    await test.event.inventory(inventory("m-x", [], []), SESSION_A, never);

    expect(test.failures).toHaveLength(1);
    expect(test.failures[0]).toMatchObject({ kind: "unavailable" });
  });
});

describe("Event: fresh only once the session's own inventory is stored (CP-14 review round 3)", () => {
  it("keeps a refresh owed from the session's start until an inventory composed for that session is stored", async () => {
    const test = await harness();
    await test.event.homeSessionOpened(SESSION_A, never);
    await expect(test.state.health(never)).resolves.toMatchObject({
      refresh_owed_since: START,
    });

    await test.event.inventory(
      inventory("m-old", [HOME], [DOOR], "session-earlier"),
      SESSION_A,
      never,
    );
    await test.event.heartbeat(
      {
        ring_session: "ok",
        push: "off",
        outbox_depth: 0,
        last_ring_event_at: null,
        error_counts: {},
        as_of: START,
      },
      SESSION_A,
      never,
    );
    await expect(test.state.health(never)).resolves.toMatchObject({
      refresh_owed_since: START,
    });

    await test.event.inventory(
      inventory(
        "m-own",
        [{ ...HOME, state_version: 10 }],
        [{ ...DOOR, state_version: 11 }],
        SESSION_A.session_id,
      ),
      SESSION_A,
      never,
    );

    const health = await test.state.health(never);
    expect(health?.refresh_owed_since).toBeUndefined();
    expect(health?.home_link_status).toBe("up");
  });

  it("ends the refresh owed when the session's inventory comes again after its health could not be saved, though State skips it", async () => {
    const test = await harness();
    await test.event.homeSessionOpened(SESSION_A, never);
    const own = inventory("m-own", [HOME], [DOOR], SESSION_A.session_id);

    test.failNext("run");
    await expect(
      failureOf(test.event.inventory(own, SESSION_A, never)),
    ).resolves.toMatchObject({ kind: "unavailable" });
    await expect(test.state.devices({}, never)).resolves.toHaveLength(1);

    await expect(test.event.inventory(own, SESSION_A, never)).resolves.toEqual({
      kind: "older",
    });
    await expect(test.state.health(never)).resolves.not.toHaveProperty(
      "refresh_owed_since",
    );
  });
});

describe("Event: failures", () => {
  it("refuses a message as unavailable before any session's start is recorded, so it stays unacked (T018 follow-up)", async () => {
    const test = await harness();

    for (const work of [
      () =>
        test.event.inventory(inventory("m-1", [HOME], []), SESSION_A, never),
      () =>
        test.event.deviceState(
          { message_id: "m-2", device: DOOR },
          SESSION_A,
          never,
        ),
      () =>
        test.event.heartbeat(
          {
            ring_session: "ok",
            push: "off",
            outbox_depth: 0,
            last_ring_event_at: null,
            error_counts: {},
            as_of: START,
          },
          SESSION_A,
          never,
        ),
    ]) {
      const error = await failureOf(work());
      expect(error).toBeInstanceOf(EventError);
      expect(error).toMatchObject({ kind: "unavailable" });
    }
    await expect(test.state.locations(never)).resolves.toEqual([]);
  });

  it("passes on State's store-down error as its own, with the cause", async () => {
    const test = await harness();
    await test.event.homeSessionOpened(SESSION_A, never);
    await test.layer.close();

    const error = await failureOf(
      test.event.inventory(inventory("m-1", [HOME], []), SESSION_A, never),
    );

    expect(error).toBeInstanceOf(EventError);
    expect(error).toMatchObject({
      kind: "unavailable",
      cause: { kind: "unavailable" },
    });
  });

  it("refuses a threshold that is not a positive time", () => {
    expect(
      () =>
        new EventManager({
          state: {} as StateStore,
          events: new PubSub<EventTopics>(() => undefined),
          clock: new FakeClock(START),
          homeOfflineAfterMs: 0,
          reportFailure: () => undefined,
        }),
    ).toThrow(RangeError);
  });
});
