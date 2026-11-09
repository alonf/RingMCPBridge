// Mode H's core service (T027 part 4), on SQLite with a stand-in Entra in place of Azure SQL, Key
// Vault and Entra: its routes, its readiness and what it names when something is missing, the
// home's link over WebSocket, and the listed agents seeded from the settings at each start.
import { createServer } from "node:net";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { OutboxStore } from "../../src/connector/access/outbox-store/index.ts";
import type { CoreSecrets } from "../../src/core/access/secrets/index.ts";
import {
  generateSigningKey,
  signingKeyDocument,
} from "../../src/core/clients/issuer/index.ts";
import {
  AUTHORIZATION_SERVER_METADATA_PATH,
  startCoreService,
} from "../../src/host/core-service.ts";
import type { RunningCore } from "../../src/host/core-service.ts";
import { assembleHome } from "../../src/host/home-assembly.ts";
import { SystemClock } from "../../src/utilities/clock/index.ts";
import { loadSettings } from "../../src/utilities/config/index.ts";
import { dialLink } from "../../src/utilities/link-transport/index.ts";
import { Logger } from "../../src/utilities/logging/index.ts";
import { openSqliteQueryLayer } from "../../src/utilities/query-layer/index.ts";
import {
  EntraOwnerSignIn,
  generateSigningKeyPair,
  Secret,
  signingKeyId,
} from "../../src/utilities/security/index.ts";
import { ScenarioEngine, standardHome } from "../scenarios/index.ts";
import { startEntraStandIn } from "../support/index.ts";
import type { EntraStandIn } from "../support/index.ts";

const CODE = "home-code-1";
const POLL_MS = 50;
const WAIT_LIMIT_MS = 15_000;
const AGENT = {
  client_id: "https://agent.example.test/oauth/client.json",
  platform: "Document agent",
  scopes: ["read"],
  redirect_uris: ["https://agent.example.test/oauth/callback"],
};
const OTHER_AGENT = {
  client_id: "registering-agent",
  scopes: ["read"],
  redirect_uris: ["https://chat.example.test/oauth/callback"],
};

const cleanups: (() => Promise<void>)[] = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    await cleanup();
  }
});

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address() as AddressInfo;
  await new Promise<void>((resolve) => {
    server.close(() => {
      resolve();
    });
  });
  return port;
}

/** Secrets kept in memory, as Key Vault would keep them. */
function memorySecrets(document?: string): CoreSecrets & {
  put(document: string): void;
} {
  let stored = document;
  return {
    read: () =>
      Promise.resolve(
        stored === undefined
          ? { kind: "missing" }
          : { kind: "found", value: new Secret(stored) },
      ),
    write: () => Promise.reject(new Error("The core never writes its keys.")),
    put: (value) => {
      stored = value;
    },
  };
}

interface Started {
  readonly running: RunningCore;
  readonly url: string;
  readonly standIn: EntraStandIn;
  readonly logLines: string[];
}

async function start(
  options: {
    readonly secrets?: CoreSecrets;
    readonly owner?: boolean;
    readonly agents?: readonly object[];
    readonly file?: string;
  } = {},
): Promise<Started> {
  const port = await freePort();
  const url = `http://127.0.0.1:${String(port)}`;
  const standIn = await startEntraStandIn({
    redirectUri: `${url}/sign-in/return`,
  });
  cleanups.push(() => standIn.close());
  const settings = loadSettings({
    BRIDGE_MODE: "core",
    BRIDGE_PUBLIC_URL: url,
    BRIDGE_PORT: String(port),
    BRIDGE_SQL_SERVER: "unused-on-sqlite",
    BRIDGE_SQL_DATABASE: "unused-on-sqlite",
    BRIDGE_KEY_VAULT_URL: "https://unused.vault.example.test",
    BRIDGE_MANAGED_IDENTITY_CLIENT_ID: "unused-identity",
    BRIDGE_ENTRA_TENANT_ID: standIn.tenantId,
    BRIDGE_ENTRA_CLIENT_ID: standIn.clientId,
    BRIDGE_AGENTS: JSON.stringify(options.agents ?? [AGENT]),
    ...(options.owner === false
      ? {}
      : { BRIDGE_OWNER_OBJECT_ID: standIn.owner.objectId }),
  });
  if (settings.mode !== "core") {
    throw new Error("expected the core's settings");
  }
  const clock = new SystemClock();
  const logLines: string[] = [];
  const logger = new Logger({
    sink: (line) => logLines.push(line),
    now: () => clock.now(),
    minLevel: "debug",
  });
  const running = await startCoreService(settings, {
    store: openSqliteQueryLayer(options.file ?? ":memory:", { clock }),
    secrets:
      options.secrets ??
      memorySecrets(signingKeyDocument([generateSigningKey()])),
    ownerSignIn: new EntraOwnerSignIn(
      {
        issuer: standIn.issuer,
        clientId: standIn.clientId,
        redirectUri: `${url}/sign-in/return`,
        ...(settings.core.ownerObjectId === undefined
          ? {}
          : { ownerObjectId: settings.core.ownerObjectId }),
      },
      {
        clock,
        fetch: (target, init) => fetch(target, init),
        clientAssertion: (signal) => standIn.clientAssertion(signal),
      },
    ),
    fetch: () => Promise.resolve(new Response("not found", { status: 404 })),
    clock,
    logger,
    signingKeysRetryMs: POLL_MS,
  });
  cleanups.push(() => running.stop());
  return { running, url, standIn, logLines };
}

