// MCP Events on the endpoint (T048) as an agent reaches it: the `events` capability and the event
// type in both protocol eras, a subscription verified and answered, the refusals mapped to the
// guide's errors (-32015 for a callback that fails verification), a client without the read scope
// refused before any method runs, and nothing served without Delivery.
import type { AddressInfo } from "node:net";
import { serve } from "@hono/node-server";
import { ProtocolError } from "@modelcontextprotocol/client";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import type {
  CoreSecrets,
  SecretLookup,
} from "../../src/core/access/secrets/index.ts";
import {
  DELIVERY_KEY_NAME,
  DeliveryKeySource,
  SubscriptionsStore,
} from "../../src/core/access/subscriptions/index.ts";
import { Delivery } from "../../src/core/clients/delivery/index.ts";
import type {
  CallbackRequest,
  CallbackResponse,
} from "../../src/core/clients/delivery/index.ts";
import {
  CALLBACK_ENDPOINT_ERROR,
  McpEndpoint,
} from "../../src/core/clients/mcp-endpoint/index.ts";
import type {
  InquiryReads,
  TokenCheck,
} from "../../src/core/clients/mcp-endpoint/index.ts";
import { FakeClock } from "../../src/utilities/clock/index.ts";
import { Logger } from "../../src/utilities/logging/index.ts";
import {
  CORE_MIGRATIONS,
  openSqliteQueryLayer,
  runMigrations,
} from "../../src/utilities/query-layer/index.ts";
import {
  generateSealingKey,
  Secret,
} from "../../src/utilities/security/index.ts";
import { connectOverHttp } from "../support/index.ts";
import type { ConnectedClient, ProtocolEra } from "../support/index.ts";

const ERAS: readonly ProtocolEra[] = ["legacy", "modern"];
const START = Date.UTC(2026, 10, 18, 9, 0, 0);
const HOST = "connectors.api.openai.com";
const SECRET = `whsec_${Buffer.alloc(32, 7).toString("base64")}`;
const ANY = z.looseObject({});
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const INTERNAL_ERROR = -32603;
const HTTP_FORBIDDEN = 403;
const never = new AbortController().signal;

function notCalled(): Promise<never> {
  return Promise.reject(new Error("The events tests make no read."));
}

const NO_READS: InquiryReads = {
  getOverview: notCalled,
  listDevices: notCalled,
  getDevice: notCalled,
  getHealth: notCalled,
};

function hourFromNow(): number {
  return Math.floor(Date.now() / 1000) + 3600;
}

function tokenCheck(token: string): Promise<TokenCheck> {
  const scopes = token === "no-read" ? ["openid"] : ["read"];
  return Promise.resolve({
    kind: "valid",
    clientId: "https://chatgpt.example.test/client.json",
    subject: "owner-sub",
    scopes,
    expiresAt: hourFromNow(),
  });
}

class MemorySecrets implements CoreSecrets {
  readonly values = new Map<string, string>([
    [DELIVERY_KEY_NAME, Buffer.from(generateSealingKey()).toString("base64")],
  ]);

  read(name: string): Promise<SecretLookup> {
    const value = this.values.get(name);
    return Promise.resolve(
      value === undefined
        ? { kind: "missing" }
        : { kind: "found", value: new Secret(value) },
    );
  }

  write(name: string, value: Secret<string>): Promise<void> {
    this.values.set(name, value.reveal());
    return Promise.resolve();
  }
}

function echo(request: CallbackRequest): Promise<CallbackResponse> {
  const body = JSON.parse(request.body) as { challenge?: string };
  return Promise.resolve({
    status: 200,
    body: JSON.stringify({ challenge: body.challenge }),
  });
}

interface Harness {
  readonly url: URL;
  readonly sent: CallbackRequest[];
  answer: (request: CallbackRequest) => Promise<CallbackResponse>;
  connect(era: ProtocolEra): Promise<ConnectedClient>;
}

const cleanups: (() => Promise<void>)[] = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    await cleanup();
  }
});

