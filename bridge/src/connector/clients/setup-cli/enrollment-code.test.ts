// The enrollment code (T028): eight characters of Crockford's base32 in two groups, and logged as
// it is, whatever its letters: the log's checks go by shape, and an all-digit or hex-looking code
// must not read as a PIN or a secret (SC2, FR-034).
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { Logger } from "../../../utilities/logging/index.ts";
import { newEnrollmentCode } from "./index.ts";

const SHAPE = /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;
const MANY = 2_000;

function bytes(...values: number[]): () => Uint8Array {
  return () => Uint8Array.from(values);
}

function logged(code: string): string {
  const lines: string[] = [];
  const logger = new Logger({
    sink: (line) => lines.push(line),
    now: () => 0,
    minLevel: "info",
  });
  logger.info("core_link_enroll_sent", { enrollment_code: code });
  return lines.join("\n");
}

describe("the enrollment code", () => {
  it("reads the random bits five at a time, from the first", () => {
    expect(newEnrollmentCode(bytes(0, 0, 0, 0, 0))).toBe("0000-0000");
    expect(newEnrollmentCode(bytes(255, 255, 255, 255, 255))).toBe("ZZZZ-ZZZZ");
    // 00001 00010 00011 00100 00101 00110 00111 01000
    expect(newEnrollmentCode(bytes(0x08, 0x86, 0x42, 0x98, 0xe8))).toBe(
      "1234-5678",
    );
  });

  it("is new each time, in its shape", () => {
    const codes = new Set(
      Array.from({ length: MANY }, () => newEnrollmentCode()),
    );

    expect(codes.size).toBe(MANY);
    for (const code of codes) {
      expect(code).toMatch(SHAPE);
    }
  });

  it("is logged as it is, all digits, hex letters or any other", () => {
    const codes = [
      "0000-0000",
      "1234-5678",
      "ABCD-EF01",
      "ZZZZ-ZZZZ",
      ...Array.from({ length: MANY }, () => newEnrollmentCode(randomBytes)),
    ];

    for (const code of codes) {
      expect(logged(code)).toContain(`"enrollment_code":"${code}"`);
    }
  });
});
