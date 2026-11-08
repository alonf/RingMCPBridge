// Ingest (CP-08a, T014; sending, T016): what fills the core's State (PT-30), through the Outbox
// Store, and the sending of it over the link.
//
// - `inventory`, a full snapshot of every location and device, at every session start and on the
//   core's `inventory_request`, and again when a location's alarm mode changes, because no other
//   iteration 001 message carries a location;
// - `device_state`, a device's full current entry, never only the changed fields, when it changes
//   (DRIFT-001-06);
// - `heartbeat`, the home's health summary, every 15 s on the Home Scheduler's tick.
//
// Every entry gets its own `state_version` from the outbox's counter (DRIFT-001-08). The outbox's
// work runs one step at a time in the order it was asked for: a later state always has the higher
// version, and a new session's "everything is due again" is done before anything is sent on its
// link. A change that arrives while a read is running goes into that read's snapshot, because the
// read's answer may be older than the change.
//
// An inventory names a session only when the Ring read it carries began in that session and the
// session is still open as it is written (CP-14 review round 4): the core keeps a new session's data
// stale until it stores such an inventory, so a picture read before the reconnect, or sent on an
// alarm mode change while the session's own read runs, does not end that. Of two reads that overlap,
// the one begun later holds the newer picture: an earlier read that finishes after it is dropped.
//
// A change Ring reports that cannot be written to the outbox (a full disk) leaves the core's data
// behind with no message to show it, so the heartbeat says so (CP-14 review round 5): it carries the
// newest `state_version` written before that change, until an inventory read in the session is
// queued. Any inventory written after the change has a higher `snapshot_version`, and only such an
// inventory, named with the session, ends the core's refresh.
//
// Messages go out on the link in the `LinkSlot`, which Core Link fills once a session is open. A
// message is sent when it is written, and the 10 s tick sends again what has waited 10 s without
// its ack (T016). Events, catch-up and the late marker come with CP-08b (iteration 002).
import type { Clock } from "../../../utilities/clock/index.ts";
import { formatUtc } from "../../../utilities/clock/index.ts";
import type {
  LinkConnection,
  LinkSlot,
  SendOutcome,
} from "../../../utilities/link-transport/index.ts";
import type { Logger, LogFields } from "../../../utilities/logging/index.ts";
import { HOME_MESSAGE_TYPES } from "../../../core/clients/connector-link/messages/index.ts";
import type { HeartbeatMessage } from "../../../core/clients/connector-link/messages/index.ts";
import { OutboxStoreError } from "../../access/outbox-store/index.ts";
import type {
  OutboxDraft,
  OutboxItem,
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
 * - `superseded`: a read begun later finished first, so this older picture was dropped;
 * - `ring_unavailable` or `session_lost`: Ring could not be read (the Ring Adapter's kinds);
 * - `outbox_unavailable`: the outbox could not be written.
 */
export type InventoryOutcome =
  | "queued"
  | "superseded"
  | "ring_unavailable"
  | "session_lost"
  | "outbox_unavailable";

/** What Ingest is wired with. */
export interface IngestOptions {
  readonly ring: RingPort;
  readonly outbox: OutboxStore;
  /** The open link to send on, which Core Link fills; empty while there is no session. */
  readonly link: LinkSlot;
  readonly clock: Clock;
  readonly logger: Logger;
}

// The newest picture of the home: the number of the read it came from, in the order reads began,
// and the session open as that read began.
interface LatestView {
  readonly view: HomeView;
  readonly read: number;
  readonly readFor: string | undefined;
}

/** How many due messages one step sends, one at a time, before another step continues. */
const SEND_BATCH = 100;

// A change Ring reports has no caller to cancel it; Ingest's own writes run to the end.
const UNCANCELLED = new AbortController().signal;

/** The home's state path into the outbox and onto the link. One instance per connector process. */
export class Ingest {
  readonly #ring: RingPort;
  readonly #outbox: OutboxStore;
  readonly #link: LinkSlot;
  readonly #clock: Clock;
  readonly #logger: Logger;
  readonly #readsRunning = new Set<TimedChange[]>();
  readonly #errorCounts = new Map<string, number>();
  #latest: LatestView | undefined;
  #readsBegun = 0;
  #steps: Promise<void> = Promise.resolve();
  #stopWatching: StopWatching | undefined;
  #inventoryOwed = false;
  // The newest `state_version` the outbox has kept, and, while a change could not be written, the
  // newest one kept before it: the version the inventory that pays the debt must be above.
  #lastVersion: number | undefined;
  #owedAfter: number | undefined;
  // The session last opened. An inventory read since it opened names it while its link is in the
  // slot.
  #sessionId: string | undefined;
  // True from a session's start until its "everything is due again" step is done: nothing is sent
  // meanwhile, so a send step queued before the session cannot overtake older unacked messages.
  #sessionStarting = false;

  constructor(options: IngestOptions) {
    this.#ring = options.ring;
    this.#outbox = options.outbox;
    this.#link = options.link;
    this.#clock = options.clock;
    this.#logger = options.logger.with({ component: "ingest" });
  }

  /** Starts taking Ring's changes. The Host calls it before the first session starts. */
  start(): void {
    this.#stopWatching ??= this.#ring.watch((change) => {
      this.#received(change);
    });
  }

  /** Stops taking Ring's changes and resolves once the work already accepted is done. */
  async stop(): Promise<void> {
    this.#stopWatching?.();
    this.#stopWatching = undefined;
    await this.flush();
  }

  /**
   * A session opened, and its link is in the slot. Every unacked message becomes due again before
   * anything is sent on the new link, and an inventory read from Ring since this session opened is
   * owed until it is queued. Then what is due is sent.
   */
  async sessionOpened(sessionId: string, signal: AbortSignal): Promise<void> {
    this.#sessionId = sessionId;
    this.#inventoryOwed = true;
    this.#sessionStarting = true;
    try {
      await this.#step(() => this.#outbox.markAllUnsent(signal));
    } catch (error) {
      this.#outboxFailed("ingest_resend_not_marked", error);
    } finally {
      this.#sessionStarting = false;
    }
    await this.sendDue(signal);
  }

  /** The core asked for a fresh inventory: queue it and send it. */
  async inventoryRequested(signal: AbortSignal): Promise<InventoryOutcome> {
    const outcome = await this.#queueInventory(signal);
    await this.#sendDueSafely(signal);
    return outcome;
  }

  /**
   * The 10 s tick: queues an inventory still owed for this session, then sends every message that
   * was never sent or has waited 10 s without its ack.
   */
  async sendDue(signal: AbortSignal): Promise<void> {
    if (this.#inventoryOwed && this.#link.current !== undefined) {
      await this.#queueInventory(signal);
    }
    await this.#sendDueSafely(signal);
  }

  /** The core committed a message: clear it from the outbox. A repeated ack changes nothing. */
  async acknowledged(messageId: string, signal: AbortSignal): Promise<void> {
    try {
      await this.#step(async () => {
        await this.#outbox.acknowledge(messageId, signal);
      });
    } catch (error) {
      this.#outboxFailed("ingest_ack_not_recorded", error);
    }
  }

  /** The 15 s tick: sends the home's health summary, if a session is open. */
  async sendHeartbeat(signal: AbortSignal): Promise<void> {
    const link = this.#link.current;
    if (link === undefined) {
      return;
    }
    const heartbeat: HeartbeatMessage = {
      ring_session: this.#ring.sessionStatus(),
      push: "off",
      outbox_depth: await this.#depth(signal),
      inventory_owed_after: this.#owedAfter ?? null,
      last_ring_event_at: null,
      error_counts: Object.fromEntries(this.#errorCounts),
      as_of: formatUtc(this.#clock.now()),
    };
    void link.send({ type: HOME_MESSAGE_TYPES.heartbeat, body: heartbeat });
  }

  // The session open now: none while no link is in the slot.
  #composingFor(): string | undefined {
    return this.#link.current === undefined ? undefined : this.#sessionId;
  }

  // The session an inventory names as it is written: the one its read began in, if that one is
  // still open then. A picture read before a session opened is not that session's refresh.
  #nameFor(readFor: string | undefined): () => string | undefined {
    return () =>
      readFor !== undefined && readFor === this.#composingFor()
        ? readFor
        : undefined;
  }

  /** Resolves once every step accepted so far is done, or has failed and been logged. */
  flush(): Promise<void> {
    return this.#steps;
  }

  // The inventory owed is the open session's own: one read before it opened does not pay it.
  async #queueInventory(signal: AbortSignal): Promise<InventoryOutcome> {
    const readFor = this.#composingFor();
    const outcome = await this.#writeInventory(readFor, signal);
    if (outcome === "queued") {
      if (readFor !== undefined && readFor === this.#composingFor()) {
        this.#inventoryOwed = false;
        this.#owedAfter = undefined;
      }
    } else if (outcome !== "superseded") {
      this.#inventoryOwed = true;
      this.#count(outcome);
    }
    return outcome;
  }

  async #writeInventory(
    readFor: string | undefined,
    signal: AbortSignal,
  ): Promise<InventoryOutcome> {
    this.#readsBegun += 1;
    const read = this.#readsBegun;
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
    if (this.#latest !== undefined && read < this.#latest.read) {
      return "superseded";
    }
    for (const change of seenDuringRead) {
      view.apply(change);
    }
    this.#latest = { view, read, readFor };
    try {
      await this.#write(inventoryDraft(view, this.#nameFor(readFor)), signal);
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
    this.#latest?.view.apply(timed);
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
    if (this.#latest !== undefined) {
      const { view, readFor } = this.#latest;
      this.#writeChange(inventoryDraft(view, this.#nameFor(readFor)), {
        message_type: "inventory",
        location_id: change.location.location_id,
      });
    }
  }

  // Ingest handles a change's failure itself: no caller waits for it. A fresh inventory is then owed,
  // so the next 10 s tick sends the device's state again, with no other change needed (round 3).
  #writeChange(
    compose: (versions: StateVersions) => OutboxDraft,
    fields: LogFields,
  ): void {
    void this.#write(compose, UNCANCELLED).then(
      () =>
        this.#sendDueSafely(UNCANCELLED).catch((error: unknown) => {
          this.#count("internal");
          this.#logger.error(
            "ingest_not_sent",
            { ...fields, error_code: "internal" },
            error,
          );
        }),
      (error: unknown) => {
        this.#stateNotQueued(fields, error);
      },
    );
  }

  // The debt names the newest version kept before this change, the latest one if changes keep
  // failing, so an inventory written between two failures does not pay the second.
  #stateNotQueued(fields: LogFields, error: unknown): void {
    this.#inventoryOwed = true;
    this.#owedAfter = this.#lastVersion ?? 0;
    if (error instanceof OutboxStoreError) {
      this.#count("outbox_unavailable");
      this.#logger.warn(
        "ingest_state_not_queued",
        { ...fields, error_code: "outbox_unavailable" },
        error,
      );
      return;
    }
    this.#count("internal");
    this.#logger.error(
      "ingest_state_not_queued",
      { ...fields, error_code: "internal" },
      error,
    );
  }

  // Sends what is due on the current link, one step after the work already accepted. The outbox's
  // own failure is logged here; anything else passes to the caller.
  async #sendDueSafely(signal: AbortSignal): Promise<void> {
    try {
      await this.#step(() => this.#sendDue(signal));
    } catch (error) {
      this.#outboxFailed("ingest_not_sent", error);
    }
  }

  // One message at a time: each is taken from the outbox, and so stamped as sent, only when the
  // previous one has been written, so the rest of a backlog stays on disk and the 10 s resend
  // counts from the actual write (round 3). After `SEND_BATCH` messages the work continues in a
  // new step, behind the acks that arrived meanwhile.
  async #sendDue(signal: AbortSignal): Promise<void> {
    if (this.#sessionStarting) {
      return;
    }
    for (let sent = 0; sent < SEND_BATCH; sent += 1) {
      const link = this.#link.current;
      if (link === undefined) {
        return;
      }
      const [item] = await this.#outbox.takeDue(1, signal);
      if (item === undefined) {
        return;
      }
      if ((await this.#send(link, item, signal)) === "closed") {
        return;
      }
      await this.#outbox.markWritten(item.messageId, signal);
    }
    this.#continueSending(signal);
  }

  #continueSending(signal: AbortSignal): void {
    this.#sendDueSafely(signal).catch((error: unknown) => {
      this.#count("internal");
      this.#logger.error("ingest_not_sent", { error_code: "internal" }, error);
    });
  }

  // A message too large for one frame can never be sent; it is logged once and cleared, so it
  // cannot block or repeat (DRIFT-001-22). Its state goes again in the next inventory.
  async #send(
    link: LinkConnection,
    item: OutboxItem,
    signal: AbortSignal,
  ): Promise<SendOutcome> {
    let written: Promise<SendOutcome>;
    try {
      written = link.send({
        type: item.kind,
        body: { ...item.body, message_id: item.messageId },
      });
    } catch (error) {
      if (!(error instanceof RangeError)) {
        throw error;
      }
      this.#count("message_too_large");
      this.#logger.error("ingest_message_dropped", {
        message_type: item.kind,
        message_id: item.messageId,
        error_code: "message_too_large",
      });
      await this.#outbox.acknowledge(item.messageId, signal);
      return "sent";
    }
    return written;
  }

  async #depth(signal: AbortSignal): Promise<number | null> {
    try {
      return await this.#outbox.depth(signal);
    } catch (error) {
      this.#outboxFailed("ingest_depth_not_read", error);
      return null;
    }
  }

  // The outbox's failure is a case Ingest handles: counted, logged once, and the work is retried
  // by the next tick or session. Anything else is not, and passes on.
  #outboxFailed(event: string, error: unknown): void {
    if (!(error instanceof OutboxStoreError)) {
      throw error;
    }
    this.#count("outbox_unavailable");
    this.#logger.warn(event, { error_code: "outbox_unavailable" }, error);
  }

  #count(code: string): void {
    this.#errorCounts.set(code, (this.#errorCounts.get(code) ?? 0) + 1);
  }

  // Notes the last version a message drew once the outbox kept it; a failed write keeps none.
  #write(
    compose: (versions: StateVersions) => OutboxDraft,
    signal: AbortSignal,
  ): Promise<string> {
    return this.#step(async () => {
      let drawn: number | undefined;
      const messageId = await this.#outbox.append(
        (versions) =>
          compose({
            next: () => {
              drawn = versions.next();
              return drawn;
            },
          }),
        signal,
      );
      this.#lastVersion = drawn ?? this.#lastVersion;
      return messageId;
    });
  }

  // The outbox's work runs one step at a time, in the order it was asked for.
  #step<T>(work: () => Promise<T>): Promise<T> {
    const done = this.#steps.then(work);
    this.#steps = done.then(
      () => undefined,
      () => undefined,
    );
    return done;
  }
}

// The body is built when the write runs, so it holds every change taken in before then, and names
// the session `sessionId` gives then.
function inventoryDraft(
  view: HomeView,
  sessionId: () => string | undefined,
): (versions: StateVersions) => OutboxDraft {
  return (versions) => ({
    kind: "inventory",
    body: view.inventory(versions, sessionId()),
  });
}

function ringFailure(error: unknown): InventoryOutcome {
  if (error instanceof RingAdapterError) {
    return error.kind;
  }
  throw error;
}
