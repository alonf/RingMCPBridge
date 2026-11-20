// The storage adapter oidc-provider asks for, over Grants (T022, PT-11): one per model, each call
// passed to the `(model, id)` table. The `Client` model holds only agents that registered themselves
// (DCR): a client is stored only when it matches a listed agent, and is found only while it still
// does (listed-agents.ts). A refused registration answers 400 `invalid_client_metadata`.
//
// Registration needs no token, and a listed agent's redirect URIs are public, so anyone can repeat
// one (CP-17's review; the security design's T11). Two bounds hold the rows it stores: the Issuer's
// hourly limit on new registrations (over it, 429 `temporarily_unavailable`), and a lifetime of 7
// days on each, which the Issuer clears when the owner links that client (`keepRegisteredClient`).
// Only registration stores a client here: a metadata-document client is never stored, and nothing
// updates a registration (registration access tokens are off).
//
// oidc-provider checks that a code or refresh token is unused, reads more, then consumes it. Two
// redemptions at the same moment both pass its check (CP-15's review), so consume itself decides:
// the store marks the record in one statement, and the redemption that loses is refused here. When
// the record was used already, its grant ends first, as oidc-provider ends it for a reuse it sees
// itself; with the grant gone, the tokens the winner saves are refused too.
import { errors } from "oidc-provider";
import type { Adapter, AdapterPayload } from "oidc-provider";
import type { GrantsStore } from "../../access/grants/index.ts";
import type { ListedAgents } from "./listed-agents.ts";

/** How long one storage call may take before the request that made it fails. */
const STORE_TIMEOUT_MS = 10_000;
const CLIENT_MODEL = "Client";
const PUSHED_REQUEST_MODEL = "PushedAuthorizationRequest";
const DAY_S = 86_400;
/** A registration the owner never links ends after this. */
export const UNUSED_REGISTRATION_TTL_S = 7 * DAY_S;
const HTTP_TOO_MANY_REQUESTS = 429;

/** What every adapter is built with. */
export interface AdapterContext {
  readonly grants: GrantsStore;
  readonly agents: ListedAgents;
  /** Counts a new registration, if the hour's limit allows one; false when it does not. */
  readonly admitRegistration: () => boolean;
  /** Aborted when the Issuer closes. */
  readonly lifetime: AbortSignal;
}

/**
 * Keeps a self-registered client once the owner links it: its lifetime no longer applies. Says
 * whether it was there, in time, to keep.
 */
export function keepRegisteredClient(
  grants: GrantsStore,
  clientId: string,
  signal: AbortSignal,
): Promise<boolean> {
  return grants.keep(CLIENT_MODEL, clientId, signal);
}

/** A registration over the hour's limit: 429, which oidc-provider has no error class for. */
class RegistrationsLimited extends errors.OIDCProviderError {
  constructor() {
    super(HTTP_TOO_MANY_REQUESTS, "temporarily_unavailable");
    this.error_description =
      "too many new registrations this hour; try again later";
  }
}

/** The factory oidc-provider calls once per model. */
export function adapterFor(
  context: AdapterContext,
): (model: string) => Adapter {
  return (model) =>
    model === CLIENT_MODEL
      ? new RegisteredClients(model, context)
      : new GrantsAdapter(model, context);
}

class GrantsAdapter implements Adapter {
  protected readonly model: string;
  protected readonly context: AdapterContext;

  constructor(model: string, context: AdapterContext) {
    this.model = model;
    this.context = context;
  }

  async upsert(
    id: string,
    payload: AdapterPayload,
    expiresIn: number | undefined,
  ): Promise<void> {
    await this.context.grants.upsert(
      this.model,
      id,
      payload,
      expiresIn,
      this.signal(),
    );
  }

  find(id: string): Promise<AdapterPayload | undefined> {
    return this.context.grants.find(this.model, id, this.signal());
  }

  // The device flow, the only user of user codes, is off.
  findByUserCode(): Promise<AdapterPayload | undefined> {
    return Promise.resolve(undefined);
  }

  findByUid(uid: string): Promise<AdapterPayload | undefined> {
    return this.context.grants.findByUid(this.model, uid, this.signal());
  }

  async consume(id: string): Promise<void> {
    const outcome = await this.context.grants.consume(
      this.model,
      id,
      this.signal(),
    );
    if (outcome.kind === "consumed") {
      return;
    }
    // A pushed request belongs to no grant; oidc-provider refuses a used one with this error.
    if (this.model === PUSHED_REQUEST_MODEL) {
      throw new errors.InvalidRequestUri(
        "request_uri is invalid, expired, or was already used",
      );
    }
    if (outcome.kind === "already_used" && outcome.grantId !== undefined) {
      await this.context.grants.revokeGrant(outcome.grantId, this.signal());
    }
    throw new errors.InvalidGrant(
      outcome.kind === "already_used"
        ? "grant already used"
        : "grant not found or expired",
    );
  }

  async destroy(id: string): Promise<void> {
    await this.context.grants.destroy(this.model, id, this.signal());
  }

  async revokeByGrantId(grantId: string): Promise<void> {
    await this.context.grants.revokeByGrantId(
      this.model,
      grantId,
      this.signal(),
    );
  }

  protected signal(): AbortSignal {
    return AbortSignal.any([
      this.context.lifetime,
      AbortSignal.timeout(STORE_TIMEOUT_MS),
    ]);
  }
}

/**
 * Self-registered clients: stored only while the hour's limit allows, for 7 days unless the owner
 * links them, and found only while they match a listed agent.
 */
class RegisteredClients extends GrantsAdapter {
  // oidc-provider gives a new client no lifetime; this one is set here.
  override async upsert(id: string, payload: AdapterPayload): Promise<void> {
    if (!(await this.#listed(payload))) {
      throw new errors.InvalidClientMetadata(
        "only a listed agent may register: every redirect URI must be listed for it",
      );
    }
    if (!this.context.admitRegistration()) {
      throw new RegistrationsLimited();
    }
    await super.upsert(id, payload, UNUSED_REGISTRATION_TTL_S);
  }

  override async find(id: string): Promise<AdapterPayload | undefined> {
    const payload = await super.find(id);
    return payload !== undefined && (await this.#listed(payload))
      ? payload
      : undefined;
  }

  async #listed(payload: AdapterPayload): Promise<boolean> {
    const uris = payload.redirect_uris;
    if (
      !Array.isArray(uris) ||
      !uris.every((uri): uri is string => typeof uri === "string")
    ) {
      return false;
    }
    const agent = await this.context.agents.byRedirectUris(uris, this.signal());
    return agent !== undefined;
  }
}
