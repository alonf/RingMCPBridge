// The Home Scheduler (T016) on the fake clock, with a stand-in for Ingest: what is due every 10 s,
// the heartbeat every 15 s, a failing tick logged once while the next still runs, and stopping.
import { describe, expect, it } from "vitest";
import { FakeClock } from "../../../utilities/clock/index.ts";
import type { Clock } from "../../../utilities/clock/index.ts";
import { Logger } from "../../../utilities/logging/index.ts";
import type { Ingest } from "../../managers/ingest/index.ts";
import {
  HEARTBEAT_INTERVAL_MS,
  HomeScheduler,
  RESEND_TICK_MS,
} from "./index.ts";

const START = Date.UTC(2026, 10, 7, 9, 0, 0);

interface Calls {
  sendDue: number[];
  heartbeat: number[];
}

function setup(failing = false): {
  clock: FakeClock;
  calls: Calls;
  lines: string[];
  scheduler: HomeScheduler;
} {
  const clock = new FakeClock(START);
  const calls: Calls = { sendDue: [], heartbeat: [] };
  const lines: string[] = [];
  const ingest = {
    sendDue: () => {
      calls.sendDue.push(clock.now() - START);
      return failing
        ? Promise.reject(new Error("unexpected"))
        : Promise.resolve();
    },
    sendHeartbeat: () => {
      calls.heartbeat.push(clock.now() - START);
      return Promise.resolve();
    },
  } as unknown as Ingest;
  const scheduler = new HomeScheduler({
    ingest,
    clock,
    logger: new Logger({
      sink: (line) => lines.push(line),
      now: () => clock.now(),
      minLevel: "debug",
    }),
  });
  return { clock, calls, lines, scheduler };
}

async function advance(clock: FakeClock, ms: number): Promise<void> {
  for (let step = 0; step < ms; step += RESEND_TICK_MS / 2) {
    await clock.advance(RESEND_TICK_MS / 2);
  }
}

describe("HomeScheduler", () => {
  it("has Ingest send what is due every 10 s and the heartbeat every 15 s", async () => {
    const { clock, calls, scheduler } = setup();
    scheduler.start();
    scheduler.start();
    await advance(clock, 30_000);
    expect(calls.sendDue).toEqual([10_000, 20_000, 30_000]);
    expect(calls.heartbeat).toEqual([15_000, 30_000]);
    expect(RESEND_TICK_MS).toBe(10_000);
    expect(HEARTBEAT_INTERVAL_MS).toBe(15_000);
    await scheduler.stop();
  });

  it("logs a failing tick once and still runs the next", async () => {
    const { clock, calls, lines, scheduler } = setup(true);
    scheduler.start();
    await advance(clock, 20_000);
    expect(calls.sendDue).toEqual([10_000, 20_000]);
    const failures = lines.filter((line) => line.includes("home_tick_failed"));
    expect(failures).toHaveLength(2);
    expect(failures[0]).toContain('"kind":"send_due"');
    await scheduler.stop();
  });

  it("stops both ticks", async () => {
    const { clock, calls, scheduler } = setup();
    scheduler.start();
    await advance(clock, 10_000);
    await scheduler.stop();
    await advance(clock, 60_000);
    expect(calls.sendDue).toEqual([10_000]);
    expect(calls.heartbeat).toEqual([]);
  });

  it("keeps only the current timer of each tick, however long it runs (round 4)", async () => {
    const fake = new FakeClock(START);
    let cancelled = 0;
    const clock: Clock = {
      now: () => fake.now(),
      sleep: (ms, signal) => fake.sleep(ms, signal),
      schedule: (ms, callback) => {
        const cancel = fake.schedule(ms, callback);
        return () => {
          cancelled += 1;
          cancel();
        };
      },
      every: (ms, callback) => fake.every(ms, callback),
    };
    const ingest = {
      sendDue: () => Promise.resolve(),
      sendHeartbeat: () => Promise.resolve(),
    } as unknown as Ingest;
    const scheduler = new HomeScheduler({
      ingest,
      clock,
      logger: new Logger({
        sink: () => undefined,
        now: () => 0,
        minLevel: "debug",
      }),
    });
    scheduler.start();

    await advance(fake, 10 * 60_000);
    await scheduler.stop();

    expect(cancelled).toBe(2);
  });
});
