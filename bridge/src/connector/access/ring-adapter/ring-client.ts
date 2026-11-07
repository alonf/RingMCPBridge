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
  readonly cameras: readonly RingClientCamera[];
  getDevices(): Promise<readonly RingClientDevice[]>;
  /** `none`, `some` or `all`. */
  getAlarmMode(): Promise<string>;
  /** The alarm devices, each time the list changes. */
  readonly onDevices: RingClientStream<readonly RingClientDevice[]>;
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
