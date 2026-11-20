// Accepting links (CP-09, T015): the accepting end. The Host's HTTP server hands it each upgrade
// request for the link's path, so the link shares the server's TLS certificate (SC2). Each link is
// accepted before the other end has proved anything, so frames are capped at `MAX_FRAME_BYTES`
// and compression stays off from the first byte.
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer } from "ws";
import { MAX_FRAME_BYTES } from "./link-frame.ts";
import type { LinkConnection } from "./link-connection.ts";
import { linkOverSocket } from "./socket-link.ts";
import type { SocketLinkContext } from "./socket-link.ts";

/** What a link server needs. */
export interface LinkServerOptions extends SocketLinkContext {
  /** Takes each new link. It owns the link from then on, and must not throw. */
  readonly onLink: (link: LinkConnection) => void;
}

/** The accepting end of the link. One per process, owned by the Host. */
export class LinkServer {
  readonly #server = new WebSocketServer({
    noServer: true,
    clientTracking: false,
    maxPayload: MAX_FRAME_BYTES,
    perMessageDeflate: false,
  });
  readonly #options: LinkServerOptions;
  readonly #open = new Set<LinkConnection>();

  constructor(options: LinkServerOptions) {
    this.#options = options;
  }

  /** How many links are open now. */
  get openLinks(): number {
    return this.#open.size;
  }

  /** Completes one upgrade request. The caller has already matched the link's path. */
  handleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer): void {
    this.#server.handleUpgrade(request, socket, head, (webSocket) => {
      const link = linkOverSocket(webSocket, this.#options);
      this.#open.add(link);
      link.onClose(() => {
        this.#open.delete(link);
      });
      this.#options.onLink(link);
    });
  }

  /** Closes every open link with `reason`. */
  close(reason: string): void {
    for (const link of [...this.#open]) {
      link.close(reason);
    }
    this.#server.close();
  }
}
