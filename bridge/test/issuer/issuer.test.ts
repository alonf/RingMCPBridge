// The Issuer (T023) end to end: an agent links through the MCP SDK's own OAuth helpers, the owner
// signs in at the Entra stand-in, and Web's part (the sign-in return route) is played here. Tokens
// live in Grants on SQLite. Time is one clock: `Date` alone is faked, and everything reads it
// (oidc-provider, the stand-in, jose, and the stores through SystemClock). Since T024, the agent
// also uses its token at the MCP Endpoint, served at the resource the Issuer issues tokens for.
import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import {
  discoverAuthorizationServerMetadata,
  exchangeAuthorization,
  registerClient,
  startAuthorization,
} from "@modelcontextprotocol/client";
import type { AuthorizationServerMetadata } from "@modelcontextprotocol/client";
import { getRequestListener } from "@hono/node-server";
import { SdkHttpError } from "@modelcontextprotocol/client";
import { decodeProtectedHeader } from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GrantsStore } from "../../src/core/access/grants/index.ts";
import { SettingsStore } from "../../src/core/access/settings/index.ts";
import type { AgentSeed } from "../../src/core/access/settings/index.ts";
import type {
  CoreSecrets,
  SecretLookup,
} from "../../src/core/access/secrets/index.ts";
import {
  generateSigningKey,
  Issuer,
  IssuerError,
  parseSigningKeys,
  signingKeyDocument,
} from "../../src/core/clients/issuer/index.ts";
import type { SigningKey } from "../../src/core/clients/issuer/index.ts";
import { McpEndpoint } from "../../src/core/clients/mcp-endpoint/index.ts";
import { SystemClock } from "../../src/utilities/clock/index.ts";
import { Logger } from "../../src/utilities/logging/index.ts";
import {
  CORE_MIGRATIONS,
  openSqliteQueryLayer,
  runMigrations,
} from "../../src/utilities/query-layer/index.ts";
import type { QueryLayer } from "../../src/utilities/query-layer/index.ts";
import {
  EntraOwnerSignIn,
  Secret,
  SecurityError,
} from "../../src/utilities/security/index.ts";
import type { OwnerSignIn } from "../../src/utilities/security/index.ts";
import { startCoreReads } from "../mcp-endpoint/core-fixture.ts";
import { connectOverHttp, startEntraStandIn } from "../support/index.ts";
import type { EntraStandIn, ProtocolEra } from "../support/index.ts";

const START = Date.UTC(2026, 10, 8, 9, 0, 0);
const SECOND_MS = 1000;
const HOUR_MS = 3600 * SECOND_MS;
const DAY_MS = 24 * HOUR_MS;
const MAX_HOPS = 20;

const DOCUMENT_AGENT: AgentSeed = {
  client_id: "https://agent.example.test/oauth/client.json",
  platform: "Document agent",
  scopes: ["read", "media"],
  redirect_uris: ["https://agent.example.test/oauth/callback"],
};
const REGISTERING_AGENT: AgentSeed = {
  client_id: "registering-agent",
  platform: "Registering agent",
  scopes: ["read"],
  redirect_uris: ["https://chat.example.test/oauth/callback"],
};

let signingKeys: readonly SigningKey[] = [];

function never(): AbortSignal {
  return new AbortController().signal;
}

function advance(ms: number): void {
  vi.setSystemTime(Date.now() + ms);
}

/** Secrets holding one document, or none. */
function secretsWith(document: string | undefined): CoreSecrets {
  return {
    read: (): Promise<SecretLookup> =>
      Promise.resolve(
        document === undefined
          ? { kind: "missing" }
          : { kind: "found", value: new Secret(document) },
      ),
    write: () => Promise.reject(new Error("The Issuer never writes keys.")),
  };
}

