// Dialing a link (CP-09, T015): the dialing end opens the WebSocket. Only `wss:` is dialed, so the
// other end proves itself with its TLS certificate, which is always checked (SC2, IA D1). Plain
// `ws:` is allowed to this machine only, for tests on localhost; there is no option to turn
// certificate checks off.
import { WebSocket } from "ws";
import { MAX_FRAME_BYTES } from "./link-frame.ts";
import type { LinkConnection } from "./link-connection.ts";
import { linkOverSocket } from "./socket-link.ts";
import type { SocketLinkContext } from "./socket-link.ts";

/** How long a dial may take before it counts as unreachable [P]. */
export const DIAL_TIMEOUT_MS = 10_000;

/** What became of a dial: an open link, or no link. The caller decides when to try again. */
export type DialOutcome =
  | { readonly kind: "connected"; readonly link: LinkConnection }
  | { readonly kind: "unreachable" };

/** What a dial may be told. There is no option to turn certificate checks off. */
export interface DialOptions {
  /**
   * The certificates to trust for this dial, in PEM, in place of Node's own list: a test's
   * throwaway certificate (T017). Production leaves it out and trusts the public CAs.
   */
  readonly trustedCertificates?: string;
}

const UNREACHABLE: DialOutcome = { kind: "unreachable" };
const LOOPBACK_HOSTS: ReadonlySet<string> = new Set([
  "localhost",
  "127.0.0.1",
  "[::1]",
]);

/**
 * Dials `url`. Throws `RangeError` for a URL that is not `wss:` (or `ws:` to this machine), and
 * the signal's reason if it aborts first. A certificate that does not check out is `unreachable`.
 */
export function dialLink(
  url: string,
  context: SocketLinkContext,
  signal: AbortSignal,
  options: DialOptions = {},
): Promise<DialOutcome> {
  const target = new URL(url);
  if (!isAllowedTarget(target)) {
    throw new RangeError(
      "The link dials only wss:, or ws: to this machine for tests.",
    );
  }
  signal.throwIfAborted();
  const socket = new WebSocket(target, {
    maxPayload: MAX_FRAME_BYTES,
    perMessageDeflate: false,
    ...(options.trustedCertificates === undefined
      ? {}
      : { ca: options.trustedCertificates }),
  });
  // ws reports a failed handshake as an error event, which must have a listener.
  socket.on("error", () => undefined);
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (): boolean => {
      if (settled) {
        return false;
      }
      settled = true;
      cancel();
      signal.removeEventListener("abort", onAbort);
      return true;
    };
    const giveUp = (): void => {
      if (finish()) {
        socket.terminate();
        resolve(UNREACHABLE);
      }
    };
    const onAbort = (): void => {
      if (finish()) {
        socket.terminate();
        reject(signal.reason as Error);
      }
    };
    const cancel = context.clock.schedule(DIAL_TIMEOUT_MS, giveUp);
    signal.addEventListener("abort", onAbort, { once: true });
    socket.once("error", giveUp);
    socket.once("open", () => {
      if (finish()) {
        resolve({ kind: "connected", link: linkOverSocket(socket, context) });
      }
    });
  });
}

function isAllowedTarget(target: URL): boolean {
  if (target.protocol === "wss:") {
    return true;
  }
  return target.protocol === "ws:" && LOOPBACK_HOSTS.has(target.hostname);
}
