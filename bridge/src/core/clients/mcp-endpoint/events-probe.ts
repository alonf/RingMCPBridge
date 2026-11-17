// The MCP Events probe (T039; FR-010, FR-012): a test subscription handler that finds out whether
// the owner's ChatGPT plan offers MCP Events, which host its callbacks go to, and whether a signed
// event is accepted. It is off unless the Host wires it in, and T048 replaces it.
//
// - It declares the `events` capability and serves `events/list`, `events/subscribe` and
//   `events/unsubscribe`, as OpenAI's guide describes them (research.md, T039 part 1).
// - A subscription to its one event type is checked, verified at its callback with a signed
//   challenge, and answered. One signed test event follows a few seconds later.
// - It keeps the signing secret in memory only, and logs the subscription's shape: the client, the
//   event name, the delivery mode, the callback's host and each answer's status. Never the secret,
//   the callback's path or the arguments.
// - The callback must be HTTPS at a host name, with no credentials, and no redirect is followed.
//   The full bounded fetch (resolved addresses, the host allowlist) is T048's.
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { ProtocolError, ProtocolErrorCode } from "@modelcontextprotocol/server";
import type {
  McpServer,
  ServerCapabilities,
} from "@modelcontextprotocol/server";
import { z } from "zod";
import type { Cancel, Clock } from "../../../utilities/clock/index.ts";
import type { Logger } from "../../../utilities/logging/index.ts";
import { Secret } from "../../../utilities/security/index.ts";

/** The one event type the probe offers. */
export const PROBE_EVENT_NAME = "bridge.probe";
/** How long after a subscription is accepted its test event is sent [P]. */
export const PROBE_EVENT_DELAY_MS = 5_000;
/** How long a probe subscription lasts; its `refreshBefore` [P]. */
export const PROBE_SUBSCRIPTION_TTL_MS = 3_600_000;
/** How long the callback may take to answer [P]. */
export const CALLBACK_TIMEOUT_MS = 5_000;
/** The JSON-RPC error for a callback that fails verification (OpenAI's guide). */
export const CALLBACK_ENDPOINT_ERROR = -32015;
const SECRET_PREFIX = "whsec_";
const MIN_SECRET_BYTES = 24;
const MAX_SECRET_BYTES = 64;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const CHALLENGE_BYTES = 32;
const MS_PER_SECOND = 1000;
const WEBHOOK_MODE = "webhook";
const LOCAL_HOST = "localhost";
const EMPTY_OBJECT_SCHEMA = { type: "object", properties: {} } as const;

/** A fetch-shaped function: the global `fetch` in the bridge, a stand-in in tests. */
export type CallbackFetch = (
  url: string,
  init: RequestInit,
) => Promise<Response>;

/** What the probe is wired with. */
export interface EventsProbeDependencies {
  readonly fetch: CallbackFetch;
  readonly clock: Clock;
  readonly logger: Logger;
}

// Tolerant readers: ChatGPT may send more than the guide lists.
const SUBSCRIBE_PARAMS = z.looseObject({
  name: z.string(),
  arguments: z.record(z.string(), z.unknown()).nullish(),
  delivery: z.looseObject({
    mode: z.string(),
    url: z.string(),
    secret: z.string(),
  }),
});
const UNSUBSCRIBE_PARAMS = z.looseObject({ id: z.string() });
const LIST_PARAMS = z.looseObject({}).optional();
const CHALLENGE_ANSWER = z.looseObject({ challenge: z.string() });

type SubscribeParams = z.infer<typeof SUBSCRIBE_PARAMS>;

/** Why a subscription is refused before any call, as a log code. */
type Refusal =
  "unknown_event" | "unsupported_mode" | "bad_secret" | "bad_callback";

/** Why the callback failed verification: the error's `data.reason`. */
type CallbackFailure = "challenge_failed" | "timeout" | "unreachable";

/** An accepted subscription, in memory only. */
interface Subscription {
  readonly id: string;
  readonly clientId: string | undefined;
  readonly callback: URL;
  readonly key: Secret<Buffer>;
}

class CallbackFailed extends Error {
  readonly reason: CallbackFailure;

  constructor(reason: CallbackFailure) {
    super("The callback did not pass verification.");
    this.name = "CallbackFailed";
    this.reason = reason;
  }
}

