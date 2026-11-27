// The Outbox Store (CP-08a, T014): the home's durable queue of messages for the core, in the
// connector's own SQLite file (DS3). A message is written before it is sent, sent at least once,
// resent after 10 s without an ack, sent again oldest first after a reconnect, and cleared only on
// its ack (AC B10, OR5, FR-042, PT-30). It also keeps the home's `state_version` counter, so
// versions keep increasing across a restart.
//
// Events (T043; FR-042, SC-002) are held the same way, until the core's ack for their event id,
// with two differences: at most `EVENT_WINDOW` are sent and unacked at one time, and an unacked
// event is sent again after 10 s, then after waits that double up to 5 minutes, with jitter.
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

/** The most events sent and not yet acked at one time: the send window (T043) [P]. */
export const EVENT_WINDOW = 50;
/** An event's first wait for its ack before it is sent again. */
export const EVENT_RESEND_FIRST_MS = 10_000;
/** The longest an event waits between two sends: the wait doubles up to this. */
export const EVENT_RESEND_MAX_MS = 300_000;
/** How far the jitter moves a wait, as a share of it, either way [P]. */
export const EVENT_RESEND_JITTER = 0.2;

/** The state messages that go through the outbox; `takeDue` hands these out. */
export type OutboxKind = "inventory" | "device_state" | "catchup_done";

/** An event waiting for its ack. Its `eventId` is the link's `message_id` for it. */
export interface OutboxEvent {
  readonly eventId: string;
  readonly body: OutboxBody;
}

/** The events waiting for their ack, as the heartbeat reports them. */
export interface EventBacklog {
  readonly count: number;
  /** How long the oldest of them has waited since it was written; `null` when none waits. */
  readonly oldestAgeMs: number | null;
}

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
  /** A number from 0 up to 1 for the resend jitter; `Math.random` when left out. */
  readonly random?: () => number;
}

/** SQLite's primary result codes for a lock another connection holds: SQLITE_BUSY, SQLITE_LOCKED. */
const LOCK_HELD_CODES: ReadonlySet<number> = new Set([5, 6]);
const PRIMARY_CODE_MASK = 0xff;

const KNOWN_KINDS: ReadonlySet<string> = new Set<OutboxKind>([
  "inventory",
  "device_state",
  "catchup_done",
]);

// A row of a kind this release does not know (a newer release wrote it, then was rolled back) stays
// in place: it is counted in the depth but never sent by this code (code N-1 on schema N, DS5).
// A marker closes only the events before it. It waits for their acks; following events wait
// for its own ack. Inventory may still pass either barrier, including during a reconnect.
const IS_KNOWN_KIND = `(kind IN ('inventory','device_state') OR (kind = 'catchup_done' AND NOT EXISTS
  (SELECT 1 FROM outbox AS older WHERE older.seq < outbox.seq AND older.kind IN ('event','catchup_done'))))`;
const BEFORE_MARKER =
  "NOT EXISTS (SELECT 1 FROM outbox AS marker WHERE marker.kind='catchup_done' AND marker.seq < outbox.seq)";
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
const MARK_ALL_UNSENT =
  "UPDATE outbox SET sent_at = NULL WHERE sent_at IS NOT NULL";
const COUNT_MESSAGES = "SELECT COUNT(*) AS depth FROM outbox";

const SELECT_MESSAGE_ID =
  "SELECT message_id FROM outbox WHERE message_id = @message_id";
const INSERT_EVENT =
  "INSERT INTO outbox (message_id, kind, body, created_at) VALUES (@message_id, 'event', @body, @created_at)";
const SELECT_EVENTS_TO_RESEND =
  "SELECT seq, message_id, body, attempts FROM outbox WHERE kind = 'event' AND sent_at IS NOT NULL AND due_at <= @now ORDER BY seq";
const COUNT_EVENTS_IN_FLIGHT =
  "SELECT COUNT(*) AS in_flight FROM outbox WHERE kind = 'event' AND sent_at IS NOT NULL";
const SELECT_NEW_EVENTS = `SELECT seq, message_id, body, attempts FROM outbox WHERE kind = 'event' AND sent_at IS NULL AND ${BEFORE_MARKER} ORDER BY seq LIMIT @limit`;
const MARK_EVENT_SENT =
  "UPDATE outbox SET sent_at = @now, attempts = @attempts, due_at = @due_at WHERE seq = @seq";
const MARK_EVENT_WRITTEN =
  "UPDATE outbox SET due_at = @now + (due_at - sent_at), sent_at = @now WHERE message_id = @message_id AND kind = 'event' AND sent_at IS NOT NULL";
