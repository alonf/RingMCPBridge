// Mode H end to end (T032; quickstart Steps 5 to 7): the core service and the home connector, as
// their containers run them, with the Entra stand-in in place of Entra and the simulated home in
// place of Ring. An agent registers itself, the owner signs in for its link, and the agent reads the
// home through the connector's link with the MCP SDK client. It runs on SQLite and, where the test
// SQL Server is set, on SQL Server.
//
// The task named containers. The image cannot run mode H against stand-ins without settings that
// send its Entra, Key Vault and SQL sign-in elsewhere, and those would stay in the image the owner
// deploys. So it runs in-process; the image is smoke-tested in each mode by
// `scripts/image-smoke.mjs` instead (DRIFT-001-64).
import { linkAgent } from "./link-agent.ts";
import { afterEach, expect, it } from "vitest";
import { linkTestHome } from "./link-test-home.ts";
import { standardHome } from "../scenarios/index.ts";
import {
  connectOverHttp,
  describeStoreMatrix,
  requireSqlServerInCi,
} from "../support/index.ts";
import {
  eventually,
  json,
  OTHER_AGENT,
  startTestCore,
} from "./core-fixture.ts";
import type { Cleanups } from "./core-fixture.ts";

// SQL Server's migrations and the link's start take seconds.
const END_TO_END_TIMEOUT_MS = 60_000;

const cleanups: Cleanups = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    await cleanup();
  }
});

requireSqlServerInCi();

function never(): AbortSignal {
  return new AbortController().signal;
}

/** The agent's link as an MCP client makes it: discovery, registration, the owner's sign-in, the code. */
interface Reply<T> {
  readonly data: T;
}

describeStoreMatrix("mode H end to end", (store) => {
  it(
    "links an agent through the owner's Entra sign-in, and the agent reads the home through the connector's link",
    async () => {
      const core = await startTestCore(cleanups, {
        agents: [OTHER_AGENT],
        store: await store.emptyDatabase(),
      });
      await eventually(() => core.running.core.links.serving);
      await linkTestHome(core, cleanups);
      const home = standardHome();
      await eventually(
        async () =>
          (await core.running.core.state.devices({}, never())).length ===
          home.devices.length,
      );
      expect((await json(`${core.url}/readyz`)).status).toBe(200);

      const mcpUrl = new URL(`${core.url}/mcp`);
      const agent = await connectOverHttp(mcpUrl, {
        accessToken: await linkAgent(mcpUrl),
      });
      cleanups.push(() => agent.close());

      const health = await agent.client.callTool({
        name: "get_health",
        arguments: {},
      });
      expect(health.isError).toBeFalsy();
      // The Ring session's status arrives with the connector's first heartbeat, 15 s in.
      const healthData = (
        health.structuredContent as Reply<{
          readonly home_link: { readonly status: string };
        }>
      ).data;
      expect(healthData.home_link.status).toBe("up");

      const listed = await agent.client.callTool({
        name: "list_devices",
        arguments: {},
      });
      expect(listed.isError).toBeFalsy();
      const devices = (
        listed.structuredContent as Reply<{
          readonly count: number;
          readonly devices: readonly { readonly name: string }[];
        }>
      ).data;
      expect(devices.count).toBe(home.devices.length);
      expect(devices.devices.length).toBeGreaterThan(0);
      const names = new Set(home.devices.map((device) => device.name));
      for (const device of devices.devices) {
        expect(names).toContain(device.name);
      }
    },
    END_TO_END_TIMEOUT_MS,
  );
});
