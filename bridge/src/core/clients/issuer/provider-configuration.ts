// oidc-provider's configuration for the Issuer (T023, FR-029, FR-030; contracts/web-endpoints.md,
// "OAuth content rules"; DRIFT-001-39):
// - the authorization code flow only, with PKCE S256 for every client, and public clients (`none`)
//   or `private_key_jwt`: no client secret is ever issued or stored;
// - clients: listed agents only, by their client ID metadata document (CIMD, draft-02) first, or by
//   registering themselves (DCR) as the fallback;
// - one resource, the MCP endpoint (RFC 8707), and only `read` on it. Access tokens are opaque, so
//   the MCP endpoint checks each one against the stored grant and sees a revocation at once;
// - access tokens last 1 hour. Refresh tokens rotate on every use and end 30 days after the last
//   use or 90 days after the first sign-in, whichever is sooner; then `invalid_grant`. A reused
//   refresh token ends its whole grant. Tokens never end with the provider's browser session;
// - every link is a fresh consent, given by the owner's Entra sign-in: no grant is reused from an
//   earlier session.
import { errors } from "oidc-provider";
import type {
  Account,
  Adapter,
  Client,
  Configuration,
  Grant,
  ProviderContext,
  RefreshTokenLifetime,
} from "oidc-provider";
import { isLoopbackRedirect } from "./listed-agents.ts";
import type { ListedAgents } from "./listed-agents.ts";
import type { SigningKeys } from "./signing-keys.ts";

const MINUTE_S = 60;
const HOUR_S = 60 * MINUTE_S;
const DAY_S = 24 * HOUR_S;
/** Access tokens: 1 hour (FR-029). */
export const ACCESS_TOKEN_TTL_S = HOUR_S;
/** A refresh token unused this long is dead (FR-029). */
export const REFRESH_IDLE_TTL_S = 30 * DAY_S;
/** No refresh token outlives this, counted from the sign-in that began its chain (FR-029). */
export const REFRESH_ABSOLUTE_TTL_S = 90 * DAY_S;
const AUTHORIZATION_CODE_TTL_S = MINUTE_S;
/** The time an agent's authorization may wait for the owner: the Entra sign-in's own limit. */
const INTERACTION_TTL_S = 10 * MINUTE_S;
const MS_PER_SECOND = 1000;
const GRANTED_SCOPE = "read";

/** What the configuration is built from. */
export interface ProviderParts {
  /** The Issuer's own path, such as `/oauth`. */
  readonly basePath: string;
  /** The MCP endpoint's URL: the one resource. */
  readonly resource: string;
  readonly keys: SigningKeys;
  readonly agents: ListedAgents;
  readonly adapter: (model: string) => Adapter;
  /** Fetches a client ID metadata document. */
  readonly fetch: (url: string, options: RequestInit) => Promise<Response>;
  /** A signal for one of the hooks' reads: the Issuer's lifetime, with a timeout. */
  readonly signal: () => AbortSignal;
}

