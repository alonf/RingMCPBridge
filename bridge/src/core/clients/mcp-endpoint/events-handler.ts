// MCP Events on the MCP Endpoint (T048; FR-010, FR-012), which replaced T039's probe: the `events`
// capability and the three methods of OpenAI's guide, served for a signed-in client. Every request
// to the endpoint already needs the read scope, so a client without it cannot subscribe.
//
// - `events/list`: the event types Delivery offers, with their payload schema.
// - `events/subscribe`: read tolerantly, then checked, verified and stored by Delivery. A callback
//   that fails verification answers -32015 with its reason, as the guide says.
// - `events/unsubscribe`: ends the client's own subscription; ending one that is not there is not
//   an error.
//
// The SDK's server passes the `events` capability through in both protocol eras (spike S4, T039).
import { ProtocolError, ProtocolErrorCode } from "@modelcontextprotocol/server";
import type {
  McpServer,
  ServerCapabilities,
} from "@modelcontextprotocol/server";
import { z } from "zod";
import { DeliveryError } from "../delivery/index.ts";
import type {
  EventTypeDescription,
  SubscribeAnswer,
  SubscribeRequest,
} from "../delivery/index.ts";
import type { BridgeEvent } from "../../../contract/index.ts";
import { Secret } from "../../../utilities/security/index.ts";

/** The JSON-RPC error for a callback that fails verification (OpenAI's guide). */
export const CALLBACK_ENDPOINT_ERROR = -32015;

/** What the endpoint's event methods use: Delivery, in the core. */
export interface EventSubscriptions {
  listen?(listener: (event: BridgeEvent) => void): () => void;
  eventTypes(): readonly EventTypeDescription[];
  subscribe(
    request: SubscribeRequest,
    signal: AbortSignal,
  ): Promise<SubscribeAnswer>;
  unsubscribe(clientId: string, id: string, signal: AbortSignal): Promise<void>;
}

// Tolerant readers: ChatGPT may send more than the guide lists.
const SUBSCRIBE_PARAMS = z.looseObject({
  name: z.string(),
  delivery: z.looseObject({
    mode: z.string(),
    url: z.string(),
    secret: z.string(),
  }),
  ttlMs: z.number().nullish(),
});
const UNSUBSCRIBE_PARAMS = z.looseObject({ id: z.string() });
const LIST_PARAMS = z.looseObject({}).optional();

function protocolError(error: unknown): unknown {
  if (!(error instanceof DeliveryError)) {
    return error;
  }
  const data = { reason: error.reason };
  switch (error.kind) {
    case "invalid":
      return new ProtocolError(
        ProtocolErrorCode.InvalidParams,
        error.message,
        data,
      );
    case "callback_failed":
      return new ProtocolError(CALLBACK_ENDPOINT_ERROR, error.message, data);
    case "not_set_up":
    case "unavailable":
      return new ProtocolError(
        ProtocolErrorCode.InternalError,
        error.message,
        data,
      );
  }
}

function signedInClient(clientId: string | undefined): string {
  if (clientId === undefined) {
    throw new ProtocolError(
      ProtocolErrorCode.InvalidRequest,
      "Event subscriptions need a signed-in client.",
    );
  }
  return clientId;
}

/** Declares the `events` capability on one request's server, and serves the three methods. */
export function registerEventMethods(
  server: McpServer,
  events: EventSubscriptions,
  clientId: string | undefined,
): void {
  // `events` is not among the SDK's typed capabilities yet (spike S4): it is passed through.
  server.server.registerCapabilities({ events: {} } as ServerCapabilities);
  server.server.setRequestHandler(
    "events/list",
    { params: LIST_PARAMS },
    () => ({ events: [...events.eventTypes()] }),
  );
  server.server.setRequestHandler(
    "events/subscribe",
    { params: SUBSCRIBE_PARAMS },
    async (params, context) => {
      const client = signedInClient(clientId);
      try {
        const answer = await events.subscribe(
          {
            clientId: client,
            name: params.name,
            mode: params.delivery.mode,
            url: params.delivery.url,
            secret: new Secret(params.delivery.secret),
            ...(params.ttlMs === undefined ? {} : { ttlMs: params.ttlMs }),
          },
          context.mcpReq.signal,
        );
        return { ...answer, cursor: null, truncated: false };
      } catch (error) {
        throw protocolError(error);
      }
    },
  );
  server.server.setRequestHandler(
    "events/unsubscribe",
    { params: UNSUBSCRIBE_PARAMS },
    async ({ id }, context) => {
      try {
        await events.unsubscribe(
          signedInClient(clientId),
          id,
          context.mcpReq.signal,
        );
      } catch (error) {
        throw protocolError(error);
      }
      return {};
    },
  );
}
