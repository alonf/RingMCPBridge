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
   * next read; a session change says nothing about the home's contents.
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
      case "session":
        return;
    }
  }

  /** The `inventory` body: every location, then every device, each with a fresh version. */
  inventory(versions: StateVersions): OutboxBody {
    const locations = [...this.#locations.values()].map(({ entry, at }) => ({
      ...entry,
      as_of: formatUtc(at),
      state_version: versions.next(),
    }));
    const devices = [...this.#devices.values()].map(({ entry, at }) =>
      deviceEntry(entry, at, versions.next()),
    );
    return { locations, devices };
  }
}