interface Rig {
  /** The core's origin: the Issuer is under `/oauth`, Web's sign-in return at `/sign-in/return`. */
  readonly origin: string;
  readonly issuerUrl: string;
  readonly resource: string;
  readonly issuer: Issuer;
  /** What the Issuer's start reported. */
  readonly started: string;
  readonly standIn: EntraStandIn;
  readonly grants: GrantsStore;
  readonly layer: QueryLayer;
  /** Client ID metadata documents the agents publish, by URL. */
  readonly documents: Map<string, object>;
  /** Every URL the Issuer fetched. */
  readonly fetched: string[];
  readonly logLines: string[];
  /** How many Entra sign-ins the Issuer has started. */
  signInsStarted(): number;
  /** Makes the next sign-in fail to start with this error. */
  failNextSignIn(error: Error): void;
  close(): Promise<void>;
}

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  return `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
}

async function startRig(
  options: {
    readonly keys?: string | undefined;
    /** Also serve the MCP Endpoint at the resource, checking tokens with this Issuer (T024). */
    readonly mcp?: boolean;
  } = {},
): Promise<Rig> {
  const clock = new SystemClock();
  const layer = openSqliteQueryLayer(":memory:", { clock });
  await runMigrations(layer, CORE_MIGRATIONS, { clock }, never());
  const settings = new SettingsStore({
    store: layer,
    clock,
    defaultBatteryThresholdPct: 20,
  });
  await settings.seedAgents([DOCUMENT_AGENT, REGISTERING_AGENT], never());
  const grants = new GrantsStore({ store: layer, clock });

  let route: (
    request: IncomingMessage,
    response: ServerResponse,
  ) => void = () => undefined;
  const server = createServer((request, response) => {
    route(request, response);
  });
  const origin = await listen(server);
  const standIn = await startEntraStandIn({
    redirectUri: `${origin}/sign-in/return`,
  });
  const entraSignIn = new EntraOwnerSignIn(
    {
      issuer: standIn.issuer,
      clientId: standIn.clientId,
      redirectUri: `${origin}/sign-in/return`,
      ownerObjectId: standIn.owner.objectId,
    },
    {
      clock,
      fetch: (url, init) => fetch(url, init),
      clientAssertion: (signal) => standIn.clientAssertion(signal),
    },
  );
  let signInsStarted = 0;
  let nextFailure: Error | undefined;
  const ownerSignIn: OwnerSignIn = {
    begin: (startOptions, signal) => {
      signInsStarted += 1;
      const failure = nextFailure;
      nextFailure = undefined;
      return failure === undefined
        ? entraSignIn.begin(startOptions, signal)
        : Promise.reject(failure);
    },
    complete: (pending, callback, signal) =>
      entraSignIn.complete(pending, callback, signal),
  };
  const documents = new Map<string, object>();
  const fetched: string[] = [];
  const logLines: string[] = [];
  const issuerUrl = `${origin}/oauth`;
  const resource = `${origin}/mcp`;
  const issuerLogger = new Logger({
    sink: (line) => logLines.push(line),
    now: () => clock.now(),
    minLevel: "debug",
  });
  const issuer = new Issuer(
    { issuer: issuerUrl, resource },
    {
      grants,
      agents: settings,
      secrets: secretsWith(
        "keys" in options
          ? options.keys
          : signingKeyDocument(signingKeys.slice(0, 1)),
      ),
      ownerSignIn,
      clock,
      logger: issuerLogger,
      fetch: (url) => {
        fetched.push(url);
        const document = documents.get(url);
        return Promise.resolve(
          document === undefined
            ? new Response("not found", { status: 404 })
            : Response.json(document),
        );
      },
    },
  );

  const started = await issuer.start(never());

  const core = options.mcp === true ? await startCoreReads(clock) : undefined;
  const mcp =
    core === undefined
      ? undefined
      : new McpEndpoint(
          {
            resource,
            issuer: issuerUrl,
            allowedHosts: ["127.0.0.1"],
            readsPerHour: 600,
          },
          {
            inquiry: core.inquiry,
            tokens: issuer,
            clock,
            logger: issuerLogger,
          },
        );
  const mcpListener =
    mcp === undefined
      ? undefined
      : getRequestListener((request) => mcp.fetch(request));

  // The core's routes: the Issuer under /oauth, Web's sign-in return, and the MCP Endpoint.
  route = (request, response) => {
    if (issuer.owns(request)) {
      issuer.handle(request, response);
      return;
    }
    const url = new URL(request.url ?? "/", origin);
    if (
      mcpListener !== undefined &&
      (url.pathname === "/mcp" ||
        url.pathname.startsWith("/.well-known/oauth-protected-resource"))
    ) {
      void mcpListener(request, response);
      return;
    }
    if (url.pathname !== "/sign-in/return") {
      response.writeHead(404).end();
      return;
    }
    issuer.finishSignIn(url.searchParams, request.headers.cookie, never()).then(
      (outcome) => {
        if (outcome.kind === "not_issuer") {
          response.writeHead(404).end();
        } else if (outcome.kind === "continue") {
          response.writeHead(303, { location: outcome.url }).end();
        } else {
          response.writeHead(400).end("Start the link again from your agent.");
        }
      },
      (error: unknown) => {
        const kind = error instanceof IssuerError ? error.kind : "failed";
        response.writeHead(500).end(kind);
      },
    );
  };

  return {
    origin,
    issuerUrl,
    resource,
    issuer,
    started,
    standIn,
    grants,
    layer,
    documents,
    fetched,
    logLines,
    signInsStarted: () => signInsStarted,
    failNextSignIn: (error) => {
      nextFailure = error;
    },
    close: async () => {
      issuer.close();
      server.closeAllConnections();
      await new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      });
      await standIn.close();
      await core?.close();
      await layer.close();
    },
  };
}

function publishDocument(rig: Rig, changes: object = {}): void {
  rig.documents.set(DOCUMENT_AGENT.client_id, {
    client_id: DOCUMENT_AGENT.client_id,
    client_name: "Document agent",
    redirect_uris: DOCUMENT_AGENT.redirect_uris,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
    ...changes,
  });
}

/** A browser's cookies, kept apart for each server. */
type Jars = Map<string, Map<string, string>>;

/**
 * Plays a browser from `start`, following redirects and keeping each server's cookies apart, until
 * a URL that begins with `stopAt`, which it returns without opening.
 */
async function walk(
  start: URL | string,
  stopAt: string,
  jars: Jars = new Map(),
): Promise<URL> {
  let next = new URL(start);
  for (let hop = 0; hop < MAX_HOPS; hop += 1) {
    if (next.href.startsWith(stopAt)) {
      return next;
    }
    const jar = jars.get(next.origin) ?? new Map<string, string>();
    jars.set(next.origin, jar);
    const response = await fetch(next, {
      redirect: "manual",
      headers: {
        cookie: [...jar].map(([name, value]) => `${name}=${value}`).join("; "),
      },
    });
    for (const setCookie of response.headers.getSetCookie()) {
      const [pair = ""] = setCookie.split(";");
      const separator = pair.indexOf("=");
      jar.set(pair.slice(0, separator).trim(), pair.slice(separator + 1));
    }
    const location = response.headers.get("location");
    if (location === null) {
      throw new Error(
        `The browser stopped at ${next.pathname} with ${String(response.status)}: ${await response.text()}`,
      );
    }
    await response.body?.cancel();
    next = new URL(location, next);
  }
  throw new Error("The browser never reached where it was going.");
}

/** The `Cookie` header a browser sends to one server. */
function cookiesOf(jars: Jars, origin: string): string {
  return [...(jars.get(origin) ?? new Map<string, string>())]
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

/** Plays the owner's browser to the agent's redirect URI, and returns that URI's query. */
async function browse(
  start: URL | string,
  redirectUri: string,
  jars?: Jars,
): Promise<URLSearchParams> {
  return (await walk(start, redirectUri, jars)).searchParams;
}

interface Tokens {
  readonly access_token: string;
  readonly refresh_token?: string | undefined;
  readonly expires_in?: number | undefined;
  readonly scope?: string | undefined;
  readonly id_token?: string | undefined;
}

/** The Issuer's metadata, as an MCP client discovers it from the issuer's URL. */
async function metadataOf(rig: Rig): Promise<AuthorizationServerMetadata> {
  const metadata = await discoverAuthorizationServerMetadata(rig.issuerUrl);
  if (metadata === undefined) {
    throw new Error("The Issuer's metadata was not found.");
  }
  return metadata;
}

/** Links an agent: the authorization, the owner's sign-in, and the code exchange. */
async function link(
  rig: Rig,
  clientId: string,
  redirectUri: string,
  scope = "read",
  jars?: Map<string, Map<string, string>>,
): Promise<Tokens> {
  const metadata = await metadataOf(rig);
  const { authorizationUrl, codeVerifier } = await startAuthorization(
    rig.issuerUrl,
    {
      metadata,
      clientInformation: { client_id: clientId },
      redirectUrl: redirectUri,
      scope,
      resource: new URL(rig.resource),
    },
  );
  const reply = await browse(authorizationUrl, redirectUri, jars);
  const code = reply.get("code");
  if (code === null) {
    throw new Error(`The link failed: ${reply.get("error") ?? "no code"}`);
  }
  return exchangeAuthorization(rig.issuerUrl, {
    metadata,
    clientInformation: { client_id: clientId },
    authorizationCode: code,
    iss: reply.get("iss") ?? "",
    codeVerifier,
    redirectUri,
    resource: new URL(rig.resource),
  });
}

/** One token request, answered as it came. */
async function tokenRequest(
  rig: Rig,
  form: Readonly<Record<string, string>>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(`${rig.issuerUrl}/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form),
  });
  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown>,
  };
}

