// The Event manager's intake (CP-11a, T018): it applies what the home sends to State and keeps the
// bridge's health with the Health engine, publishing each change of status on Pub/Sub.
//
// - **One step at a time.** Every State write, and every read-then-write of the health, runs on one
//   queue, so no check-then-act spans two of them (L2). The single-instance lease keeps one core
//   writing (FR-044).
// - **Versions belong to one key.** A session's opening claims State's versions for its key, before
//   any later message of that link (Connector Link runs a link's steps in order). A new key resets
//   them, so a newly enrolled connector, whose counter starts again, wins; a message from a key that
//   is no longer current changes nothing, and is still acked (PT-30, T018).
// - **The core's clock.** A sign of life counts at the time the core received it, never at the
//   home's own time. Two minutes without one (Config `staleAfterMs`) and the home shows offline:
//   a check runs that long after each sign of life, and Inquiry also reads through `asOf`, so a core
//   restart never shows a silent home as up.
import type { Cancel, Clock } from "../../../utilities/clock/index.ts";
import type { PubSub } from "../../../utilities/pub-sub/index.ts";
import { StateStoreError } from "../../access/state/index.ts";
import type { DeviceApplied, StateStore } from "../../access/state/index.ts";
import {
  afterHeartbeat,
  afterSessionOpened,
  asOf,
  healthChanges,
} from "../../engines/health/index.ts";
import type { HealthView } from "../../engines/health/index.ts";
import { EventError } from "./event-error.ts";
import type {
  DeviceChangeOutcome,
  EventIntake,
  EventTopics,
  HomeLinkSession,
  IncomingDeviceState,
  IncomingHeartbeat,
  IncomingInventory,
  InventoryOutcome,
} from "./event-intake.ts";

/** What the Event manager is wired with. */
export interface EventManagerOptions {
  readonly state: StateStore;
  readonly events: PubSub<EventTopics>;
  readonly clock: Clock;
  /** How long the home may be silent before it shows offline: the Config utility's `staleAfterMs`. */
  readonly homeOfflineAfterMs: number;
  /** Where a failure of the background silence check goes; the Host wires it to the logger. */
  readonly reportFailure: (error: unknown) => void;
}

const NOT_CURRENT: InventoryOutcome = { kind: "not_current" };

const DEVICE_OUTCOMES: Readonly<Record<DeviceApplied, DeviceChangeOutcome>> = {
  applied: "applied",
  older: "older",
  unknown_device: "needs_inventory",
  unknown_location: "needs_inventory",
  refused: "refused",
};

/** Event's intake. One per core process. */
export class EventManager implements EventIntake {
  readonly #options: EventManagerOptions;
  readonly #stopping = new AbortController();
  #steps: Promise<unknown> = Promise.resolve();
  #currentKey: string | undefined;
  #cancelSilenceCheck: Cancel = () => undefined;

  constructor(options: EventManagerOptions) {
    if (!(options.homeOfflineAfterMs > 0)) {
      throw new RangeError("The offline threshold must be a positive time.");
    }
    this.#options = options;
  }

