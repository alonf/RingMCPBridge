// The Secrets File's key in its Docker secret (T012).
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inspect } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generateSealingKey } from "../../../utilities/security/index.ts";
import {
  encodeSecretsFileKey,
  readSecretsFileKey,
  SecretsFileError,
} from "./index.ts";

let folder: string;
let keyPath: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "secrets-file-key-"));
  keyPath = join(folder, "secrets-file-key");
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

async function expectUnusable(work: Promise<unknown>): Promise<string> {
  const error: unknown = await work.then(
    () => undefined,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(SecretsFileError);
  expect((error as SecretsFileError).kind).toBe("key_unusable");
  return inspect(error, { depth: 10 });
}

describe("the Secrets File key", () => {
  it("reads what the Setup CLI writes, with or without line endings", async () => {
    const key = generateSealingKey();
    const text = encodeSecretsFileKey(key);
    expect(text).toMatch(/^[A-Za-z0-9_-]{43}\n$/);
    await writeFile(keyPath, text);
    await expect(readSecretsFileKey(keyPath)).resolves.toEqual(
      Buffer.from(key),
    );
    await writeFile(keyPath, `  ${text.trim()}\r\n`);
    await expect(readSecretsFileKey(keyPath)).resolves.toEqual(
      Buffer.from(key),
    );
  });

  it("refuses a missing file and anything but a 32-byte key, without quoting it", async () => {
    await expectUnusable(readSecretsFileKey(keyPath));
    const pasted = "my-SECRET-passphrase-not-a-key";
    await writeFile(keyPath, pasted);
    expect(await expectUnusable(readSecretsFileKey(keyPath))).not.toContain(
      pasted,
    );
    const padded = Buffer.from(generateSealingKey()).toString("base64");
    await writeFile(keyPath, padded);
    expect(await expectUnusable(readSecretsFileKey(keyPath))).not.toContain(
      padded,
    );
    expect(() => encodeSecretsFileKey(new Uint8Array(16))).toThrow(
      SecretsFileError,
    );
  });
});
