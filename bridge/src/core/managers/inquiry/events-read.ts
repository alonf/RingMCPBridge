// `get_events`' use case (T052; FR-011, FR-013, FR-030): events after a cursor, filtered, in `seq`
// order, with a cursor for the next read. Inquiry's own file, so the manager stays readable.
//
// - **The cursor** is opaque to the agent: the location, the log's epoch and the `seq` read up to,
//   encoded. A cursor that does not decode, or names another location, or an epoch the log has not
//   reached, is `invalid_argument`; one from an older epoch starts the current epoch from its
//   beginning and says so (`epoch_changed`), never hiding it (PT-28).
// - **Never skips.** The next cursor moves past every event the read examined, matched or not, and
//   no further: a filter never makes a read repeat or skip an event. When the limit is reached
//   with events still unexamined, the cursor stops at the last one examined.
// - **No cursor**: the read starts after the client's last-read mark, which every read advances,
//   or from the start of the log on a client's first read. A client that needs at-least-once
//   keeps its own cursor from `next_cursor`.
// - **Owned locations only** (FR-036), as the other reads: a shared location is not found.
import { formatInTimeZone, formatUtc } from "../../../utilities/clock/index.ts";
import { MAX_EVENTS_PER_READ } from "../../access/event-log/index.ts";
import type { EventLog, StoredEvent } from "../../access/event-log/index.ts";
import type { CursorStore } from "../../access/subscriptions/index.ts";
import { PRIORITY_ORDER } from "../../engines/classify/index.ts";
import type { EventPriority } from "../../engines/classify/index.ts";
import type { SqlSession } from "../../../utilities/query-layer/index.ts";
import { InquiryError } from "./inquiry-error.ts";

/** What `get_events` asks for. */
export interface EventsRequest {
  readonly location_id?: string;
  readonly cursor?: string;
  readonly limit?: number;
  readonly min_priority?: EventPriority;
  readonly kind?: string;
  readonly device_id?: string;
}

/** An event as an agent reads it: the log's fields, the device's name, and local times. */
export interface InquiryEvent {
  readonly event_id: string;
  readonly seq: number;
  readonly location_id: string;
  readonly priority: EventPriority;
  readonly kind: string;
  readonly occurred_at: string;
  readonly occurred_at_local: string;
  readonly received_at: string;
  readonly received_at_local: string;
  readonly device?: {
    readonly id: string;
    readonly name: string;
    readonly room?: string;
  };
  readonly summary: string;
  readonly late?: true;
  readonly ring_kind?: string;
}

/** `get_events`' data. */
export interface EventsData {
  readonly events: readonly InquiryEvent[];
  readonly next_cursor: string;
  readonly has_more: boolean;
  readonly epoch_changed?: true;
}

/** The most events a reply holds, whatever the agent asks. */
export const MAX_EVENTS_PER_REPLY = 200;
/** How many a reply holds when the agent names no limit. */
export const DEFAULT_EVENTS_PER_REPLY = 50;

/** A device's name and room, from State. */
export type DeviceLabelOf = (
  deviceId: string,
) => Promise<{ readonly name: string; readonly room?: string } | undefined>;

/** What one read is made of. */
export interface EventsReadOptions {
  readonly events: EventLog;
  readonly cursors: CursorStore;
  readonly session: SqlSession;
  readonly locationId: string;
  readonly timeZone: string;
  /** The agent's client id; none for a local client in mode A, which then has no mark. */
  readonly clientId: string | undefined;
  readonly request: EventsRequest;
  readonly deviceLabel: DeviceLabelOf;
  readonly signal: AbortSignal;
}

interface Place {
  readonly epoch: number;
  readonly seq: number;
}

const VERSION = 1;

/** The opaque cursor for a place in a location's log. */
export function encodeCursor(locationId: string, place: Place): string {
  return Buffer.from(
    JSON.stringify({ v: VERSION, l: locationId, e: place.epoch, s: place.seq }),
    "utf8",
  ).toString("base64url");
}

/** What a cursor holds, or `undefined` when it is not one this bridge made. */
export function decodeCursor(
  cursor: string,
): { readonly location_id: string; readonly place: Place } | undefined {
  try {
    const raw: unknown = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    );
    if (typeof raw !== "object" || raw === null) {
      return undefined;
    }
    const { v, l, e, s } = raw as Record<string, unknown>;
    if (
      v !== VERSION ||
      typeof l !== "string" ||
      l === "" ||
      typeof e !== "number" ||
      typeof s !== "number" ||
      !Number.isSafeInteger(e) ||
      !Number.isSafeInteger(s) ||
      e < 1 ||
      s < 0
    ) {
      return undefined;
    }
    return { location_id: l, place: { epoch: e, seq: s } };
  } catch {
    return undefined;
  }
}

