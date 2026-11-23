import type { McpServer } from "@modelcontextprotocol/server";
import { shareEventMediaTool } from "../../../contract/index.ts";
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
  limits: Record<"photo" | "clip", ReadLimit>,
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
      const allowance = limits[input.data.kind].take(clientId);
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
        const result = await media.share(
          input.data,
          clientId,
          AbortSignal.any([ctx.mcpReq.signal, AbortSignal.timeout(60_000)]),
        );
        if (!result)
          return errorResult(
            {
              code: "NOT_FOUND",
              message: "No media matched this event and camera.",
              retryable: false,
            },
            clock,
          );
        const now = clock.now();
        const reply = tool.reply.parse({
          data: result.data,
          as_of: formatUtc(now),
          as_of_local: formatInTimeZone(now, result.zone),
          freshness: "live",
        });
        return {
          structuredContent: reply,
          content: [
            { type: "text" as const, text: JSON.stringify(reply) },
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
}
