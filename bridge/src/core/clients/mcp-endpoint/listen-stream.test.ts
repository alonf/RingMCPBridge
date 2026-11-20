import { describe, expect, it } from "vitest";
import { FakeClock } from "../../../utilities/clock/index.ts";
import { ListenStreams } from "./listen-stream.ts";

describe("live stream limits", () => {
  it("ends an idle stream as soon as its token expires", async () => {
    const clock = new FakeClock(0);
    let cancelled = false;
    const source = new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true;
      },
    });
    const stream = new ListenStreams(clock).open(
      new Response(source),
      new Request("https://bridge.test/mcp"),
      1000,
      () => Promise.resolve(true),
    );
    const read = stream.body?.getReader().read();
    await clock.advance(1000);
    expect((await read)?.done).toBe(true);
    expect(cancelled).toBe(true);
    expect(clock.pendingTimers).toBe(0);
  });

  it("disconnects a reader whose token check falls behind a burst of events", async () => {
    let cancelled = false;
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < 32; i++) controller.enqueue(Uint8Array.of(i));
      },
      cancel() {
        cancelled = true;
      },
    });
    let release!: (allowed: boolean) => void;
    const check = new Promise<boolean>((resolve) => {
      release = resolve;
    });
    const stream = new ListenStreams(new FakeClock(0)).open(
      new Response(source),
      new Request("https://bridge.test/mcp"),
      1000,
      () => check,
    );
    await expect.poll(() => cancelled).toBe(true);
    release(true);
    expect((await stream.body?.getReader().read())?.done).toBe(true);
  });
});
