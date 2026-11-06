// Ingest's state path (CP-08a, T014): what fills the core's State (PT-30). It writes to the Outbox
// Store, which Core Link sends from (T016):
//
// - `inventory`, a full snapshot of every location and device, at every session start and on the
//   core's `inventory_request`, and again when a location's alarm mode changes, because no other
//   iteration 001 message carries a location;
// - `device_state`, a device's full current entry, never only the changed fields, when it changes
//   (DRIFT-001-06).
//
// Every entry gets its own `state_version` from the outbox's counter (DRIFT-001-08). Messages are
// written one at a time in the order their cause arrived, so a later state always has the higher
// version. A change that arrives while a read is running goes into that read's snapshot, because the
// read's answer may be older than the change. Events, catch-up and the late marker come with CP-08b
// (iteration 002).
import type { Clock } from "../../../utilities/clock/index.ts";
import type { Logger, LogFields } from "../../../utilities/logging/index.ts";
import { OutboxStoreError } from "../../access/outbox-store/index.ts";
import type {
  OutboxDraft,
  OutboxStore,
  StateVersions,
} from "../../access/outbox-store/index.ts";
import { RingAdapterError } from "../../access/ring-adapter/index.ts";
import type {
  RingChange,
  RingDevice,
  RingPort,
  StopWatching,
} from "../../access/ring-adapter/index.ts";
import { deviceEntry, HomeView } from "./home-view.ts";
import type { TimedChange } from "./home-view.ts";

/**
 * What became of an inventory. Each is a case the caller handles on the spot, by trying again
 * later:
 * - `queued`: written to the outbox;
 * - `ring_unavailable` or `session_lost`: Ring could not be read (the Ring Adapter's kinds);
 * - `outbox_unavailable`: the outbox could not be written.
 */
export type InventoryOutcome =
  "queued" | "ring_unavailable" | "session_lost" | "outbox_unavailable";

/** What Ingest is wired with. */
export interface IngestOptions {
  readonly ring: RingPort;
  readonly outbox: OutboxStore;
  readonly clock: Clock;
  readonly logger: Logger;
}

// A change Ring reports has no caller to cancel it; Ingest's own writes run to the end.
const UNCANCELLED = new AbortController().signal;

/** The home's state path into the outbox. One instance per connector process. */
export class Ingest {
  readonly #ring: RingPort;
  readonly #outbox: OutboxStore;
  readonly #clock: Clock;
  readonly #logger: Logger;
  readonly #readsRunning = new Set<TimedChange[]>();
  #view: HomeView | undefined;
  #writes: Promise<void> = Promise.resolve();
  #stopWatching: StopWatching | undefined;

  constructor(options: IngestOptions) {
    this.#ring = options.ring;
    this.#outbox = options.outbox;
    this.#clock = options.clock;
    this.#logger = options.logger.with({ component: "ingest" });
  }

  /** Starts taking Ring's changes. The Host calls it before the first session starts. */
  start(): void {
    this.#stopWatching ??= this.#ring.watch((change) => {
      this.#received(change);
    });
  }

  /** Stops taking Ring's changes and resolves once the messages already accepted are written. */
  async stop(): Promise<void> {
    this.#stopWatching?.();
    this.#stopWatching = undefined;
    await this.flush();
  }

  /** A session with the core started: queue a fresh inventory. */
  sessionStarted(signal: AbortSignal): Promise<InventoryOutcome> {
    return this.#sendInventory(signal);
  }

  /** The core asked for a fresh inventory. */
  inventoryRequested(signal: AbortSignal): Promise<InventoryOutcome> {
    return this.#sendInventory(signal);
  }

  /** Resolves once every message accepted so far is written, or has failed and been logged. */
  flush(): Promise<void> {
    return this.#writes;
  }

  async #sendInventory(signal: AbortSignal): Promise<InventoryOutcome> {
    const seenDuringRead: TimedChange[] = [];
    this.#readsRunning.add(seenDuringRead);
    let view: HomeView;
    try {
      view = await this.#readHome(signal);
    } catch (error) {
      return ringFailure(error);
    } finally {
      this.#readsRunning.delete(seenDuringRead);
    }
    for (const change of seenDuringRead) {
      view.apply(change);
    }
    this.#view = view;
    const written = this.#write(inventoryDraft(view), signal);
    try {
      await written;
      return "queued";
    } catch (error) {
      if (error instanceof OutboxStoreError) {
        return "outbox_unavailable";
      }
      throw error;
    }
  }

  // One location at a time: the Ring Adapter's gate runs one call at a time anyway (FR-026).
  async #readHome(signal: AbortSignal): Promise<HomeView> {
    const locations = await this.#ring.locations(signal);
    const devices: RingDevice[] = [];
    for (const location of locations) {
      devices.push(...(await this.#ring.devices(location.location_id, signal)));
    }
    return HomeView.fromRead(locations, devices, this.#clock.now());
  }

  #received(change: RingChange): void {
    if (change.kind === "session") {
      return;
    }
    const timed: TimedChange = { change, at: this.#clock.now() };
    for (const seen of this.#readsRunning) {
      seen.push(timed);
    }
    this.#view?.apply(timed);
    if (change.kind === "device") {
      const { device } = change;
      this.#writeChange(
        (versions) => ({
          kind: "device_state",
          body: deviceEntry(device, timed.at, versions.next()),
        }),
        { message_type: "device_state", device_id: device.device_id },
      );
      return;
    }
    if (this.#view !== undefined) {
      this.#writeChange(inventoryDraft(this.#view), {
        message_type: "inventory",
        location_id: change.location.location_id,
      });
    }
  }

  // Ingest handles a change's failure itself: no caller waits for it. The next inventory sends the
  // device's state again.
  #writeChange(
    compose: (versions: StateVersions) => OutboxDraft,
    fields: LogFields,
  ): void {
    this.#write(compose, UNCANCELLED).catch((error: unknown) => {
      if (error instanceof OutboxStoreError) {
        this.#logger.warn(
          "ingest_state_not_queued",
          { ...fields, error_code: "outbox_unavailable" },
          error,
        );
        return;
      }
      this.#logger.error(
        "ingest_state_not_queued",
        { ...fields, error_code: "internal" },
        error,
      );
    });
  }

  // Writes run one at a time in the order they were asked for, so versions follow that order.
  #write(
    compose: (versions: StateVersions) => OutboxDraft,
    signal: AbortSignal,
  ): Promise<string> {
    const written = this.#writes.then(() =>
      this.#outbox.append(compose, signal),
    );
    this.#writes = written.then(
      () => undefined,
      () => undefined,
    );
    return written;
  }
}

// The body is built when the write runs, so it holds every change taken in before then.
function inventoryDraft(
  view: HomeView,
): (versions: StateVersions) => OutboxDraft {
  return (versions) => ({ kind: "inventory", body: view.inventory(versions) });
}

function ringFailure(error: unknown): InventoryOutcome {
  if (error instanceof RingAdapterError) {
    return error.kind;
  }
  throw error;
}
