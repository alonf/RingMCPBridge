// The Inquiry manager (CP-14, T021): the four read tools of iteration 001, `get_overview`,
// `list_devices`, `get_device` and `get_health`, over State and Settings, with the Health engine's
// view as of now and the Summary engine's replies (CD map v3).
//
// - **Every reply says when its data was true**, in UTC and in the location's local time, and how
//   fresh it is (FR-006). The core never reads Ring itself, so a reply is `cached` while the home
//   link is up and Ring is fine, and `stale` otherwise, since the earlier of the two (SC-005).
//   `live` is not used in 001 [P].
// - **`as_of`** is the home's last sign of life while the data is fresh, and the time it became
//   stale once it is [P]. A home that never reported is stale since now.
// - **The store down** fails the read as `unavailable`, never with stale data (FR-006).
// - **Owned locations only**: shared locations are off in 001 (FR-036), so a shared location and
//   its devices are not found [P].
import {
  formatInTimeZone,
  formatUtc,
  isValidTimeZone,
} from "../../../utilities/clock/index.ts";
import type { Clock } from "../../../utilities/clock/index.ts";
import { SettingsStoreError } from "../../access/settings/index.ts";
import type { SettingsStore } from "../../access/settings/index.ts";
import { StateStoreError } from "../../access/state/index.ts";
import type {
  DeviceType,
  HealthSnapshot,
  LocationState,
  StateStore,
} from "../../access/state/index.ts";
import { asOf } from "../../engines/health/index.ts";
import type { HealthPolicy, HealthView } from "../../engines/health/index.ts";
import {
  DATA_BUDGET_TOKENS,
  deviceDetail,
  deviceList,
  healthData,
  overview,
} from "../../engines/summary/index.ts";
import type {
  DeviceDetailData,
  DeviceListData,
  HealthData,
  OverviewData,
} from "../../engines/summary/index.ts";
import { InquiryError } from "./inquiry-error.ts";

/** The zone a reply's local time falls back to when a location's own is not one Intl knows. */
const FALLBACK_TIME_ZONE = "UTC";

/** A device's type, as the contract names it. */
export type InquiryDeviceType = DeviceType;

/** `get_overview`'s input. */
export interface OverviewRequest {
  /** Left out: the only owned location. */
  readonly location_id?: string;
}

/** `list_devices`' input; each filter left out matches every device. */
export interface DeviceListRequest {
  /** Left out: the only owned location. */
  readonly location_id?: string;
  readonly type?: InquiryDeviceType;
  /** Matched against the stored room exactly. */
  readonly room?: string;
}

/** `get_device`'s input. */
export interface DeviceRequest {
  readonly device_id: string;
}

/** `get_overview`'s data. */
export type Overview = OverviewData;
/** `list_devices`' data. */
export type DeviceList = DeviceListData;
/** `get_device`'s data. */
export type DeviceDetail = DeviceDetailData;
/** `get_health`'s data. */
export type Health = HealthData;

/** How fresh a reply's data is (FR-006). */
export type Freshness = "live" | "cached" | "stale";

/** A read tool's reply: its data, when that was true, and how fresh it is. */
export interface InquiryReply<Data> {
  /** When the data was true, UTC. */
  readonly as_of: string;
  /** The same instant in the location's time zone, with its offset. */
  readonly as_of_local: string;
  readonly freshness: Freshness;
  /** When the data became stale, UTC; only when `freshness` is `stale`. */
  readonly stale_since?: string;
  readonly data: Data;
}

/** The health as the admin page shows it (T029). */
export interface OwnerHealth {
  readonly health: InquiryReply<Health>;
  /** The IANA time zone `health`'s local times are in. */
  readonly time_zone: string;
  /** The version the connector sent in its last hello; absent until one has linked. */
  readonly connector_version?: string;
}

/** What Inquiry is wired with. */
export interface InquiryManagerOptions {
  readonly state: StateStore;
  readonly settings: SettingsStore;
  readonly clock: Clock;
  /** How long a silent home still counts as up: Config `staleAfterMs`, as Event uses it. */
  readonly homeOfflineAfterMs: number;
}

/** The read tools' use cases. One per core process. */
export class InquiryManager {
  readonly #state: StateStore;
  readonly #settings: SettingsStore;
  readonly #clock: Clock;
  readonly #policy: HealthPolicy;

  constructor(options: InquiryManagerOptions) {
    this.#state = options.state;
    this.#settings = options.settings;
    this.#clock = options.clock;
    this.#policy = { homeOfflineAfterMs: options.homeOfflineAfterMs };
  }

