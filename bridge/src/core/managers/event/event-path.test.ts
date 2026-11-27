// The Event manager's event path (T047) on SQLite: one transaction per event across Classify, the
// Event Log, State and the Audit; the priority from the policy file; the late rule; a duplicate
// written once; a failed write that leaves nothing behind; the same event again after a restart,
// as when the core stops between its commit and its ack; and two locations in parallel, each in
// its own order. The link's side of the ack is in Connector Link's tests.
import { MediaPermissions } from "../../access/settings/index.ts";
import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { EventMedia, FileMediaObjects } from "../../access/media/index.ts";
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

async function eventsOf(test: Harness, locationId: string) {
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
  it("publishes a doorbell press to delivery while an earlier camera clip is pending", async () => {
    const test = await withHome();
    const folder = await mkdtemp(join(tmpdir(), "pending-camera-"));
    const media = new EventMedia(
      test.layer,
      new FileMediaObjects(folder),
      test.clock,
    );
    const pending = Promise.withResolvers<undefined>();
    const release = Promise.withResolvers<undefined>();
    const upload = media.stage(
      {
        householdId: "loc-1",
        cameraId: "d-cam",
        eventId: "earlier",
        kind: "clip",
        hasSound: false,
        capturedAt: START,
      },
      async () => {
        pending.resolve(undefined);
        await release.promise;
        return { length: 1, body: [Uint8Array.of(1)] };
      },
      never,
    );
    try {
      await pending.promise;
      await test.event.event(event("doorbell"), SESSION, never);
      await expect.poll(() => test.stored[0]?.event.event_id).toBe("doorbell");
    } finally {
      release.resolve(undefined);
      try {
        await upload;
      } finally {
        await rm(folder, { recursive: true, force: true });
      }
    }
  });
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
  it("applies the saved person event action only to this camera's person detections", async () => {
    const test = await withHome();
    const permissions = new MediaPermissions(test.layer);
    for (const action of ["drop", "store_only", "push"] as const) {
      await permissions.save(
        "loc-1",
        CAMERA.device_id,
        "",
        { enabled: false, sound: false, approved: false, personAction: action },
        never,
      );
      await test.event.event(
        event("person-" + action, {
          device_id: CAMERA.device_id,
          kind: "motion",
          person: true,
        }),
        SESSION,
        never,
      );
    }
    await test.event.event(
      event("ordinary-motion", {
        device_id: CAMERA.device_id,
        kind: "motion",
        person: false,
      }),
      SESSION,
      never,
    );
    expect(test.stored.map((row) => [row.event.event_id, row.action])).toEqual([
      ["person-store_only", "store_only"],
      ["person-push", "push"],
      ["ordinary-motion", "inherit"],
    ]);
  });
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
  it("keeps shared sensors for history, uses normal alarm delivery and drops camera events", async () => {
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
      ["s-6", "mode.changed"],
      ["s-7", "motion"],
    ] as const) {
      outcomes.push(
        (
          await test.event.event(
            event(id, {
              location_id: "loc-shared",
              kind,
              ...(id === "s-7" ? { device_type: "motion" as const } : {}),
            }),
            SESSION,
            never,
          )
        ).kind,
      );
    }

    expect(outcomes).toEqual([
      "withheld",
      "withheld",
      "stored",
      "stored",
      "stored",
      "stored",
      "stored",
    ]);
    await expect.poll(() => test.stored.length).toBe(5);
    expect(
      test.stored.map((row) => [row.event.event_id, row.action, row.shared]),
    ).toEqual([
      ["s-3", "store_only", true],
      ["s-4", "inherit", true],
      ["s-5", "store_only", true],
      ["s-6", "inherit", true],
      ["s-7", "store_only", true],
    ]);
    const stored = await eventsOf(test, "loc-shared");
    expect(stored.map((entry) => [entry.event_id, entry.priority])).toEqual([
      ["s-3", "HIGH"],
      ["s-4", "HIGH"],
      ["s-5", "HIGH"],
      ["s-6", "LOW"],
      ["s-7", "HIGH"],
    ]);
  });

  it("keeps the 30-day boundary, removes older events and preserves the sequence after purge", async () => {
    const test = await withHome();
    const day = 86_400_000;
    await test.event.event(event("old"), SESSION, never);
    await test.event.event(event("boundary"), SESSION, never);
    for (const [id, age] of [
      ["old", 31],
      ["boundary", 30],
    ] as const) {
      await test.layer.run(
        {
          sql: "UPDATE event SET stored_at=@time WHERE event_id=@id",
          params: { time: START - age * day, id },
        },
        never,
      );
      await test.layer.run(
        {
          sql: "UPDATE audit_entry SET ts=@at WHERE event_id=@id",
          params: { at: START - age * day, id },
        },
        never,
      );
    }
    await test.event.maintenance(never);
    expect(await test.auditCount()).toBe(1);
    await test.event.event(event("new"), SESSION, never);
    expect(
      (await eventsOf(test, "loc-1")).map((row) => [row.event_id, row.seq]),
    ).toEqual([
      ["boundary", 2],
      ["new", 3],
    ]);
  });

  it("keeps p95 event-write latency within 0.5 seconds (bridge-latency-budget)", async () => {
    const test = await withHome();
    const durations: number[] = [];
    for (let n = 0; n < 40; n++) {
      const start = performance.now();
      const result = await test.event.event(
        event("latency-" + String(n)),
        SESSION,
        never,
      );
      durations.push(performance.now() - start);
      expect(result.kind).toBe("stored");
    }
    expect(durations.sort((a, b) => a - b)[37]).toBeLessThanOrEqual(500);
  });

  it("withholds a recovery summary after a home changes from owned to shared", async () => {
    const test = await withHome();
    await test.event.event(
      event("old-camera", { from_history: true }),
      SESSION,
      never,
    );
    await test.layer.run(
      {
        sql: "UPDATE location SET ownership='shared' WHERE location_id=@id",
        params: { id: "loc-1" },
      },
      never,
    );
    await test.event.catchupDone("marker", SESSION, never);
    expect((await eventsOf(test, "loc-1")).map((e) => e.event_id)).toEqual([
      "old-camera",
    ]);
  });

  it("closes a late batch once, with its time and sequence ranges and highest priority", async () => {
    const test = await withHome();
    await test.event.event(
      event("late-low", {
        from_history: true,
        kind: "ring.other",
        occurred_at: START - 30_000,
      }),
      SESSION,
      never,
    );
    await test.event.event(
      event("late-high", { from_history: true }),
      SESSION,
      never,
    );
    await test.event.catchupDone("marker-1", SESSION, never);
    await test.event.event(
      event("late-single", { from_history: true, kind: "ring.other" }),
      SESSION,
      never,
    );
    await test.event.catchupDone("marker-1", SESSION, never);
    await test.event.catchupDone("marker-2", SESSION, never);
    const summaries = (await eventsOf(test, "loc-1")).filter(
      (e) => e.kind === "bridge.events_recovered",
    );
    expect(summaries).toMatchObject([
      {
        priority: "HIGH",
        late: false,
        data: {
          recovered: {
            count: 2,
            seq_from: 1,
            seq_to: 2,
            oldest_at: new Date(START - 30_000).toISOString(),
            newest_at: new Date(START - 2_000).toISOString(),
          },
        },
      },
      {
        priority: "LOW",
        data: { recovered: { count: 1, seq_from: 4, seq_to: 4 } },
      },
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
