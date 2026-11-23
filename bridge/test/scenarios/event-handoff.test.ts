import { afterEach, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  shareEventMediaTool,
  errorEnvelope,
} from "../../src/contract/index.ts";
import { FileMediaObjects } from "../../src/core/access/media/index.ts";
import { EventLog } from "../../src/core/access/event-log/index.ts";
import { MediaPermissions } from "../../src/core/access/settings/index.ts";
import { SystemClock } from "../../src/utilities/clock/index.ts";
import { openSqliteQueryLayer } from "../../src/utilities/query-layer/index.ts";
import { connectOverHttp } from "../support/index.ts";
import { startTestCore } from "../host/core-fixture.ts";
import type { Cleanups } from "../host/core-fixture.ts";
import { linkAgent } from "../host/link-agent.ts";

const signal = new AbortController().signal;
const cleanups: Cleanups = [];
afterEach(async () => {
  for (const clean of cleanups.splice(0).reverse()) await clean();
});
const privateFolder = process.env.RING_PILOT_EVENT_DIRECTORY;
const received = z.object({
  status: z.number(),
  type: z.string().nullable(),
  length: z.number(),
  digest: z.string(),
});
const evidence = z.object({
  householdId: z.string().min(1),
  deviceId: z.string().min(1),
  eventId: z.string().min(1),
  start: z.number(),
  end: z.number(),
  photo: z.object({
    status: z.literal("available"),
    time: z.number(),
    size: z.number(),
  }),
  clip: z.object({
    status: z.literal("available"),
    time: z.number(),
    size: z.number(),
  }),
});
async function sample(directory?: string) {
  if (!directory) {
    const now = Date.now();
    return {
      home: "sample-home",
      device: "sample-camera",
      event: "sample-event",
      frame: Buffer.from("sample photo"),
      clip: Buffer.from("sample clip"),
      photoAt: now,
      clipAt: now,
    };
  }
  const info = evidence.safeParse(
    JSON.parse(await readFile(join(directory, "event.json"), "utf8")),
  );
  if (!info.success) throw new Error("Incomplete private pilot evidence.");
  const {
    householdId: home,
    deviceId: device,
    eventId: event,
    start,
    end,
    photo,
    clip: video,
  } = info.data;
  const [frame, clip] = (await Promise.all(
    ["event.jpg", "event.mp4"].map((name) => readFile(join(directory, name))),
  )) as [Buffer, Buffer];
  if (
    frame.length !== photo.size ||
    clip.length !== video.size ||
    frame.readUInt16BE(0) !== 0xffd8 ||
    clip.toString("ascii", 4, 8) !== "ftyp" ||
    photo.time < start ||
    photo.time >= end ||
    video.time !== start
  )
    throw new Error("Private evidence does not match its event window.");
  return {
    home,
    device,
    event,
    frame,
    clip,
    photoAt: photo.time,
    clipAt: video.time,
  };
}
async function fetchAs(
  origin: string,
  url: string,
  token: string,
  range?: string,
) {
  const proc = spawn(
    process.execPath,
    [fileURLToPath(new URL("./media-receiver.mjs", import.meta.url))],
    { stdio: ["pipe", "pipe", "ignore"], windowsHide: true },
  );
  const result = new Promise<string>((resolve, reject) => {
    let output = "";
    proc.stdout.on("data", (b: Buffer) => {
      output += b.toString();
    });
    proc.once("error", reject);
    proc.once("close", (code) => {
      if (code === 0) resolve(output);
      else reject(new Error("Receiver failed."));
    });
  });
  proc.stdin.end(JSON.stringify({ origin, url, token, range }));
  return received.parse(JSON.parse(await result));
}
async function scenario(directory?: string) {
  const data = await sample(directory);
  const clock = new SystemClock();
  const store = openSqliteQueryLayer(":memory:", { clock });
  const folder = await mkdtemp(join(tmpdir(), "receiver-test-"));
  cleanups.push(() => rm(folder, { recursive: true, force: true }));
  const caller = "requesting-agent",
    receiver = "test-receiver";
  const redirect = (id: string) => "https://" + id + ".example.test/callback";
  const agents = [caller, receiver].map((clientId) => ({
    client_id: clientId,
    scopes: ["read", "media"],
    redirect_uris: [redirect(clientId)],
  }));
  let preparing = true;
  const objects = new FileMediaObjects(folder);
  const started = Promise.withResolvers<undefined>(),
    release = Promise.withResolvers<undefined>();
  let pauseRead = false;
  const read = objects.read.bind(objects);
  objects.read = async (...args) => {
    if (pauseRead) {
      started.resolve(undefined);
      await release.promise;
    }
    return read(...args);
  };
  const { url, running, logLines } = await startTestCore(cleanups, {
    store,
    agents,
    readsPerHour: 24,
    mediaObjects: objects,
    eventMediaSource: (key) => {
      if (
        key.householdId !== data.home ||
        key.cameraId !== data.device ||
        key.eventId !== data.event
      )
        return Promise.resolve({ status: "missing" as const });
      if (preparing) return Promise.resolve({ status: "pending" as const });
      const photo = key.kind === "frame";
      if (!photo && !key.hasSound)
        return Promise.resolve({ status: "missing" as const });
      const bytes = photo ? data.frame : data.clip;
      return Promise.resolve({
        status: "available" as const,
        capturedAt: photo ? data.photoAt : data.clipAt,
        load: () => Promise.resolve({ length: bytes.length, body: [bytes] }),
      });
    },
  });
  const now = clock.now();
  await running.core.state.applyInventory(
    {
      snapshot_version: 0,
      locations: [
        {
          location_id: data.home,
          ownership: "owned",
          name: "Pilot home",
          time_zone: "UTC",
          as_of: now,
          state_version: 1,
        },
      ],
      devices: [
        {
          device_id: data.device,
          location_id: data.home,
          type: "camera",
          name: "Pilot camera",
          power_mode: "wired",
          online: true,
          state: {},
          as_of: now,
          state_version: 2,
        },
      ],
    },
    signal,
  );
  await store.transaction(
    (tx) =>
      new EventLog({ clock }).append(
        tx,
        {
          event_id: data.event,
          location_id: data.home,
          device_id: data.device,
          kind: "camera.motion",
          priority: "MEDIUM",
          occurred_at: data.clipAt,
          received_at: now,
          summary: "Recorded detection",
          late: false,
        },
        signal,
      ),
    signal,
  );
  const permissions = new MediaPermissions(store);
  const set = (approved: boolean) =>
    permissions.save(
      data.home,
      data.device,
      receiver,
      { enabled: true, sound: true, approved },
      signal,
    );
  await set(true);
  const endpoint = new URL("/mcp", url);
  const callerToken = await linkAgent(endpoint, redirect(caller), "read media");
  const receiverToken = await linkAgent(
    endpoint,
    redirect(receiver),
    "read media",
  );
  const readOnly = await connectOverHttp(endpoint, {
    accessToken: await linkAgent(endpoint, redirect(caller), "read"),
  });
  cleanups.push(() => readOnly.close());
  expect(
    (await readOnly.client.listTools()).tools.some(
      (t) => t.name === "share_event_media",
    ),
  ).toBe(false);
  const agent = await connectOverHttp(endpoint, { accessToken: callerToken });
  cleanups.push(() => agent.close());
  expect(
    (await agent.client.listTools()).tools.some(
      (t) => t.name === "share_event_media",
    ),
  ).toBe(true);
  const share = (kind: string, eventId = data.event) =>
    agent.client.callTool({
      name: "share_event_media",
      arguments: {
        location_id: data.home,
        device_id: data.device,
        event_id: eventId,
        receiver_id: receiver,
        kind,
      },
    });
  expect(
    (await share("photo", "missing-event")).structuredContent,
  ).toMatchObject({ error: { code: "NOT_FOUND" } });
  const otherCamera = await agent.client.callTool({
    name: "share_event_media",
    arguments: {
      location_id: data.home,
      device_id: "other",
      event_id: data.event,
      receiver_id: receiver,
      kind: "photo",
    },
  });
  expect(otherCamera.structuredContent).toMatchObject({
    error: { code: "ACTION_DISABLED" },
  });
  expect((await share("photo")).structuredContent).toMatchObject({
    data: { status: "pending" },
  });
  preparing = false;
  const issue = async (kind: "photo" | "clip") => {
    const answer = await share(kind);
    const parsed = shareEventMediaTool.reply.safeParse(
      answer.structuredContent,
    );
    if (!parsed.success || parsed.data.data.status !== "ready")
      throw new Error("Expected ready event item.");
    const item = parsed.data.data;
    expect(
      item.location_id === data.home &&
        item.device_id === data.device &&
        item.event_id === data.event,
    ).toBe(true);
    expect(Date.parse(item.captured_at)).toBe(
      kind === "photo" ? data.photoAt : data.clipAt,
    );
    return item.uri;
  };
  const photo = await issue("photo"),
    clip = await issue("clip");
  for (const [link, bytes, mime] of [
    [photo, data.frame, "image/jpeg"],
    [clip, data.clip, "video/mp4"],
  ] as const) {
    const response = await fetchAs(url, link, receiverToken);
    expect(response).toMatchObject({
      status: 200,
      length: bytes.length,
      type: mime,
      digest: createHash("sha256").update(bytes).digest("hex"),
    });
  }
  expect((await fetchAs(url, clip, receiverToken, "bytes=0-3")).status).toBe(
    206,
  );
  expect((await fetchAs(url, clip, callerToken)).status).toBe(403);
  const wrongItem = new URL(photo);
  wrongItem.pathname = new URL(clip).pathname;
  expect((await fetchAs(url, wrongItem.href, receiverToken)).status).toBe(403);
  pauseRead = true;
  const inFlight = fetchAs(url, clip, receiverToken, "bytes=0-3");
  try {
    await started.promise;
    await set(false);
  } finally {
    pauseRead = false;
    release.resolve(undefined);
  }
  expect((await inFlight).status).toBe(403);
  await set(false);
  expect((await fetchAs(url, clip, receiverToken, "bytes=4-")).status).toBe(
    403,
  );
  expect((await share("photo")).isError).toBe(true);
  await set(true);
  expect((await fetchAs(url, clip, receiverToken)).status).toBe(403);
  expect((await fetchAs(url, await issue("clip"), receiverToken)).status).toBe(
    200,
  );
  await permissions.save(
    data.home,
    data.device,
    receiver,
    { enabled: true, sound: false, approved: true },
    signal,
  );
  expect((await share("clip")).isError).toBe(true);
  expect((await share("photo")).isError).not.toBe(true);
  await permissions.save(
    data.home,
    data.device,
    receiver,
    { enabled: false, sound: false, approved: true },
    signal,
  );
  expect((await share("photo")).isError).toBe(true);
  if (!directory) {
    let limited = false;
    for (let attempt = 0; attempt <= 24 && !limited; attempt++) {
      const result = await share("photo");
      const failure = errorEnvelope.safeParse(result.structuredContent);
      limited = failure.success && failure.data.error.code === "RATE_LIMITED";
    }
    expect(limited).toBe(true);
  }
  for (const secret of [
    callerToken,
    receiverToken,
    new URL(photo).searchParams.get("grant") ?? "",
  ])
    expect(logLines.some((line) => line.includes(secret))).toBe(false);
}
it(
  "shares exact event items through MCP to a separately authenticated receiver",
  () => scenario(),
  60_000,
);
it.skipIf(!privateFolder)(
  "verifies the recorded Ring photo and clip at the separate receiver",
  () => scenario(privateFolder),
  60_000,
);