const MARK_STATE_WRITTEN =
  "UPDATE outbox SET sent_at = @now WHERE message_id = @message_id AND kind <> 'event' AND sent_at IS NOT NULL";
const MARK_ALL_UNSENT_EVENTS =
  "UPDATE outbox SET attempts = 0, due_at = NULL WHERE kind = 'event'";
const EVENT_BACKLOG =
  "SELECT COUNT(*) AS waiting, MIN(created_at) AS oldest FROM outbox WHERE kind = 'event'";

/** The home's outbox. One instance per connector process, over its own file. */
export class OutboxStore {
  readonly #layer: QueryLayer;
  readonly #clock: Clock;
  readonly #random: () => number;

  private constructor(layer: QueryLayer, clock: Clock, random: () => number) {
    this.#layer = layer;
    this.#clock = clock;
    this.#random = random;
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
    return new OutboxStore(layer, options.clock, options.random ?? Math.random);
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

  /**
   * Writes one event, held until the core's ack for its event id. `compose` builds its body and
   * draws the state versions it carries; the event and the counter are saved together. An event
   * already waiting is left as it is and reported as `duplicate`, and `compose` is not called.
   */
  async appendEvent(
    eventId: string,
    compose: (versions: StateVersions) => OutboxBody,
    signal: AbortSignal,
  ): Promise<"written" | "duplicate"> {
    return this.#guard(signal, "The event could not be written.", () =>
      this.#layer.transaction(async (session) => {
        const held = await session.get(
          statement(SELECT_MESSAGE_ID, { message_id: eventId }),
          signal,
        );
        if (held !== undefined) {
          return "duplicate";
        }
        const first = await readLastVersion(session, signal);
        let last = first;
        const body = compose({
          next: () => {
            last += 1;
            return last;
          },
        });
        if (last !== first) {
          await session.run(
            statement(SAVE_LAST_VERSION, { last_version: last }),
            signal,
          );
        }
        await session.run(
          statement(INSERT_EVENT, {
            message_id: eventId,
            body: JSON.stringify(body),
            created_at: this.#clock.now(),
          }),
          signal,
        );
        return "written";
      }, signal),
    );
  }

  /**
   * The events to send now, oldest first:
   * - those sent before whose wait for an ack has passed: 10 s after the first send, doubling to
   *   5 minutes, each wait moved by the jitter;
   * - then new ones, as many as keep the events sent and not yet acked within `EVENT_WINDOW`.
   *
   * Each is marked sent now.
   */
  async takeDueEvents(signal: AbortSignal): Promise<readonly OutboxEvent[]> {
    return this.#guard(signal, "The outbox could not be read.", () =>
      this.#layer.transaction(async (session) => {
        const now = this.#clock.now();
        const again = await session.all(
          statement(SELECT_EVENTS_TO_RESEND, { now }),
          signal,
        );
        const flying = await session.get(
          statement(COUNT_EVENTS_IN_FLIGHT),
          signal,
        );
        const inFlight = flying?.in_flight;
        if (typeof inFlight !== "number") {
          throw unreadableRow();
        }
        const room = Math.max(0, EVENT_WINDOW - inFlight);
        const fresh =
          room === 0
            ? []
            : await session.all(
                statement(SELECT_NEW_EVENTS, { limit: room }),
                signal,
              );
        const rows = [...again, ...fresh];
        for (const row of rows) {
          await this.#markEventSent(session, row, now, signal);
        }
        return rows.map(eventOf);
      }, signal),
    );
  }

  /** Installation baseline for cameras without a checkpoint, or undefined before tracking begins. */
  async catchupStart(signal: AbortSignal): Promise<number | undefined> {
    const row = await this.#guard(signal, "The outbox could not be read.", () =>
      this.#layer.get(
        statement("SELECT last_event_at FROM catchup_mark WHERE mark_id = 1"),
        signal,
      ),
    );
    const at = row?.last_event_at;
    return typeof at === "number" ? at : undefined;
  }

  /** Records the baseline once, including when two initial reads overlap. */
  async startCatchup(at: number, signal: AbortSignal): Promise<void> {
    await this.#guard(signal, "The outbox could not be written.", () =>
      this.#layer.run(
        statement(
          `INSERT INTO catchup_mark (mark_id, last_event_at) VALUES (1, @at)
           ON CONFLICT (mark_id) DO NOTHING`,
          { at },
        ),
        signal,
      ),
    );
  }

  /** Coalesce repeated checks while a marker already covers the tail of the event queue. */
  async finishCatchup(signal: AbortSignal): Promise<void> {
    await this.#guard(signal, "The recovery marker could not be written.", () =>
      this.#layer.run(
        statement(
          `INSERT INTO outbox (message_id,kind,body,created_at)
         SELECT @id,'catchup_done','{}',@now WHERE COALESCE(
          (SELECT kind FROM outbox WHERE kind IN ('event','catchup_done') ORDER BY seq DESC LIMIT 1),'') <> 'catchup_done'`,
          { id: randomUUID(), now: this.#clock.now() },
        ),
        signal,
      ),
    );
  }

  /** The end of each camera's last complete history read, in UTC milliseconds. */
  async cameraCheckpoints(
    signal: AbortSignal,
  ): Promise<ReadonlyMap<string, number>> {
    const rows = await this.#guard(
      signal,
      "The outbox could not be read.",
      () =>
        this.#layer.all(
          statement(
            "SELECT camera_id, scanned_at FROM camera_history_checkpoint",
          ),
          signal,
        ),
    );
    const checkpoints = new Map<string, number>();
    for (const row of rows) {
      if (
        typeof row.camera_id !== "string" ||
        typeof row.scanned_at !== "number"
      )
        throw unreadableRow();
      checkpoints.set(row.camera_id, row.scanned_at);
    }
    return checkpoints;
  }

  async checkpointCamera(
    cameraId: string,
    at: number,
    signal: AbortSignal,
  ): Promise<void> {
    await this.#guard(signal, "The outbox could not be written.", () =>
      this.#layer.run(
        statement(
          `INSERT INTO camera_history_checkpoint(camera_id, scanned_at) VALUES (@cameraId, @at)
         ON CONFLICT(camera_id) DO UPDATE SET scanned_at = MAX(scanned_at, excluded.scanned_at)`,
          { cameraId, at },
        ),
        signal,
      ),
    );
  }

  /** The events waiting for their ack, and how long the oldest has waited (the heartbeat's backlog). */
  async eventBacklog(signal: AbortSignal): Promise<EventBacklog> {
    const row = await this.#guard(signal, "The outbox could not be read.", () =>
      this.#layer.get(statement(EVENT_BACKLOG), signal),
    );
    const count = row?.waiting;
    const oldest = row?.oldest;
    if (typeof count !== "number") {
      throw unavailable("The outbox could not be read.");
    }
    return {
      count,
      oldestAgeMs:
        typeof oldest === "number"
          ? Math.max(0, this.#clock.now() - oldest)
          : null,
    };
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
      this.#layer.transaction(async (session) => {
        const params = { now: this.#clock.now(), message_id: messageId };
        // An event keeps its own wait, counted from now.
        await session.run(statement(MARK_EVENT_WRITTEN, params), signal);
        await session.run(statement(MARK_STATE_WRITTEN, params), signal);
      }, signal),
    );
  }

  /** Makes every unacked message due now, so a new session sends them all again, oldest first. */
  async markAllUnsent(signal: AbortSignal): Promise<void> {
    await this.#guard(signal, "The outbox could not be updated.", () =>
      this.#layer.transaction(async (session) => {
        await session.run(statement(MARK_ALL_UNSENT), signal);
        // A new session starts each event's backoff again.
        await session.run(statement(MARK_ALL_UNSENT_EVENTS), signal);
      }, signal),
    );
  }

  // Marks one event sent now, with its next send time: 10 s after the first send, doubling with
  // each later one up to 5 minutes, moved by the jitter so resends do not line up.
  async #markEventSent(
    session: SqlSession,
    row: SqlRow,
    now: number,
    signal: AbortSignal,
  ): Promise<void> {
    const { seq, attempts } = row;
    if (typeof seq !== "number" || typeof attempts !== "number") {
      throw unreadableRow();
    }
    const wait = Math.min(
      EVENT_RESEND_FIRST_MS * 2 ** attempts,
      EVENT_RESEND_MAX_MS,
    );
    const jitter = 1 + EVENT_RESEND_JITTER * (2 * this.#random() - 1);
    await session.run(
      statement(MARK_EVENT_SENT, {
        seq,
        now,
        attempts: attempts + 1,
        due_at: now + Math.round(wait * jitter),
      }),
      signal,
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

function eventOf(row: SqlRow): OutboxEvent {
  const eventId = row.message_id;
  if (typeof eventId !== "string" || typeof row.body !== "string") {
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
  return { eventId, body: body as OutboxBody };
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
