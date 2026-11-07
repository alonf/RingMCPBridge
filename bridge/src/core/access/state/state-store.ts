// State (CP-14, T019): the core's picture of the home, filled from the link's inventory and device
// changes (PT-30) and read by Inquiry for the four read tools. It owns `location`, `device` and
// `health_snapshot`, and no row, column or statement leaves it (CD4, DS6).
//
// - **Latest wins.** A location or device is written only when its `state_version` is higher than
//   the stored one, in one conditional statement, so a resent or late message never rolls state
//   back and no field is lost (PT-30, DRIFT-001-06, DRIFT-001-08).
// - **A full snapshot removes what Ring no longer lists.** The home draws an inventory's versions
//   in one block, so an entry stored below the snapshot's lowest version, and absent from it, is
//   gone at Ring. A newer change keeps its higher version and stays (T019).
// - **Only an inventory adds a device.** A device change updates a device State holds, so a late
//   change cannot bring back one a snapshot removed (T019 follow-up).
// - **The same input is accepted on both dialects.** An id over the column's size, or a time zone
//   over 64 characters, leaves that entry out, counted; a name or room over 400 characters is cut
//   to fit. One odd entry never stops the rest of an inventory from being stored (T019).
// - **Field names** are the contract's; a device's `type` is stored in the column `kind` (PT-26).
//   Times are UTC milliseconds since 1970. Names, rooms and `state` are untrusted text from Ring,
//   stored as written and never logged (FR-002, FR-033).
import { z } from "zod";
import {
  QueryLayerError,
  upsertStatement,
} from "../../../utilities/query-layer/index.ts";
import type {
  QueryLayer,
  SqlDialect,
  SqlParams,
  SqlRow,
  SqlSession,
  SqlStatement,
} from "../../../utilities/query-layer/index.ts";
import { StateStoreError } from "./state-store-error.ts";

const DEVICE_TYPES = [
  "contact",
  "motion",
  "flood",
  "keypad",
  "base_station",
  "camera",
  "doorbell",
  "light",
  "other",
] as const;
const ALARM_MODES = ["disarmed", "home", "away"] as const;
const OWNERSHIPS = ["owned", "shared"] as const;
const POWER_MODES = ["battery", "wired"] as const;
const HOME_LINK_STATUSES = ["up", "down"] as const;
const RING_SESSION_STATUSES = ["ok", "unavailable", "lost"] as const;
const PUSH_STATUSES = ["ok", "down"] as const;

// The column sizes on SQL Server, checked here so both dialects take the same input.
const MAX_ID_LENGTH = 128;
const MAX_TEXT_LENGTH = 400;
const MAX_TIME_ZONE_LENGTH = 64;
const MAX_VERSION_LENGTH = 64;
const SNAPSHOT_ROW = 1;
const HIGH_SURROGATE_START = 0xd800;
const HIGH_SURROGATE_END = 0xdbff;

/** A device's type, as the contract names it (PT-26). */
export type DeviceType = (typeof DEVICE_TYPES)[number];

/** A location as State keeps it. */
export interface LocationState {
  readonly location_id: string;
  readonly name: string;
  readonly ownership: (typeof OWNERSHIPS)[number];
  /** The IANA zone every `*_local` time uses (FR-006). */
  readonly time_zone: string;
  readonly alarm_mode?: (typeof ALARM_MODES)[number];
  readonly as_of: number;
  readonly state_version: number;
}

/** A device's full entry as State keeps it, never a delta. */
export interface DeviceState {
  readonly device_id: string;
  readonly location_id: string;
  readonly name: string;
  readonly type: DeviceType;
  readonly room?: string;
  readonly battery_pct?: number;
  readonly battery_low?: boolean;
  readonly power_mode: (typeof POWER_MODES)[number];
  readonly online: boolean;
  readonly state: Readonly<Record<string, unknown>>;
  readonly as_of: number;
  readonly state_version: number;
}

/** A full snapshot of the home, as the link's `inventory` carries it. */
export interface InventorySnapshot {
  readonly locations: readonly LocationState[];
  readonly devices: readonly DeviceState[];
}

