// The core's secrets in Key Vault (mode H; SC4, R12). The core's managed identity reads every
// secret and may write `issuer-signing-keys` only (A1, PT-03). This file imports nothing from
// Azure: key-vault-client.live.ts makes the real client, and tests hand in their own.
import { Secret } from "../../../utilities/security/index.ts";
import { MISSING_SECRET } from "./core-secrets.ts";
import type {
  CoreSecretName,
  CoreSecrets,
  SecretLookup,
} from "./core-secrets.ts";
import { SecretsError } from "./secrets-error.ts";

/** The part of `@azure/keyvault-secrets`' `SecretClient` this store uses. */
export interface KeyVaultSecretClient {
  getSecret(
    name: string,
    options: { readonly abortSignal: AbortSignal },
  ): Promise<{ readonly value?: string | undefined }>;
  setSecret(
    name: string,
    value: string,
    options: { readonly abortSignal: AbortSignal },
  ): Promise<unknown>;
}

const NOT_FOUND = 404;
const UNAUTHORIZED = 401;
const FORBIDDEN = 403;
const CONFLICT = 409;
// A network error's code, such as ENOTFOUND, is safe to name; other text is not kept.
const ERROR_CODE = /^[A-Za-z_]{1,40}$/;

/** The core's secrets in Key Vault. */
export class KeyVaultSecrets implements CoreSecrets {
  readonly #client: KeyVaultSecretClient;

  constructor(client: KeyVaultSecretClient) {
    this.#client = client;
  }

  async read(name: CoreSecretName, signal: AbortSignal): Promise<SecretLookup> {
    let value: string | undefined;
    try {
      ({ value } = await this.#client.getSecret(name, { abortSignal: signal }));
    } catch (error) {
      signal.throwIfAborted();
      if (statusOf(error) === NOT_FOUND) {
        return MISSING_SECRET;
      }
      throw vaultError(error, "read");
    }
    return value === undefined || value === ""
      ? MISSING_SECRET
      : { kind: "found", value: new Secret(value) };
  }

  async write(
    name: CoreSecretName,
    value: Secret<string>,
    signal: AbortSignal,
  ): Promise<void> {
    try {
      await this.#client.setSecret(name, value.reveal(), {
        abortSignal: signal,
      });
    } catch (error) {
      signal.throwIfAborted();
      throw vaultError(error, "write");
    }
  }
}

function statusOf(error: unknown): number | undefined {
  return typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    typeof error.statusCode === "number"
    ? error.statusCode
    : undefined;
}

function codeOf(error: unknown): string | undefined {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    ERROR_CODE.test(error.code)
    ? error.code
    : undefined;
}

// Key Vault's own error is not kept as the cause: a failed write's request holds the secret value.
// The message names the answer's status, or the network error's code, and nothing else.
function vaultError(error: unknown, action: "read" | "write"): SecretsError {
  const status = statusOf(error);
  if (status === UNAUTHORIZED || status === FORBIDDEN) {
    return new SecretsError(
      "refused",
      `Key Vault refused the core's identity the ${action} (HTTP ${String(status)}).`,
    );
  }
  if (status === CONFLICT) {
    return new SecretsError(
      "refused",
      `Key Vault holds the secret as deleted; it must be recovered or purged first (HTTP ${String(status)}).`,
    );
  }
  const answer =
    status === undefined
      ? (codeOf(error) ?? "no answer")
      : `HTTP ${String(status)}`;
  return new SecretsError(
    "unavailable",
    `Key Vault could not complete the ${action} (${answer}).`,
  );
}
