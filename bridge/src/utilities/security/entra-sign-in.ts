// The owner's Entra sign-in (SC1, R16; FR-029): the authorization code flow with PKCE (S256), state
// and nonce. The bridge proves who it is with a client assertion (the core's managed identity as a
// federated credential, R12), never a client secret. The ID token is checked with jose against the
// issuer's published keys (OIDC Core §3.1.3.7). Nothing that Entra sends is copied into an error.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { errors, jwtVerify } from "jose";
import type { JWTPayload } from "jose";
import { z } from "zod";
import type { Clock } from "../clock/index.ts";
import {
  HTTP_OK,
  discoverIssuer,
  isSafeEndpoint,
  readJson,
} from "./entra-discovery.ts";
import type { HttpFetch, IssuerEndpoints } from "./entra-discovery.ts";
import { SecurityError } from "./security-error.ts";

const RANDOM_BYTES = 32;
const SCOPE = "openid";
const MS_PER_SECOND = 1000;
const PENDING_MAX_AGE_MS = 10 * 60 * MS_PER_SECOND;
const TOKEN_TIMEOUT_MS = 10_000;
const CLOCK_TOLERANCE_S = 120;
const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_SERVER_ERROR = 500;
// Entra signs ID tokens with RS256; pinning it refuses `none` and HMAC tokens.
const ID_TOKEN_ALGORITHMS = ["RS256"];
const REQUIRED_CLAIMS = ["sub", "iat", "exp", "nonce"];
const CLIENT_ASSERTION_TYPE =
  "urn:ietf:params:oauth:client-assertion-type:jwt-bearer";

// OAuth error codes (RFC 6749 §4.1.2.1, OIDC Core §3.1.2.6) by what the owner sees.
const REFUSED_ERRORS: ReadonlySet<string> = new Set([
  "access_denied",
  "consent_required",
  "interaction_required",
  "login_required",
  "account_selection_required",
]);
const UNAVAILABLE_ERRORS: ReadonlySet<string> = new Set([
  "temporarily_unavailable",
  "server_error",
]);

const tokenReplySchema = z.object({ id_token: z.string().min(1) });

/**
 * Produces the client assertion: a short-lived JWT from the core's managed identity in the bridge,
 * a stand-in in tests.
 */
export type ClientAssertionSource = (signal: AbortSignal) => Promise<string>;

/** Where the owner signs in. Read from the environment by the core's wiring. */
export interface EntraSignInSettings {
  /** The tenant's issuer, such as `https://login.microsoftonline.com/<tenant>/v2.0`. */
  readonly issuer: string;
  /** The app registration's client id. */
  readonly clientId: string;
  /** The bridge's sign-in return URL, registered on the app registration. */
  readonly redirectUri: string;
}

/** The seams the Entra sign-in uses. */
export interface EntraSignInDependencies {
  readonly clock: Clock;
  readonly fetch: HttpFetch;
  readonly clientAssertion: ClientAssertionSource;
}

/** How to start a sign-in. */
export interface SignInStartOptions {
  /** Make the owner enter their credentials again (`prompt=login`): the admin and confirm pages. */
  readonly fresh: boolean;
}

/** What Web keeps between the redirect to Entra and the return, out of the owner's reach. */
export interface PendingSignIn {
  readonly state: string;
  readonly nonce: string;
  readonly codeVerifier: string;
  readonly startedAt: number;
  readonly fresh: boolean;
}

/** Where to send the owner's browser, and what to keep until they return. */
export interface SignInRedirect {
  readonly url: string;
  readonly pending: PendingSignIn;
}

/** Who signed in, and when. */
export interface OwnerIdentity {
  /** Entra's `sub` for this app registration: tokens and confirmations are bound to it (R16). */
  readonly subject: string;
  /** When the owner last entered their credentials, in epoch milliseconds. */
  readonly authenticatedAt: number;
  /** `auth_time` when the app registration asks for that optional claim; otherwise the token's `iat`. */
  readonly authenticatedAtSource: "auth_time" | "issued_at";
}

/** The owner's sign-in, as Web and the Issuer use it. Tests of those pages use a fake. */
export interface OwnerSignIn {
  /** Starts a sign-in. */
  begin(
    options: SignInStartOptions,
    signal: AbortSignal,
  ): Promise<SignInRedirect>;
  /** Finishes it from the return URL's query. Throws `SecurityError` with a `sign_in_*` kind. */
  complete(
    pending: PendingSignIn,
    callback: URLSearchParams,
    signal: AbortSignal,
  ): Promise<OwnerIdentity>;
}

function randomText(): string {
  return randomBytes(RANDOM_BYTES).toString("base64url");
}

