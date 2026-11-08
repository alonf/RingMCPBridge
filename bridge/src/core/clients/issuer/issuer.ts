// The Issuer (T023; FR-029, FR-030, SC1): the bridge's own OAuth 2.1 authorization server, on
// oidc-provider 9.13.3, under `/oauth`. Listed agents link to it; the owner consents by signing in
// with Entra (provider-configuration.ts has the rules).
//
// An agent's authorization reaches the Issuer's interaction route, which starts the owner's Entra
// sign-in and keeps it in flight under its `state`. Entra returns the owner's browser to the core's
// one sign-in return route, which Web serves (T029): Web hands the return to `finishSignIn`, which
// checks the sign-in (only the owner, DRIFT-001-39), records the owner's consent, and answers where
// the browser goes next, back into the provider to finish the agent's authorization. The provider's
// resume cookie ties that last step to the browser that began it.
//
// The Issuer needs its signing keys before it serves anything: `start` reads them from Secrets,
// and reports a missing secret instead of failing (PT-03), for `/readyz` to name.
import type { IncomingMessage, ServerResponse } from "node:http";
import { Provider } from "oidc-provider";
import type { InteractionResults } from "oidc-provider";
import type { GrantsStore } from "../../access/grants/index.ts";
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
}

/** What the Issuer is wired with. */
export interface IssuerDependencies {
  readonly grants: GrantsStore;
  readonly agents: AgentListing;
  readonly secrets: CoreSecrets;
  readonly ownerSignIn: OwnerSignIn;
  readonly clock: Clock;
  readonly logger: Logger;
  /** Fetches a client ID metadata document: the global `fetch` in the bridge. */
  readonly fetch: (url: string, options: RequestInit) => Promise<Response>;
}

/** What `start` found: the Issuer serves, or waits for its signing keys. */
export type IssuerStart = "ready" | "signing_keys_missing";

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
   * Finishes a link from the owner's return from Entra (the query of the core's sign-in return
   * URL). Answers where the owner's browser goes next, or `undefined` when the return is not one
   * of the Issuer's sign-ins, for Web to treat as its own. A sign-in that fails its checks, or by
   * someone other than the owner, ends the agent's authorization with `access_denied`. Throws
   * `IssuerError` (`link_expired`) when the authorization has ended.
   */
  async finishSignIn(
    callback: URLSearchParams,
    signal: AbortSignal,
  ): Promise<string | undefined> {
    const state = callback.get("state");
    const link = state === null ? undefined : this.#pending.take(state);
    if (link === undefined) {
      return undefined;
    }
    const provider = this.#started();
    const interaction = await provider.Interaction.find(link.uid);
    if (interaction === undefined) {
      throw new IssuerError(
        "link_expired",
        "The agent's authorization ended before the owner signed in.",
      );
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
    // The provider's own time, which set the interaction's end.
    const nowS = Math.floor(Date.now() / MS_PER_SECOND);
    await interaction.save(Math.max(1, interaction.exp - nowS));
    return interaction.returnTo;
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
    this.#pending.add({ uid, pending: redirect.pending });
    response.statusCode = HTTP_SEE_OTHER;
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
