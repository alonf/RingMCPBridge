// oidc-provider 9.13.3 ships no type declarations. These declare only what the bridge uses: the
// Issuer (T023) and the Entra stand-in in tests (T010), so typed linting holds. Widened here rather
// than adding the DefinitelyTyped package, a new development dependency (DRIFT-001-39).
declare module "oidc-provider" {
  import type { IncomingMessage, ServerResponse } from "node:http";

  /** A client's registered metadata, as JSON. */
  export interface ClientMetadata {
    readonly client_id: string;
    readonly redirect_uris: readonly string[];
    readonly response_types?: readonly string[];
    readonly grant_types?: readonly string[];
    readonly token_endpoint_auth_method?: string;
    readonly token_endpoint_auth_signing_alg?: string;
    readonly id_token_signed_response_alg?: string;
    readonly require_auth_time?: boolean;
    readonly jwks?: { readonly keys: readonly object[] };
  }

  /** A client as the provider holds it. */
  export interface Client {
    readonly clientId: string;
    readonly redirectUris: readonly string[];
    /** Set on a client resolved from its client ID metadata document. */
    readonly clientIdMetadataDocument?: boolean;
    grantTypeAllowed(type: string): boolean;
  }

  /** An account the provider signs in. */
  export interface Account {
    readonly accountId: string;
    claims(): Readonly<Record<string, unknown>>;
  }

  /** A record as the provider stores it through an adapter: JSON-ready data. */
  export type AdapterPayload = Readonly<Record<string, unknown>>;

  /** The storage the provider uses for one model. */
  export interface Adapter {
    upsert(
      id: string,
      payload: AdapterPayload,
      expiresIn: number | undefined,
    ): Promise<void>;
    find(id: string): Promise<AdapterPayload | undefined>;
    findByUserCode(userCode: string): Promise<AdapterPayload | undefined>;
    findByUid(uid: string): Promise<AdapterPayload | undefined>;
    consume(id: string): Promise<void>;
    destroy(id: string): Promise<void>;
    revokeByGrantId(grantId: string): Promise<void>;
  }

  /** The request context the provider passes to its hooks; only what the bridge reads. */
  export interface ProviderContext {
    readonly oidc: {
      readonly provider: Provider;
      readonly result?: {
        readonly consent?: { readonly grantId?: string };
      };
    };
  }

  /** A refresh token, as the lifetime hook sees it. */
  export interface RefreshTokenLifetime {
    /** When the first token of its rotation chain was issued, in seconds since 1970. */
    readonly iiat?: number;
  }

  /** What the provider needs to know about the one resource server it issues tokens for. */
  export interface ResourceServerInfo {
    readonly scope: string;
    readonly audience: string;
    readonly accessTokenFormat: "opaque" | "jwt";
  }

  /** The error page's content. */
  export interface ErrorOut {
    readonly error: string;
    readonly error_description?: string;
  }

  /** The features the bridge sets. */
  export interface Features {
    readonly devInteractions?: { readonly enabled: boolean };
    readonly userinfo?: { readonly enabled: boolean };
    readonly rpInitiatedLogout?: { readonly enabled: boolean };
    readonly revocation?: { readonly enabled: boolean };
    readonly introspection?: { readonly enabled: boolean };
    readonly registration?: {
      readonly enabled: boolean;
      readonly initialAccessToken?: boolean;
      readonly issueRegistrationAccessToken?: boolean;
    };
    readonly clientIdMetadataDocument?: {
      readonly enabled: boolean;
      readonly ack?: string;
      readonly allowFetch?: (
        context: unknown,
        clientId: string,
      ) => Promise<boolean>;
      readonly allowClient?: (
        context: unknown,
        client: Client,
      ) => Promise<boolean>;
      readonly cacheDuration?: { readonly min: number; readonly max: number };
    };
    readonly resourceIndicators?: {
      readonly enabled: boolean;
      readonly defaultResource?: (
        context: unknown,
        client: Client,
        oneOf?: string,
      ) => Promise<string | undefined>;
      readonly useGrantedResource?: (
        context: unknown,
        model: unknown,
      ) => Promise<boolean>;
      readonly getResourceServerInfo?: (
        context: unknown,
        resource: string,
        client: Client,
      ) => Promise<ResourceServerInfo>;
    };
  }

  /** A lifetime in seconds, fixed or worked out per record. */
  export type Lifetime =
    | number
    | ((
        context: unknown,
        token: RefreshTokenLifetime,
        client: Client,
      ) => number);

