// The in-memory pair (T015), and through it the endpoint both carriers share: frames both ways,
// the sending order while writes are held, closing and dropping, and a refused frame or a failing
// listener, with nothing of the frame kept.
import { describe, expect, it } from "vitest";
import { Logger } from "../logging/index.ts";
import { CLOSE_CODES, LinkEndpoint } from "./link-connection.ts";
import type { LinkClosed, LinkConnection } from "./link-connection.ts";
import type { LinkFrame } from "./link-frame.ts";
import { createLinkPair } from "./link-pair.ts";
import { LinkSlot } from "./link-slot.ts";

const RING_NAME = "דלת כניסה";

function logger(lines: string[] = []): Logger {
  return new Logger({
    sink: (line) => lines.push(line),
    now: () => 0,
    minLevel: "debug",
  });
}

function received(link: LinkConnection): LinkFrame[] {
  const frames: LinkFrame[] = [];
  link.onFrame((frame) => frames.push(frame));
  return frames;
}

function closings(link: LinkConnection): LinkClosed[] {
  const seen: LinkClosed[] = [];
  link.onClose((closed) => seen.push(closed));
  return seen;
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

describe("createLinkPair", () => {
  it("carries messages and chunks both ways, as copies", async () => {
    const pair = createLinkPair(logger());
    const atAcceptor = received(pair.acceptor);
    const atDialer = received(pair.dialer);
    const body = { name: RING_NAME };
    await expect(pair.dialer.send({ type: "hello_there", body })).resolves.toBe(
      "sent",
    );
    await pair.acceptor.sendChunk({
      type: "bytes",
      header: { part: 1 },
      bytes: Uint8Array.from([1, 2]),
    });
    expect(atAcceptor).toEqual([
      { kind: "message", type: "hello_there", body },
    ]);
    expect(atAcceptor[0]?.kind === "message" && atAcceptor[0].body).not.toBe(
      body,
    );
    expect(atDialer).toEqual([
      {
        kind: "chunk",
        type: "bytes",
        header: { part: 1 },
        bytes: Uint8Array.from([1, 2]),
      },
    ]);
  });

  it("sends waiting messages before waiting chunks, after the chunk already being written", async () => {
    const pair = createLinkPair(logger());
    const frames = received(pair.acceptor);
    pair.hold();
    const sends = [
      pair.dialer.sendChunk({
        type: "c1",
        header: {},
        bytes: new Uint8Array(),
      }),
      pair.dialer.sendChunk({
        type: "c2",
        header: {},
        bytes: new Uint8Array(),
      }),
      pair.dialer.send({ type: "m1", body: {} }),
      pair.dialer.send({ type: "m2", body: {} }),
    ];
    await settle();
    expect(frames).toEqual([]);
    pair.resume();
    await Promise.all(sends);
    expect(frames.map((frame) => frame.type)).toEqual(["c1", "m1", "m2", "c2"]);
  });

  it("closes with a reason the other end sees, and settles what was waiting", async () => {
    const pair = createLinkPair(logger());
    const here = closings(pair.dialer);
    const there = closings(pair.acceptor);
    pair.hold();
    const writing = pair.dialer.send({ type: "m1", body: {} });
    const waiting = pair.dialer.send({ type: "m2", body: {} });
    pair.dialer.close("going away");
    await expect(waiting).resolves.toBe("closed");
    pair.resume();
    await settle();
    await expect(writing).resolves.toBe("sent");
    await expect(pair.dialer.send({ type: "m3", body: {} })).resolves.toBe(
      "closed",
    );
    expect(here).toEqual([{ cause: "closed_here", reason: "going away" }]);
    expect(there).toEqual([{ cause: "closed_by_peer", reason: "going away" }]);
    expect(pair.acceptor.closed).toEqual(there[0]);
  });

  it("drops the connection: both ends lose it, and held frames are not sent", async () => {
    const pair = createLinkPair(logger());
    const frames = received(pair.acceptor);
    pair.hold();
    const held = pair.dialer.send({ type: "m1", body: {} });
    pair.drop();
    await expect(held).resolves.toBe("closed");
    await expect(pair.acceptor.send({ type: "m2", body: {} })).resolves.toBe(
      "closed",
    );
    expect(frames).toEqual([]);
    expect(pair.dialer.closed).toEqual({
      cause: "connection_lost",
      reason: "",
    });
    expect(pair.acceptor.closed).toEqual({
      cause: "connection_lost",
      reason: "",
    });
  });

  it("tells a close listener at once when the link has already closed, and stops a listener on request", () => {
    const pair = createLinkPair(logger());
    const stopped: LinkClosed[] = [];
    const stop = pair.dialer.onClose((closed) => stopped.push(closed));
    stop();
    pair.dialer.close("done");
    expect(stopped).toEqual([]);
    expect(closings(pair.dialer)).toEqual([
      { cause: "closed_here", reason: "done" },
    ]);
  });

  it("refuses a close reason over the WebSocket limit", () => {
    const pair = createLinkPair(logger());
    expect(() => {
      pair.dialer.close("x".repeat(124));
    }).toThrow(RangeError);
    pair.dialer.close("x".repeat(123));
    expect(pair.dialer.closed?.cause).toBe("closed_here");
  });
});

describe("LinkEndpoint", () => {
  function endpoint(lines: string[] = []): {
    link: LinkEndpoint;
    shut: [number, string][];
  } {
    const shut: [number, string][] = [];
    const link = new LinkEndpoint(
      {
        write: (_frame, done) => {
          done(true);
        },
        shut: (code, reason) => shut.push([code, reason]),
      },
      logger(lines),
    );
    return { link, shut };
  }

  it("closes on a frame it does not accept, keeping nothing of it", () => {
    const lines: string[] = [];
    const { link, shut } = endpoint(lines);
    const frames = received(link);
    link.deliver(Buffer.from(`{"type":"m","body":"${RING_NAME}`), false);
    expect(frames).toEqual([]);
    expect(link.closed).toEqual({ cause: "malformed_frame", reason: "" });
    expect(shut).toEqual([[CLOSE_CODES.invalidPayload, "malformed frame"]]);
    expect(JSON.stringify(link.closed)).not.toContain(RING_NAME);
    expect(lines.join("\n")).not.toContain(RING_NAME);

    link.deliver(Buffer.from(`{"type":"m","body":{}}`), false);
    expect(frames).toEqual([]);
    expect(shut).toHaveLength(1);
  });

  it("logs a failing listener without the frame, and still tells the others", () => {
    const lines: string[] = [];
    const { link } = endpoint(lines);
    link.onFrame(() => {
      throw new Error("listener broke");
    });
    const frames = received(link);
    link.deliver(
      Buffer.from(JSON.stringify({ type: "named", body: RING_NAME })),
      false,
    );
    expect(frames).toHaveLength(1);
    const log = lines.join("\n");
    expect(log).toContain("link_listener_failed");
    expect(log).toContain('"message_type":"named"');
    expect(log).not.toContain(RING_NAME);
  });
});

describe("LinkSlot", () => {
  it("holds one link, and clears only when told to clear that same link", () => {
    const slot = new LinkSlot();
    const first = createLinkPair(logger()).dialer;
    const second = createLinkPair(logger()).dialer;
    expect(slot.current).toBeUndefined();
    slot.put(first);
    slot.put(second);
    slot.clear(first);
    expect(slot.current).toBe(second);
    slot.clear(second);
    expect(slot.current).toBeUndefined();
  });
});
