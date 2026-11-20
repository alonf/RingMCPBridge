// What the Push Listener can say about a push without reading its content (CP-08b, T038): the kind,
// Ring's own subtype, Ring's event id and when Ring says it was triggered. Ring's payload is
// untrusted, so it is read tolerantly: a field that is absent or of another type is left out, and a
// payload in no known format is still sighted, as `unknown`. Mapping a push to the bridge's event
// is Normalize's work (T042), not this reader's.
import { z } from "zod";

/** What a push is about. `other` is a category the bridge does not know. */
export type PushKind = "ding" | "motion" | "intercom_ding" | "alarm" | "other";

/** The payload format: Ring's version 2 notification, its alarm notification, or neither. */
export type PushFormat = "ding_v2" | "alarm" | "unknown";

/** A push as sighted: identifiers, codes and times only. */
export interface PushSighting {
  readonly format: PushFormat;
  readonly kind: PushKind;
  /** Ring's subtype, such as `human`; absent when Ring gave none. */
  readonly subtype?: string;
  /** Ring's id for the event; absent when Ring gave none. */
  readonly ringEventId?: string;
  /** When Ring says the event was triggered, in epoch milliseconds; absent when Ring did not say. */
  readonly triggeredAtMs?: number;
}

const KIND_BY_CATEGORY: Readonly<Record<string, PushKind>> = {
  "com.ring.pn.live-event.ding": "ding",
  "com.ring.pn.live-event.motion": "motion",
  "com.ring.pn.live-event.intercom": "intercom_ding",
};

// Ring's times are epoch numbers whose unit the types do not state. A value below this is taken as
// seconds: in milliseconds it would be a date in early 1973.
const SMALLEST_EPOCH_MS = 100_000_000_000;
const MS_PER_SECOND = 1000;

const text = z.string().min(1).optional().catch(undefined);
const epoch = z.number().positive().optional().catch(undefined);

const DING_V2 = z.object({
  android_config: z.object({ category: z.string() }),
  analytics: z.object({ triggered_at: epoch }).optional().catch(undefined),
  data: z
    .object({
      event: z
        .object({
          ding: z
            .object({ id: text, subtype: text, created_at: text })
            .optional()
            .catch(undefined),
        })
        .optional()
        .catch(undefined),
    })
    .optional()
    .catch(undefined),
});

const ALARM = z.object({
  data: z.object({ gcmData: z.object({ alarm_meta: z.unknown() }) }),
});

function epochMs(value: number | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  return value < SMALLEST_EPOCH_MS ? value * MS_PER_SECOND : value;
}

function createdAtMs(createdAt: string | undefined): number | undefined {
  const parsed = createdAt === undefined ? Number.NaN : Date.parse(createdAt);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function sightDing(push: z.infer<typeof DING_V2>): PushSighting {
  const ding = push.data?.event?.ding;
  const triggeredAtMs =
    epochMs(push.analytics?.triggered_at) ?? createdAtMs(ding?.created_at);
  return {
    format: "ding_v2",
    kind: KIND_BY_CATEGORY[push.android_config.category] ?? "other",
    ...(ding?.subtype === undefined ? {} : { subtype: ding.subtype }),
    ...(ding?.id === undefined ? {} : { ringEventId: ding.id }),
    ...(triggeredAtMs === undefined ? {} : { triggeredAtMs }),
  };
}

/** Sights one push payload. It never throws, whatever Ring sent. */
export function sightPush(payload: unknown): PushSighting {
  const ding = DING_V2.safeParse(payload);
  if (ding.success) {
    return sightDing(ding.data);
  }
  if (ALARM.safeParse(payload).success) {
    return { format: "alarm", kind: "alarm" };
  }
  return { format: "unknown", kind: "other" };
}