  /** The subset of the configuration the bridge sets. */
  export interface Configuration {
    readonly adapter?: (model: string) => Adapter;
    readonly clients?: readonly ClientMetadata[];
    readonly clientDefaults?: Readonly<Record<string, unknown>>;
    readonly clientAuthMethods?: readonly string[];
    readonly clientBasedCORS?: (
      context: unknown,
      origin: string,
      client: Client,
    ) => boolean;
    readonly jwks?: { readonly keys: readonly object[] };
    readonly cookies?: {
      readonly keys: readonly string[];
      readonly names?: Readonly<Record<string, string>>;
    };
    readonly claims?: Readonly<Record<string, readonly string[]>>;
    readonly conformIdTokenClaims?: boolean;
    readonly features?: Features;
    readonly fetch?: (url: string, options: RequestInit) => Promise<Response>;
    readonly interactions?: {
      readonly url: (context: unknown, interaction: { uid: string }) => string;
    };
    readonly findAccount?: (
      context: unknown,
      subject: string,
    ) => Account | undefined | Promise<Account | undefined>;
    readonly expiresWithSession?: (
      context: unknown,
      source: unknown,
    ) => Promise<boolean>;
    readonly issueRefreshToken?: (
      context: unknown,
      client: Client,
      source: unknown,
    ) => Promise<boolean>;
    readonly loadExistingGrant?: (
      context: ProviderContext,
    ) => Promise<Grant | undefined>;
    readonly pkce?: {
      readonly required: (context: unknown, client: Client) => boolean;
    };
    readonly renderError?: (
      context: { type: string; body: unknown },
      out: ErrorOut,
      error: unknown,
    ) => Promise<void>;
    readonly responseTypes?: readonly string[];
    readonly rotateRefreshToken?: boolean;
    readonly scopes?: readonly string[];
    readonly ttl?: Readonly<Record<string, Lifetime>>;
  }

  /** The pending interaction: what the provider needs before it can go on. */
  export interface InteractionDetails {
    readonly uid: string;
    readonly prompt: {
      readonly name: string;
      readonly details: Readonly<Record<string, unknown>>;
    };
    readonly params: Readonly<Record<string, unknown>>;
    readonly session?: { readonly accountId: string };
    readonly grantId?: string;
  }

  /** A stored interaction, found by its uid. */
  export interface Interaction extends InteractionDetails {
    /** When it ends, in seconds since 1970. */
    readonly exp: number;
    /** Where the browser goes to resume the authorization. */
    readonly returnTo: string;
    result?: InteractionResults;
    save(ttlSeconds: number): Promise<string>;
  }

  /** What the user consented to. */
  export interface Grant {
    /** Set on a stored grant: whose it is, for which client, and whether it has ended. */
    readonly accountId?: string;
    readonly clientId?: string;
    readonly isExpired: boolean;
    addOIDCScope(scope: string): void;
    addOIDCClaims(claims: readonly string[]): void;
    addResourceScope(resource: string, scope: string): void;
    save(): Promise<string>;
  }

  /** A stored access token, found by its value (MCP Endpoint, T024). */
  export interface AccessToken {
    readonly accountId?: string;
    readonly clientId?: string;
    readonly grantId?: string;
    /** Space-separated. */
    readonly scope?: string;
    /** The resource it is for (RFC 8707). */
    readonly aud?: string | readonly string[];
    /** When it ends, in seconds since 1970. */
    readonly exp?: number;
    readonly isValid: boolean;
  }

  /** The result of an interaction. */
  export interface InteractionResults {
    readonly login?: { readonly accountId: string };
    readonly consent?: { readonly grantId: string };
    readonly error?: string;
    readonly error_description?: string;
  }

  /** The OpenID provider (a Koa application); also the default export, which the bridge leaves unused. */
  export class Provider {
    constructor(issuer: string, configuration?: Configuration);
    /** Koa's: trust a proxy in front for `X-Forwarded-Proto` and the client's address. */
    proxy: boolean;
    // eslint-disable-next-line @typescript-eslint/naming-convention -- oidc-provider's own name
    readonly Grant: {
      new (properties: { accountId: string; clientId: string }): Grant;
      find(
        id: string,
        options?: { readonly ignoreExpiration?: boolean },
      ): Promise<Grant | undefined>;
    };
    // eslint-disable-next-line @typescript-eslint/naming-convention -- oidc-provider's own name
    readonly AccessToken: {
      /** Undefined for a value that is unknown, malformed or expired. */
      find(value: string): Promise<AccessToken | undefined>;
    };
    // eslint-disable-next-line @typescript-eslint/naming-convention -- oidc-provider's own name
    readonly Interaction: {
      find(uid: string): Promise<Interaction | undefined>;
    };
    callback(): (request: IncomingMessage, response: ServerResponse) => void;
    on(
      event: "server_error",
      listener: (context: unknown, error: Error) => void,
    ): this;
    interactionDetails(
      request: IncomingMessage,
      response: ServerResponse,
    ): Promise<InteractionDetails>;
    interactionFinished(
      request: IncomingMessage,
      response: ServerResponse,
      result: InteractionResults,
      options?: { mergeWithLastSubmission?: boolean },
    ): Promise<void>;
  }

  /** An OAuth error the provider answers with its own status and code. */
  class OIDCProviderError extends Error {
    constructor(description?: string);
    readonly error: string;
    readonly statusCode: number;
  }

  /** The OAuth errors the bridge raises from its hooks. */
  export const errors: {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- oidc-provider's own name
    readonly InvalidClientMetadata: typeof OIDCProviderError;
    // eslint-disable-next-line @typescript-eslint/naming-convention -- oidc-provider's own name
    readonly InvalidGrant: typeof OIDCProviderError;
    // eslint-disable-next-line @typescript-eslint/naming-convention -- oidc-provider's own name
    readonly InvalidRequestUri: typeof OIDCProviderError;
    // eslint-disable-next-line @typescript-eslint/naming-convention -- oidc-provider's own name
    readonly InvalidTarget: typeof OIDCProviderError;
  };
}
