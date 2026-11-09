// The Issuer (T023; FR-029, FR-030, SC1): the bridge's own OAuth 2.1 authorization server, on
// oidc-provider 9.13.3, under `/oauth`. Listed agents link to it; the owner consents by signing in
// with Entra (provider-configuration.ts has the rules).
//
// An agent's authorization reaches the Issuer's interaction route, which starts the owner's Entra
// sign-in and keeps it in flight under its `state`. Entra returns the owner's browser to the core's
// one sign-in return route, which Web serves (T029): Web hands the return and the browser's cookies
// to `finishSignIn`, which checks the sign-in (only the owner, DRIFT-001-39), records the owner's
// consent, and answers where the browser goes next, back into the provider to finish the agent's
// authorization.
//
// The sign-in is bound to the browser that started the link (DRIFT-001-40): sending it to Entra sets
// a random cookie, of which only the hash is kept. A return in a browser without that cookie is
// refused before its code is redeemed, and ends the link, so nobody can start a link from their own
// agent account and have the owner sign in to it from a link they were sent. The provider's resume
// cookie then binds the last step to the same browser.
//
// The Issuer needs its signing keys before it serves anything: `start` reads them from Secrets,
// and reports a missing secret instead of failing (PT-03), for `/readyz` to name.
//
// Access tokens are opaque, so the MCP Endpoint asks the Issuer about each one (T024): it must be
// stored and unexpired, for the one resource, under a grant still in force for the same owner and
// client, and its agent must still be listed. A revocation takes effect on the next call.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Provider } from "oidc-provider";
import type { Interaction, InteractionResults } from "oidc-provider";
import { GrantsStoreError } from "../../access/grants/index.ts";
import type { GrantsStore } from "../../access/grants/index.ts";
import { SettingsStoreError } from "../../access/settings/index.ts";
import type { ListedAgent } from "../../access/settings/index.ts";
import type { CoreSecrets } from "../../access/secrets/index.ts";
import type { Clock } from "../../../utilities/clock/index.ts";
import type { Logger } from "../../../utilities/logging/index.ts";
import { SecurityError } from "../../../utilities/security/index.ts";
import type {
  OwnerIdentity,
  OwnerSignIn,
} from "../../../utilities/security/index.ts";
import { adapterFor } from "./grants-adapter.ts";
import { IssuerError } from "./issuer-error.ts";
import { grantableScopes, ListedAgents } from "./listed-agents.ts";
import type { AgentListing } from "./listed-agents.ts";
import { PendingSignIns } from "./pending-sign-ins.ts";
import { providerConfiguration } from "./provider-configuration.ts";
import { parseSigningKeys } from "./signing-keys.ts";

const HTTP_SEE_OTHER = 303;
const HTTP_BAD_REQUEST = 400;
const HTTP_SERVER_ERROR = 500;
const HTTP_UNAVAILABLE = 503;
const MS_PER_SECOND = 1000;
const SIGN_IN_TIMEOUT_MS = 15_000;
/** The cookie that binds a sign-in to its browser, and how long it lasts: the sign-in's own limit. */
const LINK_COOKIE = "issuer_link";
const LINK_COOKIE_MAX_AGE_S = 600;
const BINDING_BYTES = 32;
/** How long one of the provider hooks' reads may take. */
const HOOK_TIMEOUT_MS = 10_000;
const INTERACTION_PATH = /^\/interaction\/([A-Za-z0-9_-]{1,64})$/;
const RESOURCE_SCOPE = "read";
// The OpenID scopes an agent may ask for alongside `read`; consenting to them grants no data.
const OPENID_SCOPES: ReadonlySet<string> = new Set([
  "openid",
  "offline_access",
]);

/** Where the Issuer is served, and the one resource it issues tokens for. */
export interface IssuerSettings {
  /** The Issuer's identifier and base URL, `https://<core-host>/oauth`. */
  readonly issuer: string;
  /** The MCP endpoint's URL: tokens are issued for it alone (RFC 8707). */
  readonly resource: string;
  /**
   * Trust the proxy in front (App Service's) for `X-Forwarded-Proto`, so a request that reached it
   * over HTTPS counts as secure and the Issuer's secure cookies can be set (T027). Off by default.
   */
  readonly trustProxy?: boolean;
}

