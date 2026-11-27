import { z } from "zod";

export const partnerNonce = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const partnerTime = z.string().regex(/^\d{13}$/);
const linkFields = { nonce: partnerNonce, time: partnerTime };
export const partnerOperation = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("begin"), ...linkFields }),
  z.strictObject({
    kind: z.literal("confirm"),
    ...linkFields,
    proof: partnerNonce,
  }),
  z.strictObject({
    kind: z.literal("token"),
    clientId: z.string().min(1).max(1024),
    code: z.string().min(1).max(4096),
  }),
  z.strictObject({
    kind: z.literal("webhook"),
    signature: z.string().regex(/^sha256=[a-f0-9]{64}$/),
    payload: z.base64().max(87384),
  }),
]);
export type PartnerOperation = z.infer<typeof partnerOperation>;
export const partnerRequest = z.strictObject({
  id: z.uuid(),
  operation: partnerOperation,
});
