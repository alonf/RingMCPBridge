// The read rate limit (T025): an hour that slides, each agent counted apart, and a refused read
// never counted.
import { describe, expect, it } from "vitest";
import { FakeClock } from "../../../utilities/clock/index.ts";
import { ReadLimit } from "./read-limit.ts";

const START = Date.UTC(2026, 10, 9, 9, 0, 0);
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

describe("the read rate limit", () => {
  it("lets an agent make its hourly reads, then says when its oldest one leaves the hour", async () => {
    const clock = new FakeClock(START);
    const limit = new ReadLimit(2, clock);

    expect(limit.take("agent")).toEqual({ allowed: true });
    await clock.advance(10 * MINUTE_MS);
    expect(limit.take("agent")).toEqual({ allowed: true });
    await clock.advance(5 * MINUTE_MS);

    expect(limit.take("agent")).toEqual({
      allowed: false,
      retryAfterS: 45 * 60,
    });
  });

  it("frees a read exactly an hour after it was made, and never counts a refused one", async () => {
    const clock = new FakeClock(START);
    const limit = new ReadLimit(1, clock);
    limit.take("agent");

    await clock.advance(HOUR_MS - 1);
    expect(limit.take("agent")).toEqual({ allowed: false, retryAfterS: 1 });
    await clock.advance(1);
    expect(limit.take("agent")).toEqual({ allowed: true });
    expect(limit.take("agent")).toMatchObject({ allowed: false });
  });

  it("counts each agent apart", () => {
    const limit = new ReadLimit(1, new FakeClock(START));
    limit.take("agent");

    expect(limit.take("other")).toEqual({ allowed: true });
    expect(limit.take("agent")).toMatchObject({ allowed: false });
  });

  it.each([0, 1.5, -1])("refuses a limit of %s", (perHour) => {
    expect(() => new ReadLimit(perHour, new FakeClock(START))).toThrow(
      RangeError,
    );
  });
});