/** What the Issuer is wired with. */
export interface IssuerDependencies {
  readonly grants: GrantsStore;
  readonly agents: AgentListing;
  readonly secrets: CoreSecrets;
  readonly ownerSignIn: OwnerSignIn;
  /**
   * Times the sign-ins in flight. It must read the same time as `Date`, which oidc-provider and the
   * token lifetimes read: `SystemClock` in the bridge, and a faked `Date` in tests.
   */
  readonly clock: Clock;
  readonly logger: Logger;
  /** Fetches a client ID metadata document: the global `fetch` in the bridge. */
  readonly fetch: (url: string, options: RequestInit) => Promise<Response>;
}

/** What `start` found: the Issuer serves, or waits for its signing keys. */
export type IssuerStart = "ready" | "signing_keys_missing";

/** What became of a return from Entra. */
export type LinkReturn =
  /** Not one of the Issuer's sign-ins: Web treats it as its own. */
  | { readonly kind: "not_issuer" }
  /** Send the browser here, into the provider, which answers the agent with a code or a refusal. */
  | { readonly kind: "continue"; readonly url: string }
  /**
   * The sign-in came back to a browser that did not start the link. Nothing was redeemed and the
   * link has ended; Web asks the owner to start it again from the agent.
   */
  | { readonly kind: "other_browser" };

/** What an access token is good for, if anything. */
export type AccessCheck =
  /** It may be used now: whose it is, for which agent, its scopes, and when it ends. */
  | {
      readonly kind: "valid";
      readonly clientId: string;
      /** The owner's Entra `sub` for the bridge's app registration. */
      readonly subject: string;
      readonly scopes: readonly string[];
      /** When it ends, in seconds since 1970. */
      readonly expiresAt: number;
    }
  /** Unknown, expired, for another resource, revoked, or its agent is no longer listed. */
  | { readonly kind: "invalid" }
  /**
   * The Issuer cannot tell now: it has no signing keys yet, or its store is down. The agent's token
   * may be fine, so it is not told otherwise.
   */
  | { readonly kind: "unavailable" };

const INVALID: AccessCheck = { kind: "invalid" };
const UNAVAILABLE: AccessCheck = { kind: "unavailable" };

/** The Issuer. One per core process, in mode H only: mode A has no owner sign-in. */
export class Issuer {
  readonly #settings: IssuerSettings;
  readonly #dependencies: IssuerDependencies;
  readonly #basePath: string;
  readonly #agents: ListedAgents;
  readonly #pending: PendingSignIns;
  readonly #lifetime = new AbortController();
  #provider: Provider | undefined;
  #serve:
    ((request: IncomingMessage, response: ServerResponse) => void) | undefined;

  constructor(settings: IssuerSettings, dependencies: IssuerDependencies) {
    this.#settings = { ...settings };
    this.#dependencies = dependencies;
    this.#basePath = new URL(settings.issuer).pathname.replace(/\/$/, "");
    this.#agents = new ListedAgents(dependencies.agents);
    this.#pending = new PendingSignIns(dependencies.clock);
  }

