// The Ring Adapter over a fake ring-client-api (T013): mapping through the gate, failures in the
// bridge's own words, the deadline, the lost session, token rotation, and watching for changes.
// Since DRIFT-001-35, also how it notices Ring going away and coming back with no read running, and
// since DRIFT-001-41, how it follows alarm devices added and removed in Ring.
import { describe, expect, it } from "vitest";
import { FakeClock } from "../../../utilities/clock/index.ts";
import { Logger } from "../../../utilities/logging/index.ts";
import type { Secret } from "../../../utilities/security/index.ts";
import { RING_CALL_LIMITS, RingCallGate } from "./call-limits.ts";
import {
  RING_CONNECTION_GRACE_MS,
  RING_CONNECTION_STUCK_MS,
  RING_RECOVERY_PROBE_MS,
  RingApiAdapter,
} from "./ring-api-adapter.ts";
import {
  driveFakeClock,
  FAKE_DOORBELL,
  FAKE_RING_BODY,
  FakeRingClient,
  fakeDevice,
  ringHttpError,
} from "../../../../test/support/fake-ring-client.ts";
import type {
  FakeDevice,
  FakeLocation,
} from "../../../../test/support/fake-ring-client.ts";
import { RingAdapterError } from "./ring-adapter-error.ts";
import type { RingChange, RingDevice } from "./ring-port.ts";

