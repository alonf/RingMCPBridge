import { createHash, createHmac } from "node:crypto";
import { writeFile } from "node:fs/promises";
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
import { getEventsTool } from "../../src/contract/index.ts";

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
  const core = await startTestCore(cleanups, { store, agents: [OTHER_AGENT] });
  const signal = new AbortController().signal;
  const port = await freePort(),
    time = Date.now();
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
      send: (url) => {
        const target = new URL(url instanceof Request ? url.url : url);
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
    const res = await fetch(
      "http://127.0.0.1:" + String(port) + "/ring/webhook",
      {
        method: "POST",
        body,
        headers: {
          "x-signature":
            "sha256=" + createHmac("sha256", key).update(body).digest("hex"),
        },
      },
    );
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
    accessToken: await linkAgent(endpoint),
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
  expect(
    await post({ ...payload, data: { type: "app_integration_removed" } }),
  ).toBe(200);
  expect(reader.recordingById(pair.accountId, id, Date.now())).toBeUndefined();
  const before = lookups;
  expect(await post(payload)).toBe(200);
  expect(lookups).toBe(before);
}, 60_000);
