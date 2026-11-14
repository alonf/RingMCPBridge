// The connector (T027 part 5): it enrolls with its code, waits for the owner, then links to mode H's
// core over a WebSocket, and its home's inventory lands in the core's State. With no Secrets File
// it stops as "run the setup first", and a stuck Ring connection reaches `onFatal` (the owner's (y)).
// T028: the owner's setup end to end (the Setup CLI's Secrets File, then the connector over it with
// the simulated home in place of Ring); a lost outbox and a home with no code are refused.
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type {
  RingLogin,
  RingLoginStep,
} from "../../src/connector/access/ring-adapter/index.ts";
import { encodeSecretsFileKey } from "../../src/connector/access/secrets-file/index.ts";
import { runSetup } from "../../src/connector/clients/setup-cli/index.ts";
import type { SetupConsole } from "../../src/connector/clients/setup-cli/index.ts";
import {
  startConnector,
  startRingConnector,
} from "../../src/host/connector.ts";
import { openHomeSecrets } from "../../src/host/home-files.ts";
import { HostError } from "../../src/host/host-error.ts";
import { SystemClock } from "../../src/utilities/clock/index.ts";
import { loadSettings } from "../../src/utilities/config/index.ts";
import { Logger } from "../../src/utilities/logging/index.ts";
import {
  generateSealingKey,
  generateSigningKeyPair,
  Secret,
  signingKeyId,
} from "../../src/utilities/security/index.ts";
import type { SigningKeyPair } from "../../src/utilities/security/index.ts";
import { ScenarioEngine, standardHome } from "../scenarios/index.ts";
import { eventually, startTestCore } from "./core-fixture.ts";
import type { Cleanups } from "./core-fixture.ts";

const CODE = "home-code-7";
const RING_TOKEN = "ring-token-SECRET-0007";
const RING_CODE = "246810";
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

/** The owner at the terminal, answering the setup's questions in order. */
function owner(answers: readonly string[]): SetupConsole & { said: string[] } {
  const queue = [...answers];
  const said: string[] = [];
  return {
    said,
    ask: () => {
      const answer = queue.shift();
      return answer === undefined
        ? Promise.reject(new Error("The input ended."))
        : Promise.resolve(answer);
    },
    say: (line) => said.push(line),
  };
}