async function eventually(
  condition: () => Promise<boolean> | boolean,
): Promise<void> {
  const startedAt = Date.now();
  while (!(await condition())) {
    if (Date.now() - startedAt > WAIT_LIMIT_MS) {
      throw new Error("It did not get there in time.");
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

async function json(
  url: string,
  init?: RequestInit,
): Promise<{ status: number; body: unknown }> {
  const response = await fetch(url, init);
  return { status: response.status, body: await response.json() };
}

describe("mode H's core service", () => {
  it("answers /livez, and /readyz once the database, the lease, the signing keys and the owner are in place", async () => {
    const { url } = await start();

    await expect(json(`${url}/livez`)).resolves.toEqual({
      status: 200,
      body: { status: "ok" },
    });
    await eventually(async () => (await fetch(`${url}/readyz`)).status === 200);
    await expect(json(`${url}/readyz`)).resolves.toEqual({
      status: 200,
      body: {
        status: "ready",
        checks: {
          database: "ok",
          lease: "held",
          signing_keys: "loaded",
          owner: "configured",
        },
      },
    });
  });

  it("is not ready while its signing keys or its owner are missing, and names them; it starts the Issuer once the keys appear", async () => {
    const secrets = memorySecrets();
    const { url } = await start({ secrets, owner: false });
    await eventually(async () => {
      const ready = (await json(`${url}/readyz`)).body as {
        checks: { lease: string };
      };
      return ready.checks.lease === "held";
    });

    await expect(json(`${url}/readyz`)).resolves.toMatchObject({
      status: 503,
      body: {
        status: "not_ready",
        checks: { signing_keys: "missing", owner: "missing" },
      },
    });
    expect(
      (await fetch(`${url}/oauth/.well-known/openid-configuration`)).status,
    ).toBe(503);

    secrets.put(signingKeyDocument([generateSigningKey()]));
    await eventually(async () => {
      const ready = (await json(`${url}/readyz`)).body as {
        checks: { signing_keys: string };
      };
      return ready.checks.signing_keys === "loaded";
    });
    expect(
      (await fetch(`${url}/oauth/.well-known/openid-configuration`)).status,
    ).toBe(200);
    // With the keys in place, the missing owner alone keeps it from being ready.
    await expect(json(`${url}/readyz`)).resolves.toMatchObject({
      status: 503,
      body: { checks: { signing_keys: "loaded", owner: "missing" } },
    });
  });

  it("serves the Issuer's metadata at the RFC 8414 path, the MCP endpoint's metadata, and 404 elsewhere", async () => {
    const { url } = await start();

    await expect(
      json(`${url}${AUTHORIZATION_SERVER_METADATA_PATH}`),
    ).resolves.toMatchObject({
      status: 200,
      body: { issuer: `${url}/oauth` },
    });
    await expect(
      json(`${url}/.well-known/oauth-protected-resource/mcp`),
    ).resolves.toMatchObject({
      status: 200,
      body: { resource: `${url}/mcp`, authorization_servers: [`${url}/oauth`] },
    });
    expect(
      (
        await fetch(`${url}/mcp`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        })
      ).status,
    ).toBe(401);
    expect((await fetch(`${url}/sign-in/return?state=unknown`)).status).toBe(
      404,
    );
    expect((await fetch(`${url}/admin`)).status).toBe(404);
  });

  it("links a home over WebSocket at /link, and the home's inventory lands in State", async () => {
    const { running, url } = await start();
    const key = await generateSigningKeyPair();
    await running.core.settings.requestEnrollment(
      { public_key: key.publicKey, code: CODE },
      new AbortController().signal,
    );
    await running.core.settings.approveEnrollment(
      signingKeyId(key.publicKey),
      new AbortController().signal,
    );
    await eventually(() => running.core.links.serving);
    const clock = new SystemClock();
    const logger = new Logger({
      sink: () => undefined,
      now: () => clock.now(),
      minLevel: "debug",
    });
    const outbox = await OutboxStore.open(
      { path: ":memory:", clock },
      new AbortController().signal,
    );
    const home = assembleHome({
      ring: new ScenarioEngine(clock),
      outbox,
      dial: (signal) =>
        dialLink(
          `${url.replace("http:", "ws:")}/link`,
          { clock, logger },
          signal,
        ),
      identity: { key, enrollmentCode: CODE, connectorVersion: "0.1.0" },
      clock,
      logger,
    });
    cleanups.push(async () => {
      await home.stop();
      await outbox.close();
    });

    home.start();

    await eventually(
      async () =>
        (await running.core.state.devices({}, new AbortController().signal))
          .length === standardHome().devices.length,
    );
  });

  it("seeds the listed agents from its settings at each start, removing one no longer listed", async () => {
    const file = `file:core-service-${String(Date.now())}?mode=memory&cache=shared`;
    const first = await start({ agents: [AGENT, OTHER_AGENT], file });
    expect(
      (
        await first.running.core.settings.agents(new AbortController().signal)
      ).map((agent) => agent.client_id),
    ).toEqual(expect.arrayContaining([AGENT.client_id, OTHER_AGENT.client_id]));

    const second = await start({ agents: [AGENT], file });
    // Two cores on one database: the second waits for the lease, and says so.
    await expect(json(`${second.url}/readyz`)).resolves.toMatchObject({
      status: 503,
      body: { checks: { lease: "held_elsewhere" } },
    });

    expect(
      (
        await second.running.core.settings.agents(new AbortController().signal)
      ).map((agent) => agent.client_id),
    ).toEqual([AGENT.client_id]);
  });
});
