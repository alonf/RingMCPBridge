// The core's components over a migrated database, shared by mode H's core and mode A (T027): the
// stores, the managers, the single-instance lease, and the connector link with Event while the
// lease is held. It reaches no Azure library, oidc-provider or SQL Server driver: those are mode
// H's, wired in core.ts. Hand-wired, with no container (CD3, CD5).
import { GrantsStore } from "../core/access/grants/index.ts";
import { Lease } from "../core/access/lease/index.ts";
import type { LeaseStore, LeaseTiming } from "../core/access/lease/index.ts";
import { SettingsStore } from "../core/access/settings/index.ts";
import { StateStore } from "../core/access/state/index.ts";
import { AdminManager } from "../core/managers/admin/index.ts";
import { EventManager } from "../core/managers/event/index.ts";
import type { EventTopics } from "../core/managers/event/index.ts";
import { InquiryManager } from "../core/managers/inquiry/index.ts";
import type { Clock } from "../utilities/clock/index.ts";
import type { CommonSettings } from "../utilities/config/index.ts";
import type { Logger } from "../utilities/logging/index.ts";
import { PubSub } from "../utilities/pub-sub/index.ts";
import type { QueryLayer } from "../utilities/query-layer/index.ts";
import { LeasedLinks } from "./leased-links.ts";

/**
 * The lease's name. One deployment serves one Ring account, with one home part, and the core keeps
 * no Ring account key, so the name is fixed (DRIFT-001-46).
 */
export const LEASE_NAME = "ring-account";

/** What the core's components are built over. */
export interface CoreAssemblyOptions {
  /** The core's database, already migrated. */
  readonly store: QueryLayer;
  readonly clock: Clock;
  readonly logger: Logger;
  readonly settings: CommonSettings;
  /** The database as the lease reaches it; the core's database unless a test takes it down. */
  readonly leaseStore?: LeaseStore;
  /** This instance's id in the lease row; random when left out. */
  readonly leaseHolder?: string;
  /** The lease's timing; the recorded 15 s and 45 s when left out. */
  readonly leaseTiming?: LeaseTiming;
}

/** The core's components, built once per process. */
export interface CoreAssembly {
  readonly state: StateStore;
  readonly settings: SettingsStore;
  readonly grants: GrantsStore;
  readonly inquiry: InquiryManager;
  readonly lease: Lease;
  /** The connector link, run only while the lease is held: `accept` is the `LinkServer`'s `onLink`. */
  readonly links: LeasedLinks;
  /** Takes the lease, and runs the link while it is held. */
  start(): void;
  /** Ends the link's term, lets the lease go, and waits for queued events; the caller closes the database after. */
  stop(): Promise<void>;
}

/** Builds the core's components. Nothing runs until `start`. */
export function assembleCore(options: CoreAssemblyOptions): CoreAssembly {
  const { store, clock, logger } = options;
  const state = new StateStore({ store });
  const settings = new SettingsStore({
    store,
    clock,
    defaultBatteryThresholdPct: options.settings.batteryThresholdPct,
  });
  const grants = new GrantsStore({ store, clock });
  const inquiry = new InquiryManager({
    state,
    settings,
    clock,
    homeOfflineAfterMs: options.settings.staleAfterMs,
  });
  const lease = new Lease({
    store: options.leaseStore ?? store,
    clock,
    name: LEASE_NAME,
    ...(options.leaseHolder === undefined
      ? {}
      : { holder: options.leaseHolder }),
    ...(options.leaseTiming === undefined
      ? {}
      : { timing: options.leaseTiming }),
  });
  const events = new PubSub<EventTopics>((topic, error) => {
    logger.error("pub_sub_handler_failed", { kind: topic }, error);
  });
  const links = new LeasedLinks({
    lease,
    clock,
    logger,
    newEvent: () =>
      new EventManager({
        state,
        events,
        clock,
        homeOfflineAfterMs: options.settings.staleAfterMs,
        reportFailure: (error) => {
          logger.error("event_silence_check_failed", undefined, error);
        },
      }),
    link: { admin: new AdminManager({ settings }), clock, logger },
  });

  return {
    state,
    settings,
    grants,
    inquiry,
    lease,
    links,
    start: () => {
      lease.start();
      void lease.settled().then(() => {
        links.start();
      });
    },
    stop: async () => {
      await links.stop();
      await lease.stop();
      await events.drain();
    },
  };
}
