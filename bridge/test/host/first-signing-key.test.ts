// `first-signing-key <vault-url>` (T031) over a stand-in Key Vault client: it writes the first key
// once, says only what it did, and never lets a private part of the key reach the console.
import { describe, expect, it } from "vitest";
import type { KeyVaultSecretClient } from "../../src/core/access/secrets/index.ts";
import { parseSigningKeys } from "../../src/core/clients/issuer/index.ts";
import { runFirstSigningKeyCommand } from "../../src/host/first-signing-key.ts";

const VAULT = "https://bridge-vault.vault.azure.net";
// The private members of an RSA JWK.
const PRIVATE_FIELDS = ["d", "p", "q", "dp", "dq", "qi"] as const;

/** A stand-in vault: secrets by name, or a status it answers every call with. */
class StandInVault implements KeyVaultSecretClient {
  readonly secrets = new Map<string, string>();
  readonly vaults: string[] = [];
  failWith: number | undefined;

  getSecret(name: string): Promise<{ readonly value?: string }> {
    if (this.failWith !== undefined) {
      return Promise.reject(
        Object.assign(new Error("refused"), { statusCode: this.failWith }),
      );
    }
    const value = this.secrets.get(name);
    return value === undefined
      ? Promise.reject(
          Object.assign(new Error("not found"), { statusCode: 404 }),
        )
      : Promise.resolve({ value });
  }

  setSecret(name: string, value: string): Promise<unknown> {
    this.secrets.set(name, value);
    return Promise.resolve({});
  }
}

async function run(
  args: readonly string[],
  vault: StandInVault,
): Promise<{ code: number; output: string; errors: string }> {
  let output = "";
  let errors = "";
  const code = await runFirstSigningKeyCommand(args, {
    output: { write: (text: string) => (output += text) },
    errors: { write: (text: string) => (errors += text) },
    clientFor: (vaultUrl) => {
      vault.vaults.push(vaultUrl);
      return vault;
    },
  });
  return { code, output, errors };
}

describe("the first-signing-key command", () => {
  it("writes the first key to the named vault, saying so and printing no part of the key", async () => {
    const vault = new StandInVault();

    const { code, output, errors } = await run([`${VAULT}/`], vault);

    expect(code).toBe(0);
    expect(vault.vaults).toEqual([VAULT]);
    expect(output).toContain("The first signing key is set");
    const written = vault.secrets.get("issuer-signing-keys") ?? "";
    const [key] = parseSigningKeys(written).keys;
    for (const field of PRIVATE_FIELDS) {
      const value = key?.[field];
      expect(typeof value).toBe("string");
      expect(`${output}${errors}`).not.toContain(String(value));
    }
  });

  it("leaves keys already there alone", async () => {
    const vault = new StandInVault();
    vault.secrets.set("issuer-signing-keys", "the keys the Issuer signs with");

    const { code, output } = await run([VAULT], vault);

    expect(code).toBe(0);
    expect(output).toContain("already set");
    expect(vault.secrets.get("issuer-signing-keys")).toBe(
      "the keys the Issuer signs with",
    );
  });

  it("says what Key Vault refused, and what to do, without writing", async () => {
    const vault = new StandInVault();
    vault.failWith = 403;

    const { code, errors } = await run([VAULT], vault);

    expect(code).toBe(1);
    expect(errors).toContain("HTTP 403");
    expect(errors).toContain("wait a few minutes");
    expect(vault.secrets.size).toBe(0);
  });

  it.each([
    ["no vault", []],
    ["a plain-http vault", ["http://bridge-vault.vault.azure.net"]],
    ["a URL with a path", [`${VAULT}/secrets/issuer-signing-keys`]],
    ["two arguments", [VAULT, VAULT]],
    ["not a URL", ["bridge-vault"]],
  ])("refuses %s, touching no vault", async (_, args) => {
    const vault = new StandInVault();

    const { code, errors } = await run(args, vault);

    expect(code).toBe(1);
    expect(errors).toContain("Usage: first-signing-key");
    expect(vault.vaults).toEqual([]);
  });
});
