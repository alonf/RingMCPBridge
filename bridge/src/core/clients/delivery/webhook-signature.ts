// MCP Events webhook signatures (T048), as OpenAI's guide requires (research.md, T039): Standard
// Webhooks, with the client's `whsec_` secret. The signed content is the message id, the signing
// time in seconds and the body's exact bytes, joined by dots; the header is `v1,` and the HMAC-
// SHA256 in base64. T039 part 2 showed ChatGPT accepting exactly this.
import { createHmac } from "node:crypto";

const SECRET_PREFIX = "whsec_";
const MIN_SECRET_BYTES = 24;
const MAX_SECRET_BYTES = 64;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const MS_PER_SECOND = 1000;

/** The signing key inside a `whsec_` secret, or `undefined` when it has another form. */
export function signingKeyOf(secret: string): Uint8Array | undefined {
  const encoded = secret.slice(SECRET_PREFIX.length);
  if (!secret.startsWith(SECRET_PREFIX) || !BASE64.test(encoded)) {
    return undefined;
  }
  const key = Buffer.from(encoded, "base64");
  return key.length >= MIN_SECRET_BYTES && key.length <= MAX_SECRET_BYTES
    ? new Uint8Array(key)
    : undefined;
}

/** The headers of one signed request, for `body` sent as `messageId` at `nowMs`. */
export function signedHeaders(
  key: Uint8Array,
  messageId: string,
  nowMs: number,
  body: string,
  subscriptionId: string,
): Readonly<Record<string, string>> {
  const signedAt = String(Math.floor(nowMs / MS_PER_SECOND));
  const signature = createHmac("sha256", key)
    .update(`${messageId}.${signedAt}.${body}`)
    .digest("base64");
  return {
    "content-type": "application/json",
    "webhook-id": messageId,
    "webhook-timestamp": signedAt,
    "webhook-signature": `v1,${signature}`,
    "x-mcp-subscription-id": subscriptionId,
  };
}
