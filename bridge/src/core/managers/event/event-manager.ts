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
//   home's own time: a heartbeat at the time its frame arrived, even when it waited behind earlier
//   steps (CP-14 review round 5). Two minutes without one (Config `staleAfterMs`) and the home
//   shows offline: a check runs that long after the last sign of life, and Inquiry also reads
//   through `asOf`, so a core restart never shows a silent home as up. A session's opening counts
//   when the core records it: from its signed answer until the core's `hello_ok`, the home sends
//   nothing, so any wait there is the core's, and the data stays stale until the session's own
//   inventory is stored anyway.
// - **Fresh only once the session's own inventory is stored** (CP-14 review round 3). A session's
//   opening owes a refresh; an inventory the home composed for that session ends it, even when
//   State skips it as already applied, as after a health save that failed. An inventory from an
//   earlier session, or a heartbeat, does not.
// - **A debt the home reports** (CP-14 review round 5). A heartbeat whose `inventory_owed_after` is
//   set says a change the home saw never reached its outbox: the data is stale from the last sign
//   of life before it, until this session stores its own inventory with a higher
//   `snapshot_version`. An older copy sent again does not pay it, and a heartbeat that says nothing
//   is owed does not end it, since the inventory that pays it may still be on its way. A debt that
//   an inventory this session already stored has paid is ignored. Both are kept in memory: a core
//   restart drops the link, and the next session owes its own refresh.
// - **Events** (T047) go through the same queue, each in one transaction across Classify, the
//   Event Log, State and the Audit (`EventWriter`). The outcome returns only after the commit,
//   so Connector Link acks only then; `event.stored` is published after it, and a failed delivery
//   never undoes the write. An event on a session whose key is no longer current is still
//   written, since dropping it could lose a HIGH event; only its State change is skipped.
import { randomUUID } from "node:crypto";
import { formatUtc } from "../../../utilities/clock/index.ts";
import type { EventRecord } from "../../access/event-log/index.ts";
import type { SqlSession } from "../../../utilities/query-layer/index.ts";
import type { EventRule } from "../../../utilities/config/index.ts";
import type { Cancel, Clock } from "../../../utilities/clock/index.ts";
import type { PubSub } from "../../../utilities/pub-sub/index.ts";
import { AuditError } from "../../access/audit/index.ts";
import type { Audit } from "../../access/audit/index.ts";
import { EventLogError } from "../../access/event-log/index.ts";
import type { EventLog } from "../../access/event-log/index.ts";
import { StateStoreError } from "../../access/state/index.ts";
import type { DeviceApplied, StateStore } from "../../access/state/index.ts";
import {
  afterHeartbeat,
  afterRefresh,
  afterSessionOpened,
  asOf,
  healthChanges,
  monitorSample,
  settled,
} from "../../engines/health/index.ts";
import {
  PRIORITY_ORDER,
  type PriorityPolicy,
} from "../../engines/classify/index.ts";
import type { HealthView } from "../../engines/health/index.ts";
import { QueryLayerError } from "../../../utilities/query-layer/index.ts";
import { EventError } from "./event-error.ts";
import type {
  DeviceChangeOutcome,
  EventIntake,
  EventOutcome,
  EventTopics,
  EventStored,
  HomeLinkSession,
  IncomingEvent,
  IncomingDeviceState,
  IncomingHeartbeat,
  IncomingInventory,
  InventoryOutcome,
} from "./event-intake.ts";
import { EventWriter } from "./event-writer.ts";
import type { EventTransactions } from "./event-writer.ts";

/** What the Event manager is wired with. */
export interface EventManagerOptions {
  readonly eventRules?: readonly EventRule[] | undefined;
  readonly state: StateStore;
  readonly events: PubSub<EventTopics>;
  readonly clock: Clock;
  /** How long the home may be silent before it shows offline: the Config utility's `staleAfterMs`. */
  readonly eventRetentionDays?: number;
  readonly homeOfflineAfterMs: number;
  readonly reportMonitorSample?: (
    sample: ReturnType<typeof monitorSample>,
  ) => void;
  /** Where a failure of the background silence check goes; the Host wires it to the logger. */
  readonly reportFailure: (error: unknown) => void;
  /** The core's database, for one transaction per event (T047). */
  readonly store: EventTransactions;
  readonly eventLog: EventLog;
  readonly audit: Audit;
  /** The event priorities and the late limit, checked when the core started (T045). */
  readonly priorityPolicy: PriorityPolicy;
}