/** What applying an inventory changed. */
export interface InventoryApplied {
  /**
   * Entries left out: an id longer than its column, a time zone over 64 characters, or a device
   * whose location is neither in the snapshot nor stored.
   */
  readonly refused: number;
  /** Devices and locations removed because Ring no longer lists them. */
  readonly removed: number;
}

/**
 * - `applied`: the device is updated;
 * - `older`: State already holds this version or a newer one; nothing changed;
 * - `unknown_device`: State does not hold the device: only an inventory adds one, so a late change
 *   cannot bring back a device Ring no longer lists. Nothing changed; an inventory brings it;
 * - `unknown_location`: the change moves it to a location State does not hold; nothing changed;
 * - `refused`: an id is longer than its column; nothing changed.
 */
export type DeviceApplied =
  "applied" | "older" | "unknown_device" | "unknown_location" | "refused";

/** Which devices to read; each filter left out matches every device. */
export interface DeviceFilter {
  readonly location_id?: string;
  readonly type?: DeviceType;
  /** Matched against the stored room exactly, as the contract says. */
  readonly room?: string;
}

/** The bridge's health as last worked out, for `get_health` and the admin page. */
export interface HealthSnapshot {
  readonly home_link_status?: (typeof HOME_LINK_STATUSES)[number];
  readonly home_link_since?: number;
  readonly ring_session_status?: (typeof RING_SESSION_STATUSES)[number];
  readonly ring_session_since?: number;
  /** Ring push, from iteration 002. */
  readonly push_status?: (typeof PUSH_STATUSES)[number];
  readonly push_since?: number;
  /** From iteration 002, when events arrive. */
  readonly last_event_at?: number;
  /** Since when the home's data has been stale (FR-005). */
  readonly stale_since?: number;
  readonly outbox_depth?: number;
  readonly connector_version?: string;
  readonly as_of: number;
}

/** What State is wired with. */
export interface StateStoreOptions {
  /** The core's database (Azure SQL in mode H, SQLite in mode A), migrated by the Host. */
  readonly store: QueryLayer;
}

const LOCATION_COLUMNS =
  "location_id, name, ownership, time_zone, alarm_mode, as_of, state_version";
const DEVICE_COLUMNS =
  "device_id, location_id, name, kind, room, battery_pct, battery_low, power_mode, online, state, as_of, state_version";
const HEALTH_COLUMNS =
  "home_link_status, home_link_since, ring_session_status, ring_session_since, push_status, push_since, last_event_at, stale_since, outbox_depth, connector_version, as_of";

const SELECT_LOCATIONS = `SELECT ${LOCATION_COLUMNS} FROM location ORDER BY location_id`;
const SELECT_LOCATION = `SELECT ${LOCATION_COLUMNS} FROM location WHERE location_id = @location_id`;
const SELECT_LOCATION_VERSIONS =
  "SELECT location_id, state_version FROM location";
const SELECT_DEVICE = `SELECT ${DEVICE_COLUMNS} FROM device WHERE device_id = @device_id`;
const UPDATE_DEVICE =
  "UPDATE device SET location_id = @location_id, name = @name, kind = @kind, room = @room, battery_pct = @battery_pct, battery_low = @battery_low, power_mode = @power_mode, online = @online, state = @state, as_of = @as_of, state_version = @state_version WHERE device_id = @device_id AND state_version < @state_version";
const SELECT_DEVICE_ID =
  "SELECT device_id FROM device WHERE device_id = @device_id";
const SELECT_DEVICE_VERSIONS = "SELECT device_id, state_version FROM device";
const DELETE_DEVICE =
  "DELETE FROM device WHERE device_id = @device_id AND state_version < @below";
const DELETE_LOCATION =
  "DELETE FROM location WHERE location_id = @location_id AND state_version < @below AND NOT EXISTS (SELECT 1 FROM device WHERE device.location_id = location.location_id)";
const SELECT_HEALTH = `SELECT ${HEALTH_COLUMNS} FROM health_snapshot WHERE snapshot_id = ${String(SNAPSHOT_ROW)}`;
const RESET_LOCATION_VERSIONS = "UPDATE location SET state_version = 0";
const RESET_DEVICE_VERSIONS = "UPDATE device SET state_version = 0";

