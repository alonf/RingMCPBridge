// The Ring Adapter's port (CP-07, T013): what the home connector reads from Ring. Only the bridge's
// own data crosses it, never a ring-client-api type, error or event (plan "The Ring boundary stays
// swappable", S1). The real adapter (T013) and the scenario engine (T009) both implement it, so
// every test that needs Ring runs against the engine.
//
// Field names are the link contract's (`contracts/connector-link.md`, "Device inventory and
// state"), so Ingest maps a Ring entry to a link entry by adding `as_of` and `state_version`.
// Names and rooms come from Ring: untrusted text, in any language, kept exactly as written and
// never logged (FR-002, FR-033, OR6).

/** The device types the bridge knows (data-model "Device"); anything else is `other`. */
export type RingDeviceType =
  | "contact"
  | "motion"
  | "flood"
  | "keypad"
  | "base_station"
  | "camera"
  | "doorbell"
  | "light"
  | "other";

/** A location's alarm mode (data-model "Location"). */
export type RingAlarmMode = "disarmed" | "home" | "away";

/** Whether the owner's account owns the location or was given a share of it (FR-036). */
export type RingOwnership = "owned" | "shared";

/** How a device is powered. A wired device reports no battery. */
export type RingPowerMode = "battery" | "wired";

/**
 * The Ring session: `ok`; `unavailable` while Ring is down or refusing (a 5xx, a 429 past the
 * backoff, or a 406, which counts as blocking, R25); `lost` when the token was refused and the owner
 * must sign in again with the Setup CLI.
 */
export type RingSessionStatus = "ok" | "unavailable" | "lost";

/** A device's current state as JSON; its fields depend on the device type. */
export type RingDeviceState = Readonly<Record<string, unknown>>;

/** One Ring location. */
export interface RingLocation {
  readonly location_id: string;
  /** Untrusted text from Ring. */
  readonly name: string;
  /** An IANA time zone. */
  readonly time_zone: string;
  /** Absent when the location has no alarm. */
  readonly alarm_mode?: RingAlarmMode;
  readonly ownership: RingOwnership;
}

/** One Ring device at a location. */
export interface RingDevice {
  readonly device_id: string;
  readonly location_id: string;
  /** Untrusted text from Ring. */
  readonly name: string;
  readonly type: RingDeviceType;
  /** Untrusted text from Ring; absent when the device has no room. */
  readonly room?: string;
  /** 0 to 100; absent for a wired device or when Ring does not say. */
  readonly battery_pct?: number;
  /** Ring's own low-battery flag; absent when Ring does not say. */
  readonly battery_low?: boolean;
  readonly power_mode: RingPowerMode;
  readonly online: boolean;
  readonly state: RingDeviceState;
}

/**
 * Something Ring reported: a device's full current entry, a location's (an alarm mode change), a
 * location's device list (a device added or removed: read the location again), or the session
 * status.
 */
export type RingChange =
  | { readonly kind: "device"; readonly device: RingDevice }
  | { readonly kind: "location"; readonly location: RingLocation }
  | { readonly kind: "device_list"; readonly location_id: string }
  | { readonly kind: "session"; readonly status: RingSessionStatus };

/** Stops a watch. */
export type StopWatching = () => void;

/** What the home connector reads from Ring. */
export interface RingPort {
  /** The session status now. */
  sessionStatus(): RingSessionStatus;
  /**
   * Every location the account sees. Throws `RingAdapterError`: `ring_unavailable` while Ring is
   * down or refusing, `session_lost` when the owner must sign in again.
   */
  locations(signal: AbortSignal): Promise<readonly RingLocation[]>;
  /** Every device at one location; none for a location Ring does not know. Throws as `locations`. */
  devices(
    locationId: string,
    signal: AbortSignal,
  ): Promise<readonly RingDevice[]>;
  /** Calls `listener` with each change Ring reports, in order, until stopped. */
  watch(listener: (change: RingChange) => void): StopWatching;
}
