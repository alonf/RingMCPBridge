// The Event Log (CP-11b, T046; FR-008, FR-011): the durable log of events, in order per location.
//
// - **The caller's transaction.** Every operation takes the session of a transaction the caller
//   opened (the Event manager's one transaction per event) and opens none of its own. The Query
//   layer's errors pass through unchanged, so the transaction's owner sees them and its one retry
//   still works.
// - **Order.** An event's `seq` is its position in its location's log, from that location's
//   counter in `log_meta`. The counter moves in the same transaction as the event's row, so a
//   rolled-back write leaves no gap and a `seq` is never reused.
// - **Dedup.** `event_id` is unique. An event already in the log is reported as a duplicate, with
//   the `seq` it has, and nothing is written.
// - **The epoch** names one life of a location's log. It starts at 1 and changes only when the
//   log is emptied (delete now, iteration 004), so a cursor from before is recognised.
// - Text from Ring (`summary`, `data`) is stored as given and never logged (FR-033, FR-034).
import { z } from "zod";
import type { Clock } from "../../../utilities/clock/index.ts";
import {
  keysetPageStatement,
  upsertStatement,
} from "../../../utilities/query-layer/index.ts";
import type {
  SqlRow,
  SqlSession,
} from "../../../utilities/query-layer/index.ts";

/** The first epoch of a location's log. */
export const FIRST_LOG_EPOCH = 1;
/** The most events one read returns. */
export const MAX_EVENTS_PER_READ = 500;
/** The longest summary the log keeps, in UTF-16 units (its SQL Server column); a longer one is cut. */
export const MAX_SUMMARY_LENGTH = 1000;

const PRIORITIES = ["HIGH", "MEDIUM", "LOW"] as const;
const EVENT_COLUMNS = [
  "location_id",
  "seq",
  "event_id",
  "kind",
  "priority",
  "occurred_at",
  "received_at",
  "stored_at",
  "device_id",
  "summary",
  "late",
  "data",
] as const;

/** An event as the Event manager hands it to the log. Times are epoch milliseconds. */
export interface EventRecord {
  readonly event_id: string;
  readonly location_id: string;
  readonly kind: string;
  readonly priority: (typeof PRIORITIES)[number];
  /** When it happened, by Ring's time. */
  readonly occurred_at: number;
  /** When the home received it. */
  readonly received_at: number;
  readonly device_id?: string;
  /** One line built from Ring's names: untrusted text. */
  readonly summary: string;
  readonly late: boolean;
  /** Kind-specific detail, such as Ring's own kind name: untrusted. */
  readonly data?: Readonly<Record<string, unknown>>;
}

/** An event as the log holds it. */
export interface StoredEvent extends EventRecord {
  readonly seq: number;
  /** When the core stored it, on the core's clock. */
  readonly stored_at: number;
}

/** What `append` did. */
export type AppendOutcome =
  | {
      readonly kind: "appended";
      readonly seq: number;
      readonly epoch: number;
      readonly stored_at: number;
    }
  /** The event was already in the log, at this place; nothing was written. */
  | {
      readonly kind: "duplicate";
      readonly location_id: string;
      readonly seq: number;
    };

/** What the Event Log is made over. */
export interface EventLogOptions {
  readonly clock: Clock;
}

const PLACE_ROW = z.object({ location_id: z.string(), seq: z.number().int() });
const COUNTER_ROW = z.object({
  epoch: z.number().int(),
  next_seq: z.number().int(),
});
const EVENT_ROW = z.object({
  location_id: z.string(),
  seq: z.number().int(),
  event_id: z.string(),
  kind: z.string(),
  priority: z.enum(PRIORITIES),
  occurred_at: z.number().int(),
  received_at: z.number().int(),
  stored_at: z.number().int(),
  device_id: z.string().nullable(),
  summary: z.string(),
  // SQL Server's driver gives a BIT as a boolean or as 0 or 1.
  late: z.union([z.boolean(), z.number()]),
  data: z.string().nullable(),
});
const DATA = z.record(z.string(), z.unknown());

const SELECT_PLACE =
  "SELECT location_id, seq FROM event WHERE event_id = @event_id";
const MOVE_COUNTER =
  "UPDATE log_meta SET next_seq = next_seq + 1 WHERE location_id = @location_id";
const SELECT_COUNTER =
  "SELECT epoch, next_seq FROM log_meta WHERE location_id = @location_id";
const INSERT_EVENT = `INSERT INTO event (${EVENT_COLUMNS.join(", ")}) VALUES (${EVENT_COLUMNS.map(
  (column) => `@${column}`,
).join(", ")})`;

/** The log holds a row this accessor did not write. The message names the table, never a value. */
export class EventLogError extends Error {
  constructor(table: string) {
    super(`The Event Log cannot read a row of ${table}.`);
    this.name = "EventLogError";
  }
}

function parsed<Row>(schema: z.ZodType<Row>, row: SqlRow, table: string): Row {
  const result = schema.safeParse(row);
  if (!result.success) {
    throw new EventLogError(table);
  }
  return result.data;
}

