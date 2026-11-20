// T052 (FR-011, FR-013): get_events over the real log, cursors and read marks, on SQLite.
import { afterEach, describe, expect, it } from "vitest";
import { EventLog } from "../../access/event-log/index.ts";
import { SettingsStore } from "../../access/settings/index.ts";
import { StateStore } from "../../access/state/index.ts";
import type { DeviceState, LocationState } from "../../access/state/index.ts";
import { CursorStore } from "../../access/subscriptions/index.ts";
import {
  afterHeartbeat,
  afterRefresh,
  afterSessionOpened,
} from "../../engines/health/index.ts";
import { FakeClock } from "../../../utilities/clock/index.ts";
import {
  CORE_MIGRATIONS,
  openSqliteQueryLayer,
  QueryLayerError,
  runMigrations,
} from "../../../utilities/query-layer/index.ts";
import type { QueryLayer } from "../../../utilities/query-layer/index.ts";
import { decodeCursor } from "./events-read.ts";
import { InquiryError, InquiryManager } from "./index.ts";

const START = Date.UTC(2026, 10, 7, 9, 0, 0);
const never = new AbortController().signal;
const AGENT_A = "https://agent-a.example.test/client.json";
const AGENT_B = "https://agent-b.example.test/client.json";

const HOME: LocationState = {
  location_id: "loc-1",
  name: "בית",
  ownership: "owned",
  time_zone: "Asia/Jerusalem",
  alarm_mode: "home",
  as_of: START,
  state_version: 1,
};

const DOOR: DeviceState = {
  device_id: "d-door",
  location_id: "loc-1",
  name: "דלת כניסה",
  type: "contact",
  room: "כניסה",
  power_mode: "battery",
  online: true,
  battery_pct: 80,
  state: { open: true },
  as_of: START,
  state_version: 2,
};

interface Harness {
  readonly inquiry: InquiryManager;
  readonly layer: QueryLayer;
  readonly events: EventLog;
  readonly cut: () => void;
}

const stops: (() => Promise<void>)[] = [];

afterEach(async () => {
  for (const stop of stops.splice(0).reverse()) {
    await stop();
  }
});

async function harness(
  locations: readonly LocationState[] = [HOME],
): Promise<Harness> {
  const clock = new FakeClock(START);
  const layer = openSqliteQueryLayer(":memory:", { clock });
  stops.push(() => layer.close());
  await runMigrations(layer, CORE_MIGRATIONS, { clock }, never);
  let down = false;
  const store = new Proxy(layer, {
    get(target, property) {
      if (down && (property === "get" || property === "all")) {
        return () =>
          Promise.reject(new QueryLayerError("store_down", "The test cut it."));
      }
      const value: unknown = Reflect.get(target, property, target);
      return typeof value === "function"
        ? (value as (...args: unknown[]) => unknown).bind(target)
        : value;
    },
  });
  const state = new StateStore({ store });
  const settings = new SettingsStore({
    store,
    clock,
    defaultBatteryThresholdPct: 20,
  });
  await state.applyInventory(
    { snapshot_version: 0, locations, devices: [DOOR] },
    never,
  );
  await state.saveHealth(
    afterHeartbeat(
      afterRefresh(afterSessionOpened(undefined, "0.1.0", START)),
      { ring_session: "ok", outbox_depth: 0, inventory_owed: false },
      START,
    ),
    never,
  );
  const events = new EventLog({ clock });
  return {
    inquiry: new InquiryManager({
      state,
      settings,
      clock,
      homeOfflineAfterMs: 120_000,
      store,
      eventLog: events,
      cursors: new CursorStore({ store, clock }),
    }),
    layer,
    events,
    cut: () => {
      down = true;
    },
  };
}

type Changes = Partial<{
  priority: "HIGH" | "MEDIUM" | "LOW";
  kind: string;
  device_id: string;
  location_id: string;
  late: boolean;
  summary: string;
  ringKind: string;
}>;

async function store(
  test: Harness,
  id: string,
  changes: Changes = {},
): Promise<void> {
  await test.layer.transaction(
    (session) =>
      test.events.append(
        session,
        {
          event_id: id,
          location_id: changes.location_id ?? "loc-1",
          kind: changes.kind ?? "motion",
          priority: changes.priority ?? "LOW",
          occurred_at: START,
          received_at: START,
          ...(changes.device_id === undefined
            ? {}
            : { device_id: changes.device_id }),
          ...(changes.ringKind
            ? { data: { ring_kind: changes.ringKind } }
            : {}),
          summary: changes.summary ?? `Event ${id}`,
          late: changes.late ?? false,
        },
        never,
      ),
    never,
  );
}

