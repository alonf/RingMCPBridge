// The standard simulated home (T009, SC-006): 100 devices of every type at one location, built the
// same way every time. It is made up: mirrors of a real home go only in the git-ignored `local/`
// folder beside this file.
import type {
  RingDevice,
  RingDeviceState,
  RingDeviceType,
  RingLocation,
  RingPowerMode,
} from "../../src/connector/access/ring-adapter/index.ts";

/** A home as the Ring port reports it. */
export interface HomeSnapshot {
  readonly locations: readonly RingLocation[];
  readonly devices: readonly RingDevice[];
}

/** One kind of device in the standard home, and how many of it. */
interface DeviceGroup {
  readonly type: RingDeviceType;
  readonly label: string;
  readonly count: number;
  /** Which devices of the group are wired, by their place in the group. */
  readonly wired: (place: number) => boolean;
  readonly state: RingDeviceState;
}

export const STANDARD_LOCATION_ID = "location-1";
export const STANDARD_TIME_ZONE = "Asia/Tokyo";
/** The one device named in Hebrew ("the front door", in the room "entrance"). */
export const HEBREW_DEVICE_ID = "device-001";
export const HEBREW_DEVICE_NAME = "דלת הכניסה";
export const HEBREW_ROOM = "כניסה";

/** Every 10th battery device is low: 8%, with Ring's low flag. */
const LOW_BATTERY_EVERY = 10;
const LOW_BATTERY_PCT = 8;
const FULL_BATTERY_PCT = 100;
const BATTERY_STEP_PCT = 5;
const BATTERY_STEPS = 12;
/** Every 25th device is offline. */
const OFFLINE_EVERY = 25;
const DEVICE_NUMBER_DIGITS = 3;

const ROOMS = [
  "Hall",
  "Kitchen",
  "Living room",
  "Bedroom",
  "Office",
  "Garage",
  "Garden",
  "Basement",
] as const;

const always = (): boolean => true;
const never = (): boolean => false;
const everyOther = (place: number): boolean => place % 2 === 0;

const GROUPS: readonly DeviceGroup[] = [
  {
    type: "contact",
    label: "Contact",
    count: 30,
    wired: never,
    state: { open: false },
  },
  {
    type: "motion",
    label: "Motion",
    count: 20,
    wired: never,
    state: { motion: false },
  },
  {
    type: "flood",
    label: "Flood",
    count: 8,
    wired: never,
    state: { flood: false },
  },
  { type: "keypad", label: "Keypad", count: 3, wired: never, state: {} },
  {
    type: "base_station",
    label: "Base station",
    count: 1,
    wired: always,
    state: {},
  },
  {
    type: "camera",
    label: "Camera",
    count: 16,
    wired: everyOther,
    state: { motion_detection: true },
  },
  {
    type: "doorbell",
    label: "Doorbell",
    count: 2,
    wired: everyOther,
    state: {},
  },
  {
    type: "light",
    label: "Light",
    count: 18,
    wired: always,
    state: { on: false },
  },
  {
    type: "other",
    label: "Range extender",
    count: 2,
    wired: always,
    state: {},
  },
];

/**
 * The standard home: one owned location in Tokyo's time zone, disarmed, with 100 devices of every
 * type. Device 001 is named in Hebrew; every 10th battery device is low; wired devices report no
 * battery; every 25th device is offline.
 */
export function standardHome(): HomeSnapshot {
  const location: RingLocation = Object.freeze({
    location_id: STANDARD_LOCATION_ID,
    name: "Test home",
    time_zone: STANDARD_TIME_ZONE,
    alarm_mode: "disarmed",
    ownership: "owned",
  });
  const devices: RingDevice[] = [];
  let batteryDevices = 0;
  for (const group of GROUPS) {
    for (let place = 0; place < group.count; place += 1) {
      const number = devices.length + 1;
      const powerMode: RingPowerMode = group.wired(place) ? "wired" : "battery";
      if (powerMode === "battery") {
        batteryDevices += 1;
      }
      devices.push(device(group, place, number, powerMode, batteryDevices));
    }
  }
  return Object.freeze({
    locations: Object.freeze([location]),
    devices: Object.freeze(devices),
  });
}

function device(
  group: DeviceGroup,
  place: number,
  number: number,
  powerMode: RingPowerMode,
  batteryDevices: number,
): RingDevice {
  const deviceId = `device-${String(number).padStart(DEVICE_NUMBER_DIGITS, "0")}`;
  const hebrew = deviceId === HEBREW_DEVICE_ID;
  return Object.freeze({
    device_id: deviceId,
    location_id: STANDARD_LOCATION_ID,
    name: hebrew ? HEBREW_DEVICE_NAME : `${group.label} ${String(place + 1)}`,
    type: group.type,
    room: hebrew ? HEBREW_ROOM : roomFor(number),
    ...(powerMode === "battery" ? battery(batteryDevices) : {}),
    power_mode: powerMode,
    online: number % OFFLINE_EVERY !== 0,
    state: Object.freeze({ ...group.state }),
  });
}

function battery(
  batteryDevices: number,
): Pick<RingDevice, "battery_pct" | "battery_low"> {
  if (batteryDevices % LOW_BATTERY_EVERY === 0) {
    return { battery_pct: LOW_BATTERY_PCT, battery_low: true };
  }
  const drained = (batteryDevices % BATTERY_STEPS) * BATTERY_STEP_PCT;
  return { battery_pct: FULL_BATTERY_PCT - drained, battery_low: false };
}

function roomFor(number: number): string {
  return ROOMS[number % ROOMS.length] ?? ROOMS[0];
}
