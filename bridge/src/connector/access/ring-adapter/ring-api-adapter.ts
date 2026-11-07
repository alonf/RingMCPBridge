// The Ring Adapter over ring-client-api (CP-07, T013): the home connector's only way to Ring.
// - Every call goes through the shared gate (one at a time, backoff, the circuit) with a deadline,
//   because ring-client-api retries a missing answer on its own, without end.
// - That retry cannot be cancelled, so a call the adapter gave up on can still be reaching Ring.
//   The next library call waits for it, within its own deadline, and is never started beside it:
//   at most one library call runs at a time, however long Ring is down (FR-026, FR-042).
// - Its failures become `RingAdapterError` with the bridge's own words; its data becomes the
//   port's plain entries (ring-mapping.ts). Nothing of ring-client-api crosses the port.
// - ring-client-api keeps the locations and their cameras from its first read. Alarm devices stay
//   current through its websocket; cameras are refreshed from Ring on each device read.
// - A lost session stays lost: calls are refused until the owner signs in again and the connector
//   restarts. A call already queued when it is lost is refused when its turn comes, and no later
//   outcome changes the status back.
// - A rotated refresh token is saved at once through `saveRefreshToken` (the Secrets File's
//   update, wired by the Host).
import type { Clock } from "../../../utilities/clock/index.ts";
import type { Logger } from "../../../utilities/logging/index.ts";
import { Secret } from "../secrets-file/index.ts";
import type { RingCallGate } from "./call-limits.ts";
import { RingAdapterError } from "./ring-adapter-error.ts";
import type {
  RingClient,
  RingClientCamera,
  RingClientDevice,
  RingClientDeviceData,
  RingClientLocation,
} from "./ring-client.ts";
import { ringFailure, sessionLost } from "./ring-failure.ts";
import {
  alarmModeOf,
  cameraEntry,
  deviceEntry,
  locationEntry,
} from "./ring-mapping.ts";
import type {
  RingChange,
  RingDevice,
  RingLocation,
  RingPort,
  RingSessionStatus,
  StopWatching,
} from "./ring-port.ts";

/** How long one Ring call may take before it counts as Ring unavailable. */
export const RING_CALL_TIMEOUT_MS = 30_000;

const SECURITY_PANEL = "security-panel";
const NO_ANSWER = "Ring did not answer in time.";
const EARLIER_CALL_RUNNING =
  "Ring has not yet answered an earlier call, so no new call was made.";

/** What the adapter needs; the Host's connector wiring builds it. */
export interface RingApiAdapterOptions {
  readonly client: RingClient;
  readonly gate: RingCallGate;
  readonly clock: Clock;
  readonly logger: Logger;
  /** Saves a rotated refresh token: the Secrets File's update. */
  readonly saveRefreshToken: (token: Secret<string>) => Promise<void>;
  readonly callTimeoutMs?: number;
}

interface Unsubscribe {
  unsubscribe(): void;
}

/** One call's deadline and abort: `end` settles the call unless it has already ended. */
interface CallBounds {
  end(settle: () => void): void;
  readonly ended: boolean;
}

function isDevice(entry: RingDevice | undefined): entry is RingDevice {
  return entry !== undefined;
}

/** The Ring port over the owner's Ring account. */
export class RingApiAdapter implements RingPort {
  readonly #client: RingClient;
  readonly #gate: RingCallGate;
  readonly #clock: Clock;
  readonly #logger: Logger;
  readonly #saveRefreshToken: (token: Secret<string>) => Promise<void>;
  readonly #timeoutMs: number;
  readonly #locations = new Map<string, RingClientLocation>();
  readonly #listeners = new Set<(change: RingChange) => void>();
  readonly #subscriptions: Unsubscribe[] = [];
  #status: RingSessionStatus = "ok";
  #profileId: number | undefined;
  // Settles when the last library call settles, including one the adapter gave up on; it never
  // rejects.
  #libraryIdle: Promise<void> = Promise.resolve();

