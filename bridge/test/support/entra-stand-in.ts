// A stand-in for Entra ID in tests (T010, I4): a second oidc-provider 9.13.3 on 127.0.0.1 with
// Entra's shape: the issuer `http://127.0.0.1:<port>/<tenant-id>/v2.0`, ID tokens carrying `tid`
// and `oid`, a client that authenticates with a signed assertion (as the core's managed identity
// does), and `auth_time` in every ID token. It signs in one owner, with no login page: an
// interaction completes at once, and `signInAsOwner` plays the owner's browser. Every id is made at
// start, so no fixed id appears in the repository.
import { randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { SignJWT, exportJWK, generateKeyPair } from "jose";
import type { CryptoKey } from "jose";
import { Provider } from "oidc-provider";
import type { Account, InteractionDetails } from "oidc-provider";

const ALGORITHM = "RS256";
const CLIENT_KEY_ID = "client";
const PROVIDER_KEY_ID = "stand-in";
const SUBJECT_BYTES = 16;
const COOKIE_KEY_BYTES = 32;
const ASSERTION_LIFETIME = "1m";
const MAX_REDIRECTS = 10;
const NOT_FOUND = 404;
const SERVER_ERROR = 500;
const EXPIRED_COOKIE = /expires=thu, 01 jan 1970/i;

/** The owner the stand-in signs in. */
export interface StandInOwner {
  /** The ID token's `sub`, opaque as Entra's pairwise subject is. */
  readonly subject: string;
  /** The ID token's `oid`. */
  readonly objectId: string;
}

/** A running Entra stand-in. */
export interface EntraStandIn {
  /** `http://127.0.0.1:<port>/<tenant-id>/v2.0`, as Entra names a tenant's issuer. */
  readonly issuer: string;
  readonly tenantId: string;
  readonly clientId: string;
  readonly owner: StandInOwner;
  /** A signed client assertion for the token endpoint, in place of the managed identity's. */
  clientAssertion(signal: AbortSignal): Promise<string>;
  /**
   * Plays the owner's browser: follows the sign-in from the authorization URL to the redirect URI
   * and returns that URI's query.
   */
  signInAsOwner(authorizationUrl: string): Promise<URLSearchParams>;
  close(): Promise<void>;
}

/** Starts a stand-in that accepts one client, redirecting to `redirectUri`. */
export async function startEntraStandIn(options: {
  readonly redirectUri: string;
}): Promise<EntraStandIn> {
  const tenantId = randomUUID();
  const clientId = randomUUID();
  const owner: StandInOwner = {
    subject: randomBytes(SUBJECT_BYTES).toString("base64url"),
    objectId: randomUUID(),
  };
  const clientKeys = await generateKeyPair(ALGORITHM, { extractable: true });
  const server = createServer();
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const prefix = `/${tenantId}/v2.0`;
  const issuer = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}${prefix}`;
  const provider = new Provider(issuer, {
    clients: [
      {
        client_id: clientId,
        redirect_uris: [options.redirectUri],
        response_types: ["code"],
        grant_types: ["authorization_code"],
        token_endpoint_auth_method: "private_key_jwt",
        token_endpoint_auth_signing_alg: ALGORITHM,
        id_token_signed_response_alg: ALGORITHM,
        require_auth_time: true,
        jwks: { keys: [await publicJwk(clientKeys.publicKey, CLIENT_KEY_ID)] },
      },
    ],
    jwks: { keys: [await privateJwk(PROVIDER_KEY_ID)] },
    cookies: { keys: [randomBytes(COOKIE_KEY_BYTES).toString("hex")] },
    claims: { openid: ["sub", "oid", "tid"] },
    conformIdTokenClaims: false,
    features: { devInteractions: { enabled: false } },
    interactions: {
      url: (_context, interaction) =>
        `${prefix}/interaction/${interaction.uid}`,
    },
    findAccount: (_context, subject) =>
      subject === owner.subject ? ownerAccount(owner, tenantId) : undefined,
  });
  const handle = provider.callback();

  // The provider's routes have no prefix, but it writes its URLs with the issuer's path, read from
  // `originalUrl` as when it is mounted under a path.
  async function route(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    const url = request.url ?? "/";
    if (url.startsWith(`${prefix}/interaction/`)) {
      await completeInteraction(provider, owner, request, response);
      return;
    }
    if (!url.startsWith(prefix)) {
      response.writeHead(NOT_FOUND).end();
      return;
    }
    Object.assign(request, { originalUrl: url });
    request.url = url.slice(prefix.length) || "/";
    handle(request, response);
  }

  server.on("request", (request: IncomingMessage, response: ServerResponse) => {
    route(request, response).catch(() => {
      // The provider may have started its answer before failing.
      if (!response.headersSent) {
        response.writeHead(SERVER_ERROR);
      }
      response.end();
    });
  });

  return {
    issuer,
    tenantId,
    clientId,
    owner,
    clientAssertion: async (signal) => {
      signal.throwIfAborted();
      return await new SignJWT({})
        .setProtectedHeader({ alg: ALGORITHM, kid: CLIENT_KEY_ID })
        .setIssuer(clientId)
        .setSubject(clientId)
        .setAudience(issuer)
        .setJti(randomUUID())
        .setIssuedAt()
        .setExpirationTime(ASSERTION_LIFETIME)
        .sign(clientKeys.privateKey);
    },
    signInAsOwner: (authorizationUrl) =>
      followToRedirect(authorizationUrl, options.redirectUri),
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => {
          if (error === undefined) {
            resolve();
          } else {
            reject(error);
          }
        });
      }),
  };
}

function ownerAccount(owner: StandInOwner, tenantId: string): Account {
  return {
    accountId: owner.subject,
    claims: () => ({ sub: owner.subject, oid: owner.objectId, tid: tenantId }),
  };
}

async function publicJwk(key: CryptoKey, kid: string): Promise<object> {
  return { ...(await exportJWK(key)), kid, alg: ALGORITHM, use: "sig" };
}

async function privateJwk(kid: string): Promise<object> {
  const { privateKey } = await generateKeyPair(ALGORITHM, {
    extractable: true,
  });
  return { ...(await exportJWK(privateKey)), kid, alg: ALGORITHM, use: "sig" };
}

// The owner signs in at once and consents to what the client asked for.
async function completeInteraction(
  provider: Provider,
  owner: StandInOwner,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const details: InteractionDetails = await provider.interactionDetails(
    request,
    response,
  );
  if (details.prompt.name === "login") {
    await provider.interactionFinished(
      request,
      response,
      { login: { accountId: owner.subject } },
      { mergeWithLastSubmission: false },
    );
    return;
  }
  const grant = new provider.Grant({
    accountId: details.session?.accountId ?? owner.subject,
    clientId: String(details.params.client_id),
  });
  grant.addOIDCScope(String(details.params.scope));
  await provider.interactionFinished(
    request,
    response,
    { consent: { grantId: await grant.save() } },
    { mergeWithLastSubmission: true },
  );
}

// A browser's part: follow redirects, keeping the provider's cookies, until the redirect URI.
async function followToRedirect(
  start: string,
  redirectUri: string,
): Promise<URLSearchParams> {
  const cookies = new Map<string, string>();
  let next = start;
  for (let hop = 0; hop < MAX_REDIRECTS; hop += 1) {
    if (next.startsWith(redirectUri)) {
      return new URL(next).searchParams;
    }
    const response = await fetch(next, {
      redirect: "manual",
      headers: { cookie: cookieHeader(cookies) },
    });
    keepCookies(cookies, response.headers.getSetCookie());
    await response.body?.cancel();
    const location = response.headers.get("location");
    if (location === null) {
      throw new Error(
        `The stand-in's sign-in stopped with status ${String(response.status)}.`,
      );
    }
    next = new URL(location, next).href;
  }
  throw new Error("The stand-in's sign-in did not reach the redirect URI.");
}

function cookieHeader(cookies: ReadonlyMap<string, string>): string {
  return [...cookies].map(([name, value]) => `${name}=${value}`).join("; ");
}

function keepCookies(
  cookies: Map<string, string>,
  setCookies: readonly string[],
): void {
  for (const setCookie of setCookies) {
    const [pair = ""] = setCookie.split(";");
    const separator = pair.indexOf("=");
    const name = pair.slice(0, separator).trim();
    if (EXPIRED_COOKIE.test(setCookie)) {
      cookies.delete(name);
    } else {
      cookies.set(name, pair.slice(separator + 1).trim());
    }
  }
}
