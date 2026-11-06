// A fake ring-client-api for the Ring Adapter's tests and the Ring-boundary contract test (T013).
// It fits the adapter's narrow `RingClient` types, so no test touches the real library (SC4).
import type { FakeClock } from "../../src/utilities/clock/index.ts";
import type {
  RingClient,
  RingClientCamera,
  RingClientDevice,
  RingClientDeviceData,
  RingClientLocation,
  RingClientStream,
} from "../../src/connector/access/ring-adapter/ring-client.ts";

/** The account's own profile id: locations with this owner are owned. */
export const FAKE_RING_PROFILE_ID = 7;
/** Text in every fake Ring failure, which must never reach an error or a log. */
export const FAKE_RING_BODY = "Ring-body-SECRET-content";
const STEP_MS = 1_000;
const MAX_DRIVE_MS = 600_000;

export class FakeRingStream<T> implements RingClientStream<T> {
  readonly #listeners = new Set<(value: T) => void>();
  #current: { readonly value: T } | undefined;

  constructor(current?: { readonly value: T }) {
    this.#current = current;
  }

  subscribe(next: (value: T) => void): { unsubscribe(): void } {
    this.#listeners.add(next);
    if (this.#current !== undefined) {
      next(this.#current.value);
    }
    return {
      unsubscribe: () => {
        this.#listeners.delete(next);
      },
    };
  }

  emit(value: T): void {
    if (this.#current !== undefined) {
      this.#current = { value };
    }
    for (const listener of this.#listeners) {
      listener(value);
    }
  }

  get listeners(): number {
    return this.#listeners.size;
  }
}

export function fakeDevice(data: RingClientDeviceData): RingClientDevice & {
  readonly stream: FakeRingStream<RingClientDeviceData>;
} {
  const stream = new FakeRingStream<RingClientDeviceData>({ value: data });
  return { data, onData: stream, stream };
}

function contactDevice(): ReturnType<typeof fakeDevice> {
  return fakeDevice({
    zid: "z-contact",
    name: "דלת כניסה",
    deviceType: "sensor.contact",
    batteryLevel: 80,
    batteryStatus: "ok",
    faulted: false,
  });
}

function panelDevice(): ReturnType<typeof fakeDevice> {
  return fakeDevice({
    zid: "z-panel",
    name: "Alarm",
    deviceType: "security-panel",
    mode: "none",
  });
}

const DOORBELL: RingClientCamera = {
  id: 42,
  name: "Doorbell",
  isDoorbot: true,
  hasBattery: true,
  batteryLevel: 60,
  hasLowBattery: false,
  isOffline: false,
};

export interface FakeLocation extends RingClientLocation {
  readonly devicesStream: FakeRingStream<readonly RingClientDevice[]>;
}

function fakeLocation(
  id: string,
  ownerId: number,
  options: {
    readonly alarm: boolean;
    readonly devices: readonly RingClientDevice[];
  },
): FakeLocation {
  const devicesStream = new FakeRingStream<readonly RingClientDevice[]>();
  return {
    id,
    locationDetails: {
      name: `Home ${id}`,
      owner_id: ownerId,
      address: { timezone: "Europe/Athens" },
    },
    hasAlarmBaseStation: options.alarm,
    cameras: [DOORBELL],
    getDevices: () => Promise.resolve(options.devices),
    getAlarmMode: () => Promise.resolve("some"),
    onDevices: devicesStream,
    devicesStream,
  };
}

export class FakeRingClient implements RingClient {
  readonly onRefreshTokenUpdated = new FakeRingStream<{
    readonly newRefreshToken: string;
  }>();
  readonly contact = contactDevice();
  readonly panel = panelDevice();
  readonly locationsList: FakeLocation[] = [
    fakeLocation("loc-1", FAKE_RING_PROFILE_ID, {
      alarm: true,
      devices: [this.contact, this.panel],
    }),
    fakeLocation("loc-2", FAKE_RING_PROFILE_ID + 1, {
      alarm: false,
      devices: [],
    }),
  ];
  getLocationsCalls = 0;
  disconnected = false;
  nextFailure: (() => Promise<never>) | undefined;

  getLocations(): Promise<readonly RingClientLocation[]> {
    this.getLocationsCalls += 1;
    return this.nextFailure?.() ?? Promise.resolve(this.locationsList);
  }

  getProfile(): Promise<{ readonly profile: { readonly id: number } }> {
    return Promise.resolve({ profile: { id: FAKE_RING_PROFILE_ID } });
  }

  disconnect(): void {
    this.disconnected = true;
  }
}

export function ringHttpError(status: number): Error {
  return Object.assign(new Error(`HTTP ${String(status)}: ${FAKE_RING_BODY}`), {
    response: { status, body: FAKE_RING_BODY },
  });
}

/** Moves the fake clock until `work` settles, so the gate's spacing and backoff can pass. */
export async function driveFakeClock<T>(
  clock: FakeClock,
  work: Promise<T>,
): Promise<T> {
  const progress = { settled: false };
  const tracked = work.finally(() => {
    progress.settled = true;
  });
  tracked.catch(() => undefined);
  for (
    let waited = 0;
    !progress.settled && waited < MAX_DRIVE_MS;
    waited += STEP_MS
  ) {
    await clock.advance(STEP_MS);
  }
  return tracked;
}
