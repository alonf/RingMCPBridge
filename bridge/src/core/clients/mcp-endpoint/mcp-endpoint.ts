// The MCP Endpoint (CP-15, T024; FR-030, IA D1): how agents reach the bridge. One Streamable HTTP
// endpoint serves both protocol eras: the 2026-07-28 era and the earlier one, which the SDK serves
// without sessions. A new SDK server answers each request, as the SDK requires.
//
// - **Tokens** (mode H): every request carries a bearer token from the Issuer, which the Issuer
//   checks before any tool runs (access tokens are opaque, DRIFT-001-39). A missing or bad token is
//   a 401 and a token without `read` a 403, each with `WWW-Authenticate` naming the
//   protected-resource metadata (RFC 9728), which tells the agent where to link. While the Issuer
//   cannot check tokens, the answer is 503 with `Retry-After`, so an agent keeps a token that may
//   be fine instead of asking the owner to link again.
// - **The Host header** must be one of the core's own names (DNS rebinding), and a request that
//   carries an `Origin` header is refused: agents call from servers, not from web pages [P].
// - **Mode A** serves the same tools over stdio, with no tokens: only the process that started the
//   bridge talks to it (web-endpoints.md "All-in-one mode"). The log must then go to stderr, since
//   stdout carries the protocol.
import { createMcpHonoApp } from "@modelcontextprotocol/hono";
import {
  bearerAuthChallengeResponse,
  readRequestBody,
  SUPPORTED_PROTOCOL_VERSIONS,
  createMcpHandler,
  getOAuthProtectedResourceMetadataUrl,
  McpServer,
  OAuthError,
  OAuthErrorCode,
  verifyBearerToken,
} from "@modelcontextprotocol/server";
import type {
  AuthInfo,
  McpHttpHandler,
  McpRequestContext,
  OAuthTokenVerifier,
} from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import type { StdioServerHandle } from "@modelcontextprotocol/server/stdio";
import type { Hono } from "hono";
import type { Clock } from "../../../utilities/clock/index.ts";
import type { Logger } from "../../../utilities/logging/index.ts";
import { registerEventMethods } from "./events-handler.ts";
import type { EventSubscriptions } from "./events-handler.ts";
import { EVENTS_URI, legacyListen, ListenStreams } from "./listen-stream.ts";
import { ReadLimit } from "./read-limit.ts";
import { registerReadTools } from "./read-tools.ts";
import { registerMediaTool } from "./share-event-media.ts";
import type { MediaHandoff } from "../../managers/media/index.ts";
import type { InquiryReads } from "./read-tools.ts";

/** The scope every iteration 001 tool needs. */
export const READ_SCOPE = "read";
/** When an agent may try again while tokens cannot be checked [P]. */
export const TOKEN_CHECK_RETRY_AFTER_S = 30;
/**
 * How long the Issuer may take to check a token before the answer is 503 [P]: shorter than the
 * Issuer's own 10 s limit on a store call, so a slow store is "cannot check now", never a failure.
 */
export const TOKEN_CHECK_TIMEOUT_MS = 5_000;
const HTTP_UNAVAILABLE = 503;
const SERVER_INFO = { name: "ring-mcp-bridge", version: "0.1.0" } as const;
const RESOURCE_NAME = "Ring MCP Bridge";

/** What the Issuer says about an access token (its `checkAccessToken`). */
export type TokenCheck =
  | {
      readonly kind: "valid";
      readonly clientId: string;
      readonly listedClientId?: string;
      readonly subject: string;
      readonly scopes: readonly string[];
      /** When it ends, in seconds since 1970. */
      readonly expiresAt: number;
    }
  | { readonly kind: "invalid" }
  | { readonly kind: "unavailable" };

/** Checks the access tokens agents present: the Issuer. */
export interface AccessTokens {
  checkAccessToken(token: string, signal: AbortSignal): Promise<TokenCheck>;
}

/** Where the endpoint is, and who issues its tokens. */
export interface McpEndpointSettings {
  /**
   * The endpoint's URL, `https://<core-host>/mcp` [P]: the path it serves, and the one resource the
   * Issuer issues tokens for (the same value as the Issuer's `resource`).
   */
  readonly resource: string;
  /** The Issuer's identifier, which the protected-resource metadata names. */
  readonly issuer: string;
  /** The `Host` names the endpoint answers to. */
  readonly allowedHosts: readonly string[];
  /** How many reads an agent may make in an hour: Config's `readsPerHour` (T025). */
  readonly readsPerHour: number;
  readonly clipsPerHour?: number;
  readonly framesPerHour?: number;
  /** How long a tool call may take; 60 s unless a test says otherwise. */
  readonly deadlineMs?: number;
  /** How long a token check may take; 5 s unless a test says otherwise. */
  readonly tokenCheckTimeoutMs?: number;
}

