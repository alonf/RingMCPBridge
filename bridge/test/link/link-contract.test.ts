// The link's version 1 contract, both ends at once (T017; PT-07, FR-042, AC B10): the real Core
// Link with Ingest, its outbox and the simulated home, against the real Connector Link with Admin
// and Settings on SQLite. Event is a recorder until T018. First over the in-memory pair with drops,
// delays and duplicates in front of the core, then over real WSS with TLS on localhost, where the
// home must be back within 60 s of the core's return.
//
// Both ends run on one fake clock. The N-1 contract test comes with the first version bump (PT-07).
import { createServer as createTlsServer } from "node:https";
import type { Server as TlsServer } from "node:https";
import type { AddressInfo } from "node:net";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { OutboxStore } from "../../src/connector/access/outbox-store/index.ts";
import { CoreLink } from "../../src/connector/clients/core-link/index.ts";
import { HomeScheduler } from "../../src/connector/clients/home-scheduler/index.ts";
import { Ingest } from "../../src/connector/managers/ingest/index.ts";
import { SettingsStore } from "../../src/core/access/settings/index.ts";
import { ConnectorLink } from "../../src/core/clients/connector-link/index.ts";
import { AdminManager } from "../../src/core/managers/admin/index.ts";
import { FakeClock } from "../../src/utilities/clock/index.ts";
import {
  createLinkPair,
  dialLink,
  LinkServer,
  LinkSlot,
} from "../../src/utilities/link-transport/index.ts";
import type {
  DialOutcome,
  LinkConnection,
  LinkFrame,
  LinkPair,
} from "../../src/utilities/link-transport/index.ts";
import { Logger } from "../../src/utilities/logging/index.ts";
import {
  CORE_MIGRATIONS,
  openSqliteQueryLayer,
  runMigrations,
} from "../../src/utilities/query-layer/index.ts";
import {
  generateSigningKeyPair,
  signingKeyId,
} from "../../src/utilities/security/index.ts";
import type { SigningKeyPair } from "../../src/utilities/security/index.ts";
import {
  FaultyChannel,
  HEBREW_DEVICE_ID,
  HEBREW_DEVICE_NAME,
  ScenarioEngine,
} from "../scenarios/index.ts";
import {
  makeThrowawayCertificate,
  OPENSSL_AVAILABLE,
  RecordingIntake,
  requireOpensslInCi,
} from "../support/index.ts";
import type { ThrowawayCertificate } from "../support/index.ts";

const START = Date.UTC(2026, 10, 7, 9, 0, 0);
const CODE = "7Q4K-29XM";
const VERSION = "0.1.0";
const LINK_PATH = "/link";
const STEP_MS = 100;
const DRIVE_LIMIT_MS = 5 * 60_000;
const RECONNECT_GOAL_MS = 60_000;
const CORE_AWAY_MS = 3 * 60_000;
// Longer than the 10 s resend time plus one 10 s scheduler tick, so a resend always goes out
// before the delayed message arrives.
const DELAY_PAST_RESEND_MS = 25_000;
const CERTIFICATE_TIMEOUT_MS = 30_000;
const signal = new AbortController().signal;
const UNREACHABLE: DialOutcome = { kind: "unreachable" };

type Dial = (signal: AbortSignal) => Promise<DialOutcome>;

interface Both {
  readonly clock: FakeClock;
  readonly homeLines: string[];
  readonly logger: Logger;
  readonly key: SigningKeyPair;
  readonly engine: ScenarioEngine;
  readonly outbox: OutboxStore;
  readonly slot: LinkSlot;
  readonly settings: SettingsStore;
  readonly intake: RecordingIntake;
  readonly connectorLink: ConnectorLink;
  /** Starts the home with the given dial. */
  start(dial: Dial): void;
}

const stops: (() => Promise<void> | void)[] = [];

afterEach(async () => {
  for (const stop of stops.splice(0).reverse()) {
    await stop();
  }
});