function challengeFor(codeVerifier: string): string {
  return createHash("sha256").update(codeVerifier, "ascii").digest("base64url");
}

function sameText(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, "utf8");
  const rightBytes = Buffer.from(right, "utf8");
  return (
    leftBytes.byteLength === rightBytes.byteLength &&
    timingSafeEqual(leftBytes, rightBytes)
  );
}

function invalid(message: string, cause?: unknown): SecurityError {
  return new SecurityError(
    "sign_in_invalid",
    message,
    cause === undefined ? undefined : { cause },
  );
}

function unavailable(message: string, cause?: unknown): SecurityError {
  return new SecurityError(
    "sign_in_unavailable",
    message,
    cause === undefined ? undefined : { cause },
  );
}

function errorReplyFor(code: string): SecurityError {
  if (REFUSED_ERRORS.has(code)) {
    return new SecurityError(
      "sign_in_refused",
      "Entra did not sign the owner in.",
    );
  }
  if (UNAVAILABLE_ERRORS.has(code)) {
    return unavailable("Entra could not sign the owner in right now.");
  }
  return invalid("Entra refused the sign-in request.");
}

function tokenFailureFor(status: number): SecurityError {
  if (status === HTTP_TOO_MANY_REQUESTS || status >= HTTP_SERVER_ERROR) {
    return unavailable("Entra's token endpoint is not answering.");
  }
  return invalid("Entra refused to redeem the authorization code.");
}

// A JOSE error is about the token itself, except a generic one (the keys' reply) and a timeout.
function idTokenFailureFor(error: unknown): SecurityError {
  if (
    error instanceof errors.JOSEError &&
    error.code !== "ERR_JOSE_GENERIC" &&
    error.code !== "ERR_JWKS_TIMEOUT"
  ) {
    return invalid("The ID token failed its checks.", error);
  }
  return unavailable("Entra's signing keys could not be read.", error);
}

function checkSettings(settings: EntraSignInSettings): void {
  if (
    !isSafeEndpoint(settings.issuer) ||
    !isSafeEndpoint(settings.redirectUri) ||
    settings.clientId.trim() === ""
  ) {
    throw new SecurityError(
      "invalid_settings",
      "The Entra sign-in settings are not valid.",
    );
  }
}

function authenticationTime(
  payload: JWTPayload,
  pending: PendingSignIn,
): Pick<OwnerIdentity, "authenticatedAt" | "authenticatedAtSource"> {
  if (typeof payload.auth_time !== "number") {
    return {
      authenticatedAt: (payload.iat ?? 0) * MS_PER_SECOND,
      authenticatedAtSource: "issued_at",
    };
  }
  const authenticatedAt = payload.auth_time * MS_PER_SECOND;
  const earliest = pending.startedAt - CLOCK_TOLERANCE_S * MS_PER_SECOND;
  if (pending.fresh && authenticatedAt < earliest) {
    throw invalid("The owner was not asked for their credentials again.");
  }
  return { authenticatedAt, authenticatedAtSource: "auth_time" };
}

/**
 * The owner's sign-in through Entra ID. Reads the issuer's discovery document on first use and
 * again after a failure. Throws `SecurityError` (`invalid_settings`) from the constructor when the
 * settings cannot be used.
 */
export class EntraOwnerSignIn implements OwnerSignIn {
  readonly #settings: EntraSignInSettings;
  readonly #dependencies: EntraSignInDependencies;
  #endpoints: Promise<IssuerEndpoints> | undefined;

  constructor(
    settings: EntraSignInSettings,
    dependencies: EntraSignInDependencies,
  ) {
    checkSettings(settings);
    this.#settings = { ...settings };
    this.#dependencies = dependencies;
  }

  async begin(
    options: SignInStartOptions,
    signal: AbortSignal,
  ): Promise<SignInRedirect> {
    const endpoints = await this.#endpointsFor(signal);
    const pending: PendingSignIn = {
      state: randomText(),
      nonce: randomText(),
      codeVerifier: randomText(),
      startedAt: this.#dependencies.clock.now(),
      fresh: options.fresh,
    };
    const url = new URL(endpoints.authorizationEndpoint);
    const query: Readonly<Record<string, string>> = {
      client_id: this.#settings.clientId,
      response_type: "code",
      response_mode: "query",
      redirect_uri: this.#settings.redirectUri,
      scope: SCOPE,
      state: pending.state,
      nonce: pending.nonce,
      code_challenge: challengeFor(pending.codeVerifier),
      code_challenge_method: "S256",
    };
    for (const [name, value] of Object.entries(query)) {
      url.searchParams.set(name, value);
    }
    if (options.fresh) {
      url.searchParams.set("prompt", "login");
    }
    return { url: url.href, pending };
  }

