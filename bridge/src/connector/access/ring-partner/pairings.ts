import { z } from "zod";

const ringId = z.string().min(1).max(1024);
const bridgeId = z.string().min(1).max(128);
const cameraPair = z.strictObject({
  accountId: ringId,
  ringHouseholdId: ringId,
  ringDeviceId: ringId,
  locationId: bridgeId,
  deviceId: bridgeId,
  activeFrom: z.iso.datetime(),
});
export type CameraPair = z.infer<typeof cameraPair>;
export const partnerConfig = z.strictObject({
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  signingKey: z.string().min(1),
  host: z.enum(["127.0.0.1", "0.0.0.0"]).default("127.0.0.1"),
  port: z.int().min(1).max(65535).default(43821),
  pairs: z
    .array(cameraPair)
    .min(1)
    .superRefine((pairs, ctx) => {
      const sources = new Set<string>(),
        targets = new Set<string>();
      for (const pair of pairs) {
        const source = JSON.stringify([pair.accountId, pair.ringDeviceId]);
        if (sources.has(source) || targets.has(pair.deviceId))
          ctx.addIssue({
            code: "custom",
            message: "Each camera can be paired once.",
          });
        sources.add(source);
        targets.add(pair.deviceId);
      }
    }),
});