function loggerOn(clock: FakeClock, lines: string[]): Logger {
  return new Logger({
    sink: (line) => lines.push(line),
    now: () => clock.now(),
    minLevel: "debug",
  });
}

async function both(): Promise<Both> {
  const clock = new FakeClock(START);
  const homeLines: string[] = [];
  const homeLogger = loggerOn(clock, homeLines);
  const logger = loggerOn(clock, []);
  const key = await generateSigningKeyPair();

  const engine = new ScenarioEngine(clock);
  const outbox = await OutboxStore.open({ path: ":memory:", clock }, signal);
  const slot = new LinkSlot();
  const ingest = new Ingest({
    ring: engine,
    outbox,
    link: slot,
    clock,
    logger: homeLogger,
  });
  const scheduler = new HomeScheduler({ ingest, clock, logger: homeLogger });

  const layer = openSqliteQueryLayer(":memory:", { clock });
  await runMigrations(layer, CORE_MIGRATIONS, { clock }, signal);
  const settings = new SettingsStore({
    store: layer,
    clock,
    defaultBatteryThresholdPct: 20,
  });
  const intake = new RecordingIntake();
  const connectorLink = new ConnectorLink({
    admin: new AdminManager({ settings }),
    intake,
    clock,
    logger,
  });

  let coreLink: CoreLink | undefined;
  stops.push(
    () => layer.close(),
    () => outbox.close(),
    () => connectorLink.stop(),
    () => ingest.stop(),
    () => coreLink?.stop(),
    () => scheduler.stop(),
  );
  return {
    clock,
    homeLines,
    logger,
    key,
    engine,
    outbox,
    slot,
    settings,
    intake,
    connectorLink,
    start: (dial) => {
      coreLink = new CoreLink({
        dial,
        slot,
        ingest,
        identity: { key, enrollmentCode: CODE, connectorVersion: VERSION },
        clock,
        logger: homeLogger,
        // The longest backoff every time: the worst case for the 60 s goal.
        random: () => 1,
      });
      ingest.start();
      coreLink.start();
      scheduler.start();
    },
  };
}

/** Enrolls the home's key in Settings directly, as the admin page's approval will (T029). */
async function enrolled(test: Both): Promise<void> {
  await test.settings.requestEnrollment(
    { public_key: test.key.publicKey, code: CODE },
    signal,
  );
  await test.settings.approveEnrollment(
    signingKeyId(test.key.publicKey),
    signal,
  );
}

/** A link whose incoming frames pass through a `FaultyChannel` on the fake clock. */
function withFaults(
  link: LinkConnection,
  clock: FakeClock,
): { link: LinkConnection; channel: FaultyChannel<LinkFrame> } {
  const listeners = new Set<(frame: LinkFrame) => void>();
  const channel = new FaultyChannel<LinkFrame>(clock, (frame) => {
    for (const listener of listeners) {
      listener(frame);
    }
  });
  link.onFrame((frame) => {
    channel.send(frame);
  });
  const faulty: LinkConnection = {
    send: (message) => link.send(message),
    sendChunk: (chunk) => link.sendChunk(chunk),
    onFrame: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    onClose: (listener) => link.onClose(listener),
    close: (reason) => {
      link.close(reason);
    },
    get closed() {
      return link.closed;
    },
  };
  return { link: faulty, channel };
}

interface InMemoryCore {
  readonly pairs: LinkPair[];
  readonly channels: FaultyChannel<LinkFrame>[];
  down: boolean;
  /** While down: the core returns at the first failed dial at or after this time. */
  returnAt: number | undefined;
  /** When the core returned: just after a dial failed, the worst moment for the home. */
  returnedAt: number | undefined;
  readonly dial: Dial;
}

