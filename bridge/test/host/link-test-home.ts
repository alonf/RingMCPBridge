import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startConnector } from "../../src/host/connector.ts";
import { SystemClock } from "../../src/utilities/clock/index.ts";
import { loadSettings } from "../../src/utilities/config/index.ts";
import { Logger } from "../../src/utilities/logging/index.ts";
import {
  generateSigningKeyPair,
  signingKeyId,
} from "../../src/utilities/security/index.ts";
import { ScenarioEngine } from "../scenarios/scenario-engine.ts";
import type { HomeSnapshot } from "../scenarios/simulated-home.ts";
import type { EventMessage } from "../../src/core/clients/connector-link/messages/index.ts";
import { openHomeOutbox } from "../../src/host/home-files.ts";
import { eventually, type StartedCore, type Cleanups } from "./core-fixture.ts";

const CODE = "home-code-e2e";
const REMOVE_TRIES = 20;
const REMOVE_PAUSE_MS = 250;

function never(): AbortSignal {
  return new AbortController().signal;
}

/** A linked home: the connector on its own data folder, enrolled and approved by the owner. */
export async function linkTestHome(
  core: StartedCore,
  cleanups: Cleanups,
  home?: HomeSnapshot,
  queuedEvent?: EventMessage,
  partner?: {
    prepare: (dataDir: string) => Promise<string>;
    send: typeof fetch;
  },
) {
  const dataDir = await mkdtemp(join(tmpdir(), "ring-bridge-e2e-"));
  cleanups.push(() =>
    rm(dataDir, {
      recursive: true,
      force: true,
      maxRetries: REMOVE_TRIES,
      retryDelay: REMOVE_PAUSE_MS,
    }),
  );
  const settings = loadSettings({
    BRIDGE_MODE: "connector",
    BRIDGE_CORE_URL: `${core.url.replace("http:", "ws:")}/link`,
    BRIDGE_DATA_DIR: dataDir,
    BRIDGE_SECRETS_KEY_FILE: join(dataDir, "secrets.key"),
    ...(partner && {
      BRIDGE_RING_PARTNER_FILE: await partner.prepare(dataDir),
    }),
  });
  if (settings.mode !== "connector") {
    throw new Error("expected the connector's settings");
  }
  const clock = new SystemClock();
  if (queuedEvent) {
    const outbox = await openHomeOutbox(dataDir, clock);
    try {
      await outbox.appendEvent(
        queuedEvent.event_id,
        () => queuedEvent,
        never(),
      );
    } finally {
      await outbox.close();
    }
  }
  const key = await generateSigningKeyPair();
  const connector = await startConnector(settings, {
    ...(partner && { partnerFetch: partner.send }),
    clock,
    logger: new Logger({
      sink: () => undefined,
      now: () => clock.now(),
      minLevel: "debug",
    }),
    openHome: () =>
      Promise.resolve({
        ring: new ScenarioEngine(clock, home),
        key,
        enrollmentCode: CODE,
        close: () => Promise.resolve(),
      }),
    connectorVersion: "0.1.0",
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
  return dataDir;
}