function refresh(
  rig: Rig,
  clientId: string,
  refreshToken: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  return tokenRequest(rig, {
    grant_type: "refresh_token",
    client_id: clientId,
    refresh_token: refreshToken,
    resource: rig.resource,
  });
}

function textOf(value: unknown): string {
  if (typeof value !== "string") {
    throw new TypeError("expected a string");
  }
  return value;
}

describe("the Issuer", () => {
  let rig: Rig;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(START);
    if (signingKeys.length === 0) {
      signingKeys = [generateSigningKey(), generateSigningKey()];
    }
    rig = await startRig();
    publishDocument(rig);
  });

  afterEach(async () => {
    await rig.close();
    vi.useRealTimers();
  });

  it("advertises PKCE S256, client ID metadata documents and public clients", async () => {
    const metadata = await discoverAuthorizationServerMetadata(rig.issuerUrl);

    expect(metadata).toMatchObject({
      issuer: rig.issuerUrl,
      code_challenge_methods_supported: ["S256"],
      client_id_metadata_document_supported: true,
      response_types_supported: ["code"],
    });
    expect(metadata?.token_endpoint_auth_methods_supported).toContain("none");
    expect(metadata?.token_endpoint_auth_methods_supported).not.toContain(
      "client_secret_basic",
    );
    expect(metadata?.grant_types_supported).toEqual(
      expect.arrayContaining(["authorization_code", "refresh_token"]),
    );
  });

  it("links a listed agent by its metadata document once the owner signs in with Entra", async () => {
    const tokens = await link(
      rig,
      DOCUMENT_AGENT.client_id,
      textOf(DOCUMENT_AGENT.redirect_uris[0]),
    );

    expect(tokens).toMatchObject({ expires_in: 3600, scope: "read" });
    expect(tokens.refresh_token).toEqual(expect.any(String));
    expect(rig.fetched).toEqual([DOCUMENT_AGENT.client_id]);
    // Bound to the owner's Entra subject, to the client, and to the MCP endpoint.
    const stored = await rig.grants.find(
      "AccessToken",
      tokens.access_token,
      never(),
    );
    expect(stored).toMatchObject({
      accountId: rig.standIn.owner.subject,
      clientId: DOCUMENT_AGENT.client_id,
      aud: rig.resource,
      scope: "read",
    });
  });

  it("grants read only, even when the agent asks for media and is listed for it", async () => {
    const tokens = await link(
      rig,
      DOCUMENT_AGENT.client_id,
      textOf(DOCUMENT_AGENT.redirect_uris[0]),
      "read media control",
    );

    expect(tokens.scope).toBe("read");
  });

  it("asks the owner to sign in for every link, even in a browser that linked before", async () => {
    const jars = new Map<string, Map<string, string>>();
    const redirectUri = textOf(DOCUMENT_AGENT.redirect_uris[0]);
    await link(rig, DOCUMENT_AGENT.client_id, redirectUri, "read", jars);

    await link(rig, DOCUMENT_AGENT.client_id, redirectUri, "read", jars);

    expect(rig.signInsStarted()).toBe(2);
  });

  it("finishes a sign-in only in the browser that started the link", async () => {
    const redirectUri = textOf(DOCUMENT_AGENT.redirect_uris[0]);
    const metadata = await metadataOf(rig);
    const { authorizationUrl } = await startAuthorization(rig.issuerUrl, {
      metadata,
      clientInformation: { client_id: DOCUMENT_AGENT.client_id },
      redirectUrl: redirectUri,
      scope: "read",
      resource: new URL(rig.resource),
    });
    // Someone starts a link from their own agent account, stops at Entra, and sends that link on.
    const starter: Jars = new Map();
    const entraLink = await walk(authorizationUrl, rig.standIn.issuer, starter);

    // The owner opens it in their own browser and signs in.
    await expect(browse(entraLink, redirectUri, new Map())).rejects.toThrow(
      /400/,
    );

    // The starter's browser resumes the authorization: it must not get a code.
    const uid = starter.get(rig.origin)?.get("issuer_resume");
    const reply = await browse(
      `${rig.issuerUrl}/auth/${textOf(uid)}`,
      redirectUri,
      starter,
    );
    expect(reply.has("code")).toBe(false);
    expect(reply.get("error")).toBe("access_denied");
  });

  it("refuses someone else from the owner's tenant: the agent is told access_denied", async () => {
    rig.standIn.signInNext(rig.standIn.stranger);
    const metadata = await metadataOf(rig);
    const redirectUri = textOf(DOCUMENT_AGENT.redirect_uris[0]);
    const { authorizationUrl } = await startAuthorization(rig.issuerUrl, {
      metadata,
      clientInformation: { client_id: DOCUMENT_AGENT.client_id },
      redirectUrl: redirectUri,
      scope: "read",
      resource: new URL(rig.resource),
    });

    const reply = await browse(authorizationUrl, redirectUri);

    expect(reply.get("error")).toBe("access_denied");
    expect(reply.has("code")).toBe(false);
  });

  describe("clients", () => {
    function authorizeAs(
      clientId: string,
      redirectUri: string,
    ): Promise<Response> {
      const url = new URL(`${rig.issuerUrl}/auth`);
      for (const [name, value] of Object.entries({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: "read",
        code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
        code_challenge_method: "S256",
        resource: rig.resource,
      })) {
        url.searchParams.set(name, value);
      }
      return fetch(url, { redirect: "manual" });
    }

    it("requires PKCE of every client", async () => {
      const url = new URL(`${rig.issuerUrl}/auth`);
      for (const [name, value] of Object.entries({
        client_id: DOCUMENT_AGENT.client_id,
        redirect_uri: textOf(DOCUMENT_AGENT.redirect_uris[0]),
        response_type: "code",
        scope: "read",
        resource: rig.resource,
      })) {
        url.searchParams.set(name, value);
      }

      const reply = await browse(url, textOf(DOCUMENT_AGENT.redirect_uris[0]));

      expect(reply.get("error")).toBe("invalid_request");
      expect(reply.get("error_description")).toContain("PKCE");
      expect(rig.signInsStarted()).toBe(0);
    });

    it("refuses an unlisted metadata document without ever fetching it", async () => {
      const unlisted = "https://elsewhere.example.test/client.json";
      rig.documents.set(unlisted, {
        client_id: unlisted,
        redirect_uris: ["https://elsewhere.example.test/callback"],
        token_endpoint_auth_method: "none",
      });

      const response = await authorizeAs(
        unlisted,
        "https://elsewhere.example.test/callback",
      );

      expect(response.status).toBe(400);
      expect(await response.text()).toContain("invalid_client");
      expect(rig.fetched).toEqual([]);
    });

    it("refuses a listed agent whose document names a redirect URI not listed for it", async () => {
      publishDocument(rig, {
        redirect_uris: [
          ...DOCUMENT_AGENT.redirect_uris,
          "https://attacker.example.test/callback",
        ],
      });

      const response = await authorizeAs(
        DOCUMENT_AGENT.client_id,
        "https://attacker.example.test/callback",
      );

      expect(response.status).toBe(400);
      expect(await response.text()).toContain("invalid_client");
    });

    it("refuses an agent the owner has revoked, even with its document cached", async () => {
      await link(
        rig,
        DOCUMENT_AGENT.client_id,
        textOf(DOCUMENT_AGENT.redirect_uris[0]),
      );
      await rig.layer.run(
        {
          sql: "UPDATE agent SET revoked_at = @at WHERE client_id = @id",
          params: { at: Date.now(), id: DOCUMENT_AGENT.client_id },
        },
        never(),
      );

      const response = await authorizeAs(
        DOCUMENT_AGENT.client_id,
        textOf(DOCUMENT_AGENT.redirect_uris[0]),
      );

      expect(response.status).toBe(400);
      expect(rig.fetched).toEqual([DOCUMENT_AGENT.client_id]);
    });

    it("registers an agent only when its redirect URIs are listed for one agent (DCR)", async () => {
      const metadata = await metadataOf(rig);
      const unlisted = await fetch(`${rig.issuerUrl}/reg`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          redirect_uris: ["https://attacker.example.test/callback"],
          token_endpoint_auth_method: "none",
        }),
      });
      expect(unlisted.status).toBe(400);
      expect(await unlisted.json()).toMatchObject({
        error: "invalid_client_metadata",
      });

      // eslint-disable-next-line @typescript-eslint/no-deprecated -- the DCR fallback is what this tests
      const registered = await registerClient(rig.issuerUrl, {
        metadata,
        clientMetadata: {
          client_name: "Registering agent",
          redirect_uris: REGISTERING_AGENT.redirect_uris.map(String),
          grant_types: ["authorization_code", "refresh_token"],
          response_types: ["code"],
          token_endpoint_auth_method: "none",
        },
      });
      expect(registered.client_secret).toBeUndefined();
      const tokens = await link(
        rig,
        registered.client_id,
        textOf(REGISTERING_AGENT.redirect_uris[0]),
      );
      expect(tokens.scope).toBe("read");
    });

    it("ends a registered client when its agent is revoked", async () => {
      const metadata = await metadataOf(rig);
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- the DCR fallback is what this tests
      const registered = await registerClient(rig.issuerUrl, {
        metadata,
        clientMetadata: {
          redirect_uris: REGISTERING_AGENT.redirect_uris.map(String),
          token_endpoint_auth_method: "none",
        },
      });
      const tokens = await link(
        rig,
        registered.client_id,
        textOf(REGISTERING_AGENT.redirect_uris[0]),
      );
      await rig.layer.run(
        {
          sql: "UPDATE agent SET revoked_at = @at WHERE client_id = @id",
          params: { at: Date.now(), id: REGISTERING_AGENT.client_id },
        },
        never(),
      );

      const refused = await refresh(
        rig,
        registered.client_id,
        textOf(tokens.refresh_token),
      );

      expect(refused.body.error).toBe("invalid_client");
    });
  });

  describe("when a link goes wrong", () => {
    const redirectUri = textOf(DOCUMENT_AGENT.redirect_uris[0]);

    /** Starts a link and stops the owner's browser at Web's sign-in return. */
    async function untilReturn(): Promise<{
      jars: Jars;
      callback: URLSearchParams;
    }> {
      const metadata = await metadataOf(rig);
      const { authorizationUrl } = await startAuthorization(rig.issuerUrl, {
        metadata,
        clientInformation: { client_id: DOCUMENT_AGENT.client_id },
        redirectUrl: redirectUri,
        scope: "read",
        resource: new URL(rig.resource),
      });
      const jars = new Map<string, Map<string, string>>();
      const callback = await browse(
        authorizationUrl,
        `${rig.origin}/sign-in/return`,
        jars,
      );
      return { jars, callback };
    }

    it("refuses an agent revoked while the owner signs in, without sending the browser back to it", async () => {
      const { jars, callback } = await untilReturn();
      await rig.layer.run(
        {
          sql: "UPDATE agent SET revoked_at = @at WHERE client_id = @id",
          params: { at: Date.now(), id: DOCUMENT_AGENT.client_id },
        },
        never(),
      );

      const next = await rig.issuer.finishSignIn(
        callback,
        cookiesOf(jars, rig.origin),
        never(),
      );

      // The provider will not send a revoked agent's browser back to it: it shows the refusal.
      expect(next.kind).toBe("continue");
      const url = next.kind === "continue" ? next.url : "";
      await expect(browse(url, redirectUri, jars)).rejects.toThrow(
        /400: .*access_denied/,
      );
    });

    it("says the link has expired when its authorization ended first", async () => {
      const { jars, callback } = await untilReturn();
      await rig.layer.run(
        {
          sql: "DELETE FROM oidc_item WHERE model = 'Interaction'",
          params: {},
        },
        never(),
      );

      await expect(
        rig.issuer.finishSignIn(callback, cookiesOf(jars, rig.origin), never()),
      ).rejects.toMatchObject({ kind: "link_expired" });
    });

    it("leaves a return that is not one of its sign-ins to Web, and takes each only once", async () => {
      const { jars, callback } = await untilReturn();
      const cookies = cookiesOf(jars, rig.origin);
      const stranger = new URLSearchParams({ state: "not-one-of-ours" });

      await expect(
        rig.issuer.finishSignIn(stranger, cookies, never()),
      ).resolves.toEqual({ kind: "not_issuer" });
      await expect(
        rig.issuer.finishSignIn(new URLSearchParams(), cookies, never()),
      ).resolves.toEqual({ kind: "not_issuer" });
      await expect(
        rig.issuer.finishSignIn(callback, cookies, never()),
      ).resolves.toMatchObject({ kind: "continue" });
      await expect(
        rig.issuer.finishSignIn(callback, cookies, never()),
      ).resolves.toEqual({ kind: "not_issuer" });
    });

    it("refuses a return whose binding cookie is wrong, before Entra's code is redeemed, and ends the link", async () => {
      const { jars, callback } = await untilReturn();
      const cookies = cookiesOf(jars, rig.origin);
      expect(cookies).toMatch(/issuer_link=[^;]+/);
      const forged = cookies.replace(
        /issuer_link=[^;]+/,
        "issuer_link=forged-value",
      );

      await expect(
        rig.issuer.finishSignIn(callback, forged, never()),
      ).resolves.toEqual({ kind: "other_browser" });
      await expect(
        rig.issuer.finishSignIn(callback, cookies, never()),
      ).resolves.toEqual({ kind: "not_issuer" });
      const uid = jars.get(rig.origin)?.get("issuer_resume");
      const reply = await browse(
        `${rig.issuerUrl}/auth/${textOf(uid)}`,
        redirectUri,
        jars,
      );
      expect(reply.get("error")).toBe("access_denied");
      expect(reply.has("code")).toBe(false);
    });

    it("answers 400 to an interaction link the browser holds no cookie for", async () => {
      const response = await fetch(`${rig.issuerUrl}/interaction/no-such-uid`);

      expect(response.status).toBe(400);
      expect(await response.text()).toContain("expired");
    });

    it("answers 503 when Entra cannot be reached, and 500 for anything else, logging only that", async () => {
      rig.failNextSignIn(
        new SecurityError("sign_in_unavailable", "Entra is not answering."),
      );
      await expect(untilReturn()).rejects.toThrow(/503/);

      rig.failNextSignIn(new Error("unexpected"));
      await expect(untilReturn()).rejects.toThrow(/500/);
      expect(rig.logLines.join("\n")).toContain("issuer_sign_in_failed");
    });
  });

  describe("tokens over time", () => {
    async function linked(): Promise<Tokens> {
      return link(
        rig,
        DOCUMENT_AGENT.client_id,
        textOf(DOCUMENT_AGENT.redirect_uris[0]),
      );
    }

    it("ends an access token after 1 hour", async () => {
      const tokens = await linked();
      advance(HOUR_MS - SECOND_MS);
      expect(
        await rig.grants.find("AccessToken", tokens.access_token, never()),
      ).toBeDefined();

      advance(2 * SECOND_MS);

      expect(
        await rig.grants.find("AccessToken", tokens.access_token, never()),
      ).toBeUndefined();
    });

    it("rotates the refresh token on each use, and ends one unused for 30 days", async () => {
      const tokens = await linked();
      advance(29 * DAY_MS);
      const rotated = await refresh(
        rig,
        DOCUMENT_AGENT.client_id,
        textOf(tokens.refresh_token),
      );
      expect(rotated.status).toBe(200);
      expect(rotated.body.refresh_token).not.toBe(tokens.refresh_token);
      expect(rotated.body).toMatchObject({ expires_in: 3600, scope: "read" });

      advance(30 * DAY_MS + SECOND_MS);
      const idle = await refresh(
        rig,
        DOCUMENT_AGENT.client_id,
        textOf(rotated.body.refresh_token),
      );

      expect(idle).toMatchObject({
        status: 400,
        body: { error: "invalid_grant" },
      });
    });

    it("ends every refresh token 90 days after the owner's sign-in, however often it is used", async () => {
      let refreshToken = textOf((await linked()).refresh_token);
      for (let use = 0; use < 3; use += 1) {
        advance(29 * DAY_MS);
        const reply = await refresh(
          rig,
          DOCUMENT_AGENT.client_id,
          refreshToken,
        );
        expect(reply.status).toBe(200);
        refreshToken = textOf(reply.body.refresh_token);
      }
      // Day 87: the newest token still works until day 90.
      advance(3 * DAY_MS - SECOND_MS);
      const last = await refresh(rig, DOCUMENT_AGENT.client_id, refreshToken);
      expect(last.status).toBe(200);

      advance(2 * SECOND_MS);
      const dead = await refresh(
        rig,
        DOCUMENT_AGENT.client_id,
        textOf(last.body.refresh_token),
      );

      expect(dead).toMatchObject({
        status: 400,
        body: { error: "invalid_grant" },
      });
    });

    it("refuses a reused refresh token and ends its whole grant", async () => {
      const tokens = await linked();
      const first = textOf(tokens.refresh_token);
      const rotated = await refresh(rig, DOCUMENT_AGENT.client_id, first);
      expect(rotated.status).toBe(200);

      const reused = await refresh(rig, DOCUMENT_AGENT.client_id, first);
      expect(reused).toMatchObject({
        status: 400,
        body: { error: "invalid_grant" },
      });

      const next = await refresh(
        rig,
        DOCUMENT_AGENT.client_id,
        textOf(rotated.body.refresh_token),
      );
      expect(next).toMatchObject({
        status: 400,
        body: { error: "invalid_grant" },
      });
      expect(
        await rig.grants.find(
          "AccessToken",
          textOf(rotated.body.access_token),
          never(),
        ),
      ).toBeUndefined();
    });
  });

  // T024: access tokens are opaque, so the MCP Endpoint asks the Issuer about each one.
  describe("checking an access token for the MCP endpoint", () => {
    async function linked(): Promise<Tokens> {
      return link(
        rig,
        DOCUMENT_AGENT.client_id,
        textOf(DOCUMENT_AGENT.redirect_uris[0]),
      );
    }

    it("finds a linked agent's token good for read, for the owner, until it ends an hour later", async () => {
      const tokens = await linked();

      expect(
        await rig.issuer.checkAccessToken(tokens.access_token, never()),
      ).toEqual({
        kind: "valid",
        clientId: DOCUMENT_AGENT.client_id,
        subject: rig.standIn.owner.subject,
        scopes: ["read"],
        expiresAt: Math.floor(Date.now() / SECOND_MS) + 3600,
      });

      advance(HOUR_MS + SECOND_MS);
      expect(
        await rig.issuer.checkAccessToken(tokens.access_token, never()),
      ).toEqual({ kind: "invalid" });
    });

    it("refuses a token once its agent is revoked", async () => {
      const tokens = await linked();
      await rig.layer.run(
        {
          sql: "UPDATE agent SET revoked_at = @at WHERE client_id = @id",
          params: { at: Date.now(), id: DOCUMENT_AGENT.client_id },
        },
        never(),
      );

      expect(
        await rig.issuer.checkAccessToken(tokens.access_token, never()),
      ).toEqual({ kind: "invalid" });
    });

    it("refuses a token whose grant ended when a refresh token was reused", async () => {
      const tokens = await linked();
      const first = textOf(tokens.refresh_token);
      const rotated = await refresh(rig, DOCUMENT_AGENT.client_id, first);
      expect(rotated.status).toBe(200);
      await refresh(rig, DOCUMENT_AGENT.client_id, first);

      expect(
        await rig.issuer.checkAccessToken(
          textOf(rotated.body.access_token),
          never(),
        ),
      ).toEqual({ kind: "invalid" });
    });

    it("refuses an unknown value, a token for another resource, and one under a grant that is gone", async () => {
      const tokens = await linked();
      const stored = await rig.grants.find(
        "AccessToken",
        tokens.access_token,
        never(),
      );
      if (stored === undefined) {
        throw new Error("The access token was not stored.");
      }
      expect(await rig.issuer.checkAccessToken("unknown", never())).toEqual({
        kind: "invalid",
      });

      await rig.grants.upsert(
        "AccessToken",
        tokens.access_token,
        { ...stored, aud: "https://elsewhere.example.test/mcp" },
        3000,
        never(),
      );
      expect(
        await rig.issuer.checkAccessToken(tokens.access_token, never()),
      ).toEqual({ kind: "invalid" });

      await rig.grants.upsert(
        "AccessToken",
        tokens.access_token,
        stored,
        3000,
        never(),
      );
      expect(
        (await rig.issuer.checkAccessToken(tokens.access_token, never())).kind,
      ).toBe("valid");
      await rig.grants.destroy("Grant", textOf(stored.grantId), never());
      expect(
        await rig.issuer.checkAccessToken(tokens.access_token, never()),
      ).toEqual({ kind: "invalid" });
    });

    it("says it cannot tell while its store is down, rather than calling the token bad", async () => {
      const tokens = await linked();
      await rig.layer.close();

      expect(
        await rig.issuer.checkAccessToken(tokens.access_token, never()),
      ).toEqual({ kind: "unavailable" });
    });
  });
});

