// Ed25519 for the connector's identity (SC2): the key pair is made at home, the core keeps the
// public key, and at every hello the connector signs a fresh challenge from the core.
import {
  createPrivateKey,
  createPublicKey,
  generateKeyPair,
  randomBytes,
  sign,
  verify,
} from "node:crypto";
import type { KeyObject } from "node:crypto";
import { promisify } from "node:util";
import { SecurityError } from "./security-error.ts";

const generateEd25519KeyPair = promisify(generateKeyPair);

const CHALLENGE_NONCE_BYTES = 32;
const ED25519 = "ed25519";
// Domain separation: a challenge signature can never be reused as any other signature.
const CHALLENGE_CONTEXT = Buffer.from(
  "ring-mcp-bridge/link-challenge/v1\n",
  "utf8",
);

/** An Ed25519 public key: its raw 32 bytes as base64url (43 characters), as sent in `enroll`. */
export type PublicSigningKey = string & { readonly brand: "PublicSigningKey" };

/** The connector's key pair. The private key stays a `KeyObject`, which never prints its bytes. */
export interface SigningKeyPair {
  readonly publicKey: PublicSigningKey;
  readonly privateKey: KeyObject;
}

function publicKeyText(key: KeyObject): PublicSigningKey {
  const { x } = key.export({ format: "jwk" });
  return (x ?? "") as PublicSigningKey;
}

function challengeMessage(nonce: string): Buffer {
  return Buffer.concat([CHALLENGE_CONTEXT, Buffer.from(nonce, "utf8")]);
}

/** Makes a new Ed25519 key pair, without blocking the event loop. */
export async function generateSigningKeyPair(): Promise<SigningKeyPair> {
  const { publicKey, privateKey } = await generateEd25519KeyPair(ED25519);
  return { publicKey: publicKeyText(publicKey), privateKey };
}

/** The private key as PKCS#8 DER bytes, for the encrypted Secrets File. */
export function exportPrivateKey(privateKey: KeyObject): Uint8Array {
  return privateKey.export({ type: "pkcs8", format: "der" });
}

/** Reads a private key back from PKCS#8 DER. Throws `SecurityError` (`invalid_key`) unless Ed25519. */
export function importPrivateKey(der: Uint8Array): SigningKeyPair {
  let privateKey: KeyObject;
  try {
    privateKey = createPrivateKey({
      key: Buffer.from(der),
      format: "der",
      type: "pkcs8",
    });
  } catch (error) {
    throw new SecurityError(
      "invalid_key",
      "The private key could not be read.",
      {
        cause: error,
      },
    );
  }
  if (privateKey.asymmetricKeyType !== ED25519) {
    throw new SecurityError(
      "invalid_key",
      "The private key is not an Ed25519 key.",
    );
  }
  return { publicKey: publicKeyText(createPublicKey(privateKey)), privateKey };
}

/** A fresh random challenge nonce (32 bytes as base64url), one per hello. */
export function createChallengeNonce(): string {
  return randomBytes(CHALLENGE_NONCE_BYTES).toString("base64url");
}

/** The connector's answer to a challenge: the signature as base64url. */
export function signChallenge(privateKey: KeyObject, nonce: string): string {
  return sign(null, challengeMessage(nonce), privateKey).toString("base64url");
}

/**
 * True only when `signature` is the enrolled key's signature of this nonce. A malformed key or
 * signature is a normal `false`: the core refuses the connection either way.
 */
export function verifyChallenge(
  publicKey: string,
  nonce: string,
  signature: string,
): boolean {
  try {
    const key = createPublicKey({
      key: { kty: "OKP", crv: "Ed25519", x: publicKey },
      format: "jwk",
    });
    return verify(
      null,
      challengeMessage(nonce),
      key,
      Buffer.from(signature, "base64url"),
    );
  } catch {
    return false;
  }
}