  async homeSessionOpened(
    session: HomeLinkSession,
    signal: AbortSignal,
  ): Promise<void> {
    const receivedAt = this.#options.clock.now();
    await this.#serially(signal, async () => {
      await this.#guard(signal, "The session could not be recorded.", () =>
        this.#options.state.claimVersions(session.key_id, receivedAt, signal),
      );
      this.#currentKey = session.key_id;
      await this.#updateHealth(
        (health) =>
          afterSessionOpened(health, session.connector_version, receivedAt),
        signal,
      );
    });
  }

  async inventory(
    inventory: IncomingInventory,
    session: HomeLinkSession,
    signal: AbortSignal,
  ): Promise<InventoryOutcome> {
    return this.#serially(signal, async (): Promise<InventoryOutcome> => {
      if (!this.#isCurrent(session)) {
        return NOT_CURRENT;
      }
      const applied = await this.#guard(
        signal,
        "The inventory could not be committed.",
        () =>
          this.#options.state.applyInventory(
            { locations: inventory.locations, devices: inventory.devices },
            signal,
          ),
      );
      return { kind: "applied", ...applied };
    });
  }

  async deviceState(
    change: IncomingDeviceState,
    session: HomeLinkSession,
    signal: AbortSignal,
  ): Promise<DeviceChangeOutcome> {
    return this.#serially(signal, async (): Promise<DeviceChangeOutcome> => {
      if (!this.#isCurrent(session)) {
        return "not_current";
      }
      const applied = await this.#guard(
        signal,
        "The device change could not be committed.",
        () => this.#options.state.applyDevice(change.device, signal),
      );
      return DEVICE_OUTCOMES[applied];
    });
  }

  async heartbeat(
    heartbeat: IncomingHeartbeat,
    session: HomeLinkSession,
    signal: AbortSignal,
  ): Promise<void> {
    const receivedAt = this.#options.clock.now();
    await this.#serially(signal, async () => {
      if (!this.#isCurrent(session)) {
        return;
      }
      await this.#updateHealth(
        (health) => afterHeartbeat(health, heartbeat, receivedAt),
        signal,
      );
    });
  }

  /** Cancels the silence check and lets the step already running finish. */
  async stop(): Promise<void> {
    this.#cancelSilenceCheck();
    this.#stopping.abort(new Error("The core is stopping."));
    await this.#steps.catch(() => undefined);
  }

  // Reads the health as of now, applies one change, saves it, and publishes a change of status.
  // Runs only on the queue. Every sign of life schedules the next silence check.
  async #updateHealth(
    change: (health: HealthView | undefined) => HealthView,
    signal: AbortSignal,
  ): Promise<void> {
    const before = await this.#health(signal);
    const after = change(before);
    await this.#saveHealth(before, after, signal);
    this.#scheduleSilenceCheck();
  }

  async #health(signal: AbortSignal): Promise<HealthView | undefined> {
    const stored = await this.#guard(
      signal,
      "The health could not be read.",
      () => this.#options.state.health(signal),
    );
    return stored === undefined
      ? undefined
      : asOf(stored, this.#options.clock.now(), this.#policy);
  }

  async #saveHealth(
    before: HealthView | undefined,
    after: HealthView,
    signal: AbortSignal,
  ): Promise<void> {
    await this.#guard(signal, "The health could not be saved.", () =>
      this.#options.state.saveHealth(after, signal),
    );
    const changed = healthChanges(before, after);
    if (changed.length > 0) {
      this.#options.events.publish("health.changed", {
        changed,
        health: after,
      });
    }
  }

  #scheduleSilenceCheck(): void {
    this.#cancelSilenceCheck();
    this.#cancelSilenceCheck = this.#options.clock.schedule(
      this.#options.homeOfflineAfterMs,
      () => {
        this.#checkSilence().catch((error: unknown) => {
          if (!this.#stopping.signal.aborted) {
            this.#options.reportFailure(error);
          }
        });
      },
    );
  }

  // The home has been silent for the threshold: the stored health becomes offline and stale, and
  // the change is published (OR5, FR-005).
  async #checkSilence(): Promise<void> {
    const signal = this.#stopping.signal;
    await this.#serially(signal, async () => {
      const stored = await this.#guard(
        signal,
        "The health could not be read.",
        () => this.#options.state.health(signal),
      );
      if (stored === undefined) {
        return;
      }
      const now = asOf(stored, this.#options.clock.now(), this.#policy);
      if (healthChanges(stored, now).length > 0) {
        await this.#saveHealth(stored, now, signal);
      }
    });
  }

  // Whether a session's messages may change State. No key claimed yet in this process means the
  // session's start was never recorded: the message is refused as unavailable, so it stays unacked
  // and the home sends it again on a session whose start is recorded (T018 follow-up).
  #isCurrent(session: HomeLinkSession): boolean {
    if (this.#currentKey === undefined) {
      throw new EventError(
        "unavailable",
        "No session has claimed State's versions yet.",
      );
    }
    return session.key_id === this.#currentKey;
  }

  get #policy(): { readonly homeOfflineAfterMs: number } {
    return { homeOfflineAfterMs: this.#options.homeOfflineAfterMs };
  }

  // Runs `work` after every step queued before it. A step's failure reaches its own caller and
  // does not stop the queue.
  async #serially<T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> {
    const step = this.#steps.then(() => {
      signal.throwIfAborted();
      return work();
    });
    this.#steps = step.catch(() => undefined);
    return step;
  }

  // State's failures become Event's own; an abort and anything else pass through unchanged.
  async #guard<T>(
    signal: AbortSignal,
    message: string,
    work: () => Promise<T>,
  ): Promise<T> {
    try {
      return await work();
    } catch (error) {
      signal.throwIfAborted();
      if (error instanceof StateStoreError) {
        throw new EventError(error.kind, message, { cause: error });
      }
      throw error;
    }
  }
}
