// Ingest's state path (T014), over the simulated home and a real outbox: `inventory` at session
// start and on request, `device_state` with the full entry on a change, versions that only rise.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FakeClock, formatUtc } from "../../../utilities/clock/index.ts";
import { Logger } from "../../../utilities/logging/index.ts";
import {
  createLinkPair,
  LinkSlot,
} from "../../../utilities/link-transport/index.ts";
import type { LinkFrame } from "../../../utilities/link-transport/index.ts";
import { OutboxStore } from "../../access/outbox-store/index.ts";
import type { OutboxItem } from "../../access/outbox-store/index.ts";
import type {
  RingChange,
  RingDevice,
  RingLocation,
  RingPort,
  RingSessionStatus,
  StopWatching,
} from "../../access/ring-adapter/index.ts";
import {
  HEBREW_DEVICE_ID,
  HEBREW_DEVICE_NAME,
  ScenarioEngine,
  STANDARD_LOCATION_ID,
  standardHome,
} from "../../../../test/scenarios/index.ts";
import { driveFakeClock } from "../../../../test/support/fake-ring-client.ts";
import { Ingest } from "./index.ts";
import type { InventoryOutcome } from "./index.ts";

const START = Date.UTC(2026, 10, 6, 9, 0, 0);
const DEVICE_COUNT = 100;
const SLOW_MS = 2_000;
const signal = new AbortController().signal;

interface LocationEntry extends RingLocation {
  readonly as_of: string;
  readonly state_version: number;
}

interface DeviceEntry extends RingDevice {
  readonly as_of: string;
  readonly state_version: number;
}

interface InventoryBody {
  readonly locations: readonly LocationEntry[];
  readonly devices: readonly DeviceEntry[];
}

let folder: string;
let clock: FakeClock;
let lines: string[];
const stores: OutboxStore[] = [];
const ingests: Ingest[] = [];

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "ingest-"));
  clock = new FakeClock(START);
  lines = [];
});

afterEach(async () => {
  for (const ingest of ingests.splice(0)) {
    await ingest.stop();
  }
  for (const store of stores.splice(0)) {
    await store.close();
  }
  await rm(folder, { recursive: true, force: true });
});

async function openStore(path = ":memory:"): Promise<OutboxStore> {
  const store = await OutboxStore.open({ path, clock }, signal);
  stores.push(store);
  return store;
}

function startIngest(ring: RingPort, outbox: OutboxStore): Ingest {
  const ingest = new Ingest({
    ring,
    outbox,
    link: new LinkSlot(),
    clock,
    logger: new Logger({
      sink: (line) => lines.push(line),
      now: () => clock.now(),
      minLevel: "debug",
    }),
  });
  ingest.start();
  ingests.push(ingest);
  return ingest;
}

async function setup(): Promise<{
  readonly engine: ScenarioEngine;
  readonly store: OutboxStore;
  readonly ingest: Ingest;
}> {
  const engine = new ScenarioEngine(clock);
  const store = await openStore();
  return { engine, store, ingest: startIngest(engine, store) };
}

function takeAll(store: OutboxStore): Promise<readonly OutboxItem[]> {
  return store.takeDue(1_000, signal);
}

function inventoryOf(item: OutboxItem | undefined): InventoryBody {
  expect(item?.kind).toBe("inventory");
  return item?.body as unknown as InventoryBody;
}

function deviceStateOf(item: OutboxItem | undefined): DeviceEntry {
  expect(item?.kind).toBe("device_state");
  return item?.body as unknown as DeviceEntry;
}

function versionsOf(inventory: InventoryBody): number[] {
  return [...inventory.locations, ...inventory.devices].map(
    (entry) => entry.state_version,
  );
}

function standardDevice(deviceId: string): RingDevice {
  const device = standardHome().devices.find(
    (entry) => entry.device_id === deviceId,
  );
  if (device === undefined) {
    throw new Error(`The standard home has no ${deviceId}.`);
  }
  return device;
}

