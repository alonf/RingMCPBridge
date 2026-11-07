// The link over real WebSockets on localhost (T015): dialing and accepting, frames both ways
// without compression, ping and pong on the fake clock, and every way a link ends. A raw ws server
// plays an other end that misbehaves.
import { createServer } from "node:http";
import type { IncomingHttpHeaders, Server } from "node:http";
import { createServer as createTcpServer } from "node:net";
import type { AddressInfo, Socket } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocketServer } from "ws";
import type { WebSocket } from "ws";
import { FakeClock } from "../clock/index.ts";
import { Logger } from "../logging/index.ts";
import { DIAL_TIMEOUT_MS, dialLink } from "./dial-link.ts";
import type { DialOutcome } from "./dial-link.ts";
import type { LinkConnection } from "./link-connection.ts";
import { MAX_FRAME_BYTES } from "./link-frame.ts";
import type { LinkFrame } from "./link-frame.ts";
import { LinkServer } from "./link-server.ts";
import { PING_INTERVAL_MS } from "./socket-link.ts";

const START = Date.UTC(2026, 10, 7, 9, 0, 0);
const RING_NAME = "דלת כניסה";
const LINK_PATH = "/link";
const IO_WAIT_MS = 2_000;
const IO_POLL_MS = 5;

const cleanups: (() => Promise<void> | void)[] = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    await cleanup();
  }
});

function quietLogger(): Logger {
  return new Logger({ sink: () => undefined, now: () => 0, minLevel: "debug" });
}

/** Waits, in real time, for socket I/O to make `condition` true. */
async function until(condition: () => boolean): Promise<void> {
  for (let waited = 0; !condition(); waited += IO_POLL_MS) {
    if (waited > IO_WAIT_MS) {
      throw new Error("The socket did not get there in time.");
    }
    await new Promise((resolve) => setTimeout(resolve, IO_POLL_MS));
  }
}

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  cleanups.push(
    () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => {
          resolve();
        });
      }),
  );
  return (server.address() as AddressInfo).port;
}

interface Accepting {
  readonly url: string;
  readonly clock: FakeClock;
  readonly linkServer: LinkServer;
  readonly accepted: LinkConnection[];
  readonly upgradeHeaders: IncomingHttpHeaders[];
}

async function acceptingServer(
  clock = new FakeClock(START),
): Promise<Accepting> {
  const accepted: LinkConnection[] = [];
  const upgradeHeaders: IncomingHttpHeaders[] = [];
  const linkServer = new LinkServer({
    clock,
    logger: quietLogger(),
    onLink: (link) => accepted.push(link),
  });
  const server = createServer();
  server.on("upgrade", (request, socket, head) => {
    upgradeHeaders.push(request.headers);
    if (request.url === LINK_PATH) {
      linkServer.handleUpgrade(request, socket, head);
      return;
    }
    socket.destroy();
  });
  const port = await listen(server);
  cleanups.push(() => {
    linkServer.close("test over");
  });
  return {
    url: `ws://127.0.0.1:${String(port)}${LINK_PATH}`,
    clock,
    linkServer,
    accepted,
    upgradeHeaders,
  };
}

/** A raw ws server, to play an other end that misbehaves. */
async function rawServer(
  options: { readonly autoPong?: boolean },
  onSocket: (socket: WebSocket) => void,
): Promise<string> {
  const server = createServer();
  const raw = new WebSocketServer({
    server,
    autoPong: options.autoPong ?? true,
  });
  raw.on("connection", onSocket);
  const port = await listen(server);
  cleanups.push(() => {
    for (const client of raw.clients) {
      client.terminate();
    }
    raw.close();
  });
  return `ws://127.0.0.1:${String(port)}`;
}

async function dial(url: string, clock: FakeClock): Promise<LinkConnection> {
  const outcome = await dialLink(
    url,
    { clock, logger: quietLogger() },
    new AbortController().signal,
  );
  if (outcome.kind !== "connected") {
    throw new Error("The test's dial did not connect.");
  }
  cleanups.push(() => {
    if (outcome.link.closed === undefined) {
      outcome.link.close("test over");
    }
  });
  return outcome.link;
}

function firstOf(links: readonly LinkConnection[]): LinkConnection {
  const link = links.at(0);
  if (link === undefined) {
    throw new Error("No link was accepted.");
  }
  return link;
}

function framesOf(link: LinkConnection): LinkFrame[] {
  const frames: LinkFrame[] = [];
  link.onFrame((frame) => frames.push(frame));
  return frames;
}

