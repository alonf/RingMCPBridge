// The core's secrets in mode A (T022; SC4, DS3): one file, sealed with AES-256-GCM under a key the
// Host supplies (T027). Its purpose differs from the home Secrets File's, so neither file opens
// as the other. A missing file means no secret is set yet. Each write replaces the whole file in
// one step, and writes go one at a time, so no write is lost to another (L2). A secret this
// release does not know, written by a newer one, is kept.
import { readFile } from "node:fs/promises";
import { z } from "zod";
import {
  moveOverWithRename,
  open as unseal,
  replaceAtomically,
  seal,
  Secret,
} from "../../../utilities/security/index.ts";
import type {
  MoveOver,
  SealPurpose,
} from "../../../utilities/security/index.ts";
import { MISSING_SECRET } from "./core-secrets.ts";
import type {
  CoreSecretName,
  CoreSecrets,
  SecretLookup,
} from "./core-secrets.ts";
import { SecretsError } from "./secrets-error.ts";

const PURPOSE: SealPurpose = "core-secrets-file";
const FORMAT = 1;
const KEY_BYTES = 32;

/** Where the file is and how to open it. */
export interface SealedFileLocation {
  readonly path: string;
  /** The 32-byte sealing key. */
  readonly key: Uint8Array;
  /** The step that puts a written file in place; tests replace it to make it fail. */
  readonly moveOver?: MoveOver;
}

// The sealed JSON: the format, and each secret's value by its name.
const STORED = z.strictObject({
  format: z.literal(FORMAT),
  secrets: z.record(z.string(), z.string()),
});

type StoredSecrets = Readonly<Record<string, string>>;

/** The core's secrets in a sealed file. One per core process in mode A. */
export class SealedFileSecrets implements CoreSecrets {
  readonly #path: string;
  readonly #key: Uint8Array;
  readonly #moveOver: MoveOver;
  #writes: Promise<void> = Promise.resolve();

  /** Throws `RangeError` for a key that is not 32 bytes. */
  constructor(location: SealedFileLocation) {
    if (location.key.byteLength !== KEY_BYTES) {
      throw new RangeError("The core's secrets key must be 32 bytes.");
    }
    this.#path = location.path;
    this.#key = Uint8Array.from(location.key);
    this.#moveOver = location.moveOver ?? moveOverWithRename;
  }

  async read(name: CoreSecretName, signal: AbortSignal): Promise<SecretLookup> {
    const value = (await this.#load(signal))[name];
    return value === undefined || value === ""
      ? MISSING_SECRET
      : { kind: "found", value: new Secret(value) };
  }

  /** Waits for the writes already queued, then writes this one. */
  async write(
    name: CoreSecretName,
    value: Secret<string>,
    signal: AbortSignal,
  ): Promise<void> {
    const written = this.#writes.then(() =>
      this.#writeNow(name, value, signal),
    );
    this.#writes = written.catch(() => undefined);
    await written;
  }

  async #writeNow(
    name: CoreSecretName,
    value: Secret<string>,
    signal: AbortSignal,
  ): Promise<void> {
    signal.throwIfAborted();
    const secrets = { ...(await this.#load(signal)), [name]: value.reveal() };
    const plaintext = Buffer.from(
      JSON.stringify({ format: FORMAT, secrets }),
      "utf8",
    );
    try {
      await replaceAtomically(
        this.#path,
        seal(this.#key, plaintext, PURPOSE),
        this.#moveOver,
      );
    } catch (error) {
      throw new SecretsError(
        "unavailable",
        "The core's secrets file could not be written.",
        { cause: error },
      );
    }
  }

  // Every secret in the file; none when the file does not exist yet.
  async #load(signal: AbortSignal): Promise<StoredSecrets> {
    let sealed: Uint8Array;
    try {
      sealed = await readFile(this.#path, { signal });
    } catch (error) {
      signal.throwIfAborted();
      if (isMissingFile(error)) {
        return {};
      }
      throw new SecretsError(
        "unavailable",
        "The core's secrets file could not be read.",
        { cause: error },
      );
    }
    let plaintext: Uint8Array;
    try {
      plaintext = unseal(this.#key, sealed, PURPOSE);
    } catch (error) {
      throw new SecretsError(
        "unreadable",
        "The core's secrets file does not open with its key.",
        { cause: error },
      );
    }
    return parseStored(plaintext);
  }
}

// No cause is kept: the text holds the secrets.
function parseStored(plaintext: Uint8Array): StoredSecrets {
  let document: unknown;
  try {
    document = JSON.parse(Buffer.from(plaintext).toString("utf8"));
  } catch {
    throw notKnownForm();
  }
  const parsed = STORED.safeParse(document);
  if (!parsed.success) {
    throw notKnownForm();
  }
  return parsed.data.secrets;
}

function notKnownForm(): SecretsError {
  return new SecretsError(
    "unreadable",
    "The core's secrets file is not in a known form.",
  );
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
