// The scenario engine (T009): reads, scripted changes and Ring faults, on the fake clock.
import { describe, expect, it } from "vitest";
import { FakeClock } from "../../src/utilities/clock/index.ts";
import type {
  RingChange,
  RingPort,
} from "../../src/connector/access/ring-adapter/index.ts";
import {
  HEBREW_DEVICE_ID,
  ScenarioEngine,
  STANDARD_LOCATION_ID,
} from "./index.ts";
import type { HomeSnapshot } from "./index.ts";

const SLOW_MS = 5_000;

function never(): AbortSignal {
  return new AbortController().signal;
}

function setUp(): {
  clock: FakeClock;
  engine: ScenarioEngine;
  changes: RingChange[];
} {
  const clock = new FakeClock(0);
  const engine = new ScenarioEngine(clock);
  const changes: RingChange[] = [];
  engine.watch((change) => {
    changes.push(change);
  });
  return { clock, engine, changes };
}

describe("reading the simulated home", () => {
  it("implements the Ring Adapter's port", async () => {
    const port: RingPort = new ScenarioEngine(new FakeClock(0));

    expect(port.sessionStatus()).toBe("ok");
    await expect(port.locations(never())).resolves.toHaveLength(1);
    await expect(
      port.devices(STANDARD_LOCATION_ID, never()),
    ).resolves.toHaveLength(100);
  });

  it("lists no devices for a location Ring does not know", async () => {
    const { engine } = setUp();

    await expect(engine.devices("elsewhere", never())).resolves.toEqual([]);
  });

  it("counts every read that reaches Ring", async () => {
    const { engine } = setUp();
    await engine.locations(never());
    await engine.devices(STANDARD_LOCATION_ID, never());

    expect(engine.reads).toBe(2);
  });

  it("refuses a home whose device names a missing location", () => {
    const home: HomeSnapshot = {
      locations: [],
      devices: [
        {
          device_id: "d",
          location_id: "nowhere",
          name: "x",
          type: "light",
          power_mode: "wired",
          online: true,
          state: {},
        },
      ],
    };

    expect(() => new ScenarioEngine(new FakeClock(0), home)).toThrow(
      "location",
    );
  });
});

describe("scripted changes", () => {
  it("changes devices and the alarm mode at their time on the clock, in order", async () => {
    const { clock, engine, changes } = setUp();
    engine.play([
      {
        afterMs: 1_000,
        action: {
          kind: "device",
          deviceId: HEBREW_DEVICE_ID,
          changes: { state: { open: true } },
        },
      },
      {
        afterMs: 1_000,
        action: {
          kind: "alarm_mode",
          locationId: STANDARD_LOCATION_ID,
          mode: "away",
        },
      },
      {
        afterMs: 2_000,
        action: {
          kind: "device",
          deviceId: HEBREW_DEVICE_ID,
          changes: { online: false },
        },
      },
    ]);

    await clock.advance(999);
    expect(changes).toEqual([]);
    await clock.advance(1);
    expect(changes.map((change) => change.kind)).toEqual([
      "device",
      "location",
    ]);
    await clock.advance(1_000);

    const devices = await engine.devices(STANDARD_LOCATION_ID, never());
    const door = devices.find(
      (device) => device.device_id === HEBREW_DEVICE_ID,
    );
    expect(door).toMatchObject({ online: false, state: { open: true } });
    await expect(engine.locations(never())).resolves.toMatchObject([
      { alarm_mode: "away" },
    ]);
    expect(changes).toHaveLength(3);
    expect(changes[2]).toEqual({ kind: "device", device: door });
  });

  it("cancels the steps not yet played", async () => {
    const { clock, engine, changes } = setUp();
    const cancel = engine.play([
      {
        afterMs: 1_000,
        action: {
          kind: "alarm_mode",
          locationId: STANDARD_LOCATION_ID,
          mode: "home",
        },
      },
    ]);

    cancel();
    await clock.advance(1_000);

    expect(changes).toEqual([]);
  });

  it("stops reporting to a watcher that stops watching", () => {
    const { engine, changes } = setUp();
    const seen: RingChange[] = [];
    const stop = engine.watch((change) => {
      seen.push(change);
    });

    stop();
    engine.apply({
      kind: "alarm_mode",
      locationId: STANDARD_LOCATION_ID,
      mode: "home",
    });

    expect(seen).toEqual([]);
    expect(changes).toHaveLength(1);
  });

  it("refuses a script that names a device or location the home lacks", () => {
    const { engine } = setUp();

    expect(() => {
      engine.apply({ kind: "device", deviceId: "missing", changes: {} });
    }).toThrow("missing");
    expect(() => {
      engine.apply({ kind: "alarm_mode", locationId: "missing", mode: "away" });
    }).toThrow("missing");
  });
});

