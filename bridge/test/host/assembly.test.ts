// The shared core and home assemblies (T027 part 2): the home and the core link up in one process,
// a standby core refuses links, and when the lease holder loses its lease the other core takes over
// with no moment where both run the link, and the home links to it again.
import { afterEach, describe, expect, it } from "vitest";
import { OutboxStore } from "../../src/connector/access/outbox-store/index.ts";
import { RESEND_TICK_MS } from "../../src/connector/clients/home-scheduler/index.ts";
import type { LeaseStore } from "../../src/core/access/lease/index.ts";
import type { SettingsStore } from "../../src/core/access/settings/index.ts";
import { assembleCore } from "../../src/host/core-assembly.ts";
import type { CoreAssembly } from "../../src/host/core-assembly.ts";
import { assembleHome } from "../../src/host/home-assembly.ts";
import type { HomeAssembly } from "../../src/host/home-assembly.ts";
import { FakeClock } from "../../src/utilities/clock/index.ts";
import type { CommonSettings } from "../../src/utilities/config/index.ts";
import { createLinkPair } from "../../src/utilities/link-transport/index.ts";
import type {
  DialOutcome,
  LinkClosed,
  LinkPair,
} from "../../src/utilities/link-transport/index.ts";
import { Logger } from "../../src/utilities/logging/index.ts";
import {
  CORE_MIGRATIONS,
  openSqliteQueryLayer,
  QueryLayerError,
  runMigrations,
} from "../../src/utilities/query-layer/index.ts";
import type { QueryLayer } from "../../src/utilities/query-layer/index.ts";
import {
  generateSigningKeyPair,
  signingKeyId,
} from "../../src/utilities/security/index.ts";
import type { SigningKeyPair } from "../../src/utilities/security/index.ts";
import { ScenarioEngine, standardHome } from "../scenarios/index.ts";
import { DRIVE_STEP_MS, driveFor, driveUntil } from "../support/index.ts";

const START = Date.UTC(2026, 10, 9, 9, 0, 0);
/** How long a stop may take before the test counts it as hung. */
const STOP_LIMIT_MS = 2_000;
const CODE = "home-code-1";
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

const cleanups: (() => Promise<void>)[] = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    await cleanup();
  }
});

interface Rig {
  readonly clock: FakeClock;
  readonly layer: QueryLayer;
  readonly logLines: string[];
  readonly logger: Logger;
  readonly key: SigningKeyPair;
}

async function rig(): Promise<Rig> {
  const clock = new FakeClock(START);
  const layer = openSqliteQueryLayer(":memory:", { clock });
  await runMigrations(layer, CORE_MIGRATIONS, { clock }, never());
  cleanups.push(() => layer.close());
  const logLines: string[] = [];
  const logger = new Logger({
    sink: (line) => logLines.push(line),
    now: () => clock.now(),
    minLevel: "debug",
  });
  return {
    clock,
    layer,
    logLines,
    logger,
    key: await generateSigningKeyPair(),
  };
}

function core(
  test: Rig,
  holder: string,
  leaseStore?: LeaseStore,
): CoreAssembly {
  const assembly = assembleCore({
    store: test.layer,
    clock: test.clock,
    logger: test.logger.with({ component: holder }),
    settings: SETTINGS,
    leaseHolder: holder,
    ...(leaseStore === undefined ? {} : { leaseStore }),
  });
  cleanups.push(() => assembly.stop());
  return assembly;
}

/** Approves the home's key directly, as the admin page's approval will (T029). */
async function enroll(
  settings: SettingsStore,
  key: SigningKeyPair,
): Promise<void> {
  await settings.requestEnrollment(
    { public_key: key.publicKey, code: CODE },
    never(),
  );
  await settings.approveEnrollment(signingKeyId(key.publicKey), never());
}

async function home(
  test: Rig,
  engine: ScenarioEngine,
  dial: (signal: AbortSignal) => Promise<DialOutcome>,
): Promise<HomeAssembly> {
  const outbox = await OutboxStore.open(
    { path: ":memory:", clock: test.clock },
    never(),
  );
  const assembly = assembleHome({
    ring: engine,
    outbox,
    dial,
    identity: {
      key: test.key,
      enrollmentCode: CODE,
      connectorVersion: "0.1.0",
    },
    clock: test.clock,
    logger: test.logger.with({ component: "home" }),
  });
  cleanups.push(async () => {
    await assembly.stop();
    await outbox.close();
  });
  return assembly;
}

/** A dial to whichever core runs the link, as a front door would route it; the first otherwise. */
function inProcess(
  test: Rig,
  cores: readonly CoreAssembly[],
): (signal: AbortSignal) => Promise<DialOutcome> {
  return () => {
    const pair = createLinkPair(test.logger);
    const serving = cores.find((candidate) => candidate.links.serving);
    (serving ?? cores[0])?.links.accept(pair.acceptor);
    return Promise.resolve({ kind: "connected", link: pair.dialer });
  };
}

/** A database the lease alone reaches, which the test can take down. */
function downable(layer: QueryLayer): LeaseStore & { down: boolean } {
  const store = {
    dialect: layer.dialect,
    down: false,
    run: (statement: Parameters<QueryLayer["run"]>[0], signal: AbortSignal) =>
      store.down
        ? Promise.reject(
            new QueryLayerError("store_down", "The test database is down."),
          )
        : layer.run(statement, signal),
  };
  return store;
}