/** Ring's sign-in, asking for one code. */
function ringSignIn(): RingLogin {
  return {
    begin: (): Promise<RingLoginStep> =>
      Promise.resolve({ kind: "needs_code", prompt: "Enter the code" }),
    complete: (code): Promise<RingLoginStep> =>
      Promise.resolve(
        code === RING_CODE
          ? { kind: "signed_in", refreshToken: new Secret(RING_TOKEN) }
          : { kind: "wrong_code" },
      ),
    close: () => undefined,
  };
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
      connectorSettings(`${url.replace("http:", "ws:")}/link`, dataDir),
      {
        clock,
        logger: quietLogger(clock),
        openHome: () =>
          Promise.resolve({
            ring: new ScenarioEngine(clock),
            key,
            enrollmentCode: CODE,
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

  // CP-10's review: two connectors on one folder would replace each other's link once a second.
  it("refuses a second connector on the same data folder before it opens its home", async () => {
    const dataDir = await folder();
    const clock = new SystemClock();
    const key = await generateSigningKeyPair();
    let homesOpened = 0;
    const parts = {
      clock,
      logger: quietLogger(clock),
      openHome: () => {
        homesOpened += 1;
        return Promise.resolve({
          ring: new ScenarioEngine(clock),
          key,
          enrollmentCode: CODE,
          close: () => Promise.resolve(),
        });
      },
      connectorVersion: "0.1.0",
      onFatal: () => undefined,
    };
    const settings = connectorSettings("ws://127.0.0.1:9/link", dataDir);
    const first = await startConnector(settings, parts);
    cleanups.push(() => first.stop());

    const refused = await startConnector(settings, parts).then(
      () => undefined,
      (error: unknown) => error,
    );

    expect(refused).toBeInstanceOf(HostError);
    expect(refused).toMatchObject({ kind: "data_folder_in_use" });
    expect(homesOpened).toBe(1);
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
            enrollmentCode: CODE,
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
  // T028: the owner's setup end to end, with the simulated home in place of Ring.
  it("runs on the Secrets File the setup wrote: the core holds the printed code, the log shows it, and once approved the home's inventory arrives", async () => {
    const { running, url } = await startTestCore(cleanups);
    await eventually(() => running.core.links.serving);
    const dataDir = await folder();
    const keyPath = join(await folder(), "secrets.key");
    const clock = new SystemClock();
    const console = owner(["the-owner", "a-password", RING_CODE]);
    const setUp = await runSetup({
      dataDir,
      secretsKeyPath: keyPath,
      console,
      openLogin: ringSignIn,
      clock,
    });
    if (setUp.kind !== "done") {
      throw new Error(`the setup stopped: ${setUp.reason}`);
    }
    const lines: string[] = [];
    let homeKey: SigningKeyPair | undefined;

    const connector = await startConnector(
      connectorSettings(`${url.replace("http:", "ws:")}/link`, dataDir, {
        BRIDGE_SECRETS_KEY_FILE: keyPath,
      }),
      {
        clock,
        logger: new Logger({
          sink: (line) => lines.push(line),
          now: () => clock.now(),
          minLevel: "debug",
        }),
        openHome: async () => {
          const { secrets } = await openHomeSecrets({
            dataDir,
            secretsKeyPath: keyPath,
          });
          homeKey = secrets.connectorKey;
          expect(secrets.ringRefreshToken.reveal()).toBe(RING_TOKEN);
          return {
            ring: new ScenarioEngine(clock),
            key: secrets.connectorKey,
            ...(secrets.enrollmentCode === undefined
              ? {}
              : { enrollmentCode: secrets.enrollmentCode }),
            close: () => Promise.resolve(),
          };
        },
        connectorVersion: "0.1.0",
        onFatal: () => undefined,
      },
    );
    cleanups.push(() => connector.stop());

    // The owner compares three codes: printed, logged, and held by the core for the admin page.
    await eventually(
      async () =>
        (await running.core.settings.pendingEnrollment(never()))
          ?.enrollment_code === setUp.enrollmentCode,
    );
    expect(console.said).toContain(
      `The enrollment code is: ${setUp.enrollmentCode}`,
    );
    expect(lines.join("\n")).toContain(
      `"enrollment_code":"${setUp.enrollmentCode}"`,
    );
    if (homeKey === undefined) {
      throw new Error("The home never opened.");
    }
    await running.core.settings.approveEnrollment(
      signingKeyId(homeKey.publicKey),
      never(),
    );
    await eventually(
      async () =>
        (await running.core.state.devices({}, never())).length ===
        standardHome().devices.length,
    );
    expect(lines.join("\n")).not.toContain(RING_TOKEN);
  });

  it("refuses a data folder whose outbox is gone while its Secrets File is kept, before making a new outbox", async () => {
    const dataDir = await folder();
    await writeFile(join(dataDir, "secrets.sealed"), "kept");
    const clock = new SystemClock();
    let homesOpened = 0;

    const refused = startConnector(
      connectorSettings("ws://127.0.0.1:9/link", dataDir),
      {
        clock,
        logger: quietLogger(clock),
        openHome: () => {
          homesOpened += 1;
          return Promise.reject(new Error("not reached"));
        },
        connectorVersion: "0.1.0",
        onFatal: () => undefined,
      },
    );

    await expect(refused).rejects.toMatchObject({ kind: "outbox_lost" });
    expect(homesOpened).toBe(0);
    expect(await readdir(dataDir)).toEqual(["secrets.sealed"]);
  });

  it("refuses a home whose Secrets File holds no enrollment code, closing what it opened", async () => {
    const dataDir = await folder();
    const clock = new SystemClock();
    const key = await generateSigningKeyPair();
    let closed = 0;
    const parts = {
      clock,
      logger: quietLogger(clock),
      openHome: () =>
        Promise.resolve({
          ring: new ScenarioEngine(clock),
          key,
          close: () => {
            closed += 1;
            return Promise.resolve();
          },
        }),
      connectorVersion: "0.1.0",
      onFatal: () => undefined,
    };
    const settings = connectorSettings("ws://127.0.0.1:9/link", dataDir);

    await expect(startConnector(settings, parts)).rejects.toMatchObject({
      kind: "setup_needed",
    });
    expect(closed).toBe(1);
    // The outbox was let go: a connector with a code starts on the same folder.
    const next = await startConnector(settings, {
      ...parts,
      openHome: () =>
        Promise.resolve({
          ring: new ScenarioEngine(clock),
          key,
          enrollmentCode: CODE,
          close: () => Promise.resolve(),
        }),
    });
    cleanups.push(() => next.stop());
  });
});