function openDoor(engine: ScenarioEngine, open = true): void {
  engine.apply({
    kind: "device",
    deviceId: HEBREW_DEVICE_ID,
    changes: { state: { open } },
  });
}

/** A Ring whose device reads answer `delayMs` after they were taken, so the answer is stale. */
class StaleReads implements RingPort {
  readonly #engine: ScenarioEngine;
  readonly #delayMs: number;

  constructor(engine: ScenarioEngine, delayMs: number) {
    this.#engine = engine;
    this.#delayMs = delayMs;
  }

  sessionStatus(): RingSessionStatus {
    return this.#engine.sessionStatus();
  }

  locations(readSignal: AbortSignal): Promise<readonly RingLocation[]> {
    return this.#engine.locations(readSignal);
  }

  async devices(
    locationId: string,
    readSignal: AbortSignal,
  ): Promise<readonly RingDevice[]> {
    const taken = await this.#engine.devices(locationId, readSignal);
    await clock.sleep(this.#delayMs, readSignal);
    return taken;
  }

  watch(listener: (change: RingChange) => void): StopWatching {
    return this.#engine.watch(listener);
  }
}

describe("Ingest", () => {
  it("queues one inventory at session start, every entry in the link's names with its own rising version", async () => {
    const { store, ingest } = await setup();

    expect(await ingest.inventoryRequested(signal)).toBe("queued");

    const items = await takeAll(store);
    expect(items).toHaveLength(1);
    const inventory = inventoryOf(items[0]);
    const asOf = formatUtc(START);
    expect(inventory.locations).toEqual([
      {
        location_id: STANDARD_LOCATION_ID,
        name: "Test home",
        time_zone: "Asia/Tokyo",
        alarm_mode: "disarmed",
        ownership: "owned",
        as_of: asOf,
        state_version: 1,
      },
    ]);
    expect(inventory.devices).toHaveLength(DEVICE_COUNT);
    expect(inventory.devices[0]).toEqual({
      ...standardDevice(HEBREW_DEVICE_ID),
      as_of: asOf,
      state_version: 2,
    });
    expect(versionsOf(inventory)).toEqual(
      Array.from({ length: DEVICE_COUNT + 1 }, (_, index) => index + 1),
    );
  });

  it("queues a fresh inventory on inventory_request, with higher versions and a later as_of", async () => {
    const { store, ingest } = await setup();
    await ingest.inventoryRequested(signal);
    await clock.advance(5_000);

    expect(await ingest.inventoryRequested(signal)).toBe("queued");

    const [first, second] = (await takeAll(store)).map(inventoryOf);
    expect(Math.min(...versionsOf(second ?? fail()))).toBeGreaterThan(
      Math.max(...versionsOf(first ?? fail())),
    );
    expect(second?.devices[0]?.as_of).toBe(formatUtc(START + 5_000));
  });

  it("queues a changed device's full current entry, never only the changed field", async () => {
    const { engine, store, ingest } = await setup();
    await ingest.inventoryRequested(signal);
    await takeAll(store);
    await clock.advance(1_000);

    openDoor(engine);
    await ingest.flush();

    const items = await takeAll(store);
    expect(items).toHaveLength(1);
    expect(deviceStateOf(items[0])).toEqual({
      ...standardDevice(HEBREW_DEVICE_ID),
      state: { open: true },
      as_of: formatUtc(START + 1_000),
      state_version: DEVICE_COUNT + 2,
    });
    expect(deviceStateOf(items[0]).name).toBe(HEBREW_DEVICE_NAME);
  });

  it("queues changes in the order they happened, the later with the higher version", async () => {
    const { engine, store, ingest } = await setup();

    openDoor(engine, true);
    openDoor(engine, false);
    await ingest.flush();

    const [opened, closed] = (await takeAll(store)).map(deviceStateOf);
    expect(opened?.state).toEqual({ open: true });
    expect(closed?.state).toEqual({ open: false });
    expect(closed?.state_version).toBeGreaterThan(opened?.state_version ?? 0);
  });

  it("sends the whole inventory again when an alarm mode changes, with the new mode", async () => {
    const { engine, store, ingest } = await setup();
    await ingest.inventoryRequested(signal);
    openDoor(engine);
    await ingest.flush();
    const before = await takeAll(store);
    await clock.advance(1_000);

    engine.apply({
      kind: "alarm_mode",
      locationId: STANDARD_LOCATION_ID,
      mode: "away",
    });
    await ingest.flush();

    const items = await takeAll(store);
    expect(items).toHaveLength(1);
    const inventory = inventoryOf(items[0]);
    expect(inventory.locations[0]).toMatchObject({
      alarm_mode: "away",
      as_of: formatUtc(START + 1_000),
    });
    expect(inventory.devices).toHaveLength(DEVICE_COUNT);
    expect(inventory.devices[0]?.state).toEqual({ open: true });
    const highest = Math.max(
      ...before.map((item) =>
        item.kind === "inventory"
          ? Math.max(...versionsOf(inventoryOf(item)))
          : deviceStateOf(item).state_version,
      ),
    );
    expect(Math.min(...versionsOf(inventory))).toBeGreaterThan(highest);
  });

  it("queues nothing for an alarm mode change before the first inventory", async () => {
    const { engine, store, ingest } = await setup();

    engine.apply({
      kind: "alarm_mode",
      locationId: STANDARD_LOCATION_ID,
      mode: "home",
    });
    await ingest.flush();

    expect(await store.depth(signal)).toBe(0);
  });

  it("puts a change that arrives during a slow read into that inventory, under the higher version", async () => {
    const engine = new ScenarioEngine(clock);
    const store = await openStore();
    const ingest = startIngest(new StaleReads(engine, SLOW_MS), store);

    const outcome = ingest.inventoryRequested(signal);
    await clock.advance(SLOW_MS / 2);
    openDoor(engine);
    expect(await driveFakeClock(clock, outcome)).toBe("queued");
    await ingest.flush();

    const [changed, snapshot] = await takeAll(store);
    const inventory = inventoryOf(snapshot);
    expect(inventory.devices[0]?.state).toEqual({ open: true });
    expect(inventory.devices[0]?.state_version).toBeGreaterThan(
      deviceStateOf(changed).state_version,
    );
  });

  it.each<[string, InventoryOutcome]>([
    ["ring_down", "ring_unavailable"],
    ["blocked", "ring_unavailable"],
    ["session_lost", "session_lost"],
  ])("answers %s with %s and queues nothing", async (fault, expected) => {
    const { engine, store, ingest } = await setup();
    engine.apply({
      kind: "fault",
      fault: { kind: fault as "ring_down" | "blocked" | "session_lost" },
    });

    expect(await ingest.inventoryRequested(signal)).toBe(expected);
    expect(await store.depth(signal)).toBe(0);
  });

  it("answers outbox_unavailable when the outbox is down, and logs a lost change without Ring's text", async () => {
    const { engine, store, ingest } = await setup();
    await store.close();

    expect(await ingest.inventoryRequested(signal)).toBe("outbox_unavailable");
    openDoor(engine);
    await ingest.flush();

    const warning = lines.find((line) =>
      line.includes("ingest_state_not_queued"),
    );
    expect(warning).toContain("device_state");
    expect(warning).toContain(HEBREW_DEVICE_ID);
    expect(lines.join("\n")).not.toContain(HEBREW_DEVICE_NAME);
  });

  it("passes an unexpected failure and a caller's abort through to the caller", async () => {
    const store = await openStore();
    const broken = new Error("not a Ring Adapter error");
    const engine = new ScenarioEngine(clock);
    const ring: RingPort = {
      sessionStatus: () => engine.sessionStatus(),
      locations: () => Promise.reject(broken),
      devices: (locationId, readSignal) =>
        engine.devices(locationId, readSignal),
      watch: (listener) => engine.watch(listener),
    };
    await expect(
      startIngest(ring, store).inventoryRequested(signal),
    ).rejects.toBe(broken);

    const controller = new AbortController();
    const reason = new Error("the caller left");
    controller.abort(reason);
    await expect(
      startIngest(engine, store).inventoryRequested(controller.signal),
    ).rejects.toBe(reason);
    expect(await store.depth(signal)).toBe(0);
  });

  it("queues nothing after it stops", async () => {
    const { engine, store, ingest } = await setup();
    await ingest.stop();

    openDoor(engine);
    await ingest.flush();

    expect(await store.depth(signal)).toBe(0);
  });

  it("keeps versions rising across a restart of the connector", async () => {
    const path = join(folder, "outbox.db");
    const engine = new ScenarioEngine(clock);
    const before = await openStore(path);
    const first = startIngest(engine, before);
    await first.inventoryRequested(signal);
    const firstVersions = versionsOf(inventoryOf((await takeAll(before))[0]));
    await first.stop();
    await before.close();

    const after = await openStore(path);
    await startIngest(engine, after).inventoryRequested(signal);

    const secondVersions = versionsOf(inventoryOf((await takeAll(after))[0]));
    expect(Math.min(...secondVersions)).toBeGreaterThan(
      Math.max(...firstVersions),
    );
  });
});

function fail(): never {
  throw new Error("A queued message was missing.");
}

describe("Ingest's heartbeat", () => {
  it("reports the outbox as unreadable and counts it, and sends nothing without a session", async () => {
    const engine = new ScenarioEngine(clock);
    const store = await openStore();
    const slot = new LinkSlot();
    const pair = createLinkPair(
      new Logger({ sink: () => undefined, now: () => 0, minLevel: "debug" }),
    );
    const frames: LinkFrame[] = [];
    pair.acceptor.onFrame((frame) => frames.push(frame));
    const ingest = new Ingest({
      ring: engine,
      outbox: store,
      link: slot,
      clock,
      logger: new Logger({
        sink: (line) => lines.push(line),
        now: () => clock.now(),
        minLevel: "debug",
      }),
    });
    await ingest.sendHeartbeat(signal);
    await ingest.sendDue(signal);
    slot.put(pair.dialer);
    await store.close();
    await ingest.sendHeartbeat(signal);
    await new Promise((resolve) => setImmediate(resolve));
    expect(frames).toEqual([
      {
        kind: "message",
        type: "heartbeat",
        body: {
          ring_session: "ok",
          push: "off",
          outbox_depth: null,
          last_ring_event_at: null,
          error_counts: { outbox_unavailable: 1 },
          as_of: formatUtc(START),
        },
      },
    ]);
    expect(lines.join("\n")).toContain("ingest_depth_not_read");
  });
});

describe("Ingest at a session's start", () => {
  it("sends nothing until every unacked message is due again, so older messages go first", async () => {
    const engine = new ScenarioEngine(clock);
    const store = await openStore();
    const slot = new LinkSlot();
    const pair = createLinkPair(
      new Logger({ sink: () => undefined, now: () => 0, minLevel: "debug" }),
    );
    const frames: LinkFrame[] = [];
    pair.acceptor.onFrame((frame) => frames.push(frame));
    const ingest = new Ingest({
      ring: engine,
      outbox: store,
      link: slot,
      clock,
      logger: new Logger({
        sink: () => undefined,
        now: () => 0,
        minLevel: "debug",
      }),
    });
    const older = await store.append(
      () => ({ kind: "device_state", body: { order: "older" } }),
      signal,
    );
    await store.takeDue(10, signal);
    const newer = await store.append(
      () => ({ kind: "device_state", body: { order: "newer" } }),
      signal,
    );

    const queuedBefore = ingest.sendDue(signal);
    slot.put(pair.dialer);
    await Promise.all([queuedBefore, ingest.sessionOpened(signal)]);
    await new Promise((resolve) => setImmediate(resolve));
    const sent = frames
      .filter((frame) => frame.type === "device_state")
      .map((frame) =>
        frame.kind === "message"
          ? (frame.body as { message_id: string }).message_id
          : "",
      );
    expect(sent.slice(0, 2)).toEqual([older, newer]);
  });
});
