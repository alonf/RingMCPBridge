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
import type {
  LinkConnection,
  LinkFrame,
  LinkMessage,
  SendOutcome,
} from "../../../utilities/link-transport/index.ts";
import {
  OutboxStore,
  OutboxStoreError,
} from "../../access/outbox-store/index.ts";
import type { OutboxItem } from "../../access/outbox-store/index.ts";
import { RingAdapterError } from "../../access/ring-adapter/index.ts";
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
  readonly snapshot_version: number;
  readonly session_id?: string;
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
        state_version: 2,
      },
    ]);
    expect(inventory.devices).toHaveLength(DEVICE_COUNT);
    expect(inventory.devices[0]).toEqual({
      ...standardDevice(HEBREW_DEVICE_ID),
      as_of: asOf,
      state_version: 3,
    });
    // The snapshot's own version comes first, so every entry's is higher (CP-14 review round 3).
    expect(inventory.snapshot_version).toBe(1);
    expect(versionsOf(inventory)).toEqual(
      Array.from({ length: DEVICE_COUNT + 1 }, (_, index) => index + 2),
    );
    expect(inventory).not.toHaveProperty("session_id");
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
      // After the inventory's own version and its entries' versions.
      state_version: DEVICE_COUNT + 3,
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
          inventory_owed_after: null,
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
    await Promise.all([
      queuedBefore,
      ingest.sessionOpened("session-one", signal),
    ]);
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

/** The real outbox, whose writes fail while `failing` is set: a full disk, or a lock that lasts. */
function failingWrites(store: OutboxStore): {
  outbox: OutboxStore;
  failing: { value: boolean };
} {
  const failing = { value: false };
  const outbox = new Proxy(store, {
    get(target, property) {
      if (property === "append" && failing.value) {
        return () =>
          Promise.reject(new OutboxStoreError("unavailable", "Disk full."));
      }
      const value: unknown = Reflect.get(target, property, target);
      if (typeof value !== "function") {
        return value;
      }
      const method = value as (...args: unknown[]) => unknown;
      return method.bind(target);
    },
  });
  return { outbox, failing };
}

/** A link whose writes finish only when the test lets each one go: a slow socket. */
function slowLink(): {
  link: LinkConnection;
  writes: { message: LinkMessage; finish: (outcome: SendOutcome) => void }[];
} {
  const writes: {
    message: LinkMessage;
    finish: (outcome: SendOutcome) => void;
  }[] = [];
  const link: LinkConnection = {
    send: (message) =>
      new Promise((finish) => {
        writes.push({ message, finish });
      }),
    sendChunk: () => Promise.resolve("closed"),
    onFrame: () => () => undefined,
    onClose: () => () => undefined,
    close: () => undefined,
    closed: undefined,
  };
  return { link, writes };
}

