import { createHash, createHmac } from "node:crypto";
import { writeFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { FileMediaObjects } from "../../src/core/access/media/index.ts";
import { MediaPermissions } from "../../src/core/access/settings/index.ts";
import { fetchAs } from "../scenarios/fetch-as-receiver.ts";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { PilotLinks } from "../../src/connector/access/ring-partner/links.ts";
import { partnerConfig } from "../../src/connector/access/ring-partner/index.ts";
import { recordingEventId } from "../../src/connector/engines/normalize/index.ts";
import { SystemClock } from "../../src/utilities/clock/index.ts";
import { openSqliteQueryLayer } from "../../src/utilities/query-layer/index.ts";
import {
  eventually,
  freePort,
  startTestCore,
  type Cleanups,
} from "./core-fixture.ts";
import { linkTestHome } from "./link-test-home.ts";
import { OTHER_AGENT } from "./core-fixture.ts";
import { linkAgent } from "./link-agent.ts";
import { connectOverHttp } from "../support/index.ts";
import {
  getEventsTool,
  shareEventMediaTool,
} from "../../src/contract/index.ts";

const cleanups: Cleanups = [];
afterEach(async () => {
  for (const stop of cleanups.splice(0).reverse()) await stop();
});
const pair = {
  activeFrom: new Date(Date.now() - 60_000).toISOString(),
  accountId: "owner",
  ringHouseholdId: "partner-home",
  ringDeviceId: "partner-camera",
  locationId: "bridge-home",
  deviceId: "bridge-camera",
};
const appId = "synthetic-app",
  secret = "synthetic-credential",
  signingKey = "synthetic-signing";
const dbFile =
  "ring-pilot-links-" +
  createHash("sha256").update(appId).digest("hex").slice(0, 16) +
  ".sqlite";
it("rejects ambiguous pairings on either side", () => {
  const config = { clientId: appId, clientSecret: secret, signingKey };
  for (const changed of [{ deviceId: "other" }, { accountId: "other" }])
    expect(
      partnerConfig.safeParse({
        ...config,
        pairs: [pair, { ...pair, ...changed }],
      }).success,
    ).toBe(false);
});

it("commits one signed detection in the paired household and forgets its private reference on unlink", async () => {
  const store = openSqliteQueryLayer(":memory:", { clock: new SystemClock() });
  const receiver = {
    client_id: "receiver",
    scopes: ["media"],
    redirect_uris: ["https://receiver.example.test/callback"],
  };
  const folder = await mkdtemp(join(tmpdir(), "paired-media-"));
  cleanups.push(() => rm(folder, { recursive: true, force: true }));
  const mediaObjects = new FileMediaObjects(folder);
  const core = await startTestCore(cleanups, {
    store,
    mediaObjects,
    agents: [{ ...OTHER_AGENT, scopes: ["read", "media"] }, receiver],
  });
  const sample = process.env.RING_PILOT_EVENT_DIRECTORY;
  const photo = sample
    ? await readFile(join(sample, "event.jpg"))
    : Buffer.concat([
        Buffer.from([255, 216]),
        Buffer.alloc(98_000),
        Buffer.from([255, 217]),
      ]);
  if (!sample)
    execFileSync("ffmpeg", [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=s=16x16:r=10",
      "-t",
      "1",
      "-c:v",
      "mpeg4",
      join(folder, "event.mp4"),
    ]);
  const clip = await readFile(join(sample ?? folder, "event.mp4"));
  const requested: string[] = [];
  const signal = new AbortController().signal;
  const port = await freePort(),
    time = Date.now() - 15_000;
  const shared = {
    ...pair,
    ringDeviceId: "other-partner-camera",
    deviceId: "shared-camera",
    locationId: "shared-home",
  };
  let household = pair.ringHouseholdId,
    lookups = 0;
  const dataDir = await linkTestHome(
    core,
    cleanups,
    {
      locations: [
        {
          location_id: pair.locationId,
          name: "Home",
          ownership: "owned",
          time_zone: "UTC",
        },
        {
          location_id: shared.locationId,
          name: "Shared",
          ownership: "shared",
          time_zone: "UTC",
        },
      ],
      devices: [pair, shared].map((p) => ({
        location_id: p.locationId,
        device_id: p.deviceId,
        type: "camera",
        name: "Same camera name",
        power_mode: "wired",
        online: true,
        state: {},
      })),
    },
    undefined,
    {
      prepare: async (dir) => {
        const links = new PilotLinks(join(dir, dbFile), appId, secret);
        try {
          links.save({
            account: pair.accountId,
            masked: "a***",
            access: "test-access",
            session: "test-session",
            linkedAt: time - 1000,
            tokenExpiry: time + 3_600_000,
            sessionExpiry: time + 3_600_000,
            expires: time + 3_600_000,
          });
        } finally {
          links.close();
        }
        const path = join(dir, "pairing.json");
        await writeFile(
          path,
          JSON.stringify({
            clientId: appId,
            clientSecret: secret,
            signingKey,
            port,
            pairs: [pair, shared],
          }),
        );
        return path;
      },
      send: (url, init) => {
        const target = new URL(url instanceof Request ? url.url : url);
        if (target.pathname.endsWith("/capabilities"))
          return Promise.resolve(
            Response.json({
              data: {
                attributes: {
                  components: {
                    items: [{ component_id: "lens", component_type: "lens" }],
                  },
                },
              },
            }),
          );
        if (target.pathname.includes("/media/")) {
          const image = target.pathname.endsWith("/image/download");
          if (typeof init?.body !== "string")
            throw new Error("Expected a media request body.");
          const options = JSON.parse(init.body) as {
            components: unknown;
            audio_options?: { audio_enabled: boolean };
          };
          expect(options.components).toEqual([{ component_id: "lens" }]);
          if (!image) expect(options.audio_options?.audio_enabled).toBe(true);
          requested.push(image ? "photo" : "clip");
          return Promise.resolve(
            new Response(Uint8Array.from(image ? photo : clip), {
              headers: {
                "content-type": image ? "image/jpeg" : "video/mp4",
                "x-media-timestamp": String(time + 1),
              },
            }),
          );
        }
        const device = [pair, shared].find(
          (p) => target.pathname === "/v1/devices/" + p.ringDeviceId,
        );
        if (!device)
          return Promise.resolve(new Response(null, { status: 404 }));
        lookups++;
        return Promise.resolve(
          Response.json({
            data: {
              type: "devices",
              id: device.ringDeviceId,
              relationships: { location: { data: { id: household } } },
            },
          }),
        );
      },
    },
  );
  await eventually(async () =>
    Boolean(await core.running.core.state.device(pair.deviceId, signal)),
  );
  const reader = new PilotLinks(join(dataDir, dbFile), appId, secret);
  cleanups.push(() => {
    reader.close();
    return Promise.resolve();
  });
  const eventId = "x".repeat(140);
  const payload = {
    meta: { version: "1.1", account_id: pair.accountId, request_id: "one" },
    data: {
      type: "motion_detected",
      id: eventId,
      attributes: {
        source_type: "devices",
        source: pair.ringDeviceId,
        timestamp: time,
        sub_type: "human",
        component_ids: ["lens"],
      },
    },
  };
  async function post(value: unknown, key = signingKey) {
    const body = JSON.stringify(value);
    const res = await fetch(core.url + "/ring/webhook", {
      method: "POST",
      body,
      headers: {
        "x-signature":
          "sha256=" + createHmac("sha256", key).update(body).digest("hex"),
      },
    });
    await res.text();
    return res.status;
  }
  const id = recordingEventId({
    householdId: pair.ringHouseholdId,
    deviceId: pair.ringDeviceId,
    eventId,
  });
  expect(await post(payload, "wrong")).toBe(403);
  expect(
    await post({ ...payload, meta: { ...payload.meta, account_id: "other" } }),
  ).toBe(200);
  expect(
    await post({
      ...payload,
      data: {
        ...payload.data,
        attributes: { ...payload.data.attributes, timestamp: time - 2000 },
      },
    }),
  ).toBe(200);
  expect(lookups).toBe(0);
  household = "moved";
  expect(await post(payload)).toBe(200);
  expect(reader.recordingById(pair.accountId, id, Date.now())).toBeUndefined();
  household = pair.ringHouseholdId;
  expect(
    await post({
      ...payload,
      data: {
        ...payload.data,
        attributes: { ...payload.data.attributes, source: shared.ringDeviceId },
      },
    }),
  ).toBe(200);
  expect(
    reader.recordingById(
      shared.accountId,
      recordingEventId({
        householdId: household,
        deviceId: shared.ringDeviceId,
        eventId,
      }),
      Date.now(),
    ),
  ).toBeUndefined();
  expect(
    await Promise.all([
      post(payload),
      post({ ...payload, meta: { ...payload.meta, request_id: "retry" } }),
    ]),
  ).toEqual([200, 200]);
  const events = () =>
    store.all(
      {
        sql: "SELECT location_id,device_id,event_id,occurred_at FROM event WHERE kind='motion'",
        params: {},
      },
      signal,
    );
  await eventually(async () => (await events()).length > 0);
  expect(await events()).toEqual([
    {
      location_id: pair.locationId,
      device_id: pair.deviceId,
      event_id: id,
      occurred_at: time,
    },
  ]);
  expect(reader.recordingById(pair.accountId, id, Date.now())).toMatchObject({
    eventId,
    deviceId: pair.ringDeviceId,
    householdId: household,
    components: ["lens"],
    time,
  });
  const endpoint = new URL("/mcp", core.url);
  const client = await connectOverHttp(endpoint, {
    accessToken: await linkAgent(endpoint, undefined, "read media"),
  });
  cleanups.push(() => client.close());
  const history = await client.client.callTool({
    name: "get_events",
    arguments: { location_id: pair.locationId, device_id: pair.deviceId },
  });
  const entries = getEventsTool.reply.parse(history.structuredContent).data
    .events;
  expect(entries).toHaveLength(1);
  expect(entries[0]).toMatchObject({
    event_id: id,
    kind: "motion",
    device: { id: pair.deviceId },
    occurred_at: new Date(time).toISOString(),
  });
  await new MediaPermissions(store).save(
    pair.locationId,
    pair.deviceId,
    receiver.client_id,
    { enabled: true, approved: true, sound: true },
    signal,
  );
  const receiverToken = await linkAgent(
    endpoint,
    receiver.redirect_uris[0],
    "media",
  );
  for (const kind of ["photo", "clip"] as const) {
    const result = await client.client.callTool({
      name: "share_event_media",
      arguments: {
        location_id: pair.locationId,
        device_id: pair.deviceId,
        event_id: id,
        kind,
        receiver_id: receiver.client_id,
      },
    });
    const item = shareEventMediaTool.reply.parse(result.structuredContent).data;
    if (item.status !== "ready")
      throw new Error("Expected a complete event item.");
    const received = await fetchAs(core.url, item.uri, receiverToken);
    expect(received).toMatchObject({
      status: 200,
      digest: createHash("sha256")
        .update(kind === "photo" ? photo : clip)
        .digest("hex"),
    });
    expect(requested).toEqual(kind === "photo" ? ["photo"] : ["photo", "clip"]);
  }
  expect(
    await post({ ...payload, data: { type: "app_integration_removed" } }),
  ).toBe(200);
  expect(reader.recordingById(pair.accountId, id, Date.now())).toBeUndefined();
  const before = lookups;
  expect(await post(payload)).toBe(200);
  expect(lookups).toBe(before);
}, 60_000);
