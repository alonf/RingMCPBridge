// The parts of ring-client-api the Ring Adapter uses, as the adapter's own narrow types. The real
// `RingApi` fits them (`ring-client.live.ts` checks that at compile time), and the tests use fakes.
// Nothing here imports ring-client-api, so its types stay behind this boundary (plan "The Ring
// boundary stays swappable").

/** Something to subscribe to, as an rxjs Observable is. */
export interface RingClientStream<T> {
  subscribe(next: (value: T) => void): { unsubscribe(): void };
}

/** A device's data as Ring sends it. Every field is read tolerantly. */
export interface RingClientDeviceData {
  readonly zid: string;
  readonly name: string;
  readonly deviceType: string;
  readonly batteryLevel?: number;
  readonly batteryStatus?: string;
  readonly acStatus?: string;
  /** Not in ring-client-api's types, but in Ring's device documents. */
  readonly commStatus?: string;
  readonly faulted?: boolean;
  readonly motionStatus?: string;
  readonly tamperStatus?: string;
  readonly flood?: { readonly faulted?: boolean };
  readonly on?: boolean;
  readonly level?: number;
  readonly mode?: string;
}

/** An alarm device, such as a sensor, keypad or base station. */
export interface RingClientDevice {
  readonly data: RingClientDeviceData;
  /** The device's full data now and after each change. */
  readonly onData: RingClientStream<RingClientDeviceData>;
  /** The hub (Ring's asset) whose device list names the device. */
  readonly assetId: string;
}

/** One device's document in a hub's device list: only its id is read. */
export interface RingClientDeviceDocument {
  readonly general?: { readonly v2?: { readonly zid?: unknown } };
}

/**
 * A hub's full list of its alarm devices, as Ring sends it on each (re)connect of the live
 * connection: every device the hub has now.
 */
export interface RingClientDeviceList {
  /** The hub (Ring's asset) the list is for. */
  readonly src: string;
  /** Absent or empty when Ring sent no list. */
  readonly body?: readonly RingClientDeviceDocument[];
}

/** A camera's data as Ring sends it. The adapter only hands it back to its camera. */
export interface RingClientCameraData {
  readonly id: number;
}

/** What a camera or doorbell reports: the fields the mapping reads. */
export interface RingClientCameraFields {
  readonly id: number;
  readonly name: string;
  readonly isDoorbot: boolean;
  readonly hasBattery: boolean;
  readonly batteryLevel: number | null;
  readonly hasLowBattery: boolean;
  readonly isOffline: boolean;
}

/**
 * A camera or doorbell. ring-client-api builds it once, with the data of the first read, and
 * changes it only when its data is replaced: the adapter does that on each read (`updateData`).
 */
export interface RingClientCamera extends RingClientCameraFields {
  updateData(data: RingClientCameraData): void;
}

/** A location's details as Ring sends them. */
export interface RingClientLocationDetails {
  readonly name: string;
  readonly owner_id: number;
  readonly address: { readonly timezone: string };
}

/** One location. */
export interface RingClientLocation {
  readonly id: string;
  readonly locationDetails: RingClientLocationDetails;
  readonly hasAlarmBaseStation: boolean;
  /**
   * True when the location has an alarm hub or bridge: only then does the library keep a live
   * connection to Ring for it.
   */
  readonly hasHubs: boolean;
  /**
   * Whether the library's live connection for the location is open, now and on each change. It
   * starts `false`, before the first connection, and goes `false` while the library reconnects.
   */
  readonly onConnected: RingClientStream<boolean>;
  readonly cameras: readonly RingClientCamera[];
  getDevices(): Promise<readonly RingClientDevice[]>;
  /** `none`, `some` or `all`. */
  getAlarmMode(): Promise<string>;
  /**
   * The alarm devices: the latest list at once, then each time it grows. The library only ever adds
   * to it: a device removed in Ring stays, and `getDevices` still returns it.
   */
  readonly onDevices: RingClientStream<readonly RingClientDevice[]>;
  /** Each hub's device list as Ring sends it, which tells a removed device (no replay). */
  readonly onDeviceList: RingClientStream<RingClientDeviceList>;
}

/** The client: the owner's Ring account. */
export interface RingClient {
  /** The locations, built once on the first call: later calls return the same objects. */
  getLocations(): Promise<readonly RingClientLocation[]>;
  /** Every device on the account, fresh from Ring: one call. */
  fetchRingDevices(): Promise<{
    readonly allCameras: readonly RingClientCameraData[];
  }>;
  getProfile(): Promise<{ readonly profile: { readonly id: number } }>;
  /** Ring rotated the refresh token; the new one must be saved. */
  readonly onRefreshTokenUpdated: RingClientStream<{
    readonly newRefreshToken: string;
  }>;
  disconnect(): void;
}
