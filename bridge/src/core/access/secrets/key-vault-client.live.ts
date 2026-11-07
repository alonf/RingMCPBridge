// The real Key Vault client (T022): it signs in with the core's user-assigned managed identity, so
// no password exists to reach the secrets (R12, PT-03). Only the core's wiring (host/core.ts)
// imports this file, never index.ts, so mode A and the connector never reach @azure/*
// (I5.3). It talks to the real Key Vault, so it is excluded from coverage and runs in the pilot
// (I4.3).
import { ManagedIdentityCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";
import type { KeyVaultSecretClient } from "./key-vault-secrets.ts";

/** Which vault, and which managed identity signs in to it. */
export interface KeyVaultSettings {
  /** The vault's URL, such as `https://<vault>.vault.azure.net`. */
  readonly vaultUrl: string;
  readonly managedIdentityClientId: string;
}

/** A Key Vault client that signs in with the managed identity. */
export function createKeyVaultSecretClient(
  settings: KeyVaultSettings,
): KeyVaultSecretClient {
  const credential = new ManagedIdentityCredential({
    clientId: settings.managedIdentityClientId,
  });
  return new SecretClient(settings.vaultUrl, credential);
}
