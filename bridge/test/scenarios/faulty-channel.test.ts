// Link faults in front of a sink (T009): drops, delays and duplicates on the fake clock.
import { describe, expect, it } from "vitest";
import { FakeClock } from "../../src/utilities/clock/index.ts";
import { FaultyChannel } from "./index.ts";

function setUp(): {
  clock: FakeClock;
  channel: FaultyChannel<string>;
  received: string[];
} {
  const clock = new FakeClock(0);
  const received: string[] = [];
  const channel = new FaultyChannel<string>(clock, (message) => {
    received.push(message);
  });
  return { clock, channel, received };
}

describe("a faulty channel", () => {
  it("passes messages straight through when told nothing", () => {
    const { channel, received } = setUp();

    channel.send("a");
    channel.send("b");

    expect(received).toEqual(["a", "b"]);
    expect(channel.dropped).toBe(0);
  });

  it("drops the next messages it is told to, then passes the rest", () => {
    const { channel, received } = setUp();
    channel.dropNext(2);

    for (const message of ["a", "b", "c"]) {
      channel.send(message);
    }

    expect(received).toEqual(["c"]);
    expect(channel.dropped).toBe(2);
  });

  it("delivers the next messages twice", () => {
    const { channel, received } = setUp();
    channel.duplicateNext(1);

    channel.send("a");
    channel.send("b");

    expect(received).toEqual(["a", "a", "b"]);
  });

  it("delays later messages on the clock until the delay is set back to 0", async () => {
    const { clock, channel, received } = setUp();
    channel.delayBy(500);

    channel.send("late");
    await clock.advance(499);
    expect(received).toEqual([]);
    await clock.advance(1);
    expect(received).toEqual(["late"]);

    channel.delayBy(0);
    channel.send("now");
    expect(received).toEqual(["late", "now"]);
  });

  it("delays both copies of a duplicated message", async () => {
    const { clock, channel, received } = setUp();
    channel.delayBy(100);
    channel.duplicateNext(1);

    channel.send("twice");
    expect(received).toEqual([]);
    await clock.advance(100);

    expect(received).toEqual(["twice", "twice"]);
  });
});
