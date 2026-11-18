// Ingest's view of the home: the last read from Ring, kept current by each change Ring reports
// after it. Ingest builds `inventory` and `device_state` bodies from it, in the link contract's
// field names (connector-link.md "Device inventory and state"). Every entry keeps the time the home
// last saw it, its `as_of`.
import { formatUtc } from "../../../utilities/clock/index.ts";
import type {
  OutboxBody,
  StateVersions,
} from "../../access/outbox-store/index.ts";
import type {
  RingChange,
  RingDevice,
  RingLocation,
  RingPanel,
} from "../../access/ring-adapter/index.ts";

/** A change Ring reported, and when the home received it. */
export interface TimedChange {
  readonly change: RingChange;
  readonly at: number;
}

interface Seen<Entry> {
  readonly entry: Entry;
  readonly at: number;
}

/** A device's full current entry, as `device_state` and `inventory` carry it. */
export function deviceEntry(
  device: RingDevice,
  at: number,
  stateVersion: number,
): OutboxBody {
  return { ...device, as_of: formatUtc(at), state_version: stateVersion };
}

/** The home as Ingest last knew it. */
export class HomeView {
  readonly #locations = new Map<string, Seen<RingLocation>>();
  readonly #devices = new Map<string, Seen<RingDevice>>();
  // Each location's alarm panel, for events only: never part of an inventory (T062).
  readonly #panels = new Map<string, RingPanel>();

  /** The view a read of every location and its devices gives, seen at `at`. */
  static fromRead(
    locations: readonly RingLocation[],
    devices: readonly RingDevice[],
    at: number,
  ): HomeView {
    const view = new HomeView();
    for (const location of locations) {
      view.#locations.set(location.location_id, { entry: location, at });
    }
    for (const device of devices) {
      view.#devices.set(device.device_id, { entry: device, at });
    }
    return view;
  }

  /**
   * Takes in a change Ring reported. A device of a location the view does not hold waits for the
   * next read, as does a device list change; a session change says nothing about the home's
   * contents.
   */
  apply({ change, at }: TimedChange): void {
    switch (change.kind) {
      case "device":
        if (this.#locations.has(change.device.location_id)) {
          this.#devices.set(change.device.device_id, {
            entry: change.device,
            at,
          });
        }
        return;
      case "location":
        this.#locations.set(change.location.location_id, {
          entry: change.location,
          at,
        });
        return;
      case "panel":
        if (this.#locations.has(change.panel.location_id)) {
          this.#panels.set(change.panel.location_id, change.panel);
        }
        return;
      case "device_list":
      case "session":
        return;
    }
  }

  /** A device as the view holds it, if it does. */
  device(deviceId: string): RingDevice | undefined {
    return this.#devices.get(deviceId)?.entry;
  }

  /** A location as the view holds it, if it does. */
  location(locationId: string): RingLocation | undefined {
    return this.#locations.get(locationId)?.entry;
  }

  /** A location's alarm panel as last reported, if it was. */
  panel(locationId: string): RingPanel | undefined {
    return this.#panels.get(locationId);
  }

  /**
   * Takes the panels of the view this one replaces: a read lists no panel, and without them an
   * exit delay running across a read would be forgotten.
   */
  keepPanelsOf(previous: HomeView): void {
    for (const [locationId, panel] of previous.#panels) {
      if (this.#locations.has(locationId) && !this.#panels.has(locationId)) {
        this.#panels.set(locationId, panel);
      }
    }
  }

  /**
   * The `inventory` body: its own version first, so every entry's is higher and the core can order
   * snapshots (CP-14 review round 3); the session it is composed for, when one is open; then every
   * location and every device, each with a fresh version.
   */
  inventory(
    versions: StateVersions,
    sessionId: string | undefined,
  ): OutboxBody {
    const snapshotVersion = versions.next();
    const locations = [...this.#locations.values()].map(({ entry, at }) => ({
      ...entry,
      as_of: formatUtc(at),
      state_version: versions.next(),
    }));
    const devices = [...this.#devices.values()].map(({ entry, at }) =>
      deviceEntry(entry, at, versions.next()),
    );
    return {
      snapshot_version: snapshotVersion,
      ...(sessionId === undefined ? {} : { session_id: sessionId }),
      locations,
      devices,
    };
  }
}
