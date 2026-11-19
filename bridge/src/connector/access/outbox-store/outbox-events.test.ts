// The Outbox Store's events (T043), on the fake clock: an event is held until the ack for its
// event id, the send window is never exceeded, the resend waits double from 10 s to 5 minutes
// with jitter, an ack clears exactly one event, the backlog is reported, and the queue survives a
// restart.
import { mkdtemp, rm } from "node:fs/promises";
import {
  openSqliteQueryLayer,
  runMigrations,
} from "../../../utilities/query-layer/index.ts";
import { OUTBOX_MIGRATIONS } from "./outbox-migrations.ts";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FakeClock } from "../../../utilities/clock/index.ts";
import {
  EVENT_RESEND_FIRST_MS,
  EVENT_RESEND_JITTER,
  EVENT_RESEND_MAX_MS,
  EVENT_WINDOW,
  OutboxStore,
} from "./index.ts";
import type { OutboxEvent } from "./index.ts";

const START = Date.UTC(2026, 10, 17, 9, 0, 0);
const SUMMARY = "דלת כניסה נפתחה";
const signal = new AbortController().signal;
/** The middle of the jitter's range: a wait is exactly its nominal length. */
const NO_JITTER = 0.5;

let folder: string;
let clock: FakeClock;
let random: number;
const opened: OutboxStore[] = [];

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "outbox-events-"));
  clock = new FakeClock(START);
  random = NO_JITTER;
});

afterEach(async () => {
  for (const store of opened.splice(0)) {
    await store.close();
  }
  await rm(folder, { recursive: true, force: true });
});

async function open(): Promise<OutboxStore> {
  const store = await OutboxStore.open(
    { path: join(folder, "outbox.db"), clock, random: () => random },
    signal,
  );
  opened.push(store);
  return store;
}

function write(
  store: OutboxStore,
  eventId: string,
): Promise<"written" | "duplicate"> {
  return store.appendEvent(
    eventId,
    () => ({ event_id: eventId, summary: SUMMARY }),
    signal,
  );
}

async function writeMany(store: OutboxStore, count: number): Promise<void> {
  for (let index = 1; index <= count; index += 1) {
    await write(store, `evt-${String(index)}`);
  }
}

function idsOf(events: readonly OutboxEvent[]): string[] {
  return events.map((event) => event.eventId);
}