  /**
   * Reads the signing keys and starts serving. Throws `IssuerError` (`signing_keys_unreadable`)
   * for a key document it cannot use, and the Secrets error when the secret cannot be read.
   */
  async start(signal: AbortSignal): Promise<IssuerStart> {
    const lookup = await this.#dependencies.secrets.read(
      "issuer-signing-keys",
      signal,
    );
    if (lookup.kind === "missing") {
      return "signing_keys_missing";
    }
    const keys = parseSigningKeys(lookup.value.reveal());
    const provider = new Provider(
      this.#settings.issuer,
      providerConfiguration({
        basePath: this.#basePath,
        resource: this.#settings.resource,
        keys,
        agents: this.#agents,
        adapter: adapterFor({
          grants: this.#dependencies.grants,
          agents: this.#agents,
          lifetime: this.#lifetime.signal,
        }),
        fetch: this.#dependencies.fetch,
        signal: () =>
          AbortSignal.any([
            this.#lifetime.signal,
            AbortSignal.timeout(HOOK_TIMEOUT_MS),
          ]),
      }),
    );
    provider.proxy = this.#settings.trustProxy === true;
    provider.on("server_error", (_context, error) => {
      this.#dependencies.logger.error(
        "issuer_request_failed",
        undefined,
        error,
      );
    });
    this.#provider = provider;
    this.#serve = provider.callback();
    return "ready";
  }

  /** Whether a request's path is the Issuer's: its base path or anything under it. */
  owns(request: IncomingMessage): boolean {
    const path = (request.url ?? "/").split("?")[0] ?? "/";
    return path === this.#basePath || path.startsWith(`${this.#basePath}/`);
  }

  /** Serves a request under the Issuer's path. Answers 503 until `start` has found the keys. */
  handle(request: IncomingMessage, response: ServerResponse): void {
    const serve = this.#serve;
    if (serve === undefined) {
      answer(response, HTTP_UNAVAILABLE, "The bridge's sign-in is not ready.");
      return;
    }
    const url = request.url ?? "/";
    const path = url.slice(this.#basePath.length) || "/";
    const interaction = INTERACTION_PATH.exec(path.split("?")[0] ?? "");
    if (interaction?.[1] !== undefined && request.method === "GET") {
      this.#beginSignIn(interaction[1], request, response).catch(
        (error: unknown) => {
          this.#failed(response, error);
        },
      );
      return;
    }
    // The provider's routes have no prefix, but it writes its URLs with the issuer's path, read from
    // `originalUrl` as when it is mounted under a path.
    Object.assign(request, { originalUrl: url });
    request.url = path;
    serve(request, response);
  }

  /**
   * Finishes a link from the owner's return from Entra: the query of the core's sign-in return URL
   * and the returning browser's `Cookie` header. A sign-in that fails its checks, or by someone other
   * than the owner, ends the agent's authorization with `access_denied`; so does a return in a
   * browser that did not start the link, before anything is redeemed. Each sign-in is finished
   * once. Throws `IssuerError` (`link_expired`) when the authorization has ended.
   */
  async finishSignIn(
    callback: URLSearchParams,
    cookies: string | undefined,
    signal: AbortSignal,
  ): Promise<LinkReturn> {
    const state = callback.get("state");
    const link = state === null ? undefined : this.#pending.take(state);
    if (link === undefined) {
      return { kind: "not_issuer" };
    }
    const provider = this.#started();
    const interaction = await provider.Interaction.find(link.uid);
    if (interaction === undefined) {
      throw new IssuerError(
        "link_expired",
        "The agent's authorization ended before the owner signed in.",
      );
    }
    if (!sameBrowser(link.binding, cookies)) {
      interaction.result = {
        error: "access_denied",
        error_description: "The sign-in finished in another browser.",
      };
      await saveInteraction(interaction);
      return { kind: "other_browser" };
    }
    let result: InteractionResults;
    try {
      const owner = await this.#dependencies.ownerSignIn.complete(
        link.pending,
        callback,
        signal,
      );
      result = await this.#consent(provider, interaction.params, owner, signal);
    } catch (error) {
      if (!(error instanceof SecurityError)) {
        throw error;
      }
      result = {
        error:
          error.kind === "sign_in_unavailable"
            ? "temporarily_unavailable"
            : "access_denied",
        error_description: "The bridge's owner did not sign in.",
      };
    }
    interaction.result = result;
    await saveInteraction(interaction);
    return { kind: "continue", url: interaction.returnTo };
  }

  /**
   * Checks an access token an agent presented to the MCP endpoint. Throws only what the Issuer did
   * not expect; a store that is down is `unavailable`.
   */
  async checkAccessToken(
    token: string,
    signal: AbortSignal,
  ): Promise<AccessCheck> {
    const provider = this.#provider;
    if (provider === undefined) {
      return UNAVAILABLE;
    }
    try {
      return await this.#check(provider, token, signal);
    } catch (error) {
      if (isStoreDown(error)) {
        return UNAVAILABLE;
      }
      throw error;
    }
  }

  /** Stops the Issuer's storage calls in flight. */
  close(): void {
    this.#lifetime.abort(new Error("The Issuer has closed."));
  }

  // Starts the owner's Entra sign-in for an agent's authorization.
  async #beginSignIn(
    uid: string,
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    const provider = this.#started();
    const details = await provider.interactionDetails(request, response);
    if (details.uid !== uid) {
      answer(response, HTTP_BAD_REQUEST, "This sign-in link is not valid.");
      return;
    }
    const redirect = await this.#dependencies.ownerSignIn.begin(
      { fresh: false },
      AbortSignal.any([
        this.#lifetime.signal,
        AbortSignal.timeout(SIGN_IN_TIMEOUT_MS),
      ]),
    );
    const binding = randomBytes(BINDING_BYTES).toString("base64url");
    this.#pending.add({
      uid,
      pending: redirect.pending,
      binding: sha256(binding),
    });
    response.statusCode = HTTP_SEE_OTHER;
    // Lax is sent on Entra's top-level redirect back, which uses the query response mode.
    response.setHeader(
      "set-cookie",
      `${LINK_COOKIE}=${binding}; Path=/; Max-Age=${String(LINK_COOKIE_MAX_AGE_S)}; HttpOnly; Secure; SameSite=Lax`,
    );
    response.setHeader("location", redirect.url);
    response.setHeader("cache-control", "no-store");
    response.end();
  }

  // The owner's consent: the agent's listed scopes that iteration 001 grants, on the one resource,
  // and the OpenID scopes it asked for. An agent no longer listed is refused.
  async #consent(
    provider: Provider,
    params: Readonly<Record<string, unknown>>,
    owner: OwnerIdentity,
    signal: AbortSignal,
  ): Promise<InteractionResults> {
    const clientId =
      typeof params.client_id === "string" ? params.client_id : "";
    const agent =
      (await this.#agents.byDocument(clientId, signal)) ??
      (await this.#registeredAgent(clientId, signal));
    if (agent === undefined || grantableScopes(agent).length === 0) {
      return {
        error: "access_denied",
        error_description: "This agent is not listed with the bridge.",
      };
    }
    const grant = new provider.Grant({ accountId: owner.subject, clientId });
    grant.addResourceScope(this.#settings.resource, RESOURCE_SCOPE);
    const requested = typeof params.scope === "string" ? params.scope : "";
    for (const scope of requested.split(" ")) {
      if (OPENID_SCOPES.has(scope)) {
        grant.addOIDCScope(scope);
      }
    }
    return {
      login: { accountId: owner.subject },
      consent: { grantId: await grant.save() },
    };
  }

  // The token as the provider holds it, its grant as its own introspection checks it, and its agent
  // as a link checks it.
  async #check(
    provider: Provider,
    token: string,
    signal: AbortSignal,
  ): Promise<AccessCheck> {
    const found = await provider.AccessToken.find(token);
    if (
      found?.isValid !== true ||
      !isOnlyFor(found.aud, this.#settings.resource)
    ) {
      return INVALID;
    }
    const { accountId, clientId, grantId, exp } = found;
    if (
      accountId === undefined ||
      clientId === undefined ||
      grantId === undefined ||
      exp === undefined
    ) {
      return INVALID;
    }
    const grant = await provider.Grant.find(grantId, {
      ignoreExpiration: true,
    });
    if (
      grant === undefined ||
      grant.isExpired ||
      grant.clientId !== clientId ||
      grant.accountId !== accountId
    ) {
      return INVALID;
    }
    const agent =
      (await this.#agents.byDocument(clientId, signal)) ??
      (await this.#registeredAgent(clientId, signal));
    if (
      agent === undefined ||
      !grantableScopes(agent).includes(RESOURCE_SCOPE)
    ) {
      return INVALID;
    }
    return {
      kind: "valid",
      clientId,
      subject: accountId,
      scopes: (found.scope ?? "").split(" ").filter((scope) => scope !== ""),
      expiresAt: exp,
    };
  }

  // A self-registered client is found only while it matches a listed agent (grants-adapter.ts).
  async #registeredAgent(
    clientId: string,
    signal: AbortSignal,
  ): Promise<ListedAgent | undefined> {
    const client = await this.#dependencies.grants.find(
      "Client",
      clientId,
      signal,
    );
    const uris = client?.redirect_uris;
    return Array.isArray(uris) &&
      uris.every((uri): uri is string => typeof uri === "string")
      ? this.#agents.byRedirectUris(uris, signal)
      : undefined;
  }

  #started(): Provider {
    if (this.#provider === undefined) {
      throw new IssuerError(
        "not_started",
        "The Issuer has not found its signing keys yet.",
      );
    }
    return this.#provider;
  }

  #failed(response: ServerResponse, error: unknown): void {
    if (isProviderError(error)) {
      answer(
        response,
        HTTP_BAD_REQUEST,
        "This sign-in link has expired. Start again from the agent.",
      );
      return;
    }
    if (
      error instanceof SecurityError &&
      error.kind === "sign_in_unavailable"
    ) {
      answer(
        response,
        HTTP_UNAVAILABLE,
        "Entra cannot be reached. Try again in a moment.",
      );
      return;
    }
    this.#dependencies.logger.error("issuer_sign_in_failed", undefined, error);
    answer(response, HTTP_SERVER_ERROR, "The sign-in could not be started.");
  }
}

