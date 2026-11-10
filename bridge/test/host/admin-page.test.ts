// The admin page end to end (T029), on mode H's core with the Entra stand-in and connectors over the
// simulated home: the owner signs in afresh, compares the connector's code on the page, types it,
// and approves, and the home's inventory lands. A second connector's approval revokes the first
// key, and the new key's versions start again: its changes are applied, not skipped as older.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { startConnector } from "../../src/host/connector.ts";
import type { RunningConnector } from "../../src/host/connector.ts";
import { SystemClock } from "../../src/utilities/clock/index.ts";
import { loadSettings } from "../../src/utilities/config/index.ts";
import { Logger } from "../../src/utilities/logging/index.ts";
import {
  generateSigningKeyPair,
  signingKeyId,
} from "../../src/utilities/security/index.ts";
import {
  HEBREW_DEVICE_ID,
  ScenarioEngine,
  standardHome,
} from "../scenarios/index.ts";
import { eventually, startTestCore } from "./core-fixture.ts";
import type { Cleanups, StartedCore } from "./core-fixture.ts";

const FIRST_CODE = "7Q4K-29XM";
const SECOND_CODE = "H3NB-C8RT";
const REMOVE_TRIES = 20;
// The connector checks its approval again on its own backoff, and the second one links afresh.
const END_TO_END_TIMEOUT_MS = 30_000;
const REMOVE_PAUSE_MS = 250;

const cleanups: Cleanups = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    await cleanup();
  }
});

function never(): AbortSignal {
  return new AbortController().signal;
}

function cookie(response: Response, name: string): string {
  const found = response.headers
    .getSetCookie()
    .find((value) => value.startsWith(`${name}=`));
  if (found === undefined) {
    throw new Error(`No ${name} cookie was set.`);
  }
  return found.split(";")[0] ?? "";
}

/** Plays the owner's browser through a fresh sign-in: the session cookie. */
async function signIn(core: StartedCore): Promise<string> {
  const started = await fetch(`${core.url}/admin/sign-in?then=enroll`, {
    redirect: "manual",
  });
  const callback = await core.standIn.signInAsOwner(
    started.headers.get("location") ?? "",
  );
  const returned = await fetch(
    `${core.url}/sign-in/return?${callback.toString()}`,
    {
      redirect: "manual",
      headers: { cookie: cookie(started, "admin_sign_in") },
    },
  );
  expect(returned.headers.get("location")).toBe("/admin#enroll");
  return cookie(returned, "admin_session");
}

async function page(core: StartedCore, session: string): Promise<string> {
  const response = await fetch(`${core.url}/admin`, {
    headers: { cookie: session },
  });
  expect(response.status).toBe(200);
  return response.text();
}

function field(shown: string, name: string): string {
  return new RegExp(`name="${name}" value="([^"]+)"`).exec(shown)?.[1] ?? "";
}

/** Compares the code on the page, types it, and approves: the page shown after. */
async function approve(
  core: StartedCore,
  session: string,
  code: string,
): Promise<string> {
  const shown = await page(core, session);
  expect(shown).toContain(code);
  const answer = await fetch(`${core.url}/admin/enroll/approve`, {
    method: "POST",
    redirect: "manual",
    headers: {
      cookie: session,
      origin: core.url,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      form_token: field(shown, "form_token"),
      key_id: field(shown, "key_id"),
      confirmation: code.toLowerCase(),
    }).toString(),
  });
  expect(answer.status).toBe(303);
  return page(core, session);
}

async function connectorOn(
  core: StartedCore,
  code: string,
  ring: ScenarioEngine,
): Promise<{ connector: RunningConnector; keyId: string }> {
  const dataDir = await mkdtemp(join(tmpdir(), "ring-bridge-admin-"));
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
        ring,
        key,
        enrollmentCode: code,
        close: () => Promise.resolve(),
      }),
    connectorVersion: "0.1.0",
    onFatal: () => undefined,
  });
  let stopped = false;
  const stop = async (): Promise<void> => {
    if (!stopped) {
      stopped = true;
      await connector.stop();
    }
  };
  cleanups.push(stop);
  return { connector: { stop }, keyId: signingKeyId(key.publicKey) };
}

describe("the admin page end to end", () => {
  it(
    "approves the connector whose code the owner typed, and its home's inventory lands; a second approval revokes the first key and starts the versions again",
    async () => {
      const core = await startTestCore(cleanups);
      await eventually(() => core.running.core.links.serving);
      const session = await signIn(core);
      const clock = new SystemClock();
      const admin = core.running.core.admin;
      const state = core.running.core.state;

      const first = await connectorOn(
        core,
        FIRST_CODE,
        new ScenarioEngine(clock),
      );
      await eventually(
        async () =>
          (await admin.pendingEnrollment(never()))?.enrollment_code ===
          FIRST_CODE,
      );
      expect(await approve(core, session, FIRST_CODE)).toContain(
        "Approved. The connector links within a minute.",
      );
      await eventually(
        async () =>
          (await state.devices({}, never())).length ===
          standardHome().devices.length,
      );
      await first.connector.stop();

      const secondHome = new ScenarioEngine(clock);
      const second = await connectorOn(core, SECOND_CODE, secondHome);
      await eventually(
        async () =>
          (await admin.pendingEnrollment(never()))?.enrollment_code ===
          SECOND_CODE,
      );
      expect(await approve(core, session, SECOND_CODE)).toContain(
        "1 older connector key was revoked.",
      );
      await expect(admin.connectorKey(first.keyId, never())).resolves.toEqual({
        kind: "revoked",
      });
      await eventually(
        async () =>
          (await admin.connectorKey(second.keyId, never())).kind === "active",
      );

      secondHome.apply({
        kind: "device",
        deviceId: HEBREW_DEVICE_ID,
        changes: { state: { open: true } },
      });
      await eventually(
        async () =>
          JSON.stringify(
            (await state.device(HEBREW_DEVICE_ID, never()))?.state,
          ) === JSON.stringify({ open: true }),
      );
    },
    END_TO_END_TIMEOUT_MS,
  );
});