describe("the Outbox Store's events", () => {
  it("holds an event until the ack for its event id, sending it with its body as written", async () => {
    const store = await open();
    await expect(write(store, "evt-1")).resolves.toBe("written");

    await expect(store.takeDueEvents(signal)).resolves.toEqual([
      { eventId: "evt-1", body: { event_id: "evt-1", summary: SUMMARY } },
    ]);
    await expect(store.takeDueEvents(signal)).resolves.toEqual([]);
    await expect(store.eventBacklog(signal)).resolves.toMatchObject({
      count: 1,
    });

    await expect(store.acknowledge("evt-1", signal)).resolves.toBe(true);
    await expect(store.eventBacklog(signal)).resolves.toEqual({
      count: 0,
      oldestAgeMs: null,
    });
    await clock.advance(EVENT_RESEND_MAX_MS);
    await expect(store.takeDueEvents(signal)).resolves.toEqual([]);
  });

  it("writes an event that is already waiting once, and does not compose it again", async () => {
    const store = await open();
    await write(store, "evt-1");
    let composed = 0;

    await expect(
      store.appendEvent(
        "evt-1",
        () => {
          composed += 1;
          return { event_id: "evt-1" };
        },
        signal,
      ),
    ).resolves.toBe("duplicate");

    expect(composed).toBe(0);
    await expect(store.depth(signal)).resolves.toBe(1);
  });

  it("draws an event's state versions from the same counter as the state messages, saved with it", async () => {
    const store = await open();
    await store.append(
      (versions) => ({
        kind: "device_state",
        body: { state_version: versions.next() },
      }),
      signal,
    );
    await store.appendEvent(
      "evt-1",
      (versions) => ({ device_state: { state_version: versions.next() } }),
      signal,
    );

    const [event] = await store.takeDueEvents(signal);
    expect(event?.body).toEqual({ device_state: { state_version: 2 } });
  });

  it("never has more than the window sent and unacked, and sends the next as acks arrive", async () => {
    const store = await open();
    await writeMany(store, EVENT_WINDOW + 5);

    const first = await store.takeDueEvents(signal);
    expect(first).toHaveLength(EVENT_WINDOW);
    expect(idsOf(first).at(0)).toBe("evt-1");
    expect(idsOf(first).at(-1)).toBe(`evt-${String(EVENT_WINDOW)}`);
    await expect(store.takeDueEvents(signal)).resolves.toEqual([]);

    await store.acknowledge("evt-1", signal);
    await store.acknowledge("evt-2", signal);
    await expect(store.takeDueEvents(signal)).resolves.toMatchObject([
      { eventId: `evt-${String(EVENT_WINDOW + 1)}` },
      { eventId: `evt-${String(EVENT_WINDOW + 2)}` },
    ]);

    // A resend is not a new place in the window: the unacked ones go again, and no new one.
    await clock.advance(EVENT_RESEND_FIRST_MS);
    const again = await store.takeDueEvents(signal);
    expect(again).toHaveLength(EVENT_WINDOW);
    expect(idsOf(again).at(0)).toBe("evt-3");
  });

  it("sends an unacked event again after 10 s, then after waits that double up to 5 minutes", async () => {
    const store = await open();
    await write(store, "evt-1");
    await store.takeDueEvents(signal);
    const waits: number[] = [];

    for (let send = 0; send < 8; send += 1) {
      let waited = 0;
      while ((await store.takeDueEvents(signal)).length === 0) {
        await clock.advance(1_000);
        waited += 1_000;
      }
      waits.push(waited);
    }

    expect(waits).toEqual([
      10_000, 20_000, 40_000, 80_000, 160_000, 300_000, 300_000, 300_000,
    ]);
  });

  it.each([
    ["at its shortest", 0, 1 - EVENT_RESEND_JITTER],
    ["at its longest", 0.999_999, 1 + EVENT_RESEND_JITTER],
  ])("moves a wait by the jitter, %s", async (_title, drawn, share) => {
    const store = await open();
    random = drawn;
    await write(store, "evt-1");
    await store.takeDueEvents(signal);
    const wait = Math.round(EVENT_RESEND_FIRST_MS * share);

    await clock.advance(wait - 1_000);
    await expect(store.takeDueEvents(signal)).resolves.toEqual([]);
    await clock.advance(1_000);
    await expect(store.takeDueEvents(signal)).resolves.toHaveLength(1);
  });

  it("clears exactly one event on its ack, and none on an ack for an event it does not hold", async () => {
    const store = await open();
    await writeMany(store, 3);
    await store.takeDueEvents(signal);

    await expect(store.acknowledge("evt-2", signal)).resolves.toBe(true);
    await expect(store.acknowledge("evt-2", signal)).resolves.toBe(false);
    await expect(store.acknowledge("evt-9", signal)).resolves.toBe(false);

    await clock.advance(EVENT_RESEND_FIRST_MS);
    expect(idsOf(await store.takeDueEvents(signal))).toEqual([
      "evt-1",
      "evt-3",
    ]);
  });

  it("counts an event's wait from when its write finished, keeping the wait's length", async () => {
    const store = await open();
    await write(store, "evt-1");
    await store.takeDueEvents(signal);

    await clock.advance(4_000);
    await store.markWritten("evt-1", signal);

    await clock.advance(EVENT_RESEND_FIRST_MS - 1_000);
    await expect(store.takeDueEvents(signal)).resolves.toEqual([]);
    await clock.advance(1_000);
    await expect(store.takeDueEvents(signal)).resolves.toHaveLength(1);
  });

  it("sends every unacked event again at once in a new session, oldest first, with its backoff started again", async () => {
    const store = await open();
    await writeMany(store, 3);
    await store.takeDueEvents(signal);
    await clock.advance(EVENT_RESEND_FIRST_MS);
    await store.takeDueEvents(signal);

    await store.markAllUnsent(signal);

    expect(idsOf(await store.takeDueEvents(signal))).toEqual([
      "evt-1",
      "evt-2",
      "evt-3",
    ]);
    await clock.advance(EVENT_RESEND_FIRST_MS);
    await expect(store.takeDueEvents(signal)).resolves.toHaveLength(3);
  });

  it("reports the backlog: how many events wait, and how long the oldest has waited", async () => {
    const store = await open();
    await write(store, "evt-1");
    await clock.advance(90_000);
    await write(store, "evt-2");
    await clock.advance(30_000);

    await expect(store.eventBacklog(signal)).resolves.toEqual({
      count: 2,
      oldestAgeMs: 120_000,
    });
    await store.acknowledge("evt-1", signal);
    await expect(store.eventBacklog(signal)).resolves.toEqual({
      count: 1,
      oldestAgeMs: 30_000,
    });
  });

  it("keeps events and state messages apart: neither is handed out as the other", async () => {
    const store = await open();
    await write(store, "evt-1");
    await store.append(
      () => ({ kind: "device_state", body: { device_id: "d-1" } }),
      signal,
    );

    await expect(store.takeDue(10, signal)).resolves.toMatchObject([
      { kind: "device_state" },
    ]);
    expect(idsOf(await store.takeDueEvents(signal))).toEqual(["evt-1"]);
    await expect(store.depth(signal)).resolves.toBe(2);
  });

  it("keeps its events across a restart, and sends them again after it", async () => {
    const before = await open();
    await writeMany(before, 2);
    await before.takeDueEvents(signal);
    await before.acknowledge("evt-1", signal);
    await before.close();
    opened.splice(0);

    const after = await open();
    await after.markAllUnsent(signal);

    await expect(after.takeDueEvents(signal)).resolves.toEqual([
      { eventId: "evt-2", body: { event_id: "evt-2", summary: SUMMARY } },
    ]);
  });
});

