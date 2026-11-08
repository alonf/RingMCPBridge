// The MCP Endpoint (T024) as agents reach it: the SDK client in both protocol eras over HTTP, a real
// Inquiry over the 100-device home in SQLite State, and a token checker standing in for the Issuer.
// The real Issuer's tokens reach the endpoint in bridge/test/issuer/. Also mode A's stdio, and the
// completeness check: every iteration 001 tool answers in both eras, and every iteration 001 error
// code that contracts/errors.md lists is seen by a test.
import { readFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import {
  Client,
  InsufficientScopeError,
  SdkHttpError,
} from "@modelcontextprotocol/client";
import type { CallToolResult } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { errorEnvelope, TOOL_CATALOG } from "../../src/contract/index.ts";
import type { ErrorCode } from "../../src/contract/index.ts";
import {
  McpEndpoint,
  TOKEN_CHECK_TIMEOUT_MS,
  TOOL_DEADLINE_MS,
  UNAVAILABLE_RETRY_AFTER_S,
} from "../../src/core/clients/mcp-endpoint/index.ts";
import type {
  InquiryReads,
  TokenCheck,
} from "../../src/core/clients/mcp-endpoint/index.ts";
import {
  estimateTokens,
  TOKEN_BUDGET,
} from "../../src/core/engines/summary/index.ts";
import { InquiryError } from "../../src/core/managers/inquiry/index.ts";
import { FakeClock } from "../../src/utilities/clock/index.ts";
import { Logger } from "../../src/utilities/logging/index.ts";
import { HEBREW_DEVICE_ID, HEBREW_DEVICE_NAME } from "../scenarios/index.ts";
import { connectOverHttp, eraOptions } from "../support/index.ts";
import type { ConnectedClient, ProtocolEra } from "../support/index.ts";
import { HOME_AS_OF, startCoreReads } from "./core-fixture.ts";
import type { CoreReads } from "./core-fixture.ts";

const ERAS: readonly ProtocolEra[] = ["legacy", "modern"];
const ISSUER = "https://core.example.test/oauth";
const AGENT = "agent-1";
const ERRORS_CONTRACT = fileURLToPath(
  new URL(
    "../../../specs/001-ring-mcp-bridge/contracts/errors.md",
    import.meta.url,
  ),
);
const PUBLISHED = fileURLToPath(new URL("../../../schemas/", import.meta.url));

/** What the tests saw: each tool answering in each era, and each error code. */
const seenTools = new Set<string>();
const seenCodes = new Set<ErrorCode>();

function hourFromNow(): number {
  return Math.floor(Date.now() / 1000) + 3600;
}

/** The clock the token checker moves for a check that never answers. */
let tokenClock: FakeClock | undefined;

/** The token checker standing in for the Issuer: what each token value means. */
function tokenCheck(token: string): Promise<TokenCheck> {
  switch (token) {
    case "issuer-slow":
      void tokenClock?.advance(TOKEN_CHECK_TIMEOUT_MS);
      return new Promise<never>(() => undefined);
    case "good":
      return Promise.resolve({
        kind: "valid",
        clientId: AGENT,
        subject: "owner-sub",
        scopes: ["read"],
        expiresAt: hourFromNow(),
      });
    case "no-read":
      return Promise.resolve({
        kind: "valid",
        clientId: AGENT,
        subject: "owner-sub",
        scopes: ["openid"],
        expiresAt: hourFromNow(),
      });
    case "issuer-down":
      return Promise.resolve({ kind: "unavailable" });
    case "issuer-broken":
      return Promise.reject(new Error("token-check-secret-detail"));
    default:
      return Promise.resolve({ kind: "invalid" });
  }
}

interface Harness {
  readonly url: URL;
  readonly endpoint: McpEndpoint;
  readonly clock: FakeClock;
  readonly lines: string[];
  /** Makes every Inquiry read do this instead, until `restore`. */
  answerWith(read: () => Promise<never>): void;
  /** Adds a field the contract does not declare to every Inquiry reply, until `restore`. */
  addUndeclaredField(): void;
  restore(): void;
  close(): Promise<void>;
}

async function startEndpoint(): Promise<Harness> {
  const clock = new FakeClock(HOME_AS_OF + 30_000);
  tokenClock = clock;
  const lines: string[] = [];
  const core: CoreReads = await startCoreReads(clock);
  let instead: (() => Promise<never>) | undefined;
  let undeclared = false;
  const decorate = async <Reply extends object>(
    reply: Promise<Reply>,
  ): Promise<Reply> =>
    undeclared ? { ...(await reply), undeclared_field: "extra" } : reply;
  const inquiry: InquiryReads = {
    getOverview: (request, signal) =>
      instead?.() ?? decorate(core.inquiry.getOverview(request, signal)),
    listDevices: (request, signal) =>
      instead?.() ?? decorate(core.inquiry.listDevices(request, signal)),
    getDevice: (request, signal) =>
      instead?.() ?? decorate(core.inquiry.getDevice(request, signal)),
    getHealth: (signal) =>
      instead?.() ?? decorate(core.inquiry.getHealth(signal)),
  };
  // The endpoint needs its own URL, so it is built once the server listens, before any request.
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
  const endpoint = new McpEndpoint(
    { resource: url.href, issuer: ISSUER, allowedHosts: ["127.0.0.1"] },
    {
      inquiry,
      tokens: { checkAccessToken: tokenCheck },
      clock,
      logger: new Logger({
        sink: (line) => lines.push(line),
        now: () => clock.now(),
        minLevel: "debug",
      }),
    },
  );
  routes.endpoint = endpoint;
  return {
    url,
    endpoint,
    clock,
    lines,
    answerWith: (read) => {
      instead = read;
    },
    addUndeclaredField: () => {
      undeclared = true;
    },
    restore: () => {
      instead = undefined;
      undeclared = false;
    },
    close: async () => {
      await new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      });
      await core.close();
    },
  };
}

