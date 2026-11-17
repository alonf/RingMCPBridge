// The MCP Events probe (T039) as an agent reaches it, through the SDK client in both protocol eras:
// the `events` capability is declared only when the probe is wired in (spike S4), a test
// subscription is checked, verified at its callback and answered, one signed test event follows,
// and the log carries the subscription's shape and never its secret or its callback's path.
import { createHmac } from "node:crypto";
import type { AddressInfo } from "node:net";
import { serve } from "@hono/node-server";
import { ProtocolError } from "@modelcontextprotocol/client";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  CALLBACK_ENDPOINT_ERROR,
  CALLBACK_TIMEOUT_MS,
  EventsProbe,
  McpEndpoint,
  PROBE_EVENT_DELAY_MS,
  PROBE_EVENT_NAME,
  PROBE_SUBSCRIPTION_TTL_MS,
} from "../../src/core/clients/mcp-endpoint/index.ts";
import type {
  CallbackFetch,
  InquiryReads,
} from "../../src/core/clients/mcp-endpoint/index.ts";
import { FakeClock } from "../../src/utilities/clock/index.ts";
import { Logger } from "../../src/utilities/logging/index.ts";
import { connectOverHttp } from "../support/index.ts";
import type { ConnectedClient, ProtocolEra } from "../support/index.ts";

const ERAS: readonly ProtocolEra[] = ["legacy", "modern"];
const START = Date.UTC(2026, 10, 17, 9, 0, 0);
const KEY = Buffer.alloc(32, 7);
const SECRET = `whsec_${KEY.toString("base64")}`;
const CALLBACK_HOST = "callbacks.example.test";
const CALLBACK = `https://${CALLBACK_HOST}/hooks/private-path-1`;
const HTTP_OK = 200;
const HTTP_GONE = 410;
const ANY = z.looseObject({});

function notCalled(): Promise<never> {
  return Promise.reject(new Error("The probe's tests make no read."));
}

const NO_READS: InquiryReads = {
  getOverview: notCalled,
  listDevices: notCalled,
  getDevice: notCalled,
  getHealth: notCalled,
};

/** One request the probe sent to the callback. */
interface Sent {
  readonly url: string;
  readonly headers: Headers;
  readonly body: string;
  readonly redirect: RequestInit["redirect"];
  readonly signal: AbortSignal | null | undefined;
}

type Answer = (sent: Sent) => Response | Promise<Response>;

/** The callback as ChatGPT serves it: echoes a verification's challenge, accepts an event. */
function echo(sent: Sent): Response {
  const body = JSON.parse(sent.body) as { type?: string; challenge?: string };
  return body.type === "verification"
    ? Response.json({ challenge: body.challenge })
    : new Response(null, { status: HTTP_OK });
}

interface Harness {
  readonly url: URL;
  readonly clock: FakeClock;
  readonly lines: string[];
  readonly sent: Sent[];
  readonly probe: EventsProbe | undefined;
  answer: Answer;
  connect(era: ProtocolEra): Promise<ConnectedClient>;
}

const cleanups: (() => Promise<void>)[] = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    await cleanup();
  }
});

