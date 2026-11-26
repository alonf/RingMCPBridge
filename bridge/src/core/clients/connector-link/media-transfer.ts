import { randomUUID } from "node:crypto";
import type {
  LinkConnection,
  LinkFrame,
} from "../../../utilities/link-transport/index.ts";
import type { EventMediaSource } from "../../managers/media/index.ts";
import {
  mediaCapable,
  mediaHeader,
  mediaReply,
  MEDIA_CHUNK_BYTES,
} from "./messages/index.ts";

type Result = Awaited<ReturnType<EventMediaSource>>;
interface Incoming {
  id: string;
  limit: number;
  resolve: (value: Result) => void;
  reject: (error: Error) => void;
  offset: number;
  item?: { bytes: Buffer; capturedAt: number };
}

/** Frames are admitted only after the session proves its key. No partial buffer leaves this session. */
export class MediaTransfer {
  capable = false;
  private incoming: Incoming | undefined;
  private readonly link: LinkConnection;
  constructor(link: LinkConnection) {
    this.link = link;
    link.onClose(() => {
      this.capable = false;
      this.fail();
    });
  }
  async request(
    key: Parameters<EventMediaSource>[0],
    signal: AbortSignal,
  ): Promise<Result> {
    if (!this.capable || this.incoming) return { status: "pending" };
    const deadline = AbortSignal.any([signal, AbortSignal.timeout(58_000)]);
    deadline.throwIfAborted();
    const id = randomUUID();
    const wait = Promise.withResolvers<Result>();
    this.incoming = {
      id,
      limit: key.kind === "frame" ? 8 * 1024 * 1024 : 32 * 1024 * 1024,
      offset: 0,
      ...wait,
    };
    const abort = () => {
      this.fail();
    };
    deadline.addEventListener("abort", abort, { once: true });
    try {
      void this.link.send({
        type: "media_request",
        body: { requestId: id, ...key },
      });
      return await wait.promise;
    } finally {
      deadline.removeEventListener("abort", abort);
      this.incoming = undefined;
    }
  }
  private fail() {
    const transfer = this.incoming;
    if (!transfer) return;
    void this.link.send({
      type: "media_cancel",
      body: { requestId: transfer.id },
    });
    transfer.reject(new Error("Home media transfer interrupted."));
  }
  receive(frame: LinkFrame): boolean {
    if (frame.type === "media_capable" && frame.kind === "message") {
      this.capable = mediaCapable.safeParse(frame.body).success;
      return true;
    }
    if (frame.type !== "media_chunk" && frame.type !== "media_reply")
      return false;
    const t = this.incoming;
    if (!t) return true;
    if (frame.type === "media_chunk" && frame.kind === "chunk") {
      const header = mediaHeader.safeParse(frame.header);
      if (!header.success) this.fail();
      else if (header.data.requestId === t.id) {
        if (
          !t.item ||
          header.data.offset !== t.offset ||
          !frame.bytes.length ||
          frame.bytes.length > MEDIA_CHUNK_BYTES ||
          frame.bytes.length > t.item.bytes.length - t.offset
        )
          this.fail();
        else {
          t.item.bytes.set(frame.bytes, t.offset);
          t.offset += frame.bytes.length;
        }
      }
      return true;
    }
    if (frame.kind !== "message" || frame.type !== "media_reply") {
      this.fail();
      return true;
    }
    const parsed = mediaReply.safeParse(frame.body);
    if (!parsed.success) {
      this.fail();
      return true;
    }
    const msg = parsed.data;
    if (msg.requestId !== t.id) return true;
    switch (msg.status) {
      case "pending":
      case "missing":
        t.resolve({ status: msg.status });
        break;
      case "failed":
        this.fail();
        break;
      case "start":
        if (t.item || msg.length > t.limit) this.fail();
        else
          t.item = {
            capturedAt: msg.capturedAt,
            bytes: Buffer.alloc(msg.length),
          };
        break;
      case "complete": {
        const item = t.item;
        if (t.offset !== item?.bytes.length) this.fail();
        else
          t.resolve({
            status: "available",
            capturedAt: item.capturedAt,
            load: (signal) => {
              signal.throwIfAborted();
              return Promise.resolve({
                length: item.bytes.length,
                body: [item.bytes],
              });
            },
          });
        break;
      }
    }
    return true;
  }
}