const START = Date.UTC(2026, 10, 6, 9, 0, 0);
const TOKEN = "rotated-token-for-the-test";
const SIGN_IN_REFUSED = "Refresh token is not valid.";
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
  onConnectionStuck?: () => void,
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
    ...(onConnectionStuck === undefined ? {} : { onConnectionStuck }),
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

  // ring-client-api builds its cameras once and, with its polling off, never refreshes them; a
  // later read must not return the first read's copy as current (external review, 2026-11-07).
  it("reads each camera's battery and online state fresh from Ring on every read", async () => {
    const { clock, client, adapter } = setup();
    const doorbellOf = async (): Promise<RingDevice | undefined> =>
      (await driveFakeClock(clock, adapter.devices("loc-1", never()))).find(
        (device) => device.device_id === String(FAKE_DOORBELL.id),
      );
    expect(await doorbellOf()).toMatchObject({ battery_pct: 60, online: true });

    client.upstreamCameras = [
      {
        ...FAKE_DOORBELL,
        batteryLevel: 5,
        hasLowBattery: true,
        isOffline: true,
      },
    ];
    expect(await doorbellOf()).toMatchObject({
      battery_pct: 5,
      battery_low: true,
      online: false,
    });
    expect(client.getLocationsCalls).toBe(1);
    expect(client.fetchRingDevicesCalls).toBe(2);
  });

  it("leaves out a camera Ring no longer lists, and asks for no cameras where there are none", async () => {
    const { clock, client, adapter } = setup();
    client.upstreamCameras = [];
    const devices = await driveFakeClock(
      clock,
      adapter.devices("loc-1", never()),
    );
    expect(devices.map((device) => device.device_id)).toEqual(["z-contact"]);

    const calls = client.fetchRingDevicesCalls;
    for (const location of client.locationsList) {
      location.cameras = [];
    }
    await driveFakeClock(clock, adapter.devices("loc-2", never()));
    expect(client.fetchRingDevicesCalls).toBe(calls);
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

// An inventory as Ingest reads it: the locations, then each location's devices.
async function inventoryOf(adapter: RingApiAdapter): Promise<void> {
  const locations = await adapter.locations(never());
  for (const location of locations) {
    await adapter.devices(location.location_id, never());
  }
}

describe("RingApiAdapter counts only requests that reach Ring (CP-09 review round 5)", () => {
  it("opens the circuit after five failed requests in a row, however much the library answers from memory", async () => {
    const { clock, client, adapter, changes } = setup();
    await driveFakeClock(clock, inventoryOf(adapter));
    changes.splice(0);
    client.nextFailure = () => Promise.reject(ringHttpError(503));

    for (let failure = 0; failure < 5; failure += 1) {
      const error = await failureOf(clock, inventoryOf(adapter));
      expect(error.kind).toBe("ring_unavailable");
    }
    const refused = await failureOf(clock, inventoryOf(adapter));

    expect(refused.message).toContain("paused");
    expect(changes).toEqual([{ kind: "session", status: "unavailable" }]);
    expect(adapter.sessionStatus()).toBe("unavailable");
    expect(client.getLocationsCalls).toBe(1);
  });

  it("keeps counting a location read's failures while its memory reads succeed", async () => {
    const { clock, client, adapter, changes } = setup();
    await driveFakeClock(clock, inventoryOf(adapter));
    changes.splice(0);
    client.nextFailure = () => Promise.reject(ringHttpError(503));

    for (let failure = 0; failure < 5; failure += 1) {
      await failureOf(clock, adapter.devices("loc-1", never()));
    }
    const refused = await failureOf(clock, adapter.devices("loc-1", never()));

    expect(refused.message).toContain("paused");
    expect(changes).toEqual([{ kind: "session", status: "unavailable" }]);
  });

  it("says the session is fine again only after a request reaches Ring and succeeds", async () => {
    const { clock, client, adapter, changes } = setup();
    await driveFakeClock(clock, inventoryOf(adapter));
    client.nextFailure = () => Promise.reject(ringHttpError(503));
    await failureOf(clock, inventoryOf(adapter));
    expect(adapter.sessionStatus()).toBe("unavailable");
    const profileCalls = client.getProfileCalls;

    client.nextFailure = undefined;
    await driveFakeClock(clock, inventoryOf(adapter));

    expect(adapter.sessionStatus()).toBe("ok");
    expect(client.getProfileCalls).toBe(profileCalls + 1);
    expect(changes.filter((change) => change.kind === "session")).toEqual([
      { kind: "session", status: "unavailable" },
      { kind: "session", status: "ok" },
    ]);
  });
});

// ring-client-api retries a call that gets no answer on its own, without end, and cannot be
// cancelled; a call the adapter gave up on can still be reaching Ring (CP-07 review round 1).
describe("RingApiAdapter calls Ring one at a time, counting the calls it gave up on", () => {
  function hangUntilAnswered(client: FakeRingClient): () => void {
    let answer: () => void = () => undefined;
    client.nextFailure = () =>
      new Promise<never>((_resolve, reject) => {
        answer = () => {
          reject(ringHttpError(503));
        };
      });
    return () => {
      answer();
    };
  }

  it("makes no new Ring call during an outage while the call it gave up on still runs", async () => {
    const { clock, client, adapter } = setup();
    client.nextFailure = () => new Promise<never>(() => undefined);
    for (let call = 0; call < 8; call += 1) {
      const error = await failureOf(clock, adapter.locations(never()));
      expect(error.kind).toBe("ring_unavailable");
      await clock.advance(RING_CALL_LIMITS.circuit.probeIntervalMs);
    }
    expect(client.getLocationsCalls).toBe(1);
  });

  it("waits for a call it gave up on at the deadline, then calls Ring once it has ended", async () => {
    const { clock, client, adapter } = setup();
    const answerLate = hangUntilAnswered(client);
    const first = await failureOf(clock, adapter.locations(never()));
    expect(first.message).toContain("did not answer in time");

    client.nextFailure = undefined;
    const second = await failureOf(clock, adapter.locations(never()));
    expect(second.kind).toBe("ring_unavailable");
    expect(second.message).toContain("earlier call");
    expect(client.getLocationsCalls).toBe(1);

    answerLate();
    await driveFakeClock(clock, adapter.locations(never()));
    expect(client.getLocationsCalls).toBe(2);
    expect(adapter.sessionStatus()).toBe("ok");
  });

  it("keeps the spacing after a call that reached Ring late, once the call it gave up on ended", async () => {
    const { clock, client, adapter } = setup();
    const answerLate = hangUntilAnswered(client);
    await failureOf(clock, adapter.locations(never()));

    client.nextFailure = undefined;
    const starts: number[] = [];
    const getLocations = client.getLocations.bind(client);
    const getProfile = client.getProfile.bind(client);
    client.getLocations = () => {
      starts.push(clock.now());
      return getLocations();
    };
    client.getProfile = () => {
      starts.push(clock.now());
      return getProfile();
    };
    const reading = adapter.locations(never());
    reading.catch(() => undefined);
    await clock.advance(5 * STEP_MS);
    answerLate();
    await driveFakeClock(clock, reading);
    expect(starts).toHaveLength(2);
    const [locationsAt = 0, profileAt = 0] = starts;
    expect(profileAt - locationsAt).toBeGreaterThanOrEqual(
      RING_CALL_LIMITS.spacingMs,
    );
  });

  it("waits for a call the caller aborted before calling Ring again", async () => {
    const { clock, client, adapter } = setup();
    const answerLate = hangUntilAnswered(client);
    const controller = new AbortController();
    const reading = adapter.locations(controller.signal);
    reading.catch(() => undefined);
    await clock.advance(STEP_MS);
    controller.abort(new Error("caller stopped"));
    await expect(reading).rejects.toThrow("caller stopped");

    client.nextFailure = undefined;
    const next = adapter.locations(never());
    next.catch(() => undefined);
    await clock.advance(5 * STEP_MS);
    expect(client.getLocationsCalls).toBe(1);
    answerLate();
    await driveFakeClock(clock, next);
    expect(client.getLocationsCalls).toBe(2);
  });

  it("does not call Ring when the caller aborted before its turn came", async () => {
    const { clock, client, adapter } = setup();
    const controller = new AbortController();
    controller.abort(new Error("caller stopped"));
    await expect(
      driveFakeClock(clock, adapter.locations(controller.signal)),
    ).rejects.toThrow("caller stopped");
    expect(client.getLocationsCalls).toBe(0);
  });

  it("keeps a lost session lost for a call already waiting its turn, without calling Ring", async () => {
    const { clock, client, adapter, changes } = setup();
    let refuse: () => void = () => undefined;
    client.nextFailure = () =>
      new Promise<never>((_resolve, reject) => {
        refuse = () => {
          reject(new Error(SIGN_IN_REFUSED));
        };
      });
    const first = adapter.locations(never());
    first.catch(() => undefined);
    await clock.advance(STEP_MS);
    client.nextFailure = undefined;
    const second = adapter.locations(never());
    second.catch(() => undefined);

    refuse();
    expect((await failureOf(clock, first)).kind).toBe("session_lost");
    expect((await failureOf(clock, second)).kind).toBe("session_lost");
    expect(client.getLocationsCalls).toBe(1);
    expect(adapter.sessionStatus()).toBe("lost");
    expect(changes).toEqual([{ kind: "session", status: "lost" }]);
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
    client.contact.stream.emit({ ...client.contact.data, faulted: true });
    expect(changes).toHaveLength(1);
    expect(lines.join("\n")).toContain("ring_change_listener_failed");

    stop();
    adapter.close();
    client.contact.stream.emit({ ...client.contact.data, faulted: false });
    expect(changes).toHaveLength(1);
    expect(client.contact.stream.listeners).toBe(0);
    expect(client.onRefreshTokenUpdated.listeners).toBe(0);
    expect(client.locationsList[0]?.devicesStream.listeners).toBe(0);
    expect(client.locationsList[0]?.deviceListStream.listeners).toBe(0);
    expect(client.disconnected).toBe(true);
  });
});

function motionSensor(hub?: string): FakeDevice {
  return fakeDevice(
    {
      zid: "z-motion",
      name: "מסדרון",
      deviceType: "sensor.motion",
      motionStatus: "clear",
    },
    hub,
  );
}

function listChanges(changes: readonly RingChange[]): RingChange[] {
  return changes.filter((change) => change.kind === "device_list");
}

function deviceChangesOf(
  changes: readonly RingChange[],
  deviceId: string,
): RingChange[] {
  return changes.filter(
    (change) =>
      change.kind === "device" && change.device.device_id === deviceId,
  );
}

async function alarmDeviceIds(
  clock: FakeClock,
  adapter: RingApiAdapter,
): Promise<string[]> {
  const devices = await driveFakeClock(
    clock,
    adapter.devices("loc-1", never()),
  );
  return devices
    .filter((device) => device.type !== "doorbell")
    .map((device) => device.device_id);
}

// ring-client-api's device list only grows, and Ring sends a hub's full list on each (re)connect
// (DRIFT-001-41): the fake takes a list in the same way.
describe("RingApiAdapter follows Ring's alarm device list (CP-16 review follow-up)", () => {
  async function watching(): Promise<Setup & { readonly home: FakeLocation }> {
    const setUp = setup();
    expect(await alarmDeviceIds(setUp.clock, setUp.adapter)).toEqual([
      "z-contact",
    ]);
    const home = setUp.client.locationsList[0];
    if (home === undefined) {
      throw new Error("The fake has no first location.");
    }
    return { ...setUp, home };
  }

  it("does not report the devices of the first list, which the read returns", async () => {
    const { client, home, changes } = await watching();
    home.sendDeviceList([client.contact, client.panel]);
    expect(listChanges(changes)).toEqual([]);
  });

  it("reports a device added after the first read as a change of the list, reads it, and reports its changes", async () => {
    const { clock, client, adapter, home, changes } = await watching();
    const motion = motionSensor();

    home.sendDeviceList([client.contact, client.panel, motion]);
    expect(listChanges(changes)).toEqual([
      { kind: "device_list", location_id: "loc-1" },
    ]);
    expect(deviceChangesOf(changes, "z-motion")).toEqual([]);
    expect(await alarmDeviceIds(clock, adapter)).toEqual([
      "z-contact",
      "z-motion",
    ]);

    motion.stream.emit({ ...motion.data, motionStatus: "faulted" });
    expect(deviceChangesOf(changes, "z-motion")).toEqual([
      {
        kind: "device",
        device: expect.objectContaining({
          device_id: "z-motion",
          state: { motion: true },
        }) as unknown,
      },
    ]);
  });

  it("leaves out a device its hub's list no longer names, stops watching it, and reports the change", async () => {
    const { clock, client, adapter, home, changes } = await watching();

    home.sendDeviceList([client.panel]);
    expect(listChanges(changes)).toEqual([
      { kind: "device_list", location_id: "loc-1" },
    ]);
    expect(client.contact.stream.listeners).toBe(0);
    expect(await alarmDeviceIds(clock, adapter)).toEqual([]);

    client.contact.stream.emit({ ...client.contact.data, faulted: true });
    expect(deviceChangesOf(changes, "z-contact")).toEqual([]);
    home.sendDeviceList([client.panel]);
    expect(listChanges(changes)).toHaveLength(1);
  });

  it("watches a removed device again once its hub lists it again", async () => {
    const { clock, client, adapter, home, changes } = await watching();
    home.sendDeviceList([client.panel]);

    home.sendDeviceList([client.contact, client.panel]);
    expect(listChanges(changes)).toHaveLength(2);
    expect(client.contact.stream.listeners).toBe(1);
    expect(await alarmDeviceIds(clock, adapter)).toEqual(["z-contact"]);

    const before = deviceChangesOf(changes, "z-contact").length;
    client.contact.stream.emit({ ...client.contact.data, faulted: true });
    expect(deviceChangesOf(changes, "z-contact")).toHaveLength(before + 1);
  });

  it("keeps a device that another hub's list leaves out", async () => {
    const { clock, client, adapter, home, changes } = await watching();
    const motion = motionSensor("hub-2");
    home.sendDeviceList([motion], "hub-2");
    expect(listChanges(changes)).toHaveLength(1);

    home.sendDeviceList([client.contact, client.panel]);
    expect(listChanges(changes)).toHaveLength(1);
    expect(await alarmDeviceIds(clock, adapter)).toEqual([
      "z-contact",
      "z-motion",
    ]);
  });

  it("takes a list that names no device as no list, never as every device gone", async () => {
    const { clock, adapter, home, changes } = await watching();

    home.sendDeviceList([]);
    home.deviceListStream.emit({ src: "hub-1", body: [{ general: {} }] });
    home.deviceListStream.emit({ src: "hub-1" });
    expect(listChanges(changes)).toEqual([]);
    expect(await alarmDeviceIds(clock, adapter)).toEqual(["z-contact"]);
  });
});

/** Moves the fake clock by `ms` in steps, letting the adapter's own work run between them. */
async function pass(clock: FakeClock, ms: number): Promise<void> {
  for (let waited = 0; waited < ms; waited += STEP_MS) {
    await clock.advance(STEP_MS);
  }
}

/** Moves the fake clock until `condition` holds, for at most `limitMs`. */
async function passUntil(
  clock: FakeClock,
  condition: () => boolean,
  limitMs: number,
): Promise<void> {
  for (let waited = 0; !condition(); waited += STEP_MS) {
    if (waited > limitMs) {
      throw new Error("It did not happen in time.");
    }
    await clock.advance(STEP_MS);
  }
}

function sessionChanges(changes: readonly RingChange[]): RingChange[] {
  return changes.filter((change) => change.kind === "session");
}

function probeLines(lines: readonly string[]): number {
  return lines.filter((line) => line.includes("ring_recovery_probe_failed"))
    .length;
}

function signInGone(): Promise<never> {
  return Promise.reject(
    new Error(
      "Refresh token is not valid.  Unable to authenticate with Ring servers.",
    ),
  );
}

// The owner's choice (c)+(a), DRIFT-001-35: a hub's live connection closing tells that Ring went
// away, and a probe once a minute, only while calls to Ring fail, tells that it is back (SC-005).
describe("RingApiAdapter notices Ring going away and coming back", () => {
  async function watching(
    onConnectionStuck?: () => void,
  ): Promise<Setup & { readonly hub: FakeLocation }> {
    const ready = setup(undefined, onConnectionStuck);
    await driveFakeClock(ready.clock, ready.adapter.locations(never()));
    const hub = ready.client.locationsList[0];
    if (hub === undefined) {
      throw new Error("The fake has no first location.");
    }
    hub.connectedStream.emit(true);
    return { ...ready, hub };
  }

  it("counts Ring unavailable once a hub's live connection stays closed past the grace, and ok once it opens again", async () => {
    const { clock, adapter, changes, hub } = await watching();

    hub.connectedStream.emit(false);
    await pass(clock, RING_CONNECTION_GRACE_MS - STEP_MS);
    expect(adapter.sessionStatus()).toBe("ok");
    await pass(clock, STEP_MS);
    expect(adapter.sessionStatus()).toBe("unavailable");
    hub.connectedStream.emit(true);

    expect(adapter.sessionStatus()).toBe("ok");
    expect(sessionChanges(changes)).toEqual([
      { kind: "session", status: "unavailable" },
      { kind: "session", status: "ok" },
    ]);
  });

  it("ignores a reconnect shorter than the grace", async () => {
    const { clock, adapter, changes, hub } = await watching();

    hub.connectedStream.emit(false);
    await pass(clock, RING_CONNECTION_GRACE_MS / 2);
    hub.connectedStream.emit(true);
    await pass(clock, 2 * RING_CONNECTION_GRACE_MS);

    expect(adapter.sessionStatus()).toBe("ok");
    expect(sessionChanges(changes)).toEqual([]);
  });

  it("does not count the connection's first false, before it ever opened", async () => {
    const { clock, adapter, changes } = setup();
    await driveFakeClock(clock, adapter.locations(never()));

    await pass(clock, 2 * RING_CONNECTION_GRACE_MS);

    expect(adapter.sessionStatus()).toBe("ok");
    expect(sessionChanges(changes)).toEqual([]);
  });

  it("watches only locations with a hub, as one without never has a live connection", async () => {
    const { clock, client, adapter } = setup();
    await driveFakeClock(clock, adapter.locations(never()));

    expect(client.locationsList[0]?.connectedStream.listeners).toBe(1);
    expect(client.locationsList[1]?.connectedStream.listeners).toBe(0);

    adapter.close();
    expect(client.locationsList[0]?.connectedStream.listeners).toBe(0);
  });

  it("asks Ring at most once a minute while calls fail, and says ok when it answers, with no read", async () => {
    const { clock, client, adapter, changes } = setup();
    await driveFakeClock(clock, adapter.locations(never()));
    client.nextFailure = () => Promise.reject(ringHttpError(503));
    await failureOf(clock, adapter.devices("loc-1", never()));
    expect(adapter.sessionStatus()).toBe("unavailable");
    const before = client.getProfileCalls;

    await pass(clock, 3 * RING_RECOVERY_PROBE_MS);
    const asked = client.getProfileCalls - before;
    expect(asked).toBeGreaterThanOrEqual(2);
    expect(asked).toBeLessThanOrEqual(3);
    expect(adapter.sessionStatus()).toBe("unavailable");

    client.nextFailure = undefined;
    await passUntil(
      clock,
      () => adapter.sessionStatus() === "ok",
      3 * RING_RECOVERY_PROBE_MS,
    );
    const afterBack = client.getProfileCalls;
    await pass(clock, 3 * RING_RECOVERY_PROBE_MS);

    expect(client.getProfileCalls).toBe(afterBack);
    expect(sessionChanges(changes).at(-1)).toEqual({
      kind: "session",
      status: "ok",
    });
  });

  it("makes no probe while Ring is fine", async () => {
    const { clock, client, adapter } = setup();
    await driveFakeClock(clock, adapter.locations(never()));
    const before = client.getProfileCalls;

    await pass(clock, 5 * RING_RECOVERY_PROBE_MS);

    expect(client.getProfileCalls).toBe(before);
  });

  it("does not say ok while a hub's connection is still closed, even when the probe gets through", async () => {
    const { clock, client, adapter, hub } = await watching();
    hub.connectedStream.emit(false);
    client.nextFailure = () => Promise.reject(ringHttpError(503));
    await failureOf(clock, adapter.devices("loc-1", never()));
    await pass(clock, RING_CONNECTION_GRACE_MS);
    client.nextFailure = undefined;
    const before = client.getProfileCalls;

    await pass(clock, 3 * RING_RECOVERY_PROBE_MS);

    expect(client.getProfileCalls).toBe(before + 1);
    expect(adapter.sessionStatus()).toBe("unavailable");
    hub.connectedStream.emit(true);
    expect(adapter.sessionStatus()).toBe("ok");
  });

  // The owner's choice (y): the library makes no further attempt once its reconnect fails, so a
  // connection still closed after 5 minutes, with Ring's calls working, means a restart.
  it("reports a hub's connection stuck once, after the grace and 5 minutes more with no call failing", async () => {
    let reports = 0;
    const { clock, adapter, hub, lines } = await watching(() => {
      reports += 1;
    });

    hub.connectedStream.emit(false);
    await pass(
      clock,
      RING_CONNECTION_GRACE_MS + RING_CONNECTION_STUCK_MS - STEP_MS,
    );
    expect(reports).toBe(0);
    await pass(clock, STEP_MS);
    expect(reports).toBe(1);
    // A call that works afterwards updates the status again, with the connection still closed.
    await driveFakeClock(clock, adapter.devices("loc-1", never()));
    await pass(clock, 2 * RING_CONNECTION_STUCK_MS);

    expect(reports).toBe(1);
    expect(lines.join("\n")).toContain("ring_connection_stuck");
  });

  it("does not report a stuck connection while calls to Ring fail, and does 5 minutes after they work again with it still closed", async () => {
    let reports = 0;
    const { clock, client, adapter, hub } = await watching(() => {
      reports += 1;
    });
    hub.connectedStream.emit(false);
    client.nextFailure = () => Promise.reject(ringHttpError(503));
    await failureOf(clock, adapter.devices("loc-1", never()));

    await pass(clock, RING_CONNECTION_GRACE_MS + 2 * RING_CONNECTION_STUCK_MS);
    expect(reports).toBe(0);

    // The probe gets through: calls work again, with the connection still closed. Ring's status
    // stays unavailable, so the wait starts without any change of status.
    client.nextFailure = undefined;
    await pass(clock, RING_RECOVERY_PROBE_MS);
    expect(adapter.sessionStatus()).toBe("unavailable");
    await pass(clock, RING_CONNECTION_STUCK_MS);

    expect(reports).toBe(1);
  });

  it("does not report a stuck connection once it opens again", async () => {
    let reports = 0;
    const { clock, hub } = await watching(() => {
      reports += 1;
    });

    hub.connectedStream.emit(false);
    await pass(clock, RING_CONNECTION_GRACE_MS + RING_CONNECTION_STUCK_MS / 2);
    hub.connectedStream.emit(true);
    await pass(clock, 2 * RING_CONNECTION_STUCK_MS);

    expect(reports).toBe(0);
  });

  it("stops probing once the session is lost", async () => {
    const { clock, client, adapter, lines } = setup();
    await driveFakeClock(clock, adapter.locations(never()));
    client.nextFailure = () => Promise.reject(ringHttpError(503));
    await failureOf(clock, adapter.devices("loc-1", never()));
    client.nextFailure = signInGone;
    await failureOf(clock, adapter.devices("loc-1", never()));
    expect(adapter.sessionStatus()).toBe("lost");
    const before = { calls: client.getProfileCalls, lines: probeLines(lines) };

    await pass(clock, 3 * RING_RECOVERY_PROBE_MS);

    expect(client.getProfileCalls).toBe(before.calls);
    expect(probeLines(lines)).toBe(before.lines);
  });

  it("stops probing on close", async () => {
    const { clock, client, adapter, lines } = setup();
    await driveFakeClock(clock, adapter.locations(never()));
    client.nextFailure = () => Promise.reject(ringHttpError(503));
    await failureOf(clock, adapter.devices("loc-1", never()));
    const before = { calls: client.getProfileCalls, lines: probeLines(lines) };

    adapter.close();
    await pass(clock, 3 * RING_RECOVERY_PROBE_MS);

    expect(client.getProfileCalls).toBe(before.calls);
    expect(probeLines(lines)).toBe(before.lines);
  });
});