// T024: the agent's real token at the MCP Endpoint, which asks this Issuer about it. One value is
// the Issuer's resource, the endpoint's URL and the metadata's resource.
describe("the Issuer's tokens at the MCP endpoint", () => {
  let rig: Rig;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(START);
    if (signingKeys.length === 0) {
      signingKeys = [generateSigningKey(), generateSigningKey()];
    }
    rig = await startRig({ mcp: true });
    publishDocument(rig);
  });

  afterEach(async () => {
    await rig.close();
    vi.useRealTimers();
  });

  async function linkedToken(): Promise<string> {
    const tokens = await link(
      rig,
      DOCUMENT_AGENT.client_id,
      textOf(DOCUMENT_AGENT.redirect_uris[0]),
    );
    return tokens.access_token;
  }

  it.each<ProtocolEra>(["legacy", "modern"])(
    "lets a linked agent read with its token in the %s era, until the token ends or the agent is revoked",
    async (era) => {
      const accessToken = await linkedToken();
      const agent = await connectOverHttp(new URL(rig.resource), {
        accessToken,
        era,
      });
      try {
        expect(agent.client.getProtocolEra()).toBe(era);
        const health = await agent.client.callTool({
          name: "get_health",
          arguments: {},
        });
        expect(health.isError).toBeFalsy();
      } finally {
        await agent.close();
      }

      advance(HOUR_MS + SECOND_MS);
      const expired = connectOverHttp(new URL(rig.resource), {
        accessToken,
        era,
      });
      await expect(expired).rejects.toBeInstanceOf(SdkHttpError);
      await expect(expired).rejects.toMatchObject({ status: 401 });

      const fresh = await linkedToken();
      await rig.layer.run(
        {
          sql: "UPDATE agent SET revoked_at = @at WHERE client_id = @id",
          params: { at: Date.now(), id: DOCUMENT_AGENT.client_id },
        },
        never(),
      );
      await expect(
        connectOverHttp(new URL(rig.resource), { accessToken: fresh, era }),
      ).rejects.toMatchObject({ status: 401 });
    },
  );

  it("points an agent without a token to this Issuer, through the protected-resource metadata", async () => {
    const refused = await fetch(rig.resource, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    const metadataUrl = /resource_metadata="([^"]+)"/.exec(
      refused.headers.get("www-authenticate") ?? "",
    )?.[1];

    expect(refused.status).toBe(401);
    const metadata = (await (await fetch(textOf(metadataUrl))).json()) as {
      readonly resource: string;
      readonly authorization_servers: readonly string[];
    };
    expect(metadata.resource).toBe(rig.resource);
    expect(metadata.authorization_servers).toEqual([rig.issuerUrl]);
    expect((await metadataOf(rig)).issuer).toBe(rig.issuerUrl);
  });
});

