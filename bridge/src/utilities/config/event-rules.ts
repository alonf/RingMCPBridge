// Per-household event choices. A kind-specific choice takes precedence over the source default.
import { z } from "zod";
const action = z.enum(["push", "store_only", "drop"]);
const fields = {
  location_id: z.string().min(1),
  kind: z.string().min(1).optional(),
  action,
};
const rule = z.union([
  z.strictObject({ ...fields, camera_id: z.string().min(1) }),
  z.strictObject({
    ...fields,
    sensor_type: z.enum([
      "contact",
      "motion",
      "flood",
      "keypad",
      "base_station",
      "light",
      "other",
    ]),
  }),
  z.strictObject({ ...fields, alarm: z.literal(true) }),
]);
export type EventRule = z.infer<typeof rule>;
export type EventAction = EventRule["action"] | "inherit";

export const eventRulesSetting = z
  .string()
  .transform((value, ctx): unknown => {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      ctx.addIssue({ code: "custom", message: "invalid JSON" });
      return z.NEVER;
    }
  })
  .pipe(
    z.array(rule).superRefine((rules, ctx) => {
      const seen = new Set<string>();
      for (const item of rules) {
        const key = JSON.stringify([
          item.location_id,
          ruleSource(item),
          item.kind,
        ]);
        if (seen.has(key))
          ctx.addIssue({ code: "custom", message: "duplicate event rule" });
        seen.add(key);
      }
    }),
  )
  .optional();

interface SourceEvent {
  readonly location_id: string;
  readonly device_id?: string;
  readonly device_type?: string;
  readonly kind: string;
}

function ruleSource(rule: EventRule): string {
  if ("camera_id" in rule) return "camera:" + rule.camera_id;
  if ("sensor_type" in rule) return "sensor:" + rule.sensor_type;
  return "alarm";
}

function eventSource(event: SourceEvent): string | undefined {
  if (event.kind === "mode.changed" || event.kind === "alarm.triggered")
    return "alarm";
  if (event.device_type === "doorbell" || event.device_type === "camera") {
    return event.device_id === undefined
      ? undefined
      : "camera:" + event.device_id;
  }
  if (event.device_type) return "sensor:" + event.device_type;
  // Older connector messages can identify a contact or flood sensor by kind. Motion alone
  // cannot distinguish a camera from a motion sensor.
  if (event.kind === "contact.open" || event.kind === "contact.closed")
    return "sensor:contact";
  if (event.kind === "flood") return "sensor:flood";
  return undefined;
}

export function eventAction(
  rules: readonly EventRule[] | undefined,
  ownership: "owned" | "shared",
  event: SourceEvent,
): EventAction {
  const source = eventSource(event);
  let fallback: EventAction = "inherit";
  if (ownership === "shared" && source !== "alarm") {
    fallback = source?.startsWith("sensor:") ? "store_only" : "drop";
  }
  for (const item of rules ?? []) {
    if (item.location_id !== event.location_id || ruleSource(item) !== source)
      continue;
    if (item.kind === event.kind) return item.action;
    if (item.kind === undefined) fallback = item.action;
  }
  return fallback;
}

export function cameraEventsEnabled(
  rules: readonly EventRule[] | undefined,
  ownership: "owned" | "shared",
  locationId: string,
  cameraId: string,
): boolean {
  const choices =
    rules?.filter(
      (item) =>
        item.location_id === locationId &&
        "camera_id" in item &&
        item.camera_id === cameraId,
    ) ?? [];
  return (
    choices.some((item) => item.action !== "drop") ||
    (ownership === "owned" && !choices.some((item) => item.kind === undefined))
  );
}
