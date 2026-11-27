import { recordOwnerMediaChange } from "../audit/index.ts";
import { createHash, randomUUID } from "node:crypto";
import type { Clock } from "../../../utilities/clock/index.ts";
import {
  untilAborted,
  upsertStatement,
} from "../../../utilities/query-layer/index.ts";
import type {
  QueryLayer,
  SqlRow,
} from "../../../utilities/query-layer/index.ts";
import type { MediaObjects } from "./media-objects.ts";

const DAY_MS = 86_400_000;
// A crashed producer cannot hold an event claim for the whole retention period.
const WRITE_TIMEOUT_MS = 10 * 60_000;
const CLEANUP_TIMEOUT_MS = 10_000;
const MAX_BYTES = { frame: 8 * 1024 * 1024, clip: 32 * 1024 * 1024 };
export interface EventMediaKey {
  readonly householdId: string;
  readonly cameraId: string;
  readonly eventId: string;
  readonly kind: "frame" | "clip";
  readonly hasSound: boolean;
  readonly capturedAt: number;
}
export interface MediaItem extends EventMediaKey {
  readonly id: string;
  readonly source: "event";
  readonly status: "pending" | "ready";
  readonly expiresAt: number;
  readonly length: number;
}
export interface MediaContent {
  /** Expected length from the source, checked even when the stream ends cleanly. */
  readonly length: number;
  readonly body: AsyncIterable<Uint8Array> | Iterable<Uint8Array>;
}

function item(row: SqlRow): MediaItem {
  return {
    id: String(row.media_id),
    householdId: String(row.location_id),
    cameraId: String(row.device_id),
    eventId: String(row.event_id),
    kind: row.kind === "clip" ? "clip" : "frame",
    hasSound: row.has_sound === 1,
    capturedAt: Number(row.captured_at),
    source: "event",
    status: row.status === "ready" ? "ready" : "pending",
    length: Number(row.byte_length),
    expiresAt: Number(row.expires_at),
  };
}
async function* checkedChunks(content: MediaContent, signal: AbortSignal) {
  const body = content.body;
  const iterator =
    Symbol.asyncIterator in body
      ? body[Symbol.asyncIterator]()
      : body[Symbol.iterator]();
  let received = 0;
  let exhausted = false;
  try {
    for (;;) {
      signal.throwIfAborted();
      const part = await untilAborted(Promise.resolve(iterator.next()), signal);
      if (part.done) {
        exhausted = true;
        break;
      }
      received += part.value.length;
      if (received > content.length)
        throw new Error("Media exceeds the announced length.");
      yield part.value;
    }
  } finally {
    // An upstream iterator may never settle either next() or return(). Ask it to close
    // and observe its failure without keeping the adapter or core shutdown waiting.
    if (!exhausted)
      void Promise.resolve()
        .then(() => iterator.return?.())
        .catch(() => undefined);
  }
  if (received !== content.length) throw new Error("Incomplete media object.");
}

/** The deletion transaction committed. The sweep will retry object removal. */
export class MediaCleanupPending extends Error {}

/** This event representation cannot be served even if the client retries. */
export class MediaRepresentationUnavailable extends RangeError {}

