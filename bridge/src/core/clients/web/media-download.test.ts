import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { mediaDownload } from "./media-download.ts";
import { MediaDenied } from "../../managers/media/index.ts";
import type { MediaItem } from "../../access/media/index.ts";

const item: MediaItem = {
  id: randomUUID(),
  kind: "clip",
  hasSound: true,
  capturedAt: 0,
  expiresAt: 300000,
  householdId: "home",
  cameraId: "door",
  eventId: "event",
  source: "event",
  status: "ready",
  length: 8,
};
const url =
  "https://core.test/media/items/" + item.id + "?grant=" + "a".repeat(43);
const allowed = {
  kind: "valid" as const,
  clientId: "registration",
  listedClientId: "receiver",
  subject: "owner",
  scopes: ["media"],
  expiresAt: 4102444800,
};
it("serves single ranges, reports unsatisfiable requests and requires a current credential", async () => {
  const media = {
    auditFetch: vi.fn(() => Promise.resolve()),
    authorize: vi.fn(() => Promise.resolve(item)),
    read: vi.fn(
      (
        _item: MediaItem,
        _r: string,
        _g: string,
        start: number,
        length: number,
      ) => Promise.resolve(Uint8Array.from({ length }, (_, i) => i + start)),
    ),
  };
  const limit = { take: () => ({ allowed: true as const }) };
  const tokens = { checkAccessToken: () => Promise.resolve(allowed) };
  const get = (range: string) =>
    mediaDownload(
      new Request(url, { headers: { authorization: "Bearer demo", range } }),
      media,
      tokens,
      limit,
    );
  const limited = await mediaDownload(
    new Request(url, { headers: { authorization: "Bearer demo" } }),
    media,
    tokens,
    { take: () => ({ allowed: false, retryAfterS: 12 }) },
  );
  expect(limited.status).toBe(429);
  expect(limited.headers.get("retry-after")).toBe("12");
  expect(media.authorize).not.toHaveBeenCalled();
  expect(media.read).not.toHaveBeenCalled();
  expect(media.auditFetch).not.toHaveBeenCalled();
  for (const [range, expected] of [
    ["bytes=-2", "bytes 6-7/8"],
    ["bytes=2-", "bytes 2-7/8"],
    ["bytes=0-2", "bytes 0-2/8"],
  ] as const) {
    const res = await get(range);
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe(expected);
  }
  expect((await get("bytes=9-")).status).toBe(416);
  expect(
    (await mediaDownload(new Request(url), media, tokens, limit)).status,
  ).toBe(401);
  expect(media.auditFetch).toHaveBeenCalledWith(
    item.id,
    "",
    "denied",
    expect.any(AbortSignal),
  );
  const invalid = await mediaDownload(new Request(url), media, tokens, {
    take: () => ({ allowed: false, retryAfterS: 3600 }),
  });
  expect(invalid.status).toBe(401);
  expect(invalid.headers.get("www-authenticate")).toBe("Bearer");
  expect(media.auditFetch).toHaveBeenCalledTimes(1);
  const logger = { error: vi.fn() };
  const req = new Request(url, { headers: { authorization: "Bearer demo" } });
  expect(
    (
      await mediaDownload(
        req,
        media,
        {
          checkAccessToken: () => Promise.resolve({ kind: "unavailable" }),
        },
        limit,
      )
    ).status,
  ).toBe(503);
  expect(
    (
      await mediaDownload(
        req,
        media,
        {
          checkAccessToken: () =>
            Promise.resolve({ ...allowed, scopes: ["read"] }),
        },
        limit,
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await mediaDownload(
        req,
        {
          ...media,
          authorize: () => Promise.reject(new Error("store unavailable")),
        },
        tokens,
        limit,
        logger,
      )
    ).status,
  ).toBe(503);
  expect(
    (
      await mediaDownload(
        req,
        { ...media, read: () => Promise.reject(new MediaDenied()) },
        tokens,
        limit,
      )
    ).status,
  ).toBe(403);
  expect(logger.error).toHaveBeenCalledWith(
    "media_download_failed",
    { request_id: item.id },
    expect.any(Error),
  );
});

it("reads a large download on demand and stops at cancellation", async () => {
  const size = 2 * 1024 * 1024;
  const large = { ...item, length: size };
  const read = vi.fn(
    (
      _item: MediaItem,
      _receiver: string,
      _grant: string,
      _offset: number,
      length: number,
    ) => Promise.resolve(new Uint8Array(length)),
  );
  const response = await mediaDownload(
    new Request(url, { headers: { authorization: "Bearer demo" } }),
    {
      authorize: () => Promise.resolve(large),
      read,
      auditFetch: () => Promise.resolve(),
    },
    { checkAccessToken: () => Promise.resolve(allowed) },
    { take: () => ({ allowed: true }) },
  );
  expect(response.status).toBe(200);
  const reader: ReadableStreamDefaultReader<Uint8Array> | undefined =
    response.body?.getReader();
  if (!reader) throw new Error("Missing response body");
  try {
    const first = await reader.read();
    if (first.done) throw new Error("Missing first chunk");
    expect(first.value.byteLength).toBeGreaterThan(0);
    expect(first.value.byteLength).toBeLessThan(size);
    expect(read).toHaveBeenCalledTimes(1);
    const second = await reader.read();
    if (second.done) throw new Error("Missing second chunk");
    expect(second.value.byteLength).toBe(first.value.byteLength);
    expect(read.mock.calls[1]?.[3]).toBe(first.value.byteLength);
  } finally {
    await reader.cancel();
  }
  expect(read).toHaveBeenCalledTimes(2);
});
