// A link over an open ws socket (CP-09, T015): the WSS carrier both ends use. Besides the shared
// endpoint, it keeps the connection honest with WebSocket ping and pong: each end pings every
// 10 s, any frame or pong counts as hearing the other end, and 20 s of silence ends the link as
// `no_pong`, so a half-open connection is noticed within 30 s (FR-042).
import { WebSocket } from "ws";
import type { Clock } from "../clock/index.ts";
import type { Logger } from "../logging/index.ts";
import { LinkEndpoint } from "./link-connection.ts";
import type {
  LinkCloseCause,
  LinkClosed,
  LinkConnection,
} from "./link-connection.ts";
import type { WireFrame } from "./link-frame.ts";

/** How often each end pings [P]. */
export const PING_INTERVAL_MS = 10_000;

/** How long an end may stay silent before the link ends as `no_pong` [P]. */
export const SILENCE_LIMIT_MS = 20_000;

/** What a socket link needs. */
export interface SocketLinkContext {
  readonly clock: Clock;
  readonly logger: Logger;
}

// A close without a close frame: the connection was cut (RFC 6455, section 7.1.5).
const ABNORMAL_CLOSURE = 1006;

/** Wraps an open socket as a link. The socket is the link's from now on. */
export function linkOverSocket(
  socket: WebSocket,
  context: SocketLinkContext,
): LinkConnection {
  const endpoint = new LinkEndpoint(
    {
      write: (frame, done) => {
        writeTo(socket, frame, done);
      },
      shut: (code, reason) => {
        socket.close(code, reason);
      },
    },
    context.logger,
  );
  const liveness = watchLiveness(socket, context.clock, () => {
    endpoint.lost({ cause: "no_pong", reason: "" });
    socket.terminate();
  });
  let failure: LinkCloseCause | undefined;
  socket.on("message", (data, isBinary) => {
    liveness.heard();
    endpoint.deliver(bytesOf(data), isBinary);
  });
  socket.on("pong", liveness.heard);
  socket.on("ping", liveness.heard);
  socket.on("error", (error) => {
    failure = isFrameViolation(error) ? "malformed_frame" : "connection_lost";
  });
  socket.on("close", (code, reason) => {
    liveness.stop();
    endpoint.lost(closedBy(code, reason, failure));
  });
  return endpoint;
}

function writeTo(
  socket: WebSocket,
  frame: WireFrame,
  done: (written: boolean) => void,
): void {
  if (socket.readyState !== WebSocket.OPEN) {
    done(false);
    return;
  }
  socket.send(frame.data, { binary: frame.isBinary }, (error) => {
    // Node calls a write callback with null or nothing on success.
    done(!(error instanceof Error));
  });
}

interface Liveness {
  readonly heard: () => void;
  readonly stop: () => void;
}

function watchLiveness(
  socket: WebSocket,
  clock: Clock,
  onSilent: () => void,
): Liveness {
  let lastHeard = clock.now();
  const check = (): void => {
    if (clock.now() - lastHeard >= SILENCE_LIMIT_MS) {
      onSilent();
      return;
    }
    if (socket.readyState === WebSocket.OPEN) {
      socket.ping();
    }
    cancel = clock.schedule(PING_INTERVAL_MS, check);
  };
  let cancel = clock.schedule(PING_INTERVAL_MS, check);
  return {
    heard: () => {
      lastHeard = clock.now();
    },
    stop: () => {
      cancel();
    },
  };
}

// ws reports a frame that breaks the protocol or the size limit with a `WS_ERR_` code.
function isFrameViolation(error: Error): boolean {
  const { code } = error as { readonly code?: unknown };
  return typeof code === "string" && code.startsWith("WS_ERR_");
}

function closedBy(
  code: number,
  reason: Buffer,
  failure: LinkCloseCause | undefined,
): LinkClosed {
  if (failure !== undefined) {
    return { cause: failure, reason: "" };
  }
  if (code === ABNORMAL_CLOSURE) {
    return { cause: "connection_lost", reason: "" };
  }
  return { cause: "closed_by_peer", reason: reason.toString("utf8") };
}

function bytesOf(data: Buffer | ArrayBuffer | Buffer[]): Uint8Array {
  if (Array.isArray(data)) {
    return Buffer.concat(data);
  }
  return data instanceof ArrayBuffer ? new Uint8Array(data) : data;
}
