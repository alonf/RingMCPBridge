// One location's alarm devices as the Ring Adapter watches them (CP-16 review follow-up,
// DRIFT-001-41). ring-client-api's device list only grows: it changes when a device is added, and a
// device removed in Ring stays in it. Ring sends each hub's full list on every (re)connect of the live
// connection, when the library asks for it, so that is when an added or a removed device shows.
// - The first list the adapter sees is the baseline: the read that started watching returns it.
// - A device in a later list is new. It is watched, and the list counts as changed.
// - A device its hub's latest list leaves out is removed. It is no longer watched or read, and the
//   list counts as changed. One that its hub lists again is back, and watched again.
// - A device's data stream starts with the data a read already returned; only what follows is a
//   change. After a list change, a read of the location brings the devices as they are now.
import type {
  RingClientDevice,
  RingClientDeviceData,
  RingClientDeviceDocument,
  RingClientDeviceList,
  RingClientLocation,
} from "./ring-client.ts";

interface Unsubscribe {
  unsubscribe(): void;
}

/** What the watch reports. */
export interface AlarmDeviceEvents {
  /** A watched device's data changed. */
  readonly changed: (data: RingClientDeviceData) => void;
  /** A device was added or removed: the location must be read again. */
  readonly listChanged: () => void;
}

/** One location's alarm devices: which Ring still lists, and their changes. */
export class AlarmDevices {
  readonly #events: AlarmDeviceEvents;
  readonly #known = new Map<string, RingClientDevice>();
  readonly #watched = new Map<string, Unsubscribe>();
  readonly #removed = new Set<string>();
  readonly #lists: Unsubscribe[];
  #baseline = true;

  constructor(location: RingClientLocation, events: AlarmDeviceEvents) {
    this.#events = events;
    this.#lists = [
      location.onDevices.subscribe((devices) => {
        this.#listed(devices);
      }),
      location.onDeviceList.subscribe((list) => {
        this.#hubListed(list);
      }),
    ];
  }

  /** The devices of `devices` that Ring still lists. */
  current(devices: readonly RingClientDevice[]): readonly RingClientDevice[] {
    return devices.filter((device) => !this.#removed.has(device.data.zid));
  }

  /** Stops watching the lists and every device. */
  stop(): void {
    for (const subscription of this.#lists.splice(0)) {
      subscription.unsubscribe();
    }
    for (const subscription of this.#watched.values()) {
      subscription.unsubscribe();
    }
    this.#watched.clear();
  }

  // The library's list: the baseline first, then each time it grows.
  #listed(devices: readonly RingClientDevice[]): void {
    let added = false;
    for (const device of devices) {
      const id = device.data.zid;
      if (!this.#known.has(id)) {
        this.#known.set(id, device);
        this.#watch(id, device);
        added = true;
      }
    }
    const baseline = this.#baseline;
    this.#baseline = false;
    if (added && !baseline) {
      this.#events.listChanged();
    }
  }

  // A hub's own list. A list that names no device is taken as no list, never as every device gone.
  #hubListed(list: RingClientDeviceList): void {
    const listed = new Set((list.body ?? []).map(zidOf).filter(isId));
    if (listed.size === 0) {
      return;
    }
    let changed = false;
    for (const [id, device] of this.#known) {
      if (device.assetId !== list.src) {
        continue;
      }
      const gone = !listed.has(id);
      if (gone === this.#removed.has(id)) {
        continue;
      }
      changed = true;
      if (gone) {
        this.#removed.add(id);
        this.#unwatch(id);
      } else {
        this.#removed.delete(id);
        this.#watch(id, device);
      }
    }
    if (changed) {
      this.#events.listChanged();
    }
  }

  #watch(id: string, device: RingClientDevice): void {
    let seenCurrent = false;
    this.#watched.set(
      id,
      device.onData.subscribe((data) => {
        if (seenCurrent) {
          this.#events.changed(data);
        }
        seenCurrent = true;
      }),
    );
  }

  #unwatch(id: string): void {
    this.#watched.get(id)?.unsubscribe();
    this.#watched.delete(id);
  }
}

function zidOf(document: RingClientDeviceDocument): string | undefined {
  const zid = document.general?.v2?.zid;
  return typeof zid === "string" && zid !== "" ? zid : undefined;
}

function isId(id: string | undefined): id is string {
  return id !== undefined;
}
