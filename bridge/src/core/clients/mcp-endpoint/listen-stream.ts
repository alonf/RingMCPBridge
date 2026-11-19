import type { Clock } from "../../../utilities/clock/index.ts";
import type { BridgeEvent } from "../../../contract/index.ts";

export const EVENTS_URI = "ring://bridge/events";
const MAX_STREAMS = 64;
const BUFFERED_FRAMES = 16;
const KEEPALIVE_MS = 15_000;
const SSE_HEADERS = {
  "content-type": "text/event-stream",
  "cache-control": "no-cache, no-transform",
  "x-accel-buffering": "no",
};
export type Listen = (receive: (event: BridgeEvent) => void) => () => void;

/** Legacy Streamable HTTP listens with GET on the MCP endpoint. */
export function legacyListen(listen: Listen, clock: Clock): Response {
  const encoder = new TextEncoder();
  let cleanup: () => void;
  const body = new ReadableStream<Uint8Array>({
    start(output) {
      const write = (text: string) => {
        output.enqueue(encoder.encode(text));
      };
      write(": connected\n\n");
      const cancelTick = clock.every(KEEPALIVE_MS, () => {
        write(": keepalive\n\n");
      });
      const unsubscribe = listen((event) => {
        const message = {
          jsonrpc: "2.0",
          method: "notifications/message",
          params: { level: "info", logger: "ring.event", data: event },
        };
        write("event: message\ndata: " + JSON.stringify(message) + "\n\n");
      });
      cleanup = () => {
        unsubscribe();
        cancelTick();
      };
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(body, { headers: SSE_HEADERS });
}

/** Bounds the SDK and legacy streams identically. Drain the source while checking the
 * exact bearer grant. A slow reader reconnects and recovers from its own event cursor. */
export class ListenStreams {
  readonly #clock: Clock;
  readonly #open = new Set<AbortController>();
  #stopped = false;

  constructor(clock: Clock) {
    this.#clock = clock;
  }
  stop(): void {
    this.#stopped = true;
    for (const stream of this.#open) stream.abort();
  }

  open(
    response: Response,
    request: Request,
    expiresAt: number,
    authorized: () => Promise<boolean>,
  ): Response {
    const reader: ReadableStreamDefaultReader<Uint8Array> | undefined =
      response.body?.getReader();
    if (!reader) return response;
    let refusal: number | undefined;
    if (this.#stopped || request.signal.aborted) refusal = 503;
    else if (this.#clock.now() >= expiresAt) refusal = 401;
    else if (this.#open.size >= MAX_STREAMS) refusal = 429;
    if (refusal) {
      void reader.cancel().catch(() => undefined);
      return new Response(null, { status: refusal });
    }
    const session = new AbortController();
    this.#open.add(session);
    const disconnect = () => {
      session.abort();
    };
    request.signal.addEventListener("abort", disconnect, { once: true });
    const cancelExpiry = this.#clock.schedule(
      expiresAt - this.#clock.now(),
      disconnect,
    );
    session.signal.addEventListener(
      "abort",
      () => {
        cancelExpiry();
        request.signal.removeEventListener("abort", disconnect);
        this.#open.delete(session);
        void reader.cancel().catch(() => undefined);
      },
      { once: true },
    );

    let cancelled = false;
    const body = new ReadableStream<Uint8Array>(
      {
        start(output) {
          session.signal.addEventListener(
            "abort",
            () => {
              if (!cancelled) output.close();
            },
            { once: true },
          );
          void forwardFrames(reader, output, session, authorized)
            .finally(disconnect)
            .catch(disconnect);
        },
        cancel() {
          cancelled = true;
          disconnect();
        },
      },
      { highWaterMark: BUFFERED_FRAMES },
    );
    return new Response(body, {
      headers: response.headers,
      status: response.status,
    });
  }
}

/** Keep draining the SDK while a token check is in flight, with a bounded queue on both sides. */
async function forwardFrames(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  output: ReadableStreamDefaultController<Uint8Array>,
  session: AbortController,
  authorized: () => Promise<boolean>,
): Promise<void> {
  let pending = 0;
  let writes = Promise.resolve();
  while (!session.signal.aborted) {
    const frame = await reader.read();
    if (frame.done) break;
    if (++pending > BUFFERED_FRAMES || (output.desiredSize ?? 0) <= 0) {
      session.abort();
      break;
    }
    const chunk = frame.value;
    writes = writes
      .then(async () => {
        session.signal.throwIfAborted();
        if (!(await authorized())) {
          session.abort();
          return;
        }
        session.signal.throwIfAborted();
        if ((output.desiredSize ?? 0) <= 0) {
          session.abort();
          return;
        }
        output.enqueue(chunk);
      })
      .catch(() => {
        session.abort();
      })
      .finally(() => {
        pending--;
      });
  }
  await writes;
}