function argumentsFor(tool: string): Record<string, unknown> {
  return tool === "get_device" ? { device_id: HEBREW_DEVICE_ID } : {};
}

function textOf(result: CallToolResult): string {
  const [first] = result.content;
  return first?.type === "text" ? first.text : "";
}

/** The error envelope a failed call carries, after checking it against the contract. */
function failureOf(result: CallToolResult, code: ErrorCode) {
  expect(result.isError).toBe(true);
  const envelope = errorEnvelope.parse(result.structuredContent);
  expect(envelope.error.code).toBe(code);
  expect(textOf(result)).toBe(envelope.error.message);
  seenCodes.add(envelope.error.code);
  return envelope.error;
}

function published(document: string): Readonly<Record<string, unknown>> {
  const parsed = JSON.parse(
    readFileSync(`${PUBLISHED}${document}`, "utf8"),
  ) as { readonly $defs: Readonly<Record<string, unknown>> };
  return parsed.$defs;
}

function withoutDialect(schema: unknown): unknown {
  if (typeof schema !== "object" || schema === null) {
    return schema;
  }
  return Object.fromEntries(
    Object.entries(schema).filter(([key]) => key !== "$schema"),
  );
}

describe.each(ERAS)("the MCP endpoint in the %s era", (era) => {
  let harness: Harness;
  let agent: ConnectedClient;

  beforeAll(async () => {
    harness = await startEndpoint();
    agent = await connectOverHttp(harness.url, { accessToken: "good", era });
    expect(agent.client.getProtocolEra()).toBe(era);
  });

  afterAll(async () => {
    await agent.close();
    await harness.close();
  });

  function call(tool: string, args: Record<string, unknown>) {
    return agent.client.callTool({ name: tool, arguments: args });
  }

  it("lists the four read tools, read-only, with the inputs and replies the contract publishes", async () => {
    const { tools } = await agent.client.listTools();
    const inputs = published("tool-inputs.schema.json");
    const replies = published("tool-replies.schema.json");

    expect(tools.map((tool) => tool.name)).toEqual(
      TOOL_CATALOG.map((tool) => tool.name),
    );
    for (const tool of tools) {
      expect(withoutDialect(tool.inputSchema)).toEqual(inputs[tool.name]);
      expect(withoutDialect(tool.outputSchema)).toEqual(replies[tool.name]);
      expect(tool.annotations?.readOnlyHint).toBe(true);
    }
  });

  it.each(TOOL_CATALOG.map((tool) => [tool.name, tool] as const))(
    "answers %s with a reply its contract accepts, and a line of text without Ring's",
    async (name, tool) => {
      const result = await call(name, argumentsFor(name));

      expect(result.isError).toBeFalsy();
      const reply = tool.reply.parse(result.structuredContent) as {
        readonly as_of: string;
        readonly freshness: string;
      };
      expect(reply).toMatchObject({
        as_of: new Date(HOME_AS_OF).toISOString(),
        freshness: "cached",
      });
      expect(textOf(result)).toContain(reply.as_of);
      expect(textOf(result)).not.toContain(HEBREW_DEVICE_NAME);
      seenTools.add(`${era}:${name}`);
    },
  );

  it("keeps the 100-device home's overview and device list within 8,000 tokens, as agents receive them", async () => {
    const overview = await call("get_overview", {});
    const list = await call("list_devices", {});

    // The whole result: the structured reply, its line of text, and the era's own metadata.
    expect(estimateTokens(overview)).toBeLessThanOrEqual(TOKEN_BUDGET);
    expect(estimateTokens(list)).toBeLessThanOrEqual(TOKEN_BUDGET);
    expect(list.structuredContent).toMatchObject({ data: { count: 100 } });
  });

  it("leaves out a reply field the contract does not declare, which the agent's client would refuse", async () => {
    harness.addUndeclaredField();
    try {
      const result = await call("get_health", {});

      expect(result.isError).toBeFalsy();
      expect(result.structuredContent).not.toHaveProperty("undeclared_field");
    } finally {
      harness.restore();
    }
  });

  it("answers an input the contract does not allow with INVALID_ARGUMENT, naming the field", async () => {
    const unknownField = failureOf(
      await call("list_devices", { colour: "red" }),
      "INVALID_ARGUMENT",
    );
    const missing = failureOf(await call("get_device", {}), "INVALID_ARGUMENT");
    const wrongType = failureOf(
      await call("list_devices", { type: "toaster" }),
      "INVALID_ARGUMENT",
    );

    expect(unknownField).toMatchObject({ retryable: false });
    expect(unknownField.message).toContain("colour");
    expect(missing.message).toContain("device_id");
    expect(wrongType.message).toContain("type");
    expect(wrongType.message).not.toContain("toaster");
  });

  it("answers INVALID_ARGUMENT with the owned locations' ids when no location is named among several", async () => {
    harness.answerWith(() =>
      Promise.reject(
        new InquiryError(
          "invalid_argument",
          "Name the location: the bridge holds more than one.",
          { details: { location_ids: ["location-1", "location-2"] } },
        ),
      ),
    );
    try {
      const failure = failureOf(
        await call("get_overview", {}),
        "INVALID_ARGUMENT",
      );
      expect(failure.details).toEqual({
        location_ids: ["location-1", "location-2"],
      });
    } finally {
      harness.restore();
    }
  });

  it("answers NOT_FOUND for a device the bridge does not hold", async () => {
    const failure = failureOf(
      await call("get_device", { device_id: "no-such-device" }),
      "NOT_FOUND",
    );

    expect(failure.retryable).toBe(false);
  });

  it("answers BRIDGE_UNAVAILABLE, to try again in 30 s, while the store is down", async () => {
    harness.answerWith(() =>
      Promise.reject(
        new InquiryError("unavailable", "The home could not be read."),
      ),
    );
    try {
      const failure = failureOf(
        await call("get_health", {}),
        "BRIDGE_UNAVAILABLE",
      );
      expect(failure).toMatchObject({
        retryable: true,
        retry_after_s: UNAVAILABLE_RETRY_AFTER_S,
      });
    } finally {
      harness.restore();
    }
  });

  it("answers INTERNAL for a failure it did not expect, logging it and showing none of it", async () => {
    harness.answerWith(() =>
      Promise.reject(new Error("internal-secret-detail")),
    );
    try {
      const result = await call("list_devices", {});
      const failure = failureOf(result, "INTERNAL");
      expect(JSON.stringify(result)).not.toContain("internal-secret-detail");
      expect(failure.retryable).toBe(false);
      expect(harness.lines.join("\n")).toContain("mcp_tool_failed");
    } finally {
      harness.restore();
    }
  });

  it("answers TIMEOUT after 60 s, even for a read that never looks at its signal", async () => {
    harness.answerWith(() => {
      void harness.clock.advance(TOOL_DEADLINE_MS);
      return new Promise<never>(() => undefined);
    });
    try {
      const failure = failureOf(await call("get_overview", {}), "TIMEOUT");
      expect(failure.retryable).toBe(true);
    } finally {
      harness.restore();
    }
  });

  it("logs each call with its tool, outcome and agent, and never the token", async () => {
    await call("get_health", {});

    const line = harness.lines.findLast((entry) =>
      entry.includes("mcp_tool_called"),
    );
    expect(line).toContain('"tool":"get_health"');
    expect(line).toContain('"outcome":"ok"');
    expect(line).toContain(`"client_id":"${AGENT}"`);
    expect(harness.lines.join("\n")).not.toContain("good");
  });
});

