// The MCP client helpers (T010) reach a small MCP server built here, in memory and over HTTP.
import type { AddressInfo } from "node:net";
import { serve } from "@hono/node-server";
import {
  McpServer,
  WebStandardStreamableHTTPServerTransport,
} from "@modelcontextprotocol/server";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { connectInMemory, connectOverHttp } from "./index.ts";
import type { ConnectedClient } from "./index.ts";

function echoServer(): McpServer {
  const server = new McpServer({ name: "echo", version: "0.0.0" });
  server.registerTool(
    "echo",
    {
      description: "Returns the text it is given.",
      inputSchema: z.object({ text: z.string() }),
    },
    ({ text }) => ({ content: [{ type: "text", text }] }),
  );
  return server;
}

describe("the MCP client helpers", () => {
  const open: ConnectedClient[] = [];
  const stops: (() => Promise<void>)[] = [];

  afterEach(async () => {
    for (const connected of open.splice(0)) {
      await connected.close();
    }
    for (const stop of stops.splice(0)) {
      await stop();
    }
  });

  it("connect a client in memory and call a tool", async () => {
    const connected = await connectInMemory(echoServer());
    open.push(connected);

    await expect(connected.client.listTools()).resolves.toMatchObject({
      tools: [{ name: "echo" }],
    });
    await expect(
      connected.client.callTool({ name: "echo", arguments: { text: "שלום" } }),
    ).resolves.toMatchObject({ content: [{ type: "text", text: "שלום" }] });
  });

  it("connect a client over HTTP and send the access token", async () => {
    const authorizations: (string | null)[] = [];
    const http = serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: async (request) => {
        authorizations.push(request.headers.get("authorization"));
        const transport = new WebStandardStreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
        });
        await echoServer().connect(transport);
        return transport.handleRequest(request);
      },
    });
    stops.push(
      () =>
        new Promise<void>((resolve) => {
          http.close(() => {
            resolve();
          });
        }),
    );
    await new Promise<void>((resolve) => {
      http.once("listening", resolve);
    });
    const { port } = http.address() as AddressInfo;

    const connected = await connectOverHttp(
      new URL(`http://127.0.0.1:${String(port)}/mcp`),
      { accessToken: "test-token" },
    );
    open.push(connected);

    await expect(
      connected.client.callTool({ name: "echo", arguments: { text: "hi" } }),
    ).resolves.toMatchObject({ content: [{ type: "text", text: "hi" }] });
    expect(authorizations.length).toBeGreaterThan(0);
    expect(authorizations.every((value) => value === "Bearer test-token")).toBe(
      true,
    );
  });
});
