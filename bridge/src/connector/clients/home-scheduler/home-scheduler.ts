// Home Scheduler (CP-09, T016): the home's clock-driven work. Every 10 s it has Ingest send what is
// due (resends after 10 s without an ack, and a session's inventory still owed); every 15 s it has
// Ingest send the heartbeat (OR5). Each tick starts when the last one has finished, so ticks never
// overlap. Due auto-off timers join it with Execute (iteration 003).
import type { Cancel, Clock } from "../../../utilities/clock/index.ts";
import type { Logger } from "../../../utilities/logging/index.ts";
import type { Ingest } from "../../managers/ingest/index.ts";

/** How often what is due is sent: the outbox's resend interval (connector-link.md). */
export const RESEND_TICK_MS = 10_000;

/** How often the heartbeat goes (connector-link.md "Heartbeat and home offline"). */
export const HEARTBEAT_INTERVAL_MS = 15_000;

/** What the Home Scheduler is wired with. */
export interface HomeSchedulerOptions {
  readonly ingest: Ingest;
  readonly clock: Clock;
  readonly logger: Logger;
}

/** The home's ticks. One per connector process; the Host starts and stops it. */
export class HomeScheduler {
  readonly #options: HomeSchedulerOptions;
  readonly #logger: Logger;
  // The current timer of each tick, by kind: a tick replaces its own when it schedules the next, so
  // only two are ever held, however long the connector runs (round 4).
  readonly #cancels = new Map<string, Cancel>();
  readonly #running = new Set<Promise<void>>();
  #controller: AbortController | undefined;

  constructor(options: HomeSchedulerOptions) {
    this.#options = options;
    this.#logger = options.logger.with({ component: "home_scheduler" });
  }

  /** Starts both ticks. */
  start(): void {
    if (this.#controller !== undefined) {
      return;
    }
    const controller = new AbortController();
    this.#controller = controller;
    const { ingest } = this.#options;
    this.#every(RESEND_TICK_MS, "send_due", controller.signal, (signal) =>
      ingest.sendDue(signal),
    );
    this.#every(
      HEARTBEAT_INTERVAL_MS,
      "heartbeat",
      controller.signal,
      (signal) => ingest.sendHeartbeat(signal),
    );
  }

  /** Stops both ticks and resolves once a tick already running has finished. */
  async stop(): Promise<void> {
    this.#controller?.abort();
    this.#controller = undefined;
    for (const cancel of this.#cancels.values()) {
      cancel();
    }
    this.#cancels.clear();
    await Promise.all(this.#running);
  }

  #every(
    intervalMs: number,
    kind: string,
    signal: AbortSignal,
    work: (signal: AbortSignal) => Promise<void>,
  ): void {
    const tick = (): void => {
      const running = this.#run(kind, signal, work).finally(() => {
        this.#running.delete(running);
        if (!signal.aborted) {
          this.#cancels.set(
            kind,
            this.#options.clock.schedule(intervalMs, tick),
          );
        }
      });
      this.#running.add(running);
    };
    this.#cancels.set(kind, this.#options.clock.schedule(intervalMs, tick));
  }

  // The scheduler is the edge for its ticks: a failure Ingest did not handle is logged once here,
  // and the next tick runs as usual.
  async #run(
    kind: string,
    signal: AbortSignal,
    work: (signal: AbortSignal) => Promise<void>,
  ): Promise<void> {
    try {
      await work(signal);
    } catch (error) {
      if (!signal.aborted) {
        this.#logger.error("home_tick_failed", { kind }, error);
      }
    }
  }
}
