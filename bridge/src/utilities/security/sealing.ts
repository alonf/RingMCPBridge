// AES-256-GCM for the encrypted files (SC4, DS3: the Secrets File at home, keyed from a Docker
// secret). Bytes in, bytes out: reading and writing the files belongs to their accessors.
//
// Sealed layout: [format version: 1 byte][IV: 12 bytes][ciphertext][tag: 16 bytes].
// The additional data binds the purpose and the format version, so a sealed Secrets File cannot be
// opened as anything else, and a future format cannot be confused with this one.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { SecurityError } from "./security-error.ts";

const CIPHER = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const FORMAT_VERSION = 1;
const VERSION_BYTES = 1;
const HEADER_BYTES = VERSION_BYTES + IV_BYTES;

/** What a sealed blob is for; it is bound into the additional data. */
export type SealPurpose = "secrets-file";

function additionalData(purpose: SealPurpose): Buffer {
  return Buffer.from(
    `ring-mcp-bridge/${purpose}/v${String(FORMAT_VERSION)}`,
    "utf8",
  );
}

function checkKey(key: Uint8Array): void {
  if (key.byteLength !== KEY_BYTES) {
    throw new SecurityError(
      "invalid_key",
      "An encryption key must be 32 bytes.",
    );
  }
}

/** A new random 256-bit key, for the Setup CLI to store as a Docker secret. */
export function generateSealingKey(): Uint8Array {
  return randomBytes(KEY_BYTES);
}

/** Encrypts and authenticates `plaintext` with a fresh random 96-bit IV. */
export function seal(
  key: Uint8Array,
  plaintext: Uint8Array,
  purpose: SealPurpose,
): Uint8Array {
  checkKey(key);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(CIPHER, key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(additionalData(purpose));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([
    Buffer.of(FORMAT_VERSION),
    iv,
    ciphertext,
    cipher.getAuthTag(),
  ]);
}

/**
 * Checks and decrypts what `seal` made. Throws `SecurityError` (`open_failed`) for a wrong key,
 * another purpose, an unknown format version, or any changed byte.
 */
export function open(
  key: Uint8Array,
  sealed: Uint8Array,
  purpose: SealPurpose,
): Uint8Array {
  checkKey(key);
  const bytes = Buffer.from(sealed);
  if (
    bytes.byteLength < HEADER_BYTES + TAG_BYTES ||
    bytes[0] !== FORMAT_VERSION
  ) {
    throw new SecurityError(
      "open_failed",
      "The sealed data is not in a known format.",
    );
  }
  const iv = bytes.subarray(VERSION_BYTES, HEADER_BYTES);
  const ciphertext = bytes.subarray(HEADER_BYTES, bytes.byteLength - TAG_BYTES);
  const tag = bytes.subarray(bytes.byteLength - TAG_BYTES);
  try {
    const decipher = createDecipheriv(CIPHER, key, iv, {
      authTagLength: TAG_BYTES,
    });
    decipher.setAAD(additionalData(purpose));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch (error) {
    throw new SecurityError("open_failed", "The sealed data did not open.", {
      cause: error,
    });
  }
}
