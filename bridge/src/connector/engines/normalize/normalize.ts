// The Normalize engine (CP-08b, T042; FR-008, FR-033): Ring's push becomes the bridge's event.
// Pure: no I/O, no clock of its own. Ring's payload is untrusted, so it is read tolerantly: a field
// that is absent or of another type is left out, and what cannot be used is a typed failure, never
// a throw and never half an event.
//
// - **The event id** is Ring's id for the event (the ding's id, else the analytics' referring id)
//   and a one-letter code for what happened: `d` a doorbell press, `p` motion with a person, `m`
//   other motion, `i` an intercom ring, `o` anything else. Ring keeps one id for a doorbell's whole
//   visit, so its person alert and its press share it (DRIFT-002-17); the code keeps them apart,
//   while the same push sent twice still gives the same id and the core drops the repeat. A push
//   with no id of Ring's is refused: it could not be told apart from a repeat.
// - **The kind**: a doorbell press is `doorbell.ding`, camera motion is `motion`, an intercom ring
//   is `intercom.ding`, and a category the bridge does not know is `ring.other`, with Ring's name
//   for it kept as data.
// - **A person**: Ring's subtype or detection type `human`, or `loitering`. The core's Classify
//   engine reads only this flag, never Ring's own words.
// - **The time** is Ring's trigger time (seconds or milliseconds), else the ding's `created_at`,
//   else `eventito`'s time, else when the home received the push.
// - **Ring's text**: the device's name, and the summary built from it, are untrusted data. The
//   notification's body is never read.
// - **Ring's alarm format** is refused as unsupported: alarm sensors reach the bridge on the hub's
//   connection, not by push (research.md, T038 part 1).
import { z } from "zod";

/** One push, as the Ring Adapter hands it over with its device and location. */
export interface RingPushInput {
  /** The device the push is about, as State knows it (`String(camera.id)`). */
  readonly device_id: string;
  readonly location_id: string;
  /** Ring's payload: untrusted. */
  readonly payload: unknown;
}

/** The bridge's event, before Ingest stamps when the home received it. Times are epoch ms. */
export interface NormalizedEvent {
  readonly event_id: string;
  readonly location_id: string;
  readonly device_id: string;
  readonly kind: string;
  readonly occurred_at: number;
  /** The device's name as Ring gave it: untrusted text. */
  readonly name?: string;
  /** One line built from Ring's names: untrusted text. */
  readonly summary: string;
  /** Ring reported a person; present for motion only. */
  readonly person?: boolean;
  /** Kind-specific detail from Ring: untrusted. */
  readonly data?: Readonly<Record<string, unknown>>;
}

/** Why a push gives no event. */
export type NormalizeFailure =
  "unknown_format" | "unsupported_format" | "no_event_id";

/** An event, or why there is none. */
export type Normalized =
  | { readonly ok: true; readonly event: NormalizedEvent }
  | { readonly ok: false; readonly reason: NormalizeFailure };

/** The longest event id the core's log holds. */
export const MAX_RING_EVENT_ID_LENGTH = 128;
const KIND_CODE_LENGTH = 2;

/** What happened, as the event id's last letter. */
const KIND_CODES: Readonly<Record<string, string>> = {
  "doorbell.ding": "d",
  "intercom.ding": "i",
  motion: "m",
  "ring.other": "o",
};
const PERSON_CODE = "p";

const CATEGORY = {
  ding: "com.ring.pn.live-event.ding",
  motion: "com.ring.pn.live-event.motion",
  intercom: "com.ring.pn.live-event.intercom",
} as const;
const PERSON_DETECTIONS: ReadonlySet<string> = new Set(["human", "loitering"]);
// Ring's times are epoch numbers whose unit the types do not state. A value below this is taken as
// seconds: in milliseconds it would be a date in early 1973.
const SMALLEST_EPOCH_MS = 100_000_000_000;
const MS_PER_SECOND = 1000;

const text = z.string().min(1).optional().catch(undefined);
const epoch = z.number().positive().optional().catch(undefined);
const loose = <Shape extends z.ZodRawShape>(shape: Shape) =>
  z.object(shape).optional().catch(undefined);

