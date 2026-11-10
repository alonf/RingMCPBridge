// The Outbox Store (CP-08a, T014): the home's durable queue of messages for the core, in the
// connector's own SQLite file (DS3). A message is written before it is sent, sent at least once,
// resent after 10 s without an ack, sent again oldest first after a reconnect, and cleared only on
// its ack (AC B10, OR5, FR-042, PT-30). It also keeps the home's `state_version` counter, so
// versions keep increasing across a restart.
//
// Bodies hold Ring names: untrusted text that is stored as written, and never logged or quoted in
// an error (FR-033, FR-034).
import { randomUUID } from "node:crypto";
import type { Clock } from "../../../utilities/clock/index.ts";
import {
  openSqliteQueryLayer,
  QueryLayerError,
  runMigrations,
} from "../../../utilities/query-layer/index.ts";
import type {
  QueryLayer,
  SqlParams,
  SqlRow,
  SqlSession,
  SqlStatement,
} from "../../../utilities/query-layer/index.ts";
import { OUTBOX_MIGRATIONS } from "./outbox-migrations.ts";
import { OutboxStoreError } from "./outbox-store-error.ts";

/** The outbox's file in the home's data folder. */
export const OUTBOX_FILE_NAME = "outbox.db";

/** How long a sent message waits for its ack before it is sent again (connector-link.md). */
export const RESEND_AFTER_MS = 10_000;

/** The messages that go through the outbox in iteration 001. */
export type OutboxKind = "inventory" | "device_state";

/** A message body: JSON-ready data in the link contract's field names. */
export type OutboxBody = Readonly<Record<string, unknown>>;

/** A message to write. */
export interface OutboxDraft {
  readonly kind: OutboxKind;
  readonly body: OutboxBody;
}

/** A message waiting for its ack. `messageId` is the link's `message_id`. */
export interface OutboxItem {
  readonly messageId: string;
  readonly kind: OutboxKind;
  readonly body: OutboxBody;
}

/** Hands out `state_version` values while a message is composed: each call returns the next. */
export interface StateVersions {
  next(): number;
}

/** Where the outbox lives. */
export interface OutboxStoreOptions {
  /** The connector's own SQLite file; `:memory:` for one that lives only in this process. */
  readonly path: string;
  readonly clock: Clock;
  /**
   * Holds the file's lock for as long as the store is open, so a second process on the same file
   * is refused as `in_use`. The operating system lets the lock go if the process dies, so a crash
   * leaves nothing to clear (CP-10 review).
   */
  readonly exclusive?: boolean;
}

/** SQLite's primary result codes for a lock another connection holds: SQLITE_BUSY, SQLITE_LOCKED. */
const LOCK_HELD_CODES: ReadonlySet<number> = new Set([5, 6]);
const PRIMARY_CODE_MASK = 0xff;

const KNOWN_KINDS: ReadonlySet<string> = new Set<OutboxKind>([
  "inventory",
  "device_state",
]);

// A row of a kind this release does not know (a newer release wrote it, then was rolled back) stays
// in place: it is counted in the depth but never sent by this code (code N-1 on schema N, DS5).
const IS_KNOWN_KIND = "kind IN ('inventory', 'device_state')";
const IS_DUE = "(sent_at IS NULL OR sent_at <= @cutoff)";

const READ_LAST_VERSION =
  "SELECT last_version FROM state_counter WHERE counter_id = 1";
const SAVE_LAST_VERSION =
  "UPDATE state_counter SET last_version = @last_version WHERE counter_id = 1";
const INSERT_MESSAGE =
  "INSERT INTO outbox (message_id, kind, body, created_at) VALUES (@message_id, @kind, @body, @created_at)";
const SELECT_DUE = `SELECT seq, message_id, kind, body FROM outbox WHERE ${IS_KNOWN_KIND} AND ${IS_DUE} ORDER BY seq LIMIT @limit`;
const MARK_SENT = `UPDATE outbox SET sent_at = @now WHERE seq <= @last_seq AND ${IS_KNOWN_KIND} AND ${IS_DUE}`;
const DELETE_MESSAGE = "DELETE FROM outbox WHERE message_id = @message_id";
const MARK_WRITTEN =
  "UPDATE outbox SET sent_at = @now WHERE message_id = @message_id AND sent_at IS NOT NULL";