  constructor(options: RingApiAdapterOptions) {
    this.#client = options.client;
    this.#gate = options.gate;
    this.#clock = options.clock;
    this.#logger = options.logger;
    this.#saveRefreshToken = options.saveRefreshToken;
    this.#timeoutMs = options.callTimeoutMs ?? RING_CALL_TIMEOUT_MS;
    this.#subscriptions.push(
      options.client.onRefreshTokenUpdated.subscribe(({ newRefreshToken }) => {
        this.#saveToken(newRefreshToken);
      }),
    );
  }

  sessionStatus(): RingSessionStatus {
    return this.#status;
  }

  async locations(signal: AbortSignal): Promise<readonly RingLocation[]> {
    const found = await this.#call(signal, () => this.#client.getLocations());
    const profileId = await this.#profile(signal);
    const entries: RingLocation[] = [];
    for (const location of found) {
      this.#remember(location);
      const ringMode = location.hasAlarmBaseStation
        ? await this.#call(signal, () => location.getAlarmMode())
        : undefined;
      entries.push(locationEntry(location, profileId, alarmModeOf(ringMode)));
    }
    return entries;
  }

  async devices(
    locationId: string,
    signal: AbortSignal,
  ): Promise<readonly RingDevice[]> {
    if (!this.#locations.has(locationId)) {
      await this.locations(signal);
    }
    const location = this.#locations.get(locationId);
    if (location === undefined) {
      return [];
    }
    const alarmDevices = await this.#call(signal, () => location.getDevices());
    const cameras = await this.#currentCameras(location, signal);
    return [
      ...alarmDevices
        .map((device: RingClientDevice) => deviceEntry(device.data, locationId))
        .filter(isDevice),
      ...cameras.map((camera) => cameraEntry(camera, locationId)),
    ];
  }

  watch(listener: (change: RingChange) => void): StopWatching {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  /** Stops every subscription and closes the Ring connection. */
  close(): void {
    for (const subscription of this.#subscriptions.splice(0)) {
      subscription.unsubscribe();
    }
    this.#listeners.clear();
    this.#client.disconnect();
  }

  // ring-client-api builds a location's cameras once and refreshes them only through its own
  // polling, which stays off (FR-026). So each read fetches the account's devices, one call, and
  // refreshes the cameras from them as that polling would. A camera Ring no longer lists is left
  // out rather than reported from the old copy.
  async #currentCameras(
    location: RingClientLocation,
    signal: AbortSignal,
  ): Promise<readonly RingClientCamera[]> {
    if (location.cameras.length === 0) {
      return [];
    }
    const { allCameras } = await this.#call(signal, () =>
      this.#client.fetchRingDevices(),
    );
    const current = new Map(allCameras.map((data) => [data.id, data]));
    const listed: RingClientCamera[] = [];
    for (const camera of location.cameras) {
      const data = current.get(camera.id);
      if (data !== undefined) {
        camera.updateData(data);
        listed.push(camera);
      }
    }
    return listed;
  }

  async #profile(signal: AbortSignal): Promise<number> {
    if (this.#profileId === undefined) {
      const { profile } = await this.#call(signal, () =>
        this.#client.getProfile(),
      );
      this.#profileId = profile.id;
    }
    return this.#profileId;
  }

  async #call<T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> {
    if (this.#status === "lost") {
      throw sessionLost();
    }
    try {
      const value = await this.#gate.call(signal, () =>
        this.#attempt(signal, work),
      );
      this.#setStatus("ok");
      return value;
    } catch (error) {
      if (error instanceof RingAdapterError) {
        this.#setStatus(error.kind === "session_lost" ? "lost" : "unavailable");
      }
      throw error;
    }
  }

  // One library call, once the last one has ended, bounded by the deadline and the caller's
  // signal; both also cover the wait. A call given up on while it waits never reaches Ring. A
  // failure that arrives after the call was given up on is observed and dropped, so it can never
  // surface as an unhandled rejection.
  #attempt<T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let started = false;
      const bounds = this.#bound(signal, reject, () =>
        started ? NO_ANSWER : EARLIER_CALL_RUNNING,
      );
      void this.#libraryIdle.then(() => {
        if (bounds.ended) {
          return;
        }
        // Checked in the same turn as the call starts: a session lost while this call waited.
        if (this.#status === "lost") {
          bounds.end(() => {
            reject(sessionLost());
          });
          return;
        }
        started = true;
        this.#startLibraryCall(work).then(
          (value) => {
            bounds.end(() => {
              resolve(value);
            });
          },
          (error: unknown) => {
            bounds.end(() => {
              reject(ringFailure(error));
            });
          },
        );
      });
    });
  }

  // The deadline and the caller's signal around one call: whichever comes first rejects it, with
  // `deadlineMessage` read when the deadline passes. Only the first `end` settles the call.
  #bound(
    signal: AbortSignal,
    reject: (error: Error) => void,
    deadlineMessage: () => string,
  ): CallBounds {
    let ended = false;
    const onAbort = (): void => {
      end(() => {
        reject(signal.reason as Error);
      });
    };
    const cancel = this.#clock.schedule(this.#timeoutMs, () => {
      const message = deadlineMessage();
      end(() => {
        reject(new RingAdapterError("ring_unavailable", message));
      });
    });
    const end = (settle: () => void): void => {
      if (ended) {
        return;
      }
      ended = true;
      cancel();
      signal.removeEventListener("abort", onAbort);
      settle();
    };
    if (signal.aborted) {
      onAbort();
    } else {
      signal.addEventListener("abort", onAbort, { once: true });
    }
    return {
      end,
      get ended() {
        return ended;
      },
    };
  }

  // The call may reach Ring later than its turn began, after waiting for an earlier call; the gate
  // spaces the next call from now.
  #startLibraryCall<T>(work: () => Promise<T>): Promise<T> {
    this.#gate.markCallStarted();
    const pending = Promise.resolve().then(work);
    this.#libraryIdle = pending.then(
      () => undefined,
      () => undefined,
    );
    return pending;
  }

  // A lost session is final for this process: no later outcome changes it.
  #setStatus(status: RingSessionStatus): void {
    if (this.#status === "lost" || status === this.#status) {
      return;
    }
    this.#status = status;
    this.#emit({ kind: "session", status });
  }

  #remember(location: RingClientLocation): void {
    if (this.#locations.has(location.id)) {
      return;
    }
    this.#locations.set(location.id, location);
    const watched = new Map<string, Unsubscribe>();
    this.#subscriptions.push(
      location.onDevices.subscribe((devices) => {
        for (const device of devices) {
          this.#watchDevice(location, device, watched);
        }
      }),
      {
        unsubscribe: () => {
          for (const subscription of watched.values()) {
            subscription.unsubscribe();
          }
        },
      },
    );
  }

  #watchDevice(
    location: RingClientLocation,
    device: RingClientDevice,
    watched: Map<string, Unsubscribe>,
  ): void {
    const id = device.data.zid;
    if (watched.has(id)) {
      return;
    }
    // The stream starts with the data a read already returned; only what follows is a change.
    let seenCurrent = false;
    watched.set(
      id,
      device.onData.subscribe((data) => {
        if (seenCurrent) {
          this.#deviceChanged(location, data);
        }
        seenCurrent = true;
      }),
    );
  }

  #deviceChanged(
    location: RingClientLocation,
    data: RingClientDeviceData,
  ): void {
    if (data.deviceType === SECURITY_PANEL) {
      if (this.#profileId !== undefined) {
        this.#emit({
          kind: "location",
          location: locationEntry(
            location,
            this.#profileId,
            alarmModeOf(data.mode),
          ),
        });
      }
      return;
    }
    const device = deviceEntry(data, location.id);
    if (device !== undefined) {
      this.#emit({ kind: "device", device });
    }
  }

  #emit(change: RingChange): void {
    for (const listener of this.#listeners) {
      try {
        listener(change);
      } catch (error) {
        this.#logger.error("ring_change_listener_failed", undefined, error);
      }
    }
  }

  #saveToken(token: string): void {
    this.#saveRefreshToken(new Secret(token)).catch((error: unknown) => {
      this.#logger.error("ring_refresh_token_not_saved", undefined, error);
    });
  }
}