async function start(
  options: { withEvents?: boolean; withKey?: boolean } = {},
): Promise<Harness> {
  const clock = new FakeClock(START);
  const layer = openSqliteQueryLayer(":memory:", { clock });
  await runMigrations(layer, CORE_MIGRATIONS, { clock }, never);
  const secrets = new MemorySecrets();
  if (options.withKey === false) {
    secrets.values.clear();
  }
  const logger = new Logger({
    sink: () => undefined,
    now: () => clock.now(),
    minLevel: "debug",
  });
  const sent: CallbackRequest[] = [];
  const harness: Partial<Harness> & {
    answer: Harness["answer"];
  } = { answer: echo };
  const delivery = new Delivery({
    subscriptions: new SubscriptionsStore({
      store: layer,
      key: new DeliveryKeySource({ secrets }),
      clock,
    }),
    transport: (request) => {
      sent.push(request);
      return harness.answer(request);
    },
    allowedHosts: [HOST],
    deviceLabel: () => Promise.resolve(undefined),
    pushedFrom: () => Promise.resolve(true),
    clientAllowed: () => Promise.resolve(true),
    clock,
    logger,
  });
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
      tokens: { checkAccessToken: tokenCheck },
      clock,
      logger,
      ...(options.withEvents === false ? {} : { events: delivery }),
    },
  );
  cleanups.push(async () => {
    await delivery.stop();
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
    await layer.close();
  });
  return Object.assign(harness, {
    url,
    sent,
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

function subscription(url = `https://${HOST}/hook`): {
  method: string;
  params: Record<string, unknown>;
} {
  return {
    method: "events/subscribe",
    params: {
      name: "ring.event",
      arguments: {},
      delivery: { mode: "webhook", url, secret: SECRET },
      cursor: null,
    },
  };
}

const MODERN_META = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientCapabilities": {},
  "io.modelcontextprotocol/clientInfo": { name: "events-test", version: "0" },
};

interface WireAnswer {
  readonly result?: Record<string, unknown>;
  readonly error?: { readonly code: number };
}

/** What the wire carries for one request. The SDK client drops capabilities it does not know. */
async function onTheWire(
  url: URL,
  era: ProtocolEra,
  method: string,
  token = "good",
): Promise<{ status: number; answer: WireAnswer }> {
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
      authorization: `Bearer ${token}`,
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
  return { status: response.status, answer: JSON.parse(json) as WireAnswer };
}

const CAPABILITIES_METHOD: Record<ProtocolEra, string> = {
  legacy: "initialize",
  modern: "server/discover",
};

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

describe("MCP Events on the endpoint", () => {
  it.each(ERAS)(
    "declares the events capability and lists ring.event, its Ring text marked untrusted (%s era)",
    async (era) => {
      const harness = await start();
      const { client } = await harness.connect(era);

      const declared = await onTheWire(
        harness.url,
        era,
        CAPABILITIES_METHOD[era],
      );
      expect(declared.answer.result?.capabilities).toMatchObject({
        events: {},
      });
      const listed = await client.request({ method: "events/list" }, ANY);
      expect(listed).toMatchObject({
        events: [
          {
            name: "ring.event",
            delivery: ["webhook"],
            payloadSchema: {
              properties: { summary: { "x-untrusted": true } },
            },
          },
        ],
      });
    },
  );

  it.each(ERAS)(
    "serves no events method and declares nothing without Delivery (%s era)",
    async (era) => {
      const harness = await start({ withEvents: false });

      const declared = await onTheWire(
        harness.url,
        era,
        CAPABILITIES_METHOD[era],
      );
      expect(declared.answer.result?.capabilities).not.toHaveProperty("events");
      const listed = await onTheWire(harness.url, era, "events/list");
      expect(listed.answer.error?.code).toBe(METHOD_NOT_FOUND);
    },
  );

  it.each(ERAS)(
    "verifies the callback and answers the subscription (%s era)",
    async (era) => {
      const harness = await start();
      const { client } = await harness.connect(era);

      const answer = await client.request(subscription(), ANY);

      expect(answer).toMatchObject({
        id: expect.any(String) as string,
        refreshBefore: expect.any(String) as string,
        cursor: null,
        truncated: false,
      });
      expect(harness.sent).toHaveLength(1);
      expect(JSON.parse(harness.sent[0]?.body ?? "{}")).toMatchObject({
        type: "verification",
      });
    },
  );

  it("answers -32015 with its reason for a callback that fails verification", async () => {
    const harness = await start();
    harness.answer = () => Promise.resolve({ status: 200, body: "{}" });
    const { client } = await harness.connect("legacy");

    const error = await refusal(client.request(subscription(), ANY));

    expect(error.code).toBe(CALLBACK_ENDPOINT_ERROR);
    expect(error.data).toEqual({ reason: "challenge_failed" });
  });

  it("refuses a callback outside the allowed hosts as invalid, sending nothing", async () => {
    const harness = await start();
    const { client } = await harness.connect("legacy");

    const error = await refusal(
      client.request(subscription("https://hooks.example.test/hook"), ANY),
    );

    expect(error.code).toBe(INVALID_PARAMS);
    expect(error.data).toEqual({ reason: "callback_not_allowed" });
    expect(harness.sent).toHaveLength(0);
  });

  it("refuses a subscription while the delivery key is not set, saying so", async () => {
    const harness = await start({ withKey: false });
    const { client } = await harness.connect("legacy");

    const error = await refusal(client.request(subscription(), ANY));

    expect(error.code).toBe(INTERNAL_ERROR);
    expect(error.data).toEqual({ reason: "not_set_up" });
  });

  it("refuses a client without the read scope before any method runs", async () => {
    const harness = await start();

    const { status } = await onTheWire(
      harness.url,
      "legacy",
      "events/list",
      "no-read",
    );

    expect(status).toBe(HTTP_FORBIDDEN);
    expect(harness.sent).toHaveLength(0);
  });

  it("ends a subscription, and ends it again without complaint", async () => {
    const harness = await start();
    const { client } = await harness.connect("legacy");
    const answer = await client.request(subscription(), ANY);
    const end = { method: "events/unsubscribe", params: { id: answer.id } };

    await expect(client.request(end, ANY)).resolves.toBeDefined();
    await expect(client.request(end, ANY)).resolves.toBeDefined();
  });
});
