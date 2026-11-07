// Event's intake from the home link (CP-11a): what Connector Link hands over, in Event's own DTOs
// (CD4: the callee declares). Declared at T017; the Event manager implements it (T018). Each call
// resolves once Event has committed the message, or decided it never will, with an outcome that
// says which; Connector Link sends `ack` only then (AC B10). A call that fails leaves the message
// unacked, and the home sends it again.
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
  /** The key the connector proved: State's versions belong to one key at a time (T018). */
  readonly key_id: string;
  /** The connector's version, for "connector behind" on the admin page. */
  readonly connector_version: string;
  /** The link protocol version the session speaks. */
  readonly version: number;
}

/**
 * What became of an inventory:
 * - `applied`: committed; `refused` entries could not be stored and were left out, `removed` ones
 *   Ring no longer lists;
 * - `not_current`: it came on a session of a key that is no longer the current one; nothing changed.
 */
export type InventoryOutcome =
  | {
      readonly kind: "applied";
      readonly refused: number;
      readonly removed: number;
    }
  | { readonly kind: "not_current" };

/**
 * What became of a device change; each ends the message, so Connector Link acks it:
 * - `applied`: committed;
 * - `older`: State holds this version or a newer one; nothing changed;
 * - `needs_inventory`: State does not hold the device or its location; only an inventory brings
 *   them, so Connector Link asks the home for one;
 * - `refused`: it cannot be stored (an id longer than its column); nothing changed;
 * - `not_current`: it came on a session of a key that is no longer the current one.
 */
export type DeviceChangeOutcome =
  "applied" | "older" | "needs_inventory" | "refused" | "not_current";

/** The bridge's health, as Event stores and publishes it. A field not known is left out. */
export interface HomeHealth {
  readonly home_link_status?: "up" | "down";
  readonly home_link_since?: number;
  readonly ring_session_status?: "ok" | "unavailable" | "lost";
  readonly ring_session_since?: number;
  readonly push_status?: "ok" | "down";
  readonly push_since?: number;
  readonly last_event_at?: number;
  readonly stale_since?: number;
  readonly outbox_depth?: number;
  readonly connector_version?: string;
  /** The last sign of life from home, on the core's clock. */
  readonly as_of: number;
}

/** A change of the home link's or the Ring session's status, published on Pub/Sub. */
export interface HealthChanged {
  readonly changed: readonly ("home_link" | "ring_session")[];
  readonly health: HomeHealth;
}

/** The Pub/Sub topics Event publishes. */
export interface EventTopics extends Record<string, unknown> {
  readonly "health.changed": HealthChanged;
}

/**
 * What Event takes from the home link. Each call resolves after Event has committed, with its
 * outcome; a failure is Event's own error, which Connector Link logs once. The signal ends when the
 * link closes.
 */
export interface EventIntake {
  /** A session opened: the home link is up, at this connector version, for this key. */
  homeSessionOpened(
    session: HomeLinkSession,
    signal: AbortSignal,
  ): Promise<void>;
  inventory(
    inventory: IncomingInventory,
    session: HomeLinkSession,
    signal: AbortSignal,
  ): Promise<InventoryOutcome>;
  deviceState(
    change: IncomingDeviceState,
    session: HomeLinkSession,
    signal: AbortSignal,
  ): Promise<DeviceChangeOutcome>;
  heartbeat(
    heartbeat: IncomingHeartbeat,
    session: HomeLinkSession,
    signal: AbortSignal,
  ): Promise<void>;
}
