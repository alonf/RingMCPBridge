// Security utility (CP-02, T006): the connector's Ed25519 identity and AES-256-GCM sealing for the
// encrypted files. The only entry point (CD4). Nothing here imports a cloud library, so the
// connector can use it (I5.3).

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

/** The utility's error: `invalid_key` or `open_failed`. */
export { SecurityError } from "./security-error.ts";
export type { SecurityErrorKind } from "./security-error.ts";
