// The Ring Adapter over a fake ring-client-api (T013): mapping through the gate, failures in the
// bridge's own words, the deadline, the lost session, token rotation, and watching for changes.
import { describe, expect, it } from "vitest";
import { FakeClock } from "../../../utilities/clock/index.ts";
import { Logger } from "../../../utilities/logging/index.ts";
import type { Secret } from "../secrets-file/index.ts";
import { RING_CALL_LIMITS, RingCallGate } from "./call-limits.ts";
import { RingApiAdapter } from "./ring-api-adapter.ts";
import {
  driveFakeClock,
  FAKE_RING_BODY,
  FakeRingClient,
  ringHttpError,
} from "../../../../test/support/fake-ring-client.ts";
import { RingAdapterError } from "./ring-adapter-error.ts";
import type { RingChange } from "./ring-port.ts";

const START = Date.UTC(2026, 10, 6, 9, 0, 0);
const TOKEN = "rotated-token-for-the-test";
const STEP_MS = 1_000;

interface Setup {
  readonly clock: FakeClock;
  readonly client: FakeRingClient;
  readonly adapter: RingApiAdapter;
  readonly lines: string[];
  readonly saved: Secret<string>[];
  readonly changes: RingChange[];
}

function setup(
  save: (token: Secret<string>) => Promise<void> = () => Promise.resolve(),
): Setup {
  const clock = new FakeClock(START);
  const client = new FakeRingClient();
  const lines: string[] = [];
  const saved: Secret<string>[] = [];
  const changes: RingChange[] = [];
  const adapter = new RingApiAdapter({
    client,
    gate: new RingCallGate(clock, RING_CALL_LIMITS, () => 1),
    clock,
    logger: new Logger({
      sink: (line) => lines.push(line),
      now: () => clock.now(),
      minLevel: "debug",
    }),
    saveRefreshToken: (token) => {
      saved.push(token);
      return save(token);
    },
  });
  adapter.watch((change) => changes.push(change));
  return { clock, client, adapter, lines, saved, changes };
}

