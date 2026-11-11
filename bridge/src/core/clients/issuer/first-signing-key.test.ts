// The bootstrap's first signing key (T031): one key, written only when none is there.
import { describe, expect, it } from "vitest";
import type {
  CoreSecretName,
  CoreSecrets,
  SecretLookup,
} from "../../access/secrets/index.ts";
import { Secret } from "../../../utilities/security/index.ts";
import { writeFirstSigningKey } from "./first-signing-key.ts";
import { parseSigningKeys } from "./signing-keys.ts";

function never(): AbortSignal {
  return new AbortController().signal;
}

/** Secrets kept in memory, counting the writes. */
class MemorySecrets implements CoreSecrets {
  readonly values = new Map<CoreSecretName, string>();
  writes = 0;

  read(name: CoreSecretName): Promise<SecretLookup> {
    const value = this.values.get(name);
    return Promise.resolve(
      value === undefined
        ? { kind: "missing" }
        : { kind: "found", value: new Secret(value) },
    );
  }

  write(name: CoreSecretName, value: Secret<string>): Promise<void> {
    this.writes += 1;
    this.values.set(name, value.reveal());
    return Promise.resolve();
  }
}

describe("the first signing key", () => {
  it("writes one key the Issuer can read when none is there", async () => {
    const secrets = new MemorySecrets();

    await expect(writeFirstSigningKey(secrets, never())).resolves.toBe(
      "written",
    );

    const keys = parseSigningKeys(
      secrets.values.get("issuer-signing-keys") ?? "",
    );
    expect(keys.keys).toHaveLength(1);
  });

  it("never writes over keys already there", async () => {
    const secrets = new MemorySecrets();
    secrets.values.set("issuer-signing-keys", "the keys the Issuer signs with");

    await expect(writeFirstSigningKey(secrets, never())).resolves.toBe(
      "already_set",
    );

    expect(secrets.writes).toBe(0);
    expect(secrets.values.get("issuer-signing-keys")).toBe(
      "the keys the Issuer signs with",
    );
  });
});
