import { z } from "zod";

export const MEDIA_CHUNK_BYTES = 32 * 1024;
export const mediaCapable = z.strictObject({});
export const mediaHeader = z.strictObject({
  requestId: z.uuid(),
  offset: z.int().nonnegative(),
});
export const mediaReply = z.discriminatedUnion("status", [
  z.strictObject({
    requestId: z.uuid(),
    status: z.literal("start"),
    capturedAt: z.int().nonnegative(),
    length: z.int().positive(),
  }),
  z.strictObject({
    requestId: z.uuid(),
    status: z.enum(["pending", "missing", "failed", "complete"]),
  }),
]);
