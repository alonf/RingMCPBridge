import type { McpServer } from "@modelcontextprotocol/server";
import {
  shareEventMediaTool,
  testMediaImageTool,
} from "../../../contract/index.ts";
import { formatInTimeZone, formatUtc } from "../../../utilities/clock/index.ts";
import type { Clock } from "../../../utilities/clock/index.ts";
import { MediaDenied } from "../../managers/media/index.ts";
import type { MediaHandoff } from "../../managers/media/index.ts";
import { listedOnly } from "./listed-input.ts";
import type { Logger } from "../../../utilities/logging/index.ts";
import type { ReadLimit } from "./read-limit.ts";
import { errorResult } from "./read-tools.ts";

export function registerMediaTool(
  server: McpServer,
  media: MediaHandoff,
  clientId: string,
  limits: Record<"photo" | "clip" | "requests", ReadLimit>,
  logger: Logger,
  clock: Clock,
) {
  const tool = shareEventMediaTool;
  server.registerTool(
    tool.name,
    {
      description: tool.description,
      inputSchema: listedOnly(tool.input),
      outputSchema: tool.reply,
      annotations: { readOnlyHint: false, openWorldHint: false },
    },
    async (raw, ctx) => {
      const input = tool.input.safeParse(raw);
      if (!input.success)
        return errorResult(
          {
            code: "INVALID_ARGUMENT",
            message: "Invalid event media arguments.",
            retryable: false,
          },
          clock,
        );
      const request = limits.requests.take(clientId);
      const allowance = request.allowed
        ? limits[input.data.kind].reserve(clientId)
        : request;
      if (!allowance.allowed)
        return errorResult(
          {
            code: "RATE_LIMITED",
            message: "Media request limit reached.",
            retryable: true,
            retry_after_s: allowance.retryAfterS,
          },
          clock,
        );
      const signal = AbortSignal.any([
        ctx.mcpReq.signal,
        AbortSignal.timeout(60_000),
      ]);
      const transfer = { started: false };
      try {
        const result = await media.share(input.data, clientId, signal, () => {
          transfer.started = true;
        });
        if (!result)
          return errorResult(
            {
              code: "NOT_FOUND",
              message: "No media matched this event and camera.",
              retryable: false,
            },
            clock,
          );
        if (result.data.status === "pending") allowance.release();
        const now = clock.now();
        const reply = tool.reply.parse({
          data: result.data,
          ...(result.data.status === "pending" && { retry_after_s: 10 }),
          as_of: formatUtc(now),
          as_of_local: formatInTimeZone(now, result.zone),
          freshness: "live",
        });
        return {
          structuredContent: reply,
          content: [
            { type: "text" as const, text: JSON.stringify(reply) },
            ...("image" in result && result.image
              ? [
                  {
                    type: "image" as const,
                    mimeType: "image/jpeg",
                    data: result.image.toString("base64"),
                  },
                ]
              : []),
            ...(result.data.status === "ready"
              ? [
                  {
                    type: "resource_link" as const,
                    name: "Event " + input.data.kind,
                    uri: result.data.uri,
                    mimeType: result.data.mime_type,
                  },
                ]
              : []),
          ],
        };
      } catch (error) {
        if (error instanceof MediaDenied)
          return errorResult(
            {
              code: "ACTION_DISABLED",
              message: "This media handoff is not approved.",
              retryable: false,
            },
            clock,
          );
        // Once staging begins the core may finish the transfer after the caller leaves.
        if (!transfer.started || !signal.aborted) allowance.release();
        logger.error(
          "media_share_failed",
          {
            client_id: clientId,
            event_id: input.data.event_id,
            device_id: input.data.device_id,
            location_id: input.data.location_id,
          },
          error,
        );
        return errorResult(
          {
            code: "BRIDGE_UNAVAILABLE",
            message: "The bridge could not prepare this event media.",
            retryable: true,
          },
          clock,
        );
      }
    },
  );
  server.registerTool(
    testMediaImageTool.name,
    {
      description: testMediaImageTool.description,
      inputSchema: listedOnly(testMediaImageTool.input),
      outputSchema: testMediaImageTool.reply,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (raw, ctx) => {
      const args = testMediaImageTool.input.safeParse(raw);
      if (!args.success)
        return errorResult(
          {
            code: "INVALID_ARGUMENT",
            message: "Choose a household and camera.",
            retryable: false,
          },
          clock,
        );
      const allowance = limits.requests.take(clientId);
      if (!allowance.allowed)
        return errorResult(
          {
            code: "RATE_LIMITED",
            message: "Media request limit reached.",
            retryable: true,
            retry_after_s: allowance.retryAfterS,
          },
          clock,
        );
      try {
        const { image, zone } = await media.testImage(
          args.data.location_id,
          args.data.device_id,
          clientId,
          AbortSignal.any([ctx.mcpReq.signal, AbortSignal.timeout(30_000)]),
        );
        const now = clock.now();
        return {
          structuredContent: testMediaImageTool.reply.parse({
            data: { source: "synthetic" },
            as_of: formatUtc(now),
            as_of_local: formatInTimeZone(now, zone),
            freshness: "live",
          }),
          content: [
            { type: "text" as const, text: "Synthetic image delivery test." },
            {
              type: "image" as const,
              mimeType: "image/jpeg",
              data: image.toString("base64"),
            },
          ],
        };
      } catch (error) {
        if (error instanceof MediaDenied)
          return errorResult(
            {
              code: "ACTION_DISABLED",
              message: "This media handoff is not approved.",
              retryable: false,
            },
            clock,
          );
        logger.error("media_image_test_failed", { client_id: clientId }, error);
        return errorResult(
          {
            code: "BRIDGE_UNAVAILABLE",
            message: "The bridge could not return the test image.",
            retryable: true,
          },
          clock,
        );
      }
    },
  );
}
