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
 * What a location's alarm panel says beyond its mode (T062): whether the alarm is going off, and
 * whether an exit delay is running. Never sent to the core as state; Ingest reads events from it.
 */
export interface RingPanel {
  readonly location_id: string;
  /**
   * Ring's alarm state, such as `burglar-alarm`, `fire-alarm` or `entry-delay`; absent while the
   * alarm is quiet. Untrusted: compared against known values, never shown.
   */
  readonly alarm_state?: string;
  /** Ring's id for this alarm, stable while it lasts; absent when Ring gives none. */
  readonly alarm_id?: string;
  /** When the alarm began, by Ring's clock, in epoch milliseconds; absent when Ring gives none. */
  readonly alarm_at?: number;
  /** The devices Ring names as having set the alarm off. */
  readonly faulted_device_ids: readonly string[];
  /** When a running exit or entry delay ends, in epoch milliseconds; absent when none runs. */
  readonly delay_until?: number;
}

/**
 * Something Ring reported: a device's full current entry, a location's (an alarm mode change), its
 * alarm panel's (T062), a location's device list (a device added or removed: read the location
 * again), or the session status.
 */
export type RingChange =
  | { readonly kind: "device"; readonly device: RingDevice }
  | { readonly kind: "location"; readonly location: RingLocation }
  | { readonly kind: "panel"; readonly panel: RingPanel }
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

/**
 * A push notification Ring sent about a camera, doorbell or intercom (CP-08b, T038). Alarm sensors
 * do not come this way: their changes arrive on the hub's live connection, as `RingChange`.
 */
export interface RingPush {
  readonly ownership?: "shared";
  readonly device_id: string;
  readonly location_id: string;
  /** The camera's type: a doorbell or another camera (T050's review, DRIFT-002-19). */
  readonly device_type: "doorbell" | "camera";
  /** Ring's payload as sent: untrusted, read tolerantly by its reader, and never logged. */
  readonly payload: unknown;
}

/**
 * One event from a camera's or doorbell's history (T053): what the push channel would have
 * brought. Ring's text is not in it, but the id, which the bridge reads as an opaque string.
 */
export interface RingHistoryEntry {
  readonly ownership?: "shared";
  readonly device_id: string;
  readonly location_id: string;
  readonly device_type: "doorbell" | "camera";
  /** Ring's id for the event: the push's own id, so a recovered event has the push's event id. */
  readonly ring_event_id: string;
  /** `motion`, `ding`, or `other` for a kind the bridge does not know. */
  readonly kind: "motion" | "ding" | "other";
  /** Whether Ring reported a person with it. */
  readonly person: boolean;
  /** When it happened, in UTC milliseconds, by Ring's time. */
  readonly occurred_at: number;
  /** The camera's name as Ring gave it: untrusted text, never logged. */
  readonly name?: string;
}

/** What a history read found: the entries newest first, and whether it stopped short. */
export interface RingHistoryRead {
  readonly entries: readonly RingHistoryEntry[];
  /** True when the read stopped before it reached the time asked: events may be missing. */
  readonly truncated: boolean;
}

/** Ring's history of its cameras, apart from `RingPort` so a reader of state need not carry it. */
export interface RingHistoryPort {
  /**
   * The owned cameras' events newer than `sinceMs`, through the shared gate, a page at a time.
   * Throws `RingAdapterError` as `RingPort.locations` does.
   */
  cameraHistory(
    sinceMs: number | ((cameraId: string) => number),
    signal: AbortSignal,
    options?: { readonly maxPages?: number },
  ): Promise<RingHistoryRead & { readonly completeCameras: readonly string[] }>;
}

/** Ring's push notifications, apart from `RingPort` so a reader of state need not carry it. */
export interface RingPushPort {
  /** Calls `listener` with each push notification Ring delivers, in order, until stopped. */
  watchPush(listener: (push: RingPush) => void): StopWatching;
}