/** The core behind the in-memory pair, with faults in front of it. */
function inMemoryCore(test: Both): InMemoryCore {
  const core: InMemoryCore = {
    pairs: [],
    channels: [],
    down: false,
    returnAt: undefined,
    returnedAt: undefined,
    dial: () => {
      if (core.down) {
        if (core.returnAt !== undefined && test.clock.now() >= core.returnAt) {
          core.down = false;
          core.returnedAt = test.clock.now();
        }
        return Promise.resolve(UNREACHABLE);
      }
      const pair = createLinkPair(test.logger);
      const { link, channel } = withFaults(pair.acceptor, test.clock);
      core.pairs.push(pair);
      core.channels.push(channel);
      test.connectorLink.accept(link);
      return Promise.resolve({ kind: "connected", link: pair.dialer });
    },
  };
  return core;
}

function lastOf<T>(items: readonly T[]): T {
  const item = items.at(-1);
  if (item === undefined) {
    throw new Error("There is none yet.");
  }
  return item;
}

async function ioRound(realWaitMs: number): Promise<void> {
  for (let round = 0; round < 5; round += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  if (realWaitMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, realWaitMs));
  }
}

/**
 * Moves the fake clock in small steps, letting I/O run between them, until `condition` holds.
 * Resolves with the fake time it took.
 */
async function driveUntil(
  clock: FakeClock,
  condition: () => boolean | Promise<boolean>,
  realWaitMs = 0,
): Promise<number> {
  const startedAt = clock.now();
  while (!(await condition())) {
    if (clock.now() - startedAt > DRIVE_LIMIT_MS) {
      throw new Error("The link did not get there in time.");
    }
    await clock.advance(STEP_MS);
    await ioRound(realWaitMs);
  }
  return clock.now() - startedAt;
}

async function driveFor(
  clock: FakeClock,
  ms: number,
  realWaitMs = 0,
): Promise<void> {
  const until = clock.now() + ms;
  await driveUntil(clock, () => clock.now() >= until, realWaitMs);
}

function intakeBodies(test: Both, method: string): Record<string, unknown>[] {
  return test.intake.calls
    .filter((call) => call.method === method)
    .map((call) => call.body as Record<string, unknown>);
}

async function outboxEmpty(test: Both): Promise<boolean> {
  return (await test.outbox.depth(signal)) === 0;
}

function deviceStateIds(test: Both): string[] {
  return intakeBodies(test, "deviceState").map((body) =>
    String(body.message_id),
  );
}

requireOpensslInCi();

