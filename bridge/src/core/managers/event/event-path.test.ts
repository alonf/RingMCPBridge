// The Event manager's event path (T047) on SQLite: one transaction per event across Classify, the
// Event Log, State and the Audit; the priority from the policy file; the late rule; a duplicate
// written once; a failed write that leaves nothing behind; the same event again after a restart,
// as when the core stops between its commit and its ack; and two locations in parallel, each in
// its own order. The link's side of the ack is in Connector Link's tests.
import { afterEach, describe, expect, it } from "vitest";
import { eventPathParts } from "../../../../test/support/index.ts";
import { StateStore } from "../../access/state/index.ts";
import type { DeviceState } from "../../access/state/index.ts";
import { FakeClock } from "../../../utilities/clock/index.ts";
import { PubSub } from "../../../utilities/pub-sub/index.ts";
import {
  CORE_MIGRATIONS,
  openSqliteQueryLayer,
  QueryLayerError,
  runMigrations,
} from "../../../utilities/query-layer/index.ts";
import type {
  QueryLayer,
  SqlSession,
} from "../../../utilities/query-layer/index.ts";
import { EventError, EventManager } from "./index.ts";
import type {
  EventStored,
  EventTopics,
  HomeLinkSession,
  IncomingDevice,
  IncomingEvent,
  IncomingLocation,
} from "./index.ts";

const START = Date.UTC(2026, 10, 17, 9, 0, 0);
const OFFLINE_AFTER_MS = 120_000;
const TWO_MINUTES_MS = 120_000;
const never = new AbortController().signal;
const ALL = 100;

const SESSION: HomeLinkSession = {
  session_id: "session-a",
  key_id: "key-aaaaaaaaaaaa",
  connector_version: "0.2.0",
  version: 1,
};
const OTHER_KEY: HomeLinkSession = {
  ...SESSION,
  session_id: "session-b",
  key_id: "key-bbbbbbbbbbbb",
};

function location(
  id: string,
  alarmMode?: "disarmed" | "home" | "away",
): IncomingLocation {
  return {
    location_id: id,
    name: "בית",
    time_zone: "Asia/Jerusalem",
    ...(alarmMode === undefined ? {} : { alarm_mode: alarmMode }),
    ownership: "owned",
    as_of: START,
    state_version: 1,
  };
}

const DOOR: IncomingDevice = {
  device_id: "d-door",
  location_id: "loc-1",
  name: "דלת כניסה",
  type: "contact",
  power_mode: "battery",
  online: true,
  state: { open: false },
  as_of: START,
  state_version: 2,
};
const HALL: IncomingDevice = {
  ...DOOR,
  device_id: "d-hall",
  name: "Hall motion",
  type: "motion",
  state: { motion: false },
  state_version: 3,
};
const CAMERA: IncomingDevice = {
  ...DOOR,
  device_id: "d-cam",
  name: "Yard camera",
  type: "camera",
  state: {},
  state_version: 4,
};

function event(
  id: string,
  changes: Partial<IncomingEvent> = {},
): IncomingEvent {
  return {
    event_id: id,
    location_id: "loc-1",
    kind: "doorbell.ding",
    occurred_at: START - 2_000,
    received_at: START - 1_000,
    summary: "Someone rang the front door.",
    from_history: false,
    arrived_at: START,
    ...changes,
  };
}

interface Harness {
  readonly clock: FakeClock;
  readonly layer: QueryLayer;
  readonly state: StateStore;
  readonly event: EventManager;
  readonly stored: EventStored[];
  /** Makes the next State write inside an event's transaction fail. */
  failNextStateWrite(): void;
  /** Makes the next transaction fail as the store being down. */
  failNextTransaction(): void;
  seqs(locationId: string): Promise<readonly number[]>;
  auditCount(): Promise<number>;
}

const stops: (() => Promise<void>)[] = [];

afterEach(async () => {
  for (const stop of stops.splice(0).reverse()) {
    await stop();
  }
});