const storedTime = z.number().int();
const flag = z.union([z.literal(0), z.literal(1)]);

const LOCATION_ROW = z.object({
  location_id: z.string(),
  name: z.string(),
  ownership: z.enum(OWNERSHIPS),
  time_zone: z.string(),
  alarm_mode: z.enum(ALARM_MODES).nullable(),
  as_of: storedTime,
  state_version: z.number().int(),
});

const DEVICE_ROW = z.object({
  device_id: z.string(),
  location_id: z.string(),
  name: z.string(),
  kind: z.enum(DEVICE_TYPES),
  room: z.string().nullable(),
  battery_pct: z.number().int().nullable(),
  battery_low: flag.nullable(),
  power_mode: z.enum(POWER_MODES),
  online: flag,
  state: z.string(),
  as_of: storedTime,
  state_version: z.number().int(),
});

const HEALTH_ROW = z.object({
  home_link_status: z.enum(HOME_LINK_STATUSES).nullable(),
  home_link_since: storedTime.nullable(),
  ring_session_status: z.enum(RING_SESSION_STATUSES).nullable(),
  ring_session_since: storedTime.nullable(),
  push_status: z.enum(PUSH_STATUSES).nullable(),
  push_since: storedTime.nullable(),
  last_event_at: storedTime.nullable(),
  stale_since: storedTime.nullable(),
  outbox_depth: z.number().int().nullable(),
  connector_version: z.string().nullable(),
  as_of: storedTime,
});

const VERSION_ROW = z.object({ state_version: z.number().int() });

/** The core's State. One per core process, over the core's database. */
export class StateStore {
  readonly #store: QueryLayer;

  constructor(options: StateStoreOptions) {
    this.#store = options.store;
  }

