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
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  discoverAuthorizationServerMetadata,
  exchangeAuthorization,
  registerClient,
  startAuthorization,
} from "@modelcontextprotocol/client";
import { afterEach, expect, it } from "vitest";
import { startConnector } from "../../src/host/connector.ts";
import { SystemClock } from "../../src/utilities/clock/index.ts";
import { loadSettings } from "../../src/utilities/config/index.ts";
import { Logger } from "../../src/utilities/logging/index.ts";
import {
  generateSigningKeyPair,
  signingKeyId,
} from "../../src/utilities/security/index.ts";
import { ScenarioEngine, standardHome } from "../scenarios/index.ts";
import {
  browse,
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

const CODE = "home-code-e2e";
const REMOVE_TRIES = 20;
const REMOVE_PAUSE_MS = 250;
const UNAUTHORIZED = 401;
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

/** A linked home: the connector on its own data folder, enrolled and approved by the owner. */
async function linkHome(
  core: Awaited<ReturnType<typeof startTestCore>>,
): Promise<void> {
  const dataDir = await mkdtemp(join(tmpdir(), "ring-bridge-e2e-"));
  cleanups.push(() =>
    rm(dataDir, {
      recursive: true,
      force: true,
      maxRetries: REMOVE_TRIES,
      retryDelay: REMOVE_PAUSE_MS,
    }),
  );
  const settings = loadSettings({
    BRIDGE_MODE: "connector",
    BRIDGE_CORE_URL: `${core.url.replace("http:", "ws:")}/link`,
    BRIDGE_DATA_DIR: dataDir,
    BRIDGE_SECRETS_KEY_FILE: join(dataDir, "secrets.key"),
  });
  if (settings.mode !== "connector") {
    throw new Error("expected the connector's settings");
  }
  const clock = new SystemClock();
  const key = await generateSigningKeyPair();
  const connector = await startConnector(settings, {
    clock,
    logger: new Logger({
      sink: () => undefined,
      now: () => clock.now(),
      minLevel: "debug",
    }),
    openHome: () =>
      Promise.resolve({
        ring: new ScenarioEngine(clock),
        key,
        enrollmentCode: CODE,
        close: () => Promise.resolve(),
      }),
    connectorVersion: "0.1.0",
    onFatal: (error) => {
      throw error;
    },
  });
  cleanups.push(() => connector.stop());
  await eventually(
    async () =>
      (await core.running.core.settings.pendingEnrollment(never()))
        ?.enrollment_code === CODE,
  );
  await core.running.core.settings.approveEnrollment(
    signingKeyId(key.publicKey),
    never(),
  );
}

/** The agent's link as an MCP client makes it: discovery, registration, the owner's sign-in, the code. */
async function linkAgent(mcpUrl: URL): Promise<string> {
  const unauthorized = await fetch(mcpUrl, { method: "POST" });
  expect(unauthorized.status).toBe(UNAUTHORIZED);
  const challenge = unauthorized.headers.get("www-authenticate") ?? "";
  const resourceMetadataUrl = /resource_metadata="([^"]+)"/.exec(
    challenge,
  )?.[1];
  expect(resourceMetadataUrl).toBeDefined();
  const resourceMetadata = (await json(String(resourceMetadataUrl))).body as {
    readonly resource: string;
    readonly authorization_servers: readonly string[];
  };
  expect(resourceMetadata.resource).toBe(mcpUrl.href);
  const [issuerUrl = ""] = resourceMetadata.authorization_servers;
  const metadata = await discoverAuthorizationServerMetadata(issuerUrl);
  if (metadata === undefined) {
    throw new Error("The Issuer's metadata was not found.");
  }
  const redirectUri = String(OTHER_AGENT.redirect_uris[0]);
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- an agent with no metadata document registers itself
  const clientInformation = await registerClient(issuerUrl, {
    metadata,
    clientMetadata: {
      client_name: "End-to-end agent",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    },
  });
  const { authorizationUrl, codeVerifier } = await startAuthorization(
    issuerUrl,
    {
      metadata,
      clientInformation,
      redirectUrl: redirectUri,
      scope: "read",
      resource: mcpUrl,
    },
  );
  const reply = await browse(authorizationUrl, redirectUri);
  const code = reply.get("code");
  if (code === null) {
    throw new Error(`The link failed: ${reply.get("error") ?? "no code"}`);
  }
  const tokens = await exchangeAuthorization(issuerUrl, {
    metadata,
    clientInformation,
    authorizationCode: code,
    iss: reply.get("iss") ?? "",
    codeVerifier,
    redirectUri,
    resource: mcpUrl,
  });
  expect(tokens.scope).toBe("read");
  return tokens.access_token;
}

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
      await linkHome(core);
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
