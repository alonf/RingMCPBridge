// The link's sending order (CP-09, T015; CD X2): every waiting message goes before any waiting
// chunk, each kind in the order it was queued, and one frame is written at a time. A chunk that is
// already being written finishes first, so priority works one frame at a time; that is why chunks
// stay small (their size is set in iteration 003, PT-08).
import type { WireFrame } from "./link-frame.ts";

/** What became of a queued frame: written to the connection, or not, because the link closed. */
export type SendOutcome = "sent" | "closed";

/** Which queue a frame waits in. */
export type SendLane = "message" | "chunk";

/** Writes one frame, then calls `done(true)` once it has left, or `done(false)` if it could not. */
export type FrameWriter = (
  frame: WireFrame,
  done: (written: boolean) => void,
) => void;

interface Queued {
  readonly frame: WireFrame;
  readonly settle: (outcome: SendOutcome) => void;
}

/** One connection's outgoing frames. */
export class SendQueue {
  readonly #write: FrameWriter;
  readonly #messages: Queued[] = [];
  readonly #chunks: Queued[] = [];
  #writing = false;
  #closed = false;

  constructor(write: FrameWriter) {
    this.#write = write;
  }

  /** Queues a frame. Resolves `sent` once it is written, or `closed` if the link closes first. */
  enqueue(frame: WireFrame, lane: SendLane): Promise<SendOutcome> {
    if (this.#closed) {
      return Promise.resolve("closed");
    }
    return new Promise((settle) => {
      const queue = lane === "message" ? this.#messages : this.#chunks;
      queue.push({ frame, settle });
      this.#writeNext();
    });
  }

  /** Settles every frame still waiting as `closed`; frames queued later resolve `closed` at once. */
  close(): void {
    this.#closed = true;
    for (const queued of this.#messages.splice(0)) {
      queued.settle("closed");
    }
    for (const queued of this.#chunks.splice(0)) {
      queued.settle("closed");
    }
  }

  #writeNext(): void {
    if (this.#writing || this.#closed) {
      return;
    }
    const next = this.#messages.shift() ?? this.#chunks.shift();
    if (next === undefined) {
      return;
    }
    this.#writing = true;
    let finished = false;
    this.#write(next.frame, (written) => {
      if (finished) {
        return;
      }
      finished = true;
      this.#writing = false;
      next.settle(written ? "sent" : "closed");
      this.#writeNext();
    });
  }
}