async function start(withProbe = true): Promise<Harness> {
  const clock = new FakeClock(START);
  const lines: string[] = [];
  const sent: Sent[] = [];
  const logger = new Logger({
    sink: (line) => lines.push(line),
    now: () => clock.now(),
    minLevel: "debug",
  });
  const harness: Partial<Harness> & { answer: Answer } = { answer: echo };
  const fetch: CallbackFetch = async (url, init) => {
    const call: Sent = {
      url,
      headers: new Headers(init.headers),
      body: typeof init.body === "string" ? init.body : "",
      redirect: init.redirect,
      signal: init.signal,
    };
    sent.push(call);
    return harness.answer(call);
  };
  const probe = withProbe
    ? new EventsProbe({ fetch, clock, logger })
    : undefined;
  const routes: { endpoint?: McpEndpoint } = {};
  const server = serve({
    fetch: (request) =>
      routes.endpoint === undefined
        ? new Response("starting", { status: 503 })
        : routes.endpoint.fetch(request),
    port: 0,
    hostname: "127.0.0.1",
  });
  await new Promise<void>((resolve) => {
    server.once("listening", resolve);
  });
  const url = new URL(
    `http://127.0.0.1:${String((server.address() as AddressInfo).port)}/mcp`,
  );
  routes.endpoint = new McpEndpoint(
    {
      resource: url.href,
      issuer: "https://core.example.test/oauth",
      allowedHosts: ["127.0.0.1"],
      readsPerHour: 600,
    },
    {
      inquiry: NO_READS,
      tokens: {
        checkAccessToken: () =>
          Promise.resolve({
            kind: "valid",
            clientId: "agent-1",
            subject: "owner-sub",
            scopes: ["read"],
            expiresAt: Math.floor(Date.now() / 1000) + 3600,
          }),
      },
      clock,
      logger,
      ...(probe === undefined ? {} : { eventsProbe: probe }),
    },
  );
  cleanups.push(async () => {
    probe?.stop();
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  });
  return Object.assign(harness, {
    url,
    clock,
    lines,
    sent,
    probe,
    connect: async (era: ProtocolEra) => {
      const connected = await connectOverHttp(url, {
        accessToken: "good",
        era,
      });
      cleanups.push(() => connected.close());
      return connected;
    },
  });
}

function subscription(changes: Record<string, unknown> = {}): {
  method: string;
  params: Record<string, unknown>;
} {
  return {
    method: "events/subscribe",
    params: {
      name: PROBE_EVENT_NAME,
      arguments: {},
      delivery: { mode: "webhook", url: CALLBACK, secret: SECRET },
      cursor: null,
      ...changes,
    },
  };
}

function expectedSignature(sent: Sent): string {
  const signed = `${sent.headers.get("webhook-id") ?? ""}.${
    sent.headers.get("webhook-timestamp") ?? ""
  }.${sent.body}`;
  return `v1,${createHmac("sha256", KEY).update(signed).digest("base64")}`;
}

function logged(
  lines: readonly string[],
  event: string,
): Record<string, unknown>[] {
  return lines
    .map((line) => JSON.parse(line) as Record<string, unknown>)
    .filter((line) => line.event === event);
}

async function refusal(request: Promise<unknown>): Promise<ProtocolError> {
  const error: unknown = await request.then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  if (!(error instanceof ProtocolError)) {
    throw new Error("The request was not refused with a protocol error.");
  }
  return error;
}

const MODERN_META = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientCapabilities": {},
  "io.modelcontextprotocol/clientInfo": { name: "probe-test", version: "0" },
};

/** One JSON-RPC answer as the wire carries it. */
interface WireAnswer {
  readonly result?: Record<string, unknown>;
  readonly error?: { readonly code: number };
}

/** What the wire carries for one request. The SDK client drops capabilities it does not know. */
async function onTheWire(
  url: URL,
  era: ProtocolEra,
  method: string,
): Promise<WireAnswer> {
  const legacy = era === "legacy";
  const initialize = {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: MODERN_META["io.modelcontextprotocol/clientInfo"],
  };
  const params =
    legacy && method === "initialize" ? initialize : { ["_meta"]: MODERN_META };
  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: "Bearer good",
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(legacy
        ? {}
        : { "mcp-protocol-version": "2026-07-28", "mcp-method": method }),
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      ...(legacy && method !== "initialize" ? {} : { params }),
    }),
  });
  const text = await response.text();
  const json = text.startsWith("{")
    ? text
    : (/^data: (.*)$/m.exec(text)?.[1] ?? "{}");
  return JSON.parse(json) as WireAnswer;
}

/** The request that returns the server's capabilities in each era. */
const CAPABILITIES_METHOD: Record<ProtocolEra, string> = {
  legacy: "initialize",
  modern: "server/discover",
};
const METHOD_NOT_FOUND = -32601;