  async complete(
    pending: PendingSignIn,
    callback: URLSearchParams,
    signal: AbortSignal,
  ): Promise<OwnerIdentity> {
    const code = this.#codeFrom(pending, callback);
    const endpoints = await this.#endpointsFor(signal);
    const idToken = await this.#redeem(endpoints, code, pending, signal);
    const payload = await this.#verify(endpoints, idToken);
    return this.#identityFrom(payload, pending);
  }

  async #endpointsFor(signal: AbortSignal): Promise<IssuerEndpoints> {
    signal.throwIfAborted();
    this.#endpoints ??= discoverIssuer(
      this.#settings.issuer,
      this.#dependencies.fetch,
    ).catch((error: unknown) => {
      this.#endpoints = undefined;
      throw error;
    });
    const endpoints = await this.#endpoints;
    signal.throwIfAborted();
    return endpoints;
  }

  // The checks made before anything is sent to Entra: age, state, an error reply, the code.
  #codeFrom(pending: PendingSignIn, callback: URLSearchParams): string {
    const age = this.#dependencies.clock.now() - pending.startedAt;
    if (age > PENDING_MAX_AGE_MS) {
      throw invalid("The sign-in took too long; start it again.");
    }
    if (!sameText(callback.get("state") ?? "", pending.state)) {
      throw invalid("The sign-in reply does not belong to this sign-in.");
    }
    const error = callback.get("error");
    if (error !== null) {
      throw errorReplyFor(error);
    }
    const code = callback.get("code");
    if (code === null || code === "") {
      throw invalid("The sign-in reply holds no authorization code.");
    }
    return code;
  }

  async #redeem(
    endpoints: IssuerEndpoints,
    code: string,
    pending: PendingSignIn,
    signal: AbortSignal,
  ): Promise<string> {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: this.#settings.redirectUri,
      client_id: this.#settings.clientId,
      code_verifier: pending.codeVerifier,
      client_assertion_type: CLIENT_ASSERTION_TYPE,
      client_assertion: await this.#clientAssertion(signal),
    });
    const response = await this.#post(endpoints.tokenEndpoint, body, signal);
    if (response.status !== HTTP_OK) {
      throw tokenFailureFor(response.status);
    }
    const reply = tokenReplySchema.safeParse(await readJson(response));
    if (!reply.success) {
      throw unavailable("Entra's token reply could not be read.");
    }
    return reply.data.id_token;
  }

  async #clientAssertion(signal: AbortSignal): Promise<string> {
    try {
      return await this.#dependencies.clientAssertion(signal);
    } catch (error) {
      signal.throwIfAborted();
      throw unavailable(
        "The core's managed identity gave no client assertion.",
        error,
      );
    }
  }

  async #post(
    url: URL,
    body: URLSearchParams,
    signal: AbortSignal,
  ): Promise<Response> {
    try {
      return await this.#dependencies.fetch(url.href, {
        method: "POST",
        headers: { accept: "application/json" },
        body,
        redirect: "error",
        signal: AbortSignal.any([
          signal,
          AbortSignal.timeout(TOKEN_TIMEOUT_MS),
        ]),
      });
    } catch (error) {
      signal.throwIfAborted();
      throw unavailable("Entra's token endpoint could not be reached.", error);
    }
  }

  async #verify(
    endpoints: IssuerEndpoints,
    idToken: string,
  ): Promise<JWTPayload> {
    try {
      const { payload } = await jwtVerify(idToken, endpoints.signingKeys, {
        issuer: endpoints.issuer,
        audience: this.#settings.clientId,
        algorithms: ID_TOKEN_ALGORITHMS,
        requiredClaims: REQUIRED_CLAIMS,
        currentDate: new Date(this.#dependencies.clock.now()),
        clockTolerance: CLOCK_TOLERANCE_S,
      });
      return payload;
    } catch (error) {
      throw idTokenFailureFor(error);
    }
  }

  #identityFrom(payload: JWTPayload, pending: PendingSignIn): OwnerIdentity {
    if (
      typeof payload.nonce !== "string" ||
      !sameText(payload.nonce, pending.nonce)
    ) {
      throw invalid("The ID token was not issued for this sign-in.");
    }
    const audiences = Array.isArray(payload.aud) ? payload.aud : [];
    if (audiences.length > 1 && payload.azp !== this.#settings.clientId) {
      throw invalid("The ID token was issued to another party.");
    }
    if (payload.sub === undefined || payload.sub === "") {
      throw invalid("The ID token names no subject.");
    }
    return { subject: payload.sub, ...authenticationTime(payload, pending) };
  }
}