const MARK_ALL_UNSENT =
  "UPDATE outbox SET sent_at = NULL WHERE sent_at IS NOT NULL";
const COUNT_MESSAGES = "SELECT COUNT(*) AS depth FROM outbox";

/** The home's outbox. One instance per connector process, over its own file. */
export class OutboxStore {
  readonly #layer: QueryLayer;
  readonly #clock: Clock;

  private constructor(layer: QueryLayer, clock: Clock) {
    this.#layer = layer;
    this.#clock = clock;
  }

  /** Opens the outbox file, creating it and bringing its schema up to date. */
  static async open(
    options: OutboxStoreOptions,
    signal: AbortSignal,
  ): Promise<OutboxStore> {
    let layer: QueryLayer;
    try {
      layer = openSqliteQueryLayer(options.path, { clock: options.clock });
    } catch (error) {
      throw unavailable("The outbox file could not be opened.", error);
    }
    if (options.exclusive === true) {
      await holdFile(layer, signal);
    }
    try {
      await runMigrations(
        layer,
        OUTBOX_MIGRATIONS,
        { clock: options.clock },
        signal,
      );
    } catch (error) {
      await layer.close();
      signal.throwIfAborted();
      throw unavailable("The outbox file could not be prepared.", error);
    }
    return new OutboxStore(layer, options.clock);
  }

  /**
   * Writes one message and returns its `message_id`. `compose` builds it and draws its state
   * versions; the message and the counter are saved together, so a failure keeps neither. A
   * failure of `compose` itself passes through unchanged.
   */
  async append(
    compose: (versions: StateVersions) => OutboxDraft,
    signal: AbortSignal,
  ): Promise<string> {
    return this.#guard(signal, "The message could not be written.", () =>
      this.#layer.transaction(async (session) => {
        const first = await readLastVersion(session, signal);
        let last = first;
        const draft = compose({
          next: () => {
            last += 1;
            return last;
          },
        });
        const messageId = randomUUID();
        if (last !== first) {
          await session.run(
            statement(SAVE_LAST_VERSION, { last_version: last }),
            signal,
          );
        }
        await session.run(
          statement(INSERT_MESSAGE, {
            message_id: messageId,
            kind: draft.kind,
            body: JSON.stringify(draft.body),
            created_at: this.#clock.now(),
          }),
          signal,
        );
        return messageId;
      }, signal),
    );
  }

  /**
   * Up to `limit` messages to send now, oldest first: those never sent, and those sent
   * `RESEND_AFTER_MS` or longer ago without an ack. Each is marked sent now.
   */
  async takeDue(
    limit: number,
    signal: AbortSignal,
  ): Promise<readonly OutboxItem[]> {
    if (!Number.isSafeInteger(limit) || limit < 1) {
      throw new RangeError("The limit must be a positive whole number.");
    }
    return this.#guard(signal, "The outbox could not be read.", () =>
      this.#layer.transaction(async (session) => {
        const now = this.#clock.now();
        const cutoff = now - RESEND_AFTER_MS;
        const rows = await session.all(
          statement(SELECT_DUE, { cutoff, limit }),
          signal,
        );
        const items = rows.map(itemOf);
        const lastSeq = rows.at(-1)?.seq;
        if (typeof lastSeq === "number") {
          await session.run(
            statement(MARK_SENT, { now, cutoff, last_seq: lastSeq }),
            signal,
          );
        }
        return items;
      }, signal),
    );
  }

  /** Clears a message on its ack. Resolves false when no such message waits (a repeated ack). */
  async acknowledge(messageId: string, signal: AbortSignal): Promise<boolean> {
    const deleted = await this.#guard(
      signal,
      "The ack could not be recorded.",
      () =>
        this.#layer.run(
          statement(DELETE_MESSAGE, { message_id: messageId }),
          signal,
        ),
    );
    return deleted > 0;
  }

  /**
   * A taken message's write has finished: its `RESEND_AFTER_MS` counts from now, not from when it
   * was taken, so a slow write does not make it due again at once (round 3). A message never taken
   * or already acked is left as it is.
   */
  async markWritten(messageId: string, signal: AbortSignal): Promise<void> {
    await this.#guard(signal, "The outbox could not be updated.", () =>
      this.#layer.run(
        statement(MARK_WRITTEN, {
          now: this.#clock.now(),
          message_id: messageId,
        }),
        signal,
      ),
    );
  }

  /** Makes every unacked message due now, so a new session sends them all again, oldest first. */
  async markAllUnsent(signal: AbortSignal): Promise<void> {
    await this.#guard(signal, "The outbox could not be updated.", () =>
      this.#layer.run(statement(MARK_ALL_UNSENT), signal),
    );
  }

  /** How many messages wait for their ack (the heartbeat's outbox depth). */
  async depth(signal: AbortSignal): Promise<number> {
    const row = await this.#guard(signal, "The outbox could not be read.", () =>
      this.#layer.get(statement(COUNT_MESSAGES), signal),
    );
    const depth = row?.depth;
    if (typeof depth !== "number") {
      throw unavailable("The outbox could not be read.");
    }
    return depth;
  }

  /** Lets the work already queued finish, then closes the file. */
  async close(): Promise<void> {
    await this.#layer.close();
  }

  // The Query layer's failures become this store's own; an abort and the caller's own failures
  // pass through unchanged.
  async #guard<T>(
    signal: AbortSignal,
    message: string,
    work: () => Promise<T>,
  ): Promise<T> {
    try {
      return await work();
    } catch (error) {
      signal.throwIfAborted();
      if (error instanceof QueryLayerError) {
        throw unavailable(message, error);
      }
      throw error;
    }
  }
}