// T053: where the catch-up resumes.
describe("the catch-up mark", () => {
  it("reopens a legacy database with the full recovery window available", async () => {
    const legacy = openSqliteQueryLayer(join(folder, "outbox.db"), { clock });
    try {
      await runMigrations(
        legacy,
        OUTBOX_MIGRATIONS.filter((m) => m.version <= 3),
        { clock },
        signal,
      );
      await legacy.run(
        {
          sql: "INSERT INTO catchup_mark(mark_id, last_event_at) VALUES (1, @at)",
          params: { at: START },
        },
        signal,
      );
    } finally {
      await legacy.close();
    }
    const upgraded = await open();
    expect(await upgraded.catchupStart(signal)).toBe(0);
    expect((await upgraded.cameraCheckpoints(signal)).size).toBe(0);
  });

  it("keeps the initial baseline and independent monotone camera checkpoints across restart", async () => {
    const store = await open();
    await expect(store.catchupStart(signal)).resolves.toBeUndefined();

    await store.startCatchup(START, signal);
    await store.startCatchup(START - 5_000, signal);
    await expect(store.catchupStart(signal)).resolves.toBe(START);
    await store.startCatchup(START + 7_000, signal);
    await store.checkpointCamera("42", START + 7_000, signal);
    await store.checkpointCamera("42", START, signal);
    await store.checkpointCamera("43", START, signal);
    await store.close();
    opened.pop();

    const again = await open();
    await expect(again.catchupStart(signal)).resolves.toBe(START);
    expect(await again.cameraCheckpoints(signal)).toEqual(
      new Map([
        ["42", START + 7_000],
        ["43", START],
      ]),
    );
  });
});