const RING_ALERT_DELAY_MS = 120_000;
const DAY_MS = 86_400_000;
const HEALTH_MESSAGES: Readonly<Record<string, string>> = {
  "health.home_offline": "The home connector is offline.",
  "health.home_online": "The home connector is online.",
  "health.ring_unavailable":
    "Ring has been unavailable for more than two minutes.",
  "health.ring_restored": "Ring is available again.",
  "ring.session_lost": "Ring sign-in is required.",
};
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
  readonly #leaseStartedAt: number;
  readonly #writer: EventWriter;
  readonly #stopping = new AbortController();
  #steps: Promise<unknown> = Promise.resolve();
  #currentKey: string | undefined;
  // The debt the home reported, as the version the paying inventory must be above, and the newest
  // `snapshot_version` stored this session among the inventories composed for their session.
  #owedAfter: number | undefined;
  #storedSnapshot: number | undefined;
  #cancelSilenceCheck: Cancel = () => undefined;

  constructor(options: EventManagerOptions) {
    if (!(options.homeOfflineAfterMs > 0)) {
      throw new RangeError("The offline threshold must be a positive time.");
    }
    this.#options = options;
    this.#leaseStartedAt = options.clock.now();
    this.#writer = new EventWriter({
      store: options.store,
      state: options.state,
      eventLog: options.eventLog,
      audit: options.audit,
      priorityPolicy: options.priorityPolicy,
      eventRules: options.eventRules,
    });
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
      this.#owedAfter = undefined;
      this.#storedSnapshot = undefined;
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
            {
              snapshot_version: inventory.snapshot_version,
              locations: inventory.locations,
              devices: inventory.devices,
            },
            signal,
          ),
      );
      if (inventory.session_id === session.session_id) {
        await this.#ownInventoryStored(inventory.snapshot_version, signal);
      }
      return applied;
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
    await this.#serially(signal, async () => {
      if (!this.#isCurrent(session)) {
        return;
      }
      const owedAfter = this.#unpaid(heartbeat.inventory_owed_after);
      const reading = {
        ring_session: heartbeat.ring_session,
        push: heartbeat.push,
        last_ring_event_at: heartbeat.last_ring_event_at,
        ...(heartbeat.event_backlog === undefined
          ? {}
          : { event_backlog: heartbeat.event_backlog }),
        outbox_depth: heartbeat.outbox_depth,
        inventory_owed: owedAfter !== undefined,
      };
      await this.#updateHealth(
        (health) => afterHeartbeat(health, reading, heartbeat.received_at),
        signal,
      );
      if (owedAfter !== undefined) {
        this.#owedAfter = Math.max(this.#owedAfter ?? owedAfter, owedAfter);
      }
    });
  }

  async event(
    event: IncomingEvent,
    session: HomeLinkSession,
    signal: AbortSignal,
  ): Promise<EventOutcome> {
    return this.#serially(signal, async (): Promise<EventOutcome> => {
      const applyState = this.#isCurrent(session);
      const written = await this.#guard(
        signal,
        "The event could not be committed.",
        () => this.#writer.write(event, applyState, signal),
      );
      if (written.kind !== "stored") {
        return written;
      }
      // Committed: a handler's failure is Pub/Sub's to report, and never undoes the write.
      this.#options.events.publish("event.stored", {
        event: written.event,
        epoch: written.epoch,
        action: written.action,
        shared: written.shared,
      });
      return {
        kind: "stored",
        seq: written.event.seq,
        needs_inventory:
          written.device === "unknown_device" ||
          written.device === "unknown_location",
      };
    });
  }

  async catchupDone(
    marker: string,
    session: HomeLinkSession,
    signal: AbortSignal,
  ): Promise<void> {
    await this.#serially(signal, async () => {
      if (!this.#isCurrent(session)) return;
      const summaries = await this.#guard(
        signal,
        "The recovery batch could not be closed.",
        () =>
          this.#options.store.transaction(async (sql) => {
            const result: EventStored[] = [];
            const batches = await this.#options.eventLog.finishRecovery(
              sql,
              marker,
              signal,
            );
            const now = this.#options.clock.now();
            for (const batch of batches) {
              const record: EventRecord = {
                event_id: randomUUID(),
                location_id: batch.location_id,
                kind: "bridge.events_recovered",
                priority: PRIORITY_ORDER[batch.rank_value] ?? "LOW",
                occurred_at: now,
                received_at: now,
                summary:
                  batch.total === 1
                    ? "1 event recovered."
                    : `${String(batch.total)} events recovered.`,
                late: false,
                data: {
                  recovered: {
                    count: batch.total,
                    oldest_at: formatUtc(batch.oldest),
                    newest_at: formatUtc(batch.newest),
                    seq_from: batch.seq_from,
                    seq_to: batch.seq_to,
                  },
                },
              };
              const written = await this.#systemEvent(
                sql,
                record,
                signal,
                batch.ownership,
              );
              if (written) result.push(written);
            }
            return result;
          }, signal),
      );
      for (const item of summaries)
        this.#options.events.publish("event.stored", item);
    });
  }

  async #systemEvent(
    sql: SqlSession,
    record: EventRecord,
    signal: AbortSignal,
    expectedOwnership?: "owned" | "shared",
  ): Promise<EventStored | undefined> {
    const location = await this.#options.state.locationIn(
      sql,
      record.location_id,
      signal,
    );
    if (
      !location ||
      (expectedOwnership && location.ownership !== expectedOwnership)
    )
      return undefined;
    const stored = await this.#options.eventLog.append(sql, record, signal);
    if (stored.kind === "duplicate") return undefined;
    await this.#options.audit.recordEventIngested(
      sql,
      {
        event_id: record.event_id,
        location_id: record.location_id,
        event_seq: stored.seq,
      },
      signal,
    );
    return {
      event: { ...record, seq: stored.seq, stored_at: stored.stored_at },
      epoch: stored.epoch,
      shared: location.ownership === "shared",
      action: "push",
    };
  }

  /** Cancels the silence check and lets the step already running finish. */
  async stop(): Promise<void> {
    this.#cancelSilenceCheck();
    this.#stopping.abort(new Error("The core is stopping."));
    await this.#steps.catch(() => undefined);
  }

  // Reads the health as of now, applies one change, saves it, and publishes a change of status.
  // Runs only on the queue. Every sign of life schedules the next silence check, from its own time.
  async #updateHealth(
    change: (health: HealthView | undefined) => HealthView,
    signal: AbortSignal,
  ): Promise<void> {
    const before = await this.#health(signal);
    const after = settled(
      change(before),
      this.#options.clock.now(),
      this.#policy,
    );
    await this.#saveHealth(before, after, signal);
    this.#scheduleSilenceCheck(after.as_of);
  }

  // The debt a heartbeat reports, unless an inventory this session already stored paid it.
  #unpaid(owedAfter: number | null): number | undefined {
    if (owedAfter === null) {
      return undefined;
    }
    return this.#storedSnapshot !== undefined &&
      this.#storedSnapshot > owedAfter
      ? undefined
      : owedAfter;
  }

  // The session's own inventory is stored. It ends the refresh owed unless the home reported a debt
  // it does not pay: an inventory composed before the change the home could not write.
  async #ownInventoryStored(
    snapshotVersion: number,
    signal: AbortSignal,
  ): Promise<void> {
    this.#storedSnapshot = Math.max(
      this.#storedSnapshot ?? snapshotVersion,
      snapshotVersion,
    );
    if (this.#owedAfter !== undefined && snapshotVersion <= this.#owedAfter) {
      return;
    }
    await this.#refreshed(signal);
    this.#owedAfter = undefined;
  }

  // The refresh owed ends. The stored view is changed as it is, so nothing `asOf` works out for now
  // is saved with it. Runs only on the queue.
  async #refreshed(signal: AbortSignal): Promise<void> {
    const stored = await this.#guard(
      signal,
      "The health could not be read.",
      () => this.#options.state.health(signal),
    );
    if (stored?.refresh_owed_since === undefined) {
      return;
    }
    await this.#guard(signal, "The health could not be saved.", () =>
      this.#options.state.saveHealth(afterRefresh(stored), signal),
    );
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
    const events = await this.#guard(
      signal,
      "The health could not be saved.",
      () =>
        this.#options.store.transaction(async (sql) => {
          const events: EventStored[] = [];
          if (
            before?.home_link_status === "down" &&
            after.home_link_status === "up"
          ) {
            // A returning heartbeat can beat the queued silence check.
            await this.#incident(
              sql,
              "home",
              "health.home_offline",
              before.home_link_since ?? before.as_of,
              events,
              signal,
            );
          }
          if (
            before &&
            before.ring_session_status !== after.ring_session_status
          ) {
            await this.#ringIncident(sql, before, after.as_of, events, signal);
          }
          await this.#ringIncident(sql, after, after.as_of, events, signal);
          if (after.home_link_status) {
            await this.#incident(
              sql,
              "home",
              after.home_link_status === "down"
                ? "health.home_offline"
                : undefined,
              after.home_link_since ?? after.as_of,
              events,
              signal,
            );
          }
          await this.#options.state.saveHealthIn(sql, after, signal);
          return events;
        }, signal),
    );
    for (const message of events)
      this.#options.events.publish("event.stored", message);
    const changed = healthChanges(before, after);
    if (changed.length > 0) {
      this.#options.events.publish("health.changed", {
        changed,
        health: after,
      });
    }
  }

  async #ringIncident(
    sql: SqlSession,
    view: HealthView,
    at: number,
    events: EventStored[],
    signal: AbortSignal,
  ): Promise<void> {
    const since = view.ring_session_since;
    if (since === undefined || !view.ring_session_status) return;
    if (
      view.ring_session_status === "unavailable" &&
      at - since <= RING_ALERT_DELAY_MS
    )
      return;
    const kind =
      view.ring_session_status === "unavailable"
        ? "health.ring_unavailable"
        : view.ring_session_status === "lost"
          ? "ring.session_lost"
          : undefined;
    await this.#incident(sql, "ring", kind, since, events, signal);
  }

  async #incident(
    sql: SqlSession,
    part: "home" | "ring",
    failure: string | undefined,
    since: number,
    events: EventStored[],
    signal: AbortSignal,
  ): Promise<void> {
    const locationId = await this.#options.state.incidentChange(
      sql,
      part,
      failure,
      since,
      signal,
    );
    if (locationId === undefined) return;
    const kind =
      failure ??
      (part === "home" ? "health.home_online" : "health.ring_restored");
    const now = this.#options.clock.now();
    const message = await this.#systemEvent(
      sql,
      {
        event_id: randomUUID(),
        location_id: locationId,
        kind,
        priority: "HIGH",
        occurred_at: since,
        received_at: now,
        summary: HEALTH_MESSAGES[kind] ?? kind,
        late: false,
      },
      signal,
    );
    if (message) events.push(message);
  }

  async maintenance(signal: AbortSignal): Promise<void> {
    await this.#serially(signal, async () => {
      const now = this.#options.clock.now();
      const stored = await this.#options.state.health(signal);
      const view = stored && asOf(stored, now, this.#policy);
      this.#options.reportMonitorSample?.(
        monitorSample(view, this.#leaseStartedAt, now),
      );
      if (stored && view) {
        if (healthChanges(stored, view).length)
          await this.#saveHealth(stored, view, signal);
        const updates = await this.#options.store.transaction(async (sql) => {
          const messages: EventStored[] = [];
          await this.#ringIncident(sql, view, now, messages, signal);
          return messages;
        }, signal);
        for (const message of updates)
          this.#options.events.publish("event.stored", message);
      }
      const cutoff = now - (this.#options.eventRetentionDays ?? 30) * DAY_MS;
      await this.#options.store.transaction(async (sql) => {
        await this.#options.eventLog.purgeBefore(sql, cutoff, signal);
        await this.#options.audit.purgeEventsBefore(sql, cutoff, signal);
      }, signal);
    });
  }

  #scheduleSilenceCheck(lastSignOfLife: number): void {
    this.#cancelSilenceCheck();
    const due = lastSignOfLife + this.#options.homeOfflineAfterMs;
    this.#cancelSilenceCheck = this.#options.clock.schedule(
      Math.max(0, due - this.#options.clock.now()),
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

  // The stores' failures become Event's own; an abort and anything else pass through unchanged.
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
      if (error instanceof QueryLayerError) {
        const kind = error.kind === "store_down" ? "unavailable" : "failed";
        throw new EventError(kind, message, { cause: error });
      }
      if (error instanceof EventLogError || error instanceof AuditError) {
        throw new EventError("failed", message, { cause: error });
      }
      throw error;
    }
  }
}
