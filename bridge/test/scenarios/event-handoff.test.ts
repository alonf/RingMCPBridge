import { afterEach, expect, it, vi } from "vitest";
import { createHash, randomUUID } from "node:crypto";
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
      frame: Buffer.alloc(700_000, 0x41),
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
async function scenario(directory?: string, cacheOnly = false) {
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
  let onLoad: (() => void) | undefined;
  let upstream: "ok" | "old" | "oversized" | "unavailable" = "ok";
  const objects = new FileMediaObjects(folder);
  const started = Promise.withResolvers<undefined>(),
    release = Promise.withResolvers<undefined>();
  let pauseRead = false;
  let afterFirstChunk: (() => Promise<void>) | undefined;
  const read = objects.read.bind(objects);
  objects.read = async (...args) => {
    if (args[1] > 0 && afterFirstChunk) await afterFirstChunk();
    if (pauseRead) {
      started.resolve(undefined);
      await release.promise;
    }
    return read(...args);
  };
  const { url, running, logLines } = await startTestCore(cleanups, {
    store,
    agents,
    readsPerHour: 160,
    mediaObjects: objects,
    ...(cacheOnly
      ? {}
      : {
          eventMediaSource: (key) => {
            if (
              key.householdId !== data.home ||
              key.cameraId !== data.device ||
              key.eventId !== data.event
            )
              return Promise.resolve({ status: "missing" as const });
            if (upstream === "unavailable")
              return Promise.reject(new Error("test provider unavailable"));
            if (preparing)
              return Promise.resolve({ status: "pending" as const });
            const photo = key.kind === "frame";
            if (!photo && !key.hasSound)
              return Promise.resolve({ status: "missing" as const });
            const bytes = photo ? data.frame : data.clip;
            return Promise.resolve({
              status: "available" as const,
              capturedAt:
                upstream === "old"
                  ? Date.now() - 31 * 86_400_000
                  : photo
                    ? data.photoAt
                    : data.clipAt,
              load: () => {
                onLoad?.();
                return Promise.resolve({
                  length:
                    upstream === "oversized" ? 64 * 1024 * 1024 : bytes.length,
                  body: [bytes],
                });
              },
            });
          },
        }),
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
  ).toBe(!cacheOnly);
  if (cacheOnly) return;
  const mediaOnly = await linkAgent(endpoint, redirect(receiver), "media");
  const mediaClient = await connectOverHttp(endpoint, {
    accessToken: mediaOnly,
  });
  cleanups.push(() => mediaClient.close());
  expect(
    (await mediaClient.client.listTools()).tools.map((tool) => tool.name),
  ).toEqual(["share_event_media"]);
  for (const method of ["subscriptions/listen", "resources/subscribe"]) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        authorization: "Bearer " + mediaOnly,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": "2026-07-28",
        "mcp-method": method,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method,
        params: {
          ["_meta"]: {
            "io.modelcontextprotocol/protocolVersion": "2026-07-28",
            "io.modelcontextprotocol/clientCapabilities": {},
            "io.modelcontextprotocol/clientInfo": {
              name: "receiver",
              version: "1",
            },
          },
          notifications: { resourceSubscriptions: ["ring://bridge/events"] },
        },
      }),
    });
    try {
      expect(response.status).toBe(403);
      expect(response.headers.get("www-authenticate")).toContain("read");
    } finally {
      await response.body?.cancel();
    }
  }
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
  // Fire the share deadline deterministically at a particular storage operation.
  async function withShareDeadline<T>(run: (expire: () => void) => Promise<T>) {
    const deadline = new AbortController();
    const timeout = AbortSignal.timeout.bind(AbortSignal);
    const stub = vi
      .spyOn(AbortSignal, "timeout")
      .mockImplementation((ms) =>
        ms === 60_000 ? deadline.signal : timeout(ms),
      );
    try {
      return await run(() => {
        deadline.abort();
      });
    } finally {
      stub.mockRestore();
    }
  }
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
  for (let retry = 0; retry < 21; retry++) {
    expect((await share("clip")).structuredContent).toMatchObject({
      data: { status: "pending" },
      retry_after_s: 10,
    });
  }
  expect((await share("photo")).structuredContent).toMatchObject({
    data: { status: "pending" },
  });
  preparing = false;
  if (!directory) {
    for (const condition of ["old", "oversized", "unavailable"] as const) {
      upstream = condition;
      const temporary = condition === "unavailable";
      expect((await share("photo")).structuredContent).toMatchObject({
        error: {
          code: temporary ? "BRIDGE_UNAVAILABLE" : "NOT_FOUND",
          retryable: temporary,
        },
      });
    }
    expect(logLines.some((line) => line.includes("media_share_failed"))).toBe(
      true,
    );
    upstream = "ok";
    await withShareDeadline(async (expire) => {
      onLoad = expire;
      try {
        expect((await share("clip")).structuredContent).toMatchObject({
          error: { code: "BRIDGE_UNAVAILABLE" },
        });
      } finally {
        onLoad = undefined;
      }
    });
    await vi.waitFor(async () => {
      const item = await running.core.media?.find(
        {
          householdId: data.home,
          cameraId: data.device,
          eventId: data.event,
          kind: "clip",
          hasSound: true,
        },
        signal,
      );
      expect(item?.status).toBe("ready");
    });
  }
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
  expect((await fetchAs(url, photo, receiverToken, "bytes=-0")).status).toBe(
    416,
  );
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
  async function finishAcrossChange(change: "withdraw" | "expire") {
    const link = await issue("photo");
    const reached = Promise.withResolvers<undefined>(),
      resume = Promise.withResolvers<undefined>();
    afterFirstChunk = () => {
      reached.resolve(undefined);
      return resume.promise;
    };
    const transfer = fetchAs(
      url,
      link,
      receiverToken,
      change === "expire" ? "bytes=0-" : undefined,
    );
    try {
      await Promise.race([
        reached.promise,
        transfer.then(() => {
          throw new Error("Expected another storage read");
        }),
      ]);
      if (change === "withdraw") await set(false);
      else {
        const grant = new URL(link).searchParams.get("grant");
        if (!grant) throw new Error("Missing item grant");
        await store.run(
          {
            sql: "UPDATE media_ticket SET expires_at=@now WHERE token_hash=@hash",
            params: {
              now: clock.now(),
              hash: createHash("sha256").update(grant).digest("hex"),
            },
          },
          signal,
        );
      }
    } finally {
      afterFirstChunk = undefined;
      resume.resolve(undefined);
    }
    const completed = await transfer;
    expect(completed.status).toBe(change === "expire" ? 206 : 200);
    expect(completed.digest).toBe(
      createHash("sha256").update(data.frame).digest("hex"),
    );
    expect((await fetchAs(url, link, receiverToken)).status).toBe(403);
    expect((await fetchAs(url, link, receiverToken, "bytes=1-2")).status).toBe(
      403,
    );
    if (change === "withdraw") await set(true);
  }
  if (!directory) {
    await finishAcrossChange("withdraw");
    await finishAcrossChange("expire");
  }
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
    await withShareDeadline(async (expire) => {
      const run = store.run.bind(store);
      const onAudit = vi.fn(expire);
      const write = vi
        .spyOn(store, "run")
        .mockImplementation((query, signal) => {
          if (query.sql.startsWith("INSERT INTO media_access_log")) onAudit();
          return run(query, signal);
        });
      try {
        expect((await share("photo")).structuredContent).toMatchObject({
          error: { code: "ACTION_DISABLED" },
        });
        expect(onAudit).toHaveBeenCalledOnce();
      } finally {
        write.mockRestore();
      }
    });
    // The clip whose transfer continued after its caller timed out used one slot.
    for (let count = 4; count < 20; count++)
      expect((await share("clip")).structuredContent).toMatchObject({
        error: { code: "ACTION_DISABLED" },
      });
    expect((await share("clip")).structuredContent).toMatchObject({
      error: { code: "RATE_LIMITED" },
    });
    expect((await share("photo")).structuredContent).toMatchObject({
      error: { code: "ACTION_DISABLED" },
    });
    for (const [uri, invalidate] of [
      [photo, "UPDATE media SET expires_at=0 WHERE media_id=@id"],
      [clip, "UPDATE media SET status='deleting' WHERE media_id=@id"],
    ] as const) {
      const id = new URL(uri).pathname.split("/").at(-1) ?? "";
      const denialCount = async () =>
        Number(
          (
            await store.get(
              {
                sql: "SELECT COUNT(*) AS n FROM media_access_log WHERE media_id=@id AND location_id=@home AND device_id=@device AND event_id=@event AND receiver_id=@receiver AND operation='fetch' AND outcome='denied'",
                params: {
                  id,
                  home: data.home,
                  device: data.device,
                  event: data.event,
                  receiver,
                },
              },
              signal,
            )
          )?.n,
        );
      await store.run({ sql: invalidate, params: { id } }, signal);
      const beforeDenial = await denialCount();
      const rejected = await fetchAs(url, uri, receiverToken);
      expect(rejected.status).toBe(403);
      expect(rejected.length).toBe(0);
      expect(await denialCount()).toBe(beforeDenial + 1);
    }
    await running.core.admin.deleteCachedMedia(signal);
    expect((await fetchAs(url, clip, receiverToken)).status).toBe(403);
    const unrelated = new URL(clip);
    unrelated.pathname = "/media/items/" + randomUUID();
    const logSize = () =>
      store.get(
        { sql: "SELECT COUNT(*) AS n FROM media_access_log", params: {} },
        signal,
      );
    const before = await logSize();
    expect((await fetchAs(url, unrelated.href, receiverToken)).status).toBe(
      403,
    );
    expect(await logSize()).toEqual(before);
    const logs = await store.all(
      {
        sql: "SELECT location_id,device_id,event_id,requester_id,receiver_id,operation,outcome FROM media_access_log",
        params: {},
      },
      signal,
    );
    expect(logs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          location_id: data.home,
          device_id: data.device,
          event_id: data.event,
          requester_id: caller,
          receiver_id: receiver,
          operation: "share",
          outcome: "allowed",
        }),
        expect.objectContaining({ operation: "share", outcome: "denied" }),
        expect.objectContaining({
          operation: "fetch",
          outcome: "range_rejected",
          receiver_id: receiver,
          event_id: data.event,
        }),
        expect.objectContaining({
          operation: "fetch",
          outcome: "denied",
          receiver_id: caller,
        }),
      ]),
    );
    let limited = false;
    for (let attempt = 0; attempt <= 60 && !limited; attempt++) {
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
it(
  "omits the sharing tool when the core has only cached media",
  () => scenario(undefined, true),
  60_000,
);
it.skipIf(!privateFolder)(
  "verifies the recorded Ring photo and clip at the separate receiver",
  () => scenario(privateFolder),
  60_000,
);