/** What the endpoint is wired with. */
export interface McpEndpointDependencies {
  readonly inquiry: InquiryReads;
  readonly media?: MediaHandoff | undefined;
  /** The Issuer, in mode H. */
  readonly tokens: AccessTokens;
  readonly clock: Clock;
  readonly logger: Logger;
  /** MCP Events through Delivery (T048), in mode H; without it no events method is served. */
  readonly events?: EventSubscriptions;
}

/** The Issuer could not check a token; the agent is asked to try again, not to link again. */
class TokensUnavailable extends Error {
  constructor() {
    super("The access token could not be checked now.");
    this.name = "TokensUnavailable";
  }
}

function rejectedOnAbort(signal: AbortSignal): Promise<never> {
  return new Promise<never>((_resolve, reject) => {
    signal.addEventListener(
      "abort",
      () => {
        reject(signal.reason as Error);
      },
      { once: true },
    );
  });
}

/** The MCP Endpoint. One per core process. */
export class McpEndpoint {
  readonly #settings: McpEndpointSettings;
  readonly #dependencies: McpEndpointDependencies;
  readonly #logger: Logger;
  readonly #metadataUrl: string;
  readonly #verifier: OAuthTokenVerifier;
  readonly #handler: McpHttpHandler;
  readonly #listen: ListenStreams;
  readonly #detachEvents?: () => void;
  readonly #app: Hono;
  readonly #limit: ReadLimit;
  readonly #mediaRequests: ReadLimit;
  readonly #clips: ReadLimit;
  readonly #frames: ReadLimit;