async function failureOf(
  clock: FakeClock,
  work: Promise<unknown>,
): Promise<RingAdapterError> {
  const error: unknown = await driveFakeClock(clock, work).then(
    () => undefined,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(RingAdapterError);
  return error as RingAdapterError;
}

function never(): AbortSignal {
  return new AbortController().signal;
}

describe("RingApiAdapter reads", () => {
  it("maps locations, telling owned from shared, with the alarm mode where there is an alarm", async () => {
    const { clock, adapter } = setup();
    const locations = await driveFakeClock(clock, adapter.locations(never()));
    expect(locations).toEqual([
      {
        location_id: "loc-1",
        name: "Home loc-1",
        time_zone: "Europe/Athens",
        alarm_mode: "home",
        ownership: "owned",
      },
      {
        location_id: "loc-2",
        name: "Home loc-2",
        time_zone: "Europe/Athens",
        ownership: "shared",
      },
    ]);
    expect(JSON.parse(JSON.stringify(locations))).toEqual(locations);
    expect(adapter.sessionStatus()).toBe("ok");
  });

  it("maps alarm devices and cameras, leaves out the alarm panel, and keeps names exactly", async () => {
    const { clock, adapter } = setup();
    const devices = await driveFakeClock(
      clock,
      adapter.devices("loc-1", never()),
    );
    expect(
      devices.map((device) => [device.device_id, device.type, device.name]),
    ).toEqual([
      ["z-contact", "contact", "דלת כניסה"],
      ["42", "doorbell", "Doorbell"],
    ]);
    for (const device of devices) {
      expect(Object.getPrototypeOf(device)).toBe(Object.prototype);
    }
    expect(JSON.parse(JSON.stringify(devices))).toEqual(devices);
  });

  it("returns no devices for a location Ring does not know", async () => {
    const { clock, client, adapter } = setup();
    await expect(
      driveFakeClock(clock, adapter.devices("nowhere", never())),
    ).resolves.toEqual([]);
    expect(client.getLocationsCalls).toBe(1);
  });
});

describe("RingApiAdapter failures", () => {
  it("reports a 406 as Ring unavailable, in its own words, and recovers", async () => {
    const { clock, client, adapter, changes } = setup();
    client.nextFailure = () => Promise.reject(ringHttpError(406));
    const error = await failureOf(clock, adapter.locations(never()));
    expect(error.kind).toBe("ring_unavailable");
    expect(error.message).toContain("406");
    expect(error.message).not.toContain(FAKE_RING_BODY);
    expect(error.cause).toBeUndefined();
    expect(adapter.sessionStatus()).toBe("unavailable");

    client.nextFailure = undefined;
    await driveFakeClock(clock, adapter.locations(never()));
    expect(adapter.sessionStatus()).toBe("ok");
    expect(changes.filter((change) => change.kind === "session")).toEqual([
      { kind: "session", status: "unavailable" },
      { kind: "session", status: "ok" },
    ]);
  });

  it("names 429, a server error, another status and no answer", async () => {
    const { clock, client, adapter } = setup();
    const cases: readonly [() => Promise<never>, string][] = [
      [() => Promise.reject(ringHttpError(429)), "429"],
      [() => Promise.reject(ringHttpError(503)), "503"],
      [() => Promise.reject(ringHttpError(404)), "404"],
      [
        () => Promise.reject(new Error(`fetch failed ${FAKE_RING_BODY}`)),
        "could not be reached",
      ],
    ];
    for (const [failure, words] of cases) {
      client.nextFailure = failure;
      const error = await failureOf(clock, adapter.locations(never()));
      expect(error.kind).toBe("ring_unavailable");
      expect(error.message).toContain(words);
      expect(error.message).not.toContain(FAKE_RING_BODY);
    }
  });

  it("treats a refused sign-in as a lost session, and refuses later calls without calling Ring", async () => {
    const { clock, client, adapter, changes } = setup();
    client.nextFailure = () =>
      Promise.reject(
        new Error(
          "Refresh token is not valid.  Unable to authenticate with Ring servers.",
        ),
      );
    expect((await failureOf(clock, adapter.locations(never()))).kind).toBe(
      "session_lost",
    );
    expect(adapter.sessionStatus()).toBe("lost");
    client.nextFailure = undefined;
    const calls = client.getLocationsCalls;
    expect((await failureOf(clock, adapter.locations(never()))).kind).toBe(
      "session_lost",
    );
    expect(client.getLocationsCalls).toBe(calls);
    expect(changes).toContainEqual({ kind: "session", status: "lost" });
  });

  it("treats a 401 after the library's own refresh as a lost session", async () => {
    const { clock, client, adapter } = setup();
    client.nextFailure = () => Promise.reject(ringHttpError(401));
    expect((await failureOf(clock, adapter.locations(never()))).kind).toBe(
      "session_lost",
    );
  });

  it("gives up after the deadline, and a late failure is dropped quietly", async () => {
    const { clock, client, adapter } = setup();
    let failLate: (error: Error) => void = () => undefined;
    client.nextFailure = () =>
      new Promise<never>((_resolve, reject) => {
        failLate = reject;
      });
    const error = await failureOf(clock, adapter.locations(never()));
    expect(error.message).toContain("did not answer in time");
    expect(clock.now() - START).toBeGreaterThanOrEqual(30_000);
    failLate(ringHttpError(503));
    await clock.advance(STEP_MS);
  });

  it("passes on the caller's abort and leaves the status as it was", async () => {
    const { clock, client, adapter } = setup();
    client.nextFailure = () => new Promise<never>(() => undefined);
    const controller = new AbortController();
    const reading = adapter.locations(controller.signal);
    reading.catch(() => undefined);
    await clock.advance(STEP_MS);
    controller.abort(new Error("caller stopped"));
    await expect(reading).rejects.toThrow("caller stopped");
    expect(adapter.sessionStatus()).toBe("ok");
  });

  it("stops calling Ring once the circuit opens", async () => {
    const { clock, client, adapter } = setup();
    client.nextFailure = () => Promise.reject(ringHttpError(503));
    for (let failure = 0; failure < 5; failure += 1) {
      await failureOf(clock, adapter.locations(never()));
    }
    const calls = client.getLocationsCalls;
    const refused = await failureOf(clock, adapter.locations(never()));
    expect(refused.message).toContain("paused");
    expect(client.getLocationsCalls).toBe(calls);
  });
});

describe("RingApiAdapter token and changes", () => {
  it("saves a rotated token as a Secret", async () => {
    const { client, saved } = setup();
    client.onRefreshTokenUpdated.emit({ newRefreshToken: TOKEN });
    expect(saved.map((token) => token.reveal())).toEqual([TOKEN]);
    await Promise.resolve();
  });

  it("logs a failed save without the token", async () => {
    const { client, lines } = setup(() =>
      Promise.reject(new Error(`disk full ${TOKEN}`)),
    );
    client.onRefreshTokenUpdated.emit({ newRefreshToken: TOKEN });
    await new Promise((resolve) => setImmediate(resolve));
    expect(lines.join("\n")).toContain("ring_refresh_token_not_saved");
    expect(lines.join("\n")).not.toContain(TOKEN);
  });

  it("reports device and alarm-mode changes after a read, but not the data the read returned", async () => {
    const { clock, client, adapter, changes } = setup();
    await driveFakeClock(clock, adapter.locations(never()));
    const location = client.locationsList[0];
    location?.devicesStream.emit([client.contact, client.panel]);
    expect(changes).toEqual([]);

    client.contact.stream.emit({ ...client.contact.data, faulted: true });
    client.panel.stream.emit({ ...client.panel.data, mode: "all" });
    expect(changes).toEqual([
      {
        kind: "device",
        device: expect.objectContaining({
          device_id: "z-contact",
          state: { open: true },
        }) as unknown,
      },
      {
        kind: "location",
        location: expect.objectContaining({
          location_id: "loc-1",
          alarm_mode: "away",
        }) as unknown,
      },
    ]);
  });

  it("keeps telling other listeners when one throws, and stops on request and on close", async () => {
    const { clock, client, adapter, lines, changes } = setup();
    const stop = adapter.watch(() => {
      throw new Error("listener broke");
    });
    await driveFakeClock(clock, adapter.locations(never()));
    client.locationsList[0]?.devicesStream.emit([client.contact]);
    client.contact.stream.emit({ ...client.contact.data, faulted: true });
    expect(changes).toHaveLength(1);
    expect(lines.join("\n")).toContain("ring_change_listener_failed");

    stop();
    adapter.close();
    client.contact.stream.emit({ ...client.contact.data, faulted: false });
    expect(changes).toHaveLength(1);
    expect(client.contact.stream.listeners).toBe(0);
    expect(client.onRefreshTokenUpdated.listeners).toBe(0);
    expect(client.disconnected).toBe(true);
  });
});
