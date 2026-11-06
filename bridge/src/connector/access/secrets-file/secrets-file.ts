// The Secrets File at home (CP-06; SC4, DS3): Ring's refresh token, Ring's session hardware ID,
// the push credentials and the connector's private key, sealed with AES-256-GCM under a key from a
// Docker secret. Only an instance made by a successful `open` or `create` can write, so a file
// that did not open is never overwritten. Writes go one at a time, each replacing the whole file
// in one step, so a token rotation never leaves an older token on disk (L2).
import { readFile } from "node:fs/promises";
import { z } from "zod";
import {
  exportPrivateKey,
  importPrivateKey,
  open as unseal,
  seal,
} from "../../../utilities/security/index.ts";
import type {
  SealPurpose,
  SigningKeyPair,
} from "../../../utilities/security/index.ts";
import {
  createAtomically,
  moveOverWithRename,
  replaceAtomically,
} from "./atomic-write.ts";
import type { MoveOver } from "./atomic-write.ts";
import { Secret } from "./secret.ts";
import { SecretsFileError } from "./secrets-file-error.ts";

const PURPOSE: SealPurpose = "secrets-file";
const FORMAT = 1;
const KEY_BYTES = 32;

/** Ring's push credentials, kept as Ring Adapter hands them over; this file does not read them. */
export type PushCredentials = Readonly<Record<string, unknown>>;

/** What the Secrets File holds. */
export interface HomeSecrets {
  /** Ring's refresh token. Ring rotates it, and the new one is written back at once. */
  readonly ringRefreshToken: Secret<string>;
  /** Ring's session hardware ID ("device ID" in SC4), not a sensor's `device_id`. */
  readonly ringHardwareId: Secret<string>;
  /** Absent until Ring's push registration has run. */
  readonly pushCredentials?: Secret<PushCredentials>;
  /** The connector's Ed25519 key pair; the private key is a `KeyObject`, which never prints. */
  readonly connectorKey: SigningKeyPair;
}

/** What may change after setup: a rotated token, and the push credentials. */
export type HomeSecretsChange = Partial<
  Pick<HomeSecrets, "ringRefreshToken" | "pushCredentials">
>;

/** Where the file is and how to open it. */
export interface SecretsFileLocation {
  /** The sealed file, on the connector's own volume. */
  readonly path: string;
  /** The 32-byte key, from `readSecretsFileKey`. */
  readonly key: Uint8Array;
  /** The step that puts a written file in place; tests replace it to make it fail. */
  readonly moveOver?: MoveOver;
}

// The sealed JSON. Field names follow the bridge's stored names (snake_case).
const STORED = z.strictObject({
  format: z.literal(FORMAT),
  ring_refresh_token: z.string().min(1),
  ring_hardware_id: z.string().min(1),
  push_credentials: z.record(z.string(), z.unknown()).optional(),
  connector_private_key: z.base64url().min(1),
});

type Stored = z.infer<typeof STORED>;

const UNKNOWN_CONTENTS = "The Secrets File's contents are not in a known form.";

function checkKey(key: Uint8Array): void {
  if (key.byteLength !== KEY_BYTES) {
    throw new SecretsFileError(
      "key_unusable",
      "A Secrets File key must be 32 bytes.",
    );
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    // No cause: a JSON error quotes part of the text, which is secret.
    return undefined;
  }
}

function toStored(secrets: HomeSecrets): Stored {
  const pushCredentials = secrets.pushCredentials?.reveal();
  const stored = STORED.safeParse({
    format: FORMAT,
    ring_refresh_token: secrets.ringRefreshToken.reveal(),
    ring_hardware_id: secrets.ringHardwareId.reveal(),
    ...(pushCredentials === undefined
      ? {}
      : { push_credentials: pushCredentials }),
    connector_private_key: Buffer.from(
      exportPrivateKey(secrets.connectorKey.privateKey),
    ).toString("base64url"),
  });
  if (!stored.success) {
    throw new SecretsFileError(
      "write_failed",
      "The secrets to write are incomplete; nothing was written.",
    );
  }
  return stored.data;
}

function fromStored(stored: Stored): HomeSecrets {
  let connectorKey: SigningKeyPair;
  try {
    connectorKey = importPrivateKey(
      Buffer.from(stored.connector_private_key, "base64url"),
    );
  } catch (error) {
    throw new SecretsFileError("open_failed", UNKNOWN_CONTENTS, {
      cause: error,
    });
  }
  return {
    ringRefreshToken: new Secret(stored.ring_refresh_token),
    ringHardwareId: new Secret(stored.ring_hardware_id),
    ...(stored.push_credentials === undefined
      ? {}
      : { pushCredentials: new Secret(stored.push_credentials) }),
    connectorKey,
  };
}