async function harness(existing?: {
  layer: QueryLayer;
  clock: FakeClock;
}): Promise<Harness> {
  const clock = existing?.clock ?? new FakeClock(START);
  const layer = existing?.layer ?? openSqliteQueryLayer(":memory:", { clock });
  if (existing === undefined) {
    await runMigrations(layer, CORE_MIGRATIONS, { clock }, never);
    stops.push(() => layer.close());
  }
  let stateWriteFails = false;
  let transactionFails = false;
  // State whose next write inside an event's transaction fails, as the test asks.
  class FailingState extends StateStore {
    override applyDeviceIn(
      session: SqlSession,
      device: DeviceState,
      signal: AbortSignal,
    ): ReturnType<StateStore["applyDeviceIn"]> {
      if (stateWriteFails) {
        stateWriteFails = false;
        return Promise.reject(new Error("The test failed State's write."));
      }
      return super.applyDeviceIn(session, device, signal);
    }
  }
  const state = new FailingState({ store: layer });
  const failingState = state;
  const store = {
    transaction: <T>(
      work: (session: SqlSession) => Promise<T>,
      signal: AbortSignal,
    ): Promise<T> => {
      if (transactionFails) {
        transactionFails = false;
        return Promise.reject(
          new QueryLayerError("store_down", "The test cut the store."),
        );
      }
      return layer.transaction(work, signal);
    },
  };
  const events = new PubSub<EventTopics>(() => undefined);
  const stored: EventStored[] = [];
  events.subscribe("event.stored", (message) => {
    stored.push(message);
  });
  const parts = eventPathParts(store, clock);
  const manager = new EventManager({
    state: failingState,
    events,
    clock,
    homeOfflineAfterMs: OFFLINE_AFTER_MS,
    reportFailure: () => undefined,
    ...parts,
  });
  stops.push(async () => {
    await manager.stop();
    await events.drain();
  });
  await manager.homeSessionOpened(SESSION, never);
  return {
    clock,
    layer,
    state,
    event: manager,
    stored,
    failNextStateWrite: () => {
      stateWriteFails = true;
    },
    failNextTransaction: () => {
      transactionFails = true;
    },
    seqs: async (locationId) =>
      (
        await parts.eventLog.after(
          layer,
          { location_id: locationId, afterSeq: 0, limit: ALL },
          never,
        )
      ).map((entry) => entry.seq),
    auditCount: async () =>
      (
        await parts.audit.eventEntriesAfter(
          layer,
          { afterSeq: 0, limit: ALL },
          never,
        )
      ).length,
  };
}

async function withHome(
  alarmMode: "disarmed" | "home" | "away" = "disarmed",
): Promise<Harness> {
  const test = await harness();
  await test.event.inventory(
    {
      message_id: "m-1",
      snapshot_version: 0,
      locations: [location("loc-1", alarmMode)],
      devices: [DOOR, HALL, CAMERA],
    },
    SESSION,
    never,
  );
  return test;
}

async function storedPriority(
  test: Harness,
  incoming: IncomingEvent,
): Promise<string | undefined> {
  await test.event.event(incoming, SESSION, never);
  const [entry] = await eventsOf(test, incoming.location_id);
  return entry?.priority;
}

async function eventsOf(
  test: Harness,
  locationId: string,
): Promise<readonly { priority: string; late: boolean; event_id: string }[]> {
  const parts = eventPathParts(test.layer, test.clock);
  return parts.eventLog.after(
    test.layer,
    { location_id: locationId, afterSeq: 0, limit: ALL },
    never,
  );
}

async function failureOf(work: Promise<unknown>): Promise<unknown> {
  try {
    await work;
  } catch (error) {
    return error;
  }
  throw new Error("expected the work to fail");
}

