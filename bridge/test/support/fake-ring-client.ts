// A fake ring-client-api for the Ring Adapter's tests and the Ring-boundary contract test (T013).
// It fits the adapter's narrow `RingClient` types, so no test touches the real library (SC4).
import type { FakeClock } from "../../src/utilities/clock/index.ts";
import type {
  RingClient,
  RingClientCamera,
  RingClientCameraData,
  RingClientDevice,
  RingClientDeviceData,
  RingClientDeviceList,
  RingClientLocation,
  RingClientStream,
} from "../../src/connector/access/ring-adapter/ring-client.ts";

/** The account's own profile id: locations with this owner are owned. */
export const FAKE_RING_PROFILE_ID = 7;
/** Text in every fake Ring failure, which must never reach an error or a log. */
export const FAKE_RING_BODY = "Ring-body-SECRET-content";
/** The hub (Ring's asset) whose device list names a fake device unless a test says otherwise. */
export const FAKE_HUB = "hub-1";
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

  /** The value a new subscriber receives at once; none for a stream with no replay. */
  get value(): T | undefined {
    return this.#current?.value;
  }
}

/** An alarm device as ring-client-api keeps it: `data` is its data now. */
export interface FakeDevice extends RingClientDevice {
  readonly stream: FakeRingStream<RingClientDeviceData>;
}

export function fakeDevice(
  data: RingClientDeviceData,
  assetId: string = FAKE_HUB,
): FakeDevice {
  const stream = new FakeRingStream<RingClientDeviceData>({ value: data });
  return {
    get data(): RingClientDeviceData {
      return stream.value ?? data;
    },
    onData: stream,
    stream,
    assetId,
  };
}

function contactDevice(): FakeDevice {
  return fakeDevice({
    zid: "z-contact",
    name: "דלת כניסה",
    deviceType: "sensor.contact",
    batteryLevel: 80,
    batteryStatus: "ok",
    faulted: false,
  });
}

function panelDevice(): FakeDevice {
  return fakeDevice({
    zid: "z-panel",
    name: "Alarm",
    deviceType: "security-panel",
    mode: "none",
  });
}

/** A camera's data as the fake's Ring holds it. */
export interface FakeCameraData extends RingClientCameraData {
  readonly name: string;
  readonly isDoorbot: boolean;
  readonly hasBattery: boolean;
  readonly batteryLevel: number | null;
  readonly hasLowBattery: boolean;
  readonly isOffline: boolean;
}

export const FAKE_DOORBELL: FakeCameraData = {
  id: 42,
  name: "Doorbell",
  isDoorbot: true,
  hasBattery: true,
  batteryLevel: 60,
  hasLowBattery: false,
  isOffline: false,
};

/**
 * A camera as ring-client-api keeps it: built once, with the data of the first read, and changed
 * only when its data is replaced (`updateData`), which the library's own polling would do.
 */
export class FakeCamera implements RingClientCamera {
  #data: FakeCameraData;

  constructor(data: FakeCameraData) {
    this.#data = data;
  }

  get id(): number {
    return this.#data.id;
  }

  get name(): string {
    return this.#data.name;
  }

  get isDoorbot(): boolean {
    return this.#data.isDoorbot;
  }

  get hasBattery(): boolean {
    return this.#data.hasBattery;
  }

  get batteryLevel(): number | null {
    return this.#data.batteryLevel;
  }

  get hasLowBattery(): boolean {
    return this.#data.hasLowBattery;
  }

  get isOffline(): boolean {
    return this.#data.isOffline;
  }

  updateData(data: FakeCameraData): void {
    this.#data = data;
  }
}

export interface FakeLocation extends RingClientLocation {
  /** Replaceable, so a test can model a location without cameras. */
  cameras: readonly RingClientCamera[];
  /** The library's device list: the latest at once, then each time it grows. */
  readonly devicesStream: FakeRingStream<readonly RingClientDevice[]>;
  /** Each hub's list as Ring sends it, with no replay. */
  readonly deviceListStream: FakeRingStream<RingClientDeviceList>;
  /** The live connection, as the library's `BehaviorSubject`: `false` until a test opens it. */
  readonly connectedStream: FakeRingStream<boolean>;
  /**
   * Ring sends a hub's full device list, as on a (re)connect, and the library takes it in as
   * ring-client-api does: a device it did not have is added, and the list emitted when it grew; a
   * listed device it had gets the listed data again; a device the list leaves out stays.
   */
  sendDeviceList(devices: readonly FakeDevice[], hub?: string): void;
}

function fakeLocation(
  id: string,
  ownerId: number,
  options: {
    readonly alarm: boolean;
    readonly devices: readonly FakeDevice[];
  },
): FakeLocation {
  let devices: readonly RingClientDevice[] = options.devices;
  const devicesStream = new FakeRingStream<readonly RingClientDevice[]>({
    value: devices,
  });
  const deviceListStream = new FakeRingStream<RingClientDeviceList>();
  const connectedStream = new FakeRingStream<boolean>({ value: false });
  const sendDeviceList = (
    listed: readonly FakeDevice[],
    hub: string = FAKE_HUB,
  ): void => {
    const added = listed.filter(
      (device) => !devices.some((known) => known.data.zid === device.data.zid),
    );
    for (const device of listed) {
      if (!added.includes(device)) {
        device.stream.emit({ ...device.data });
      }
    }
    if (added.length > 0) {
      devices = [...devices, ...added];
      devicesStream.emit(devices);
    }
    deviceListStream.emit({
      src: hub,
      body: listed.map((device) => ({
        general: { v2: { zid: device.data.zid } },
      })),
    });
  };
  return {
    id,
    locationDetails: {
      name: `Home ${id}`,
      owner_id: ownerId,
      address: { timezone: "Europe/Athens" },
    },
    hasAlarmBaseStation: options.alarm,
    // As ring-client-api: a location with an alarm hub has one; the second location has none.
    hasHubs: options.alarm,
    onConnected: connectedStream,
    connectedStream,
    cameras: [new FakeCamera(FAKE_DOORBELL)],
    getDevices: () => Promise.resolve(devices),
    getAlarmMode: () => Promise.resolve("some"),
    onDevices: devicesStream,
    devicesStream,
    onDeviceList: deviceListStream,
    deviceListStream,
    sendDeviceList,
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
  /** The cameras' data as Ring would answer now; tests change it to model a change at Ring. */
  upstreamCameras: readonly FakeCameraData[] = [FAKE_DOORBELL];
  getLocationsCalls = 0;
  fetchRingDevicesCalls = 0;
  getProfileCalls = 0;
  disconnected = false;
  /** Every request that reaches Ring fails this way while it is set: an outage. */
  nextFailure: (() => Promise<never>) | undefined;
  #located = false;

  // As ring-client-api does: the locations are fetched once, then the same objects come from its
  // memory, even while Ring is down (CP-09 review round 5).
  async getLocations(): Promise<readonly RingClientLocation[]> {
    this.getLocationsCalls += 1;
    if (this.#located) {
      return this.locationsList;
    }
    await this.nextFailure?.();
    this.#located = true;
    return this.locationsList;
  }

  async fetchRingDevices(): Promise<{
    readonly allCameras: readonly FakeCameraData[];
  }> {
    this.fetchRingDevicesCalls += 1;
    await this.nextFailure?.();
    return { allCameras: this.upstreamCameras };
  }

  async getProfile(): Promise<{ readonly profile: { readonly id: number } }> {
    this.getProfileCalls += 1;
    await this.nextFailure?.();
    return { profile: { id: FAKE_RING_PROFILE_ID } };
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
