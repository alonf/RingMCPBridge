// The connector (T027 part 5): the home part on the owner's home server, dialing the core's link
// over WSS (`BRIDGE_CORE_URL`, `wss:` only). It keeps its outbox and Secrets File in the data
// folder and the Secrets File's key apart from it.
// - **The home side is handed in**: the Secrets File and the Ring Adapter in production
//   (`startRingConnector`), a simulated home in the tests.
// - **The owner's choice (y)**: a hub's live connection closed for 5 minutes while Ring's calls
//   work ends the process, and its service restarts it (DRIFT-001-35).
// - **Health**: the connector serves no HTTP in iteration 001. Its link and Ring status reach the
//   core in each heartbeat, so `get_health` and the admin page show them, and its log says when
//   the link fails (`core_link_failed`). Its service restarts it when it exits (DRIFT-001-51).
// - **The enrollment code** comes from `BRIDGE_ENROLLMENT_CODE` until the Setup CLI keeps it in the
//   Secrets File (T028). Without one, only an already enrolled key can link.
// It reaches no Azure library, oidc-provider or SQL Server driver (the dependency rule
// `connector-reaches-no-cloud-libraries`).
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { OutboxStore } from "../connector/access/outbox-store/index.ts";
import type { Clock } from "../utilities/clock/index.ts";
import type { Settings } from "../utilities/config/index.ts";
import { dialLink } from "../utilities/link-transport/index.ts";
import type { Logger } from "../utilities/logging/index.ts";
import { assembleHome, OUTBOX_FILE } from "./home-assembly.ts";
import type { LocalHome } from "./home-assembly.ts";
import { HostError } from "./host-error.ts";
import { openRingHome } from "./ring-home.live.ts";

type ConnectorSettings = Extract<Settings, { readonly mode: "connector" }>;

/** What the connector is started with, besides its settings. */
export interface ConnectorParts {
  readonly clock: Clock;
  readonly logger: Logger;
  /** Opens the home side; `onConnectionStuck` is the owner's (y). */
  readonly openHome: (onConnectionStuck: () => void) => Promise<LocalHome>;
  readonly connectorVersion: string;
  /** Hears that the connector cannot go on: the caller ends the process, and its service restarts it. */
  readonly onFatal: (error: unknown) => void;
}

/** The connector, running. */
export interface RunningConnector {
  /** Stops the home part, then closes the outbox and the Ring connection. */
  stop(): Promise<void>;
}

/** Starts the connector over a home side it is handed. */
export async function startConnector(
  settings: ConnectorSettings,
  parts: ConnectorParts,
): Promise<RunningConnector> {
  const { clock, logger } = parts;
  const { home: homeSettings } = settings;
  await mkdir(homeSettings.dataDir, { recursive: true });
  const home = await parts.openHome(() => {
    parts.onFatal(
      new HostError(
        "ring_connection_stuck",
        "A hub's live connection to Ring stayed closed while Ring's calls worked.",
      ),
    );
  });
  let outbox: OutboxStore;
  try {
    outbox = await OutboxStore.open(
      { path: join(homeSettings.dataDir, OUTBOX_FILE), clock },
      new AbortController().signal,
    );
  } catch (error) {
    await home.close();
    throw error;
  }
  const homeSide = assembleHome({
    ring: home.ring,
    outbox,
    dial: (signal) => dialLink(homeSettings.coreUrl, { clock, logger }, signal),
    identity: {
      key: home.key,
      enrollmentCode: homeSettings.enrollmentCode ?? "",
      connectorVersion: parts.connectorVersion,
    },
    clock,
    logger,
  });
  homeSide.start();
  logger.info("bridge_started", { mode: "connector" });
  return {
    stop: async () => {
      await homeSide.stop();
      await outbox.close();
      await home.close();
      logger.info("bridge_stopped", { mode: "connector" });
    },
  };
}

/** Starts the connector over the Secrets File and Ring. */
export function startRingConnector(
  settings: ConnectorSettings,
  parts: Omit<ConnectorParts, "openHome">,
): Promise<RunningConnector> {
  return startConnector(settings, {
    ...parts,
    openHome: (onConnectionStuck) =>
      openRingHome(settings.home, parts.clock, parts.logger, onConnectionStuck),
  });
}
