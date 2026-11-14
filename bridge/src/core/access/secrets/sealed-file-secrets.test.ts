// The core's secrets file in mode A (T022): a round trip, a missing file, failing closed on a
// wrong key or another file, ordered and atomic writes, and a newer release's secrets kept.
import {
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  generateSealingKey,
  open,
  seal,
  Secret,
} from "../../../utilities/security/index.ts";
import type { MoveOver } from "../../../utilities/security/index.ts";
import { SealedFileSecrets, SecretsError } from "./index.ts";
import type { SecretsErrorKind } from "./index.ts";

const SIGNING_KEYS = '{"keys":[{"kid":"k-SECRET-1"}]}';
const ROTATED_KEYS = '{"keys":[{"kid":"k-SECRET-2"},{"kid":"k-SECRET-1"}]}';
const MOVE_DELAY_MS = 30;

let folder: string;
let path: string;
let key: Uint8Array;

function never(): AbortSignal {
  return new AbortController().signal;
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
      return error;
    }
    throw error;
  }
  throw new Error("expected a SecretsError");
}

function sealedDocument(document: unknown, sealingKey = key): Uint8Array {
  return seal(
    sealingKey,
    Buffer.from(JSON.stringify(document), "utf8"),
    "core-secrets-file",
  );
}

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "core-secrets-"));
  path = join(folder, "core-secrets.sealed");
  key = generateSealingKey();
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

