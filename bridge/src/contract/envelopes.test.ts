// The reply and error envelopes (T011; contracts/errors.md).
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ERROR_CODES, errorEnvelope, replyEnvelope } from "./envelopes.ts";

const reply = replyEnvelope(z.object({ n: z.int() }), "A test reply.");
const AS_OF = "2026-10-25T09:12:03Z";
const AS_OF_LOCAL = "2026-10-25T18:12:03+09:00";

function replyWith(fields: Record<string, unknown>): unknown {
  return { as_of: AS_OF, as_of_local: AS_OF_LOCAL, data: { n: 1 }, ...fields };
}

describe("replyEnvelope", () => {
  it("accepts live and cached data without stale_since", () => {
    expect(reply.safeParse(replyWith({ freshness: "live" })).success).toBe(
      true,
    );
    expect(reply.safeParse(replyWith({ freshness: "cached" })).success).toBe(
      true,
    );
  });

  it("accepts stale data that says since when", () => {
    const parsed = reply.parse(
      replyWith({ freshness: "stale", stale_since: "2026-10-25T09:05:40Z" }),
    );
    expect(parsed.stale_since).toBe("2026-10-25T09:05:40Z");
  });

  it("rejects stale data without stale_since, and stale_since on fresh data", () => {
    for (const fields of [
      { freshness: "stale" },
      { freshness: "live", stale_since: "2026-10-25T09:05:40Z" },
    ]) {
      const result = reply.safeParse(replyWith(fields));
      expect(result.error?.issues).toEqual([
        expect.objectContaining({ path: ["stale_since"] }),
      ]);
    }
  });

  it("takes as_of in UTC and as_of_local with the location's offset", () => {
    expect(
      reply.safeParse(replyWith({ freshness: "live", as_of: AS_OF_LOCAL }))
        .success,
    ).toBe(false);
    expect(
      reply.safeParse(
        replyWith({ freshness: "live", as_of_local: "2026-10-25T18:12:03" }),
      ).success,
    ).toBe(false);
  });

  it("drops fields the contract does not name", () => {
    const parsed = reply.parse(
      replyWith({ freshness: "live", internal: "row 7" }),
    );
    expect(parsed).not.toHaveProperty("internal");
  });
});

describe("errorEnvelope", () => {
  it("has the fourteen codes of contracts/errors.md", () => {
    expect(ERROR_CODES).toHaveLength(14);
  });

  it("accepts the contract's example", () => {
    const example = {
      error: {
        code: "RING_UNAVAILABLE",
        message: "Ring did not answer; last known state is 3 min old",
        retryable: true,
        retry_after_s: 30,
        outcome: "not_done",
        details: {},
      },
      as_of: AS_OF,
    };
    expect(errorEnvelope.parse(example)).toEqual(example);
  });

  it("rejects an unknown code and an empty message", () => {
    const error = { message: "x", retryable: false, code: "TEAPOT" };
    expect(errorEnvelope.safeParse({ error, as_of: AS_OF }).success).toBe(
      false,
    );
    const silent = { ...error, code: "INTERNAL", message: "" };
    expect(
      errorEnvelope.safeParse({ error: silent, as_of: AS_OF }).success,
    ).toBe(false);
  });
});