describe("the link, version 1, both ends", () => {
  it("enrolls, waits for the owner, opens a session, and commits the inventory, heartbeats and changes", async () => {
    const test = await both();
    const core = inMemoryCore(test);
    test.start(core.dial);

    await driveUntil(
      test.clock,
      async () => (await test.settings.pendingEnrollment(signal)) !== undefined,
    );
    const pending = await test.settings.pendingEnrollment(signal);
    expect(pending).toMatchObject({
      key_id: signingKeyId(test.key.publicKey),
      enrollment_code: CODE,
    });
    await driveFor(test.clock, 30_000);
    expect(test.slot.current).toBeUndefined();

    await test.settings.approveEnrollment(
      signingKeyId(test.key.publicKey),
      signal,
    );
    await driveUntil(test.clock, () => test.slot.current !== undefined);
    await driveUntil(
      test.clock,
      async () =>
        intakeBodies(test, "inventory").length > 0 && (await outboxEmpty(test)),
    );

    const [session] = test.intake.calls.map((call) => call.session);
    expect(session).toMatchObject({ connector_version: VERSION, version: 1 });
    expect(intakeBodies(test, "inventory")[0]?.devices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          device_id: HEBREW_DEVICE_ID,
          name: HEBREW_DEVICE_NAME,
        }),
      ]),
    );

    await driveUntil(
      test.clock,
      () => intakeBodies(test, "heartbeat").length > 0,
    );
    test.engine.apply({
      kind: "device",
      deviceId: HEBREW_DEVICE_ID,
      changes: { battery_pct: 7 },
    });
    await driveUntil(
      test.clock,
      async () =>
        intakeBodies(test, "deviceState").length > 0 &&
        (await outboxEmpty(test)),
    );
    expect(intakeBodies(test, "deviceState")[0]).toMatchObject({
      device: { device_id: HEBREW_DEVICE_ID, battery_pct: 7 },
    });
    expect(test.homeLines.join("\n")).not.toContain("core_link_work_failed");
  });

  it("acks a duplicated message each time it arrives, and the home clears it once", async () => {
    const test = await both();
    await enrolled(test);
    const core = inMemoryCore(test);
    test.start(core.dial);
    await driveUntil(test.clock, () => test.slot.current !== undefined);
    await driveUntil(test.clock, () => outboxEmpty(test));

    lastOf(core.channels).duplicateNext(1);
    test.engine.apply({
      kind: "device",
      deviceId: HEBREW_DEVICE_ID,
      changes: { battery_pct: 6 },
    });
    await driveUntil(
      test.clock,
      async () =>
        deviceStateIds(test).length === 2 && (await outboxEmpty(test)),
    );

    const [first, second] = deviceStateIds(test);
    expect(second).toBe(first);
    expect(test.homeLines.join("\n")).not.toContain("core_link_work_failed");
  });

  it("commits a message delayed past the home's resend time, and its resend, once each", async () => {
    const test = await both();
    await enrolled(test);
    const core = inMemoryCore(test);
    test.start(core.dial);
    await driveUntil(test.clock, () => test.slot.current !== undefined);
    await driveUntil(test.clock, () => outboxEmpty(test));

    lastOf(core.channels).delayBy(DELAY_PAST_RESEND_MS);
    test.engine.apply({
      kind: "device",
      deviceId: HEBREW_DEVICE_ID,
      changes: { battery_pct: 5 },
    });
    await driveUntil(test.clock, () => deviceStateIds(test).length >= 2);
    lastOf(core.channels).delayBy(0);
    await driveUntil(test.clock, () => outboxEmpty(test));

    expect(new Set(deviceStateIds(test)).size).toBe(1);
    expect(test.slot.current).toBeDefined();
  });

  it("resends what was not acked after a dropped connection, on the next session", async () => {
    const test = await both();
    await enrolled(test);
    const core = inMemoryCore(test);
    test.intake.heldMethod = "inventory";
    test.start(core.dial);
    await driveUntil(test.clock, () =>
      test.intake.methods().includes("inventory"),
    );

    lastOf(core.pairs).drop();
    test.intake.release();
    await driveUntil(
      test.clock,
      () =>
        test.intake.methods().filter((method) => method === "homeSessionOpened")
          .length === 2,
    );
    await driveUntil(test.clock, () => outboxEmpty(test));

    expect(core.pairs).toHaveLength(2);
    expect(intakeBodies(test, "inventory").length).toBeGreaterThanOrEqual(2);
  });

  it("is back within 60 s of the core's return, even when it returns just after a failed dial", async () => {
    const test = await both();
    await enrolled(test);
    const core = inMemoryCore(test);
    test.start(core.dial);
    await driveUntil(test.clock, () => test.slot.current !== undefined);

    core.down = true;
    core.returnAt = test.clock.now() + CORE_AWAY_MS;
    lastOf(core.pairs).drop();
    await driveUntil(test.clock, () => core.returnedAt !== undefined);
    const returnedAt = core.returnedAt ?? 0;
    expect(test.slot.current).toBeUndefined();

    await driveUntil(test.clock, () => test.slot.current !== undefined);
    expect(test.clock.now() - returnedAt).toBeLessThanOrEqual(
      RECONNECT_GOAL_MS,
    );
  });
});

