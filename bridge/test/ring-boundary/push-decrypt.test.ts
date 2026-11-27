// The push library's decryption, as FCM sends push now (DRIFT-002-16). FCM's `crypto-key` header
// carries more than the sender's key: `dh=<key>; p256ecdsa=<key>`. @eneris/push-receiver 4.3.0,
// which ring-client-api pins, cut the `dh=` prefix by length, kept the rest as part of the key, and
// failed every push at the owner's home with ERR_CRYPTO_ECDH_INVALID_PUBLIC_KEY. 4.3.1 reads the
// header's parameters by name; the project pins it through npm `overrides`. This test builds one
// message in FCM's current form and decrypts it with the library as installed.
import { createECDH, randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);

/** The push library's own decrypt, with the message and key shapes it takes. */
type Decrypt = (
  message: {
    readonly appData: readonly {
      readonly key: string;
      readonly value: string;
    }[];
    readonly rawData: Buffer;
  },
  keys: { readonly privateKey: string; readonly authSecret: string },
) => unknown;

/** The encryption library the push library decrypts with, as FCM's sender would use it. */
interface Ece {
  encrypt(
    content: Buffer,
    params: {
      readonly version: string;
      readonly dh: string;
      readonly privateKey: ReturnType<typeof createECDH>;
      readonly salt: string;
      readonly authSecret: string;
    },
  ): Buffer;
}

const decrypt = (
  require("@eneris/push-receiver/dist/utils/decrypt.js") as { default: Decrypt }
).default;
const ece = require("http_ece") as Ece;

function base64url(bytes: Buffer): string {
  return bytes.toString("base64url");
}

describe("the push library's decryption (DRIFT-002-16)", () => {
  it("decrypts a push whose crypto-key header carries more than the sender's key", () => {
    const receiver = createECDH("prime256v1");
    receiver.generateKeys();
    const sender = createECDH("prime256v1");
    sender.generateKeys();
    const signer = createECDH("prime256v1");
    signer.generateKeys();
    const authSecret = base64url(randomBytes(16));
    const salt = base64url(randomBytes(16));
    const payload = { data: { gcm: "a doorbell press" } };
    const rawData = ece.encrypt(Buffer.from(JSON.stringify(payload)), {
      version: "aesgcm",
      dh: base64url(receiver.getPublicKey()),
      privateKey: sender,
      salt,
      authSecret,
    });

    const decrypted = decrypt(
      {
        appData: [
          {
            key: "crypto-key",
            value: `dh=${base64url(sender.getPublicKey())}; p256ecdsa=${base64url(signer.getPublicKey())}`,
          },
          { key: "encryption", value: `salt=${salt}` },
        ],
        rawData,
      },
      {
        privateKey: receiver.getPrivateKey("base64"),
        authSecret,
      },
    );

    expect(decrypted).toEqual(payload);
  });
});
