// Issuer (CP-16, T023): the bridge's OAuth 2.1 authorization server for listed agents, on
// oidc-provider, under `/oauth`. Its only entry point (CD4). The Host mounts it and Web's sign-in
// return route finishes its links; the MCP Endpoint (T024) checks the tokens it issues.

/** The Issuer, its settings and seams, and what `start` reports. */
export { Issuer, SWEEP_INTERVAL_MS } from "./issuer.ts";
export type {
  AccessCheck,
  IssuerDependencies,
  IssuerSettings,
  IssuerStart,
  LinkReturn,
} from "./issuer.ts";
export type { AgentListing } from "./listed-agents.ts";

/**
 * The `issuer-signing-keys` document: reading it, and making a key and a document, for the
 * bootstrap's first key (T031) and the Scheduler's rotation.
 */
export {
  generateSigningKey,
  parseSigningKeys,
  signingKeyDocument,
} from "./signing-keys.ts";
export type { SigningKey, SigningKeys } from "./signing-keys.ts";

/** The lifetimes the Issuer gives its tokens (FR-029). */
export {
  ACCESS_TOKEN_TTL_S,
  REFRESH_ABSOLUTE_TTL_S,
  REFRESH_IDLE_TTL_S,
} from "./provider-configuration.ts";

/** The error the Issuer throws, with a closed `kind`. */
export { IssuerError } from "./issuer-error.ts";
export type { IssuerErrorKind } from "./issuer-error.ts";