const DING_V2 = z.object({
  android_config: z.object({ category: z.string() }),
  analytics: loose({ triggered_at: epoch, referring_item_id: text }),
  data: loose({
    device: loose({ name: text }),
    event: loose({
      ding: loose({
        id: text,
        created_at: text,
        subtype: text,
        detection_type: text,
      }),
      eventito: loose({ type: text, timestamp: epoch }),
    }),
  }),
});

const ALARM = z.object({
  data: z.object({ gcmData: z.object({ alarm_meta: z.unknown() }) }),
});

type DingV2 = z.infer<typeof DING_V2>;

function epochMs(value: number | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  return value < SMALLEST_EPOCH_MS ? value * MS_PER_SECOND : value;
}

function parsedTime(value: string | undefined): number | undefined {
  const parsed = value === undefined ? Number.NaN : Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function occurredAt(push: DingV2, receivedAtMs: number): number {
  const event = push.data?.event;
  return (
    epochMs(push.analytics?.triggered_at) ??
    parsedTime(event?.ding?.created_at) ??
    epochMs(event?.eventito?.timestamp) ??
    receivedAtMs
  );
}

function ringEventId(push: DingV2): string | undefined {
  const id = push.data?.event?.ding?.id ?? push.analytics?.referring_item_id;
  return id !== undefined &&
    id.length <= MAX_RING_EVENT_ID_LENGTH - KIND_CODE_LENGTH
    ? id
    : undefined;
}

function sawPerson(push: DingV2): boolean {
  const event = push.data?.event;
  return [
    event?.ding?.subtype,
    event?.ding?.detection_type,
    event?.eventito?.type,
  ].some((word) => word !== undefined && PERSON_DETECTIONS.has(word));
}

/** The kind, summary and kind-specific fields for one category. */
interface Described {
  readonly kind: string;
  readonly summary: string;
  readonly person?: boolean;
  readonly data?: Readonly<Record<string, unknown>>;
}

function described(push: DingV2, name: string | undefined): Described {
  const category = push.android_config.category;
  const at = name === undefined ? "" : ` ${name}`;
  switch (category) {
    case CATEGORY.ding:
      return {
        kind: "doorbell.ding",
        summary:
          name === undefined
            ? "A doorbell was pressed."
            : `The doorbell${at} was pressed.`,
      };
    case CATEGORY.intercom:
      return {
        kind: "intercom.ding",
        summary:
          name === undefined
            ? "An intercom was rung."
            : `The intercom${at} was rung.`,
      };
    case CATEGORY.motion:
      return motionDescribed(push, name);
    default:
      return {
        kind: "ring.other",
        summary:
          name === undefined
            ? "Ring reported an event."
            : `Ring reported an event at${at}.`,
        data: { ring_kind: category },
      };
  }
}

function motionDescribed(push: DingV2, name: string | undefined): Described {
  const person = sawPerson(push);
  const subtype = push.data?.event?.ding?.subtype;
  const where = name ?? "a camera";
  return {
    kind: "motion",
    person,
    summary: person ? `A person was seen by ${where}.` : `Motion at ${where}.`,
    ...(subtype === undefined ? {} : { data: { detection: subtype } }),
  };
}

/**
 * The bridge's event for one push, or why there is none. `receivedAtMs` is when the home
 * received it, the time used when Ring gives none. It never throws, whatever Ring sent.
 */
export function normalizePush(
  push: RingPushInput,
  receivedAtMs: number,
): Normalized {
  const ding = DING_V2.safeParse(push.payload);
  if (!ding.success) {
    const alarm = ALARM.safeParse(push.payload).success;
    return {
      ok: false,
      reason: alarm ? "unsupported_format" : "unknown_format",
    };
  }
  const eventId = ringEventId(ding.data);
  if (eventId === undefined) {
    return { ok: false, reason: "no_event_id" };
  }
  const name = ding.data.data?.device?.name;
  const what = described(ding.data, name);
  const code =
    what.person === true ? PERSON_CODE : (KIND_CODES[what.kind] ?? "o");
  return {
    ok: true,
    event: {
      event_id: `${eventId}-${code}`,
      location_id: push.location_id,
      device_id: push.device_id,
      occurred_at: occurredAt(ding.data, receivedAtMs),
      ...(name === undefined ? {} : { name }),
      ...what,
    },
  };
}
