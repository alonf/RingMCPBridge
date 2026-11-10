// The sending order (T015, CD X2), with a writer the test completes by hand, so frames really wait:
// messages go before chunks, each kind in order, one frame at a time; a closed link settles every
// waiting frame.
import { describe, expect, it } from "vitest";
import type { WireFrame } from "./link-frame.ts";
import { SendQueue } from "./send-queue.ts";
import type { SendLane, SendOutcome } from "./send-queue.ts";

interface Write {
  readonly name: string;
  readonly done: (written: boolean) => void;
}

function frame(name: string): WireFrame {
  return { data: Buffer.from(name), isBinary: false };
}

function setup(): {
  queue: SendQueue;
  writes: Write[];
  send: (name: string, lane: SendLane) => Promise<SendOutcome>;
} {
  const writes: Write[] = [];
  const queue = new SendQueue((written, done) => {
    writes.push({ name: Buffer.from(written.data).toString(), done });
  });
  return {
    queue,
    writes,
    send: (name, lane) => queue.enqueue(frame(name), lane),
  };
}

function finishNext(writes: Write[], index: number, written = true): void {
  writes[index]?.done(written);
}

describe("SendQueue", () => {
  it("writes one frame at a time, every waiting message before any waiting chunk", async () => {
    const { writes, send } = setup();
    const outcomes = [
      send("chunk-1", "chunk"),
      send("chunk-2", "chunk"),
      send("message-1", "message"),
      send("message-2", "message"),
    ];
    expect(writes.map((write) => write.name)).toEqual(["chunk-1"]);
    for (let index = 0; index < 4; index += 1) {
      finishNext(writes, index);
    }
    expect(writes.map((write) => write.name)).toEqual([
      "chunk-1",
      "message-1",
      "message-2",
      "chunk-2",
    ]);
    await expect(Promise.all(outcomes)).resolves.toEqual([
      "sent",
      "sent",
      "sent",
      "sent",
    ]);
  });

  it("settles waiting frames as closed when the link closes, and refuses later ones", async () => {
    const { queue, writes, send } = setup();
    const writing = send("message-1", "message");
    const waiting = [send("message-2", "message"), send("chunk-1", "chunk")];
    queue.close();
    await expect(Promise.all(waiting)).resolves.toEqual(["closed", "closed"]);
    finishNext(writes, 0, false);
    await expect(writing).resolves.toBe("closed");
    await expect(send("message-3", "message")).resolves.toBe("closed");
    expect(writes).toHaveLength(1);
  });

  // CP-10's review: a connection that pushes back may never finish a write, and a stop that waits
  // on that send would wait for ever. A closed link settles the frame in flight too; whether it got
  // out is unknown, so the sender treats it as not sent and sends it again.
  it("settles the frame being written as closed when the link closes, though its write never finishes", async () => {
    const { queue, writes, send } = setup();
    const writing = send("message-1", "message");
    expect(writes).toHaveLength(1);

    queue.close();

    await expect(writing).resolves.toBe("closed");
    finishNext(writes, 0, true);
    await expect(writing).resolves.toBe("closed");
  });

  it("goes on after a frame the writer could not write, and ignores a second done", async () => {
    const { writes, send } = setup();
    const first = send("message-1", "message");
    const second = send("message-2", "message");
    finishNext(writes, 0, false);
    finishNext(writes, 0, true);
    expect(writes.map((write) => write.name)).toEqual([
      "message-1",
      "message-2",
    ]);
    finishNext(writes, 1);
    await expect(first).resolves.toBe("closed");
    await expect(second).resolves.toBe("sent");
  });
});
