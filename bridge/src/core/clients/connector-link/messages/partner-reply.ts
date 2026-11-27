import { z } from "zod";
export const partnerResult = z.strictObject({
  status: z.union([
    z.literal(200),
    z.literal(303),
    z.literal(400),
    z.literal(401),
    z.literal(403),
    z.literal(409),
    z.literal(413),
    z.literal(415),
    z.literal(502),
    z.literal(503),
  ]),
  accountLabel: z.string().min(1).max(320).optional(),
});
export type PartnerResult = z.infer<typeof partnerResult>;
export const partnerReply = z.strictObject({
  id: z.uuid(),
  result: partnerResult,
});
