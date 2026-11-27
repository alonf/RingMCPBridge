// Link transport utility (CP-09, T015): the one WSS link between the two ends, and its in-memory
// twin for tests. It knows frame kinds, type names, the protocol version and the sending order,
// never a name from Ring or the bridge (CD X2). The Host owns its lifetime: one per process. The
// only entry point (CD4).

/**
 * Frames: a message (a type name and a JSON body) or a chunk (a type name, a JSON header and
 * bytes). Messages go before chunks. The body and header are the receiver's to parse.
 */
export type { LinkChunk, LinkFrame, LinkMessage } from "./link-frame.ts";

/** The link protocol version (N) and the receiver's check for N or N-1 (FR-046). */
export { isAcceptedLinkVersion, LINK_PROTOCOL_VERSION } from "./link-frame.ts";

/** The largest frame either end sends or accepts, in bytes. */
export { MAX_FRAME_BYTES } from "./link-frame.ts";

/** One open link, how it closed, and what became of a frame sent on it. */
export type {
  LinkCloseCause,
  LinkClosed,
  LinkConnection,
  StopListening,
} from "./link-connection.ts";
export type { SendOutcome } from "./send-queue.ts";

/** The dialing end: `dialLink` resolves `connected` with a link, or `unreachable`. */
export { DIAL_TIMEOUT_MS, dialLink } from "./dial-link.ts";
export type { DialOptions, DialOutcome } from "./dial-link.ts";

/** The accepting end, which the Host's HTTP server hands each upgrade request. */
export { LinkServer } from "./link-server.ts";
export type { LinkServerOptions } from "./link-server.ts";

/** Ping every 10 s; 20 s of silence ends a link as `no_pong`. */
export { PING_INTERVAL_MS, SILENCE_LIMIT_MS } from "./socket-link.ts";
export type { SocketLinkContext } from "./socket-link.ts";

/** The link that is open and ready to carry messages, which the Host shares; it only holds. */
export { LinkSlot } from "./link-slot.ts";

/** Two linked ends in one process, for mode A and tests: no sockets, the same frames and order. */
export { createLinkPair } from "./link-pair.ts";
export type { LinkPair } from "./link-pair.ts";
