// `first-signing-key <vault-url>` (T031): the bootstrap's after-deploy step runs it on the owner's
// PC, as `node bridge/src/host/main.ts first-signing-key https://<vault>.vault.azure.net`, signed in
// to Key Vault as the owner through the Azure CLI. It writes the Issuer's first signing key unless
// one is there (writeFirstSigningKey), and says only what it did: the key never reaches the disk,
// the console or the repository. It reads no run mode's settings, so it runs before any are set.
import { KeyVaultSecrets, SecretsError } from "../core/access/secrets/index.ts";
import type {
  CoreSecrets,
  KeyVaultSecretClient,
} from "../core/access/secrets/index.ts";
import { writeFirstSigningKey } from "../core/clients/issuer/index.ts";

const EXIT_OK = 0;
const EXIT_FAILURE = 1;
const KEY_VAULT_TIMEOUT_MS = 60_000;

/** Where the command writes, and how it reaches the vault. */
export interface FirstSigningKeyIo {
  readonly output: { write(text: string): unknown };
  readonly errors: { write(text: string): unknown };
  /** The Key Vault client for this vault, signed in as the owner. */
  readonly clientFor: (vaultUrl: string) => KeyVaultSecretClient;
}

/** Runs the command with the arguments after its name. Returns the exit code. */
export async function runFirstSigningKeyCommand(
  args: readonly string[],
  io: FirstSigningKeyIo,
): Promise<number> {
  const vaultUrl = vaultUrlOf(args);
  if (vaultUrl === undefined) {
    io.errors.write(
      "Usage: first-signing-key https://<vault>.vault.azure.net (the vault's URL, nothing after it).\n",
    );
    return EXIT_FAILURE;
  }
  const secrets: CoreSecrets = new KeyVaultSecrets(io.clientFor(vaultUrl));
  try {
    const outcome = await writeFirstSigningKey(
      secrets,
      AbortSignal.timeout(KEY_VAULT_TIMEOUT_MS),
    );
    io.output.write(
      outcome === "written"
        ? "The first signing key is set in Key Vault as issuer-signing-keys. The core picks it up within a minute.\n"
        : "issuer-signing-keys is already set in Key Vault; nothing was written.\n",
    );
    return EXIT_OK;
  } catch (error) {
    if (!(error instanceof SecretsError)) {
      throw error;
    }
    io.errors.write(
      `The first signing key was not written. ${error.message} If your role on the vault was just granted, wait a few minutes and run the step again.\n`,
    );
    return EXIT_FAILURE;
  }
}

// One argument: an https URL with no path, query or fragment.
function vaultUrlOf(args: readonly string[]): string | undefined {
  if (args.length !== 1) {
    return undefined;
  }
  const [text = ""] = args;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return undefined;
  }
  return url.protocol === "https:" &&
    url.pathname === "/" &&
    url.search === "" &&
    url.hash === "" &&
    url.username === "" &&
    url.password === ""
    ? url.origin
    : undefined;
}
