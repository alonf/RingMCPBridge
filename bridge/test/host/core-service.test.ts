// Mode H's core service (T027 part 4), on SQLite with a stand-in Entra in place of Azure SQL, Key
// Vault and Entra: its routes, its readiness and what it names when something is missing, the
// home's link over WebSocket, and the listed agents seeded from the settings at each start.
import { afterEach, describe, expect, it } from "vitest";
import { OutboxStore } from "../../src/connector/access/outbox-store/index.ts";
import {
  generateSigningKey,
  signingKeyDocument,
} from "../../src/core/clients/issuer/index.ts";
import { AUTHORIZATION_SERVER_METADATA_PATH } from "../../src/host/core-service.ts";
import type { RunningCore } from "../../src/host/core-service.ts";
import { assembleHome } from "../../src/host/home-assembly.ts";
import { SystemClock } from "../../src/utilities/clock/index.ts";
import { dialLink } from "../../src/utilities/link-transport/index.ts";
import { Logger } from "../../src/utilities/logging/index.ts";
import {
  generateSigningKeyPair,
  signingKeyId,
} from "../../src/utilities/security/index.ts";
import { ScenarioEngine, standardHome } from "../scenarios/index.ts";
import {
  AGENT,
  eventually,
  json,
  memorySecrets,
  OTHER_AGENT,
  startTestCore,
} from "./core-fixture.ts";
import type { Cleanups } from "./core-fixture.ts";

const CODE = "home-code-1";
/** How long a stop may take before the test counts it as hung. */
const STOP_LIMIT_MS = 5_000;

const cleanups: Cleanups = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    await cleanup();
  }
});

describe("mode H's core service", () => {
  it("answers /livez, and /readyz once the database, the lease, the signing keys and the owner are in place", async () => {
    const { url } = await startTestCore(cleanups);

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
    const { url } = await startTestCore(cleanups, { secrets, owner: false });
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

  it("serves the Issuer's metadata at the RFC 8414 path, the MCP endpoint's metadata, the admin page, and 404 elsewhere", async () => {
    const { url } = await startTestCore(cleanups);

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
    // A return the Issuer does not own is the admin page's (T029): an unknown one has ended.
    const unknownReturn = await fetch(`${url}/sign-in/return?state=unknown`, {
      redirect: "manual",
    });
    expect(unknownReturn.status).toBe(303);
    expect(unknownReturn.headers.get("location")).toBe(
      "/admin?problem=expired",
    );
    const admin = await fetch(`${url}/admin`);
    expect(admin.status).toBe(200);
    expect(await admin.text()).toContain(`href="/admin/sign-in"`);
    expect((await fetch(`${url}/elsewhere`)).status).toBe(404);
  });

  /** Approves a new home key, then links a simulated home to the core over a WebSocket. */
  async function linkedHome(running: RunningCore, url: string): Promise<void> {
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
  }

  it("links a home over WebSocket at /link, and the home's inventory lands in State", async () => {
    const { running, url } = await startTestCore(cleanups);

    await linkedHome(running, url);
  });

  // CP-10's review: the server's close waits for every connection, the home's link included.
  it("stops while a home is still linked, closing the home's link first", async () => {
    const { running, url } = await startTestCore(cleanups);
    await linkedHome(running, url);

    const outcome = await Promise.race([
      running.stop().then(() => "stopped"),
      new Promise((resolve) => {
        setTimeout(() => {
          resolve("still waiting");
        }, STOP_LIMIT_MS);
      }),
    ]);

    expect(outcome).toBe("stopped");
  });

  it("seeds the listed agents from its settings at each start, removing one no longer listed", async () => {
    const file = `file:core-service-${String(Date.now())}?mode=memory&cache=shared`;
    const first = await startTestCore(cleanups, {
      agents: [AGENT, OTHER_AGENT],
      file,
    });
    expect(
      (
        await first.running.core.settings.agents(new AbortController().signal)
      ).map((agent) => agent.client_id),
    ).toEqual(expect.arrayContaining([AGENT.client_id, OTHER_AGENT.client_id]));

    const second = await startTestCore(cleanups, { agents: [AGENT], file });
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
