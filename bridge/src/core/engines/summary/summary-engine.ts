// The Summary engine (CP-14, T020): composes the replies the read tools give an agent, within the
// token budget (FR-001, SC-006). Pure rules, no I/O: Inquiry hands it State's view of the home and
// the health as of now (the Health engine's `asOf`), and gets the contract's `data` back.
//
// - **The contract's shapes and names**, with times as UTC ISO 8601 text, because the budget is
//   measured on the reply an agent reads. Names and rooms are Ring's text, passed on as written.
// - **The budget** is about 8,000 tokens per reply, estimated as characters ÷ 3, rounded up, with
//   no tokenizer (PT-22). The `data` keeps `DATA_BUDGET_TOKENS`, leaving room for the envelope
//   Inquiry wraps around it.
// - **A home too large for the budget** gets its lists cut, in device-id order, never its
//   location or health; the device list's `count` still says how many devices match [P].
// - **A camera's or doorbell's status carries its own time** wherever its battery or online status
//   is given: the home reads them from Ring only at an inventory, while other devices are kept
//   current through Ring's live connection and are true as of the reply's `as_of` (CP-16 review
//   follow-up, DRIFT-001-41).
import { formatUtc } from "../../../utilities/clock/index.ts";

/** A reply's budget in tokens (SC-006). */
export const TOKEN_BUDGET = 8_000;
/** What the reply envelope (`as_of`, `as_of_local`, `freshness`, `stale_since`) may take [P]. */
export const ENVELOPE_RESERVE_TOKENS = 200;
/** The budget left for a reply's `data`. */
export const DATA_BUDGET_TOKENS = TOKEN_BUDGET - ENVELOPE_RESERVE_TOKENS;

/** Characters per token in the estimate (PT-22): conservative for JSON mixing Hebrew and English. */
const CHARACTERS_PER_TOKEN = 3;

/** The types whose battery and online status the home reads from Ring only at an inventory. */
const READ_AT_INVENTORY: ReadonlySet<string> = new Set(["camera", "doorbell"]);

/** A device's type, as the contract names it. */
export type SummaryDeviceType =
  | "contact"
  | "motion"
  | "flood"
  | "keypad"
  | "base_station"
  | "camera"
  | "doorbell"
  | "light"
  | "other";

/** A location as the engine reads it. */
export interface SummaryLocation {
  readonly location_id: string;
  readonly name: string;
  readonly time_zone: string;
  readonly ownership: "owned" | "shared";
  readonly alarm_mode?: "disarmed" | "home" | "away";
}

/** A device as the engine reads it: its full entry. */
export interface SummaryDevice {
  readonly device_id: string;
  readonly name: string;
  readonly type: SummaryDeviceType;
  readonly room?: string;
  readonly battery_pct?: number;
  readonly battery_low?: boolean;
  readonly power_mode: "battery" | "wired";
  readonly online: boolean;
  readonly state: Readonly<Record<string, unknown>>;
  /** When this state was true, in milliseconds since 1970. */
  readonly as_of: number;
}

/** The health as the Health engine gives it, as of now. */
export interface SummaryHealth {
  readonly home_link_status?: "up" | "down";
  readonly home_link_since?: number;
  readonly ring_session_status?: "ok" | "unavailable" | "lost";
  readonly ring_session_since?: number;
  readonly push_status?: "ok" | "down";
  readonly push_since?: number;
  readonly last_event_at?: number;
  readonly stale_since?: number;
}

/** What the overview is composed from. */
export interface OverviewInput {
  readonly location: SummaryLocation;
  /** The location's devices, in device-id order. */
  readonly devices: readonly SummaryDevice[];
  readonly health: SummaryHealth | undefined;
  /** The reply's time, in milliseconds since 1970. */
  readonly now: number;
}

/** The rules the overview applies, as data. */
export interface SummaryPolicy {
  /** A battery at or below this percentage is low (FR-001; Settings' or Config's value). */
  readonly batteryThresholdPct: number;
  /** The tokens the `data` may take. */
  readonly budgetTokens: number;
}

/** A device as the contract refers to it. */
export interface DeviceReference {
  readonly id: string;
  readonly name: string;
  readonly room?: string;
}

/**
 * When a camera's or doorbell's battery and online status were read from Ring, UTC; absent for a
 * device kept current, which is true as of the reply's `as_of`.
 */
export interface StatusReadAt {
  readonly as_of?: string;
}

