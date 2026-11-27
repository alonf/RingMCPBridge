// The Issuer's signing keys (PT-03, PT-04, DRIFT-001-39). The `issuer-signing-keys` secret is a JSON
// document, `{ "keys": [<current>, <previous>?] }`: one or two private RSA keys as JWKs for RS256,
// each with its own `kid`. The newest comes first and signs; the other is kept for checking. The
// bootstrap writes the first document (T031, with `generateSigningKey` and `signingKeyDocument`);
// the Scheduler's 90-day rotation puts a new key first and drops the oldest.
//
// The keys that sign the Issuer's browser cookies are derived from the same keys (HKDF-SHA256 with
// a fixed label), in the same order, so a rotation keeps a cookie set just before it readable, and
// the core keeps no second secret.
import { generateKeyPairSync, hkdfSync, randomBytes } from "node:crypto";
import { z } from "zod";
import { IssuerError } from "./issuer-error.ts";

const RSA_MODULUS_BITS = 2048;
const KEY_ID_BYTES = 12;
const COOKIE_KEY_BYTES = 32;
const COOKIE_KEY_LABEL = "ring-mcp-bridge issuer cookies v1";
const MAX_KEYS = 2;
const MAX_KEY_ID_LENGTH = 64;

const base64url = z.string().regex(/^[A-Za-z0-9_-]+$/);

const signingKeySchema = z.object({
  kty: z.literal("RSA"),
  kid: z.string().min(1).max(MAX_KEY_ID_LENGTH),
  alg: z.literal("RS256"),
  use: z.literal("sig").optional(),
  n: base64url,
  e: base64url,
  d: base64url,
  p: base64url,
  q: base64url,
  dp: base64url,
  dq: base64url,
  qi: base64url,
});

const documentSchema = z.object({
  keys: z.array(signingKeySchema).min(1).max(MAX_KEYS),
});

/** One private signing key, as a JWK. */
export type SigningKey = z.infer<typeof signingKeySchema>;

/** What the Issuer runs with: the provider's key set and the cookie keys derived from it. */
export interface SigningKeys {
  /** The private keys, newest first: the provider signs with the first and publishes all. */
  readonly keys: readonly SigningKey[];
  /** Cookie keys, newest first: cookies are signed with the first and checked with any. */
  readonly cookieKeys: readonly string[];
}

/**
 * Reads the `issuer-signing-keys` document. Throws `IssuerError` (`signing_keys_unreadable`)
 * when it is not one or two RS256 keys with distinct ids; the error never quotes the document.
 */
export function parseSigningKeys(document: string): SigningKeys {
  let parsed: unknown;
  try {
    parsed = JSON.parse(document);
  } catch {
    throw unreadable();
  }
  const result = documentSchema.safeParse(parsed);
  if (!result.success) {
    throw unreadable();
  }
  const { keys } = result.data;
  if (new Set(keys.map((key) => key.kid)).size !== keys.length) {
    throw unreadable();
  }
  return { keys, cookieKeys: keys.map(cookieKeyFor) };
}

/** Makes a new private RSA key for RS256, with a random `kid`. */
export function generateSigningKey(): SigningKey {
  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: RSA_MODULUS_BITS,
  });
  return signingKeySchema.parse({
    ...privateKey.export({ format: "jwk" }),
    kid: randomBytes(KEY_ID_BYTES).toString("base64url"),
    alg: "RS256",
    use: "sig",
  });
}

/** The `issuer-signing-keys` document for these keys, newest first. */
export function signingKeyDocument(keys: readonly SigningKey[]): string {
  return JSON.stringify(documentSchema.parse({ keys }));
}

function cookieKeyFor(key: SigningKey): string {
  return Buffer.from(
    hkdfSync(
      "sha256",
      Buffer.from(key.d, "base64url"),
      Buffer.alloc(0),
      COOKIE_KEY_LABEL,
      COOKIE_KEY_BYTES,
    ),
  ).toString("hex");
}

function unreadable(): IssuerError {
  return new IssuerError(
    "signing_keys_unreadable",
    "issuer-signing-keys is not a document of one or two RS256 signing keys.",
  );
}
