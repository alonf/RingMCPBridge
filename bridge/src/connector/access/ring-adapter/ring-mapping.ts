// Ring's data into the port's own entries: a tolerant reader (CD4, the anti-corruption rule). An
// unknown device kind becomes `other`, an unknown alarm mode is left out, and a value out of range
// is dropped rather than guessed. Names stay exactly as Ring wrote them (FR-002); they are
// untrusted text, never logged (FR-033, OR6). The entries are new plain objects, so nothing of
// ring-client-api's own objects crosses the port.
import { isValidTimeZone } from "../../../utilities/clock/index.ts";
import type {
  RingClientCameraFields,
  RingClientDeviceData,
  RingClientLocationDetails,
} from "./ring-client.ts";
import type {
  RingAlarmMode,
  RingDevice,
  RingDeviceState,
  RingDeviceType,
  RingLocation,
  RingPowerMode,
} from "./ring-port.ts";

const FALLBACK_TIME_ZONE = "UTC";
const MAX_PERCENT = 100;

/** Ring's device kinds the bridge names; any other kind is `other`. */
const DEVICE_TYPES: ReadonlyMap<string, RingDeviceType> = new Map([
  ["sensor.contact", "contact"],
  ["sensor.zone", "contact"],
  ["sensor.tilt", "contact"],
  ["sensor.motion", "motion"],
  ["motion-sensor.beams", "motion"],
  ["sensor.flood-freeze", "flood"],
  ["sensor.water", "flood"],
  ["security-keypad", "keypad"],
  ["hub.redsky", "base_station"],
  ["hub.kili", "base_station"],
  ["switch.beams", "light"],
  ["switch.multilevel.beams", "light"],
  ["switch.transformer.beams", "light"],
  ["group.light-group.beams", "light"],
  ["switch.multilevel.bulb", "light"],
]);

/** Entries in Ring's device list that are not devices: the alarm itself and access codes. */
const NOT_DEVICES: ReadonlySet<string> = new Set([
  "security-panel",
  "access-code",
  "access-code.vault",
]);

const ALARM_MODES: ReadonlyMap<string, RingAlarmMode> = new Map([
  ["none", "disarmed"],
  ["some", "home"],
  ["all", "away"],
]);

const OFFLINE_STATUSES: ReadonlySet<string> = new Set(["error", "offline"]);

/** The bridge's type for a Ring device kind, or `undefined` for an entry that is not a device. */
export function deviceTypeOf(ringKind: string): RingDeviceType | undefined {
  if (NOT_DEVICES.has(ringKind)) {
    return undefined;
  }
  return DEVICE_TYPES.get(ringKind) ?? "other";
}

/** Ring's `none`, `some` and `all` as `disarmed`, `home` and `away`; anything else is absent. */
export function alarmModeOf(
  ringMode: string | undefined,
): RingAlarmMode | undefined {
  return ringMode === undefined ? undefined : ALARM_MODES.get(ringMode);
}

/** The fields that are not `undefined`. */
function defined(fields: Readonly<Record<string, unknown>>): RingDeviceState {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  );
}

type StateReader = (data: RingClientDeviceData) => RingDeviceState;

// Each type's state, in the bridge's words (as the scenario engine reports them).
const STATE_READERS: Partial<Record<RingDeviceType, StateReader>> = {
  contact: (data) => defined({ open: data.faulted }),
  motion: (data) =>
    defined({
      motion:
        data.motionStatus === undefined
          ? data.faulted
          : data.motionStatus === "faulted",
    }),
  flood: (data) => defined({ flood: data.flood?.faulted ?? data.faulted }),
  light: (data) => defined({ on: data.on, level: data.level }),
};

function stateOf(
  type: RingDeviceType,
  data: RingClientDeviceData,
): RingDeviceState {
  const tampered =
    data.tamperStatus === undefined
      ? undefined
      : data.tamperStatus === "tamper";
  return defined({ ...STATE_READERS[type]?.(data), tampered });
}

/** A whole percentage from 0 to 100, or `undefined` for anything else. */
function percentOf(level: number | null | undefined): number | undefined {
  if (typeof level !== "number" || !Number.isFinite(level)) {
    return undefined;
  }
  const rounded = Math.round(level);
  return rounded >= 0 && rounded <= MAX_PERCENT ? rounded : undefined;
}

interface PowerFields {
  readonly power_mode: RingPowerMode;
  readonly battery_pct?: number;
  readonly battery_low?: boolean;
}

// On mains power (an AC status, or no battery at all) a device is wired and reports no level.
function powerOf(data: RingClientDeviceData): PowerFields {
  const wired = data.acStatus !== undefined || data.batteryStatus === "none";
  const level = wired ? undefined : percentOf(data.batteryLevel);
  const status = data.batteryStatus;
  const low =
    status === undefined || status === "none" ? undefined : status === "low";
  return {
    power_mode: wired ? "wired" : "battery",
    ...(level === undefined ? {} : { battery_pct: level }),
    ...(low === undefined ? {} : { battery_low: low }),
  };
}

/** A location's entry. `profileId` is the account's own id, which tells owned from shared. */
export function locationEntry(
  location: {
    readonly id: string;
    readonly locationDetails: RingClientLocationDetails;
  },
  profileId: number,
  alarmMode: RingAlarmMode | undefined,
): RingLocation {
  const details = location.locationDetails;
  const zone = details.address.timezone;
  return {
    location_id: location.id,
    name: details.name,
    time_zone: isValidTimeZone(zone) ? zone : FALLBACK_TIME_ZONE,
    ...(alarmMode === undefined ? {} : { alarm_mode: alarmMode }),
    ownership: details.owner_id === profileId ? "owned" : "shared",
  };
}

/** An alarm device's entry, or `undefined` for an entry that is not a device or has no id. */
export function deviceEntry(
  data: RingClientDeviceData,
  locationId: string,
): RingDevice | undefined {
  const type = deviceTypeOf(data.deviceType);
  if (type === undefined || data.zid === "") {
    return undefined;
  }
  return {
    device_id: data.zid,
    location_id: locationId,
    name: data.name,
    type,
    ...powerOf(data),
    online:
      data.commStatus === undefined || !OFFLINE_STATUSES.has(data.commStatus),
    state: stateOf(type, data),
  };
}

/** A camera's or doorbell's entry. */
export function cameraEntry(
  camera: RingClientCameraFields,
  locationId: string,
): RingDevice {
  const level = camera.hasBattery ? percentOf(camera.batteryLevel) : undefined;
  return {
    device_id: String(camera.id),
    location_id: locationId,
    name: camera.name,
    type: camera.isDoorbot ? "doorbell" : "camera",
    ...(level === undefined ? {} : { battery_pct: level }),
    ...(camera.hasBattery ? { battery_low: camera.hasLowBattery } : {}),
    power_mode: camera.hasBattery ? "battery" : "wired",
    online: !camera.isOffline,
    state: {},
  };
}
