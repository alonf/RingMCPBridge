// The Event Log and the Audit (T046) on SQLite and on SQL Server, each inside a transaction the
// test opens, as the Event manager will: the order per location, a duplicate event id reported
// and not written twice, no gap in either sequence after a rolled-back write, and the audit
// entry's identifiers.
import { expect, it } from "vitest";
import {
  Audit,
  EVENT_INGESTED,
  EVENTS_CHAIN,
} from "../../src/core/access/audit/index.ts";
import {
  EventLog,
  FIRST_LOG_EPOCH,
} from "../../src/core/access/event-log/index.ts";
import type {
  AppendOutcome,
  EventRecord,
} from "../../src/core/access/event-log/index.ts";
import { FakeClock } from "../../src/utilities/clock/index.ts";
import {
  CORE_MIGRATIONS,
  runMigrations,
} from "../../src/utilities/query-layer/index.ts";
import type { QueryLayer } from "../../src/utilities/query-layer/index.ts";
import { describeStoreMatrix, requireSqlServerInCi } from "../support/index.ts";

const START = Date.UTC(2026, 10, 17, 9, 0, 0);
const HEBREW_SUMMARY = "דלת כניסה נפתחה";
const ALL = 100;

function never(): AbortSignal {
  return new AbortController().signal;
}

function event(id: string, changes: Partial<EventRecord> = {}): EventRecord {
  return {
    event_id: id,
    location_id: "loc-1",
    kind: "contact.open",
    priority: "HIGH",
    occurred_at: START - 2_000,
    received_at: START - 1_000,
    device_id: "d-door",
    summary: HEBREW_SUMMARY,
    late: false,
    ...changes,
  };
}

class Rollback extends Error {}

requireSqlServerInCi();

