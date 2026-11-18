// The event path end to end (T044 with T047; FR-008, FR-042, SC-002): the home part and the core in
// one process, the simulated home's doorbell pushing through the real Push Listener, Normalize,
// Ingest, the outbox, the link, Connector Link and the Event manager into the core's Event Log.
// The three independent tests of tasks.md Phase 3:
//   1. a doorbell press appears in the core's log exactly once, with its priority from the policy;
//   2. the same event sent again, as when the core stopped between its commit and its ack, leaves
//      one event in the log and an empty backlog at home;
//   3. a link down for a minute loses nothing: every event arrives, in order per location.
import { afterEach, describe, expect, it } from "vitest";
import { OutboxStore } from "../../src/connector/access/outbox-store/index.ts";
import type {
  RingPush,
  RingPushPort,
} from "../../src/connector/access/ring-adapter/index.ts";
import { assembleCore } from "../../src/host/core-assembly.ts";
import type { CoreAssembly } from "../../src/host/core-assembly.ts";
import { assembleHome } from "../../src/host/home-assembly.ts";
import type { HomeAssembly } from "../../src/host/home-assembly.ts";
import { FakeClock } from "../../src/utilities/clock/index.ts";
import type { CommonSettings } from "../../src/utilities/config/index.ts";
import { createLinkPair } from "../../src/utilities/link-transport/index.ts";
import type {
  DialOutcome,
  LinkPair,
} from "../../src/utilities/link-transport/index.ts";
import { Logger } from "../../src/utilities/logging/index.ts";
import {
  CORE_MIGRATIONS,
  openSqliteQueryLayer,
  runMigrations,
} from "../../src/utilities/query-layer/index.ts";
import type { QueryLayer } from "../../src/utilities/query-layer/index.ts";
import {
  generateSigningKeyPair,
  signingKeyId,
} from "../../src/utilities/security/index.ts";
import type { SigningKeyPair } from "../../src/utilities/security/index.ts";
import {
  ScenarioEngine,
  STANDARD_LOCATION_ID,
  standardHome,
} from "../scenarios/index.ts";
import { driveFor, driveUntil } from "../support/index.ts";

const START = Date.UTC(2026, 10, 18, 9, 0, 0);
const CODE = "home-code-1";
const DOWN_MS = 60_000;
const DOOR_NAME = "דלת כניסה";
const SETTINGS: CommonSettings = {
  mode: "all-in-one",
  logLevel: "debug",
  readsPerHour: 600,
  batteryThresholdPct: 20,
  staleAfterMs: 120_000,
  eventRetentionDays: 30,
};

function never(): AbortSignal {
  return new AbortController().signal;
}

/** Ring's push for the simulated home: the doorbells' notifications, sent by the test. */
class DoorbellPush implements RingPushPort {
  readonly #listeners = new Set<(push: RingPush) => void>();

  watchPush(listener: (push: RingPush) => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  /** A press of `deviceId`, as Ring's version 2 notification, with Ring's own event id. */
  press(deviceId: string, ringEventId: string, at: number): void {
    const payload = {
      version: "2.0.0",
      android_config: {
        category: "com.ring.pn.live-event.ding",
        body: "There is someone at your door",
      },
      analytics: { triggered_at: at, referring_item_id: ringEventId },
      data: {
        device: { id: Number(deviceId), kind: "doorbell_v4", name: DOOR_NAME },
        event: {
          ding: {
            id: ringEventId,
            created_at: new Date(at).toISOString(),
            subtype: "ding",
          },
        },
        location: { id: STANDARD_LOCATION_ID },
      },
    };
    for (const listener of this.#listeners) {
      listener({
        device_id: deviceId,
        location_id: STANDARD_LOCATION_ID,
        payload,
      });
    }
  }
}

interface StoredRow {
  readonly event_id: string;
  readonly location_id: string;
  readonly seq: number;
  readonly kind: string;
  readonly priority: string;
  readonly late: number | boolean;
}

interface Rig {
  readonly clock: FakeClock;
  readonly layer: QueryLayer;
  readonly lines: string[];
  readonly push: DoorbellPush;
  readonly core: CoreAssembly;
  readonly home: HomeAssembly;
  readonly outbox: OutboxStore;
  /** The links dialled so far; the last is the current one. */
  readonly pairs: LinkPair[];
  /** While true, the home's dial finds the core unreachable. */
  readonly link: { down: boolean };
  readonly doorbellId: string;
  events(): Promise<readonly StoredRow[]>;
}

const cleanups: (() => Promise<void>)[] = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    await cleanup();
  }
});

async function enroll(core: CoreAssembly, key: SigningKeyPair): Promise<void> {
  await core.settings.requestEnrollment(
    { public_key: key.publicKey, code: CODE },
    never(),
  );
  await core.settings.approveEnrollment(signingKeyId(key.publicKey), never());
}

