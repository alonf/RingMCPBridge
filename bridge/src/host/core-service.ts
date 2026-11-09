// Mode H's core as a service (T027 part 4): the HTTP server in front of the core's components. It
// takes its database, secrets and owner sign-in already made, so the tests start it on SQLite with
// a stand-in Entra; `core.ts` makes the real ones (Azure SQL, Key Vault, Entra).
// - **Start**: the migrations run first, under their own lock on SQL Server (two starts migrate
//   once), since the `lease` table they create must exist before the lease can be taken. This is
//   how the records' "migrations under the lease" is met (DRIFT-001-46, DRIFT-001-50). Then the
//   listed agents are seeded from the settings, the lease is taken, and the link runs while it is
//   held.
// - **The Issuer** starts once its signing keys exist (T031 writes the first). Until then it
//   answers 503, `/readyz` names the missing keys, and the start is tried again every minute.
// - **Routes**: the Issuer under `/oauth`, and its metadata also at the RFC 8414 path; the owner's
//   sign-in return; the MCP endpoint and its protected-resource metadata; the home's link upgrade
//   at `/link`; `/livez` and `/readyz`. Anything else is 404.
// It reaches no Ring library (a dependency rule checks `core.ts`, which imports it).
import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { getRequestListener } from "@hono/node-server";
import type { CoreSecrets } from "../core/access/secrets/index.ts";
import { Issuer, IssuerError } from "../core/clients/issuer/index.ts";
import { McpEndpoint } from "../core/clients/mcp-endpoint/index.ts";
import type { Cancel, Clock } from "../utilities/clock/index.ts";
import type { Settings } from "../utilities/config/index.ts";
import { LinkServer } from "../utilities/link-transport/index.ts";
import type { Logger } from "../utilities/logging/index.ts";
import {
  CORE_MIGRATIONS,
  runMigrations,
} from "../utilities/query-layer/index.ts";
import type { QueryLayer } from "../utilities/query-layer/index.ts";
import type { HttpFetch, OwnerSignIn } from "../utilities/security/index.ts";
import { assembleCore } from "./core-assembly.ts";
import type { CoreAssembly } from "./core-assembly.ts";

/** The Issuer's base path. */
export const ISSUER_PATH = "/oauth";
/** The MCP endpoint's path. */
export const MCP_PATH = "/mcp";
/** Where the home's link is upgraded to a WebSocket. */
export const LINK_PATH = "/link";
/** Where Entra sends the owner back after signing in. */
export const SIGN_IN_RETURN_PATH = "/sign-in/return";
/** The Issuer's metadata at the RFC 8414 path for an issuer with a path. */
export const AUTHORIZATION_SERVER_METADATA_PATH =
  "/.well-known/oauth-authorization-server/oauth";
/** How often the Issuer's start is tried again while its signing keys are missing [P]. */
export const SIGNING_KEYS_RETRY_MS = 60_000;

const PROTECTED_RESOURCE_METADATA_PREFIX =
  "/.well-known/oauth-protected-resource";
const ISSUER_DISCOVERY_PATH = `${ISSUER_PATH}/.well-known/openid-configuration`;
const HTTP_OK = 200;
const HTTP_SEE_OTHER = 303;
const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
const HTTP_SERVER_ERROR = 500;
const HTTP_UNAVAILABLE = 503;
/** How long the readiness check waits for the database. */
const READINESS_DATABASE_TIMEOUT_MS = 2_000;

/** What the core service is made over. */
export interface CoreServiceResources {
  /** The core's database, not yet migrated. Closed by `stop`. */
  readonly store: QueryLayer;
  readonly secrets: CoreSecrets;
  readonly ownerSignIn: OwnerSignIn;
  /** Fetches agents' client metadata documents. */
  readonly fetch: HttpFetch;
  /** Must read the same time as `Date`, as oidc-provider does: `SystemClock`. */
  readonly clock: Clock;
  readonly logger: Logger;
  readonly leaseHolder?: string;
  /** The retry of the Issuer's start while its keys are missing; `SIGNING_KEYS_RETRY_MS` by default. */
  readonly signingKeysRetryMs?: number;
}

/** Whether each thing the core needs is in place, as `/readyz` reports it. */
export interface Readiness {
  readonly status: "ready" | "not_ready";
  readonly checks: {
    readonly database: "ok" | "unavailable";
    readonly lease: string;
    readonly signing_keys: "loaded" | "missing" | "unreadable";
    readonly owner: "configured" | "missing";
  };
}

