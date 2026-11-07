// Event's intake from the home link (CP-11a): what Connector Link hands over, in Event's own DTOs
// (CD4: the callee declares). Declared at T017, ahead of the Event manager (T018), which implements
// it. Each call resolves once Event has committed the message, so Connector Link sends `ack` only
// then (AC B10). A call that fails leaves the message unacked, and the home sends it again.
//
// The design draws this hand-over as queued (CD map: Connector Link -> Event). It is an awaited
// call instead, because the ack waits for the commit, and Pub/Sub tells a publisher nothing. Event
// may still queue its own work inside (DRIFT-001-26).
//
// Field names are the link contract's (contracts/connector-link.md); times are UTC milliseconds
// since 1970. Names, rooms, time zones and a device's `state` come from Ring: untrusted text, never
// logged (FR-033, FR-034).

/** A device's type, as the home reports it. */
export type HomeDeviceType =
  | "contact"
  | "motion"
  | "flood"
  | "keypad"
  | "base_station"
  | "camera"
  | "doorbell"
  | "light"
  | "other";

/** A location, as an inventory carries it. */
export interface IncomingLocation {
  readonly location_id: string;
  readonly name: string;
  readonly time_zone: string;
  readonly alarm_mode?: "disarmed" | "home" | "away";
  readonly ownership: "owned" | "shared";
  readonly as_of: number;
  readonly state_version: number;
}

/** A device's full current entry, never a delta (DRIFT-001-06). */
export interface IncomingDevice {
  readonly device_id: string;
  readonly location_id: string;
  readonly name: string;
  readonly type: HomeDeviceType;
  readonly room?: string;
  readonly battery_pct?: number;
  readonly battery_low?: boolean;
  readonly power_mode: "battery" | "wired";
  readonly online: boolean;
  readonly state: Readonly<Record<string, unknown>>;
  readonly as_of: number;
  readonly state_version: number;
}

/** A full snapshot of the home (PT-30). */
export interface IncomingInventory {
  readonly message_id: string;
  readonly locations: readonly IncomingLocation[];
  readonly devices: readonly IncomingDevice[];
}

/** One device's state changed (PT-30). */
export interface IncomingDeviceState {
  readonly message_id: string;
  readonly device: IncomingDevice;
}

/** The home's health summary, every 15 s. */
export interface IncomingHeartbeat {
  readonly ring_session: "ok" | "unavailable" | "lost";
  readonly push: "off" | "ok" | "failing";
  /** `null` when the home could not read its outbox. */
  readonly outbox_depth: number | null;
  /** `null` until events arrive (iteration 002). */
  readonly last_ring_event_at: number | null;
  readonly error_counts: Readonly<Record<string, number>>;
  readonly as_of: number;
}

/** The home's session the messages came on: the connector proved its key for it. */
export interface HomeLinkSession {
  /** The connector's session id, on every log line (OR2). */
  readonly session_id: string;
  /** The connector's version, for "connector behind" on the admin page. */
  readonly connector_version: string;
  /** The link protocol version the session speaks. */
  readonly version: number;
}

/**
 * What Event takes from the home link. Each call resolves after Event has committed; a failure is
 * Event's own error, which Connector Link logs once. The signal ends when the link closes.
 */
export interface EventIntake {
  /** A session opened: the home link is up, at this connector version. */
  homeSessionOpened(
    session: HomeLinkSession,
    signal: AbortSignal,
  ): Promise<void>;
  inventory(
    inventory: IncomingInventory,
    session: HomeLinkSession,
    signal: AbortSignal,
  ): Promise<void>;
  deviceState(
    change: IncomingDeviceState,
    session: HomeLinkSession,
    signal: AbortSignal,
  ): Promise<void>;
  heartbeat(
    heartbeat: IncomingHeartbeat,
    session: HomeLinkSession,
    signal: AbortSignal,
  ): Promise<void>;
}
