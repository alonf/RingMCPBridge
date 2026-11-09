// Mode A end to end (T027; tasks.md "stop and check that US1 runs end to end in mode A"): the dev
// script runs as its own process, with the core and the home part linked inside it and the
// simulated home of about 100 devices in place of Ring. The MCP SDK client starts it over stdio, in
// each protocol era, and calls the four read tools once the home's inventory and first heartbeat
// have arrived. In the 2026-07-28 era the SDK client first starts a short-lived copy of the server
// to learn its era, so that run also shows a second process on the same data folder waiting for
// the lease and then serving.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { afterEach, describe, expect, it } from "vitest";
import { standardHome } from "../scenarios/index.ts";
import { eraOptions } from "../support/index.ts";
import type { ProtocolEra } from "../support/index.ts";

const DEV_SCRIPT = fileURLToPath(
  new URL("../../dev/all-in-one-scenario.ts", import.meta.url),
);
const ERAS: readonly ProtocolEra[] = ["legacy", "modern"];
/**
 * The first heartbeat comes 15 s after the session opens; the copy a probing client leaves behind
 * holds the folder for at most 6 s. Measured runs took 16 s to 23 s.
 */
const ARRIVAL_LIMIT_MS = 40_000;
const POLL_MS = 250;
const TEST_LIMIT_MS = 60_000;
const REMOVE_TRIES = 20;
const REMOVE_PAUSE_MS = 250;

const folders: string[] = [];

afterEach(async () => {
  for (const folder of folders.splice(0)) {
    await rm(folder, {
      recursive: true,
      force: true,
      maxRetries: REMOVE_TRIES,
      retryDelay: REMOVE_PAUSE_MS,
    });
  }
});

interface Started {
  readonly client: Client;
  readonly logged: string[];
}

async function start(era: ProtocolEra): Promise<Started> {
  const dataDir = await mkdtemp(join(tmpdir(), "ring-bridge-e2e-"));
  folders.push(dataDir);
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [DEV_SCRIPT],
    env: { ...process.env, BRIDGE_DATA_DIR: dataDir, BRIDGE_LOG_LEVEL: "info" },
    stderr: "pipe",
  });
  const logged: string[] = [];
  transport.stderr?.on("data", (chunk: Buffer) => {
    logged.push(chunk.toString("utf8"));
  });
  const client = new Client(
    { name: "bridge-e2e", version: "0.0.0" },
    eraOptions(era),
  );
  await client.connect(transport);
  return { client, logged };
}

/** A tool's `data`, or `undefined` when the tool answered an error. */
async function dataOf(
  client: Client,
  name: string,
  args: Record<string, unknown> = {},
): Promise<Record<string, unknown> | undefined> {
  const result = await client.callTool({ name, arguments: args });
  if (result.isError === true) {
    return undefined;
  }
  return (result.structuredContent as { data: Record<string, unknown> }).data;
}

async function data(
  client: Client,
  name: string,
  args: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const found = await dataOf(client, name, args);
  if (found === undefined) {
    throw new Error(`${name} answered an error.`);
  }
  return found;
}

/** Waits until the core holds the home's whole inventory and its first heartbeat. */
async function homeArrived(client: Client): Promise<void> {
  const startedAt = Date.now();
  const expected = standardHome().devices.length;
  for (;;) {
    const listed = await dataOf(client, "list_devices");
    const health = await dataOf(client, "get_health");
    const ring = health?.ring_session as { status?: string } | undefined;
    if (listed?.count === expected && ring?.status === "ok") {
      return;
    }
    if (Date.now() - startedAt > ARRIVAL_LIMIT_MS) {
      throw new Error("The home's inventory and heartbeat never arrived.");
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

describe("mode A end to end, over stdio", () => {
  it.each(ERAS)(
    "serves the four read tools on the simulated home in the %s era",
    async (era) => {
      const { client, logged } = await start(era);
      try {
        expect(client.getProtocolEra()).toBe(era);
        await homeArrived(client);
        const [first] = standardHome().devices;
        if (first === undefined) {
          throw new Error("The standard home has no device.");
        }

        const health = await data(client, "get_health");
        const overview = await data(client, "get_overview");
        const listed = await data(client, "list_devices");
        const device = await data(client, "get_device", {
          device_id: first.device_id,
        });

        expect(health).toMatchObject({
          home_link: { status: "up" },
          ring_session: { status: "ok" },
          database: { status: "ok" },
        });
        expect(overview).toHaveProperty("location");
        expect(listed).toMatchObject({ count: standardHome().devices.length });
        expect(device).toMatchObject({
          device: { id: first.device_id, name: first.name },
        });
        const log = logged.join("");
        expect(log).toContain("core_lease_acquired");
        expect(log).toContain("home_part_started");
        expect(log).toContain("mcp_tool_called");
      } finally {
        await client.close();
      }
    },
    TEST_LIMIT_MS,
  );
});
