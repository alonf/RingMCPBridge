// The core's secrets (T022; SC4, CD3): the seam the Issuer and the admin page read and write
// through, with two implementations, Key Vault in mode H and a sealed file in mode A.
import type { Secret } from "../../../utilities/security/index.ts";

/**
 * The secrets the core keeps. Iteration 001 has one: the Issuer's signing keys, a JSON document
 * the Issuer writes and reads (PT-04). `pin-hash` and the others join in later iterations.
 */
export type CoreSecretName = "issuer-signing-keys";

/**
 * - `found`: the secret's value;
 * - `missing`: it was never set, or is set to nothing. `/readyz` names it (PT-03).
 */
export type SecretLookup =
  | { readonly kind: "found"; readonly value: Secret<string> }
  | { readonly kind: "missing" };

/** Where the core's secrets live. Each failure is a `SecretsError`. */
export interface CoreSecrets {
  /** Reads a secret. A missing one is a value, not an error. */
  read(name: CoreSecretName, signal: AbortSignal): Promise<SecretLookup>;
  /** Sets a secret, replacing its value. */
  write(
    name: CoreSecretName,
    value: Secret<string>,
    signal: AbortSignal,
  ): Promise<void>;
}

/** The lookup for a secret that is not set. */
export const MISSING_SECRET: SecretLookup = { kind: "missing" };