  /**
   * Applies a full snapshot in one transaction: each location, then each device, latest-wins;
   * then removes what the snapshot leaves out and is stored below its lowest version.
   */
  async applyInventory(
    snapshot: InventorySnapshot,
    signal: AbortSignal,
  ): Promise<InventoryApplied> {
    return this.#guard(signal, "The inventory could not be stored.", () =>
      this.#store.transaction(
        (session) => applySnapshot(session, snapshot, signal),
        signal,
      ),
    );
  }

  /**
   * Applies one device's full entry to a device State holds, latest-wins, in one conditional
   * statement (a `device_state` message).
   */
  async applyDevice(
    device: DeviceState,
    signal: AbortSignal,
  ): Promise<DeviceApplied> {
    if (!fitsDevice(device)) {
      return "refused";
    }
    try {
      const changed = await this.#guard(
        signal,
        "The device could not be stored.",
        () =>
          this.#store.run(
            statement(UPDATE_DEVICE, deviceValues(device)),
            signal,
          ),
      );
      if (changed > 0) {
        return "applied";
      }
      const held = await this.#guard(
        signal,
        "The device could not be read.",
        () =>
          this.#store.get(
            statement(SELECT_DEVICE_ID, { device_id: device.device_id }),
            signal,
          ),
      );
      return held === undefined ? "unknown_device" : "older";
    } catch (error) {
      if (
        error instanceof StateStoreError &&
        error.cause instanceof QueryLayerError &&
        error.cause.kind === "constraint_violated"
      ) {
        return "unknown_location";
      }
      throw error;
    }
  }

  /** Every location, ordered by id. */
  async locations(signal: AbortSignal): Promise<readonly LocationState[]> {
    const rows = await this.#guard(
      signal,
      "The locations could not be read.",
      () => this.#store.all(statement(SELECT_LOCATIONS), signal),
    );
    return rows.map(locationOf);
  }

  /** One location, or `undefined` when it is not stored. */
  async location(
    locationId: string,
    signal: AbortSignal,
  ): Promise<LocationState | undefined> {
    const row = await this.#guard(
      signal,
      "The location could not be read.",
      () =>
        this.#store.get(
          statement(SELECT_LOCATION, { location_id: locationId }),
          signal,
        ),
    );
    return row === undefined ? undefined : locationOf(row);
  }

  /** The devices that match `filter`, ordered by id. */
  async devices(
    filter: DeviceFilter,
    signal: AbortSignal,
  ): Promise<readonly DeviceState[]> {
    const rows = await this.#guard(
      signal,
      "The devices could not be read.",
      () => this.#store.all(deviceQuery(filter), signal),
    );
    return rows.map(deviceOf);
  }

  /** One device, or `undefined` when it is not stored. */
  async device(
    deviceId: string,
    signal: AbortSignal,
  ): Promise<DeviceState | undefined> {
    const row = await this.#guard(signal, "The device could not be read.", () =>
      this.#store.get(
        statement(SELECT_DEVICE, { device_id: deviceId }),
        signal,
      ),
    );
    return row === undefined ? undefined : deviceOf(row);
  }

  /** The health as last saved, or `undefined` before the first save. */
  async health(signal: AbortSignal): Promise<HealthSnapshot | undefined> {
    const row = await this.#guard(signal, "The health could not be read.", () =>
      this.#store.get(statement(SELECT_HEALTH), signal),
    );
    return row === undefined ? undefined : healthOf(row);
  }

  /**
   * Replaces the health snapshot. Throws `RangeError` for a connector version over 64 characters,
   * the column's size.
   */
  async saveHealth(health: HealthSnapshot, signal: AbortSignal): Promise<void> {
    if (
      health.connector_version !== undefined &&
      health.connector_version.length > MAX_VERSION_LENGTH
    ) {
      throw new RangeError("A connector version is at most 64 characters.");
    }
    await this.#guard(signal, "The health could not be saved.", () =>
      this.#store.run(
        upsertStatement(this.#store.dialect, {
          table: "health_snapshot",
          key: ["snapshot_id"],
          values: healthValues(health),
          onConflict: "update",
        }),
        signal,
      ),
    );
  }

  /**
   * Sets every stored version to 0, so a newly enrolled connector's counter, which starts again,
   * wins (PT-30). Call it once the old key's sessions are closed.
   */
  async resetVersions(signal: AbortSignal): Promise<void> {
    await this.#guard(signal, "The versions could not be reset.", () =>
      this.#store.transaction(async (session) => {
        await session.run(statement(RESET_DEVICE_VERSIONS), signal);
        await session.run(statement(RESET_LOCATION_VERSIONS), signal);
      }, signal),
    );
  }

  // The Query layer's failures become this store's own; an abort, a `RangeError` and this store's
  // own errors pass through unchanged.
  async #guard<T>(
    signal: AbortSignal,
    message: string,
    work: () => Promise<T>,
  ): Promise<T> {
    try {
      return await work();
    } catch (error) {
      signal.throwIfAborted();
      if (error instanceof QueryLayerError) {
        throw new StateStoreError(
          error.kind === "store_down" ? "unavailable" : "failed",
          message,
          { cause: error },
        );
      }
      throw error;
    }
  }
}

async function applySnapshot(
  session: SqlSession,
  snapshot: InventorySnapshot,
  signal: AbortSignal,
): Promise<InventoryApplied> {
  let refused = 0;
  const listedLocations = new Set<string>();
  for (const location of snapshot.locations) {
    if (!fitsLocation(location)) {
      refused += 1;
      continue;
    }
    listedLocations.add(location.location_id);
    await session.run(locationUpsert(session.dialect, location), signal);
  }
  const storedLocations = new Set(
    (await session.all(statement(SELECT_LOCATION_VERSIONS), signal)).map(
      (row) => idOf(row, "location_id"),
    ),
  );
  const listedDevices = new Set<string>();
  for (const device of snapshot.devices) {
    if (!fitsDevice(device) || !storedLocations.has(device.location_id)) {
      refused += 1;
      continue;
    }
    listedDevices.add(device.device_id);
    await session.run(deviceUpsert(session.dialect, device), signal);
  }
  const below = lowestVersion(snapshot);
  if (below === undefined) {
    return { refused, removed: 0 };
  }
  const removed =
    (await removeUnlisted(session, "device", listedDevices, below, signal)) +
    (await removeUnlisted(session, "location", listedLocations, below, signal));
  return { refused, removed };
}

