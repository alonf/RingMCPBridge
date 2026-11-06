// The Secrets File's key, kept in a Docker secret (SC4, DS3). The secret holds the 32-byte key as
// base64url text (43 characters); surrounding whitespace, such as a trailing newline, is ignored.
// The Setup CLI writes it with `encodeSecretsFileKey`, and the connector reads it at start.
import { readFile } from "node:fs/promises";
import { SecretsFileError } from "./secrets-file-error.ts";

const KEY_BYTES = 32;
const KEY_TEXT = /^[A-Za-z0-9_-]{43}$/;

/** The key as the Docker secret holds it: base64url text with a newline. */
export function encodeSecretsFileKey(key: Uint8Array): string {
  if (key.byteLength !== KEY_BYTES) {
    throw new SecretsFileError(
      "key_unusable",
      "A Secrets File key must be 32 bytes.",
    );
  }
  return `${Buffer.from(key).toString("base64url")}\n`;
}

/**
 * Reads the key from its Docker secret, for example `/run/secrets/<name>`. Throws
 * `SecretsFileError` (`key_unusable`) when the file is missing or unreadable, or does not hold a
 * 32-byte key; the error never quotes what the file holds.
 */
export async function readSecretsFileKey(keyPath: string): Promise<Uint8Array> {
  let text: string;
  try {
    text = await readFile(keyPath, "utf8");
  } catch (error) {
    throw new SecretsFileError(
      "key_unusable",
      "The Secrets File key could not be read.",
      { cause: error },
    );
  }
  const encoded = text.trim();
  if (!KEY_TEXT.test(encoded)) {
    throw new SecretsFileError(
      "key_unusable",
      "The Secrets File key is not a 32-byte base64url key.",
    );
  }
  return Buffer.from(encoded, "base64url");
}
