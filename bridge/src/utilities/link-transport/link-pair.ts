// Two linked ends in one process (CP-09, T015; CD X2 "an in-memory pair"): no sockets, but the
// same frames, encoding, order and closing as over WSS. Mode A links its home part and its core
// with it (T027); tests use it too. A test can also hold writes, to see the sending order, and drop
// the connection; mode A never does.
import type { Logger } from "../logging/index.ts";
import { LinkEndpoint } from "./link-connection.ts";
import type { LinkConnection, LinkWire } from "./link-connection.ts";

/** The two ends, and the test's controls over the connection between them. */
export interface LinkPair {
  /** The end that would have dialed. */
  readonly dialer: LinkConnection;
  /** The end that would have accepted. */
  readonly acceptor: LinkConnection;
  /** Holds every frame written from now on, in order, until `resume`. */
  hold(): void;
  /** Delivers the held frames in order, and stops holding. */
  resume(): void;
  /** Cuts the connection: both ends close as `connection_lost`, and held frames are not delivered. */
  drop(): void;
}

interface Connection {
  holding: boolean;
  dropped: boolean;
  readonly held: (() => void)[];
}

/** A connected pair. Frames arrive asynchronously, as they would over a socket. */
export function createLinkPair(logger: Logger): LinkPair {
  const connection: Connection = { holding: false, dropped: false, held: [] };
  const ends: { dialer?: LinkEndpoint; acceptor?: LinkEndpoint } = {};
  const peerOf = (side: "dialer" | "acceptor"): LinkEndpoint | undefined =>
    side === "dialer" ? ends.acceptor : ends.dialer;
  const dialer = new LinkEndpoint(
    wireTo(connection, () => peerOf("dialer")),
    logger,
  );
  const acceptor = new LinkEndpoint(
    wireTo(connection, () => peerOf("acceptor")),
    logger,
  );
  ends.dialer = dialer;
  ends.acceptor = acceptor;
  return {
    dialer,
    acceptor,
    hold: () => {
      connection.holding = true;
    },
    resume: () => {
      connection.holding = false;
      for (const deliver of connection.held.splice(0)) {
        deliver();
      }
    },
    drop: () => {
      connection.dropped = true;
      dialer.lost({ cause: "connection_lost", reason: "" });
      acceptor.lost({ cause: "connection_lost", reason: "" });
      for (const deliver of connection.held.splice(0)) {
        deliver();
      }
    },
  };
}

function wireTo(
  connection: Connection,
  peer: () => LinkEndpoint | undefined,
): LinkWire {
  return {
    write: (frame, done) => {
      inOrder(connection, () => {
        const other = peer();
        if (connection.dropped || other?.closed !== undefined) {
          done(false);
          return;
        }
        other?.deliver(frame.data, frame.isBinary);
        done(true);
      });
    },
    // As over WSS, the close follows the frames written before it, and the other end sees the
    // reason; the close code adds nothing it reads.
    shut: (_code, reason) => {
      inOrder(connection, () => {
        peer()?.lost({ cause: "closed_by_peer", reason });
      });
    },
  };
}

// Runs `step` after everything written before it: held while the test holds, else soon.
function inOrder(connection: Connection, step: () => void): void {
  if (connection.holding && !connection.dropped) {
    connection.held.push(step);
    return;
  }
  queueMicrotask(step);
}