/** `get_health`'s data. */
export interface HealthData {
  readonly home_link: {
    readonly status: "up" | "down";
    readonly since: string;
  };
  readonly ring_session: {
    readonly status: "ok" | "unavailable" | "lost";
    readonly since: string;
  };
  readonly push?: { readonly status: "ok" | "down"; readonly since: string };
  readonly last_event_at?: string;
  readonly stale_since?: string;
  readonly database: { readonly status: "ok" | "down" };
}

/** How many devices each of the overview's lists holds in the whole home, before any cut. */
export interface OverviewCounts {
  readonly open_contacts: number;
  readonly active_motion: number;
  readonly offline_devices: number;
  readonly low_batteries: number;
}

/** `get_overview`'s data. */
export interface OverviewData {
  readonly location: {
    readonly location_id: string;
    readonly name: string;
    readonly time_zone: string;
    readonly ownership: "owned" | "shared";
  };
  readonly alarm_mode?: "disarmed" | "home" | "away";
  readonly open_contacts: readonly DeviceReference[];
  readonly active_motion: readonly {
    readonly device: DeviceReference;
    readonly last_motion_at: string;
  }[];
  readonly offline_devices: readonly (DeviceReference & StatusReadAt)[];
  readonly low_batteries: readonly ({
    readonly device: DeviceReference;
    readonly battery_pct?: number;
  } & StatusReadAt)[];
  readonly counts: OverviewCounts;
  readonly health: HealthData;
}

/** One device in `list_devices`' data. */
export interface ListedDevice extends StatusReadAt {
  readonly id: string;
  readonly name: string;
  readonly type: SummaryDeviceType;
  readonly room?: string;
  readonly battery_pct?: number;
  readonly power_mode: "battery" | "wired";
  readonly online: boolean;
}

/** `get_device`'s data: the device's full entry. */
export interface DeviceDetailData {
  readonly device: {
    readonly id: string;
    readonly location_id: string;
    readonly name: string;
    readonly type: SummaryDeviceType;
    readonly room?: string;
    readonly battery_pct?: number;
    readonly battery_low?: boolean;
    readonly power_mode: "battery" | "wired";
    readonly online: boolean;
    /** Ring's own state for the device, as Ring reports it. */
    readonly state: Readonly<Record<string, unknown>>;
    /** When this state was true, UTC. */
    readonly as_of: string;
  };
}

/** `list_devices`' data. */
export interface DeviceListData {
  readonly devices: readonly ListedDevice[];
  /** How many devices match; more than `devices` holds when the budget cut the list. */
  readonly count: number;
}

/** A reply's size in tokens, estimated as characters ÷ 3, rounded up (PT-22). */
export function estimateTokens(value: unknown): number {
  return Math.ceil(JSON.stringify(value).length / CHARACTERS_PER_TOKEN);
}

/**
 * `get_health`'s data from the health as of now. A home that never reported is down, its Ring
 * session unavailable and its data stale, all since now.
 */
export function healthData(
  health: SummaryHealth | undefined,
  now: number,
): HealthData {
  const staleSince = health === undefined ? now : health.stale_since;
  return {
    home_link: {
      status: health?.home_link_status ?? "down",
      since: formatUtc(health?.home_link_since ?? now),
    },
    ring_session: {
      status: health?.ring_session_status ?? "unavailable",
      since: formatUtc(health?.ring_session_since ?? now),
    },
    ...(health?.push_status === undefined
      ? {}
      : {
          push: {
            status: health.push_status,
            since: formatUtc(health.push_since ?? now),
          },
        }),
    ...(health?.last_event_at === undefined
      ? {}
      : { last_event_at: formatUtc(health.last_event_at) }),
    ...(staleSince === undefined ? {} : { stale_since: formatUtc(staleSince) }),
    database: { status: "ok" },
  };
}

