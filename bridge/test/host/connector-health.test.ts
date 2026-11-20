// The connector's health file as a running connector writes it, and the image's `health` command
// as Docker runs it (DRIFT-001-72): the link up is healthy, the link gone past the core's 2 minutes
// is not, and the command reads the file beside a connector that holds its outbox.
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import {
  HEALTH_FILE_NAME,
  judgeHealth,
  LINK_DOWN_UNHEALTHY_MS,
  readHealthRecord,
} from "../../src/host/connector-health.ts";
import { startConnector } from "../../src/host/connector.ts";
import { openHomeOutbox } from "../../src/host/home-files.ts";
import { SystemClock } from "../../src/utilities/clock/index.ts";
import { loadSettings } from "../../src/utilities/config/index.ts";
import { Logger } from "../../src/utilities/logging/index.ts";
import {
  generateSigningKeyPair,
  signingKeyId,
} from "../../src/utilities/security/index.ts";
import { ScenarioEngine } from "../scenarios/index.ts";
import { eventually, startTestCore } from "./core-fixture.ts";
import type { Cleanups } from "./core-fixture.ts";

const CODE = "home-code-health";
const REMOVE_TRIES = 20;
const REMOVE_PAUSE_MS = 250;
const FAST_WRITES_MS = 100;
const HOST_TIMEOUT_MS = 60_000;
const ONE_MINUTE_MS = 60_000;

const cleanups: Cleanups = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    await cleanup();
  }
});

function never(): AbortSignal {
  return new AbortController().signal;
}

async function dataFolder(): Promise<string> {
  const folder = await mkdtemp(join(tmpdir(), "ring-bridge-health-"));
  cleanups.push(() =>
    rm(folder, {
      recursive: true,
      force: true,
      maxRetries: REMOVE_TRIES,
      retryDelay: REMOVE_PAUSE_MS,
    }),
  );
  return folder;
}

/** Runs the image's entry point with `health`, as the HEALTHCHECK does. */
function healthCommand(
  env: Readonly<Record<string, string>>,
): Promise<{ readonly code: number | null; readonly output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        "--disable-warning=ExperimentalWarning",
        "bridge/src/host/main.ts",
        "health",
      ],
      { env: { PATH: process.env.PATH ?? "", ...env } },
    );
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code, output });
    });
  });
}

it(
  "writes the link up as healthy, and the link gone past the core's 2 minutes as unhealthy",
  async () => {
    const core = await startTestCore(cleanups);
    await eventually(() => core.running.core.links.serving);
    const dataDir = await dataFolder();
    const settings = loadSettings({
      BRIDGE_MODE: "connector",
      BRIDGE_CORE_URL: `${core.url.replace("http:", "ws:")}/link`,
      BRIDGE_DATA_DIR: dataDir,
      BRIDGE_SECRETS_KEY_FILE: join(dataDir, "secrets.key"),
    });
    if (settings.mode !== "connector") {
      throw new Error("expected the connector's settings");
    }
    const clock = new SystemClock();
    const key = await generateSigningKeyPair();
    const connector = await startConnector(settings, {
      clock,
      logger: new Logger({
        sink: () => undefined,
        now: () => clock.now(),
        minLevel: "debug",
      }),
      openHome: () =>
        Promise.resolve({
          ring: new ScenarioEngine(clock),
          key,
          enrollmentCode: CODE,
          close: () => Promise.resolve(),
        }),
      connectorVersion: "0.1.0",
      healthWriteIntervalMs: FAST_WRITES_MS,
      onFatal: (error) => {
        throw error;
      },
    });
    cleanups.push(() => connector.stop());
    await eventually(
      async () =>
        (await core.running.core.settings.pendingEnrollment(never()))
          ?.enrollment_code === CODE,
    );
    await core.running.core.settings.approveEnrollment(
      signingKeyId(key.publicKey),
      never(),
    );

    await eventually(
      async () => (await readHealthRecord(dataDir))?.link === "up",
    );
    const up = await readHealthRecord(dataDir);
    expect(judgeHealth(up, Date.now())).toMatchObject({ healthy: true });
    expect(up?.ring_session).toBe("ok");

    await core.running.stop();
    await eventually(
      async () => (await readHealthRecord(dataDir))?.link === "down",
    );
    const down = await readHealthRecord(dataDir);
    if (down === undefined) {
      throw new Error("The health file was not read.");
    }
    // The rule as of a later moment, with the file still being written: not yet at 1 minute, at 2.
    const downAt = Date.parse(down.link_since);
    const freshAt = (at: number) => ({
      ...down,
      written_at: new Date(at).toISOString(),
    });
    expect(
      judgeHealth(freshAt(downAt + ONE_MINUTE_MS), downAt + ONE_MINUTE_MS)
        .healthy,
    ).toBe(true);
    expect(
      judgeHealth(
        freshAt(downAt + LINK_DOWN_UNHEALTHY_MS),
        downAt + LINK_DOWN_UNHEALTHY_MS,
      ).healthy,
    ).toBe(false);
  },
  HOST_TIMEOUT_MS,
);

it(
  "answers the HEALTHCHECK beside a connector that holds its outbox, and passes in another mode",
  async () => {
    const dataDir = await dataFolder();
    const outbox = await openHomeOutbox(dataDir, new SystemClock());
    cleanups.push(() => outbox.close());
    const now = new Date().toISOString();
    await writeFile(
      join(dataDir, HEALTH_FILE_NAME),
      JSON.stringify({
        written_at: now,
        link: "up",
        link_since: now,
        ring_session: "ok",
      }),
    );

    const healthy = await healthCommand({
      BRIDGE_MODE: "connector",
      BRIDGE_DATA_DIR: dataDir,
    });
    const elsewhere = await healthCommand({ BRIDGE_MODE: "core" });

    expect(healthy).toEqual({
      code: 0,
      output: `Healthy: link up since ${now}, Ring session ok.\n`,
    });
    expect(elsewhere.code).toBe(0);
    expect(elsewhere.output).toContain("Not checked in this mode");
    // The connector's outbox is still its own: the command opened nothing.
    await expect(outbox.close()).resolves.toBeUndefined();
  },
  HOST_TIMEOUT_MS,
);