async function rig(): Promise<Rig> {
  const clock = new FakeClock(START);
  const layer = openSqliteQueryLayer(":memory:", { clock });
  await runMigrations(layer, CORE_MIGRATIONS, { clock }, never());
  cleanups.push(() => layer.close());
  const lines: string[] = [];
  const logger = new Logger({
    sink: (line) => lines.push(line),
    now: () => clock.now(),
    minLevel: "debug",
  });
  const key = await generateSigningKeyPair();
  const core = assembleCore({
    store: layer,
    clock,
    logger: logger.with({ component: "core" }),
    settings: SETTINGS,
    leaseHolder: "core-a",
  });
  cleanups.push(() => core.stop());
  await enroll(core, key);
  core.start();
  await driveUntil(clock, () => core.links.serving);

  const pairs: LinkPair[] = [];
  const link = { down: false };
  const dial = (): Promise<DialOutcome> => {
    if (link.down) {
      return Promise.resolve({ kind: "unreachable" });
    }
    const pair = createLinkPair(logger);
    pairs.push(pair);
    core.links.accept(pair.acceptor);
    return Promise.resolve({ kind: "connected", link: pair.dialer });
  };
  const outbox = await OutboxStore.open(
    { path: ":memory:", clock, random: () => 0.5 },
    never(),
  );
  const push = new DoorbellPush();
  const home = assembleHome({
    ring: new ScenarioEngine(clock),
    push,
    outbox,
    dial,
    identity: { key, enrollmentCode: CODE, connectorVersion: "0.2.0" },
    clock,
    logger: logger.with({ component: "home" }),
  });
  cleanups.push(async () => {
    await home.stop();
    await outbox.close();
  });
  home.start();
  const devices = standardHome().devices;
  await driveUntil(
    clock,
    async () =>
      (await core.state.devices({}, never())).length === devices.length,
  );
  const doorbell = devices.find((device) => device.type === "doorbell");
  if (doorbell === undefined) {
    throw new Error("The standard home has no doorbell.");
  }
  return {
    clock,
    layer,
    lines,
    push,
    core,
    home,
    outbox,
    pairs,
    link,
    doorbellId: doorbell.device_id,
    events: async () =>
      (await layer.all(
        {
          sql: "SELECT event_id, location_id, seq, kind, priority, late FROM event ORDER BY location_id, seq",
          params: {},
        },
        never(),
      )) as unknown as StoredRow[],
  };
}

async function backlog(test: Rig): Promise<number> {
  return (await test.outbox.eventBacklog(never())).count;
}

describe("the event path, home to core", () => {
  it("stores a doorbell press exactly once, HIGH by the policy, and clears it from the home's outbox", async () => {
    const test = await rig();

    test.push.press(test.doorbellId, "7400000000000000001", test.clock.now());

    await driveUntil(
      test.clock,
      async () => (await test.events()).length === 1,
    );
    await driveUntil(test.clock, async () => (await backlog(test)) === 0);
    expect(await test.events()).toEqual([
      expect.objectContaining({
        event_id: "7400000000000000001-d",
        location_id: STANDARD_LOCATION_ID,
        seq: 1,
        kind: "doorbell.ding",
        priority: "HIGH",
      }),
    ]);
    await driveFor(test.clock, 60_000);
    expect(await test.events()).toHaveLength(1);
    expect(test.lines.join("\n")).not.toContain(DOOR_NAME);
  });

  it("writes an event once when the home sends it again after the core committed it, and empties the home's backlog", async () => {
    const test = await rig();
    test.push.press(test.doorbellId, "7400000000000000002", test.clock.now());
    await driveUntil(
      test.clock,
      async () => (await test.events()).length === 1,
    );
    await driveUntil(test.clock, async () => (await backlog(test)) === 0);

    // The ack never reached the home: the same event is in its outbox again, as before the ack.
    test.push.press(test.doorbellId, "7400000000000000002", test.clock.now());

    await driveUntil(test.clock, () =>
      test.lines.some((line) =>
        line.includes("connector_link_event_duplicate"),
      ),
    );
    await driveUntil(test.clock, async () => (await backlog(test)) === 0);
    expect(await test.events()).toHaveLength(1);
  });

  it("loses nothing while the link is down for a minute: every event arrives, in order", async () => {
    const test = await rig();
    test.link.down = true;
    test.pairs.at(-1)?.drop();
    await driveUntil(test.clock, () => !test.home.linkUp());

    const ids = [
      "7400000000000000011",
      "7400000000000000012",
      "7400000000000000013",
    ];
    for (const id of ids) {
      test.push.press(test.doorbellId, id, test.clock.now());
      await driveFor(test.clock, 5_000);
    }
    await driveFor(test.clock, DOWN_MS - 15_000);
    expect(await test.events()).toHaveLength(0);
    expect(await backlog(test)).toBe(3);

    test.link.down = false;
    await driveUntil(
      test.clock,
      async () => (await test.events()).length === 3,
    );
    await driveUntil(test.clock, async () => (await backlog(test)) === 0);
    expect((await test.events()).map((row) => [row.event_id, row.seq])).toEqual(
      [
        [`${ids[0] ?? ""}-d`, 1],
        [`${ids[1] ?? ""}-d`, 2],
        [`${ids[2] ?? ""}-d`, 3],
      ],
    );
  });
});