/** The signing key inside a `whsec_` secret, or nothing when it has another form. */
function signingKey(secret: string): Buffer | undefined {
  const encoded = secret.slice(SECRET_PREFIX.length);
  if (!secret.startsWith(SECRET_PREFIX) || !BASE64.test(encoded)) {
    return undefined;
  }
  const key = Buffer.from(encoded, "base64");
  return key.length >= MIN_SECRET_BYTES && key.length <= MAX_SECRET_BYTES
    ? key
    : undefined;
}

/** The callback when it is HTTPS at a host name with no credentials; nothing otherwise. */
function callbackUrl(value: string): URL | undefined {
  if (!URL.canParse(value)) {
    return undefined;
  }
  const url = new URL(value);
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const named = isIP(host) === 0 && host !== LOCAL_HOST && host.includes(".");
  const plain = url.username === "" && url.password === "";
  return url.protocol === "https:" && named && plain ? url : undefined;
}

/** The MCP Events probe. One per core process; the Host makes it when the switch is on. */
export class EventsProbe {
  readonly #fetch: CallbackFetch;
  readonly #clock: Clock;
  readonly #logger: Logger;
  /** Each accepted subscription's pending test event, by subscription id. */
  readonly #pending = new Map<string, Cancel>();

  constructor(dependencies: EventsProbeDependencies) {
    this.#fetch = dependencies.fetch;
    this.#clock = dependencies.clock;
    this.#logger = dependencies.logger.with({ component: "mcp_events_probe" });
  }

