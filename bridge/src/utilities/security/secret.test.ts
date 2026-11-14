// The Secret placeholder (T012, moved here with Secret at T022).
import { inspect } from "node:util";
import { describe, expect, it } from "vitest";
import { Secret } from "./index.ts";

describe("Secret", () => {
  it("hands out its value only through reveal()", () => {
    const secret = new Secret("value-SECRET");
    expect(secret.reveal()).toBe("value-SECRET");
    expect(String(secret)).toBe("[secret]");
    expect(JSON.stringify({ secret })).toBe('{"secret":"[secret]"}');
    expect(inspect({ secret })).not.toContain("value-SECRET");
  });
});
