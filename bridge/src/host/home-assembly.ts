// The home part's components, shared by the connector and mode A (T027): Ingest over the Ring port
// and the outbox, Core Link dialing the core, and the scheduler's resends and heartbeats. It
// reaches no Ring library: the caller hands in the Ring port, the Ring Adapter in production and
// the scenario engine in development and tests. Hand-wired, with no container (CD3, CD5).
import type { OutboxStore } from "../connector/access/outbox-store/index.ts";
import type {
  RingHistoryPort,
  RingPort,
  RingPushPort,
} from "../connector/access/ring-adapter/index.ts";
import { CoreLink } from "../connector/clients/core-link/index.ts";
import type { CoreLinkIdentity } from "../connector/clients/core-link/index.ts";
import { HomeScheduler } from "../connector/clients/home-scheduler/index.ts";
import { PushListener } from "../connector/clients/push-listener/index.ts";
import type { PushShapeSink } from "../connector/clients/push-listener/index.ts";
import { Ingest } from "../connector/managers/ingest/index.ts";
import type { EventRule } from "../utilities/config/index.ts";
import type { Clock } from "../utilities/clock/index.ts";
import { LinkSlot } from "../utilities/link-transport/index.ts";
import type { DialOutcome } from "../utilities/link-transport/index.ts";
import type { Logger } from "../utilities/logging/index.ts";
import type { SigningKeyPair } from "../utilities/security/index.ts";

/** The home side's Ring port and key: from the Secrets File in production, or a simulated home. */
export interface LocalHome {
  readonly ring: RingPort;
  /**
   * Ring's push notifications (T038): the Ring Adapter in production. Absent for a simulated home,
   * which sends no push until the event path uses it (T044).
   */
  readonly push?: RingPushPort;
  /** Ring's camera history, for the catch-up after a gap (T053): the Ring Adapter in production. */
  readonly history?: RingHistoryPort;
  readonly key: SigningKeyPair;
  /** The code the Setup CLI printed for the key; the connector sends it with `enroll` (T028). */
  readonly enrollmentCode?: string;
  close(): Promise<void>;
}

/** What the home part's components are built over. */
export interface HomeAssemblyOptions {
  readonly eventRules?: readonly EventRule[] | undefined;
  readonly ring: RingPort;
  /** Ring's push notifications; with none, no Push Listener is built. */
  readonly push?: RingPushPort;
  /** Ring's camera history for the catch-up; with none, no catch-up runs. */
  readonly history?: RingHistoryPort;
  /** Where the Push Listener hands distinct payload shapes (T038 part 2); none kept when left out. */
  readonly pushShapes?: PushShapeSink;
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
  /** Starts Ingest, then the link, then the scheduler, then the Push Listener. */
  start(): void;
  /** Whether a session with the core is open: its link is in the slot (DRIFT-001-72). */
  linkUp(): boolean;
  /** Stops them: push, the scheduler's new ticks, then the link, then the work still running. */
  stop(): Promise<void>;
}

/** Builds the home part's components. Nothing runs until `start`. */
export function assembleHome(options: HomeAssemblyOptions): HomeAssembly {
  const { clock, logger } = options;
  const slot = new LinkSlot();
  const ingest = new Ingest({
    ring: options.ring,
    eventRules: options.eventRules,
    outbox: options.outbox,
    link: slot,
    clock,
    logger,
    pushOn: options.push !== undefined,
    ...(options.history === undefined ? {} : { history: options.history }),
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
  const pushListener =
    options.push === undefined
      ? undefined
      : new PushListener({
          ring: options.push,
          clock,
          logger,
          onPush: (push) => {
            ingest.pushReceived(push);
          },
          ...(options.pushShapes === undefined
            ? {}
            : { shapes: options.pushShapes }),
        });

  return {
    ingest,
    start: () => {
      ingest.start();
      coreLink.start();
      scheduler.start();
      pushListener?.start();
    },
    linkUp: () => slot.current !== undefined,
    // The scheduler stops taking new ticks at once, but a tick already running may wait on a send
    // that a pushed-back connection never takes. Closing the link settles that send, so the link
    // closes before the tick is waited for (CP-10 review).
    stop: async () => {
      pushListener?.stop();
      const scheduling = scheduler.stop();
      await coreLink.stop();
      await scheduling;
      await ingest.stop();
    },
  };
}