describe.skipIf(!OPENSSL_AVAILABLE)(
  "the link, version 1, over real WSS with TLS on localhost",
  () => {
    let certificate: ThrowawayCertificate;

    beforeAll(async () => {
      certificate = await makeThrowawayCertificate();
    }, CERTIFICATE_TIMEOUT_MS);

    async function listen(server: TlsServer): Promise<number> {
      await new Promise<void>((resolve) =>
        server.listen(0, "127.0.0.1", resolve),
      );
      stops.push(
        () =>
          new Promise<void>((resolve) => {
            server.closeAllConnections();
            server.close(() => {
              resolve();
            });
          }),
      );
      return (server.address() as AddressInfo).port;
    }

    it("opens a session, takes a duplicate and a delay over the socket, and is back within 60 s of the core's restart", async () => {
      const test = await both();
      await enrolled(test);
      const realWaitMs = 1;
      const channels: FaultyChannel<LinkFrame>[] = [];
      const newLinkServer = (): LinkServer =>
        new LinkServer({
          clock: test.clock,
          logger: test.logger,
          onLink: (accepted) => {
            const { link, channel } = withFaults(accepted, test.clock);
            channels.push(channel);
            test.connectorLink.accept(link);
          },
        });
      const core = {
        linkServer: newLinkServer(),
        up: true,
        returnAt: undefined as number | undefined,
        returnedAt: undefined as number | undefined,
      };
      const server = createTlsServer({
        cert: certificate.cert,
        key: certificate.key,
      });
      server.on("upgrade", (request, socket, head) => {
        if (!core.up || request.url !== LINK_PATH) {
          // The core returns just after this dial fails: the worst moment for the home.
          if (
            !core.up &&
            core.returnAt !== undefined &&
            test.clock.now() >= core.returnAt
          ) {
            core.linkServer = newLinkServer();
            core.up = true;
            core.returnedAt = test.clock.now();
          }
          socket.destroy();
          return;
        }
        core.linkServer.handleUpgrade(request, socket, head);
      });
      const port = await listen(server);
      stops.push(() => {
        core.linkServer.close("test over");
      });
      const url = `wss://localhost:${String(port)}${LINK_PATH}`;
      test.start((dialSignal) =>
        dialLink(url, { clock: test.clock, logger: test.logger }, dialSignal, {
          trustedCertificates: certificate.cert,
        }),
      );

      await driveUntil(
        test.clock,
        async () =>
          intakeBodies(test, "inventory").length > 0 &&
          (await outboxEmpty(test)),
        realWaitMs,
      );
      expect(intakeBodies(test, "inventory")[0]?.devices).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: HEBREW_DEVICE_NAME }),
        ]),
      );

      lastOf(channels).duplicateNext(1);
      test.engine.apply({
        kind: "device",
        deviceId: HEBREW_DEVICE_ID,
        changes: { battery_pct: 6 },
      });
      await driveUntil(
        test.clock,
        async () =>
          deviceStateIds(test).length === 2 && (await outboxEmpty(test)),
        realWaitMs,
      );

      lastOf(channels).delayBy(DELAY_PAST_RESEND_MS);
      test.engine.apply({
        kind: "device",
        deviceId: HEBREW_DEVICE_ID,
        changes: { battery_pct: 5 },
      });
      await driveUntil(
        test.clock,
        () => deviceStateIds(test).length >= 4,
        realWaitMs,
      );
      lastOf(channels).delayBy(0);
      await driveUntil(test.clock, () => outboxEmpty(test), realWaitMs);
      expect(new Set(deviceStateIds(test)).size).toBe(2);

      core.up = false;
      core.returnAt = test.clock.now() + CORE_AWAY_MS;
      core.linkServer.close("core restarting");
      await driveUntil(
        test.clock,
        () => test.slot.current === undefined,
        realWaitMs,
      );
      await driveUntil(
        test.clock,
        () => core.returnedAt !== undefined,
        realWaitMs,
      );
      const returnedAt = core.returnedAt ?? 0;

      await driveUntil(
        test.clock,
        () => test.slot.current !== undefined,
        realWaitMs,
      );
      expect(test.clock.now() - returnedAt).toBeLessThanOrEqual(
        RECONNECT_GOAL_MS,
      );
      await driveUntil(test.clock, () => outboxEmpty(test), realWaitMs);
    }, 120_000);
  },
);
