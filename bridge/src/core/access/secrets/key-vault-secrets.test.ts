// The core's secrets in Key Vault (T022), over a stand-in client: a missing secret is a value,
// each failure has its kind, and no message or cause carries a secret or Key Vault's own text.
import { describe, expect, it } from "vitest";
import { Secret } from "../../../utilities/security/index.ts";
import { KeyVaultSecrets, SecretsError } from "./index.ts";
import type { KeyVaultSecretClient, SecretsErrorKind } from "./index.ts";

const SIGNING_KEYS = '{"keys":[{"kid":"k-SECRET-1"}]}';

function never(): AbortSignal {
  return new AbortController().signal;
}

/** An error shaped as `@azure/core-rest-pipeline`'s `RestError`, holding text that must not leak. */
function restError(statusCode: number): Error {
  return Object.assign(new Error(`vault said SECRET-${String(statusCode)}`), {
    statusCode,
    code: "SomeVaultCode",
    request: { body: JSON.stringify({ value: SIGNING_KEYS }) },
  });
}

interface StandInCall {
  readonly method: "getSecret" | "setSecret";
  readonly name: string;
  readonly value?: string;
  readonly abortSignal: AbortSignal;
}

function standIn(answer: () => Promise<{ readonly value?: string }>): {
  client: KeyVaultSecretClient;
  calls: StandInCall[];
} {
  const calls: StandInCall[] = [];
  return {
    calls,
    client: {
      getSecret: (name, { abortSignal }) => {
        calls.push({ method: "getSecret", name, abortSignal });
        return answer();
      },
      setSecret: async (name, value, { abortSignal }) => {
        calls.push({ method: "setSecret", name, value, abortSignal });
        return answer();
      },
    },
  };
}

async function expectKind(
  work: Promise<unknown>,
  kind: SecretsErrorKind,
): Promise<SecretsError> {
  try {
    await work;
  } catch (error) {
    if (error instanceof SecretsError) {
      expect(error.kind).toBe(kind);
      expect(error.cause).toBeUndefined();
      expect(error.message).not.toContain("SECRET");
      return error;
    }
    throw error;
  }
  throw new Error("expected a SecretsError");
}

describe("the core's secrets in Key Vault (mode H)", () => {
  it("reads a secret by name, passing the caller's signal down", async () => {
    const { client, calls } = standIn(() =>
      Promise.resolve({ value: SIGNING_KEYS }),
    );
    const signal = never();

    const found = await new KeyVaultSecrets(client).read(
      "issuer-signing-keys",
      signal,
    );

    expect(found.kind === "found" && found.value.reveal()).toBe(SIGNING_KEYS);
    expect(calls).toEqual([
      { method: "getSecret", name: "issuer-signing-keys", abortSignal: signal },
    ]);
  });

  it("reports a secret that is not there, or set to nothing, as missing", async () => {
    for (const answer of [
      () => Promise.reject(restError(404)),
      () => Promise.resolve({}),
      () => Promise.resolve({ value: "" }),
    ]) {
      await expect(
        new KeyVaultSecrets(standIn(answer).client).read(
          "issuer-signing-keys",
          never(),
        ),
      ).resolves.toEqual({ kind: "missing" });
    }
  });

  it("writes a secret's value under its name", async () => {
    const { client, calls } = standIn(() => Promise.resolve({}));
    const signal = never();

    await new KeyVaultSecrets(client).write(
      "issuer-signing-keys",
      new Secret(SIGNING_KEYS),
      signal,
    );

    expect(calls).toEqual([
      {
        method: "setSecret",
        name: "issuer-signing-keys",
        value: SIGNING_KEYS,
        abortSignal: signal,
      },
    ]);
  });

  it("reports a refused identity or a deleted secret as refused, naming only the status", async () => {
    for (const status of [401, 403, 409]) {
      const secrets = new KeyVaultSecrets(
        standIn(() => Promise.reject(restError(status))).client,
      );
      const read = await expectKind(
        secrets.read("issuer-signing-keys", never()),
        "refused",
      );
      expect(read.message).toContain(`HTTP ${String(status)}`);
      await expectKind(
        secrets.write("issuer-signing-keys", new Secret(SIGNING_KEYS), never()),
        "refused",
      );
    }
  });

  it("reports a vault it cannot reach as unavailable, naming only the status or the network code", async () => {
    const network = Object.assign(new Error("getaddrinfo SECRET-host"), {
      code: "ENOTFOUND",
    });
    const odd = Object.assign(new Error("odd"), { code: "has spaces SECRET" });
    for (const [failure, named] of [
      [restError(503), "HTTP 503"],
      [restError(429), "HTTP 429"],
      [network, "ENOTFOUND"],
      [odd, "no answer"],
      [new Error("SECRET"), "no answer"],
    ] as const) {
      const secrets = new KeyVaultSecrets(
        standIn(() => Promise.reject(failure)).client,
      );
      const error = await expectKind(
        secrets.read("issuer-signing-keys", never()),
        "unavailable",
      );
      expect(error.message).toContain(named);
      await expectKind(
        secrets.write("issuer-signing-keys", new Secret(SIGNING_KEYS), never()),
        "unavailable",
      );
    }
  });

  it("lets the caller's abort through unchanged", async () => {
    const controller = new AbortController();
    const reason = new Error("caller left");
    const secrets = new KeyVaultSecrets(
      standIn(() => {
        controller.abort(reason);
        return Promise.reject(new Error("AbortError"));
      }).client,
    );

    await expect(
      secrets.read("issuer-signing-keys", controller.signal),
    ).rejects.toBe(reason);
    await expect(
      secrets.write(
        "issuer-signing-keys",
        new Secret(SIGNING_KEYS),
        controller.signal,
      ),
    ).rejects.toBe(reason);
  });
});
