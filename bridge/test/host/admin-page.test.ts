// The admin page end to end (T029), on mode H's core with the Entra stand-in and connectors over the
// simulated home: the owner signs in afresh, compares the connector's code on the page, types it,
// and approves, and the home's inventory lands. A second connector's approval revokes the first
// key, and the new key's versions start again: its changes are applied, not skipped as older.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FileMediaObjects } from "../../src/core/access/media/index.ts";
import * as deployment from "../../src/host/priority-policy.ts";
import { QueryLayerError } from "../../src/utilities/query-layer/index.ts";
import { MediaPermissions } from "../../src/core/access/settings/index.ts";
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
async function signIn(
  core: StartedCore,
  section: "enroll" | "media-storage" = "enroll",
): Promise<string> {
  const started = await fetch(`${core.url}/admin/sign-in?then=${section}`, {
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
  expect(returned.headers.get("location")).toBe(`/admin#${section}`);
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
  it("enforces the deployment policy on shared camera forms and explains an unconfirmed save", async () => {
    const directory = await mkdtemp(join(tmpdir(), "shared-camera-policy-"));
    cleanups.push(() => rm(directory, { recursive: true, force: true }));
    const policy = deployment.readPriorityPolicy();
    const deploymentPolicy = vi
      .spyOn(deployment, "readPriorityPolicy")
      .mockReturnValueOnce({ ...policy, sharedLocationKinds: [] });
    try {
      const core = await startTestCore(cleanups, {
        mediaObjects: new FileMediaObjects(directory),
      });
      const now = Date.now();
      await core.running.core.state.applyInventory(
        {
          snapshot_version: 0,
          locations: [
            {
              location_id: "shared",
              name: "Shared household",
              ownership: "shared",
              time_zone: "UTC",
              as_of: now,
              state_version: 1,
            },
          ],
          devices: [
            {
              device_id: "door",
              location_id: "shared",
              name: "Door",
              type: "doorbell",
              power_mode: "wired",
              online: true,
              state: {},
              as_of: now,
              state_version: 2,
            },
          ],
        },
        never(),
      );
      const owner = await signIn(core);
      const shown = await page(core, owner);
      expect(shown).toMatch(/name="person_action"\s+disabled/);
      expect(shown).toContain("deployment policy drops person detections");
      const fields = {
        form_token: field(shown, "form_token"),
        camera_form: "settings",
        location_id: "shared",
        device_id: "door",
        receiver_id: "",
      };
      const submit = (extra: Record<string, string>) =>
        fetch(core.url + "/admin/cameras", {
          method: "POST",
          redirect: "manual",
          headers: { cookie: owner, origin: core.url },
          body: new URLSearchParams({ ...fields, ...extra }),
        });
      for (const choice of ["push", "store_only"])
        expect((await submit({ person_action: choice })).status).toBe(400);
      expect((await submit({ enabled: "on" })).status).toBe(303);
      const lookup = vi
        .spyOn(core.running.core.state, "device")
        .mockRejectedValueOnce(new Error("Inventory unavailable."));
      try {
        expect((await submit({})).status).toBe(303);
        expect(await page(core, owner)).toContain(
          "changes have not been applied",
        );
      } finally {
        lookup.mockRestore();
      }
      const outage = vi
        .spyOn(MediaPermissions.prototype, "save")
        .mockRejectedValueOnce(
          new QueryLayerError("store_down", "Unavailable."),
        );
      try {
        expect((await submit({})).status).toBe(303);
        expect(await page(core, owner)).toContain("could not confirm the save");
      } finally {
        outage.mockRestore();
      }
    } finally {
      deploymentPolicy.mockRestore();
    }
  }, 30_000);
  it("deletes cached bytes only after an owner submits the confirmed same-origin form", async () => {
    const directory = await mkdtemp(join(tmpdir(), "camera-delete-"));
    cleanups.push(() => rm(directory, { recursive: true, force: true }));
    const objects = new FileMediaObjects(directory);
    const core = await startTestCore(cleanups, {
      mediaObjects: objects,
    });
    const media = core.running.core.media;
    if (!media) throw new Error("Missing test store");
    const item = await media.stage(
      {
        householdId: "home",
        cameraId: "door",
        eventId: "event",
        capturedAt: Date.now(),
        kind: "frame",
        hasSound: false,
      },
      () => Promise.resolve({ length: 1, body: [Uint8Array.of(1)] }),
      never(),
    );
    let owner = await signIn(core);
    let formToken = field(await page(core, owner), "form_token");
    const submit = (token: string, origin: string, confirm: string) =>
      fetch(core.url + "/admin/media/delete", {
        method: "POST",
        redirect: "manual",
        headers: { cookie: owner, origin },
        body: new URLSearchParams({ form_token: token, confirm }),
      });
    expect((await submit("invalid", core.url, "DELETE")).status).toBe(403);
    expect(
      (await submit(formToken, "https://other.test", "DELETE")).status,
    ).toBe(403);
    expect((await submit(formToken, core.url, "")).status).toBe(403);
    expect(await media.ready(item.id, never())).toBeDefined();
    expect((await submit(formToken, core.url, "delete")).status).toBe(403);
    const aged = vi
      .spyOn(SystemClock.prototype, "now")
      .mockReturnValue(Date.now() + 5 * 60_000);
    try {
      expect((await submit(formToken, core.url, "DELETE")).status).toBe(303);
      const stale = await page(core, owner);
      expect(stale).toContain("sign-in?then=media-storage");
      expect(stale).not.toContain('action="/admin/media/delete"');
      expect(await media.ready(item.id, never())).toBeDefined();
    } finally {
      aged.mockRestore();
    }
    owner = await signIn(core, "media-storage");
    formToken = field(await page(core, owner), "form_token");
    const failure = vi
      .spyOn(objects, "remove")
      .mockRejectedValue(new Error("Storage unavailable"));
    try {
      expect((await submit(formToken, core.url, "DELETE")).status).toBe(303);
      expect(await media.ready(item.id, never())).toBeUndefined();
      expect(await page(core, owner)).toContain(
        "will retry removing the stored files",
      );
    } finally {
      failure.mockRestore();
    }
    expect((await submit(formToken, core.url, "DELETE")).status).toBe(303);
    expect(await media.ready(item.id, never())).toBeUndefined();
    expect(await page(core, owner)).toContain("Cached camera media deleted.");
  }, 30_000);
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
