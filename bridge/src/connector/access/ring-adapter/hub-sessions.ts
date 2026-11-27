// A location's hubs as Ring reports their sessions (DRIFT-001-86). Ring's live connection can stay
// open while a hub behind it is offline: the hub then sends nothing, and the data it last sent
// would read as current. So a hub Ring says is not `online` (offline, or on its cellular backup)
// counts against the session once it has stayed so past the grace. Once it is back, it goes on
// counting until its device list comes again, which brings its devices' data up to date.
//
// A session of an asset the live connection does not serve is ignored, as the library ignores it.
// When the live connection reopens, a counted hub waits for its list again: the library asks every
// hub for its list then, and forgets which were offline. After a closure the adapter counted, past
// the grace, every hub the reopened connection serves waits for its list the same way, since the
// data each sent last is from before the closure (`awaitLists`, DRIFT-001-89).
import type { Cancel, Clock } from "../../../utilities/clock/index.ts";
import type { Logger } from "../../../utilities/logging/index.ts";
import type {
  RingClientAssetSession,
  RingClientDeviceList,
  RingClientLocation,
} from "./ring-client.ts";

const ONLINE = "online";
const CELL_BACKUP = "cell-backup";

// A hub not online: within the grace, past it, or back online and waiting for its list.
type HubState =
  | { readonly kind: "grace"; readonly cancel: Cancel }
  | { readonly kind: "offline" }
  | { readonly kind: "awaiting_list" };

/** What the hubs are followed with. */
export interface HubSessionsOptions {
  readonly clock: Clock;
  readonly graceMs: number;
  readonly logger: Logger;
  /** A hub started or stopped counting against the session. */
  readonly changed: () => void;
}

/** The hubs of one location with a live connection. `stop` ends the watch. */
export class HubSessions {
  readonly #location: RingClientLocation;
  readonly #options: HubSessionsOptions;
  readonly #hubs = new Map<string, HubState>();
  readonly #subscriptions: readonly { unsubscribe(): void }[];

  constructor(location: RingClientLocation, options: HubSessionsOptions) {
    this.#location = location;
    this.#options = options;
    this.#subscriptions = [
      location.onSessionInfo.subscribe((sessions) => {
        for (const session of sessions) {
          this.#session(session);
        }
      }),
      location.onDeviceList.subscribe((list) => {
        this.#listed(list);
      }),
      location.onConnected.subscribe((open) => {
        if (open) {
          this.#reopened();
        }
      }),
    ];
  }

  /** True while a hub counts against the session: offline past the grace, or not yet listed. */
  get counting(): boolean {
    return [...this.#hubs.values()].some((state) => state.kind !== "grace");
  }

  /**
   * The live connection reopened after a closure past the grace: every hub it serves counts until
   * its device list comes again (DRIFT-001-89). The adapter calls it before it works out the
   * status, so the status never says ok in between.
   */
  awaitLists(): void {
    for (const { uuid } of this.#location.assets ?? []) {
      const state = this.#hubs.get(uuid);
      if (state?.kind === "grace") {
        state.cancel();
      }
      this.#hubs.set(uuid, { kind: "awaiting_list" });
    }
  }

  stop(): void {
    for (const state of this.#hubs.values()) {
      if (state.kind === "grace") {
        state.cancel();
      }
    }
    this.#hubs.clear();
    for (const subscription of this.#subscriptions) {
      subscription.unsubscribe();
    }
  }

  #session({ assetUuid, connectionStatus }: RingClientAssetSession): void {
    const served = this.#location.assets?.some(
      (asset) => asset.uuid === assetUuid,
    );
    if (served !== true) {
      return;
    }
    const state = this.#hubs.get(assetUuid);
    if (connectionStatus === ONLINE) {
      if (state?.kind === "grace") {
        state.cancel();
        this.#hubs.delete(assetUuid);
      } else if (state?.kind === "offline") {
        this.#hubs.set(assetUuid, { kind: "awaiting_list" });
      }
      return;
    }
    if (state?.kind === "awaiting_list") {
      this.#hubs.set(assetUuid, { kind: "offline" });
    } else if (state === undefined) {
      this.#startGrace(assetUuid, connectionStatus);
    }
  }

  #startGrace(hub: string, connectionStatus: string): void {
    const cancel = this.#options.clock.schedule(this.#options.graceMs, () => {
      this.#hubs.set(hub, { kind: "offline" });
      this.#options.logger.warn("ring_hub_offline", {
        kind: connectionStatus === CELL_BACKUP ? "cell_backup" : "offline",
      });
      this.#options.changed();
    });
    this.#hubs.set(hub, { kind: "grace", cancel });
  }

  // A list that names no device is no list, as the alarm devices take it (alarm-devices.ts).
  #listed(list: RingClientDeviceList): void {
    if (
      list.body === undefined ||
      list.body.length === 0 ||
      this.#hubs.get(list.src)?.kind !== "awaiting_list"
    ) {
      return;
    }
    this.#hubs.delete(list.src);
    this.#options.logger.info("ring_hub_back");
    this.#options.changed();
  }

  #reopened(): void {
    for (const [hub, state] of this.#hubs) {
      if (state.kind === "offline") {
        this.#hubs.set(hub, { kind: "awaiting_list" });
      }
    }
  }
}