/** The location a cursor names, when the request carries a valid one. */
export function cursorLocation(request: EventsRequest): string | undefined {
  if (request.cursor === undefined) {
    return undefined;
  }
  const decoded = decodeCursor(request.cursor);
  if (decoded === undefined) {
    throw new InquiryError("invalid_argument", "The cursor is not valid.");
  }
  return decoded.location_id;
}

/** The events after a cursor in one owned location. */
export async function readEvents(
  options: EventsReadOptions,
): Promise<EventsData> {
  const { session, locationId, request, signal } = options;
  const current = await options.events.epoch(session, locationId, signal);
  const decoded =
    request.cursor === undefined ? undefined : decodeCursor(request.cursor);
  if (request.cursor !== undefined && decoded === undefined) {
    throw new InquiryError("invalid_argument", "The cursor is not valid.");
  }
  if (decoded !== undefined && decoded.location_id !== locationId) {
    throw new InquiryError(
      "invalid_argument",
      "The cursor belongs to another location.",
    );
  }
  const from =
    decoded?.place ??
    (options.clientId === undefined
      ? undefined
      : await options.cursors.mark(options.clientId, locationId, signal));
  if (from !== undefined && from.epoch > current) {
    throw new InquiryError(
      "invalid_argument",
      "The cursor is from a log this bridge does not hold.",
    );
  }
  const epochChanged = from !== undefined && from.epoch < current;
  const afterSeq = from === undefined || epochChanged ? 0 : from.seq;

  const limit = Math.min(
    request.limit ?? DEFAULT_EVENTS_PER_REPLY,
    MAX_EVENTS_PER_REPLY,
  );
  const rows = await options.events.after(
    session,
    { location_id: locationId, afterSeq, limit: MAX_EVENTS_PER_READ },
    signal,
  );
  const matched: StoredEvent[] = [];
  let examined = 0;
  let lastSeq = afterSeq;
  for (const row of rows) {
    if (matched.length === limit) {
      break;
    }
    examined += 1;
    lastSeq = row.seq;
    if (matches(row, request)) {
      matched.push(row);
    }
  }
  const hasMore = examined < rows.length || rows.length === MAX_EVENTS_PER_READ;
  const events = await Promise.all(
    matched.map((row) => toEvent(row, options.timeZone, options.deviceLabel)),
  );
  if (options.clientId !== undefined && (examined > 0 || epochChanged)) {
    await options.cursors.advance(
      options.clientId,
      locationId,
      { epoch: current, seq: lastSeq },
      signal,
    );
  }
  return {
    events,
    next_cursor: encodeCursor(locationId, { epoch: current, seq: lastSeq }),
    has_more: hasMore,
    ...(epochChanged ? { epoch_changed: true as const } : {}),
  };
}

function matches(row: StoredEvent, request: EventsRequest): boolean {
  // PRIORITY_ORDER runs from LOW up: an event below the asked priority does not match.
  if (
    request.min_priority !== undefined &&
    PRIORITY_ORDER.indexOf(row.priority) <
      PRIORITY_ORDER.indexOf(request.min_priority)
  ) {
    return false;
  }
  return (
    (request.kind === undefined || row.kind === request.kind) &&
    (request.device_id === undefined || row.device_id === request.device_id)
  );
}

async function toEvent(
  row: StoredEvent,
  timeZone: string,
  deviceLabel: DeviceLabelOf,
): Promise<InquiryEvent> {
  const label =
    row.device_id === undefined ? undefined : await deviceLabel(row.device_id);
  const ringKind = row.data?.ring_kind;
  return {
    event_id: row.event_id,
    seq: row.seq,
    location_id: row.location_id,
    priority: row.priority,
    kind: row.kind,
    occurred_at: formatUtc(row.occurred_at),
    occurred_at_local: formatInTimeZone(row.occurred_at, timeZone),
    received_at: formatUtc(row.received_at),
    received_at_local: formatInTimeZone(row.received_at, timeZone),
    ...(row.device_id === undefined || label === undefined
      ? {}
      : {
          device: {
            id: row.device_id,
            name: label.name,
            ...(label.room === undefined ? {} : { room: label.room }),
          },
        }),
    summary: row.summary,
    ...(row.late ? { late: true as const } : {}),
    ...(row.kind === "ring.other" && typeof ringKind === "string"
      ? { ring_kind: ringKind }
      : {}),
  };
}
