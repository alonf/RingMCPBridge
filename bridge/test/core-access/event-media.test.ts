import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { BlobServiceClient } from "@azure/storage-blob";
import { BlobMediaObjects } from "../../src/core/access/media/blob-media-objects.live.ts";
import { EventLog } from "../../src/core/access/event-log/index.ts";
import { AdminManager } from "../../src/core/managers/admin/index.ts";
import { SettingsStore } from "../../src/core/access/settings/index.ts";
import type { MediaObjects } from "../../src/core/access/media/index.ts";
import { afterEach, expect, it, vi } from "vitest";
import {
  EventMedia,
  FileMediaObjects,
} from "../../src/core/access/media/index.ts";
import { FakeClock } from "../../src/utilities/clock/index.ts";
import {
  CORE_MIGRATIONS,
  runMigrations,
} from "../../src/utilities/query-layer/index.ts";
import { describeStoreMatrix, requireSqlServerInCi } from "../support/index.ts";

const signal = new AbortController().signal;
const event = {
  householdId: "sample-home",
  cameraId: "sample-camera",
  eventId: "sample-event",
  kind: "clip",
  hasSound: true,
  capturedAt: 1000,
} as const;
const sample = Uint8Array.of(1, 2, 3);
describeStoreMatrix("private event media", (backend) => {
  requireSqlServerInCi();
  const directories: string[] = [];
  const containers: (() => Promise<unknown>)[] = [];
  afterEach(async () => {
    for (const dispose of containers.splice(0)) await dispose();
  });
  afterEach(async () => {
    for (const directory of directories.splice(0))
      await rm(directory, { recursive: true, force: true });
  });
  async function fixture() {
    const clock = new FakeClock(1000);
    const store = await backend.emptyDatabase();
    await runMigrations(store, CORE_MIGRATIONS, { clock }, signal);
    const directory = await mkdtemp(join(tmpdir(), "event-media-"));
    directories.push(directory);
    let objects: MediaObjects = new FileMediaObjects(directory);
    if (backend.dialect === "tsql" && process.env.TEST_AZURITE_BLOB_URL) {
      const dev = BlobServiceClient.fromConnectionString(
        "UseDevelopmentStorage=true",
      );
      const service = new BlobServiceClient(
        process.env.TEST_AZURITE_BLOB_URL,
        dev.credential,
      );
      const container = service.getContainerClient("media-" + randomUUID());
      await container.create();
      containers.push(() => container.deleteIfExists());
      objects = new BlobMediaObjects(container);
    }
    return {
      store,
      clock,
      objects,
      media: new EventMedia(store, objects, clock),
    };
  }
  it("reuses an in-flight claim while other database operations proceed and publishes only complete bytes", async () => {
    const { media, store, clock } = await fixture();
    const entered = Promise.withResolvers<undefined>();
    const release = Promise.withResolvers<undefined>();
    async function* chunks() {
      yield sample.subarray(0, 1);
      entered.resolve(undefined);
      await release.promise;
      yield sample.subarray(1);
    }
    const writing = media.stage(
      event,
      () => Promise.resolve({ length: 3, body: chunks() }),
      signal,
    );
    await entered.promise;
    try {
      const duplicate = await media.stage(
        event,
        () => {
          throw new Error("duplicate upstream fetch");
        },
        signal,
      );
      expect(duplicate.status).toBe("pending");
      expect(await media.read(duplicate.id, 0, 3, signal)).toBeUndefined();
      const log = new EventLog({ clock });
      const alarm = {
        location_id: "sample-home",
        event_id: "other-event",
        kind: "alarm",
        priority: "HIGH",
        occurred_at: 1000,
        received_at: 1000,
        summary: "Test alarm",
        late: false,
      } as const;
      expect(
        await store.transaction((tx) => log.append(tx, alarm, signal), signal),
      ).toMatchObject({ kind: "appended" });
    } finally {
      release.resolve(undefined);
    }
    const ready = await writing;
    expect(ready.status).toBe("ready");
    expect(await media.read(ready.id, 1, 2, signal)).toEqual(sample.slice(1));
    expect(
      await media.stage(
        event,
        () => {
          throw new Error("duplicate fetch");
        },
        signal,
      ),
    ).toEqual(ready);
  });
  it("cleans up a truncated stream and allows a fresh attempt", async () => {
    const { media } = await fixture();
    const load = () => Promise.resolve({ length: 4, body: [sample] });
    await expect(media.stage(event, load, signal)).rejects.toThrow();
    const ready = await media.stage(
      event,
      () => Promise.resolve({ length: 3, body: [sample] }),
      signal,
    );
    expect(await media.read(ready.id, 0, 3, signal)).toEqual(sample);
  });
  it("stops a shared load at shutdown even if the loader ignores cancellation", async () => {
    const { media, objects } = await fixture();
    const entered = Promise.withResolvers<AbortSignal>();
    const release = Promise.withResolvers<undefined>();
    const write = vi.spyOn(objects, "write");
    const staging = media.stage(
      event,
      async (producer) => {
        entered.resolve(producer);
        await release.promise;
        return { length: sample.length, body: [sample] };
      },
      signal,
    );
    const producer = await entered.promise;
    const ended = expect(staging).rejects.toThrow();
    try {
      await media.stop();
      await ended;
      expect(producer.aborted).toBe(true);
    } finally {
      release.resolve(undefined);
    }
    expect(write).not.toHaveBeenCalled();
  });
  it("bounds a read from an oversized item created before the byte limit", async () => {
    const { media, store, objects } = await fixture();
    const ready = await media.stage(
      event,
      () => Promise.resolve({ length: sample.length, body: [sample] }),
      signal,
    );
    const length = 32 * 1024 * 1024 + 1;
    await store.run(
      {
        sql: "UPDATE media SET byte_length=@length WHERE media_id=@id",
        params: { length, id: ready.id },
      },
      signal,
    );
    const read = vi.spyOn(objects, "read");
    await expect(media.read(ready.id, 0, length, signal)).rejects.toThrow(
      RangeError,
    );
    expect(read).not.toHaveBeenCalled();
    expect(await media.read(ready.id, 0, 1, signal)).toEqual(
      sample.slice(0, 1),
    );
  });
  it("keeps the same pending item when the first caller disconnects", async () => {
    const { media } = await fixture();
    const caller = new AbortController();
    const entered = Promise.withResolvers<undefined>();
    const release = Promise.withResolvers<undefined>();
    const writing = media.stage(
      event,
      async (writeSignal) => {
        entered.resolve(undefined);
        await release.promise;
        writeSignal.throwIfAborted();
        return { length: sample.length, body: [sample] };
      },
      caller.signal,
    );
    await entered.promise;
    const duplicate = await media.stage(
      event,
      () => {
        throw new Error("duplicate load");
      },
      signal,
    );
    const disconnected = expect(writing).rejects.toThrow("disconnected");
    caller.abort(new Error("disconnected"));
    try {
      await disconnected;
    } finally {
      release.resolve(undefined);
    }
    await expect
      .poll(() => media.ready(duplicate.id, signal))
      .toMatchObject({ id: duplicate.id, status: "ready" });
  });
  it("preserves the upstream failure when cleanup fails or stalls", async () => {
    const { media, objects, clock } = await fixture();
    const original = new Error("upstream failed");
    const load = () => Promise.reject(original);
    vi.spyOn(objects, "remove").mockRejectedValueOnce(
      new Error("cleanup failed"),
    );
    await expect(media.stage(event, load, signal)).rejects.toBe(original);
    await media.sweep(signal);
    const entered = Promise.withResolvers<AbortSignal>();
    const release = Promise.withResolvers<undefined>();
    vi.spyOn(objects, "remove").mockImplementationOnce(
      async (_id, cleanupSignal) => {
        entered.resolve(cleanupSignal);
        await release.promise;
      },
    );
    const failure = expect(media.stage(event, load, signal)).rejects.toBe(
      original,
    );
    const cleanupSignal = await entered.promise;
    try {
      await clock.advance(10_000);
      expect(cleanupSignal.aborted).toBe(true);
      await failure;
    } finally {
      release.resolve(undefined);
    }
    await media.sweep(signal);
  });
  it("refuses oversized photos and clips before opening an object for writing", async () => {
    const { media, objects } = await fixture();
    const write = vi.spyOn(objects, "write");
    for (const [kind, limit] of [
      ["frame", 8],
      ["clip", 32],
    ] as const) {
      await expect(
        media.stage(
          { ...event, kind, hasSound: false },
          () =>
            Promise.resolve({
              length: limit * 1024 * 1024 + 1,
              body: [sample],
            }),
          signal,
        ),
      ).rejects.toThrow(RangeError);
    }
    expect(write).not.toHaveBeenCalled();
  });
  it("keeps households, events, devices, frames and sound policies distinct", async () => {
    const { media } = await fixture();
    const variants = [
      event,
      { ...event, householdId: "another-home" },
      { ...event, eventId: "another-event" },
      { ...event, cameraId: "another-camera" },
      { ...event, hasSound: false },
      { ...event, kind: "frame" as const, hasSound: false },
    ];
    const items = await Promise.all(
      variants.map((key) =>
        media.stage(
          key,
          () => Promise.resolve({ length: 3, body: [sample] }),
          signal,
        ),
      ),
    );
    expect(new Set(items.map(({ id }) => id)).size).toBe(variants.length);
    for (const [index, entry] of items.entries()) {
      expect(entry).toMatchObject({
        ...variants[index],
        status: "ready",
        length: 3,
        source: "event",
      });
    }
  });
  it("cannot publish a pending upload after delete-now", async () => {
    const { media } = await fixture();
    const entered = Promise.withResolvers<undefined>();
    const release = Promise.withResolvers<undefined>();
    const writing = media.stage(
      event,
      async () => {
        entered.resolve(undefined);
        await release.promise;
        return { length: 3, body: [sample] };
      },
      signal,
    );
    await entered.promise;
    try {
      await media.deleteAll(signal);
    } finally {
      release.resolve(undefined);
    }
    await expect(writing).rejects.toThrow("Media unavailable");
  });
  it("expires from capture time, then removes the private object", async () => {
    const { media, clock, objects } = await fixture();
    const ready = await media.stage(
      event,
      () => Promise.resolve({ length: 3, body: [sample] }),
      signal,
    );
    expect(ready.expiresAt).toBe(event.capturedAt + 7 * 86_400_000);
    await clock.advance(7 * 86_400_000);
    expect(await media.read(ready.id, 0, 3, signal)).toBeUndefined();
    await media.sweep(signal);
    await expect(objects.read(ready.id, 0, 3, signal)).rejects.toThrow();
  });
  it("invalidates a read racing an owner deletion and retries failed object removal", async () => {
    const { media, objects, store, clock } = await fixture();
    const settings = new SettingsStore({
      store,
      clock,
      defaultBatteryThresholdPct: 20,
    });
    const admin = new AdminManager({ settings, media });
    const ready = await media.stage(
      event,
      () => Promise.resolve({ length: 3, body: [sample] }),
      signal,
    );
    const entered = Promise.withResolvers<undefined>();
    const release = Promise.withResolvers<undefined>();
    vi.spyOn(objects, "read").mockImplementationOnce(async () => {
      entered.resolve(undefined);
      await release.promise;
      return sample;
    });
    const reading = media.read(ready.id, 0, 3, signal);
    await entered.promise;
    vi.spyOn(objects, "remove").mockRejectedValueOnce(
      new Error("storage offline"),
    );
    try {
      await expect(admin.deleteCachedMedia(signal)).rejects.toMatchObject({
        kind: "unavailable",
      });
      expect(await media.ready(ready.id, signal)).toBeUndefined();
    } finally {
      release.resolve(undefined);
    }
    expect(await reading).toBeUndefined();
    await media.sweep(signal);
    await admin.deleteCachedMedia(signal);
    await expect(objects.read(ready.id, 0, 3, signal)).rejects.toThrow();
  });
});
