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
  /** The security panel's alarm, while it goes off or counts down (T062): untrusted, read tolerantly. */
  readonly alarmInfo?: unknown;
  /** When the security panel's exit or entry delay ends, in epoch milliseconds. */
  readonly transitionDelayEndTimestamp?: number | null;
  /** The room in its hub's room list (`getRoomList`); absent when Ring gives it none. */
  readonly roomId?: number;
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

/** One event in a camera's history, as Ring lists it (T053). Read tolerantly: the shape is the library's. */
export interface RingClientCameraEvent {
  /** When Ring made it: an ISO time. */
  readonly created_at: string;
  /** Ring's id for the event, as text: the push's own id. */
  readonly ding_id_str: string;
  /** `motion`, `ding`, or another kind Ring names. */
  readonly kind: string;
  readonly cv_properties?: {
    readonly person_detected?: unknown;
    readonly detection_type?: unknown;
  };
}

/** A page of a camera's history, newest first, and where the next page starts. */
export interface RingClientCameraEvents {
  readonly events: readonly RingClientCameraEvent[];
  readonly meta?: { readonly pagination_key?: string };
}

/**
 * A camera or doorbell. ring-client-api builds it once, with the data of the first read, and
 * changes it only when its data is replaced: the adapter does that on each read (`updateData`).
 */
export interface RingClientCamera extends RingClientCameraFields {
  updateData(data: RingClientCameraData): void;
  /** A page of the camera's history, newest first (T053). */
  getEvents(options?: {
    readonly limit?: number;
    readonly pagination_key?: string;
  }): Promise<RingClientCameraEvents>;
  /**
   * Each push notification Ring sends about the device, as the library parsed it (no replay). The
   * library drops what arrives in its first two seconds and any format it does not know.
   */
  readonly onNewNotification: RingClientStream<unknown>;
}

/** A location's details as Ring sends them. */
export interface RingClientLocationDetails {
  readonly name: string;
  readonly owner_id: number;
  readonly address: { readonly timezone: string };
}

/**
 * A hub's session as Ring reports it on the live connection: `online`, or not (`unknown` when the
 * hub is offline, `cell-backup` on its cellular backup; any other word is taken as not online).
 */
export interface RingClientAssetSession {
  readonly assetUuid: string;
  readonly connectionStatus: string;
}

/** A hub (Ring's asset) the location's live connection serves, as its ticket lists it. */
export interface RingClientAsset {
  readonly uuid: string;
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
  /**
   * The hubs the live connection serves: set by the library as it connects, absent before. A
   * session for any other asset is ignored, as the library ignores it.
   */
  readonly assets?: readonly RingClientAsset[] | undefined;
  /**
   * The sessions of the location's hubs, each time Ring reports them (no replay). The live
   * connection can stay open while a hub behind it is offline (DRIFT-001-86).
   */
  readonly onSessionInfo: RingClientStream<readonly RingClientAssetSession[]>;
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
  /**
   * A hub's room list, as Ring sends it: untyped in the library, so read tolerantly. The library
   * waits for Ring's answer with no limit of its own, so the caller bounds the wait.
   */
  getRoomList(assetId: string): Promise<unknown>;
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