describe("the MCP Events probe", () => {
  // Spike S4: the SDK server passes the `events` capability through in both eras.
  it.each(ERAS)(
    "declares the events capability and lists its one event type (%s era)",
    async (era) => {
      const harness = await start();
      const { client } = await harness.connect(era);

      const declared = await onTheWire(
        harness.url,
        era,
        CAPABILITIES_METHOD[era],
      );
      expect(declared.result?.capabilities).toMatchObject({ events: {} });
      const listed = await client.request({ method: "events/list" }, ANY);
      expect(listed).toMatchObject({
        events: [
          {
            name: PROBE_EVENT_NAME,
            delivery: ["webhook"],
            inputSchema: { type: "object" },
            payloadSchema: { type: "object" },
          },
        ],
      });
    },
  );

  it.each(ERAS)(
    "declares nothing and serves no events method without the probe (%s era)",
    async (era) => {
      const harness = await start(false);

      const declared = await onTheWire(
        harness.url,
        era,
        CAPABILITIES_METHOD[era],
      );
      expect(declared.result?.capabilities).toBeDefined();
      expect(declared.result?.capabilities).not.toHaveProperty("events");
      const listed = await onTheWire(harness.url, era, "events/list");
      expect(listed.error?.code).toBe(METHOD_NOT_FOUND);
    },
  );

  it.each(ERAS)(
    "verifies the callback, accepts the subscription, then sends one signed test event (%s era)",
    async (era) => {
      const harness = await start();
      const { client } = await harness.connect(era);

      const accepted = await client.request(subscription(), ANY);

      expect(accepted).toMatchObject({
        id: expect.any(String) as string,
        refreshBefore: new Date(
          START + PROBE_SUBSCRIPTION_TTL_MS,
        ).toISOString(),
        cursor: null,
        truncated: false,
      });
      const [verification] = harness.sent;
      expect(harness.sent).toHaveLength(1);
      expect(verification?.url).toBe(CALLBACK);
      expect(verification?.redirect).toBe("manual");
      expect(JSON.parse(verification?.body ?? "{}")).toMatchObject({
        type: "verification",
        challenge: expect.any(String) as string,
      });
      expect(verification?.headers.get("x-mcp-subscription-id")).toBe(
        accepted.id,
      );
      expect(verification?.headers.get("webhook-timestamp")).toBe(
        String(START / 1000),
      );
      expect(verification?.headers.get("webhook-signature")).toBe(
        verification === undefined ? "" : expectedSignature(verification),
      );

      await harness.clock.advance(PROBE_EVENT_DELAY_MS);
      await expect.poll(() => harness.sent.length).toBe(2);
      const event = harness.sent[1];
      const body = JSON.parse(event?.body ?? "{}") as Record<string, unknown>;
      expect(body).toMatchObject({
        eventId: expect.any(String) as string,
        name: PROBE_EVENT_NAME,
        timestamp: new Date(START + PROBE_EVENT_DELAY_MS).toISOString(),
        data: { message: expect.any(String) as string },
        cursor: null,
      });
      expect(event?.headers.get("webhook-id")).toBe(body.eventId);
      expect(event?.headers.get("webhook-signature")).toBe(
        event === undefined ? "" : expectedSignature(event),
      );
      await expect
        .poll(() => logged(harness.lines, "mcp_events_probe_delivered"))
        .toEqual([
          expect.objectContaining({ http_status: HTTP_OK, outcome: "ok" }),
        ]);
    },
  );

  it("logs the subscription's shape and neither its secret nor its callback's path", async () => {
    const harness = await start();
    const { client } = await harness.connect("legacy");

    await client.request(
      subscription({ arguments: { room: "Front Door" } }),
      ANY,
    );

    expect(logged(harness.lines, "mcp_events_probe_subscribe")).toEqual([
      expect.objectContaining({
        component: "mcp_events_probe",
        client_id: "agent-1",
        event_name: PROBE_EVENT_NAME,
        kind: "webhook",
        host: CALLBACK_HOST,
        count: 1,
        outcome: "accepted",
      }),
    ]);
    expect(logged(harness.lines, "mcp_events_probe_verified")).toEqual([
      expect.objectContaining({ http_status: HTTP_OK, outcome: "ok" }),
    ]);
    const written = harness.lines.join("\n");
    expect(written).not.toContain(SECRET);
    expect(written).not.toContain(KEY.toString("base64"));
    expect(written).not.toContain("private-path-1");
    expect(written).not.toContain("Front Door");
  });

  it.each([
    ["a secret in another form", { secret: "plain-secret" }, "bad_secret"],
    [
      "a secret too short",
      { secret: `whsec_${Buffer.alloc(8).toString("base64")}` },
      "bad_secret",
    ],
    [
      "a callback without TLS",
      { url: "http://x.example.test/h" },
      "bad_callback",
    ],
    ["a callback at an address", { url: "https://10.0.0.4/h" }, "bad_callback"],
    [
      "a callback at this machine",
      { url: "https://localhost/h" },
      "bad_callback",
    ],
    [
      "a callback carrying a password",
      { url: "https://u:p@x.example.test/h" },
      "bad_callback",
    ],
    ["a callback that is no URL", { url: "not a url" }, "bad_callback"],
    ["another delivery mode", { mode: "poll" }, "unsupported_mode"],
  ])("refuses %s, and calls nothing", async (_title, change, outcome) => {
    const harness = await start();
    const { client } = await harness.connect("legacy");

    await refusal(
      client.request(
        subscription({
          delivery: {
            mode: "webhook",
            url: CALLBACK,
            secret: SECRET,
            ...change,
          },
        }),
        ANY,
      ),
    );

    expect(harness.sent).toHaveLength(0);
    expect(logged(harness.lines, "mcp_events_probe_subscribe")).toEqual([
      expect.objectContaining({ outcome }),
    ]);
  });

  it("refuses an event type it does not offer, and a subscription with no delivery", async () => {
    const harness = await start();
    const { client } = await harness.connect("legacy");

    await refusal(client.request(subscription({ name: "doorbell" }), ANY));
    await refusal(
      client.request(
        { method: "events/subscribe", params: { name: PROBE_EVENT_NAME } },
        ANY,
      ),
    );

    expect(harness.sent).toHaveLength(0);
  });

  it.each([
    [
      "answers with another challenge",
      (): Response => Response.json({ challenge: "another" }),
      "challenge_failed",
    ],
    [
      "refuses",
      (): Response => new Response(null, { status: HTTP_GONE }),
      "challenge_failed",
    ],
    [
      "answers with no JSON",
      (): Response => new Response("ok"),
      "challenge_failed",
    ],
    [
      "cannot be reached",
      (): Promise<Response> => Promise.reject(new Error("connect failed")),
      "unreachable",
    ],
  ])(
    "answers the callback error when the callback %s, and sends no event",
    async (_title, answer, reason) => {
      const harness = await start();
      harness.answer = answer;
      const { client } = await harness.connect("legacy");

      const error = await refusal(client.request(subscription(), ANY));

      expect(error.code).toBe(CALLBACK_ENDPOINT_ERROR);
      expect(error.data).toEqual({ reason });
      await harness.clock.advance(PROBE_EVENT_DELAY_MS);
      expect(harness.sent).toHaveLength(1);
    },
  );

  it("answers the callback error as a timeout when the callback takes too long", async () => {
    const harness = await start();
    // As `fetch` does: the call ends only when its signal aborts.
    harness.answer = (sent) =>
      new Promise<Response>((_resolve, reject) => {
        sent.signal?.addEventListener("abort", () => {
          reject(new Error("aborted"));
        });
      });
    const { client } = await harness.connect("legacy");

    const refused = refusal(client.request(subscription(), ANY));
    await expect.poll(() => harness.sent.length).toBe(1);
    await harness.clock.advance(CALLBACK_TIMEOUT_MS);

    const error = await refused;
    expect(error.code).toBe(CALLBACK_ENDPOINT_ERROR);
    expect(error.data).toEqual({ reason: "timeout" });
  });

  it("sends no event once the subscription is ended, and ends it again without complaint", async () => {
    const harness = await start();
    const { client } = await harness.connect("legacy");
    const accepted = await client.request(subscription(), ANY);
    const end = { method: "events/unsubscribe", params: { id: accepted.id } };

    await expect(client.request(end, ANY)).resolves.toBeDefined();
    await expect(client.request(end, ANY)).resolves.toBeDefined();

    await harness.clock.advance(PROBE_EVENT_DELAY_MS);
    expect(harness.sent).toHaveLength(1);
  });

  it("sends no event once the probe is stopped", async () => {
    const harness = await start();
    const { client } = await harness.connect("legacy");
    await client.request(subscription(), ANY);

    harness.probe?.stop();

    await harness.clock.advance(PROBE_EVENT_DELAY_MS);
    expect(harness.sent).toHaveLength(1);
  });
});