/** The provider's configuration. */
export function providerConfiguration(parts: ProviderParts): Configuration {
  return {
    adapter: parts.adapter,
    clientAuthMethods: ["none", "private_key_jwt"],
    // Agents call the token endpoint from their servers, never from a page.
    clientBasedCORS: () => false,
    // A client whose every redirect URI is a loopback one runs on the owner's machine: a native app,
    // whose sign-in comes back on a port it picks each time. oidc-provider ignores that port only
    // for a native client, and Claude Code's metadata document does not say it is one (T033).
    extraClientMetadata: {
      properties: ["application_type"],
      validator: (_context, _key, _value, metadata) => {
        const uris = metadata.redirect_uris;
        if (
          Array.isArray(uris) &&
          uris.length > 0 &&
          uris.every(
            (uri) => typeof uri === "string" && isLoopbackRedirect(uri),
          )
        ) {
          metadata.application_type = "native";
        }
      },
    },
    clientDefaults: {
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      id_token_signed_response_alg: "RS256",
    },
    cookies: {
      keys: parts.keys.cookieKeys,
      names: {
        session: "issuer_session",
        interaction: "issuer_interaction",
        resume: "issuer_resume",
      },
    },
    expiresWithSession: () => Promise.resolve(false),
    features: {
      devInteractions: { enabled: false },
      userinfo: { enabled: false },
      rpInitiatedLogout: { enabled: false },
      introspection: { enabled: false },
      revocation: { enabled: true },
      registration: {
        enabled: true,
        initialAccessToken: false,
        issueRegistrationAccessToken: false,
      },
      clientIdMetadataDocument: {
        enabled: true,
        ack: "draft-02",
        // Checked before anything is fetched: an unlisted URL is never fetched.
        allowFetch: async (_context, clientId) =>
          (await parts.agents.byDocument(clientId, parts.signal())) !==
          undefined,
        // Checked on every use, a cached document included, so a revocation takes effect at once.
        allowClient: (_context, client) =>
          parts.agents.allowsDocumentClient(
            client.clientId,
            client.redirectUris,
            parts.signal(),
          ),
      },
      resourceIndicators: {
        enabled: true,
        defaultResource: (_context, _client, oneOf) =>
          Promise.resolve(oneOf ?? parts.resource),
        useGrantedResource: () => Promise.resolve(true),
        getResourceServerInfo: (_context, resource) => {
          if (resource !== parts.resource) {
            return Promise.reject(new errors.InvalidTarget());
          }
          return Promise.resolve({
            scope: GRANTED_SCOPE,
            audience: parts.resource,
            accessTokenFormat: "opaque",
          });
        },
      },
    },
    fetch: parts.fetch,
    findAccount: (_context, subject) => Promise.resolve(ownerAccount(subject)),
    interactions: {
      url: (_context, interaction) =>
        `${parts.basePath}/interaction/${interaction.uid}`,
    },
    issueRefreshToken: (_context, client: Client) =>
      Promise.resolve(client.grantTypeAllowed("refresh_token")),
    jwks: { keys: parts.keys.keys },
    loadExistingGrant: grantOfThisInteraction,
    pkce: { required: () => true },
    renderError: (context, out) => {
      context.type = "text";
      context.body = `The request could not be completed: ${out.error}.`;
      return Promise.resolve();
    },
    responseTypes: ["code"],
    rotateRefreshToken: true,
    /* eslint-disable @typescript-eslint/naming-convention -- oidc-provider's model names */
    ttl: {
      AccessToken: ACCESS_TOKEN_TTL_S,
      AuthorizationCode: AUTHORIZATION_CODE_TTL_S,
      // The grant outlives every refresh token of its chain, and no longer.
      Grant: REFRESH_ABSOLUTE_TTL_S,
      IdToken: ACCESS_TOKEN_TTL_S,
      Interaction: INTERACTION_TTL_S,
      RefreshToken: refreshTokenLifetime,
      Session: INTERACTION_TTL_S,
    },
    /* eslint-enable @typescript-eslint/naming-convention */
  };
}

/**
 * A new refresh token lives 30 days, but never past 90 days from the first of its chain (`iiat`,
 * which rotation carries over). The provider needs a whole number of seconds, at least 1.
 */
export function refreshTokenLifetime(
  _context: unknown,
  token: RefreshTokenLifetime,
): number {
  // The provider's own time, which set `iiat`.
  const now = Math.floor(Date.now() / MS_PER_SECOND);
  const age = now - (token.iiat ?? now);
  return Math.max(
    1,
    Math.min(REFRESH_IDLE_TTL_S, REFRESH_ABSOLUTE_TTL_S - age),
  );
}

// Only a grant made by this authorization's own owner sign-in; never one found through the
// provider's session, so every link asks the owner.
async function grantOfThisInteraction(
  context: ProviderContext,
): Promise<Grant | undefined> {
  const grantId = context.oidc.result?.consent?.grantId;
  return grantId === undefined
    ? undefined
    : context.oidc.provider.Grant.find(grantId);
}

// The owner is the only account. A token's subject is the owner's Entra `sub`, set by the sign-in.
function ownerAccount(subject: string): Account {
  return { accountId: subject, claims: () => ({ sub: subject }) };
}
