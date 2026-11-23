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
  const tokens = { checkAccessToken: () => Promise.resolve(allowed) };
  const get = (range: string) =>
    mediaDownload(
      new Request(url, { headers: { authorization: "Bearer demo", range } }),
      media,
      tokens,
    );
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
  expect((await mediaDownload(new Request(url), media, tokens)).status).toBe(
    401,
  );
  const req = new Request(url, { headers: { authorization: "Bearer demo" } });
  expect(
    (
      await mediaDownload(req, media, {
        checkAccessToken: () => Promise.resolve({ kind: "unavailable" }),
      })
    ).status,
  ).toBe(503);
  expect(
    (
      await mediaDownload(req, media, {
        checkAccessToken: () =>
          Promise.resolve({ ...allowed, scopes: ["read"] }),
      })
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
      )
    ).status,
  ).toBe(503);
  expect(
    (
      await mediaDownload(
        req,
        { ...media, read: () => Promise.reject(new MediaDenied()) },
        tokens,
      )
    ).status,
  ).toBe(403);
});