describe("the MCP endpoint's door: tokens, metadata and hosts", () => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await startEndpoint();
  });

  afterAll(async () => {
    await harness.close();
  });

  function post(
    token: string | undefined,
    headers: Readonly<Record<string, string>> = {},
  ): Promise<Response> {
    return fetch(harness.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
        ...headers,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {},
      }),
    });
  }

  it.each([
    ["no token", undefined],
    ["an unknown token", "not-a-token"],
  ])(
    "refuses %s with 401, naming where to find how to link",
    async (_label, token) => {
      const response = await post(token);

      expect(response.status).toBe(401);
      const challenge = response.headers.get("www-authenticate") ?? "";
      expect(challenge).toContain('error="invalid_token"');
      expect(challenge).toContain(
        `resource_metadata="${harness.endpoint.metadataUrl}"`,
      );
    },
  );

  it("refuses a token without the read scope with 403", async () => {
    const response = await post("no-read");

    expect(response.status).toBe(403);
    expect(response.headers.get("www-authenticate")).toContain(
      'error="insufficient_scope"',
    );
  });

  it("answers 503 with Retry-After while the Issuer cannot check tokens, so the agent keeps its token", async () => {
    const response = await post("issuer-down");

    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("30");
    expect(response.headers.get("www-authenticate")).toBeNull();
  });

  it("answers 503 when the Issuer takes longer than 5 s to check a token, never 500", async () => {
    const response = await post("issuer-slow");

    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("30");
  });

  it("answers 500 when a token check fails unexpectedly, logging it without the detail reaching the agent", async () => {
    const response = await post("issuer-broken");

    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("token-check-secret-detail");
    expect(harness.lines.join("\n")).toContain("mcp_token_check_failed");
  });

  it.each(ERAS)(
    "tells an SDK client in the %s era that it must link first, or lacks the read scope",
    async (era) => {
      const unlinked = connectOverHttp(harness.url, { era });
      const unscoped = connectOverHttp(harness.url, {
        accessToken: "no-read",
        era,
      });

      await expect(unlinked).rejects.toBeInstanceOf(SdkHttpError);
      await expect(unlinked).rejects.toMatchObject({ status: 401 });
      await expect(unscoped).rejects.toBeInstanceOf(InsufficientScopeError);
    },
  );

  it("serves the protected-resource metadata: the endpoint, its Issuer and the read scope", async () => {
    expect(harness.endpoint.metadataUrl).toBe(
      `${harness.url.origin}/.well-known/oauth-protected-resource/mcp`,
    );
    const response = await fetch(harness.endpoint.metadataUrl);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      resource: harness.url.href,
      authorization_servers: [ISSUER],
      scopes_supported: ["read"],
      bearer_methods_supported: ["header"],
      resource_name: "Ring MCP Bridge",
    });
  });

  it("refuses a Host it does not answer to, and a request from a web page", async () => {
    const foreignHost = await new Promise<number>((resolve, reject) => {
      const request = httpRequest(
        harness.url,
        {
          method: "POST",
          headers: {
            host: "bridge.attacker.example.test",
            authorization: "Bearer good",
            "content-type": "application/json",
          },
        },
        (response) => {
          response.resume();
          resolve(response.statusCode ?? 0);
        },
      );
      request.on("error", reject);
      request.end("{}");
    });
    const fromPage = await post("good", {
      origin: "https://page.example.test",
    });

    expect(foreignHost).toBe(403);
    expect(fromPage.status).toBe(403);
  });

  it("answers 404 for a path that is neither the endpoint nor its metadata", async () => {
    const response = await fetch(new URL("/elsewhere", harness.url));

    expect(response.status).toBe(404);
  });
});

