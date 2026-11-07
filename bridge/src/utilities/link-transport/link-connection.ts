// One open link, as both ends and both carriers (WSS and the in-memory pair) present it (CP-09,
// T015). `LinkEndpoint` is the part they share: the sending order, the decoding of what arrives,
// the listeners and the closing. A carrier supplies only a `LinkWire`.
import type { Logger } from "../logging/index.ts";
import { decodeFrame, encodeChunk, encodeMessage } from "./link-frame.ts";
import type {
  LinkChunk,
  LinkFrame,
  LinkMessage,
  WireFrame,
} from "./link-frame.ts";
import { SendQueue } from "./send-queue.ts";
import type { SendOutcome } from "./send-queue.ts";

/** Why a link closed. */
export type LinkCloseCause =
  /** This end called `close`. */
  | "closed_here"
  /** The other end closed the link, with its reason. */
  | "closed_by_peer"
  /** Nothing was heard from the other end for too long. */
  | "no_pong"
  /** The other end sent a frame this link does not accept. */
  | "malformed_frame"
  /** The connection failed or was cut. */
  | "connection_lost";

/** How a link closed. */
export interface LinkClosed {
  readonly cause: LinkCloseCause;
  /**
   * The closing end's short reason, or empty. From the other end it is untrusted text: log it as
   * a reason, never as content.
   */
  readonly reason: string;
}

/** Stops a listener. Calling it again does nothing. */
export type StopListening = () => void;

/** One open link. */
export interface LinkConnection {
  /** Queues a message. It goes before every chunk not yet being written. */
  send(message: LinkMessage): Promise<SendOutcome>;
  /** Queues a chunk. It goes after the messages waiting when its turn would come. */
  sendChunk(chunk: LinkChunk): Promise<SendOutcome>;
  /** Calls `listener` with each frame received, in order. */
  onFrame(listener: (frame: LinkFrame) => void): StopListening;
  /** Calls `listener` once when the link closes, or at once if it already has. */
  onClose(listener: (closed: LinkClosed) => void): StopListening;
  /**
   * Closes the link with a short reason the other end sees (at most 123 bytes, the WebSocket
   * limit). Frames still waiting resolve `closed`.
   */
  close(reason: string): void;
  /** How the link closed, or `undefined` while it is open. */
  readonly closed: LinkClosed | undefined;
}

/** The connection under an endpoint. */
export interface LinkWire {
  /** Writes one frame; calls `done(true)` once it has left, `done(false)` if it could not. */
  write(frame: WireFrame, done: (written: boolean) => void): void;
  /** Ends the connection; the other end sees `code` and `reason`. */
  shut(code: number, reason: string): void;
}

/** The WebSocket close codes the link uses (RFC 6455, section 7.4.1). */
export const CLOSE_CODES = {
  normal: 1000,
  invalidPayload: 1007,
} as const;

const MAX_REASON_BYTES = 123;
const MALFORMED_REASON = "malformed frame";

/** An open link over a `LinkWire`. Its carrier calls `deliver` and `lost`. */
export class LinkEndpoint implements LinkConnection {
  readonly #wire: LinkWire;
  readonly #logger: Logger;
  readonly #queue: SendQueue;
  readonly #frameListeners = new Set<(frame: LinkFrame) => void>();
  readonly #closeListeners = new Set<(closed: LinkClosed) => void>();
  #closed: LinkClosed | undefined;

  constructor(wire: LinkWire, logger: Logger) {
    this.#wire = wire;
    this.#logger = logger.with({ component: "link_transport" });
    this.#queue = new SendQueue((frame, done) => {
      wire.write(frame, done);
    });
  }

  get closed(): LinkClosed | undefined {
    return this.#closed;
  }

  send(message: LinkMessage): Promise<SendOutcome> {
    return this.#queue.enqueue(encodeMessage(message), "message");
  }

  sendChunk(chunk: LinkChunk): Promise<SendOutcome> {
    return this.#queue.enqueue(encodeChunk(chunk), "chunk");
  }

  onFrame(listener: (frame: LinkFrame) => void): StopListening {
    this.#frameListeners.add(listener);
    return () => {
      this.#frameListeners.delete(listener);
    };
  }

  onClose(listener: (closed: LinkClosed) => void): StopListening {
    if (this.#closed !== undefined) {
      listener(this.#closed);
      return () => undefined;
    }
    this.#closeListeners.add(listener);
    return () => {
      this.#closeListeners.delete(listener);
    };
  }

  close(reason: string): void {
    if (Buffer.byteLength(reason, "utf8") > MAX_REASON_BYTES) {
      throw new RangeError("A close reason is at most 123 bytes.");
    }
    this.#end({ cause: "closed_here", reason }, CLOSE_CODES.normal, reason);
  }

  /** A frame arrived. One the link does not accept closes the link, and nothing of it is kept. */
  deliver(data: Uint8Array, isBinary: boolean): void {
    if (this.#closed !== undefined) {
      return;
    }
    const frame = decodeFrame(data, isBinary);
    if (frame === undefined) {
      this.#end(
        { cause: "malformed_frame", reason: "" },
        CLOSE_CODES.invalidPayload,
        MALFORMED_REASON,
      );
      return;
    }
    for (const listener of this.#frameListeners) {
      this.#tell(listener, frame);
    }
  }

  /** The connection ended without this end closing it. */
  lost(closed: LinkClosed): void {
    if (this.#closed === undefined) {
      this.#settle(closed);
    }
  }

  // A listener's failure is its own: it is logged, without the frame, and the others still hear.
  #tell(listener: (frame: LinkFrame) => void, frame: LinkFrame): void {
    try {
      listener(frame);
    } catch (error) {
      this.#logger.error(
        "link_listener_failed",
        { message_type: frame.type },
        error,
      );
    }
  }

  #end(closed: LinkClosed, code: number, reason: string): void {
    if (this.#closed !== undefined) {
      return;
    }
    this.#settle(closed);
    this.#wire.shut(code, reason);
  }

  #settle(closed: LinkClosed): void {
    this.#closed = closed;
    this.#queue.close();
    this.#frameListeners.clear();
    const listeners = [...this.#closeListeners];
    this.#closeListeners.clear();
    for (const listener of listeners) {
      listener(closed);
    }
  }
}