describe("the core's secrets file (mode A)", () => {
  it("has no secret before the file exists", async () => {
    const secrets = new SealedFileSecrets({ path, key });

    await expect(secrets.read("issuer-signing-keys", never())).resolves.toEqual(
      { kind: "missing" },
    );
    await expect(readdir(folder)).resolves.toEqual([]);
  });

  it("writes a secret, sealed, and reads it back", async () => {
    const secrets = new SealedFileSecrets({ path, key });

    await secrets.write(
      "issuer-signing-keys",
      new Secret(SIGNING_KEYS),
      never(),
    );

    const found = await secrets.read("issuer-signing-keys", never());
    expect(found.kind === "found" && found.value.reveal()).toBe(SIGNING_KEYS);
    const onDisk = await readFile(path);
    expect(onDisk.toString("latin1")).not.toContain("SECRET");
    await expect(readdir(folder)).resolves.toEqual(["core-secrets.sealed"]);
  });

  it("does not open with another key, or as the home Secrets File, and never overwrites a file that does not open", async () => {
    await writeFile(path, sealedDocument({ format: 1, secrets: {} }));
    await expectKind(
      new SealedFileSecrets({ path, key: generateSealingKey() }).read(
        "issuer-signing-keys",
        never(),
      ),
      "unreadable",
    );

    const homeFile = seal(key, Buffer.from("{}", "utf8"), "secrets-file");
    await writeFile(path, homeFile);
    await expectKind(
      new SealedFileSecrets({ path, key }).read("issuer-signing-keys", never()),
      "unreadable",
    );
    await expectKind(
      new SealedFileSecrets({ path, key }).write(
        "issuer-signing-keys",
        new Secret(SIGNING_KEYS),
        never(),
      ),
      "unreadable",
    );
    await expect(readFile(path)).resolves.toEqual(Buffer.from(homeFile));

    await rm(path);
    await new SealedFileSecrets({ path, key }).write(
      "issuer-signing-keys",
      new Secret(SIGNING_KEYS),
      never(),
    );
    const sealed = await readFile(path);
    expect(() => open(key, sealed, "secrets-file")).toThrow();
  });

  it("refuses contents it did not write, quoting none of them", async () => {
    const secrets = new SealedFileSecrets({ path, key });
    for (const document of [
      { format: 2, secrets: {} },
      { format: 1, secrets: { "issuer-signing-keys": 7 } },
      { format: 1, secrets: {}, extra: "SECRET-VALUE" },
      "SECRET-VALUE",
    ]) {
      await writeFile(path, sealedDocument(document));
      const error = await expectKind(
        secrets.read("issuer-signing-keys", never()),
        "unreadable",
      );
      expect(error.cause).toBeUndefined();
      expect(error.message).not.toContain("SECRET");
    }
    await writeFile(
      path,
      seal(key, Buffer.from("SECRET-not-json", "utf8"), "core-secrets-file"),
    );
    const error = await expectKind(
      secrets.read("issuer-signing-keys", never()),
      "unreadable",
    );
    expect(error.cause).toBeUndefined();
  });

  it("treats a secret set to nothing as missing", async () => {
    await writeFile(
      path,
      sealedDocument({ format: 1, secrets: { "issuer-signing-keys": "" } }),
    );

    await expect(
      new SealedFileSecrets({ path, key }).read("issuer-signing-keys", never()),
    ).resolves.toEqual({ kind: "missing" });
  });

  it("keeps a secret a newer release wrote", async () => {
    await writeFile(
      path,
      sealedDocument({ format: 1, secrets: { "pin-hash": "argon2-SECRET" } }),
    );
    const secrets = new SealedFileSecrets({ path, key });

    await secrets.write(
      "issuer-signing-keys",
      new Secret(SIGNING_KEYS),
      never(),
    );

    const document: unknown = JSON.parse(
      Buffer.from(
        open(key, await readFile(path), "core-secrets-file"),
      ).toString("utf8"),
    );
    expect(document).toEqual({
      format: 1,
      secrets: {
        "pin-hash": "argon2-SECRET",
        "issuer-signing-keys": SIGNING_KEYS,
      },
    });
  });

  it("writes overlapping writes in order, so the last one is on disk", async () => {
    let moves = 0;
    const slowFirstMove: MoveOver = async (from, to) => {
      moves += 1;
      if (moves === 1) {
        await delay(MOVE_DELAY_MS);
      }
      await rename(from, to);
    };
    const secrets = new SealedFileSecrets({
      path,
      key,
      moveOver: slowFirstMove,
    });

    await Promise.all([
      secrets.write("issuer-signing-keys", new Secret(SIGNING_KEYS), never()),
      secrets.write("issuer-signing-keys", new Secret(ROTATED_KEYS), never()),
    ]);

    const found = await secrets.read("issuer-signing-keys", never());
    expect(found.kind === "found" && found.value.reveal()).toBe(ROTATED_KEYS);
    expect(moves).toBe(2);
  });

  it("keeps the previous file when a write fails, and the next write still runs", async () => {
    let failing = false;
    const moveOver: MoveOver = async (from, to) => {
      if (failing) {
        throw new Error("disk full");
      }
      await rename(from, to);
    };
    const secrets = new SealedFileSecrets({ path, key, moveOver });
    await secrets.write(
      "issuer-signing-keys",
      new Secret(SIGNING_KEYS),
      never(),
    );
    failing = true;

    const error = await expectKind(
      secrets.write("issuer-signing-keys", new Secret(ROTATED_KEYS), never()),
      "unavailable",
    );
    expect(error.message).not.toContain("SECRET");

    const kept = await secrets.read("issuer-signing-keys", never());
    expect(kept.kind === "found" && kept.value.reveal()).toBe(SIGNING_KEYS);
    await expect(readdir(folder)).resolves.toEqual(["core-secrets.sealed"]);
    failing = false;
    await secrets.write(
      "issuer-signing-keys",
      new Secret(ROTATED_KEYS),
      never(),
    );
    const rotated = await secrets.read("issuer-signing-keys", never());
    expect(rotated.kind === "found" && rotated.value.reveal()).toBe(
      ROTATED_KEYS,
    );
  });

  it("reports a file it cannot read as unavailable", async () => {
    const secrets = new SealedFileSecrets({ path: folder, key });

    await expectKind(
      secrets.read("issuer-signing-keys", never()),
      "unavailable",
    );
  });

  it("lets the caller's abort through unchanged, and writes nothing", async () => {
    const secrets = new SealedFileSecrets({ path, key });
    const controller = new AbortController();
    const reason = new Error("caller left");
    controller.abort(reason);

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
    await expect(readdir(folder)).resolves.toEqual([]);
  });

  it("refuses a key that is not 32 bytes, and keeps its own copy of the key", async () => {
    expect(
      () => new SealedFileSecrets({ path, key: new Uint8Array(16) }),
    ).toThrow(RangeError);

    const secrets = new SealedFileSecrets({ path, key });
    key.fill(0);
    await secrets.write(
      "issuer-signing-keys",
      new Secret(SIGNING_KEYS),
      never(),
    );
    const found = await secrets.read("issuer-signing-keys", never());
    expect(found.kind).toBe("found");
  });
});
