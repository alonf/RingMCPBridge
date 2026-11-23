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
  let received = 0;
  for await (const chunk of content.body) {
    signal.throwIfAborted();
    received += chunk.length;
    if (received > content.length)
      throw new Error("Media exceeds the announced length.");
    yield chunk;
  }
  if (received !== content.length) throw new Error("Incomplete media object.");
}

/** The database controls visibility. No fetch or object operation holds a database transaction. */
export class EventMedia {
  readonly #store: QueryLayer;
  readonly #objects: MediaObjects;
  readonly #clock: Clock;
  readonly #retentionMs: number;
  readonly #shutdown = new AbortController();
  readonly #staging = new Set<Promise<MediaItem>>();
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
      throw new RangeError("Event media is outside retention.");
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
        throw new RangeError("Invalid media length for this representation.");
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
    await this.#store.run(
      {
        sql: "UPDATE media SET status='deleting' WHERE status<>'deleting'",
        params: {},
      },
      signal,
    );
    await this.collect(signal);
  }
  async sweep(signal: AbortSignal): Promise<void> {
    await this.#store.run(
      {
        sql: "UPDATE media SET status='deleting' WHERE status<>'deleting' AND (expires_at<=@now OR (status='pending' AND write_until<=@now))",
        params: { now: this.#clock.now() },
      },
      signal,
    );
    await this.collect(signal);
  }
  private async collect(signal: AbortSignal): Promise<void> {
    const rows = await this.#store.all(
      { sql: "SELECT media_id FROM media WHERE status='deleting'", params: {} },
      signal,
    );
    let failure: Error | undefined;
    for (const row of rows) {
      signal.throwIfAborted();
      try {
        await this.remove(String(row.media_id), signal);
      } catch (error) {
        failure =
          error instanceof Error
            ? error
            : new Error("Media cleanup failed.", { cause: error });
      }
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
