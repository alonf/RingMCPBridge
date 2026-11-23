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
  ),
} satisfies ToolContract;
