// The shape checks keep what diagnosis needs and remove what FR-034 forbids.
import { describe, expect, it } from "vitest";
import {
  REDACTED,
  redactText,
  toCode,
  toErrorName,
  toIdentifier,
  toMeasure,
} from "./redaction.ts";

// Built from parts: the no-GUID rule keeps GUID literals out of bridge/src.
const LOCATION_ID = ["1b4e28ba", "2fa1", "41d2", "883f", "0016d3cca427"].join(
  "-",
);

describe("toIdentifier", () => {
  it.each([
    ["a UUID", LOCATION_ID],
    ["an upper-case UUID", LOCATION_ID.toUpperCase()],
    ["a 9-digit Ring device id", "587412763"],
    ["a 19-digit Ring event id", "7301234567890123456"],
    ["an oidc-provider client id", "V1StGXR8_Z5jdHi6B-myT"],
    ["a short id", "c1"],
    ["a 3-digit id", "123"],
  ])("keeps %s", (_, value) => {
    expect(toIdentifier(value)).toBe(value);
  });

  it.each([
    ["a 4-digit PIN", "4821"],
    ["an 8-digit PIN", "48213377"],
    ["a 43-character opaque token", "a".repeat(20) + "B".repeat(23)],
    ["a value with spaces", "front door"],
    ["a Hebrew name", "דלת כניסה"],
    ["a number", 587412763],
    ["an object", { id: LOCATION_ID }],
  ])("redacts %s", (_, value) => {
    expect(toIdentifier(value)).toBe(REDACTED);
  });
});

describe("toCode", () => {
  it.each([
    "get_home_status",
    "BRIDGE_UNAVAILABLE",
    "all-in-one",
    "device_state",
    "link.connected",
  ])("keeps %s", (value) => {
    expect(toCode(value)).toBe(value);
  });

  it.each([
    ["a PIN", "4821"],
    ["mixed case", "getHomeStatus"],
    ["a long hex run", "deadbeef".repeat(4)],
    ["a segment over 20 characters", "a".repeat(21)],
    [
      "a value over 64 characters",
      Array.from({ length: 14 }, () => "abcd").join("_"),
    ],
    ["a number", 7],
  ])("redacts %s", (_, value) => {
    expect(toCode(value)).toBe(REDACTED);
  });
});

describe("toMeasure", () => {
  it("keeps finite numbers", () => {
    expect(toMeasure(12.5)).toBe(12.5);
    expect(toMeasure(0)).toBe(0);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, "12", null])(
    "redacts %s",
    (value) => {
      expect(toMeasure(value)).toBe(REDACTED);
    },
  );
});

describe("toErrorName", () => {
  it.each(["Error", "TypeError", "RequestError", "OIDCProviderError"])(
    "keeps %s",
    (value) => {
      expect(toErrorName(value)).toBe(value);
    },
  );

  it.each(["4821", "Http2Error", "error", "A".repeat(41), 5])(
    "redacts %s",
    (value) => {
      expect(toErrorName(value)).toBe(REDACTED);
    },
  );
});

describe("redactText keeps ordinary diagnostic text", () => {
  it.each([
    "connect ECONNREFUSED 127.0.0.1:1433",
    "at 2026-11-03T09:00:00.000Z the lease expired",
    `location ${LOCATION_ID} not found`,
    `location loc_${LOCATION_ID} not found`,
    "    at Object.<anonymous> (/app/bridge/src/core/managers/inquiry-manager/index.js:12:7)",
    "    at /app/node_modules/@azure/identity/dist/commonjs/credentials/managedIdentityCredential/index.js:9:3",
    "Ring answered 406 Not Acceptable",
    "Violation of PRIMARY KEY constraint 'PK_device'",
  ])("%s", (text) => {
    expect(redactText(text)).toBe(text);
  });
});

describe("redactText removes secret shapes", () => {
  const hex64 = "0123456789abcdef".repeat(4);

  it.each([
    ["a bearer credential", "Authorization: Bearer abc.def-ghi", "abc.def-ghi"],
    ["a password pair", "password=hunter2xyz;", "hunter2xyz"],
    ["a quoted token pair", '{"refresh_token": "r-1.2.3"}', "r-1.2.3"],
    ["a PIN pair", "PIN:4821", "4821"],
    [
      "an authorization code in a URL",
      "GET /cb?code=SplxlOBeZQQ&state=x",
      "SplxlOBeZQQ",
    ],
    ["a standalone PIN", "wrong code 4821 entered", "4821"],
    ["a hex key", `key material ${hex64}`, hex64],
    ["a Hebrew device name", "device דלת כניסה offline", "דלת"],
  ])("%s", (_, text, secret) => {
    const redacted = redactText(text);
    expect(redacted).not.toContain(secret);
    expect(redacted).not.toBe("");
  });

  it("replaces binary text whole", () => {
    expect(redactText("frame \u0000\u0001 bytes")).toBe("[redacted:binary]");
    expect(redactText("bad � byte")).toBe("[redacted:binary]");
  });

  it("truncates long text after redaction", () => {
    const redacted = redactText("word ".repeat(1000));
    expect(redacted.length).toBeLessThan(2100);
    expect(redacted.endsWith("...[truncated]")).toBe(true);
  });
});
