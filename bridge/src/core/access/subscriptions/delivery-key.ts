// The key that seals MCP Events subscriptions in the database (T048): `delivery-sealing-key` in the
// core's secrets, 32 random bytes in base64.
//
// - The core only reads it. The owner writes it once with the bootstrap's `first-signing-key`
//   step, which writes it only when it is missing, and never prints it. Mode A serves agents over
//   stdio, which no webhook client reaches, so it has no Delivery and needs no key.
// - Until the key exists, subscribing is refused with a clear error and reads keep working. A key
//   found once is kept for the process; one not found is looked for again on the next use.
import type { CoreSecrets } from "../secrets/index.ts";
import {
  generateSealingKey,
  Secret,
} from "../../../utilities/security/index.ts";

/** The secret's name in the core's secrets. */
export const DELIVERY_KEY_NAME = "delivery-sealing-key";
const KEY_BYTES = 32;

/** What writing the first key did. */
export type FirstDeliveryKeyOutcome = "written" | "already_set";

/** Writes a new delivery key unless one is set. The key is never returned, printed or logged. */
export async function writeFirstDeliveryKey(
  secrets: CoreSecrets,
  signal: AbortSignal,
): Promise<FirstDeliveryKeyOutcome> {
  const existing = await secrets.read(DELIVERY_KEY_NAME, signal);
  if (existing.kind === "found") {
    return "already_set";
  }
  const key = Buffer.from(generateSealingKey()).toString("base64");
  await secrets.write(DELIVERY_KEY_NAME, new Secret(key), signal);
  return "written";
}

/** Where the delivery key comes from. */
export interface DeliveryKeyOptions {
  readonly secrets: CoreSecrets;
}

/** The delivery key, read when first needed and kept once found. */
export class DeliveryKeySource {
  readonly #secrets: CoreSecrets;
  #key: Secret<Uint8Array> | undefined;

  constructor(options: DeliveryKeyOptions) {
    this.#secrets = options.secrets;
  }

  /** Whether the key has been found; `/readyz` reports it. */
  get loaded(): boolean {
    return this.#key !== undefined;
  }

  /** The key, or `undefined` while it is not set. Throws the secrets' own error. */
  async key(signal: AbortSignal): Promise<Secret<Uint8Array> | undefined> {
    if (this.#key !== undefined) {
      return this.#key;
    }
    const found = await this.#secrets.read(DELIVERY_KEY_NAME, signal);
    if (found.kind === "missing") {
      return undefined;
    }
    const bytes = Buffer.from(found.value.reveal(), "base64");
    if (bytes.length !== KEY_BYTES) {
      return undefined;
    }
    this.#key = new Secret(new Uint8Array(bytes));
    return this.#key;
  }
}
