import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  SecurityError,
  createChallengeNonce,
  exportPrivateKey,
  generateSealingKey,
  generateSigningKeyPair,
  importPrivateKey,
  open,
  seal,
  signChallenge,
  signingKeyId,
  verifyChallenge,
} from "./index.ts";

const BASE64URL_43 = /^[A-Za-z0-9_-]{43}$/;

function securityErrorFrom(action: () => unknown): SecurityError {
  try {
    action();
  } catch (error) {
    if (error instanceof SecurityError) {
      return error;
    }
    throw error;
  }
  throw new Error("expected a SecurityError");
}

describe("challenge signing (SC2)", () => {
  it("names a key by the start of its public key's hash: the same on both ends, different per key", async () => {
    const pair = await generateSigningKeyPair();
    const other = await generateSigningKeyPair();
    const keyId = signingKeyId(pair.publicKey);
    expect(keyId).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect(signingKeyId(pair.publicKey)).toBe(keyId);
    expect(signingKeyId(other.publicKey)).not.toBe(keyId);
    expect(pair.publicKey).not.toContain(keyId);
  });

  it("makes a key pair whose public key is 32 raw bytes as base64url", async () => {
    const pair = await generateSigningKeyPair();
    expect(pair.publicKey).toMatch(BASE64URL_43);
    expect(pair.privateKey.asymmetricKeyType).toBe("ed25519");
  });

  it("makes a fresh 32-byte nonce each time", () => {
    const first = createChallengeNonce();
    expect(first).toMatch(BASE64URL_43);
    expect(createChallengeNonce()).not.toBe(first);
  });

  it("accepts the enrolled key's signature of the nonce", async () => {
    const pair = await generateSigningKeyPair();
    const nonce = createChallengeNonce();
    const signature = signChallenge(pair.privateKey, nonce);

    expect(verifyChallenge(pair.publicKey, nonce, signature)).toBe(true);
  });

  it("refuses another nonce, another key, and a changed signature", async () => {
    const pair = await generateSigningKeyPair();
    const other = await generateSigningKeyPair();
    const nonce = createChallengeNonce();
    const signature = signChallenge(pair.privateKey, nonce);
    const flipped = Buffer.from(signature, "base64url");
    flipped[0] = (flipped[0] ?? 0) ^ 1;

    expect(
      verifyChallenge(pair.publicKey, createChallengeNonce(), signature),
    ).toBe(false);
    expect(verifyChallenge(other.publicKey, nonce, signature)).toBe(false);
    expect(
      verifyChallenge(pair.publicKey, nonce, flipped.toString("base64url")),
    ).toBe(false);
  });

  it("refuses a bare signature of the nonce, made without the challenge context", async () => {
    const { sign } = await import("node:crypto");
    const pair = await generateSigningKeyPair();
    const nonce = createChallengeNonce();
    const bare = sign(null, Buffer.from(nonce), pair.privateKey).toString(
      "base64url",
    );

    expect(verifyChallenge(pair.publicKey, nonce, bare)).toBe(false);
  });

  it("answers false, without throwing, for a malformed key or signature", async () => {
    const pair = await generateSigningKeyPair();
    const nonce = createChallengeNonce();
    const signature = signChallenge(pair.privateKey, nonce);

    expect(verifyChallenge("not-a-key", nonce, signature)).toBe(false);
    expect(verifyChallenge(pair.publicKey, nonce, "short")).toBe(false);
  });

  it("round-trips the private key through PKCS#8 DER", async () => {
    const pair = await generateSigningKeyPair();
    const restored = importPrivateKey(exportPrivateKey(pair.privateKey));
    const nonce = createChallengeNonce();

    expect(restored.publicKey).toBe(pair.publicKey);
    expect(
      verifyChallenge(
        pair.publicKey,
        nonce,
        signChallenge(restored.privateKey, nonce),
      ),
    ).toBe(true);
  });

  it("refuses a private key that is not Ed25519, or not a key", () => {
    const ecKey = generateKeyPairSync("ec", { namedCurve: "P-256" }).privateKey;
    const ecDer = ecKey.export({ type: "pkcs8", format: "der" });

    expect(securityErrorFrom(() => importPrivateKey(ecDer)).kind).toBe(
      "invalid_key",
    );
    expect(
      securityErrorFrom(() => importPrivateKey(Buffer.from("junk"))).kind,
    ).toBe("invalid_key");
  });
});

describe("sealing (SC4)", () => {
  const plaintext = Buffer.from('{"ring_refresh_token":"placeholder"}', "utf8");

  it("opens what it sealed", () => {
    const key = generateSealingKey();
    const sealed = seal(key, plaintext, "secrets-file");

    expect(Buffer.from(open(key, sealed, "secrets-file"))).toEqual(plaintext);
  });

  it("uses a fresh IV each time and never shows the plaintext", () => {
    const key = generateSealingKey();
    const first = Buffer.from(seal(key, plaintext, "secrets-file"));
    const second = Buffer.from(seal(key, plaintext, "secrets-file"));

    expect(first.subarray(1, 13)).not.toEqual(second.subarray(1, 13));
    expect(first.includes(plaintext)).toBe(false);
    expect(first.byteLength).toBe(1 + 12 + plaintext.byteLength + 16);
  });

  it("refuses a wrong key", () => {
    const sealed = seal(generateSealingKey(), plaintext, "secrets-file");
    const error = securityErrorFrom(() =>
      open(generateSealingKey(), sealed, "secrets-file"),
    );
    expect(error.kind).toBe("open_failed");
  });

  it("refuses a changed byte anywhere", () => {
    const key = generateSealingKey();
    const sealed = Buffer.from(seal(key, plaintext, "secrets-file"));
    for (const index of [1, 13, sealed.byteLength - 1]) {
      const changed = Buffer.from(sealed);
      changed[index] = (changed[index] ?? 0) ^ 1;
      expect(
        securityErrorFrom(() => open(key, changed, "secrets-file")).kind,
      ).toBe("open_failed");
    }
  });

  it("refuses an unknown format version and data too short to hold a tag", () => {
    const key = generateSealingKey();
    const sealed = Buffer.from(seal(key, plaintext, "secrets-file"));
    sealed[0] = 2;

    expect(
      securityErrorFrom(() => open(key, sealed, "secrets-file")).kind,
    ).toBe("open_failed");
    expect(
      securityErrorFrom(() => open(key, Buffer.alloc(10), "secrets-file")).kind,
    ).toBe("open_failed");
  });

  it("refuses a key that is not 32 bytes", () => {
    const shortKey = Buffer.alloc(16);
    expect(
      securityErrorFrom(() => seal(shortKey, plaintext, "secrets-file")).kind,
    ).toBe("invalid_key");
    expect(
      securityErrorFrom(() => open(shortKey, plaintext, "secrets-file")).kind,
    ).toBe("invalid_key");
  });

  it("keeps key and data bytes out of its error messages", () => {
    const key = generateSealingKey();
    const error = securityErrorFrom(() =>
      open(key, Buffer.alloc(40, 7), "secrets-file"),
    );
    expect(error.message).not.toContain(Buffer.from(key).toString("base64"));
    expect(error.message).not.toContain(Buffer.from(key).toString("hex"));
  });
});