describeStoreMatrix("the Event Log and the Audit", (store) => {
  async function setUp(): Promise<{
    layer: QueryLayer;
    clock: FakeClock;
    log: EventLog;
    audit: Audit;
    /** One event written as the Event manager will: the log and the audit in one transaction. */
    ingest(record: EventRecord, fail?: boolean): Promise<AppendOutcome>;
    seqs(locationId: string): Promise<readonly number[]>;
  }> {
    const clock = new FakeClock(START);
    const layer = await store.emptyDatabase();
    await runMigrations(layer, CORE_MIGRATIONS, { clock }, never());
    const log = new EventLog({ clock });
    const audit = new Audit({ clock });
    return {
      layer,
      clock,
      log,
      audit,
      ingest: (record, fail = false) =>
        layer.transaction(async (session) => {
          const outcome = await log.append(session, record, never());
          if (outcome.kind === "appended") {
            await audit.recordEventIngested(
              session,
              {
                event_id: record.event_id,
                location_id: record.location_id,
                event_seq: outcome.seq,
              },
              never(),
            );
          }
          if (fail) {
            throw new Rollback();
          }
          return outcome;
        }, never()),
      seqs: async (locationId) =>
        (
          await log.after(
            layer,
            { location_id: locationId, afterSeq: 0, limit: ALL },
            never(),
          )
        ).map((stored) => stored.seq),
    };
  }

  it("stores an event with its place in the log and reads it back as written", async () => {
    const test = await setUp();
    const record = event("evt-1", { data: { ring_kind: "new_ring_thing" } });

    await expect(test.ingest(record)).resolves.toEqual({
      kind: "appended",
      seq: 1,
      epoch: FIRST_LOG_EPOCH,
      stored_at: START,
    });

    await expect(
      test.log.after(
        test.layer,
        { location_id: "loc-1", afterSeq: 0, limit: ALL },
        never(),
      ),
    ).resolves.toEqual([{ ...record, seq: 1, stored_at: START }]);
  });

  it("stores an event with no device and no data, and a late one", async () => {
    const test = await setUp();
    const health: EventRecord = {
      event_id: "evt-1",
      location_id: "loc-1",
      kind: "health.home_offline",
      priority: "HIGH",
      occurred_at: START - 2_000,
      received_at: START - 1_000,
      summary: "The home is offline.",
      late: true,
    };

    await test.ingest(health);

    const [stored] = await test.log.after(
      test.layer,
      { location_id: "loc-1", afterSeq: 0, limit: ALL },
      never(),
    );
    expect(stored).toEqual({ ...health, seq: 1, stored_at: START });
    expect(stored).not.toHaveProperty("device_id");
    expect(stored).not.toHaveProperty("data");
  });

  it("keeps each location's own order, whatever order the locations' events arrive in", async () => {
    const test = await setUp();

    await test.ingest(event("a-1"));
    await test.ingest(event("b-1", { location_id: "loc-2" }));
    await test.ingest(event("a-2"));
    await test.ingest(event("b-2", { location_id: "loc-2" }));
    await test.ingest(event("a-3"));

    const first = await test.log.after(
      test.layer,
      { location_id: "loc-1", afterSeq: 0, limit: ALL },
      never(),
    );
    expect(first.map((stored) => [stored.event_id, stored.seq])).toEqual([
      ["a-1", 1],
      ["a-2", 2],
      ["a-3", 3],
    ]);
    await expect(test.seqs("loc-2")).resolves.toEqual([1, 2]);
  });

  it("reads after a seq, and no more than the limit", async () => {
    const test = await setUp();
    for (const id of ["e-1", "e-2", "e-3", "e-4"]) {
      await test.ingest(event(id));
    }

    const page = await test.log.after(
      test.layer,
      { location_id: "loc-1", afterSeq: 1, limit: 2 },
      never(),
    );

    expect(page.map((stored) => stored.seq)).toEqual([2, 3]);
  });

  it("reports an event already in the log as a duplicate, and writes neither it nor an audit entry again", async () => {
    const test = await setUp();
    await test.ingest(event("evt-1"));
    await test.ingest(event("evt-2"));

    await expect(
      test.ingest(event("evt-1", { summary: "another text" })),
    ).resolves.toEqual({ kind: "duplicate", location_id: "loc-1", seq: 1 });

    await expect(test.seqs("loc-1")).resolves.toEqual([1, 2]);
    await expect(
      test.audit.eventEntriesAfter(
        test.layer,
        { afterSeq: 0, limit: ALL },
        never(),
      ),
    ).resolves.toHaveLength(2);
    // The next event takes the next place: the duplicate used none.
    await expect(test.ingest(event("evt-3"))).resolves.toMatchObject({
      seq: 3,
    });
  });

  it("closes a recovery group and replays its receipt without claiming a newer group", async () => {
    const test = await setUp();
    await test.ingest(event("late-1", { late: true }));
    const close = (marker: string) =>
      test.layer.transaction(
        (sql) => test.log.finishRecovery(sql, marker, never()),
        never(),
      );
    await test.layer.transaction(
      (sql) => test.log.markForRecovery(sql, "late-1", "owned", never()),
      never(),
    );
    expect(await close("marker-1")).toMatchObject([
      {
        location_id: "loc-1",
        ownership: "owned",
        total: 1,
        rank_value: 2,
        seq_from: 1,
        seq_to: 1,
      },
    ]);
    await test.ingest(event("late-2", { late: true, priority: "LOW" }));
    await test.layer.transaction(
      (sql) => test.log.markForRecovery(sql, "late-2", "shared", never()),
      never(),
    );
    expect(await close("marker-1")).toEqual([]);
    expect(await close("marker-2")).toMatchObject([
      { ownership: "shared", total: 1, rank_value: 0, seq_from: 2, seq_to: 2 },
    ]);
  });

  it("leaves no gap in the log or the audit after a rolled-back write", async () => {
    const test = await setUp();
    await test.ingest(event("evt-1"));

    await expect(test.ingest(event("evt-lost"), true)).rejects.toBeInstanceOf(
      Rollback,
    );
    // A rolled-back first event of a location leaves no counter behind either.
    await expect(
      test.ingest(event("other-lost", { location_id: "loc-2" }), true),
    ).rejects.toBeInstanceOf(Rollback);
    await test.ingest(event("evt-2"));
    await test.ingest(event("other-1", { location_id: "loc-2" }));

    await expect(test.seqs("loc-1")).resolves.toEqual([1, 2]);
    await expect(test.seqs("loc-2")).resolves.toEqual([1]);
    const entries = await test.audit.eventEntriesAfter(
      test.layer,
      { afterSeq: 0, limit: ALL },
      never(),
    );
    expect(entries.map((entry) => [entry.seq, entry.event_id])).toEqual([
      [1, "evt-1"],
      [2, "evt-2"],
      [3, "other-1"],
    ]);
  });

  it("writes one audit entry per event, with identifiers only", async () => {
    const test = await setUp();
    await test.ingest(event("evt-1"));
    await test.clock.advance(5_000);
    await test.ingest(event("evt-2", { location_id: "loc-2" }));

    const entries = await test.audit.eventEntriesAfter(
      test.layer,
      { afterSeq: 0, limit: ALL },
      never(),
    );

    expect(entries).toEqual([
      {
        chain: EVENTS_CHAIN,
        seq: 1,
        kind: EVENT_INGESTED,
        event_id: "evt-1",
        location_id: "loc-1",
        event_seq: 1,
        ts: START,
      },
      {
        chain: EVENTS_CHAIN,
        seq: 2,
        kind: EVENT_INGESTED,
        event_id: "evt-2",
        location_id: "loc-2",
        event_seq: 1,
        ts: START + 5_000,
      },
    ]);
    const rows = await test.layer.all(
      { sql: "SELECT * FROM audit_entry", params: {} },
      never(),
    );
    expect(JSON.stringify(rows)).not.toContain(HEBREW_SUMMARY);
  });
});
