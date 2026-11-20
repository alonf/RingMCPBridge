// The enrollment code (T028): what the owner compares on the admin page with the code the setup
// printed and the connector logs, before approving the connector's key (SC2). Eight characters of
// Crockford's base32, which leaves out I, L, O and U so the code reads back without confusion,
// written as two groups of four. 40 random bits; a request lives for 10 minutes and the owner
// approves it by sight, so the code only has to tell this home's request from another's.
import { randomBytes } from "node:crypto";

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const CODE_BYTES = 5;
const BITS_PER_SYMBOL = 5;
const SYMBOL_MASK = 0b11111;
const SYMBOLS = 8;
const GROUP = 4;

/** A new code, such as `7Q4K-29XM`. `random` is for tests. */
export function newEnrollmentCode(
  random: (size: number) => Uint8Array = randomBytes,
): string {
  const bytes = random(CODE_BYTES);
  let bits = 0n;
  for (const byte of bytes) {
    bits = (bits << 8n) | BigInt(byte);
  }
  let symbols = "";
  for (let index = SYMBOLS - 1; index >= 0; index -= 1) {
    const value = Number(
      (bits >> BigInt(index * BITS_PER_SYMBOL)) & BigInt(SYMBOL_MASK),
    );
    symbols += ALPHABET.charAt(value);
  }
  return `${symbols.slice(0, GROUP)}-${symbols.slice(GROUP)}`;
}
