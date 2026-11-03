import { describe, expect, it, vi } from "vitest";
import { PubSub } from "./index.ts";

interface Topics extends Record<string, unknown> {
  readonly "media.capture_requested": { readonly eventId: string };
  readonly "state.changed": { readonly version: number };
}

function waitTicks(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

describe("PubSub", () => {
  it("delivers a published message to every subscriber of its topic only", async () => {
    const bus = new PubSub<Topics>(vi.fn());
    const media = vi.fn();
    const state = vi.fn();
    bus.subscribe("media.capture_requested", media);
    bus.subscribe("state.changed", state);

    bus.publish("media.capture_requested", { eventId: "e-1" });
    await bus.drain();

    expect(media).toHaveBeenCalledWith({ eventId: "e-1" });
    expect(state).not.toHaveBeenCalled();
  });

  it("returns before any handler runs", () => {
    const bus = new PubSub<Topics>(vi.fn());
    const handler = vi.fn();
    bus.subscribe("state.changed", handler);

    bus.publish("state.changed", { version: 1 });

    expect(handler).not.toHaveBeenCalled();
  });

  it("handles a topic's messages one at a time, in publish order", async () => {
    const bus = new PubSub<Topics>(vi.fn());
    const log: string[] = [];
    bus.subscribe("state.changed", async ({ version }) => {
      log.push(`start ${String(version)}`);
      await waitTicks();
      log.push(`end ${String(version)}`);
    });

    bus.publish("state.changed", { version: 1 });
    bus.publish("state.changed", { version: 2 });
    await bus.drain();

    expect(log).toEqual(["start 1", "end 1", "start 2", "end 2"]);
  });

  it("reports a failing handler and still runs the others and the next message", async () => {
    const reporter = vi.fn();
    const bus = new PubSub<Topics>(reporter);
    const failure = new Error("capture failed");
    const after = vi.fn();
    bus.subscribe("media.capture_requested", () => {
      throw failure;
    });
    bus.subscribe("media.capture_requested", after);

    bus.publish("media.capture_requested", { eventId: "e-1" });
    bus.publish("media.capture_requested", { eventId: "e-2" });
    await bus.drain();

    expect(reporter).toHaveBeenCalledWith("media.capture_requested", failure);
    expect(reporter).toHaveBeenCalledTimes(2);
    expect(after).toHaveBeenCalledTimes(2);
  });

  it("keeps the queue going when the reporter itself throws", async () => {
    const bus = new PubSub<Topics>(() => {
      throw new Error("reporter down");
    });
    const after = vi.fn();
    bus.subscribe("state.changed", () => Promise.reject(new Error("x")));
    bus.subscribe("state.changed", after);

    bus.publish("state.changed", { version: 1 });
    await bus.drain();

    expect(after).toHaveBeenCalledTimes(1);
  });

  it("stops delivering after unsubscribe", async () => {
    const bus = new PubSub<Topics>(vi.fn());
    const handler = vi.fn();
    const unsubscribe = bus.subscribe("state.changed", handler);
    unsubscribe();
    unsubscribe();

    bus.publish("state.changed", { version: 1 });
    await bus.drain();

    expect(handler).not.toHaveBeenCalled();
  });

  it("drains messages that handlers publish while draining", async () => {
    const bus = new PubSub<Topics>(vi.fn());
    const media = vi.fn();
    bus.subscribe("state.changed", async ({ version }) => {
      await waitTicks();
      bus.publish("media.capture_requested", {
        eventId: `from-${String(version)}`,
      });
    });
    bus.subscribe("media.capture_requested", media);

    bus.publish("state.changed", { version: 7 });
    await bus.drain();

    expect(media).toHaveBeenCalledWith({ eventId: "from-7" });
  });

  it("drains at once when nothing was published", async () => {
    const bus = new PubSub<Topics>(vi.fn());
    await expect(bus.drain()).resolves.toBeUndefined();
  });
});