  constructor(
    settings: McpEndpointSettings,
    dependencies: McpEndpointDependencies,
  ) {
    this.#settings = { ...settings, allowedHosts: [...settings.allowedHosts] };
    this.#dependencies = dependencies;
    this.#logger = dependencies.logger.with({ component: "mcp_endpoint" });
    const resource = new URL(settings.resource);
    this.#metadataUrl = getOAuthProtectedResourceMetadataUrl(resource);
    this.#mediaRequests = new ReadLimit(
      settings.readsPerHour,
      dependencies.clock,
    );
    this.#clips = new ReadLimit(
      settings.clipsPerHour ?? 20,
      dependencies.clock,
    );
    this.#frames = new ReadLimit(
      settings.framesPerHour ?? 60,
      dependencies.clock,
    );
    this.#limit = new ReadLimit(settings.readsPerHour, dependencies.clock);
    this.#verifier = { verifyAccessToken: (token) => this.#verify(token) };
    this.#listen = new ListenStreams(dependencies.clock);
    this.#handler = createMcpHandler((context) => this.#server(context), {
      legacy: "stateless",
      onerror: (error) => {
        this.#logger.error("mcp_endpoint_failed", undefined, error);
      },
    });
    if (dependencies.events?.listen) {
      this.#detachEvents = dependencies.events.listen((event) => {
        this.#handler.bus.publish({
          kind: "resource_updated",
          uri: EVENTS_URI,
          params: { ["_meta"]: { "ring/event": event } },
        });
      });
    }
    const app = createMcpHonoApp({
      host: "0.0.0.0",
      allowedHosts: [...settings.allowedHosts],
      allowedOrigins: [],
    });
    app.get(new URL(this.#metadataUrl).pathname, (context) =>
      context.json(this.#metadata(), 200, {
        "access-control-allow-origin": "*",
      }),
    );
    app.all(resource.pathname, (context) => this.#serve(context.req.raw));
    const mediaResource = new URL(settings.resource + "/media");
    const mediaMetadataUrl =
      getOAuthProtectedResourceMetadataUrl(mediaResource);
    app.get(new URL(mediaMetadataUrl).pathname, (context) =>
      context.json({ ...this.#metadata(), resource: mediaResource.href }, 200, {
        "access-control-allow-origin": "*",
      }),
    );
    app.all(mediaResource.pathname, (context) =>
      this.#serve(context.req.raw, mediaMetadataUrl),
    );
    this.#app = app;
  }

  /** Where the protected-resource metadata is served (RFC 9728). */
  get metadataUrl(): string {
    return this.#metadataUrl;
  }

  /**
   * Answers one HTTP request to the endpoint or its metadata, and 404 to anything else. The Host
   * routes the endpoint's path and the metadata path here.
   */
  async fetch(request: Request): Promise<Response> {
    return this.#app.fetch(request);
  }

  /**
   * Serves the tools over this process's stdin and stdout, with no token: mode A. The Host must
   * send the log to stderr first.
   */
  serveStdio(): StdioServerHandle {
    return serveStdio((context) => this.#server(context));
  }

  async #serve(request: Request, mediaMetadataUrl?: string): Promise<Response> {
    if (mediaMetadataUrl && !this.#dependencies.media)
      return Response.json({ error: "media_unavailable" }, { status: 503 });
    const challenge = {
      requiredScopes: mediaMetadataUrl ? [READ_SCOPE, "media"] : [READ_SCOPE],
      resourceMetadataUrl: mediaMetadataUrl ?? this.#metadataUrl,
    };
    let authInfo: AuthInfo;
    try {
      authInfo = await verifyBearerToken(request.headers.get("authorization"), {
        verifier: this.#verifier,
        ...challenge,
        requiredScopes:
          mediaMetadataUrl || !this.#dependencies.media
            ? challenge.requiredScopes
            : [],
      });
      if (
        !authInfo.scopes.includes(READ_SCOPE) &&
        (!authInfo.scopes.includes("media") || request.method !== "POST")
      ) {
        throw new OAuthError(
          OAuthErrorCode.InsufficientScope,
          "This request requires a listed bridge scope.",
        );
      }
    } catch (error) {
      if (error instanceof TokensUnavailable) {
        return Response.json(
          {
            error: "temporarily_unavailable",
            error_description: error.message,
          },
          {
            status: HTTP_UNAVAILABLE,
            headers: { "retry-after": String(TOKEN_CHECK_RETRY_AFTER_S) },
          },
        );
      }
      if (!(error instanceof OAuthError)) {
        this.#logger.error("mcp_token_check_failed", undefined, error);
      }
      return bearerAuthChallengeResponse(error, challenge);
    }
    if (!authInfo.scopes.includes(READ_SCOPE))
      return this.#serveMediaRequest(request, authInfo);
    const events = this.#dependencies.events;
    let response: Response;
    const version = request.headers.get("mcp-protocol-version");
    const legacyGet =
      request.method === "GET" &&
      (!version || SUPPORTED_PROTOCOL_VERSIONS.includes(version));
    if (legacyGet && events?.listen) {
      if (
        !request.headers
          .get("accept")
          ?.split(",")
          .some((type) => type.trim().split(";")[0] === "text/event-stream")
      ) {
        return new Response(null, { status: 406 });
      }
      response = legacyListen(
        events.listen.bind(events),
        this.#dependencies.clock,
      );
    } else {
      response = await this.#handler.fetch(request, { authInfo });
    }
    if (
      !events?.listen ||
      !response.body ||
      !response.headers.get("content-type")?.startsWith("text/event-stream")
    )
      return response;
    return this.#listen.open(
      response,
      request,
      (authInfo.expiresAt ?? 0) * 1000,
      async () => {
        const grant = await this.#checked(authInfo.token);
        return (
          grant.kind === "valid" &&
          grant.clientId === authInfo.clientId &&
          grant.scopes.includes(READ_SCOPE) &&
          grant.expiresAt * 1000 > this.#dependencies.clock.now()
        );
      },
    );
  }

  /** Gate event methods on the authenticated JSON-RPC body before dispatch, including legacy batches. */
  async #serveMediaRequest(
    request: Request,
    authInfo: AuthInfo,
  ): Promise<Response> {
    let parsedBody: unknown;
    try {
      const body = await readRequestBody(request);
      if (body.tooLarge) return new Response(null, { status: 413 });
      parsedBody = JSON.parse(body.text);
    } catch {
      return Response.json(
        {
          jsonrpc: "2.0",
          id: null,
          error: { code: -32700, message: "Invalid JSON-RPC request." },
        },
        { status: 400 },
      );
    }
    const messages: unknown[] = Array.isArray(parsedBody)
      ? parsedBody
      : [parsedBody];
    const eventMethod = (message: unknown) =>
      typeof message === "object" &&
      message !== null &&
      "method" in message &&
      (message.method === "subscriptions/listen" ||
        message.method === "resources/subscribe" ||
        message.method === "resources/unsubscribe");
    if (messages.some(eventMethod))
      return bearerAuthChallengeResponse(
        new OAuthError(
          OAuthErrorCode.InsufficientScope,
          "Reading household events requires read scope.",
        ),
        {
          requiredScopes: [READ_SCOPE],
          resourceMetadataUrl: this.#metadataUrl,
        },
      );
    return this.#handler.fetch(request, { authInfo, parsedBody });
  }

  async stop(): Promise<void> {
    this.#detachEvents?.();
    this.#listen.stop();
    await this.#handler.close();
  }

  async #verify(token: string): Promise<AuthInfo> {
    const check = await this.#checked(token);
    switch (check.kind) {
      case "valid":
        return {
          token,
          clientId: check.clientId,
          extra: { listedClientId: check.listedClientId ?? check.clientId },
          scopes: [...check.scopes],
          expiresAt: check.expiresAt,
          resource: new URL(this.#settings.resource),
        };
      case "invalid":
        throw new OAuthError(
          OAuthErrorCode.InvalidToken,
          "The access token is not valid.",
        );
      case "unavailable":
        throw new TokensUnavailable();
    }
  }

  // The Issuer's answer within its time on the Clock. A check that runs past it means the Issuer
  // cannot check now: the deadline's own reason, `TokensUnavailable`, answers 503.
  async #checked(token: string): Promise<TokenCheck> {
    const deadline = new AbortController();
    const cancel = this.#dependencies.clock.schedule(
      this.#settings.tokenCheckTimeoutMs ?? TOKEN_CHECK_TIMEOUT_MS,
      () => {
        deadline.abort(new TokensUnavailable());
      },
    );
    const check = this.#dependencies.tokens.checkAccessToken(
      token,
      deadline.signal,
    );
    check.catch(() => undefined);
    try {
      return await Promise.race([check, rejectedOnAbort(deadline.signal)]);
    } finally {
      cancel();
    }
  }

  // A new server for each request: the SDK serves one request per instance.
  #server(context: McpRequestContext): McpServer {
    const server = new McpServer(SERVER_INFO);
    const clientId = context.authInfo?.clientId;
    const canRead =
      !context.authInfo || context.authInfo.scopes.includes(READ_SCOPE);
    if (canRead)
      registerReadTools(
        server,
        {
          inquiry: this.#dependencies.inquiry,
          limit: this.#limit,
          clock: this.#dependencies.clock,
          logger: this.#logger,
          ...(this.#settings.deadlineMs === undefined
            ? {}
            : { deadlineMs: this.#settings.deadlineMs }),
        },
        (signal) => ({ clientId, signal }),
      );
    const { media, events } = this.#dependencies;
    if (media && clientId && context.authInfo?.scopes.includes("media"))
      registerMediaTool(
        server,
        media,
        typeof context.authInfo.extra?.listedClientId === "string"
          ? context.authInfo.extra.listedClientId
          : clientId,
        {
          clip: this.#clips,
          photo: this.#frames,
          requests: this.#mediaRequests,
        },
        this.#logger,
        this.#dependencies.clock,
      );
    if (canRead && events !== undefined) {
      registerEventMethods(server, events, clientId);
      if (events.listen && context.era === "modern") {
        server.registerResource(
          "ring-events",
          EVENTS_URI,
          {
            description:
              "Live Ring event hints. Use get_events with your cursor for history.",
          },
          (uri) => ({
            contents: [
              { uri: uri.href, text: "Read event history with get_events." },
            ],
          }),
        );
        server.server.registerCapabilities({ resources: { subscribe: true } });
      } else if (events.listen) {
        server.server.registerCapabilities({ logging: {} });
      }
    }
    return server;
  }

  // The protected-resource metadata (RFC 9728): the resource, who issues its tokens, and the scope.
  #metadata(): Readonly<Record<string, unknown>> {
    return {
      resource: this.#settings.resource,
      authorization_servers: [this.#settings.issuer],
      scopes_supported: this.#dependencies.media
        ? [READ_SCOPE, "media"]
        : [READ_SCOPE],
      bearer_methods_supported: ["header"],
      resource_name: RESOURCE_NAME,
    };
  }
}
