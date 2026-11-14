// The connector link and the Event manager, run only while this instance holds the single-instance
// lease (FR-044, DRIFT-001-46, T027). Event is the only writer of State: it applies the home's
// messages and, on its own timer, marks the home offline. So both are gated:
// - **Links**: while the lease is not held, a new link is closed as `core_unavailable`, and the home
//   dials again with its backoff.
// - **A term per lease**: when the lease is taken, a new Connector Link and Event manager are built.
//   When it is lost, Connector Link closes every link (`core_stopping`) and finishes their last
//   steps, then Event stops. Connector Link's stop is final, hence a new pair for each term. A new
//   term starts only once the last one has ended.
// - **The write point**: Event's intake also checks the lease on each message, so between the hold
//   ending and the next check (at most `LEASE_CHECK_MS`) nothing is written. The refused message
//   stays unacked, and the home sends it again.
import type { Lease } from "../core/access/lease/index.ts";
import {
  CORE_CLOSE_REASONS,
  ConnectorLink,
} from "../core/clients/connector-link/index.ts";
import type { ConnectorLinkOptions } from "../core/clients/connector-link/index.ts";
import { EventError } from "../core/managers/event/index.ts";
import type {
  EventIntake,
  EventManager,
} from "../core/managers/event/index.ts";
import type { Cancel, Clock } from "../utilities/clock/index.ts";
import type { LinkConnection } from "../utilities/link-transport/index.ts";
import type { Logger } from "../utilities/logging/index.ts";

/** How often the lease's hold is checked: a fraction of the 15 s between the end of a hold and its row's. */
export const LEASE_CHECK_MS = 1_000;

/** What one lease term runs. */
export interface LinkTerm {
  readonly link: ConnectorLink;
  readonly event: EventManager;
}

/** What the gate is built with. */
export interface LeasedLinksOptions {
  readonly lease: Pick<Lease, "held">;
  readonly clock: Clock;
  readonly logger: Logger;
  /** A new Event manager for a term. */
  readonly newEvent: () => EventManager;
  /** Connector Link's options other than its intake, which the gate supplies. */
  readonly link: Omit<ConnectorLinkOptions, "intake">;
}

/** Connector Link and Event, while the lease is held. One per core process. */
export class LeasedLinks {
  readonly #options: LeasedLinksOptions;
  #term: LinkTerm | undefined;
  #ending: Promise<void> | undefined;
  #watch: Cancel | undefined;
  #stopped = false;

  constructor(options: LeasedLinksOptions) {
    this.#options = options;
  }

  /** Whether this instance is running the link now. */
  get serving(): boolean {
    return this.#term !== undefined;
  }

  /** Starts following the lease: a term now if it is held, then a check every second. */
  start(): void {
    if (this.#watch !== undefined || this.#stopped) {
      return;
    }
    this.#watch = this.#options.clock.every(LEASE_CHECK_MS, () => {
      this.#check();
    });
    this.#check();
  }

  /**
   * Takes a link the `LinkServer` accepted. It never throws: without the lease, the link is closed
   * as `core_unavailable`.
   */
  accept(link: LinkConnection): void {
    const term = this.#term;
    if (term === undefined || !this.#options.lease.held) {
      link.close(CORE_CLOSE_REASONS.coreUnavailable);
      return;
    }
    term.link.accept(link);
  }

  /** Stops following the lease and ends the current term, if any. */
  async stop(): Promise<void> {
    this.#stopped = true;
    this.#watch?.();
    this.#watch = undefined;
    this.#endTerm();
    await this.#ending;
  }

  #check(): void {
    if (this.#stopped) {
      return;
    }
    const held = this.#options.lease.held;
    if (held && this.#term === undefined && this.#ending === undefined) {
      this.#term = this.#newTerm();
      this.#options.logger.info("core_lease_acquired");
    } else if (!held && this.#term !== undefined) {
      this.#options.logger.warn("core_lease_lost");
      this.#endTerm();
    }
  }

  #newTerm(): LinkTerm {
    const event = this.#options.newEvent();
    const link = new ConnectorLink({
      ...this.#options.link,
      intake: leasedIntake(event, this.#options.lease),
    });
    return { link, event };
  }

  #endTerm(): void {
    const term = this.#term;
    if (term === undefined) {
      return;
    }
    this.#term = undefined;
    const previous = this.#ending ?? Promise.resolve();
    this.#ending = previous
      .then(async () => {
        await term.link.stop();
        await term.event.stop();
      })
      .catch((error: unknown) => {
        this.#options.logger.error(
          "core_lease_term_end_failed",
          undefined,
          error,
        );
      })
      .finally(() => {
        this.#ending = undefined;
        this.#check();
      });
  }
}

/** Event's intake, refusing each message while the lease is not held. Exported for its tests. */
export function leasedIntake(
  event: EventIntake,
  lease: Pick<Lease, "held">,
): EventIntake {
  const leased = <T>(work: () => Promise<T>): Promise<T> =>
    lease.held
      ? work()
      : Promise.reject(
          new EventError(
            "unavailable",
            "This core instance does not hold the lease.",
          ),
        );
  return {
    homeSessionOpened: (session, signal) =>
      leased(() => event.homeSessionOpened(session, signal)),
    inventory: (inventory, session, signal) =>
      leased(() => event.inventory(inventory, session, signal)),
    deviceState: (change, session, signal) =>
      leased(() => event.deviceState(change, session, signal)),
    heartbeat: (heartbeat, session, signal) =>
      leased(() => event.heartbeat(heartbeat, session, signal)),
  };
}
