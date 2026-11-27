import { z } from "zod";
import { replyEnvelope } from "./envelopes.ts";
import { toolDescription } from "./untrusted.ts";
import type { ToolContract } from "./tool-contract.ts";

const id = z.string().min(1).max(256);
const input = z.strictObject({
  location_id: id.describe("Source household identifier."),
  device_id: id.describe("Source camera identifier."),
  event_id: id.describe("Exact recorded event identifier."),
  receiver_id: z
    .string()
    .min(1)
    .max(400)
    .describe("Approved registered service identifier."),
  kind: z.enum(["photo", "clip"]).describe("Requested event representation."),
});
export const shareEventMediaTool = {
  name: "share_event_media",
  scope: "media",
  description: toolDescription(
    "Share one event photo or clip with a camera-approved service. The receiver needs its own bridge credential. Retry a pending item using the same event.",
  ),
  input,
  reply: replyEnvelope(
    z.discriminatedUnion("status", [
      z.object({
        status: z.literal("pending"),
        location_id: id,
        device_id: id,
        event_id: id,
      }),
      z.object({
        status: z.literal("ready"),
        location_id: id,
        device_id: id,
        event_id: id,
        item_id: id,
        source: z.literal("event"),
        captured_at: z.iso.datetime(),
        expires_at: z.iso.datetime(),
        uri: z.url(),
        mime_type: z.enum(["image/jpeg", "video/mp4"]),
      }),
    ]),
    "The event media handoff reply.",
  )
    .safeExtend({
      retry_after_s: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(
          "For a pending item, wait this many seconds before requesting the same event again.",
        ),
    })
    .describe("The event media handoff reply."),
} satisfies ToolContract;

/** Tests the signed-in receiver's camera permission without reading any event. */
export const testMediaImageTool = {
  name: "test_media_image",
  scope: "media",
  description: toolDescription(
    "Return a synthetic JPEG to test the signed-in service's camera permission and inline image delivery. This reads no camera footage.",
  ),
  input: input.pick({ location_id: true, device_id: true }),
  reply: replyEnvelope(
    z.object({ source: z.literal("synthetic") }),
    "Synthetic receiver image test.",
  ),
} satisfies ToolContract;