/** The core service, running. */
export interface RunningCore {
  /** Where it listens, `http://127.0.0.1:<port>` and the like. */
  readonly address: string;
  readonly core: CoreAssembly;
  readiness(): Promise<Readiness>;
  /** Stops taking requests and links, ends the link's term, lets the lease go, and closes the database. */
  stop(): Promise<void>;
}

type CoreSettings = Extract<Settings, { readonly mode: "core" }>;

/** Starts mode H's core: migrations, agents, the lease, the Issuer, and the HTTP server on the configured port. */
export async function startCoreService(
  settings: CoreSettings,
  resources: CoreServiceResources,
): Promise<RunningCore> {
  const { store, clock, logger } = resources;
  const signal = new AbortController().signal;
  const publicUrl = settings.core.publicUrl;
  await runMigrations(store, CORE_MIGRATIONS, { clock }, signal);
  const core = assembleCore({
    store,
    clock,
    logger,
    settings,
    ...(resources.leaseHolder === undefined
      ? {}
      : { leaseHolder: resources.leaseHolder }),
  });
  const seeded = await core.settings.seedAgents(settings.core.agents, signal);
  logger.info("core_agents_seeded", {
    count: settings.core.agents.length,
    ...(seeded.removed.length === 0 ? {} : { outcome: "removed_some" }),
  });

  const issuer = new Issuer(
    {
      issuer: `${publicUrl}${ISSUER_PATH}`,
      resource: `${publicUrl}${MCP_PATH}`,
      trustProxy: settings.core.trustProxy,
    },
    {
      grants: core.grants,
      agents: core.settings,
      secrets: resources.secrets,
      ownerSignIn: resources.ownerSignIn,
      clock,
      logger,
      fetch: resources.fetch,
    },
  );
  const keys = new SigningKeysStart(
    issuer,
    clock,
    logger,
    resources.signingKeysRetryMs ?? SIGNING_KEYS_RETRY_MS,
  );
  await keys.start();

  const mcp = new McpEndpoint(
    {
      resource: `${publicUrl}${MCP_PATH}`,
      issuer: `${publicUrl}${ISSUER_PATH}`,
      // The endpoint's host check compares names without the port.
      allowedHosts: [new URL(publicUrl).hostname],
      readsPerHour: settings.readsPerHour,
    },
    { inquiry: core.inquiry, tokens: issuer, clock, logger },
  );
  const mcpListener = getRequestListener((request) => mcp.fetch(request));
  const linkServer = new LinkServer({
    clock,
    logger,
    onLink: (link) => {
      core.links.accept(link);
    },
  });

  const readiness = async (): Promise<Readiness> => {
    const database = await databaseCheck(store);
    const lease = core.lease.status;
    const checks = {
      database,
      lease: lease.held ? "held" : lease.reason,
      signing_keys: keys.state,
      owner:
        settings.core.ownerObjectId === undefined ? "missing" : "configured",
    } as const;
    const ready =
      database === "ok" &&
      lease.held &&
      keys.state === "loaded" &&
      checks.owner === "configured";
    return { status: ready ? "ready" : "not_ready", checks };
  };

  const server = createServer((request, response) => {
    route(request, response).catch((error: unknown) => {
      logger.error("core_request_failed", undefined, error);
      if (!response.headersSent) {
        answer(response, HTTP_SERVER_ERROR, { error: "internal" });
      }
    });
  });
  const route = async (
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> => {
    const url = new URL(request.url ?? "/", publicUrl);
    if (url.pathname === "/livez") {
      answer(response, HTTP_OK, { status: "ok" });
    } else if (url.pathname === "/readyz") {
      const report = await readiness();
      answer(
        response,
        report.status === "ready" ? HTTP_OK : HTTP_UNAVAILABLE,
        report,
      );
    } else if (url.pathname === AUTHORIZATION_SERVER_METADATA_PATH) {
      request.url = `${ISSUER_DISCOVERY_PATH}${url.search}`;
      issuer.handle(request, response);
    } else if (issuer.owns(request)) {
      issuer.handle(request, response);
    } else if (url.pathname === SIGN_IN_RETURN_PATH) {
      await signInReturn(issuer, url, request, response, logger);
    } else if (
      url.pathname === MCP_PATH ||
      url.pathname.startsWith(PROTECTED_RESOURCE_METADATA_PREFIX)
    ) {
      await mcpListener(request, response);
    } else {
      answer(response, HTTP_NOT_FOUND, { error: "not_found" });
    }
  };
  server.on("upgrade", (request: IncomingMessage, socket, head: Buffer) => {
    const path = (request.url ?? "/").split("?")[0];
    if (path === LINK_PATH) {
      linkServer.handleUpgrade(request, socket, head);
    } else {
      socket.destroy();
    }
  });

  core.start();
  const address = await listen(server, settings.core.port);
  logger.info("bridge_started", { mode: "core" });

  return {
    address,
    core,
    readiness,
    stop: async () => {
      keys.stop();
      await new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
        server.closeAllConnections();
      });
      linkServer.close("core_stopping");
      await core.stop();
      issuer.close();
      await store.close();
      logger.info("bridge_stopped", { mode: "core" });
    },
  };
}