describe("Event: the event path (T047)", () => {
  it("writes an event once, with its priority from the policy, its audit entry, and a publish after the commit", async () => {
    const test = await withHome();

    await expect(
      test.event.event(event("evt-1"), SESSION, never),
    ).resolves.toEqual({ kind: "stored", seq: 1, needs_inventory: false });

    const [stored] = await eventsOf(test, "loc-1");
    expect(stored).toMatchObject({
      event_id: "evt-1",
      priority: "HIGH",
      late: false,
    });
    await expect(test.auditCount()).resolves.toBe(1);
    await expect.poll(() => test.stored.length).toBe(1);
    expect(test.stored[0]).toMatchObject({
      epoch: 1,
      event: { event_id: "evt-1", seq: 1, priority: "HIGH" },
    });
  });

  it.each([
    ["a motion sensor while disarmed", "disarmed", "d-hall", undefined, "LOW"],
    ["a motion sensor while armed", "away", "d-hall", undefined, "HIGH"],
    ["camera motion with a person", "disarmed", "d-cam", true, "MEDIUM"],
    ["camera motion with no person while armed", "home", "d-cam", false, "LOW"],
  ] as const)(
    "classifies %s from State's alarm mode and device type",
    async (_title, mode, deviceId, person, expected) => {
      const test = await withHome(mode);

      await expect(
        storedPriority(
          test,
          event("evt-1", {
            kind: "motion",
            device_id: deviceId,
            ...(person === undefined ? {} : { person }),
          }),
        ),
      ).resolves.toBe(expected);
    },
  );

  // T050's review: a person push that arrives before the first inventory (a new core, or a new
  // key) was ranked LOW because State did not hold the camera yet (DRIFT-002-19).
  it("ranks a person at a camera by the device type the push carries, before State holds the camera", async () => {
    const test = await harness();

    await expect(
      storedPriority(
        test,
        event("evt-1", {
          kind: "motion",
          device_id: "d-new-camera",
          device_type: "camera",
          person: true,
        }),
      ),
    ).resolves.toBe("MEDIUM");
  });

  // T062: events are sent before state, so an arm just before a door opens can reach State after
  // the door's event. The home stamps what it saw, and Classify prefers it.
  it("ranks a contact by the armed state the home stamped, over the alarm mode State holds", async () => {
    const disarmed = await withHome("disarmed");
    const armed = await withHome("away");

    await expect(
      storedPriority(
        disarmed,
        event("evt-1", { kind: "contact.open", armed: true }),
      ),
    ).resolves.toBe("HIGH");
    await expect(
      storedPriority(
        armed,
        event("evt-2", { kind: "contact.open", armed: false }),
      ),
    ).resolves.toBe("LOW");
  });

  it("ranks a motion sensor by the device type the home sends, before State holds the sensor", async () => {
    const test = await withHome("away");

    await expect(
      storedPriority(
        test,
        event("evt-1", {
          kind: "motion",
          device_id: "d-new-sensor",
          device_type: "motion",
        }),
      ),
    ).resolves.toBe("HIGH");
  });

  // T063 (FR-036, US8; DRIFT-002-20): from a shared home, only the kinds the policy keeps there.
  it("keeps a shared home's alarm and water, and withholds everything else from it, acked and unstored", async () => {
    const test = await harness();
    await test.event.inventory(
      {
        message_id: "m-1",
        snapshot_version: 0,
        locations: [
          location("loc-1", "disarmed"),
          { ...location("loc-shared", "away"), ownership: "shared" },
        ],
        devices: [DOOR],
      },
      SESSION,
      never,
    );

    const outcomes = [];
    for (const [id, kind] of [
      ["s-1", "doorbell.ding"],
      ["s-2", "motion"],
      ["s-3", "contact.open"],
      ["s-4", "alarm.triggered"],
      ["s-5", "flood"],
    ] as const) {
      outcomes.push(
        (
          await test.event.event(
            event(id, { location_id: "loc-shared", kind }),
            SESSION,
            never,
          )
        ).kind,
      );
    }

    expect(outcomes).toEqual([
      "withheld",
      "withheld",
      "withheld",
      "stored",
      "stored",
    ]);
    const stored = await eventsOf(test, "loc-shared");
    expect(stored.map((entry) => [entry.event_id, entry.priority])).toEqual([
      ["s-4", "HIGH"],
      ["s-5", "HIGH"],
    ]);
  });

  it("treats a location State does not hold as not armed", async () => {
    const test = await harness();

    await expect(
      storedPriority(
        test,
        event("evt-1", { location_id: "loc-9", kind: "contact.open" }),
      ),
    ).resolves.toBe("LOW");
  });

  it("marks an event late when it reaches the core more than 2 minutes after the home received it, or comes from Ring's history", async () => {
    const test = await withHome();
    const received = START - TWO_MINUTES_MS;

    await test.event.event(
      event("on-time", { received_at: received, arrived_at: START }),
      SESSION,
      never,
    );
    await test.event.event(
      event("held", { received_at: received - 1, arrived_at: START }),
      SESSION,
      never,
    );
    await test.event.event(
      event("history", { from_history: true }),
      SESSION,
      never,
    );

    const late = Object.fromEntries(
      (await eventsOf(test, "loc-1")).map((entry) => [
        entry.event_id,
        entry.late,
      ]),
    );
    expect(late).toEqual({ "on-time": false, held: true, history: true });
  });

  it("writes an event already in the log once, publishing it once", async () => {
    const test = await withHome();
    await test.event.event(event("evt-1"), SESSION, never);

    await expect(
      test.event.event(event("evt-1"), SESSION, never),
    ).resolves.toEqual({ kind: "duplicate" });

    await expect(test.seqs("loc-1")).resolves.toEqual([1]);
    await expect(test.auditCount()).resolves.toBe(1);
    await expect.poll(() => test.stored.length).toBe(1);
  });

  it("applies the event's device entry with it, and still writes an event whose entry is older", async () => {
    const test = await withHome();
    const opened = { ...DOOR, state: { open: true }, state_version: 10 };

    await test.event.event(
      event("evt-1", { kind: "contact.open", device_state: opened }),
      SESSION,
      never,
    );
    await test.event.event(
      event("evt-2", {
        kind: "contact.closed",
        device_state: { ...DOOR, state: { open: false }, state_version: 9 },
      }),
      SESSION,
      never,
    );

    await expect(test.state.device("d-door", never)).resolves.toMatchObject({
      state: { open: true },
      state_version: 10,
    });
    await expect(test.seqs("loc-1")).resolves.toEqual([1, 2]);
  });

  it("writes an event whose device State does not hold, and says an inventory is needed", async () => {
    const test = await withHome();
    const unknown = { ...DOOR, device_id: "d-new", state_version: 20 };

    await expect(
      test.event.event(
        event("evt-1", { kind: "contact.open", device_state: unknown }),
        SESSION,
        never,
      ),
    ).resolves.toEqual({ kind: "stored", seq: 1, needs_inventory: true });
  });

  it("rolls back the Event Log and the Audit when State's write fails, and writes the event when it comes again", async () => {
    const test = await withHome();
    test.failNextStateWrite();
    const opened = { ...DOOR, state: { open: true }, state_version: 10 };
    const incoming = event("evt-1", {
      kind: "contact.open",
      device_state: opened,
    });

    await expect(
      failureOf(test.event.event(incoming, SESSION, never)),
    ).resolves.toBeInstanceOf(Error);
    await expect(test.seqs("loc-1")).resolves.toEqual([]);
    await expect(test.auditCount()).resolves.toBe(0);

    await expect(test.event.event(incoming, SESSION, never)).resolves.toEqual({
      kind: "stored",
      seq: 1,
      needs_inventory: false,
    });
    await expect(test.auditCount()).resolves.toBe(1);
    await expect.poll(() => test.stored.length).toBe(1);
  });

  it("answers unavailable when the store is down, writing nothing", async () => {
    const test = await withHome();
    test.failNextTransaction();

    const failed = await failureOf(
      test.event.event(event("evt-1"), SESSION, never),
    );

    expect(failed).toBeInstanceOf(EventError);
    expect(failed).toMatchObject({ kind: "unavailable" });
    await expect(test.seqs("loc-1")).resolves.toEqual([]);
  });

  it("finds the event already written when it comes again after a restart, as when the core stops between its commit and its ack", async () => {
    const first = await withHome();
    await first.event.event(event("evt-1"), SESSION, never);
    await first.event.stop();

    const second = await harness({ layer: first.layer, clock: first.clock });
    await expect(
      second.event.event(event("evt-1"), SESSION, never),
    ).resolves.toEqual({ kind: "duplicate" });

    await expect(second.seqs("loc-1")).resolves.toEqual([1]);
    await expect(second.auditCount()).resolves.toBe(1);
  });

  it("keeps each location's own order when two locations' events arrive together", async () => {
    const test = await harness();
    const sent = ["a-1", "b-1", "a-2", "b-2", "a-3", "b-3"].map((id) =>
      test.event.event(
        event(id, { location_id: id.startsWith("a") ? "loc-a" : "loc-b" }),
        SESSION,
        never,
      ),
    );

    await Promise.all(sent);

    const order = async (locationId: string): Promise<string[]> =>
      (await eventsOf(test, locationId)).map((entry) => entry.event_id);
    await expect(order("loc-a")).resolves.toEqual(["a-1", "a-2", "a-3"]);
    await expect(order("loc-b")).resolves.toEqual(["b-1", "b-2", "b-3"]);
    await expect(test.seqs("loc-a")).resolves.toEqual([1, 2, 3]);
  });

  it("writes an event that comes on a session whose key is no longer current, without its State change", async () => {
    const test = await withHome();
    const opened = { ...DOOR, state: { open: true }, state_version: 10 };

    await expect(
      test.event.event(
        event("evt-1", { kind: "contact.open", device_state: opened }),
        OTHER_KEY,
        never,
      ),
    ).resolves.toMatchObject({ kind: "stored" });

    await expect(test.state.device("d-door", never)).resolves.toMatchObject({
      state: { open: false },
    });
  });

  it("refuses an event whose id is too long to store, writing nothing, so it is acked rather than sent forever", async () => {
    const test = await withHome();

    await expect(
      test.event.event(event("e".repeat(129)), SESSION, never),
    ).resolves.toEqual({ kind: "refused" });

    await expect(test.seqs("loc-1")).resolves.toEqual([]);
  });

  it("keeps the event when a handler of the publish fails", async () => {
    const test = await withHome();
    const failures: unknown[] = [];
    const events = new PubSub<EventTopics>((_topic, error) =>
      failures.push(error),
    );
    events.subscribe("event.stored", () => {
      throw new Error("Delivery failed.");
    });
    const manager = new EventManager({
      state: test.state,
      events,
      clock: test.clock,
      homeOfflineAfterMs: OFFLINE_AFTER_MS,
      reportFailure: () => undefined,
      ...eventPathParts(test.layer, test.clock),
    });
    stops.push(() => manager.stop());
    await manager.homeSessionOpened(SESSION, never);

    await manager.event(event("evt-1"), SESSION, never);
    await events.drain();

    expect(failures).toHaveLength(1);
    await expect(test.seqs("loc-1")).resolves.toEqual([1]);
  });
});
