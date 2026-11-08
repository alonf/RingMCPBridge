// Mode A's MCP endpoint over stdio, as a process of its own (T024): the test starts it with Node,
// which runs this TypeScript as it is, and talks to it through the SDK's stdio client. The log goes
// to stderr, since stdout carries the protocol.
import { McpEndpoint } from "../../src/core/clients/mcp-endpoint/index.ts";
import { FakeClock } from "../../src/utilities/clock/index.ts";
import { createStdoutSink, Logger } from "../../src/utilities/logging/index.ts";
import { HOME_AS_OF, startCoreReads } from "./core-fixture.ts";

const clock = new FakeClock(HOME_AS_OF + 30_000);
const logger = new Logger({
  sink: createStdoutSink(process.stderr),
  now: () => clock.now(),
  minLevel: "debug",
});
const core = await startCoreReads(clock);
const endpoint = new McpEndpoint(
  {
    resource: "http://localhost/mcp",
    issuer: "http://localhost/oauth",
    allowedHosts: ["localhost"],
  },
  {
    inquiry: core.inquiry,
    tokens: {
      checkAccessToken: () => Promise.resolve({ kind: "invalid" }),
    },
    clock,
    logger,
  },
);
endpoint.serveStdio();
logger.info("mcp_stdio_serving", { mode: "all_in_one" });