describe("Ingest after review round 3", () => {
  it("sends a fresh inventory on the next tick after a change it could not queue, with no other change", async () => {
    const engine = new ScenarioEngine(clock);
    const store = await openStore();
    const { outbox, failing } = failingWrites(store);
    const slot = new LinkSlot();
    const pair = createLinkPair(
      new Logger({ sink: () => undefined, now: () => 0, minLevel: "debug" }),
    );
    const frames: LinkFrame[] = [];
    pair.acceptor.onFrame((frame) => frames.push(frame));
    const ingest = new Ingest({
      ring: engine,
      outbox,
      link: slot,
      clock,
      logger: new Logger({
        sink: (line) => lines.push(line),
        now: () => clock.now(),
        minLevel: "debug",
      }),
    });
    ingest.start();
    ingests.push(ingest);
    slot.put(pair.dialer);
    await ingest.sessionOpened("session-one", signal);
    await new Promise((resolve) => setImmediate(resolve));
    for (const item of await store.takeDue(10, signal)) {
      await store.acknowledge(item.messageId, signal);
    }
    for (const frame of frames.splice(0)) {
      if (frame.kind === "message") {
        await store.acknowledge(
          (frame.body as { message_id: string }).message_id,
          signal,
        );
      }
    }

    failing.value = true;
    openDoor(engine);
    await ingest.flush();
    expect(lines.join("\n")).toContain("ingest_state_not_queued");
    failing.value = false;
    await ingest.sendDue(signal);
    await new Promise((resolve) => setImmediate(resolve));

    const inventories = frames.filter((frame) => frame.type === "inventory");
    expect(inventories).toHaveLength(1);
    const devices = (
      inventories[0]?.kind === "message"
        ? (inventories[0].body as { devices: DeviceEntry[] }).devices
        : []
    ).filter((device) => device.device_id === HEBREW_DEVICE_ID);
    expect(devices.map((device) => device.state)).toEqual([{ open: true }]);
  });

  it("writes the outbox's backlog one message at a time, leaving the rest on disk, and never queues copies", async () => {
    const engine = new ScenarioEngine(clock);
    const store = await openStore();
    const slot = new LinkSlot();
    const { link, writes } = slowLink();
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
    ingests.push(ingest);
    for (let index = 0; index < 5; index += 1) {
      await store.append(
        () => ({ kind: "device_state", body: { index } }),
        signal,
      );
    }
    slot.put(link);

    const first = ingest.sendDue(signal);
    await new Promise((resolve) => setImmediate(resolve));
    expect(writes).toHaveLength(1);
    await clock.advance(10_000);
    const tick = ingest.sendDue(signal);
    await new Promise((resolve) => setImmediate(resolve));
    expect(writes).toHaveLength(1);

    for (let index = 0; index < 5; index += 1) {
      for (let round = 0; writes.length <= index; round += 1) {
        if (round > 500) {
          throw new Error(`Write ${String(index + 1)} never started.`);
        }
        await new Promise((resolve) => setImmediate(resolve));
      }
      expect(writes).toHaveLength(index + 1);
      writes[index]?.finish("sent");
    }
    await Promise.all([first, tick]);
    const ids = writes.map(
      (write) => (write.message.body as { message_id: string }).message_id,
    );
    expect(ids).toHaveLength(5);
    expect(new Set(ids).size).toBe(5);
  });
});

describe("Ingest after CP-14 review round 3", () => {
  it("stamps the session's inventory with that session, and one composed with no link in the slot with none", async () => {
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
    ingest.start();
    ingests.push(ingest);

    slot.put(pair.dialer);
    await ingest.sessionOpened("session-one", signal);
    await new Promise((resolve) => setImmediate(resolve));
    const [sent] = frames
      .filter((frame) => frame.type === "inventory")
      .map((frame) =>
        frame.kind === "message" ? (frame.body as InventoryBody) : undefined,
      );
    expect(sent?.session_id).toBe("session-one");
    expect(sent?.snapshot_version).toBeLessThan(
      Math.min(...versionsOf(sent ?? fail())),
    );

    slot.clear(pair.dialer);
    engine.apply({
      kind: "alarm_mode",
      locationId: STANDARD_LOCATION_ID,
      mode: "away",
    });
    await ingest.flush();
    const queued = (await takeAll(store)).filter(
      (item) => item.kind === "inventory",
    );
    expect(queued.at(-1)?.body).not.toHaveProperty("session_id");
  });
});

/** A Ring whose reads each wait, once Ring has answered, until the test lets them go. */
class GatedReads implements RingPort {
  readonly #engine: ScenarioEngine;
  readonly waiting: {
    readonly release: () => void;
    readonly fail: (error: Error) => void;
  }[] = [];

  constructor(engine: ScenarioEngine) {
    this.#engine = engine;
  }

  sessionStatus(): RingSessionStatus {
    return this.#engine.sessionStatus();
  }

  async locations(readSignal: AbortSignal): Promise<readonly RingLocation[]> {
    const taken = await this.#engine.locations(readSignal);
    await new Promise<void>((release, failRead) => {
      this.waiting.push({ release, fail: failRead });
    });
    return taken;
  }

  devices(
    locationId: string,
    readSignal: AbortSignal,
  ): Promise<readonly RingDevice[]> {
    return this.#engine.devices(locationId, readSignal);
  }

  watch(listener: (change: RingChange) => void): StopWatching {
    return this.#engine.watch(listener);
  }
}

