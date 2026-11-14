// The home's messages as the core reads them (T016, tightened at T017): the fields that arrive
// before the connector has proved its key take only the exact form the home sends.
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  generateSigningKeyPair,
  signingKeyId,
} from "../../../../utilities/security/index.ts";
import {
  enrollSchema,
  helloSchema,
  MAX_ENROLLMENT_CODE_LENGTH,
} from "./index.ts";

describe("the home's hello and enroll, as the core reads them", () => {
  it("accept what Core Link sends", async () => {
    const { publicKey } = await generateSigningKeyPair();

    expect(
      helloSchema.safeParse({
        version: 1,
        key_id: signingKeyId(publicKey),
        connector_version: "0.1.0-beta.2+build.7",
        session_id: randomUUID(),
      }).success,
    ).toBe(true);
    expect(
      enrollSchema.safeParse({
        public_key: publicKey,
        code: "x".repeat(MAX_ENROLLMENT_CODE_LENGTH),
      }).success,
    ).toBe(true);
  });

  it("refuse a key id, session id or version in any other form", async () => {
    const { publicKey } = await generateSigningKeyPair();
    const hello = {
      version: 1,
      key_id: signingKeyId(publicKey),
      connector_version: "0.1.0",
      session_id: randomUUID(),
    };

    for (const refused of [
      { key_id: signingKeyId(publicKey).slice(1) },
      { key_id: `${signingKeyId(publicKey)}A` },
      { key_id: "abc def ghi jkl!" },
      { session_id: "session-1" },
      { connector_version: "" },
      { connector_version: "1".repeat(65) },
      { connector_version: "1.0 beta" },
      { version: 0 },
    ]) {
      expect(
        helloSchema.safeParse({ ...hello, ...refused }).success,
        JSON.stringify(refused),
      ).toBe(false);
    }
  });

  it("refuse an enroll whose key or code is not in the form the core keeps", async () => {
    const { publicKey } = await generateSigningKeyPair();

    for (const refused of [
      { public_key: publicKey.slice(1), code: "AAAA" },
      { public_key: `${publicKey}=`, code: "AAAA" },
      { public_key: publicKey, code: "" },
      {
        public_key: publicKey,
        code: "x".repeat(MAX_ENROLLMENT_CODE_LENGTH + 1),
      },
    ]) {
      expect(enrollSchema.safeParse(refused).success).toBe(false);
    }
  });
});