// Removes each stored row the snapshot leaves out whose version is below the snapshot's lowest:
// it was not changed after the snapshot was composed, so Ring no longer lists it. A location goes
// only once none of its devices is left.
async function removeUnlisted(
  session: SqlSession,
  table: "device" | "location",
  listed: ReadonlySet<string>,
  below: number,
  signal: AbortSignal,
): Promise<number> {
  const idColumn = table === "device" ? "device_id" : "location_id";
  const rows = await session.all(
    statement(
      table === "device" ? SELECT_DEVICE_VERSIONS : SELECT_LOCATION_VERSIONS,
    ),
    signal,
  );
  let removed = 0;
  for (const row of rows) {
    const id = idOf(row, idColumn);
    if (
      listed.has(id) ||
      parseRow(VERSION_ROW, row, table).state_version >= below
    ) {
      continue;
    }
    removed += await session.run(
      statement(table === "device" ? DELETE_DEVICE : DELETE_LOCATION, {
        [idColumn]: id,
        below,
      }),
      signal,
    );
  }
  return removed;
}

function lowestVersion(snapshot: InventorySnapshot): number | undefined {
  const versions = [
    ...snapshot.locations.map((location) => location.state_version),
    ...snapshot.devices.map((device) => device.state_version),
  ];
  return versions.length === 0 ? undefined : Math.min(...versions);
}

function fitsLocation(location: LocationState): boolean {
  return (
    location.location_id.length <= MAX_ID_LENGTH &&
    location.time_zone.length <= MAX_TIME_ZONE_LENGTH
  );
}

function fitsDevice(device: DeviceState): boolean {
  return (
    device.device_id.length <= MAX_ID_LENGTH &&
    device.location_id.length <= MAX_ID_LENGTH
  );
}

// Cuts text to the column's size without splitting a character in two (a surrogate pair).
function fitted(text: string): string {
  if (text.length <= MAX_TEXT_LENGTH) {
    return text;
  }
  const cut = text.slice(0, MAX_TEXT_LENGTH);
  const last = cut.charCodeAt(cut.length - 1);
  return last >= HIGH_SURROGATE_START && last <= HIGH_SURROGATE_END
    ? cut.slice(0, -1)
    : cut;
}

function locationUpsert(
  dialect: SqlDialect,
  location: LocationState,
): SqlStatement {
  return upsertStatement(dialect, {
    table: "location",
    key: ["location_id"],
    values: {
      location_id: location.location_id,
      name: fitted(location.name),
      ownership: location.ownership,
      time_zone: location.time_zone,
      alarm_mode: location.alarm_mode ?? null,
      as_of: location.as_of,
      state_version: location.state_version,
    },
    onConflict: "update",
    onlyIfNewer: "state_version",
  });
}

function deviceUpsert(dialect: SqlDialect, device: DeviceState): SqlStatement {
  return upsertStatement(dialect, {
    table: "device",
    key: ["device_id"],
    values: deviceValues(device),
    onConflict: "update",
    onlyIfNewer: "state_version",
  });
}

function deviceValues(device: DeviceState): SqlParams {
  return {
    device_id: device.device_id,
    location_id: device.location_id,
    name: fitted(device.name),
    kind: device.type,
    room: device.room === undefined ? null : fitted(device.room),
    battery_pct: device.battery_pct ?? null,
    battery_low:
      device.battery_low === undefined ? null : Number(device.battery_low),
    power_mode: device.power_mode,
    online: Number(device.online),
    state: JSON.stringify(device.state),
    as_of: device.as_of,
    state_version: device.state_version,
  };
}

