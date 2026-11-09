// The connector (T027 part 5): it enrolls with its code, waits for the owner, then links to mode H's
// core over a WebSocket, and its home's inventory lands in the core's State. With no Secrets File
// it stops as "run the setup first", and a stuck Ring connection reaches `onFatal` (the owner's (y)).
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { encodeSecretsFileKey } from "../../src/connector/access/secrets-file/index.ts";
import {
  startConnector,
  startRingConnector,
} from "../../src/host/connector.ts";
import { HostError } from "../../src/host/host-error.ts";
import { SystemClock } from "../../src/utilities/clock/index.ts";
import { loadSettings } from "../../src/utilities/config/index.ts";
import { Logger } from "../../src/utilities/logging/index.ts";
import {
  generateSealingKey,
  generateSigningKeyPair,
  signingKeyId,
} from "../../src/utilities/security/index.ts";
import { ScenarioEngine, standardHome } from "../scenarios/index.ts";
import { eventually, startTestCore } from "./core-fixture.ts";
import type { Cleanups } from "./core-fixture.ts";

const CODE = "home-code-7";
const REMOVE_TRIES = 20;
const REMOVE_PAUSE_MS = 250;

const cleanups: Cleanups = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    await cleanup();
  }
});

function never(): AbortSignal {
  return new AbortController().signal;
}

async function folder(): Promise<string> {
  const dataDir = await mkdtemp(join(tmpdir(), "ring-bridge-connector-"));
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

function connectorSettings(
  coreUrl: string,
  dataDir: string,
  extra: Record<string, string> = {},
): Extract<ReturnType<typeof loadSettings>, { mode: "connector" }> {
  const settings = loadSettings({
    BRIDGE_MODE: "connector",
    BRIDGE_CORE_URL: coreUrl,
    BRIDGE_DATA_DIR: dataDir,
    BRIDGE_SECRETS_KEY_FILE: join(dataDir, "secrets.key"),
    ...extra,
  });
  if (settings.mode !== "connector") {
    throw new Error("expected the connector's settings");
  }
  return settings;
}

function quietLogger(clock: SystemClock): Logger {
  return new Logger({
    sink: () => undefined,
    now: () => clock.now(),
    minLevel: "debug",
  });
}

describe("the connector", () => {
  it("enrolls with its code, waits for the owner, then links over a WebSocket, and the home's inventory lands in the core's State", async () => {
    const { running, url } = await startTestCore(cleanups);
    await eventually(() => running.core.links.serving);
    const dataDir = await folder();
    const clock = new SystemClock();
    const key = await generateSigningKeyPair();
    const fatal: unknown[] = [];

    const connector = await startConnector(
      connectorSettings(`${url.replace("http:", "ws:")}/link`, dataDir, {
        BRIDGE_ENROLLMENT_CODE: CODE,
      }),
      {
        clock,
        logger: quietLogger(clock),
        openHome: () =>
          Promise.resolve({
            ring: new ScenarioEngine(clock),
            key,
            close: () => Promise.resolve(),
          }),
        connectorVersion: "0.1.0",
        onFatal: (error) => fatal.push(error),
      },
    );
    cleanups.push(() => connector.stop());

    await eventually(
      async () =>
        (await running.core.settings.pendingEnrollment(never()))
          ?.enrollment_code === CODE,
    );
    await running.core.settings.approveEnrollment(
      signingKeyId(key.publicKey),
      never(),
    );
    await eventually(
      async () =>
        (await running.core.state.devices({}, never())).length ===
        standardHome().devices.length,
    );
    expect(fatal).toEqual([]);
    expect(await readdir(dataDir)).toContain("outbox.db");
  });

  it("stops as 'run the setup first' when its data folder holds no Secrets File", async () => {
    const dataDir = await folder();
    await writeFile(
      join(dataDir, "secrets.key"),
      encodeSecretsFileKey(generateSealingKey()),
    );
    const clock = new SystemClock();

    await expect(
      startRingConnector(
        connectorSettings("wss://bridge.example.test/link", dataDir),
        {
          clock,
          logger: quietLogger(clock),
          connectorVersion: "0.1.0",
          onFatal: () => undefined,
        },
      ),
    ).rejects.toMatchObject({ kind: "setup_needed" });
  });

  it("hands a stuck Ring connection to onFatal, for the process to end and its service to restart it", async () => {
    const dataDir = await folder();
    const clock = new SystemClock();
    const key = await generateSigningKeyPair();
    const fatal: unknown[] = [];

    const connector = await startConnector(
      connectorSettings("ws://127.0.0.1:9/link", dataDir),
      {
        clock,
        logger: quietLogger(clock),
        openHome: (onConnectionStuck) => {
          onConnectionStuck();
          return Promise.resolve({
            ring: new ScenarioEngine(clock),
            key,
            close: () => Promise.resolve(),
          });
        },
        connectorVersion: "0.1.0",
        onFatal: (error) => fatal.push(error),
      },
    );
    cleanups.push(() => connector.stop());

    expect(fatal).toHaveLength(1);
    expect(fatal[0]).toBeInstanceOf(HostError);
    expect(fatal[0]).toMatchObject({ kind: "ring_connection_stuck" });
  });
});
