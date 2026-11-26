import { z } from "zod";

const id = z.string().min(1).max(1024);
export class RecordingWatchError extends Error {}
const cameraCallback = z.object({
  meta: z.object({ version: z.literal("1.1"), account_id: id, request_id: id }),
  data: z.object({
    id,
    type: z.enum(["motion_detected", "button_press"]),
    attributes: z.object({
      source_type: z.literal("devices"),
      source: id,
      timestamp: z.number().int().nonnegative(),
      sub_type: z.string().min(1).max(128).optional(),
      component_ids: z.array(id).max(16).optional(),
    }),
  }),
});

/** Parse only recording notifications after the HTTP handler verifies their signature. */
export function recordingCallback(payload: unknown) {
  const parsed = cameraCallback.safeParse(payload);
  if (!parsed.success) return undefined;
  const { meta, data } = parsed.data;
  return {
    account: meta.account_id,
    deviceId: data.attributes.source,
    eventId: data.id,
    kind:
      data.type === "button_press" ? ("ding" as const) : ("motion" as const),
    time: data.attributes.timestamp,
    components: data.attributes.component_ids ?? [],
    ...(data.type === "motion_detected" &&
      data.attributes.sub_type && { subType: data.attributes.sub_type }),
  };
}
export type RecordingCallback = NonNullable<
  ReturnType<typeof recordingCallback>
>;
