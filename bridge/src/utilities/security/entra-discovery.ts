// The issuer's OpenID Connect discovery document (OIDC Discovery 1.0 §4), read once and checked with
// zod. Its issuer must equal the configured one exactly, so endpoints that another issuer
// advertises are never used (the mix-up defence). The ID token keys come from its jwks_uri through
// jose, which fetches them again when Entra rotates a key.
import { createRemoteJWKSet, customFetch } from "jose";
import type { JWTVerifyGetKey } from "jose";
import { z } from "zod";
import { SecurityError } from "./security-error.ts";

/** A fetch-shaped function: the global `fetch` in the bridge, a stand-in in tests. */
export type HttpFetch = (url: string, init: RequestInit) => Promise<Response>;

/** What the sign-in uses from the discovery document. */
export interface IssuerEndpoints {
  readonly issuer: string;
  readonly authorizationEndpoint: URL;
  readonly tokenEndpoint: URL;
  readonly signingKeys: JWTVerifyGetKey;
}

/** The HTTP status of a successful reply. */
export const HTTP_OK = 200;

const DISCOVERY_PATH = "/.well-known/openid-configuration";
const DISCOVERY_TIMEOUT_MS = 10_000;
const KEYS_TIMEOUT_MS = 10_000;
// Plain http is accepted only on the machine itself, for the stand-in Entra in the tests (I4).
const LOOPBACK_HOSTS: ReadonlySet<string> = new Set([
  "localhost",
  "127.0.0.1",
  "[::1]",
]);

const discoverySchema = z.object({
  issuer: z.string(),
  authorization_endpoint: z.string(),
  token_endpoint: z.string(),
  jwks_uri: z.string(),
});

/** True for an https URL, or an http URL on a loopback host. */
export function isSafeEndpoint(text: string): boolean {
  if (!URL.canParse(text)) {
    return false;
  }
  const url = new URL(text);
  return (
    url.protocol === "https:" ||
    (url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname))
  );
}

/** The reply body as JSON, or `undefined` when it is not JSON. */
export async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function unavailable(message: string, cause?: unknown): SecurityError {
  return new SecurityError(
    "sign_in_unavailable",
    message,
    cause === undefined ? undefined : { cause },
  );
}

function endpointUrl(text: string): URL {
  if (!isSafeEndpoint(text)) {
    throw unavailable("The issuer's discovery document lists an unsafe URL.");
  }
  return new URL(text);
}

async function fetchDiscovery(
  issuer: string,
  fetch: HttpFetch,
): Promise<unknown> {
  const url = `${issuer.replace(/\/$/, "")}${DISCOVERY_PATH}`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS),
    });
  } catch (error) {
    throw unavailable(
      "The issuer's discovery document could not be fetched.",
      error,
    );
  }
  if (response.status !== HTTP_OK) {
    throw unavailable("The issuer's discovery document could not be fetched.");
  }
  return readJson(response);
}

/**
 * Reads and checks the issuer's discovery document. Throws `SecurityError` (`sign_in_unavailable`)
 * when it cannot be fetched or read, names another issuer, or lists a URL that is not https.
 */
export async function discoverIssuer(
  issuer: string,
  fetch: HttpFetch,
): Promise<IssuerEndpoints> {
  const parsed = discoverySchema.safeParse(await fetchDiscovery(issuer, fetch));
  if (!parsed.success) {
    throw unavailable("The issuer's discovery document could not be read.");
  }
  if (parsed.data.issuer !== issuer) {
    throw unavailable("The discovery document names a different issuer.");
  }
  return {
    issuer,
    authorizationEndpoint: endpointUrl(parsed.data.authorization_endpoint),
    tokenEndpoint: endpointUrl(parsed.data.token_endpoint),
    signingKeys: createRemoteJWKSet(endpointUrl(parsed.data.jwks_uri), {
      timeoutDuration: KEYS_TIMEOUT_MS,
      [customFetch]: fetch,
    }),
  };
}