describe("the Issuer's signing keys", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(START);
    if (signingKeys.length === 0) {
      signingKeys = [generateSigningKey(), generateSigningKey()];
    }
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("publishes the current and the previous key, and signs with the current one", async () => {
    const [current, previous] = signingKeys;
    const rig = await startRig({
      keys: signingKeyDocument(signingKeys),
    });
    try {
      publishDocument(rig);
      const jwks = (await (await fetch(`${rig.issuerUrl}/jwks`)).json()) as {
        keys: { kid: string; d?: string }[];
      };
      expect(jwks.keys.map((key) => key.kid)).toEqual([
        current?.kid,
        previous?.kid,
      ]);
      expect(jwks.keys.some((key) => key.d !== undefined)).toBe(false);

      const tokens = await link(
        rig,
        DOCUMENT_AGENT.client_id,
        textOf(DOCUMENT_AGENT.redirect_uris[0]),
        "openid read",
      );

      expect(decodeProtectedHeader(textOf(tokens.id_token)).kid).toBe(
        current?.kid,
      );
    } finally {
      await rig.close();
    }
  });

  it("waits for its keys while the secret is not set, answering 503", async () => {
    const rig = await startRig({ keys: undefined });
    try {
      expect(rig.started).toBe("signing_keys_missing");
      const response = await fetch(
        `${rig.issuerUrl}/.well-known/openid-configuration`,
      );
      expect(response.status).toBe(503);
      expect(await rig.issuer.checkAccessToken("any", never())).toEqual({
        kind: "unavailable",
      });
    } finally {
      await rig.close();
    }
  });

  it.each<[string, string]>([
    ["not JSON", "{"],
    ["no keys", JSON.stringify({ keys: [] })],
    ["three keys", "three"],
    ["a key without its private part", "public"],
    ["the same key twice", "twice"],
  ])("refuses a key document with %s, quoting none of it", (_label, kind) => {
    const [current, previous] = signingKeys;
    if (current === undefined || previous === undefined) {
      throw new Error("keys were not made");
    }
    const publicPart = Object.fromEntries(
      Object.entries(current).filter(([name]) => name !== "d"),
    );
    const documents: Readonly<Record<string, string>> = {
      three: signingKeyDocument([current, previous]).replace(
        /]}$/,
        `,${JSON.stringify(previous)}]}`,
      ),
      public: JSON.stringify({ keys: [publicPart] }),
      twice: JSON.stringify({ keys: [current, current] }),
    };
    const document = documents[kind] ?? kind;

    let error: unknown;
    try {
      parseSigningKeys(document);
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(IssuerError);
    expect((error as IssuerError).kind).toBe("signing_keys_unreadable");
    expect((error as IssuerError).message).not.toContain(current.d);
  });

  it("derives a distinct cookie key from each signing key, newest first", () => {
    const keys = parseSigningKeys(signingKeyDocument(signingKeys));

    expect(keys.cookieKeys).toHaveLength(2);
    expect(new Set(keys.cookieKeys).size).toBe(2);
    expect(
      parseSigningKeys(signingKeyDocument(signingKeys.slice(1))).cookieKeys,
    ).toEqual([keys.cookieKeys[1]]);
  });
});