async function deviceCount(assembly: CoreAssembly): Promise<number> {
  return (await assembly.state.devices({}, never())).length;
}

describe("the core and home assemblies", () => {
  it("link up in one process: the simulated home's inventory lands in State", async () => {
    const test = await rig();
    const coreSide = core(test, "core-a");
    await enroll(coreSide.settings, test.key);
    coreSide.start();
    await driveUntil(test.clock, () => coreSide.links.serving);
    const engine = new ScenarioEngine(test.clock);

    (await home(test, engine, inProcess(test, [coreSide]))).start();

    await driveUntil(
      test.clock,
      async () =>
        (await deviceCount(coreSide)) === standardHome().devices.length,
    );
    expect(test.logLines.join("\n")).toContain("core_lease_acquired");

    // A change in the home arrives on the same link, through Ring's live updates.
    const [device] = standardHome().devices;
    if (device === undefined) {
      throw new Error("The standard home has no device.");
    }
    engine.apply({
      kind: "device",
      deviceId: device.device_id,
      changes: { name: "Renamed while linked" },
    });
    await driveUntil(
      test.clock,
      async () =>
        (await coreSide.state.device(device.device_id, never()))?.name ===
        "Renamed while linked",
    );
  });

  it("refuses a link as core_unavailable on the core that does not hold the lease", async () => {
    const test = await rig();
    const holder = core(test, "core-a");
    const standby = core(test, "core-b");
    holder.start();
    await driveUntil(test.clock, () => holder.links.serving);
    standby.start();
    await driveUntil(test.clock, () => {
      const status = standby.lease.status;
      return !status.held && status.reason === "held_elsewhere";
    });

    const pair = createLinkPair(test.logger);
    const closes: LinkClosed[] = [];
    pair.dialer.onClose((closed) => closes.push(closed));
    standby.links.accept(pair.acceptor);
    await driveUntil(test.clock, () => closes.length > 0);

    expect(standby.links.serving).toBe(false);
    expect(closes[0]?.reason).toBe("core_unavailable");
  });

  it("hands the link over when the holder loses its lease, never running it on both, and the home links to the new holder", async () => {
    const test = await rig();
    const holderLease = downable(test.layer);
    const first = core(test, "core-a", holderLease);
    const second = core(test, "core-b");
    await enroll(first.settings, test.key);
    first.start();
    await driveUntil(test.clock, () => first.links.serving);
    second.start();
    const neverBoth = (): void => {
      expect(first.links.serving && second.links.serving).toBe(false);
    };
    const engine = new ScenarioEngine(test.clock);
    (await home(test, engine, inProcess(test, [first, second]))).start();
    await driveUntil(
      test.clock,
      async () => (await deviceCount(first)) === standardHome().devices.length,
      neverBoth,
    );

    holderLease.down = true;
    await driveUntil(test.clock, () => second.links.serving, neverBoth);
    const [device] = standardHome().devices;
    if (device === undefined) {
      throw new Error("The standard home has no device.");
    }
    engine.apply({
      kind: "device",
      deviceId: device.device_id,
      changes: { name: "Renamed after the handover" },
    });

    await driveUntil(
      test.clock,
      async () =>
        (await second.state.device(device.device_id, never()))?.name ===
        "Renamed after the handover",
      neverBoth,
    );
    expect(first.links.serving).toBe(false);
    expect(test.logLines.join("\n")).toContain("core_lease_lost");
  });

  // CP-10's review: a send held on a pushed-back link must not hold the home's stop.
  it("stops the home part while a send is held on its link, by closing the link first", async () => {
    const test = await rig();
    const coreSide = core(test, "core-a");
    await enroll(coreSide.settings, test.key);
    coreSide.start();
    await driveUntil(test.clock, () => coreSide.links.serving);
    const pairs: LinkPair[] = [];
    const engine = new ScenarioEngine(test.clock);
    const homeSide = await home(test, engine, () => {
      const pair = createLinkPair(test.logger);
      pairs.push(pair);
      coreSide.links.accept(pair.acceptor);
      return Promise.resolve({ kind: "connected", link: pair.dialer });
    });
    homeSide.start();
    await driveUntil(
      test.clock,
      async () =>
        (await deviceCount(coreSide)) === standardHome().devices.length,
    );
    const [device] = standardHome().devices;
    if (device === undefined) {
      throw new Error("The standard home has no device.");
    }

    // The connection stops taking writes: the change's send waits, and so does the next resend.
    pairs.at(-1)?.hold();
    engine.apply({
      kind: "device",
      deviceId: device.device_id,
      changes: { name: "Held on the link" },
    });
    await driveFor(test.clock, RESEND_TICK_MS + DRIVE_STEP_MS);
    const outcome = await Promise.race([
      homeSide.stop().then(() => "stopped"),
      new Promise((resolve) => {
        setTimeout(() => {
          resolve("still waiting");
        }, STOP_LIMIT_MS);
      }),
    ]);

    expect(outcome).toBe("stopped");
  });
});