/** The Issuer's start, tried again every so often while its signing keys are missing. */
class SigningKeysStart {
  readonly #issuer: Issuer;
  readonly #clock: Clock;
  readonly #logger: Logger;
  readonly #retryMs: number;
  #state: Readiness["checks"]["signing_keys"] = "missing";
  #retry: Cancel | undefined;

  constructor(issuer: Issuer, clock: Clock, logger: Logger, retryMs: number) {
    this.#issuer = issuer;
    this.#clock = clock;
    this.#logger = logger;
    this.#retryMs = retryMs;
  }

  get state(): Readiness["checks"]["signing_keys"] {
    return this.#state;
  }

  async start(): Promise<void> {
    await this.#try();
    if (this.#state !== "loaded") {
      this.#retry = this.#clock.every(this.#retryMs, () => {
        void this.#try().then(() => {
          if (this.#state === "loaded") {
            this.stop();
          }
        });
      });
    }
  }

  stop(): void {
    this.#retry?.();
    this.#retry = undefined;
  }

  async #try(): Promise<void> {
    if (this.#state === "loaded") {
      return;
    }
    try {
      const outcome = await this.#issuer.start(new AbortController().signal);
      this.#state = outcome === "ready" ? "loaded" : "missing";
      if (outcome === "ready") {
        this.#logger.info("issuer_started");
      } else {
        this.#logger.warn("issuer_signing_keys_missing");
      }
    } catch (error) {
      this.#state =
        error instanceof IssuerError && error.kind === "signing_keys_unreadable"
          ? "unreadable"
          : "missing";
      this.#logger.error("issuer_start_failed", undefined, error);
    }
  }
}

/** The owner's return from Entra: the Issuer's, or (from T029) the admin page's. */
async function signInReturn(
  issuer: Issuer,
  url: URL,
  request: IncomingMessage,
  response: ServerResponse,
  logger: Logger,
): Promise<void> {
  try {
    const outcome = await issuer.finishSignIn(
      url.searchParams,
      request.headers.cookie,
      new AbortController().signal,
    );
    if (outcome.kind === "continue") {
      response.writeHead(HTTP_SEE_OTHER, { location: outcome.url }).end();
    } else if (outcome.kind === "not_issuer") {
      answer(response, HTTP_NOT_FOUND, { error: "not_found" });
    } else {
      answer(response, HTTP_BAD_REQUEST, {
        error: "Start the link again from your agent.",
      });
    }
  } catch (error) {
    if (error instanceof IssuerError && error.kind === "link_expired") {
      answer(response, HTTP_BAD_REQUEST, {
        error: "This link has ended. Start the link again from your agent.",
      });
      return;
    }
    logger.error("issuer_sign_in_return_failed", undefined, error);
    answer(response, HTTP_SERVER_ERROR, { error: "internal" });
  }
}

async function databaseCheck(
  store: QueryLayer,
): Promise<Readiness["checks"]["database"]> {
  try {
    await store.get(
      { sql: "SELECT 1 AS one", params: {} },
      AbortSignal.timeout(READINESS_DATABASE_TIMEOUT_MS),
    );
    return "ok";
  } catch {
    return "unavailable";
  }
}

function answer(response: ServerResponse, status: number, body: object): void {
  response
    .writeHead(status, { "content-type": "application/json" })
    .end(JSON.stringify(body));
}

async function listen(server: Server, port: number): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, () => {
      server.off("error", reject);
      resolve();
    });
  });
  const bound = server.address() as AddressInfo;
  return `http://127.0.0.1:${String(bound.port)}`;
}