async function withEvents(count: number): Promise<Harness> {
  const test = await harness();
  for (let n = 1; n <= count; n += 1) {
    await store(test, `e-${String(n)}`);
  }
  return test;
}

const idsOf = (reply: { data: { events: readonly { event_id: string }[] } }) =>
  reply.data.events.map((event) => event.event_id);

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

describe("the Inquiry manager: get_events", () => {
  it("reads from the start on a first read, in order, with the device's name and local times", async () => {
    const test = await harness();
    await store(test, "e-1", { device_id: "d-door", kind: "contact.open" });
    await store(test, "e-2", { priority: "HIGH", late: true });

    const reply = await test.inquiry.getEvents({}, AGENT_A, never);

    expect(idsOf(reply)).toEqual(["e-1", "e-2"]);
    expect(reply.data.events[0]).toMatchObject({
      seq: 1,
      kind: "contact.open",
      occurred_at: "2026-11-07T09:00:00.000Z",
      occurred_at_local: "2026-11-07T11:00:00.000+02:00",
      device: { id: "d-door", name: "דלת כניסה", room: "כניסה" },
      summary: "Event e-1",
    });
    expect(reply.data.events[0]).not.toHaveProperty("late");
    expect(reply.data.events[1]).toMatchObject({ late: true });
    expect(reply.data.has_more).toBe(false);
  });

  it("pages to the end with next_cursor, never repeating or skipping an event", async () => {
    const test = await withEvents(5);

    const first = await test.inquiry.getEvents({ limit: 2 }, undefined, never);
    const second = await test.inquiry.getEvents(
      { limit: 2, cursor: first.data.next_cursor },
      undefined,
      never,
    );
    const third = await test.inquiry.getEvents(
      { limit: 2, cursor: second.data.next_cursor },
      undefined,
      never,
    );
    const done = await test.inquiry.getEvents(
      { limit: 2, cursor: third.data.next_cursor },
      undefined,
      never,
    );

    expect([first, second, third].map(idsOf)).toEqual([
      ["e-1", "e-2"],
      ["e-3", "e-4"],
      ["e-5"],
    ]);
    expect([first, second, third].map((page) => page.data.has_more)).toEqual([
      true,
      true,
      false,
    ]);
    expect(done.data.events).toEqual([]);
    expect(done.data.next_cursor).toBe(third.data.next_cursor);
  });

  it("moves the cursor past every event it examined, so a filter that matches nothing does not repeat them", async () => {
    const test = await withEvents(3);

    const none = await test.inquiry.getEvents(
      { min_priority: "HIGH" },
      undefined,
      never,
    );
    await store(test, "e-4", { priority: "HIGH" });
    const next = await test.inquiry.getEvents(
      { min_priority: "HIGH", cursor: none.data.next_cursor },
      undefined,
      never,
    );

    expect(none.data.events).toEqual([]);
    expect(decodeCursor(none.data.next_cursor)?.place.seq).toBe(3);
    expect(idsOf(next)).toEqual(["e-4"]);
  });

  it("filters by priority (that or higher), kind and device", async () => {
    const test = await harness();
    await store(test, "low", { priority: "LOW", device_id: "d-door" });
    await store(test, "med", { priority: "MEDIUM", kind: "motion" });
    await store(test, "high", {
      priority: "HIGH",
      kind: "contact.open",
      device_id: "d-door",
    });
    const ids = async (request: Parameters<InquiryManager["getEvents"]>[0]) =>
      idsOf(await test.inquiry.getEvents(request, undefined, never));

    await expect(ids({ min_priority: "MEDIUM" })).resolves.toEqual([
      "med",
      "high",
    ]);
    await expect(ids({ kind: "contact.open" })).resolves.toEqual(["high"]);
    await expect(ids({ device_id: "d-door" })).resolves.toEqual([
      "low",
      "high",
    ]);
  });

  it("keeps a mark for each client: with no cursor a client reads only what is new to it", async () => {
    const test = await withEvents(2);
    await test.inquiry.getEvents({}, AGENT_A, never);
    await store(test, "e-3");

    const a = await test.inquiry.getEvents({}, AGENT_A, never);
    const b = await test.inquiry.getEvents({}, AGENT_B, never);

    expect(idsOf(a)).toEqual(["e-3"]);
    expect(idsOf(b)).toEqual(["e-1", "e-2", "e-3"]);
  });

  it("answers a cursor from an older epoch from the start of the current epoch, and says so", async () => {
    const test = await withEvents(2);
    const first = await test.inquiry.getEvents({}, undefined, never);
    await test.layer.run(
      {
        sql: "UPDATE log_meta SET epoch = 2 WHERE location_id = @location_id",
        params: { location_id: "loc-1" },
      },
      never,
    );

    const reply = await test.inquiry.getEvents(
      { cursor: first.data.next_cursor },
      undefined,
      never,
    );

    expect(reply.data.epoch_changed).toBe(true);
    expect(idsOf(reply)).toEqual(["e-1", "e-2"]);
    const after = await test.inquiry.getEvents(
      { cursor: reply.data.next_cursor },
      undefined,
      never,
    );
    expect(after.data).not.toHaveProperty("epoch_changed");
  });

  it("refuses a cursor that is not its own, names another location, or is from an epoch it does not hold", async () => {
    const test = await withEvents(1);
    const good = await test.inquiry.getEvents({}, undefined, never);
    const future = Buffer.from(
      JSON.stringify({ v: 1, l: "loc-1", e: 9, s: 0 }),
      "utf8",
    ).toString("base64url");

    for (const request of [
      { cursor: "not a cursor" },
      { cursor: good.data.next_cursor, location_id: "loc-2" },
      { cursor: future },
    ]) {
      const error = await rejection(
        test.inquiry.getEvents(request, undefined, never),
      );
      expect(error.kind).toBe("invalid_argument");
    }
  });

  it("reads a shared household's stored events with their source identity", async () => {
    const shared: LocationState = {
      ...HOME,
      location_id: "loc-shared",
      ownership: "shared",
    };
    const test = await harness([HOME, shared]);
    await store(test, "s-1", { location_id: "loc-shared" });

    const reply = await test.inquiry.getEvents(
      { location_id: "loc-shared" },
      AGENT_A,
      never,
    );
    expect(reply.data.events).toMatchObject([
      { event_id: "s-1", location_id: "loc-shared" },
    ]);
  });

  it("retains the event and device ids when one Ring field alone exceeds the page budget", async () => {
    const test = await harness();
    await store(test, "e-1", {
      device_id: DOOR.device_id,
      kind: "ring.other",
      ringKind: "a".repeat(24_000),
    });
    const page = await test.inquiry.getEvents({}, AGENT_A, never);
    expect(page.data.events[0]).toMatchObject({
      event_id: "e-1",
      device: { id: DOOR.device_id },
    });
    expect(page.data.events[0]?.ring_kind?.endsWith("…")).toBe(true);
    expect(page.data.has_more).toBe(false);
  });

  it("pages verbose events without losing the first omitted event", async () => {
    const test = await harness();
    for (let n = 1; n <= 30; n++) {
      await store(test, String(n), { summary: "שלום".repeat(240) });
    }
    const first = await test.inquiry.getEvents({}, AGENT_A, never);
    expect(first.data.has_more).toBe(true);
    expect(first.data.events.length).toBeGreaterThan(0);
    const json = JSON.stringify(first);
    expect(
      Buffer.byteLength(json) + Buffer.byteLength(JSON.stringify(json)),
    ).toBeLessThanOrEqual(24000);
    const next = await test.inquiry.getEvents(
      { cursor: first.data.next_cursor },
      AGENT_B,
      never,
    );
    expect(next.data.events[0]?.seq).toBe(first.data.events.length + 1);
    expect((await test.inquiry.getEvents({}, AGENT_A, never)).data).toEqual(
      next.data,
    );
  });

  it("caps the limit, and fails as unavailable when the store is down", async () => {
    const test = await withEvents(3);

    const capped = await test.inquiry.getEvents(
      { limit: 100_000 },
      undefined,
      never,
    );
    test.cut();
    const down = await rejection(test.inquiry.getEvents({}, undefined, never));

    expect(capped.data.events).toHaveLength(3);
    expect(down.kind).toBe("unavailable");
  });
});
