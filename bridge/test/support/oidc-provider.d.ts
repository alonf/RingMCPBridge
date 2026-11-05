// oidc-provider 9.13.3 ships no type declarations. These declare only what the Entra stand-in
// (entra-stand-in.ts) uses, so typed linting holds. The Issuer (CP-16) decides between widening
// this file and the DefinitelyTyped package (a new development dependency).
declare module "oidc-provider" {
  import type { IncomingMessage, ServerResponse } from "node:http";

  /** A client registered with the provider. */
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

  /** An account the provider signs in. */
  export interface Account {
    readonly accountId: string;
    claims(): Readonly<Record<string, unknown>>;
  }

  /** The subset of the configuration the stand-in sets. */
  export interface Configuration {
    readonly clients?: readonly ClientMetadata[];
    readonly jwks?: { readonly keys: readonly object[] };
    readonly cookies?: { readonly keys: readonly string[] };
    readonly claims?: Readonly<Record<string, readonly string[]>>;
    readonly conformIdTokenClaims?: boolean;
    readonly features?: Readonly<Record<string, { readonly enabled: boolean }>>;
    readonly interactions?: {
      readonly url: (context: unknown, interaction: { uid: string }) => string;
    };
    readonly findAccount?: (
      context: unknown,
      subject: string,
    ) => Account | undefined | Promise<Account | undefined>;
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

  /** What the user consented to. */
  export interface Grant {
    addOIDCScope(scope: string): void;
    addOIDCClaims(claims: readonly string[]): void;
    save(): Promise<string>;
  }

  /** The result of an interaction. */
  export interface InteractionResults {
    readonly login?: { readonly accountId: string };
    readonly consent?: { readonly grantId: string };
  }

  /** The OpenID provider (a Koa application); also the default export, which N2 leaves unused. */
  export class Provider {
    constructor(issuer: string, configuration?: Configuration);
    // eslint-disable-next-line @typescript-eslint/naming-convention -- oidc-provider's own name
    readonly Grant: new (properties: {
      accountId: string;
      clientId: string;
    }) => Grant;
    callback(): (request: IncomingMessage, response: ServerResponse) => void;
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
}