async function readLastVersion(
  session: SqlSession,
  signal: AbortSignal,
): Promise<number> {
  const row = await session.get(statement(READ_LAST_VERSION), signal);
  const last = row?.last_version;
  if (typeof last !== "number") {
    throw unavailable("The outbox's version counter could not be read.");
  }
  return last;
}

// No cause is kept for a row that does not parse: JSON's error quotes the text it read.
function itemOf(row: SqlRow): OutboxItem {
  const messageId = row.message_id;
  const kind = row.kind;
  if (
    typeof messageId !== "string" ||
    typeof kind !== "string" ||
    !isKnownKind(kind) ||
    typeof row.body !== "string"
  ) {
    throw unreadableRow();
  }
  let body: unknown;
  try {
    body = JSON.parse(row.body);
  } catch {
    throw unreadableRow();
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw unreadableRow();
  }
  return { messageId, kind, body: body as OutboxBody };
}

function isKnownKind(kind: string): kind is OutboxKind {
  return KNOWN_KINDS.has(kind);
}

function unreadableRow(): OutboxStoreError {
  return unavailable("The outbox holds a message this store did not write.");
}

// Takes the file's lock and keeps it: in exclusive locking mode, SQLite holds the lock it takes for
// the connection's life. A lock another process holds answers SQLITE_BUSY: the file is in use.
async function holdFile(layer: QueryLayer, signal: AbortSignal): Promise<void> {
  try {
    for (const sql of [
      "PRAGMA locking_mode = EXCLUSIVE",
      "BEGIN EXCLUSIVE",
      "COMMIT",
    ]) {
      await layer.run({ sql, params: {} }, signal);
    }
  } catch (error) {
    await layer.close();
    signal.throwIfAborted();
    throw lockHeldElsewhere(error)
      ? new OutboxStoreError("in_use", "Another process holds the outbox file.")
      : unavailable("The outbox file could not be locked.", error);
  }
}

function lockHeldElsewhere(error: unknown): boolean {
  let current: unknown = error;
  while (typeof current === "object" && current !== null) {
    const { errcode, cause } = current as {
      errcode?: unknown;
      cause?: unknown;
    };
    if (
      typeof errcode === "number" &&
      LOCK_HELD_CODES.has(errcode & PRIMARY_CODE_MASK)
    ) {
      return true;
    }
    current = cause;
  }
  return false;
}

function unavailable(message: string, cause?: unknown): OutboxStoreError {
  return new OutboxStoreError(
    "unavailable",
    message,
    cause === undefined ? undefined : { cause },
  );
}

function statement(sql: string, params: SqlParams = {}): SqlStatement {
  return { sql, params };
}