// Each filter adds a fixed condition with its own parameter; no text from the caller enters SQL.
function deviceQuery(filter: DeviceFilter): SqlStatement {
  const conditions: string[] = [];
  const params: Record<string, string> = {};
  if (filter.location_id !== undefined) {
    conditions.push("location_id = @location_id");
    params.location_id = filter.location_id;
  }
  if (filter.type !== undefined) {
    conditions.push("kind = @kind");
    params.kind = filter.type;
  }
  if (filter.room !== undefined) {
    conditions.push("room = @room");
    params.room = filter.room;
  }
  const where =
    conditions.length === 0 ? "" : ` WHERE ${conditions.join(" AND ")}`;
  return statement(
    `SELECT ${DEVICE_COLUMNS} FROM device${where} ORDER BY device_id`,
    params,
  );
}

function healthValues(health: HealthSnapshot): SqlParams {
  return {
    snapshot_id: SNAPSHOT_ROW,
    home_link_status: health.home_link_status ?? null,
    home_link_since: health.home_link_since ?? null,
    ring_session_status: health.ring_session_status ?? null,
    ring_session_since: health.ring_session_since ?? null,
    push_status: health.push_status ?? null,
    push_since: health.push_since ?? null,
    last_event_at: health.last_event_at ?? null,
    stale_since: health.stale_since ?? null,
    outbox_depth: health.outbox_depth ?? null,
    connector_version: health.connector_version ?? null,
    as_of: health.as_of,
  };
}

function locationOf(row: SqlRow): LocationState {
  const location = parseRow(LOCATION_ROW, row, "location");
  return {
    location_id: location.location_id,
    name: location.name,
    ownership: location.ownership,
    time_zone: location.time_zone,
    ...(location.alarm_mode === null
      ? {}
      : { alarm_mode: location.alarm_mode }),
    as_of: location.as_of,
    state_version: location.state_version,
  };
}

function deviceOf(row: SqlRow): DeviceState {
  const device = parseRow(DEVICE_ROW, row, "device");
  return {
    device_id: device.device_id,
    location_id: device.location_id,
    name: device.name,
    type: device.kind,
    ...(device.room === null ? {} : { room: device.room }),
    ...(device.battery_pct === null ? {} : { battery_pct: device.battery_pct }),
    ...(device.battery_low === null
      ? {}
      : { battery_low: device.battery_low === 1 }),
    power_mode: device.power_mode,
    online: device.online === 1,
    state: stateOf(device.state),
    as_of: device.as_of,
    state_version: device.state_version,
  };
}

function healthOf(row: SqlRow): HealthSnapshot {
  const health = parseRow(HEALTH_ROW, row, "health_snapshot");
  return {
    ...present("home_link_status", health.home_link_status),
    ...present("home_link_since", health.home_link_since),
    ...present("ring_session_status", health.ring_session_status),
    ...present("ring_session_since", health.ring_session_since),
    ...present("push_status", health.push_status),
    ...present("push_since", health.push_since),
    ...present("last_event_at", health.last_event_at),
    ...present("stale_since", health.stale_since),
    ...present("outbox_depth", health.outbox_depth),
    ...present("connector_version", health.connector_version),
    as_of: health.as_of,
  };
}

// A stored NULL leaves the field out, as the contract asks.
function present<Key extends string, Value>(
  key: Key,
  value: Value | null,
): Partial<Record<Key, Value>> {
  return value === null ? {} : ({ [key]: value } as Record<Key, Value>);
}

// No cause is kept for a row that does not parse: JSON's error and zod's issues can quote it.
function stateOf(text: string): Readonly<Record<string, unknown>> {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw unreadableRow("device");
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw unreadableRow("device");
  }
  return value as Readonly<Record<string, unknown>>;
}

function idOf(row: SqlRow, column: "device_id" | "location_id"): string {
  const id = row[column];
  if (typeof id !== "string") {
    throw unreadableRow(column === "device_id" ? "device" : "location");
  }
  return id;
}

function parseRow<Schema extends z.ZodType>(
  schema: Schema,
  row: SqlRow,
  table: string,
): z.output<Schema> {
  const parsed = schema.safeParse(row);
  if (!parsed.success) {
    throw unreadableRow(table);
  }
  return parsed.data;
}

function unreadableRow(table: string): StateStoreError {
  return new StateStoreError(
    "failed",
    `The ${table} table holds a row this store did not write.`,
  );
}

function statement(sql: string, params: SqlParams = {}): SqlStatement {
  return { sql, params };
}