describe("the MCP endpoint over stdio, in mode A", () => {
  const fixture = fileURLToPath(new URL("./stdio-fixture.ts", import.meta.url));

  it.each(ERAS)(
    "serves the tools to the process that started it in the %s era, with the log on stderr",
    async (era) => {
      const transport = new StdioClientTransport({
        command: process.execPath,
        args: [fixture],
        stderr: "pipe",
      });
      const logged: string[] = [];
      transport.stderr?.on("data", (chunk: Buffer) => {
        logged.push(chunk.toString("utf8"));
      });
      const client = new Client(
        { name: "bridge-tests", version: "0.0.0" },
        eraOptions(era),
      );
      await client.connect(transport);
      try {
        expect(client.getProtocolEra()).toBe(era);
        const result = await client.callTool({
          name: "get_health",
          arguments: {},
        });

        expect(result.isError).toBeFalsy();
        expect(result.structuredContent).toMatchObject({
          data: { home_link: { status: "up" } },
        });
        expect(logged.join("")).toContain("mcp_tool_called");
      } finally {
        await client.close();
      }
    },
    30_000,
  );
});

// The codes errors.md lists for the iteration 001 tools, plus the two every tool can return.
function iteration001Codes(): {
  readonly tools: readonly string[];
  readonly codes: ReadonlySet<string>;
} {
  const lines = readFileSync(ERRORS_CONTRACT, "utf8").split("\n");
  const header = lines.find((line) => line.startsWith("| Tool |")) ?? "";
  const columns = header.split("|").map((cell) => cell.trim());
  const tools: string[] = [];
  const codes = new Set<string>(["INTERNAL", "BRIDGE_UNAVAILABLE"]);
  for (const line of lines) {
    const cells = line.split("|").map((cell) => cell.trim());
    const name = /^`([a-z_]+)` \(001\)$/.exec(cells[1] ?? "")?.[1];
    if (name === undefined) {
      continue;
    }
    tools.push(name);
    cells.forEach((cell, index) => {
      if (cell === "x") {
        codes.add(columns[index] ?? "");
      }
    });
  }
  return { tools, codes };
}

/** Codes whose test comes with a later task: none may be seen yet, and each must be listed. */
const PENDING_CODES: ReadonlyMap<string, string> = new Map([
  ["RATE_LIMITED", "T025"],
]);

describe("the MCP endpoint's completeness check (T024)", () => {
  it("sees every iteration 001 tool answer in both eras, and every iteration 001 error code errors.md lists", () => {
    const contract = iteration001Codes();

    expect(contract.tools).toEqual(TOOL_CATALOG.map((tool) => tool.name));
    expect([...seenTools].sort()).toEqual(
      ERAS.flatMap((era) =>
        contract.tools.map((tool) => `${era}:${tool}`),
      ).sort(),
    );
    for (const code of PENDING_CODES.keys()) {
      expect(seenCodes.has(code as ErrorCode)).toBe(false);
    }
    expect(new Set([...seenCodes, ...PENDING_CODES.keys()])).toEqual(
      contract.codes,
    );
  });
});