describe("a link over WebSockets", () => {
  it("carries messages and chunks both ways, with compression off", async () => {
    const server = await acceptingServer();
    const dialer = await dial(server.url, server.clock);
    await until(() => server.accepted.length === 1);
    const acceptor = firstOf(server.accepted);
    const atAcceptor = framesOf(acceptor);
    const atDialer = framesOf(dialer);

    await dialer.send({ type: "greeting", body: { name: RING_NAME } });
    await acceptor.sendChunk({
      type: "bytes",
      header: { part: 1 },
      bytes: Uint8Array.from([9, 8, 7]),
    });
    await until(() => atAcceptor.length === 1 && atDialer.length === 1);
    expect(atAcceptor).toEqual([
      { kind: "message", type: "greeting", body: { name: RING_NAME } },
    ]);
    expect(atDialer).toEqual([
      {
        kind: "chunk",
        type: "bytes",
        header: { part: 1 },
        bytes: Uint8Array.from([9, 8, 7]),
      },
    ]);
    expect(
      server.upgradeHeaders[0]?.["sec-websocket-extensions"],
    ).toBeUndefined();
  });

  it("dials only wss:, or ws: to this machine", () => {
    const context = { clock: new FakeClock(START), logger: quietLogger() };
    const signal = new AbortController().signal;
    for (const url of [
      "ws://example.com/link",
      "ws://10.0.0.5/link",
      "http://127.0.0.1/link",
      "https://example.com/link",
    ]) {
      expect(() => dialLink(url, context, signal)).toThrow(RangeError);
    }
  });

  it("reports unreachable when nothing listens", async () => {
    const server = createServer();
    const port = await listen(server);
    await new Promise<void>((resolve) =>
      server.close(() => {
        resolve();
      }),
    );
    const outcome = await dialLink(
      `ws://127.0.0.1:${String(port)}${LINK_PATH}`,
      { clock: new FakeClock(START), logger: quietLogger() },
      new AbortController().signal,
    );
    expect(outcome).toEqual({ kind: "unreachable" });
    const overTls = await dialLink(
      `wss://127.0.0.1:${String(port)}${LINK_PATH}`,
      { clock: new FakeClock(START), logger: quietLogger() },
      new AbortController().signal,
    );
    expect(overTls).toEqual({ kind: "unreachable" });
  });

  it("reports unreachable after the dial timeout when the other end never answers, and passes on an abort", async () => {
    const sockets: Socket[] = [];
    const silent = createTcpServer((socket) => sockets.push(socket));
    await new Promise<void>((resolve) =>
      silent.listen(0, "127.0.0.1", resolve),
    );
    cleanups.push(
      () =>
        new Promise<void>((resolve) => {
          for (const socket of sockets) {
            socket.destroy();
          }
          silent.close(() => {
            resolve();
          });
        }),
    );
    const url = `ws://127.0.0.1:${String((silent.address() as AddressInfo).port)}`;
    const clock = new FakeClock(START);
    const context = { clock, logger: quietLogger() };

    const dialing = dialLink(url, context, new AbortController().signal);
    await until(() => sockets.length === 1);
    await clock.advance(DIAL_TIMEOUT_MS);
    await expect(dialing).resolves.toEqual<DialOutcome>({
      kind: "unreachable",
    });

    const controller = new AbortController();
    const aborted = dialLink(url, context, controller.signal);
    controller.abort(new Error("caller stopped"));
    await expect(aborted).rejects.toThrow("caller stopped");
  });

  it("stays open while pongs come back", async () => {
    const server = await acceptingServer();
    const dialer = await dial(server.url, server.clock);
    await until(() => server.accepted.length === 1);
    for (let round = 0; round < 4; round += 1) {
      await server.clock.advance(PING_INTERVAL_MS);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(dialer.closed).toBeUndefined();
    expect(server.accepted[0]?.closed).toBeUndefined();
  });

  it("ends as no_pong when the other end stops answering pings", async () => {
    const url = await rawServer({ autoPong: false }, () => undefined);
    const clock = new FakeClock(START);
    const dialer = await dial(url, clock);
    await clock.advance(PING_INTERVAL_MS);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(dialer.closed).toBeUndefined();
    await clock.advance(PING_INTERVAL_MS);
    expect(dialer.closed).toEqual({ cause: "no_pong", reason: "" });
  });

  it("ends as malformed_frame on a frame it does not accept, and tells the other end why", async () => {
    const closes: [number, string][] = [];
    const url = await rawServer({}, (socket) => {
      socket.on("close", (code, reason) =>
        closes.push([code, reason.toString()]),
      );
      socket.send(`{"type":"m","body":"${RING_NAME}`);
    });
    const dialer = await dial(url, new FakeClock(START));
    await until(() => dialer.closed !== undefined && closes.length === 1);
    expect(dialer.closed).toEqual({ cause: "malformed_frame", reason: "" });
    expect(closes).toEqual([[1007, "malformed frame"]]);
  });

  it("ends as malformed_frame on a frame over the size limit, refused by ws before it is read whole", async () => {
    const closes: number[] = [];
    const url = await rawServer({}, (socket) => {
      socket.on("close", (code) => closes.push(code));
      socket.send("x".repeat(MAX_FRAME_BYTES + 1));
    });
    const dialer = await dial(url, new FakeClock(START));
    await until(() => dialer.closed !== undefined && closes.length === 1);
    expect(dialer.closed).toEqual({ cause: "malformed_frame", reason: "" });
    // 1009, "message too big": ws's own limit, not the decoder's check after reading it all.
    expect(closes).toEqual([1009]);
  });

  it("passes on the other end's reason, and a cut connection as connection_lost", async () => {
    const server = await acceptingServer();
    const first = await dial(server.url, server.clock);
    await until(() => server.accepted.length === 1);
    server.accepted[0]?.close("going away");
    await until(() => first.closed !== undefined);
    expect(first.closed).toEqual({
      cause: "closed_by_peer",
      reason: "going away",
    });

    const url = await rawServer({}, (socket) => {
      socket.terminate();
    });
    const second = await dial(url, new FakeClock(START));
    await until(() => second.closed !== undefined);
    expect(second.closed).toEqual({ cause: "connection_lost", reason: "" });
  });

  it("closes every open link when the server closes", async () => {
    const server = await acceptingServer();
    const links = [
      await dial(server.url, server.clock),
      await dial(server.url, server.clock),
    ];
    await until(() => server.linkServer.openLinks === 2);
    server.linkServer.close("shutting down");
    await until(() => links.every((link) => link.closed !== undefined));
    expect(links.map((link) => link.closed)).toEqual([
      { cause: "closed_by_peer", reason: "shutting down" },
      { cause: "closed_by_peer", reason: "shutting down" },
    ]);
    expect(server.linkServer.openLinks).toBe(0);
  });
});
