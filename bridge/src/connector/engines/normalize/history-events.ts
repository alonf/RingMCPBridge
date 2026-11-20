// History events (T053; FR-013, FR-042): a camera's history entry becomes the event its push would
// have been. Pure; Ingest calls it for each entry a catch-up read finds.
//
// - **The same id as the push.** Ring's id for the event, then the kind letter the push uses, so an
//   event that arrives by push and again by catch-up is one event: the outbox and the core both drop
//   the repeat. A person is `-p`, a plain motion `-m`, a ding `-d`, anything else `-o`.
// - **From history**: the event says so (`from_history`), which makes it late: it is stored and
//   readable, never pushed one by one.
// - Ring's names are untrusted text, kept as written, as in `normalizePush`.
import type { NormalizedEvent } from "./normalize.ts";
import { MAX_RING_EVENT_ID_LENGTH } from "./normalize.ts";

/** What a history entry carries; the Ring Adapter's `RingHistoryEntry`, plus the camera's name. */
export interface HistoryInput {
  readonly device_id: string;
  readonly location_id: string;
  readonly device_type: "doorbell" | "camera";
  readonly ring_event_id: string;
  readonly kind: "motion" | "ding" | "other";
  readonly person: boolean;
  readonly occurred_at: number;
  /** The camera's name, untrusted text; absent when Ring gave none. */
  readonly name?: string;
}

const KIND_CODE_LENGTH = 2;

/** The event for a history entry, or `undefined` when its id cannot fit the log's. */
export function historyEvent(entry: HistoryInput): NormalizedEvent | undefined {
  if (
    entry.ring_event_id.length >
    MAX_RING_EVENT_ID_LENGTH - KIND_CODE_LENGTH
  ) {
    return undefined;
  }
  const where = entry.name ?? "a camera";
  const base = {
    location_id: entry.location_id,
    device_id: entry.device_id,
    device_type: entry.device_type,
    occurred_at: entry.occurred_at,
    ...(entry.name === undefined ? {} : { name: entry.name }),
  };
  if (entry.kind === "ding") {
    return {
      ...base,
      event_id: `${entry.ring_event_id}-d`,
      kind: "doorbell.ding",
      summary:
        entry.name === undefined
          ? "A doorbell was pressed."
          : `The doorbell ${entry.name} was pressed.`,
    };
  }
  if (entry.kind === "motion") {
    return entry.person
      ? {
          ...base,
          event_id: `${entry.ring_event_id}-p`,
          kind: "motion",
          person: true,
          summary: `A person was seen by ${where}.`,
        }
      : {
          ...base,
          event_id: `${entry.ring_event_id}-m`,
          kind: "motion",
          summary: `Motion at ${where}.`,
        };
  }
  return {
    ...base,
    event_id: `${entry.ring_event_id}-o`,
    kind: "ring.other",
    summary:
      entry.name === undefined
        ? "Ring reported an event."
        : `Ring reported an event at ${entry.name}.`,
  };
}