/** The database controls visibility. No fetch or object operation holds a database transaction. */
export class EventMedia {
  readonly #store: QueryLayer;
  readonly #objects: MediaObjects;
  readonly #clock: Clock;
  readonly #retentionMs: number;
  readonly #shutdown = new AbortController();
  readonly #staging = new Set<Promise<MediaItem>>();
  #objectCursor: string | undefined;
  constructor(
    store: QueryLayer,
    objects: MediaObjects,
    clock: Clock,
    retentionDays = 7,
  ) {
    this.#store = store;
    this.#objects = objects;
    this.#clock = clock;
    this.#retentionMs = retentionDays * DAY_MS;
  }
  async stage(
    key: EventMediaKey,
    load: (signal: AbortSignal) => Promise<MediaContent>,
    signal: AbortSignal,
  ): Promise<MediaItem> {
    // The request owns its wait. Once claimed, the core owns the upload.
    const claimSignal = AbortSignal.any([signal, this.#shutdown.signal]);
    claimSignal.throwIfAborted();
    const work = this.claimAndStage(key, load, claimSignal);
    this.#staging.add(work);
    const tracked = work.finally(() => {
      this.#staging.delete(work);
    });
    return untilAborted(tracked, signal);
  }

  async stop(): Promise<void> {
    this.#shutdown.abort();
    await Promise.allSettled(this.#staging);
  }

  private async claimAndStage(
    key: EventMediaKey,
    load: (signal: AbortSignal) => Promise<MediaContent>,
    signal: AbortSignal,
  ): Promise<MediaItem> {
    const { householdId, cameraId, eventId, kind, hasSound, capturedAt } = key;
    if (
      [householdId, cameraId, eventId].some(
        (value) => value.length === 0 || value.length > 256,
      )
    ) {
      throw new RangeError("Invalid event media identity.");
    }
    const expiresAt = capturedAt + this.#retentionMs;
    if (
      !Number.isSafeInteger(capturedAt) ||
      !Number.isSafeInteger(expiresAt) ||
      expiresAt <= this.#clock.now()
    )
      throw new MediaRepresentationUnavailable(
        "Event media is outside retention.",
      );
    if (kind === "frame" && hasSound)
      throw new RangeError("A frame cannot contain audio.");
    const cacheKey = createHash("sha256")
      .update(JSON.stringify([householdId, cameraId, eventId, kind, hasSound]))
      .digest("hex");
    const id = randomUUID();
    const row = await this.#store.transaction(async (tx) => {
      await tx.run(
        upsertStatement(tx.dialect, {
          table: "media",
          key: ["cache_key"],
          onConflict: "ignore",
          values: {
            media_id: id,
            cache_key: cacheKey,
            location_id: householdId,
            device_id: cameraId,
            event_id: eventId,
            kind,
            has_sound: Number(hasSound),
            source: "event",
            captured_at: capturedAt,
            expires_at: expiresAt,
            status: "pending",
            byte_length: 0,
            write_until: this.#clock.now() + WRITE_TIMEOUT_MS,
          },
        }),
        signal,
      );
      return tx.get(
        {
          sql: "SELECT * FROM media WHERE cache_key=@key",
          params: { key: cacheKey },
        },
        signal,
      );
    }, signal);
    if (
      !row ||
      row.status === "deleting" ||
      Number(row.expires_at) <= this.#clock.now()
    )
      throw new Error("Media unavailable.");
    if (row.media_id !== id || row.status === "ready") return item(row);
    const timeout = new AbortController();
    const cancelTimeout = this.#clock.schedule(WRITE_TIMEOUT_MS, () => {
      timeout.abort();
    });
    const writeSignal = AbortSignal.any([
      this.#shutdown.signal,
      timeout.signal,
    ]);
    try {
      writeSignal.throwIfAborted();
      const content = await untilAborted(load(writeSignal), writeSignal);
      if (
        !Number.isSafeInteger(content.length) ||
        content.length < 1 ||
        content.length > MAX_BYTES[kind]
      ) {
        throw new MediaRepresentationUnavailable(
          "Invalid media length for this representation.",
        );
      }
      await this.#objects.write(
        id,
        checkedChunks(content, writeSignal),
        writeSignal,
      );
      const published = await this.#store.run(
        {
          sql: "UPDATE media SET status='ready', byte_length=@length, write_until=0 WHERE media_id=@id AND status IN ('pending','ready') AND expires_at>@now",
          params: { id, length: content.length, now: this.#clock.now() },
        },
        writeSignal,
      );
      if (!published) throw new Error("Media unavailable.");
      return item({ ...row, status: "ready", byte_length: content.length });
    } catch (error) {
      timeout.abort(); // Stop the upstream transfer, including a body rejected before its first chunk.
      await this.cleanupFailedWrite(id);
      throw error;
    } finally {
      cancelTimeout();
    }
  }

  private async cleanupFailedWrite(id: string): Promise<void> {
    const cleanup = new AbortController();
    const cancel = this.#clock.schedule(CLEANUP_TIMEOUT_MS, () => {
      cleanup.abort();
    });
    try {
      await untilAborted(
        this.#store.run(
          {
            sql: "UPDATE media SET status='deleting', write_until=0 WHERE media_id=@id",
            params: { id },
          },
          cleanup.signal,
        ),
        cleanup.signal,
      );
      await untilAborted(this.remove(id, cleanup.signal), cleanup.signal);
    } catch {
      // Preserve the staging error. The sweep retries tombstones and expired pending claims.
    } finally {
      cancel();
    }
  }

  /** Only the representation staged for this exact event and sound policy can match. */
  async find(
    key: Omit<EventMediaKey, "capturedAt">,
    signal: AbortSignal,
  ): Promise<MediaItem | undefined> {
    const row = await this.#store.get(
      {
        sql: "SELECT * FROM media WHERE location_id=@home AND device_id=@camera AND event_id=@event AND kind=@kind AND has_sound=@sound AND status IN ('pending','ready') AND expires_at>@now",
        params: {
          home: key.householdId,
          camera: key.cameraId,
          event: key.eventId,
          kind: key.kind,
          sound: Number(key.hasSound),
          now: this.#clock.now(),
        },
      },
      signal,
    );
    return row && item(row);
  }
  async ready(id: string, signal: AbortSignal): Promise<MediaItem | undefined> {
    const row = await this.#store.get(
      {
        sql: "SELECT * FROM media WHERE media_id=@id AND status='ready' AND expires_at>@now",
        params: { id, now: this.#clock.now() },
      },
      signal,
    );
    return row && item(row);
  }
  /** Identity for the audit trail, including items that can no longer be read. */
  async auditIdentity(id: string, signal: AbortSignal) {
    const row = await this.#store.get(
      {
        sql: "SELECT location_id,device_id,event_id FROM media WHERE media_id=@id",
        params: { id },
      },
      signal,
    );
    return (
      row && {
        householdId: String(row.location_id),
        cameraId: String(row.device_id),
        eventId: String(row.event_id),
      }
    );
  }
  /** Return bytes only if the item is still readable when the object read completes. */
  async read(
    id: string,
    start: number,
    length: number,
    signal: AbortSignal,
  ): Promise<Uint8Array | undefined> {
    const current = await this.ready(id, signal);
    if (!current) return undefined;
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(length) ||
      start < 0 ||
      length < 1 ||
      length > MAX_BYTES[current.kind] ||
      length > current.length - start
    )
      throw new RangeError("Invalid media range.");
    let bytes;
    try {
      bytes = await this.#objects.read(id, start, length, signal);
    } catch (error) {
      if (!(await this.ready(id, signal))) return undefined;
      throw error;
    }
    return (await this.ready(id, signal)) ? bytes : undefined;
  }

  /** Invalidate all existing items atomically before the first object operation. */
  async deleteAll(signal: AbortSignal): Promise<void> {
    await this.#store.transaction(async (tx) => {
      await tx.run(
        {
          sql: "UPDATE media SET status='deleting' WHERE status<>'deleting'",
          params: {},
        },
        signal,
      );
      await recordOwnerMediaChange(
        tx,
        { action: "delete_cached_media" },
        this.#clock.now(),
        signal,
      );
    }, signal);
    try {
      await this.collect("all-pages", signal);
    } catch (cause) {
      throw new MediaCleanupPending(
        "Access has been withdrawn. Object cleanup is pending.",
        { cause },
      );
    }
  }
  async sweep(signal: AbortSignal): Promise<void> {
    await this.#store.run(
      {
        sql: "UPDATE media SET status='deleting' WHERE status<>'deleting' AND (expires_at<=@now OR (status='pending' AND write_until<=@now))",
        params: { now: this.#clock.now() },
      },
      signal,
    );
    await this.collect("one-page", signal);
  }

  /** A remote commit may appear after its row has been cleaned up. Every upload has a
   * fresh UUID and commits its database claim before sending bytes. Listing first, then
   * checking the primary database, therefore also protects uploads in progress. */
  private async orphanIds(
    ids: readonly string[],
    signal: AbortSignal,
  ): Promise<readonly string[]> {
    if (!ids.length) return [];
    const params: Record<string, string> = {};
    const names = ids.map((id, index) => {
      const name = `id${String(index)}`;
      params[name] = id;
      return "@" + name;
    });
    const rows = await this.#store.all(
      {
        sql: `SELECT media_id FROM media WHERE media_id IN (${names.join(", ")})`,
        params,
      },
      signal,
    );
    const tracked = new Set(rows.map((row) => row.media_id));
    return ids.filter((id) => !tracked.has(id));
  }
  private async collect(
    scope: "one-page" | "all-pages",
    signal: AbortSignal,
  ): Promise<void> {
    // Keep independent cleanup work moving, then report the first failure. An abort
    // still stops the entire operation and leaves the durable records for a retry.
    let failure: Error | undefined;
    async function attempt<T>(work: () => Promise<T>): Promise<T | undefined> {
      signal.throwIfAborted();
      try {
        return await untilAborted(work(), signal);
      } catch (error) {
        signal.throwIfAborted();
        failure ??=
          error instanceof Error
            ? error
            : new Error("Media cleanup failed.", { cause: error });
        return undefined;
      }
    }
    const rows = await attempt(() =>
      this.#store.all(
        {
          sql: "SELECT media_id FROM media WHERE status='deleting'",
          params: {},
        },
        signal,
      ),
    );
    for (const row of rows ?? [])
      await attempt(() => this.remove(String(row.media_id), signal));

    const listPage = this.#objects.listPage?.bind(this.#objects);
    if (listPage) {
      let cursor = scope === "one-page" ? this.#objectCursor : undefined;
      do {
        const page = await attempt(() => listPage(cursor, signal));
        // A rejected marker restarts the next sweep. A per-object failure leaves
        // later pages reachable and that object will be revisited on the next scan.
        cursor = page?.next;
        if (!page) break;
        const orphans = await attempt(() => this.orphanIds(page.ids, signal));
        for (const id of orphans ?? [])
          await attempt(() => this.#objects.remove(id, signal));
      } while (scope === "all-pages" && cursor);
      if (scope === "one-page") this.#objectCursor = cursor;
    }
    if (failure) throw failure;
  }
  private async remove(id: string, signal: AbortSignal): Promise<void> {
    await this.#objects.remove(id, signal);
    signal.throwIfAborted();
    // A writer still uploading must release its own claim or time out before its tombstone disappears.
    await this.#store.run(
      {
        sql: "DELETE FROM media WHERE media_id=@id AND status='deleting' AND write_until<=@now",
        params: { id, now: this.#clock.now() },
      },
      signal,
    );
  }
}
