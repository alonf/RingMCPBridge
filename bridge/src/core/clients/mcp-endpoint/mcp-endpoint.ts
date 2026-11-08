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
import { registerReadTools } from "./read-tools.ts";
import type { InquiryReads } from "./read-tools.ts";

/** The scope every iteration 001 tool needs. */
export const READ_SCOPE = "read";
/** When an agent may try again while tokens cannot be checked [P]. */
export const TOKEN_CHECK_RETRY_AFTER_S = 30;
const HTTP_UNAVAILABLE = 503;
const SERVER_INFO = { name: "ring-mcp-bridge", version: "0.1.0" } as const;
const RESOURCE_NAME = "Ring MCP Bridge";

/** What the Issuer says about an access token (its `checkAccessToken`). */
export type TokenCheck =
  | {
      readonly kind: "valid";
      readonly clientId: string;
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
  /** How long a tool call may take; 60 s unless a test says otherwise. */
  readonly deadlineMs?: number;
}

/** What the endpoint is wired with. */
export interface McpEndpointDependencies {
  readonly inquiry: InquiryReads;
  /** The Issuer, in mode H. */
  readonly tokens: AccessTokens;
  readonly clock: Clock;
  readonly logger: Logger;
}

/** The Issuer could not check a token; the agent is asked to try again, not to link again. */
class TokensUnavailable extends Error {
  constructor() {
    super("The access token could not be checked now.");
    this.name = "TokensUnavailable";
  }
}

/** The MCP Endpoint. One per core process. */
export class McpEndpoint {
  readonly #settings: McpEndpointSettings;
  readonly #dependencies: McpEndpointDependencies;
  readonly #logger: Logger;
  readonly #metadataUrl: string;
  readonly #verifier: OAuthTokenVerifier;
  readonly #handler: McpHttpHandler;
  readonly #app: Hono;

  constructor(
    settings: McpEndpointSettings,
    dependencies: McpEndpointDependencies,
  ) {
    this.#settings = { ...settings, allowedHosts: [...settings.allowedHosts] };
    this.#dependencies = dependencies;
    this.#logger = dependencies.logger.with({ component: "mcp_endpoint" });
    const resource = new URL(settings.resource);
    this.#metadataUrl = getOAuthProtectedResourceMetadataUrl(resource);
    this.#verifier = { verifyAccessToken: (token) => this.#verify(token) };
    this.#handler = createMcpHandler((context) => this.#server(context), {
      legacy: "stateless",
      onerror: (error) => {
        this.#logger.error("mcp_endpoint_failed", undefined, error);
      },
    });
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

  async #serve(request: Request): Promise<Response> {
    const challenge = {
      requiredScopes: [READ_SCOPE],
      resourceMetadataUrl: this.#metadataUrl,
    };
    let authInfo: AuthInfo;
    try {
      authInfo = await verifyBearerToken(request.headers.get("authorization"), {
        verifier: this.#verifier,
        ...challenge,
      });
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
    return this.#handler.fetch(request, { authInfo });
  }

  async #verify(token: string): Promise<AuthInfo> {
    const check = await this.#dependencies.tokens.checkAccessToken(
      token,
      AbortSignal.timeout(TOKEN_CHECK_RETRY_AFTER_S * 1000),
    );
    switch (check.kind) {
      case "valid":
        return {
          token,
          clientId: check.clientId,
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

  // A new server for each request: the SDK serves one request per instance.
  #server(context: McpRequestContext): McpServer {
    const server = new McpServer(SERVER_INFO);
    const clientId = context.authInfo?.clientId;
    registerReadTools(
      server,
      {
        inquiry: this.#dependencies.inquiry,
        clock: this.#dependencies.clock,
        logger: this.#logger,
        ...(this.#settings.deadlineMs === undefined
          ? {}
          : { deadlineMs: this.#settings.deadlineMs }),
      },
      (signal) => ({ clientId, signal }),
    );
    return server;
  }

  // The protected-resource metadata (RFC 9728): the resource, who issues its tokens, and the scope.
  #metadata(): Readonly<Record<string, unknown>> {
    return {
      resource: this.#settings.resource,
      authorization_servers: [this.#settings.issuer],
      scopes_supported: [READ_SCOPE],
      bearer_methods_supported: ["header"],
      resource_name: RESOURCE_NAME,
    };
  }
}
