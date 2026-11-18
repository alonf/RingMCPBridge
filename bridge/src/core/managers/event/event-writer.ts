// The event path's one transaction (CP-11b, T047; FR-008, FR-009, FR-013, PT-23, PT-25, DS4):
// for one event from the home, Classify, then the Event Log, State and the Audit, committed
// together or not at all.
//
// - **Classify** reads what it needs inside the same transaction: whether the event's location is
//   armed (`home` or `away`; a location State does not hold is not armed), and the device's type
//   (from the event's own device entry, else from State). The priority and the late flag come
//   from the policy only.
// - **Dedup.** An event the log already holds is a duplicate: nothing is written again.
// - **State** takes the event's device entry latest-wins, as a `device_state` message does. An
//   older entry, or one for a device or location State does not hold, leaves State as it is: the
//   event is still written, because an event is a fact, not versioned state.
// - **The work may run twice.** The Query layer retries a transaction once after a passing
//   failure, so the work changes nothing outside the transaction: it only returns what it wrote.
//   The caller publishes after the commit.
// - **Refused.** An id or kind longer than its column can never be stored. Such an event is
//   reported as refused, so it is acked and logged instead of being sent again forever.
import type { Audit } from "../../access/audit/index.ts";
import type {
  EventLog,
  EventRecord,
  StoredEvent,
} from "../../access/event-log/index.ts";
import type { DeviceApplied, StateStore } from "../../access/state/index.ts";
import { isLate, priorityOf } from "../../engines/classify/index.ts";
import type { PriorityPolicy } from "../../engines/classify/index.ts";
import type { SqlSession } from "../../../utilities/query-layer/index.ts";
import type { IncomingEvent } from "./event-intake.ts";

/** The longest id the log's columns hold. */
export const MAX_EVENT_ID_LENGTH = 128;
/** The longest kind the log's column holds. */
export const MAX_EVENT_KIND_LENGTH = 64;

const ARMED_MODES: ReadonlySet<string> = new Set(["home", "away"]);

/** Runs work in one transaction: the Query layer in the core. */
export interface EventTransactions {
  transaction<T>(
    work: (session: SqlSession) => Promise<T>,
    signal: AbortSignal,
  ): Promise<T>;
}

/** What the event path is made over. */
export interface EventWriterOptions {
  readonly store: EventTransactions;
  readonly state: StateStore;
  readonly eventLog: EventLog;
  readonly audit: Audit;
  readonly priorityPolicy: PriorityPolicy;
}

/** What one event's transaction did. */
export type EventWritten =
  | {
      readonly kind: "stored";
      readonly event: StoredEvent;
      readonly epoch: number;
      /** What State made of the event's device entry; absent when it had none or was not applied. */
      readonly device?: DeviceApplied;
    }
  | { readonly kind: "duplicate" }
  | { readonly kind: "refused" };

function fits(event: IncomingEvent): boolean {
  const ids = [event.event_id, event.location_id, event.device_id ?? ""];
  return (
    ids.every((id) => id.length <= MAX_EVENT_ID_LENGTH) &&
    event.kind.length <= MAX_EVENT_KIND_LENGTH
  );
}

/** The event path's transaction. One per core process. */
export class EventWriter {
  readonly #options: EventWriterOptions;

  constructor(options: EventWriterOptions) {
    this.#options = options;
  }

  /**
   * Writes one event in one transaction. `applyState` is false for a session whose key is no
   * longer the current one: its event is still written, but State's versions are not its own.
   */
  async write(
    event: IncomingEvent,
    applyState: boolean,
    signal: AbortSignal,
  ): Promise<EventWritten> {
    if (!fits(event)) {
      return { kind: "refused" };
    }
    return this.#options.store.transaction(
      (session) => this.#writeIn(session, event, applyState, signal),
      signal,
    );
  }

  async #writeIn(
    session: SqlSession,
    event: IncomingEvent,
    applyState: boolean,
    signal: AbortSignal,
  ): Promise<EventWritten> {
    const record = await this.#classified(session, event, signal);
    const appended = await this.#options.eventLog.append(
      session,
      record,
      signal,
    );
    if (appended.kind === "duplicate") {
      return { kind: "duplicate" };
    }
    const entry = event.device_state;
    const device =
      entry === undefined || !applyState
        ? undefined
        : await this.#options.state.applyDeviceIn(session, entry, signal);
    await this.#options.audit.recordEventIngested(
      session,
      {
        event_id: record.event_id,
        location_id: record.location_id,
        event_seq: appended.seq,
      },
      signal,
    );
    return {
      kind: "stored",
      event: { ...record, seq: appended.seq, stored_at: appended.stored_at },
      epoch: appended.epoch,
      ...(device === undefined ? {} : { device }),
    };
  }

  // The event as the log holds it, with its priority and late flag from the policy.
  async #classified(
    session: SqlSession,
    event: IncomingEvent,
    signal: AbortSignal,
  ): Promise<EventRecord> {
    const { state, priorityPolicy } = this.#options;
    const location = await state.locationIn(session, event.location_id, signal);
    const deviceType =
      event.device_state?.type ??
      (event.device_id === undefined
        ? undefined
        : (await state.deviceIn(session, event.device_id, signal))?.type);
    const priority = priorityOf(priorityPolicy, {
      kind: event.kind,
      armed: ARMED_MODES.has(location?.alarm_mode ?? ""),
      ...(deviceType === undefined ? {} : { deviceType }),
      ...(event.person === undefined ? {} : { person: event.person }),
    });
    const late = isLate(priorityPolicy, {
      receivedAtMs: event.received_at,
      arrivedAtMs: event.arrived_at,
      fromHistory: event.from_history,
    });
    return {
      event_id: event.event_id,
      location_id: event.location_id,
      kind: event.kind,
      priority,
      occurred_at: event.occurred_at,
      received_at: event.received_at,
      summary: event.summary,
      late,
      ...(event.device_id === undefined ? {} : { device_id: event.device_id }),
      ...(event.data === undefined ? {} : { data: event.data }),
    };
  }
}