/** Lets the work already started run until `ready` holds. */
async function until(ready: () => boolean): Promise<void> {
  for (let turn = 0; turn < 500 && !ready(); turn += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  expect(ready()).toBe(true);
}

/** A link from home whose core end records each inventory it receives. */
function recordedLink(): {
  readonly dialer: LinkConnection;
  readonly inventories: InventoryBody[];
} {
  const pair = createLinkPair(
    new Logger({ sink: () => undefined, now: () => 0, minLevel: "debug" }),
  );
  const inventories: InventoryBody[] = [];
  pair.acceptor.onFrame((frame) => {
    if (frame.kind === "message" && frame.type === "inventory") {
      inventories.push(frame.body as InventoryBody);
    }
  });
  return { dialer: pair.dialer, inventories };
}

function namesOf(
  inventories: readonly InventoryBody[],
): (string | undefined)[] {
  return inventories.map((inventory) => inventory.session_id);
}

/** Ingest over gated reads, with session one open and its first inventory read. */
async function afterFirstSession(): Promise<{
  readonly engine: ScenarioEngine;
  readonly ring: GatedReads;
  readonly store: OutboxStore;
  readonly slot: LinkSlot;
  readonly ingest: Ingest;
  readonly first: ReturnType<typeof recordedLink>;
}> {
  const engine = new ScenarioEngine(clock);
  const ring = new GatedReads(engine);
  const store = await openStore();
  const slot = new LinkSlot();
  const ingest = new Ingest({
    ring,
    outbox: store,
    link: slot,
    clock,
    logger: new Logger({
      sink: (line) => lines.push(line),
      now: () => clock.now(),
      minLevel: "debug",
    }),
  });
  ingest.start();
  ingests.push(ingest);
  const first = recordedLink();
  slot.put(first.dialer);
  const opened = ingest.sessionOpened("session-one", signal);
  await until(() => ring.waiting.length === 1);
  ring.waiting[0]?.release();
  await opened;
  return { engine, ring, store, slot, ingest, first };
}

describe("Ingest after CP-14 review round 4", () => {
  it("does not name the new session on an inventory sent on an alarm mode change while that session's own read runs", async () => {
    const { engine, ring, slot, ingest, first } = await afterFirstSession();
    slot.clear(first.dialer);
    const second = recordedLink();
    slot.put(second.dialer);
    const reopened = ingest.sessionOpened("session-two", signal);
    await until(() => ring.waiting.length === 2);

    engine.apply({
      kind: "alarm_mode",
      locationId: STANDARD_LOCATION_ID,
      mode: "away",
    });
    await ingest.flush();
    ring.waiting[1]?.release();
    await reopened;
    await until(() => second.inventories.length === 3);

    // Session one's unacked inventory goes again first, still naming session one.
    expect(namesOf(second.inventories)).toEqual([
      "session-one",
      undefined,
      "session-two",
    ]);
    expect(second.inventories[2]?.locations[0]?.alarm_mode).toBe("away");
  });

  it("does not name the new session on an inventory read before it opened, and still owes that session its own", async () => {
    const { ring, slot, ingest, first } = await afterFirstSession();
    const asked = ingest.inventoryRequested(signal);
    await until(() => ring.waiting.length === 2);
    slot.clear(first.dialer);
    const second = recordedLink();
    slot.put(second.dialer);
    const reopened = ingest.sessionOpened("session-two", signal);
    await until(() => ring.waiting.length === 3);
    ring.waiting[2]?.fail(
      new RingAdapterError("ring_unavailable", "Ring is down."),
    );
    await reopened;

    ring.waiting[1]?.release();
    expect(await asked).toBe("queued");
    const tick = ingest.sendDue(signal);
    await until(() => ring.waiting.length === 4);
    ring.waiting[3]?.release();
    await tick;
    await until(() => second.inventories.length === 3);

    expect(namesOf(second.inventories)).toEqual([
      "session-one",
      undefined,
      "session-two",
    ]);
  });

  it("drops a read that finishes after one begun later, whose picture is newer", async () => {
    const engine = new ScenarioEngine(clock);
    const ring = new GatedReads(engine);
    const store = await openStore();
    const ingest = startIngest(ring, store);
    const earlier = ingest.inventoryRequested(signal);
    await until(() => ring.waiting.length === 1);
    const later = ingest.inventoryRequested(signal);
    await until(() => ring.waiting.length === 2);

    ring.waiting[1]?.release();
    expect(await later).toBe("queued");
    ring.waiting[0]?.release();
    expect(await earlier).toBe("superseded");
    await ingest.flush();

    const items = await takeAll(store);
    expect(items.filter((item) => item.kind === "inventory")).toHaveLength(1);
    expect(lines.join("\n")).not.toContain("superseded");
  });
});

/** Ingest in an open session, with what it sent read back: the heartbeat's debt and the inventories. */
interface InSession {
  readonly ingest: Ingest;
  /** Sends a heartbeat and answers its `inventory_owed_after`. */
  readonly owed: () => Promise<unknown>;
  readonly inventories: () => InventoryBody[];
}

async function inSession(
  ring: RingPort,
  outbox: OutboxStore,
): Promise<InSession> {
  const slot = new LinkSlot();
  const pair = createLinkPair(
    new Logger({ sink: () => undefined, now: () => 0, minLevel: "debug" }),
  );
  const frames: LinkFrame[] = [];
  pair.acceptor.onFrame((frame) => frames.push(frame));
  const ingest = new Ingest({
    ring,
    outbox,
    link: slot,
    clock,
    logger: new Logger({
      sink: (line) => lines.push(line),
      now: () => clock.now(),
      minLevel: "debug",
    }),
  });
  ingest.start();
  ingests.push(ingest);
  slot.put(pair.dialer);
  await ingest.sessionOpened("session-one", signal);
  return {
    ingest,
    owed: async () => {
      await ingest.sendHeartbeat(signal);
      await new Promise((resolve) => setImmediate(resolve));
      const last = frames.filter((frame) => frame.type === "heartbeat").at(-1);
      return last?.kind === "message"
        ? (last.body as { inventory_owed_after: unknown }).inventory_owed_after
        : "no heartbeat";
    },
    inventories: () =>
      frames.flatMap((frame) =>
        frame.kind === "message" && frame.type === "inventory"
          ? [frame.body as InventoryBody]
          : [],
      ),
  };
}

describe("Ingest after CP-14 review round 5", () => {
  it("says in its heartbeat that it owes an inventory above the newest version written before a change it could not write, the latest such, until the session's own inventory is queued", async () => {
    const engine = new ScenarioEngine(clock);
    const store = await openStore();
    const { outbox, failing } = failingWrites(store);
    const { ingest, owed, inventories } = await inSession(engine, outbox);
    expect(await owed()).toBeNull();
    const written = Math.max(...versionsOf(inventories()[0] ?? fail()));

    failing.value = true;
    openDoor(engine);
    await ingest.flush();
    expect(await owed()).toBe(written);

    failing.value = false;
    openDoor(engine, false);
    await ingest.flush();
    failing.value = true;
    openDoor(engine);
    await ingest.flush();
    expect(await owed()).toBe(written + 1);

    failing.value = false;
    await ingest.sendDue(signal);
    await new Promise((resolve) => setImmediate(resolve));
    expect(await owed()).toBeNull();
    const paying = inventories().at(-1) ?? fail();
    expect(paying.session_id).toBe("session-one");
    expect(paying.snapshot_version).toBeGreaterThan(written + 1);
    expect(
      paying.devices.find((device) => device.device_id === HEBREW_DEVICE_ID)
        ?.state,
    ).toEqual({ open: true });
  });
});

// A device added or removed at Ring is reported as a change of the location's device list, and only
// a fresh read lists the devices as they are now (DRIFT-001-41).
describe("Ingest after a device is added or removed at Ring (CP-16 review follow-up)", () => {
  const addedId = "added-sensor";

  function addedDevice(): RingDevice {
    return {
      ...standardDevice(HEBREW_DEVICE_ID),
      device_id: addedId,
      name: "חיישן חדש",
    };
  }

  function idsOf(inventory: InventoryBody): string[] {
    return inventory.devices.map((device) => device.device_id);
  }

  it("reads the home again when Ring adds a device, and queues an inventory that lists it", async () => {
    const { engine, store, ingest } = await setup();
    await ingest.inventoryRequested(signal);
    await takeAll(store);
    await clock.advance(1_000);

    engine.apply({ kind: "device_added", device: addedDevice() });
    await ingest.flush();

    const items = await takeAll(store);
    expect(items).toHaveLength(1);
    const inventory = inventoryOf(items[0]);
    expect(inventory.devices).toHaveLength(DEVICE_COUNT + 1);
    expect(
      inventory.devices.find((device) => device.device_id === addedId),
    ).toMatchObject({ name: "חיישן חדש", as_of: formatUtc(START + 1_000) });
  });

  it("reads the home again when Ring removes a device, and the inventory leaves it out", async () => {
    const { engine, store, ingest } = await setup();
    await ingest.inventoryRequested(signal);
    await takeAll(store);

    engine.apply({ kind: "device_removed", deviceId: HEBREW_DEVICE_ID });
    await ingest.flush();

    const items = await takeAll(store);
    expect(items).toHaveLength(1);
    const inventory = inventoryOf(items[0]);
    expect(inventory.devices).toHaveLength(DEVICE_COUNT - 1);
    expect(idsOf(inventory)).not.toContain(HEBREW_DEVICE_ID);
  });

  it("logs and counts a read that fails unexpectedly, and reads again on the next change", async () => {
    const store = await openStore();
    const engine = new ScenarioEngine(clock);
    let broken = true;
    const ring: RingPort = {
      sessionStatus: () => engine.sessionStatus(),
      locations: (readSignal) =>
        broken
          ? Promise.reject(new Error("not a Ring Adapter error"))
          : engine.locations(readSignal),
      devices: (locationId, readSignal) =>
        engine.devices(locationId, readSignal),
      watch: (listener) => engine.watch(listener),
    };
    const ingest = startIngest(ring, store);

    engine.apply({ kind: "device_removed", deviceId: HEBREW_DEVICE_ID });
    await ingest.flush();
    expect(await store.depth(signal)).toBe(0);
    expect(lines.join("\n")).toContain("ingest_inventory_not_read");

    broken = false;
    engine.apply({ kind: "device_added", device: addedDevice() });
    await ingest.flush();
    const items = await takeAll(store);
    expect(items).toHaveLength(1);
    expect(idsOf(inventoryOf(items[0]))).toContain(addedId);
  });

  it("reads once more for the changes that came during a read, not once for each", async () => {
    const engine = new ScenarioEngine(clock);
    const store = await openStore();
    const ingest = startIngest(new StaleReads(engine, SLOW_MS), store);
    await driveFakeClock(clock, ingest.inventoryRequested(signal));
    await takeAll(store);
    const readsPerInventory = engine.reads;

    engine.apply({ kind: "device_removed", deviceId: HEBREW_DEVICE_ID });
    engine.apply({ kind: "device_added", device: addedDevice() });
    engine.apply({ kind: "device_removed", deviceId: addedId });
    await driveFakeClock(clock, ingest.flush());

    expect(engine.reads).toBe(3 * readsPerInventory);
    const inventories = (await takeAll(store)).map(inventoryOf);
    expect(inventories).toHaveLength(2);
    const latest = inventories.at(-1);
    expect(latest === undefined ? [] : idsOf(latest)).not.toContain(
      HEBREW_DEVICE_ID,
    );
    expect(latest?.devices).toHaveLength(DEVICE_COUNT - 1);
  });

  // CP-06's review: the core heard nothing of a device list change whose fresh read never reached
  // the outbox, and kept serving the old list as current.
  const faults = [
    "the inventory cannot be written",
    "Ring cannot be read",
    "the read fails unexpectedly",
  ] as const;

  it.each(faults)(
    "says in its heartbeat that it owes an inventory when %s after a device is added, until the next tick queues one that lists it",
    async (fault) => {
      const engine = new ScenarioEngine(clock);
      const store = await openStore();
      const { outbox, failing } = failingWrites(store);
      let broken = false;
      const ring: RingPort = {
        sessionStatus: () => engine.sessionStatus(),
        locations: (readSignal) => {
          if (broken && fault === "Ring cannot be read") {
            return Promise.reject(
              new RingAdapterError("ring_unavailable", "Ring is down."),
            );
          }
          if (broken && fault === "the read fails unexpectedly") {
            return Promise.reject(new Error("not a Ring Adapter error"));
          }
          return engine.locations(readSignal);
        },
        devices: (locationId, readSignal) =>
          engine.devices(locationId, readSignal),
        watch: (listener) => engine.watch(listener),
      };
      const { ingest, owed, inventories } = await inSession(ring, outbox);
      expect(await owed()).toBeNull();
      const written = Math.max(...versionsOf(inventories()[0] ?? fail()));

      broken = true;
      failing.value = fault === "the inventory cannot be written";
      engine.apply({ kind: "device_added", device: addedDevice() });
      await ingest.flush();
      expect(await owed()).toBe(written);

      broken = false;
      failing.value = false;
      await ingest.sendDue(signal);
      await new Promise((resolve) => setImmediate(resolve));
      expect(await owed()).toBeNull();
      const paying = inventories().at(-1) ?? fail();
      expect(paying.session_id).toBe("session-one");
      expect(paying.snapshot_version).toBeGreaterThan(written);
      expect(idsOf(paying)).toContain(addedId);
    },
  );
});
