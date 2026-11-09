// Mode A's one process per data folder (T027 part 3): a second process on the same folder never
// opens its home part, and so never reaches Ring, while the first holds the lease; it takes over
// once the first stops. A home that cannot open is reported, not left half started.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { startAllInOne } from "../../src/host/all-in-one.ts";
import type { RunningAllInOne } from "../../src/host/all-in-one.ts";
import type { LocalHome } from "../../src/host/home-assembly.ts";
import { HostError } from "../../src/host/host-error.ts";
import { FakeClock } from "../../src/utilities/clock/index.ts";
import { loadSettings } from "../../src/utilities/config/index.ts";
import { Logger } from "../../src/utilities/logging/index.ts";
import { generateSigningKeyPair } from "../../src/utilities/security/index.ts";
import { ScenarioEngine } from "../scenarios/index.ts";
import { driveFor, driveUntil } from "../support/index.ts";

const START = Date.UTC(2026, 10, 10, 9, 0, 0);
const REMOVE_TRIES = 20;
const REMOVE_PAUSE_MS = 250;

const cleanups: (() => Promise<void>)[] = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    await cleanup();
  }
});

async function folder(): Promise<string> {
  const dataDir = await mkdtemp(join(tmpdir(), "ring-bridge-mode-a-"));
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

interface Process {
  readonly running: RunningAllInOne;
  readonly homesOpened: () => number;
  readonly fatal: unknown[];
}

async function modeA(
  dataDir: string,
  clock: FakeClock,
  openHome?: () => Promise<LocalHome>,
): Promise<Process> {
  const settings = loadSettings({
    BRIDGE_MODE: "all-in-one",
    BRIDGE_DATA_DIR: dataDir,
    BRIDGE_SECRETS_KEY_FILE: "unused-by-the-simulated-home",
  });
  if (settings.mode !== "all-in-one") {
    throw new Error("expected mode A's settings");
  }
  const key = await generateSigningKeyPair();
  let opened = 0;
  const fatal: unknown[] = [];
  const running = await startAllInOne(settings, {
    clock,
    logger: new Logger({
      sink: () => undefined,
      now: () => clock.now(),
      minLevel: "debug",
    }),
    openHome:
      openHome ??
      (() => {
        opened += 1;
        return Promise.resolve({
          ring: new ScenarioEngine(clock),
          key,
          close: () => Promise.resolve(),
        });
      }),
    approveLocalKey: true,
    connectorVersion: "0.1.0",
    onFatal: (error) => fatal.push(error),
  });
  let stopped = false;
  const stop = async (): Promise<void> => {
    if (!stopped) {
      stopped = true;
      await running.stop();
    }
  };
  cleanups.push(stop);
  return {
    running: { ...running, stop },
    homesOpened: () => opened,
    fatal,
  };
}

describe("mode A, one process per data folder", () => {
  it("keeps a second process on the same folder away from Ring while the first holds the lease, then hands over when the first stops", async () => {
    const dataDir = await folder();
    const clock = new FakeClock(START);
    const first = await modeA(dataDir, clock);
    await driveUntil(clock, () => first.homesOpened() === 1);
    const second = await modeA(dataDir, clock);

    await driveFor(clock, 30_000);
    expect(second.homesOpened()).toBe(0);
    expect(second.running.core.links.serving).toBe(false);

    await first.running.stop();
    await driveUntil(clock, () => second.homesOpened() === 1);
    expect(second.running.core.links.serving).toBe(true);
    expect([...first.fatal, ...second.fatal]).toEqual([]);
  });

  it("reports a home that cannot open, such as one with no Secrets File yet", async () => {
    const dataDir = await folder();
    const clock = new FakeClock(START);
    const missing = new HostError("setup_needed", "Run the setup first.");

    const bridge = await modeA(dataDir, clock, () => Promise.reject(missing));

    await driveUntil(clock, () => bridge.fatal.length > 0);
    expect(bridge.fatal).toEqual([missing]);
  });
});
