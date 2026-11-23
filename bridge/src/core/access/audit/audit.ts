// The Audit (CP-11b, T046; PT-23, PT-33): one record per audited change, written in the
// transaction of the change it records.
//
// - **The caller's transaction.** `recordEventIngested` takes the session of the transaction that
//   writes the event and opens none of its own. The Query layer's errors pass through unchanged.
// - **Identifiers only.** An entry names the event, its location and its place in the log. It
//   never holds a name, a summary or any other content (FR-034).
// - **Chains.** Every entry belongs to one retention class, its chain, and has its own order
//   there: `(chain, seq)`. Iteration 002 writes `event_ingested` entries on `events-30d`.
// - **Iteration 004** adds the hash chain as nullable columns, with the anchor and the write-once
//   copy. Entries written now keep their rows: the chain starts from an anchor at its first
//   hashed entry (PT-19, PT-33).
import { z } from "zod";
import type { Clock } from "../../../utilities/clock/index.ts";
import {
  keysetPageStatement,
  upsertStatement,
} from "../../../utilities/query-layer/index.ts";
import type {
  SqlRow,
  SqlSession,
} from "../../../utilities/query-layer/index.ts";

/** The chain of the per-event entries, kept as long as events are: 30 days. */
export const EVENTS_CHAIN = "events-30d";
/** The kind of the entry written for every ingested event (PT-23). */
export const EVENT_INGESTED = "event_ingested";
/** The most entries one read returns. */
export const MAX_ENTRIES_PER_READ = 500;

const ENTRY_COLUMNS = [
  "chain",
  "seq",
  "kind",
  "event_id",
  "location_id",
  "event_seq",
  "ts",
] as const;

/** The event an `event_ingested` entry names. */
export interface IngestedEvent {
  readonly event_id: string;
  readonly location_id: string;
  /** The event's place in its location's log. */
  readonly event_seq: number;
}

/** An `event_ingested` entry as the audit holds it. */
export interface EventIngestedEntry extends IngestedEvent {
  readonly chain: typeof EVENTS_CHAIN;
  /** The entry's place in its chain. */
  readonly seq: number;
  readonly kind: typeof EVENT_INGESTED;
  /** When it was written, on the core's clock, in epoch milliseconds. */
  readonly ts: number;
}

/** What the Audit is made over. */
export interface AuditOptions {
  readonly clock: Clock;
}

const COUNTER_ROW = z.object({ next_seq: z.number().int() });
const ENTRY_ROW = z.object({
  chain: z.literal(EVENTS_CHAIN),
  seq: z.number().int(),
  kind: z.literal(EVENT_INGESTED),
  event_id: z.string(),
  location_id: z.string(),
  event_seq: z.number().int(),
  ts: z.number().int(),
});

const MOVE_COUNTER =
  "UPDATE audit_chain SET next_seq = next_seq + 1 WHERE chain = @chain";
const SELECT_COUNTER = "SELECT next_seq FROM audit_chain WHERE chain = @chain";
const INSERT_ENTRY = `INSERT INTO audit_entry (${ENTRY_COLUMNS.join(", ")}) VALUES (${ENTRY_COLUMNS.map(
  (column) => `@${column}`,
).join(", ")})`;

/** The audit holds a row this accessor did not write. The message names the table, never a value. */
export class AuditError extends Error {
  constructor(table: string) {
    super(`The Audit cannot read a row of ${table}.`);
    this.name = "AuditError";
  }
}

function parsed<Row>(schema: z.ZodType<Row>, row: SqlRow, table: string): Row {
  const result = schema.safeParse(row);
  if (!result.success) {
    throw new AuditError(table);
  }
  return result.data;
}

/** The Audit. One per core process; it holds no connection of its own. */
export class Audit {
  readonly #clock: Clock;

  constructor(options: AuditOptions) {
    this.#clock = options.clock;
  }

  async purgeEventsBefore(
    session: SqlSession,
    cutoff: number,
    signal: AbortSignal,
  ): Promise<void> {
    await session.run(
      {
        sql: "DELETE FROM audit_entry WHERE chain=@chain AND ts < @cutoff",
        params: { chain: EVENTS_CHAIN, cutoff },
      },
      signal,
    );
    const now = this.#clock.now();
    await session.run(
      {
        sql: "DELETE FROM media_access_log WHERE ts<@cutoff",
        params: { cutoff: now - 90 * 86_400_000 },
      },
      signal,
    );
    await session.run(
      {
        sql: "DELETE FROM media_ticket WHERE expires_at<=@now",
        params: { now },
      },
      signal,
    );
  }

  /** Writes the entry for an event the log has just taken, inside the caller's transaction. */
  async recordEventIngested(
    session: SqlSession,
    event: IngestedEvent,
    signal: AbortSignal,
  ): Promise<EventIngestedEntry> {
    const entry: EventIngestedEntry = {
      chain: EVENTS_CHAIN,
      seq: await this.#nextSeq(session, EVENTS_CHAIN, signal),
      kind: EVENT_INGESTED,
      event_id: event.event_id,
      location_id: event.location_id,
      event_seq: event.event_seq,
      ts: this.#clock.now(),
    };
    await session.run({ sql: INSERT_ENTRY, params: { ...entry } }, signal);
    return entry;
  }

  /**
   * The `event_ingested` entries after `afterSeq` in their chain, in order, at most `limit` of
   * them (and never more than `MAX_ENTRIES_PER_READ`). 0 reads from the chain's start.
   */
  async eventEntriesAfter(
    session: SqlSession,
    query: { readonly afterSeq: number; readonly limit: number },
    signal: AbortSignal,
  ): Promise<readonly EventIngestedEntry[]> {
    const rows = await session.all(
      keysetPageStatement(session.dialect, {
        table: "audit_entry",
        columns: ENTRY_COLUMNS,
        key: "seq",
        after: query.afterSeq,
        limit: Math.min(query.limit, MAX_ENTRIES_PER_READ),
        where: {
          sql: "chain = @chain AND kind = @kind",
          params: { chain: EVENTS_CHAIN, kind: EVENT_INGESTED },
        },
      }),
      signal,
    );
    return rows.map((row) => parsed(ENTRY_ROW, row, "audit_entry"));
  }

  // Takes the chain's next `seq`. The counter's row is made on the chain's first entry; the
  // update then locks it until the caller's transaction ends, and a rollback gives the seq back.
  async #nextSeq(
    session: SqlSession,
    chain: string,
    signal: AbortSignal,
  ): Promise<number> {
    await session.run(
      upsertStatement(session.dialect, {
        table: "audit_chain",
        key: ["chain"],
        values: { chain, next_seq: 1 },
        onConflict: "ignore",
      }),
      signal,
    );
    await session.run({ sql: MOVE_COUNTER, params: { chain } }, signal);
    const row = await session.get(
      { sql: SELECT_COUNTER, params: { chain } },
      signal,
    );
    if (row === undefined) {
      throw new AuditError("audit_chain");
    }
    return parsed(COUNTER_ROW, row, "audit_chain").next_seq - 1;
  }
}