function storedEvent(row: SqlRow): StoredEvent {
  const event = parsed(EVENT_ROW, row, "event");
  const data =
    event.data === null
      ? undefined
      : parsed(DATA, JSON.parse(event.data) as SqlRow, "event");
  return {
    event_id: event.event_id,
    location_id: event.location_id,
    seq: event.seq,
    kind: event.kind,
    priority: event.priority,
    occurred_at: event.occurred_at,
    received_at: event.received_at,
    stored_at: event.stored_at,
    summary: event.summary,
    late: event.late === true || event.late === 1,
    ...(event.device_id === null ? {} : { device_id: event.device_id }),
    ...(data === undefined ? {} : { data }),
  };
}

// A summary cut to the column's size, never in the middle of a character.
function fittedSummary(summary: string): string {
  if (summary.length <= MAX_SUMMARY_LENGTH) {
    return summary;
  }
  let fitted = "";
  for (const character of summary) {
    if (fitted.length + character.length > MAX_SUMMARY_LENGTH) {
      break;
    }
    fitted += character;
  }
  return fitted;
}

/** The Event Log. One per core process; it holds no connection of its own. */
export class EventLog {
  readonly #clock: Clock;

  constructor(options: EventLogOptions) {
    this.#clock = options.clock;
  }

  /**
   * Writes `event` at the end of its location's log, inside the caller's transaction, or reports
   * that it is already there.
   */
  async append(
    session: SqlSession,
    event: EventRecord,
    signal: AbortSignal,
  ): Promise<AppendOutcome> {
    const held = await session.get(
      { sql: SELECT_PLACE, params: { event_id: event.event_id } },
      signal,
    );
    if (held !== undefined) {
      return { kind: "duplicate", ...parsed(PLACE_ROW, held, "event") };
    }
    const { seq, epoch } = await this.#nextPlace(
      session,
      event.location_id,
      signal,
    );
    const storedAt = this.#clock.now();
    await session.run(
      {
        sql: INSERT_EVENT,
        params: {
          location_id: event.location_id,
          seq,
          event_id: event.event_id,
          kind: event.kind,
          priority: event.priority,
          occurred_at: event.occurred_at,
          received_at: event.received_at,
          stored_at: storedAt,
          device_id: event.device_id ?? null,
          summary: fittedSummary(event.summary),
          late: event.late ? 1 : 0,
          data: event.data === undefined ? null : JSON.stringify(event.data),
        },
      },
      signal,
    );
    return { kind: "appended", seq, epoch, stored_at: storedAt };
  }

  /**
   * The events of one location after `afterSeq`, in order, at most `limit` of them (and never
   * more than `MAX_EVENTS_PER_READ`). 0 reads from the start of the log.
   */
  async after(
    session: SqlSession,
    query: {
      readonly location_id: string;
      readonly afterSeq: number;
      readonly limit: number;
    },
    signal: AbortSignal,
  ): Promise<readonly StoredEvent[]> {
    const rows = await session.all(
      keysetPageStatement(session.dialect, {
        table: "event",
        columns: EVENT_COLUMNS,
        key: "seq",
        after: query.afterSeq,
        limit: Math.min(query.limit, MAX_EVENTS_PER_READ),
        where: {
          sql: "location_id = @location_id",
          params: { location_id: query.location_id },
        },
      }),
      signal,
    );
    return rows.map(storedEvent);
  }

  /**
   * The log's current epoch for the location: the first one before any event is stored. A reader's
   * cursor from an earlier epoch is told so, never silently served (PT-28).
   */
  async epoch(
    session: SqlSession,
    locationId: string,
    signal: AbortSignal,
  ): Promise<number> {
    const row = await session.get(
      { sql: SELECT_COUNTER, params: { location_id: locationId } },
      signal,
    );
    return row === undefined
      ? FIRST_LOG_EPOCH
      : parsed(COUNTER_ROW, row, "log_meta").epoch;
  }

  // Takes the location's next `seq`. The counter's row is made on the location's first event;
  // the update then locks it until the caller's transaction ends.
  async #nextPlace(
    session: SqlSession,
    locationId: string,
    signal: AbortSignal,
  ): Promise<{ seq: number; epoch: number }> {
    await session.run(
      upsertStatement(session.dialect, {
        table: "log_meta",
        key: ["location_id"],
        values: {
          location_id: locationId,
          epoch: FIRST_LOG_EPOCH,
          next_seq: 1,
        },
        onConflict: "ignore",
      }),
      signal,
    );
    const params = { location_id: locationId };
    await session.run({ sql: MOVE_COUNTER, params }, signal);
    const row = await session.get({ sql: SELECT_COUNTER, params }, signal);
    if (row === undefined) {
      throw new EventLogError("log_meta");
    }
    const counter = parsed(COUNTER_ROW, row, "log_meta");
    return { seq: counter.next_seq - 1, epoch: counter.epoch };
  }
}