function encode(key: Uint8Array, secrets: HomeSecrets): Uint8Array {
  const json = JSON.stringify(toStored(secrets));
  return seal(key, Buffer.from(json, "utf8"), PURPOSE);
}

function decode(key: Uint8Array, sealed: Uint8Array): HomeSecrets {
  let plaintext: Uint8Array;
  try {
    plaintext = unseal(key, sealed, PURPOSE);
  } catch (error) {
    throw new SecretsFileError(
      "open_failed",
      "The Secrets File did not open: the key is wrong or the file was changed.",
      { cause: error },
    );
  }
  const stored = STORED.safeParse(
    parseJson(Buffer.from(plaintext).toString("utf8")),
  );
  if (!stored.success) {
    // No cause: the parse issues could describe the secret values.
    throw new SecretsFileError("open_failed", UNKNOWN_CONTENTS);
  }
  return fromStored(stored.data);
}

function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

async function readSealed(path: string): Promise<Uint8Array | undefined> {
  try {
    return await readFile(path);
  } catch (error) {
    if (hasCode(error, "ENOENT")) {
      return undefined;
    }
    throw new SecretsFileError(
      "open_failed",
      "The Secrets File could not be read.",
      { cause: error },
    );
  }
}

/** The connector's secrets, read from and written to their sealed file. */
export class SecretsFile {
  readonly #path: string;
  readonly #key: Uint8Array;
  readonly #moveOver: MoveOver;
  #secrets: HomeSecrets;
  #writes: Promise<void> = Promise.resolve();

  private constructor(location: SecretsFileLocation, secrets: HomeSecrets) {
    this.#path = location.path;
    this.#key = Uint8Array.from(location.key);
    this.#moveOver = location.moveOver ?? moveOverWithRename;
    this.#secrets = secrets;
  }

  /**
   * Opens the file. Returns `undefined` when there is none yet (the Setup CLI has not run).
   * Throws `SecretsFileError`: `key_unusable` for a key that is not 32 bytes, and `open_failed`
   * for a wrong key, a changed byte or unknown contents. Nothing is written in either case.
   */
  static async open(
    location: SecretsFileLocation,
  ): Promise<SecretsFile | undefined> {
    checkKey(location.key);
    const sealed = await readSealed(location.path);
    if (sealed === undefined) {
      return undefined;
    }
    return new SecretsFile(location, decode(location.key, sealed));
  }

  /**
   * Writes a new file for the Setup CLI. Throws `SecretsFileError` (`already_exists`) when a
   * file is already there, which it leaves unchanged, and `write_failed` when it cannot write.
   */
  static async create(
    location: SecretsFileLocation,
    secrets: HomeSecrets,
  ): Promise<SecretsFile> {
    checkKey(location.key);
    const sealed = encode(location.key, secrets);
    try {
      await createAtomically(location.path, sealed);
    } catch (error) {
      if (hasCode(error, "EEXIST")) {
        throw new SecretsFileError(
          "already_exists",
          "A Secrets File already exists; it was left unchanged.",
          { cause: error },
        );
      }
      throw new SecretsFileError(
        "write_failed",
        "The Secrets File could not be written.",
        { cause: error },
      );
    }
    return new SecretsFile(location, secrets);
  }

  /** The secrets as last set, including a change whose write is still under way. */
  get secrets(): HomeSecrets {
    return this.#secrets;
  }

  /**
   * Sets a rotated token or new push credentials, and writes the whole file in one step. The new
   * values are in use at once. If the write fails (`write_failed`), the previous file stays on
   * disk, and the next write carries the new values too.
   */
  async update(change: HomeSecretsChange): Promise<void> {
    const next: HomeSecrets = { ...this.#secrets, ...change };
    const sealed = encode(this.#key, next);
    this.#secrets = next;
    const written = this.#writes.then(() => this.#replace(sealed));
    this.#writes = written.catch(() => undefined);
    await written;
  }

  async #replace(sealed: Uint8Array): Promise<void> {
    try {
      await replaceAtomically(this.#path, sealed, this.#moveOver);
    } catch (error) {
      throw new SecretsFileError(
        "write_failed",
        "The Secrets File could not be written; the previous file is unchanged.",
        { cause: error },
      );
    }
  }
}
