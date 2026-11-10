// The home part's components, shared by the connector and mode A (T027): Ingest over the Ring port
// and the outbox, Core Link dialing the core, and the scheduler's resends and heartbeats. It
// reaches no Ring library: the caller hands in the Ring port, the Ring Adapter in production and
// the scenario engine in development and tests. Hand-wired, with no container (CD3, CD5).
import type { OutboxStore } from "../connector/access/outbox-store/index.ts";
import type { RingPort } from "../connector/access/ring-adapter/index.ts";
import { CoreLink } from "../connector/clients/core-link/index.ts";
import type { CoreLinkIdentity } from "../connector/clients/core-link/index.ts";
import { HomeScheduler } from "../connector/clients/home-scheduler/index.ts";
import { Ingest } from "../connector/managers/ingest/index.ts";
import type { Clock } from "../utilities/clock/index.ts";
import { LinkSlot } from "../utilities/link-transport/index.ts";
import type { DialOutcome } from "../utilities/link-transport/index.ts";
import type { Logger } from "../utilities/logging/index.ts";
import type { SigningKeyPair } from "../utilities/security/index.ts";

/** The home's outbox file in the data folder. */
export const OUTBOX_FILE = "outbox.db";

/** The home side's Ring port and key: from the Secrets File in production, or a simulated home. */
export interface LocalHome {
  readonly ring: RingPort;
  readonly key: SigningKeyPair;
  close(): Promise<void>;
}

/** What the home part's components are built over. */
export interface HomeAssemblyOptions {
  readonly ring: RingPort;
  /** The open outbox; the caller closes it after `stop`. */
  readonly outbox: OutboxStore;
  /** Opens one link to the core: `dialLink` in the connector, an in-process pair in mode A. */
  readonly dial: (signal: AbortSignal) => Promise<DialOutcome>;
  readonly identity: CoreLinkIdentity;
  readonly clock: Clock;
  readonly logger: Logger;
}

/** The home part's components, built once per process. */
export interface HomeAssembly {
  readonly ingest: Ingest;
  /** Starts Ingest, then the link, then the scheduler. */
  start(): void;
  /** Stops them: the scheduler's new ticks, then the link, then the work still running. */
  stop(): Promise<void>;
}

/** Builds the home part's components. Nothing runs until `start`. */
export function assembleHome(options: HomeAssemblyOptions): HomeAssembly {
  const { clock, logger } = options;
  const slot = new LinkSlot();
  const ingest = new Ingest({
    ring: options.ring,
    outbox: options.outbox,
    link: slot,
    clock,
    logger,
  });
  const coreLink = new CoreLink({
    dial: options.dial,
    slot,
    ingest,
    identity: options.identity,
    clock,
    logger,
  });
  const scheduler = new HomeScheduler({ ingest, clock, logger });

  return {
    ingest,
    start: () => {
      ingest.start();
      coreLink.start();
      scheduler.start();
    },
    // The scheduler stops taking new ticks at once, but a tick already running may wait on a send
    // that a pushed-back connection never takes. Closing the link settles that send, so the link
    // closes before the tick is waited for (CP-10 review).
    stop: async () => {
      const scheduling = scheduler.stop();
      await coreLink.stop();
      await scheduling;
      await ingest.stop();
    },
  };
}