  /** The home in one reply, within the token budget (FR-001, SC-006). */
  async getOverview(
    request: OverviewRequest,
    signal: AbortSignal,
  ): Promise<InquiryReply<Overview>> {
    const location = await this.#ownedLocation(request.location_id, signal);
    const [devices, stored, thresholdPct] = await this.#guard(
      signal,
      "The home could not be read.",
      () =>
        Promise.all([
          this.#state.devices({ location_id: location.location_id }, signal),
          this.#state.health(signal),
          this.#settings.batteryThresholdPct(signal),
        ]),
    );
    const now = this.#clock.now();
    const health = this.#healthAsOf(stored, now);
    return reply(
      location.time_zone,
      health,
      now,
      overview(
        { location, devices, health, now },
        { batteryThresholdPct: thresholdPct, budgetTokens: DATA_BUDGET_TOKENS },
      ),
    );
  }

  /** The location's devices, filtered by type and room (FR-002). */
  async listDevices(
    request: DeviceListRequest,
    signal: AbortSignal,
  ): Promise<InquiryReply<DeviceList>> {
    const location = await this.#ownedLocation(request.location_id, signal);
    const [devices, stored] = await this.#guard(
      signal,
      "The devices could not be read.",
      () =>
        Promise.all([
          this.#state.devices(
            {
              location_id: location.location_id,
              ...(request.type === undefined ? {} : { type: request.type }),
              ...(request.room === undefined ? {} : { room: request.room }),
            },
            signal,
          ),
          this.#state.health(signal),
        ]),
    );
    const now = this.#clock.now();
    return reply(
      location.time_zone,
      this.#healthAsOf(stored, now),
      now,
      deviceList(devices, DATA_BUDGET_TOKENS),
    );
  }

  /** One device's full entry; `not_found` for an id the agent may not read (FR-002). */
  async getDevice(
    request: DeviceRequest,
    signal: AbortSignal,
  ): Promise<InquiryReply<DeviceDetail>> {
    const device = await this.#guard(
      signal,
      "The device could not be read.",
      () => this.#state.device(request.device_id, signal),
    );
    const location =
      device === undefined
        ? undefined
        : await this.#guard(signal, "The device could not be read.", () =>
            this.#state.location(device.location_id, signal),
          );
    if (device === undefined || location?.ownership !== "owned") {
      throw new InquiryError("not_found", "No device has that id.");
    }
    const stored = await this.#guard(
      signal,
      "The health could not be read.",
      () => this.#state.health(signal),
    );
    const now = this.#clock.now();
    return reply(
      location.time_zone,
      this.#healthAsOf(stored, now),
      now,
      deviceDetail(device, location.location_id),
    );
  }

  /** The bridge's own health (FR-005), in the first owned location's local time. */
  async getHealth(signal: AbortSignal): Promise<InquiryReply<Health>> {
    return (await this.getOwnerHealth(signal)).health;
  }

  /**
   * The health as the admin page shows it (T029): `get_health`'s reply, the time zone its local
   * times are in, and the version the connector last reported, for "connector behind".
   */
  async getOwnerHealth(signal: AbortSignal): Promise<OwnerHealth> {
    const [locations, stored] = await this.#guard(
      signal,
      "The health could not be read.",
      () =>
        Promise.all([
          this.#state.locations(signal),
          this.#state.health(signal),
        ]),
    );
    const now = this.#clock.now();
    const health = this.#healthAsOf(stored, now);
    const named = locations.find(isOwned)?.time_zone ?? FALLBACK_TIME_ZONE;
    const timeZone = isValidTimeZone(named) ? named : FALLBACK_TIME_ZONE;
    return {
      health: reply(timeZone, health, now, healthData(health, now)),
      time_zone: timeZone,
      ...(stored?.connector_version === undefined
        ? {}
        : { connector_version: stored.connector_version }),
    };
  }

  // The named location when it is owned; with none named, the only owned location (the contract's
  // [P] rule). Otherwise `invalid_argument`, listing the owned locations' ids.
  async #ownedLocation(
    locationId: string | undefined,
    signal: AbortSignal,
  ): Promise<LocationState> {
    if (locationId !== undefined) {
      const location = await this.#guard(
        signal,
        "The location could not be read.",
        () => this.#state.location(locationId, signal),
      );
      if (location === undefined || !isOwned(location)) {
        throw new InquiryError("not_found", "No location has that id.");
      }
      return location;
    }
    const owned = (
      await this.#guard(signal, "The locations could not be read.", () =>
        this.#state.locations(signal),
      )
    ).filter(isOwned);
    const [only] = owned;
    if (only !== undefined && owned.length === 1) {
      return only;
    }
    throw new InquiryError(
      "invalid_argument",
      owned.length === 0
        ? "The home has not reported a location yet."
        : "The bridge holds more than one location: name one with location_id.",
      { details: { location_ids: owned.map((entry) => entry.location_id) } },
    );
  }

  #healthAsOf(
    stored: HealthSnapshot | undefined,
    now: number,
  ): HealthView | undefined {
    return stored === undefined ? undefined : asOf(stored, now, this.#policy);
  }

  // State's and Settings' failures become Inquiry's own; an abort and anything else pass through
  // unchanged.
  async #guard<T>(
    signal: AbortSignal,
    message: string,
    work: () => Promise<T>,
  ): Promise<T> {
    try {
      return await work();
    } catch (error) {
      signal.throwIfAborted();
      if (
        error instanceof StateStoreError ||
        error instanceof SettingsStoreError
      ) {
        throw new InquiryError(error.kind, message, { cause: error });
      }
      throw error;
    }
  }
}

function isOwned(location: LocationState): boolean {
  return location.ownership === "owned";
}

// The reply around `data`: stale since the health says so, or since now for a home that never
// reported; otherwise cached, as of the home's last sign of life.
function reply<Data>(
  timeZone: string,
  health: HealthView | undefined,
  now: number,
  data: Data,
): InquiryReply<Data> {
  const staleSince = health === undefined ? now : health.stale_since;
  const asOfMs = staleSince ?? health?.as_of ?? now;
  const zone = isValidTimeZone(timeZone) ? timeZone : FALLBACK_TIME_ZONE;
  return {
    as_of: formatUtc(asOfMs),
    as_of_local: formatInTimeZone(asOfMs, zone),
    freshness: staleSince === undefined ? "cached" : "stale",
    ...(staleSince === undefined ? {} : { stale_since: formatUtc(staleSince) }),
    data,
  };
}
