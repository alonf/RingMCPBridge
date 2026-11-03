// Security utility (CP-02, T006): the connector's Ed25519 identity, AES-256-GCM sealing for the
// encrypted files, and the owner's Entra sign-in. The only entry point (CD4). Nothing exported here
// imports an Azure library, so the connector can use it (I5.3): the managed-identity client
// assertion is in managed-identity-assertion.live.ts, which only the core's wiring imports.

/**
 * Ed25519 key pairs, challenge nonces, and signing and checking a challenge (SC2). The Setup CLI
 * makes the pair at home; the core keeps only the public key.
 */
export {
  createChallengeNonce,
  exportPrivateKey,
  generateSigningKeyPair,
  importPrivateKey,
  signChallenge,
  verifyChallenge,
} from "./signing.ts";
export type { PublicSigningKey, SigningKeyPair } from "./signing.ts";

/** AES-256-GCM seal and open, bytes in and bytes out, bound to a purpose (SC4, DS3). */
export { generateSealingKey, open, seal } from "./sealing.ts";
export type { SealPurpose } from "./sealing.ts";

/**
 * The owner's sign-in (SC1, FR-029): the `OwnerSignIn` seam and `EntraOwnerSignIn`, the
 * authorization code flow with PKCE, a client assertion instead of a client secret, and the ID
 * token checked with jose against the issuer's keys.
 */
export { EntraOwnerSignIn } from "./entra-sign-in.ts";
export type {
  ClientAssertionSource,
  EntraSignInDependencies,
  EntraSignInSettings,
  OwnerIdentity,
  OwnerSignIn,
  PendingSignIn,
  SignInRedirect,
  SignInStartOptions,
} from "./entra-sign-in.ts";
export type { HttpFetch } from "./entra-discovery.ts";

/** The utility's error, with a closed `kind` (see `SecurityErrorKind`). */
export { SecurityError } from "./security-error.ts";
export type { SecurityErrorKind } from "./security-error.ts";
