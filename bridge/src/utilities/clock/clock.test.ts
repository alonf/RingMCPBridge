import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ClockError,
  FakeClock,
  SystemClock,
  formatInTimeZone,
  formatUtc,
  isValidTimeZone,
} from "./index.ts";

const START = Date.UTC(2026, 10, 3, 9, 0, 0);
const MINUTE_MS = 60_000;

describe("FakeClock", () => {
  it("stands still until advanced", async () => {
    const clock = new FakeClock(START);
    expect(clock.now()).toBe(START);

    await clock.advance(1500);
    expect(clock.now()).toBe(START + 1500);
  });

  it("fires due timers in time order, each at its due time", async () => {
    const clock = new FakeClock(START);
    const fired: string[] = [];
    clock.schedule(300, () => fired.push(`b@${String(clock.now() - START)}`));
    clock.schedule(100, () => fired.push(`a@${String(clock.now() - START)}`));
    clock.schedule(300, () => fired.push(`c@${String(clock.now() - START)}`));
    clock.schedule(900, () => fired.push("late"));

    await clock.advance(500);

    expect(fired).toEqual(["a@100", "b@300", "c@300"]);
    expect(clock.pendingTimers).toBe(1);
  });

  it("repeats an interval until cancelled", async () => {
    const clock = new FakeClock(START);
    let ticks = 0;
    const cancel = clock.every(MINUTE_MS, () => ticks++);

    await clock.advance(3 * MINUTE_MS);
    cancel();
    await clock.advance(3 * MINUTE_MS);

    expect(ticks).toBe(3);
    expect(clock.pendingTimers).toBe(0);
  });

  it("refuses an interval that is not positive", () => {
    const clock = new FakeClock(START);
    expect(() => clock.every(0, () => undefined)).toThrow(ClockError);
  });

  it("does not fire a cancelled timer", async () => {
    const clock = new FakeClock(START);
    const callback = vi.fn();
    const cancel = clock.schedule(100, callback);
    cancel();
    cancel();

    await clock.advance(1000);
    expect(callback).not.toHaveBeenCalled();
  });

  it("resolves sleep when time reaches it, and runs what follows before the next timer", async () => {
    const clock = new FakeClock(START);
    const order: string[] = [];
    const sleeper = (async () => {
      await clock.sleep(100);
      order.push(`woke@${String(clock.now() - START)}`);
    })();
    clock.schedule(200, () => order.push("timer@200"));

    await clock.advance(250);
    await sleeper;

    expect(order).toEqual(["woke@100", "timer@200"]);
  });

  it("fires timers that a timer schedules within the same advance", async () => {
    const clock = new FakeClock(START);
    const fired: number[] = [];
    clock.schedule(100, () => {
      clock.schedule(50, () => fired.push(clock.now() - START));
    });

    await clock.advance(200);
    expect(fired).toEqual([150]);
  });

  it("rejects sleep with the signal's reason when aborted", async () => {
    const clock = new FakeClock(START);
    const controller = new AbortController();
    const sleeping = clock.sleep(1000, controller.signal);
    const reason = new Error("stopped");
    controller.abort(reason);

    await expect(sleeping).rejects.toBe(reason);
    expect(clock.pendingTimers).toBe(0);
  });

  it("rejects sleep at once when the signal is already aborted", async () => {
    const clock = new FakeClock(START);
    const reason = new Error("already");

    await expect(clock.sleep(10, AbortSignal.abort(reason))).rejects.toBe(
      reason,
    );
  });
});

describe("SystemClock", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("reads Date.now", () => {
    vi.useFakeTimers({ now: START });
    expect(new SystemClock().now()).toBe(START);
  });

  it("schedules, repeats and cancels with Node's timers", () => {
    vi.useFakeTimers({ now: START });
    const clock = new SystemClock();
    const once = vi.fn();
    const repeated = vi.fn();
    const cancelled = vi.fn();
    clock.schedule(100, once);
    const stop = clock.every(100, repeated);
    clock.schedule(100, cancelled)();

    vi.advanceTimersByTime(350);
    stop();
    vi.advanceTimersByTime(350);

    expect(once).toHaveBeenCalledTimes(1);
    expect(repeated).toHaveBeenCalledTimes(3);
    expect(cancelled).not.toHaveBeenCalled();
  });

  it("sleeps and aborts", async () => {
    vi.useFakeTimers({ now: START });
    const clock = new SystemClock();
    const slept = clock.sleep(100);
    vi.advanceTimersByTime(100);
    await expect(slept).resolves.toBeUndefined();

    const controller = new AbortController();
    const aborted = clock.sleep(100, controller.signal);
    controller.abort(new Error("stop"));
    await expect(aborted).rejects.toThrow("stop");
  });
});

describe("time formatting", () => {
  it("formats UTC with milliseconds", () => {
    expect(formatUtc(START)).toBe("2026-11-03T09:00:00.000Z");
  });

  it("formats a location's local time with its offset at that moment", () => {
    expect(formatInTimeZone(START, "Europe/Athens")).toBe(
      "2026-11-03T11:00:00+02:00",
    );
    const summer = Date.UTC(2026, 6, 1, 9, 0, 0);
    expect(formatInTimeZone(summer, "Europe/Athens")).toBe(
      "2026-07-01T12:00:00+03:00",
    );
    expect(formatInTimeZone(START, "America/St_Johns")).toBe(
      "2026-11-03T05:30:00-03:30",
    );
  });

  it("formats UTC itself with +00:00 and midnight as 00", () => {
    const midnight = Date.UTC(2026, 10, 3, 0, 0, 0);
    expect(formatInTimeZone(midnight, "UTC")).toBe("2026-11-03T00:00:00+00:00");
  });

  it("knows real zones and refuses unknown ones", () => {
    expect(isValidTimeZone("Europe/Athens")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus_Mons")).toBe(false);
    expect(() => formatInTimeZone(START, "Mars/Olympus_Mons")).toThrow(
      ClockError,
    );
  });
});
