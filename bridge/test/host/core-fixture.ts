// Mode H's core service for the host tests (T027): on SQLite with a stand-in Entra in place of Azure
// SQL, Key Vault and Entra, on a free local port. Each test file passes its own clean-up list.
import { createServer } from "node:net";
import type { AddressInfo } from "node:net";
import type { CoreSecrets } from "../../src/core/access/secrets/index.ts";
import {
  generateSigningKey,
  signingKeyDocument,
} from "../../src/core/clients/issuer/index.ts";
import { startCoreService } from "../../src/host/core-service.ts";
import type { RunningCore } from "../../src/host/core-service.ts";
import { SystemClock } from "../../src/utilities/clock/index.ts";
import { loadSettings } from "../../src/utilities/config/index.ts";
import { Logger } from "../../src/utilities/logging/index.ts";
import { openSqliteQueryLayer } from "../../src/utilities/query-layer/index.ts";
import {
  EntraOwnerSignIn,
  Secret,
} from "../../src/utilities/security/index.ts";
import { startEntraStandIn } from "../support/index.ts";
import type { EntraStandIn } from "../support/index.ts";

export const POLL_MS = 50;
const WAIT_LIMIT_MS = 15_000;
export const AGENT = {
  client_id: "https://agent.example.test/oauth/client.json",
  platform: "Document agent",
  scopes: ["read"],
  redirect_uris: ["https://agent.example.test/oauth/callback"],
};
export const OTHER_AGENT = {
  client_id: "registering-agent",
  scopes: ["read"],
  redirect_uris: ["https://chat.example.test/oauth/callback"],
};

/** What a test file stops at its end, in reverse. */
export type Cleanups = (() => Promise<void>)[];

export async function freePort(): Promise<number> {
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
export function memorySecrets(document?: string): CoreSecrets & {
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

export interface StartedCore {
  readonly running: RunningCore;
  readonly url: string;
  readonly standIn: EntraStandIn;
  readonly logLines: string[];
}

export async function startTestCore(
  cleanups: Cleanups,
  options: {
    readonly secrets?: CoreSecrets;
    readonly owner?: boolean;
    readonly agents?: readonly object[];
    readonly file?: string;
  } = {},
): Promise<StartedCore> {
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

export async function eventually(
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

export async function json(
  url: string,
  init?: RequestInit,
): Promise<{ status: number; body: unknown }> {
  const response = await fetch(url, init);
  return { status: response.status, body: await response.json() };
}
