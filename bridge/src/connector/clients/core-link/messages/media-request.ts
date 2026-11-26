import { z } from "zod";

const id = z.string().min(1).max(256);
export const mediaRequest = z.strictObject({
  requestId: z.uuid(),
  householdId: id,
  cameraId: id,
  eventId: id,
  kind: z.enum(["frame", "clip"]),
  hasSound: z.boolean(),
});
export type MediaRequest = z.infer<typeof mediaRequest>;
export const mediaCancel = mediaRequest.pick({ requestId: true });