describe("Ring faults", () => {
  it.each([
    ["ring_down", "unavailable", "ring_unavailable"],
    ["blocked", "unavailable", "ring_unavailable"],
    ["session_lost", "lost", "session_lost"],
  ] as const)(
    "%s makes the session %s and refuses reads with %s",
    async (fault, status, kind) => {
      const { engine, changes } = setUp();

      engine.apply({ kind: "fault", fault: { kind: fault } });

      expect(engine.sessionStatus()).toBe(status);
      expect(changes).toEqual([{ kind: "session", status }]);
      await expect(engine.locations(never())).rejects.toMatchObject({
        name: "RingAdapterError",
        kind,
      });
      await expect(
        engine.devices(STANDARD_LOCATION_ID, never()),
      ).rejects.toMatchObject({ kind });
    },
  );

  it("reports nothing during a refusal, and the home's changes are there after recovery", async () => {
    const { engine, changes } = setUp();
    engine.apply({ kind: "fault", fault: { kind: "ring_down" } });

    engine.apply({
      kind: "device",
      deviceId: HEBREW_DEVICE_ID,
      changes: { state: { open: true } },
    });
    engine.apply({ kind: "recover" });

    expect(changes).toEqual([
      { kind: "session", status: "unavailable" },
      { kind: "session", status: "ok" },
    ]);
    const devices = await engine.devices(STANDARD_LOCATION_ID, never());
    expect(
      devices.find((device) => device.device_id === HEBREW_DEVICE_ID)?.state,
    ).toEqual({ open: true });
  });

  it("does not report the session again when a refusal changes but the status does not", () => {
    const { engine, changes } = setUp();

    engine.apply({ kind: "fault", fault: { kind: "ring_down" } });
    engine.apply({ kind: "fault", fault: { kind: "blocked" } });

    expect(changes).toEqual([{ kind: "session", status: "unavailable" }]);
  });

  it("answers a slow read only after its delay on the clock", async () => {
    const { clock, engine } = setUp();
    engine.apply({ kind: "fault", fault: { kind: "slow", delayMs: SLOW_MS } });
    let answered = false;

    const reading = engine.locations(never()).then((locations) => {
      answered = true;
      return locations;
    });
    await clock.advance(SLOW_MS - 1);
    expect(answered).toBe(false);
    await clock.advance(1);

    await expect(reading).resolves.toHaveLength(1);
    expect(engine.sessionStatus()).toBe("ok");
  });

  it("refuses a slow read when Ring goes down before it answers", async () => {
    const { clock, engine } = setUp();
    engine.apply({ kind: "fault", fault: { kind: "slow", delayMs: SLOW_MS } });

    const reading = engine.locations(never()).catch((error: unknown) => error);
    engine.apply({ kind: "fault", fault: { kind: "session_lost" } });
    await clock.advance(SLOW_MS);

    await expect(reading).resolves.toMatchObject({ kind: "session_lost" });
  });

  it("passes on the caller's abort, before and during a slow read", async () => {
    const { engine } = setUp();
    const reason = new Error("caller gone");
    const aborted = new AbortController();
    aborted.abort(reason);

    await expect(engine.locations(aborted.signal)).rejects.toBe(reason);
    engine.apply({ kind: "fault", fault: { kind: "slow", delayMs: SLOW_MS } });
    const leaving = new AbortController();
    const reading = engine.locations(leaving.signal);
    leaving.abort(reason);
    await expect(reading).rejects.toBe(reason);
  });

  it("recovers from a slow answer and a refusal together", async () => {
    const { engine } = setUp();
    engine.apply({ kind: "fault", fault: { kind: "slow", delayMs: SLOW_MS } });
    engine.apply({ kind: "fault", fault: { kind: "blocked" } });

    engine.apply({ kind: "recover" });

    expect(engine.sessionStatus()).toBe("ok");
    await expect(engine.locations(never())).resolves.toHaveLength(1);
  });

  it("plays a fault and its recovery from a script", async () => {
    const { clock, engine } = setUp();
    engine.play([
      {
        afterMs: 100,
        action: { kind: "fault", fault: { kind: "session_lost" } },
      },
      { afterMs: 200, action: { kind: "recover" } },
    ]);

    await clock.advance(100);
    expect(engine.sessionStatus()).toBe("lost");
    await clock.advance(100);
    expect(engine.sessionStatus()).toBe("ok");
  });
});
