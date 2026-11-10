// One home part per data folder, across the two modes (CP-06 review). Mode A's lease keeps out a
// second mode A, and the connector's held outbox a second connector; a connector and mode A on the
// same folder would both reach Ring and rotate the same saved token. Both now hold the outbox
// before they open Ring, so whichever comes second stops before its home opens, in either order.
// The real clock runs: mode A's lease and the outbox's lock both wait on it.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  OutboxStore,
  OutboxStoreError,
} from "../../src/connector/access/outbox-store/index.ts";
import { startAllInOne } from "../../src/host/all-in-one.ts";
import { startConnector } from "../../src/host/connector.ts";
import type { LocalHome } from "../../src/host/home-assembly.ts";
import { HostError } from "../../src/host/host-error.ts";
import { SystemClock } from "../../src/utilities/clock/index.ts";
import { loadSettings } from "../../src/utilities/config/index.ts";
import { Logger } from "../../src/utilities/logging/index.ts";
import { generateSigningKeyPair } from "../../src/utilities/security/index.ts";
import { ScenarioEngine } from "../scenarios/index.ts";
import { eventually } from "./core-fixture.ts";
import type { Cleanups } from "./core-fixture.ts";

const CODE = "home-code-9";
const REMOVE_TRIES = 20;
const REMOVE_PAUSE_MS = 250;

const cleanups: Cleanups = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    await cleanup();
  }
});

async function folder(): Promise<string> {
  const dataDir = await mkdtemp(join(tmpdir(), "ring-bridge-one-home-"));
  cleanups.push(() =>
    rm(dataDir, {
      recursive: true,
      force: true,
      maxRetries: REMOVE_TRIES,
      retryDelay: REMOVE_PAUSE_MS,
    }),
  );
  return dataDir;
}

const clock = new SystemClock();

function quietLogger(): Logger {
  return new Logger({
    sink: () => undefined,
    now: () => clock.now(),
    minLevel: "debug",
  });
}

/** A simulated home that counts how often it was opened: opening it is reaching Ring. */
interface CountedHome {
  readonly open: () => Promise<LocalHome>;
  readonly opened: () => number;
}

async function countedHome(
  close: () => Promise<void> = () => Promise.resolve(),
): Promise<CountedHome> {
  const key = await generateSigningKeyPair();
  let opened = 0;
  return {
    open: () => {
      opened += 1;
      return Promise.resolve({
        ring: new ScenarioEngine(clock),
        key,
        enrollmentCode: CODE,
        close,
      });
    },
    opened: () => opened,
  };
}

/** A stop that runs once, however often it is called: by the test, then by the cleanup. */
function once(stop: () => Promise<void>): () => Promise<void> {
  let stopping: Promise<void> | undefined;
  return () => (stopping ??= stop());
}

interface ModeA {
  readonly fatal: unknown[];
  readonly stop: () => Promise<void>;
}

async function startModeA(dataDir: string, home: CountedHome): Promise<ModeA> {
  const settings = loadSettings({
    BRIDGE_MODE: "all-in-one",
    BRIDGE_DATA_DIR: dataDir,
    BRIDGE_SECRETS_KEY_FILE: "unused-by-the-simulated-home",
  });
  if (settings.mode !== "all-in-one") {
    throw new Error("expected mode A's settings");
  }
  const fatal: unknown[] = [];
  const running = await startAllInOne(settings, {
    clock,
    logger: quietLogger(),
    openHome: home.open,
    approveLocalKey: true,
    connectorVersion: "0.1.0",
    onFatal: (error) => fatal.push(error),
  });
  const stop = once(() => running.stop());
  cleanups.push(stop);
  return { fatal, stop };
}

function startConnectorOn(
  dataDir: string,
  home: CountedHome,
): ReturnType<typeof startConnector> {
  const settings = loadSettings({
    BRIDGE_MODE: "connector",
    BRIDGE_CORE_URL: "ws://127.0.0.1:9/link",
    BRIDGE_DATA_DIR: dataDir,
    BRIDGE_SECRETS_KEY_FILE: join(dataDir, "secrets.key"),
  });
  if (settings.mode !== "connector") {
    throw new Error("expected the connector's settings");
  }
  return startConnector(settings, {
    clock,
    logger: quietLogger(),
    openHome: home.open,
    connectorVersion: "0.1.0",
    onFatal: () => undefined,
  });
}

describe("one home part per data folder, across the two modes", () => {
  it("refuses a connector on mode A's folder before it opens its home", async () => {
    const dataDir = await folder();
    const modeAHome = await countedHome();
    const modeA = await startModeA(dataDir, modeAHome);
    await eventually(() => modeAHome.opened() === 1);
    const connectorHome = await countedHome();

    const refused = await startConnectorOn(dataDir, connectorHome).then(
      async (connector) => {
        await connector.stop();
        return undefined;
      },
      (error: unknown) => error,
    );

    expect(refused).toBeInstanceOf(HostError);
    expect(refused).toMatchObject({ kind: "data_folder_in_use" });
    expect(connectorHome.opened()).toBe(0);
    expect(modeA.fatal).toEqual([]);
  });

  it("stops mode A on a connector's folder before it opens its home", async () => {
    const dataDir = await folder();
    const connectorHome = await countedHome();
    const connector = await startConnectorOn(dataDir, connectorHome);
    cleanups.push(() => connector.stop());
    const modeAHome = await countedHome();

    const modeA = await startModeA(dataDir, modeAHome);
    await eventually(() => modeA.fatal.length > 0);

    expect(modeA.fatal[0]).toBeInstanceOf(HostError);
    expect(modeA.fatal[0]).toMatchObject({ kind: "data_folder_in_use" });
    expect(modeAHome.opened()).toBe(0);
    expect(connectorHome.opened()).toBe(1);
  });

  // The outbox is let go last: while Ring closes, and saves a token it rotated, the folder is held.
  it.each(["connector", "mode A"] as const)(
    "keeps the folder held until Ring is closed when the %s stops",
    async (mode) => {
      const dataDir = await folder();
      let whileClosing: unknown = "never closed";
      const home = await countedHome(async () => {
        whileClosing = await OutboxStore.open(
          { path: join(dataDir, "outbox.db"), clock, exclusive: true },
          new AbortController().signal,
        ).then(
          async (store) => {
            await store.close();
            return "free";
          },
          (error: unknown) =>
            error instanceof OutboxStoreError ? error.kind : error,
        );
      });
      let stop: () => Promise<void>;
      if (mode === "connector") {
        const connector = await startConnectorOn(dataDir, home);
        stop = once(() => connector.stop());
        cleanups.push(stop);
      } else {
        ({ stop } = await startModeA(dataDir, home));
      }
      await eventually(() => home.opened() === 1);

      await stop();

      expect(whileClosing).toBe("in_use");
    },
  );
});