/** `get_overview`'s data, within the budget. */
export function overview(
  input: OverviewInput,
  policy: SummaryPolicy,
): OverviewData {
  const { location, devices } = input;
  const full: Omit<OverviewData, "counts"> = {
    location: {
      location_id: location.location_id,
      name: location.name,
      time_zone: location.time_zone,
      ownership: location.ownership,
    },
    ...(location.alarm_mode === undefined
      ? {}
      : { alarm_mode: location.alarm_mode }),
    open_contacts: devices
      .filter(
        (device) => device.type === "contact" && device.state.open === true,
      )
      .map(reference),
    active_motion: devices
      .filter(
        (device) => device.type === "motion" && device.state.motion === true,
      )
      .map((device) => ({
        device: reference(device),
        last_motion_at: formatUtc(device.as_of),
      })),
    offline_devices: devices
      .filter((device) => !device.online)
      .map((device) => ({ ...reference(device), ...statusReadAt(device) })),
    low_batteries: devices
      .filter((device) => isLow(device, policy.batteryThresholdPct))
      .map((device) => ({
        device: reference(device),
        ...(device.battery_pct === undefined
          ? {}
          : { battery_pct: device.battery_pct }),
        ...statusReadAt(device),
      })),
    health: healthData(input.health, input.now),
  };
  // The counts are the whole home's: a list cut to fit the budget below keeps its full count, so a
  // reply never passes a shortened list off as the total (CP-10 review).
  const counted: OverviewData = {
    ...full,
    counts: {
      open_contacts: full.open_contacts.length,
      active_motion: full.active_motion.length,
      offline_devices: full.offline_devices.length,
      low_batteries: full.low_batteries.length,
    },
  };
  return within(policy.budgetTokens, longestList(counted), (cap) => ({
    ...counted,
    open_contacts: full.open_contacts.slice(0, cap),
    active_motion: full.active_motion.slice(0, cap),
    offline_devices: full.offline_devices.slice(0, cap),
    low_batteries: full.low_batteries.slice(0, cap),
  }));
}

/** `list_devices`' data, within the budget. */
export function deviceList(
  devices: readonly SummaryDevice[],
  budgetTokens: number,
): DeviceListData {
  const listed = devices.map(listedDevice);
  return within(budgetTokens, listed.length, (cap) => ({
    devices: listed.slice(0, cap),
    count: listed.length,
  }));
}

/** `get_device`'s data: one device's full entry, small enough for any budget. */
export function deviceDetail(
  device: SummaryDevice,
  locationId: string,
): DeviceDetailData {
  return {
    device: {
      id: device.device_id,
      location_id: locationId,
      name: device.name,
      type: device.type,
      ...(device.room === undefined ? {} : { room: device.room }),
      ...(device.battery_pct === undefined
        ? {}
        : { battery_pct: device.battery_pct }),
      ...(device.battery_low === undefined
        ? {}
        : { battery_low: device.battery_low }),
      power_mode: device.power_mode,
      online: device.online,
      state: device.state,
      as_of: formatUtc(device.as_of),
    },
  };
}

// The reply with the longest lists that fits: `compose(cap)` cuts every list to `cap`. A binary
// search over `cap`, as the size only grows with it.
function within<Reply>(
  budgetTokens: number,
  longest: number,
  compose: (cap: number) => Reply,
): Reply {
  const whole = compose(longest);
  if (estimateTokens(whole) <= budgetTokens) {
    return whole;
  }
  let fits = 0;
  let tooLong = longest;
  while (tooLong - fits > 1) {
    const middle = Math.floor((fits + tooLong) / 2);
    if (estimateTokens(compose(middle)) <= budgetTokens) {
      fits = middle;
    } else {
      tooLong = middle;
    }
  }
  return compose(fits);
}

function longestList(data: OverviewData): number {
  return Math.max(
    data.open_contacts.length,
    data.active_motion.length,
    data.offline_devices.length,
    data.low_batteries.length,
  );
}

function isLow(device: SummaryDevice, thresholdPct: number): boolean {
  return (
    device.battery_low === true ||
    (device.battery_pct !== undefined && device.battery_pct <= thresholdPct)
  );
}

function reference(device: SummaryDevice): DeviceReference {
  return {
    id: device.device_id,
    name: device.name,
    ...(device.room === undefined ? {} : { room: device.room }),
  };
}

function listedDevice(device: SummaryDevice): ListedDevice {
  return {
    id: device.device_id,
    name: device.name,
    type: device.type,
    ...(device.room === undefined ? {} : { room: device.room }),
    ...(device.battery_pct === undefined
      ? {}
      : { battery_pct: device.battery_pct }),
    power_mode: device.power_mode,
    online: device.online,
    ...statusReadAt(device),
  };
}

// A camera's or doorbell's status is as old as the inventory that read it; other devices are kept
// current, so they carry no time of their own.
function statusReadAt(device: SummaryDevice): StatusReadAt {
  return READ_AT_INVENTORY.has(device.type)
    ? { as_of: formatUtc(device.as_of) }
    : {};
}