// A token is for the one resource it names: the MCP endpoint (RFC 8707).
function isOnlyFor(
  audience: string | readonly string[] | undefined,
  resource: string,
): boolean {
  return typeof audience === "string"
    ? audience === resource
    : audience?.length === 1 && audience[0] === resource;
}

function isStoreDown(error: unknown): boolean {
  return (
    (error instanceof GrantsStoreError ||
      error instanceof SettingsStoreError) &&
    error.kind === "unavailable"
  );
}

// Records an interaction's result for the rest of its life, by the provider's own time.
async function saveInteraction(interaction: Interaction): Promise<void> {
  const nowS = Math.floor(Date.now() / MS_PER_SECOND);
  await interaction.save(Math.max(1, interaction.exp - nowS));
}

// Whether the returning browser holds the cookie set when its sign-in was sent to Entra.
function sameBrowser(binding: string, cookies: string | undefined): boolean {
  const presented = (cookies ?? "")
    .split(";")
    .map((pair) => pair.trim())
    .find((pair) => pair.startsWith(`${LINK_COOKIE}=`))
    ?.slice(LINK_COOKIE.length + 1);
  if (presented === undefined || presented === "") {
    return false;
  }
  const expected = Buffer.from(binding, "utf8");
  const actual = Buffer.from(sha256(presented), "utf8");
  return (
    expected.byteLength === actual.byteLength &&
    timingSafeEqual(expected, actual)
  );
}

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("base64url");
}

// oidc-provider's own errors carry an OAuth error code and a 4xx status, such as a missing or
// stale interaction cookie.
function isProviderError(error: unknown): boolean {
  if (!(error instanceof Error) || !("statusCode" in error)) {
    return false;
  }
  const status = error.statusCode;
  return (
    typeof status === "number" &&
    status >= HTTP_BAD_REQUEST &&
    status < HTTP_SERVER_ERROR
  );
}

function answer(response: ServerResponse, status: number, text: string): void {
  if (response.headersSent) {
    response.end();
    return;
  }
  response.statusCode = status;
  response.setHeader("content-type", "text/plain; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.end(text);
}
