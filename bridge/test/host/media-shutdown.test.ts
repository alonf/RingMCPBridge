import { randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import type { MediaItem } from "../../src/core/access/media/index.ts";
import { MediaHandoff } from "../../src/core/managers/media/index.ts";
import { SystemClock } from "../../src/utilities/clock/index.ts";
import { openSqliteQueryLayer } from "../../src/utilities/query-layer/index.ts";
import { AGENT, startTestCore, type Cleanups } from "./core-fixture.ts";
import { linkAgent } from "./link-agent.ts";

const cleanups: Cleanups = [];
afterEach(async () => {
  try {
    for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  } finally {
    vi.restoreAllMocks();
  }
});

it("commits the interrupted download audit before graceful shutdown closes the store", async () => {
  const clock = new SystemClock();
  const store = openSqliteQueryLayer(":memory:", { clock });
  const item: MediaItem = {
    id: randomUUID(),
    kind: "clip",
    source: "event",
    status: "ready",
    hasSound: false,
    householdId: "home",
    cameraId: "door",
    eventId: "event",
    capturedAt: 0,
    expiresAt: Date.now() + 60_000,
    length: 512 * 1024,
  };
  const { url, running } = await startTestCore(cleanups, {
    store,
    mediaObjects: { read: vi.fn(), write: vi.fn(), remove: vi.fn() },
    agents: [{ ...AGENT, client_id: "shutdown-receiver", scopes: ["media"] }],
  });
  const token = await linkAgent(
    new URL("/mcp", url),
    String(AGENT.redirect_uris[0]),
    "media",
  );
  vi.spyOn(MediaHandoff.prototype, "authorize").mockResolvedValue(item);
  const reading = Promise.withResolvers<undefined>();
  vi.spyOn(MediaHandoff.prototype, "read").mockImplementation(
    async (_item, _receiver, _grant, offset, length, signal) => {
      if (offset) {
        reading.resolve(undefined);
        await clock.sleep(30_000, signal);
      }
      return new Uint8Array(length);
    },
  );
  const run = store.run.bind(store);
  vi.spyOn(store, "run").mockImplementation(async (statement, signal) => {
    if (statement.params.outcome === "incomplete")
      await clock.sleep(200, signal);
    return run(statement, signal);
  });
  const close = store.close.bind(store);
  let countAtClose: unknown;
  vi.spyOn(store, "close").mockImplementation(async () => {
    countAtClose = await store.get(
      {
        sql: "SELECT COUNT(*) AS n FROM media_access_log WHERE media_id=@id AND outcome='incomplete'",
        params: { id: item.id },
      },
      new AbortController().signal,
    );
    await close();
  });
  const response = await fetch(
    new URL("/media/items/" + item.id + "?grant=" + "a".repeat(43), url),
    { headers: { authorization: "Bearer " + token } },
  );
  expect(response.status).toBe(200);
  const interrupted = response.arrayBuffer().then(
    () => false,
    () => true,
  );
  await reading.promise;
  await running.stop();
  expect(await interrupted).toBe(true);
  expect(countAtClose).toEqual({ n: 1 });
}, 20_000);
