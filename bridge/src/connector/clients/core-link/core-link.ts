// Core Link (CP-09, T016): the home's end of the link. It dials out over WSS (no inbound port at
// home, IA D1), opens each session with a signed hello (SC2), hands what the core sends to Ingest,
// and dials again whenever the link is down: a randomised backoff from 1 s, doubling to a 30 s cap,
// so a returning core is reached within 60 s (FR-042). The connector's secrets never go on a frame
// (AC B5, SC4): only the public key, its id and the printed enrollment code do.
import { randomUUID } from "node:crypto";
import type { Clock } from "../../../utilities/clock/index.ts";
import type {
  DialOutcome,
  LinkConnection,
  LinkSlot,
} from "../../../utilities/link-transport/index.ts";
import type { Logger } from "../../../utilities/logging/index.ts";
import { signingKeyId } from "../../../utilities/security/index.ts";
import type { Ingest } from "../../managers/ingest/index.ts";
import { HomeSession } from "./home-session.ts";
import type { CoreLinkIdentity, SessionEnd } from "./home-session.ts";

/** The reconnect backoff: 1 s, doubling to a 30 s cap, with full jitter (OR5, FR-042). */
export const RECONNECT_BACKOFF = { initialMs: 1_000, capMs: 30_000 } as const;

const STOPPING = "connector_stopping";

/** What Core Link is wired with. */
export interface CoreLinkOptions {
  /** Opens one link to the core: the Link transport's `dialLink` to the configured `wss:` URL. */
  readonly dial: (signal: AbortSignal) => Promise<DialOutcome>;
  /** Where the open session's link is put, for Ingest to send on. */
  readonly slot: LinkSlot;
  readonly ingest: Ingest;
  readonly identity: CoreLinkIdentity;
  readonly clock: Clock;
  readonly logger: Logger;
  /** A number in [0, 1), for the jitter; `Math.random` unless a test fixes it. */
  readonly random?: () => number;
  /** A fresh session id per connection (OR2); a UUID unless a test fixes it. */
  readonly newSessionId?: () => string;
}

/**
 * The wait before the next dial after `attempt` dials in a row that opened no session: a random
 * time up to `initialMs × 2^(attempt − 1)`, capped at `capMs`, and never under `initialMs`.
 */
export function reconnectDelayMs(
  attempt: number,
  random: () => number,
): number {
  const ceiling = Math.min(
    RECONNECT_BACKOFF.capMs,
    RECONNECT_BACKOFF.initialMs * 2 ** Math.max(0, attempt - 1),
  );
  return Math.max(RECONNECT_BACKOFF.initialMs, Math.round(ceiling * random()));
}

/** The home's end of the link. One per connector process; the Host starts and stops it. */
export class CoreLink {
  readonly #options: CoreLinkOptions;
  readonly #keyId: string;
  readonly #logger: Logger;
  #enroll = false;
  #controller: AbortController | undefined;
  #running: Promise<void> | undefined;
  #link: LinkConnection | undefined;

  constructor(options: CoreLinkOptions) {
    this.#options = options;
    this.#keyId = signingKeyId(options.identity.key.publicKey);
    this.#logger = options.logger.with({ component: "core_link" });
  }

  /** Starts dialing the core, and keeps the link up until `stop`. */
  start(): void {
    if (this.#running !== undefined) {
      return;
    }
    const controller = new AbortController();
    this.#controller = controller;
    // The loop's own failure is logged here, once, and ends the loop: the Host's readiness shows
    // the link down (T027). Without this, Node would end the process with nothing in the log.
    this.#running = this.#keepConnected(controller.signal).catch(
      (error: unknown) => {
        this.#logger.error("core_link_failed", undefined, error);
      },
    );
  }

  /** Closes the link, stops dialing, and resolves once the loop has ended. */
  async stop(): Promise<void> {
    this.#controller?.abort();
    this.#link?.close(STOPPING);
    await this.#running;
    this.#running = undefined;
  }

  async #keepConnected(signal: AbortSignal): Promise<void> {
    let attempt = 0;
    while (!signal.aborted) {
      const end = await this.#connectOnce(signal);
      if (end === "halt") {
        return;
      }
      attempt = end === "opened" ? 1 : attempt + 1;
      const random = this.#options.random ?? Math.random;
      const delay =
        end === "slow"
          ? RECONNECT_BACKOFF.capMs
          : reconnectDelayMs(attempt, random);
      try {
        await this.#options.clock.sleep(delay, signal);
      } catch {
        return;
      }
    }
  }

  async #connectOnce(signal: AbortSignal): Promise<SessionEnd> {
    let outcome: DialOutcome;
    try {
      outcome = await this.#options.dial(signal);
    } catch (error) {
      if (signal.aborted) {
        return "halt";
      }
      throw error;
    }
    if (outcome.kind === "unreachable") {
      this.#logger.info("core_link_core_unreachable");
      return "retry";
    }
    this.#link = outcome.link;
    const session = new HomeSession({
      link: outcome.link,
      slot: this.#options.slot,
      ingest: this.#options.ingest,
      identity: this.#options.identity,
      keyId: this.#keyId,
      sessionId: (this.#options.newSessionId ?? randomUUID)(),
      enroll: this.#enroll,
      onEnrolled: () => {
        this.#enroll = false;
      },
      clock: this.#options.clock,
      logger: this.#logger,
    });
    const end = await session.run(signal);
    this.#link = undefined;
    if (end === "enroll") {
      this.#enroll = true;
    }
    return end;
  }
}
