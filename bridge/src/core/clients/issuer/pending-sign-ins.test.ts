// The sign-ins in flight (T023): found by state, once, for 10 minutes, at most 100 at a time.
import { describe, expect, it } from "vitest";
import { FakeClock } from "../../../utilities/clock/index.ts";
import { PendingSignIns } from "./pending-sign-ins.ts";
import type { PendingLink } from "./pending-sign-ins.ts";

const START = Date.UTC(2026, 10, 8, 9, 0, 0);
const MINUTE_MS = 60_000;

function linkFor(state: string): PendingLink {
  return {
    uid: `uid-${state}`,
    binding: `binding-${state}`,
    pending: {
      state,
      nonce: `nonce-${state}`,
      codeVerifier: `verifier-${state}`,
      startedAt: START,
      fresh: false,
    },
  };
}

describe("the sign-ins in flight", () => {
  it("gives a sign-in back once, by its state", () => {
    const pending = new PendingSignIns(new FakeClock(START));
    pending.add(linkFor("a"));

    expect(pending.take("a")).toEqual(linkFor("a"));
    expect(pending.take("a")).toBeUndefined();
    expect(pending.take("never-added")).toBeUndefined();
  });

  it("forgets a sign-in after 10 minutes", async () => {
    const clock = new FakeClock(START);
    const pending = new PendingSignIns(clock);
    pending.add(linkFor("a"));
    pending.add(linkFor("b"));

    await clock.advance(10 * MINUTE_MS - 1);
    expect(pending.take("a")).toEqual(linkFor("a"));
    await clock.advance(1);

    expect(pending.take("b")).toBeUndefined();
  });

  it("keeps at most 100, pushing out the oldest", () => {
    const pending = new PendingSignIns(new FakeClock(START));
    for (let index = 0; index <= 100; index += 1) {
      pending.add(linkFor(String(index)));
    }

    expect(pending.take("0")).toBeUndefined();
    expect(pending.take("1")).toEqual(linkFor("1"));
    expect(pending.take("100")).toEqual(linkFor("100"));
  });
});
