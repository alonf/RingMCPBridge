// Secrets (CP-16, T022): the core's secrets, in Key Vault in mode H and in a sealed file in mode A
// (SC4, DS3). Its only entry point (CD4). The real Key Vault client is in key-vault-client.live.ts,
// which only the core's wiring imports, so nothing here reaches an Azure library.

/** The seam, the secret names, and what a read finds. */
export type {
  CoreSecretName,
  CoreSecrets,
  SecretLookup,
} from "./core-secrets.ts";

/** Key Vault (mode H), over the part of the Azure client it uses. */
export { KeyVaultSecrets } from "./key-vault-secrets.ts";
export type { KeyVaultSecretClient } from "./key-vault-secrets.ts";

/** The sealed file (mode A). */
export { SealedFileSecrets } from "./sealed-file-secrets.ts";
export type { SealedFileLocation } from "./sealed-file-secrets.ts";

/** The error every operation throws: `unavailable`, `refused` or `unreadable`. */
export { SecretsError } from "./secrets-error.ts";
export type { SecretsErrorKind } from "./secrets-error.ts";