  /** Declares the capability on one request's server and serves the three methods for `clientId`. */
  register(server: McpServer, clientId: string | undefined): void {
    // `events` is not among the SDK's typed capabilities yet (spike S4): it is passed through.
    server.server.registerCapabilities({
      events: {},
    } as ServerCapabilities);
    server.server.setRequestHandler(
      "events/list",
      { params: LIST_PARAMS },
      () => ({
        events: [
          {
            name: PROBE_EVENT_NAME,
            description:
              "A test event from the Ring MCP Bridge. It carries no home data.",
            delivery: [WEBHOOK_MODE],
            inputSchema: EMPTY_OBJECT_SCHEMA,
            payloadSchema: {
              type: "object",
              properties: { message: { type: "string" } },
              required: ["message"],
            },
          },
        ],
      }),
    );
    server.server.setRequestHandler(
      "events/subscribe",
      { params: SUBSCRIBE_PARAMS },
      (params) => this.#subscribe(params, clientId),
    );
    server.server.setRequestHandler(
      "events/unsubscribe",
      { params: UNSUBSCRIBE_PARAMS },
      ({ id }) => {
        this.#end(id);
        this.#logger.info("mcp_events_probe_unsubscribe", {
          ...(clientId === undefined ? {} : { client_id: clientId }),
        });
        return {};
      },
    );
  }

  /** Drops every pending test event. The Host calls it when the core stops. */
  stop(): void {
    for (const id of [...this.#pending.keys()]) {
      this.#end(id);
    }
  }

  async #subscribe(
    params: SubscribeParams,
    clientId: string | undefined,
  ): Promise<Record<string, unknown>> {
    const callback = callbackUrl(params.delivery.url);
    const key = signingKey(params.delivery.secret);
    const refusal = this.#refusal(params, callback, key);
    this.#logger.info("mcp_events_probe_subscribe", {
      ...(clientId === undefined ? {} : { client_id: clientId }),
      event_name: params.name,
      kind: params.delivery.mode,
      ...(callback === undefined ? {} : { host: callback.hostname }),
      count: Object.keys(params.arguments ?? {}).length,
      outcome: refusal ?? "accepted",
    });
    if (refusal !== undefined || callback === undefined || key === undefined) {
      throw new ProtocolError(
        ProtocolErrorCode.InvalidParams,
        "The probe does not accept this subscription.",
      );
    }
    const subscription: Subscription = {
      id: randomUUID(),
      clientId,
      callback,
      key: new Secret(key),
    };
    await this.#verify(subscription);
    this.#pending.set(
      subscription.id,
      this.#clock.schedule(PROBE_EVENT_DELAY_MS, () => {
        this.#pending.delete(subscription.id);
        void this.#sendTestEvent(subscription);
      }),
    );
    return {
      id: subscription.id,
      refreshBefore: new Date(
        this.#clock.now() + PROBE_SUBSCRIPTION_TTL_MS,
      ).toISOString(),
      cursor: null,
      truncated: false,
    };
  }

  #refusal(
    params: SubscribeParams,
    callback: URL | undefined,
    key: Buffer | undefined,
  ): Refusal | undefined {
    if (params.name !== PROBE_EVENT_NAME) {
      return "unknown_event";
    }
    if (params.delivery.mode !== WEBHOOK_MODE) {
      return "unsupported_mode";
    }
    if (key === undefined) {
      return "bad_secret";
    }
    return callback === undefined ? "bad_callback" : undefined;
  }

  // The signed challenge the guide requires before a subscription is accepted: a 2xx that echoes
  // it. Anything else answers the subscribe call with the callback error and its reason.
  async #verify(subscription: Subscription): Promise<void> {
    const challenge = randomBytes(CHALLENGE_BYTES).toString("base64url");
    let status: number | undefined;
    let failure: CallbackFailure | undefined;
    try {
      const response = await this.#post(subscription, randomUUID(), {
        type: "verification",
        challenge,
      });
      status = response.status;
      const answer = CHALLENGE_ANSWER.safeParse(
        await response.json().catch(() => undefined),
      );
      const echoed = answer.success && answer.data.challenge === challenge;
      failure = response.ok && echoed ? undefined : "challenge_failed";
    } catch (error) {
      failure = error instanceof CallbackFailed ? error.reason : "unreachable";
    }
    this.#logger.info("mcp_events_probe_verified", {
      ...(subscription.clientId === undefined
        ? {}
        : { client_id: subscription.clientId }),
      host: subscription.callback.hostname,
      ...(status === undefined ? {} : { http_status: status }),
      outcome: failure ?? "ok",
    });
    if (failure !== undefined) {
      throw new ProtocolError(
        CALLBACK_ENDPOINT_ERROR,
        "The callback did not pass verification.",
        { reason: failure },
      );
    }
  }

  async #sendTestEvent(subscription: Subscription): Promise<void> {
    const eventId = randomUUID();
    let status: number | undefined;
    let outcome = "unreachable";
    try {
      const response = await this.#post(subscription, eventId, {
        eventId,
        name: PROBE_EVENT_NAME,
        timestamp: new Date(this.#clock.now()).toISOString(),
        data: { message: "A test event from the Ring MCP Bridge." },
        cursor: null,
      });
      status = response.status;
      outcome = response.ok ? "ok" : "refused";
    } catch (error) {
      outcome = error instanceof CallbackFailed ? error.reason : outcome;
    }
    this.#logger.info("mcp_events_probe_delivered", {
      ...(subscription.clientId === undefined
        ? {}
        : { client_id: subscription.clientId }),
      host: subscription.callback.hostname,
      ...(status === undefined ? {} : { http_status: status }),
      outcome,
    });
  }

  // One Standard Webhooks request: the body's exact bytes are signed with the message id and the
  // signing time in seconds, and the request ends when the callback takes too long.
  async #post(
    subscription: Subscription,
    messageId: string,
    content: Readonly<Record<string, unknown>>,
  ): Promise<Response> {
    const body = JSON.stringify(content);
    const signedAt = String(Math.floor(this.#clock.now() / MS_PER_SECOND));
    const signature = createHmac("sha256", subscription.key.reveal())
      .update(`${messageId}.${signedAt}.${body}`)
      .digest("base64");
    const deadline = new AbortController();
    const cancel = this.#clock.schedule(CALLBACK_TIMEOUT_MS, () => {
      deadline.abort(new CallbackFailed("timeout"));
    });
    try {
      return await this.#fetch(subscription.callback.href, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "webhook-id": messageId,
          "webhook-timestamp": signedAt,
          "webhook-signature": `v1,${signature}`,
          "x-mcp-subscription-id": subscription.id,
        },
        body,
        redirect: "manual",
        signal: deadline.signal,
      });
    } catch (error) {
      throw deadline.signal.aborted ? new CallbackFailed("timeout") : error;
    } finally {
      cancel();
    }
  }

  #end(id: string): void {
    this.#pending.get(id)?.();
    this.#pending.delete(id);
  }
}
