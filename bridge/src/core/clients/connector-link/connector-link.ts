// Connector Link (CP-09, T017): the core's end of the link from home. The Host hands it each link
// the Link transport's `LinkServer` accepts on the WSS upgrade path. It checks the connector's
// signed hello through Admin (SC2), holds an `enroll` request until the owner approves it on the
// admin page, and hands the home's inventory, state and heartbeats to Event, sending `ack` only
// after Event has committed (AC B10). A session's steps run one at a time (see core-session.ts).
//
// Across links it keeps three rules (L2: each change is made in one synchronous step):
// - at most `MAX_UNPROVEN_LINKS` links that have not proved a key, so strangers cannot hold the
//   core's sockets open;
// - one open session per key: a newer one replaces the older, which closes as `session_replaced`;
// - one link waiting for the owner: a newer `enroll` replaces the request, and the older link
//   closes as `enrollment_replaced`, but only while it still waits: a link whose key was approved
//   meanwhile carries a session, which no `enroll` may end (round 3).
import type { Clock } from "../../../utilities/clock/index.ts";
import type { LinkConnection } from "../../../utilities/link-transport/index.ts";
import type { Logger } from "../../../utilities/logging/index.ts";
import { createChallengeNonce } from "../../../utilities/security/index.ts";
import type { AdminManager } from "../../managers/admin/index.ts";
import type { EventIntake } from "../../managers/event/index.ts";
import { CORE_CLOSE_REASONS, CoreSession } from "./core-session.ts";

/** The most links that may be open at once without having proved a key [P]. */
export const MAX_UNPROVEN_LINKS = 8;

/** What Connector Link is wired with. */
export interface ConnectorLinkOptions {
  /** Checks keys and records enroll requests (SC2, PT-32). */
  readonly admin: AdminManager;
  /** Takes the home's messages; Event implements it (T018). */
  readonly intake: EventIntake;
  readonly clock: Clock;
  readonly logger: Logger;
  /** A fresh challenge per hello; `createChallengeNonce` unless a test fixes it. */
  readonly newNonce?: () => string;
}

/** The core's end of the link. One per core process; the Host starts and stops it. */
export class ConnectorLink {
  readonly #options: ConnectorLinkOptions;
  readonly #logger: Logger;
  readonly #sessions = new Set<CoreSession>();
  readonly #openByKey = new Map<string, CoreSession>();
  #enrolling: CoreSession | undefined;
  #stopping = false;

  constructor(options: ConnectorLinkOptions) {
    this.#options = options;
    this.#logger = options.logger.with({ component: "connector_link" });
  }

  /** How many links are open now, proved or not. */
  get linkCount(): number {
    return this.#sessions.size;
  }

  /**
   * Takes a link the `LinkServer` accepted. It never throws: it runs inside the server's upgrade
   * callback, where a throw would end the core process, so any failure is logged and the link is
   * closed.
   */
  accept(link: LinkConnection): void {
    try {
      this.#accept(link);
    } catch (error) {
      this.#logger.error("connector_link_accept_failed", undefined, error);
      if (link.closed === undefined) {
        link.close(CORE_CLOSE_REASONS.coreError);
      }
    }
  }

  /** Closes every link as `core_stopping`, and resolves once their last steps have finished. */
  async stop(): Promise<void> {
    this.#stopping = true;
    const sessions = [...this.#sessions];
    for (const session of sessions) {
      session.close(CORE_CLOSE_REASONS.coreStopping);
    }
    await Promise.all(sessions.map((session) => session.finished()));
  }

  #accept(link: LinkConnection): void {
    if (this.#stopping) {
      link.close(CORE_CLOSE_REASONS.coreStopping);
      return;
    }
    if (this.#unprovenCount() >= MAX_UNPROVEN_LINKS) {
      this.#logger.warn("connector_link_too_many_links", {
        count: this.#sessions.size,
      });
      link.close(CORE_CLOSE_REASONS.tooManyLinks);
      return;
    }
    const session = new CoreSession({
      link,
      admin: this.#options.admin,
      intake: this.#options.intake,
      clock: this.#options.clock,
      logger: this.#logger,
      newNonce: this.#options.newNonce ?? createChallengeNonce,
      onProven: (proven) => {
        this.#proven(proven);
      },
      onEnrolling: (waiting) => {
        this.#enrollmentWaiting(waiting);
      },
      onClosed: (closed) => {
        this.#closed(closed);
      },
    });
    this.#sessions.add(session);
    session.start();
  }

  #unprovenCount(): number {
    let count = 0;
    for (const session of this.#sessions) {
      count += session.isOpen ? 0 : 1;
    }
    return count;
  }

  #proven(session: CoreSession): void {
    const keyId = session.keyId;
    if (keyId === undefined) {
      return;
    }
    const older = this.#openByKey.get(keyId);
    this.#openByKey.set(keyId, session);
    if (older !== undefined && older !== session) {
      older.close(CORE_CLOSE_REASONS.sessionReplaced);
    }
  }

  #enrollmentWaiting(session: CoreSession): void {
    const older = this.#enrolling;
    this.#enrolling = session;
    if (older !== undefined && older !== session && older.isWaitingForOwner) {
      older.close(CORE_CLOSE_REASONS.enrollmentReplaced);
    }
  }

  #closed(session: CoreSession): void {
    this.#sessions.delete(session);
    const keyId = session.keyId;
    if (keyId !== undefined && this.#openByKey.get(keyId) === session) {
      this.#openByKey.delete(keyId);
    }
    if (this.#enrolling === session) {
      this.#enrolling = undefined;
    }
  }
}
