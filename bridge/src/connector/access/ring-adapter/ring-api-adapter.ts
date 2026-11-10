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
// - An alarm device added or removed in Ring shows when Ring next sends its hub's device list, on a
//   (re)connect of the live connection: it is reported as a change of the location's device list,
//   and a removed device is no longer read or watched (alarm-devices.ts, DRIFT-001-41).
// - A lost session stays lost: calls are refused until the owner signs in again and the connector
//   restarts. A call already queued when it is lost is refused when its turn comes, and no later
//   outcome changes the status back.
// - Ring counts as unavailable while calls to it fail, or while a hub's live connection has stayed
//   closed past a grace, so an outage shows with no read running (the owner's choice (c)+(a),
//   DRIFT-001-35, SC-005). While calls fail, the profile is asked once a minute, a request that
//   reaches Ring, so the status comes back to `ok` without waiting for a read. Both are needed for
//   `ok`: a probe that gets through does not hide a connection still closed.
// - A rotated refresh token is saved at once through `saveRefreshToken` (the Secrets File's
//   update, wired by the Host).
import type { Cancel, Clock } from "../../../utilities/clock/index.ts";
import type { Logger } from "../../../utilities/logging/index.ts";
import { Secret } from "../../../utilities/security/index.ts";
import { AlarmDevices } from "./alarm-devices.ts";
import { RING_CALL_LIMITS } from "./call-limits.ts";
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
/**
 * How long a hub's live connection may stay closed before Ring counts as unavailable [P]: longer
 * than the library's routine reconnect of a second or two, and, with the 15 s heartbeat, well
 * within SC-005's 2 minutes.
 */
export const RING_CONNECTION_GRACE_MS = 30_000;
/**
 * How long a hub's live connection may stay counted closed, while no call to Ring fails, before the
 * adapter reports it stuck: the owner's choice (y), DRIFT-001-35. The library makes no further
 * attempt once its reconnect's ticket request fails, so only a restart brings it back.
 */
export const RING_CONNECTION_STUCK_MS = 5 * 60_000;
/** How often Ring is asked again while calls to it fail: the gate's probe, so the circuit admits it. */
export const RING_RECOVERY_PROBE_MS = RING_CALL_LIMITS.circuit.probeIntervalMs;

const SECURITY_PANEL = "security-panel";
/** A read the library answers from its own memory: `#call`'s `reachesRing` set to false. */
const FROM_MEMORY = false;
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
  readonly connectionGraceMs?: number;
  readonly recoveryProbeMs?: number;
  /**
   * Hears, once, that a hub's live connection has stayed closed for `connectionStuckMs` past the
   * grace while no call to Ring failed. The connector restarts then (T027).
   */
  readonly onConnectionStuck?: () => void;
  readonly connectionStuckMs?: number;
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
  readonly #graceMs: number;
  readonly #probeMs: number;
  readonly #stuckMs: number;
  readonly #onConnectionStuck: (() => void) | undefined;
  #cancelStuck: Cancel | undefined;
  #stuckReported = false;
  readonly #locations = new Map<string, RingClientLocation>();
  readonly #alarmDevices = new Map<string, AlarmDevices>();
  readonly #listeners = new Set<(change: RingChange) => void>();
  readonly #subscriptions: Unsubscribe[] = [];
  readonly #saving = new Set<Promise<void>>();
  // The status's inputs: calls failing, the hubs whose connection stayed closed past the grace, and
  // a lost session, which is final.
  #callsFailing = false;
  readonly #connectionsClosed = new Set<string>();
  #lost = false;
  #status: RingSessionStatus = "ok";
  #cancelProbe: Cancel | undefined;
  readonly #closing = new AbortController();
  #locationList: readonly RingClientLocation[] | undefined;
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
    this.#graceMs = options.connectionGraceMs ?? RING_CONNECTION_GRACE_MS;
    this.#probeMs = options.recoveryProbeMs ?? RING_RECOVERY_PROBE_MS;
    this.#stuckMs = options.connectionStuckMs ?? RING_CONNECTION_STUCK_MS;
    this.#onConnectionStuck = options.onConnectionStuck;
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
    await this.#reachRingWhileUnavailable(signal);
    const found = await this.#knownLocations(signal);
    const profileId = await this.#profile(signal);
    const entries: RingLocation[] = [];
    for (const location of found) {
      this.#remember(location);
      const ringMode = location.hasAlarmBaseStation
        ? await this.#call(signal, () => location.getAlarmMode(), FROM_MEMORY)
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
    const listed = await this.#call(
      signal,
      () => location.getDevices(),
      FROM_MEMORY,
    );
    const alarmDevices =
      this.#alarmDevices.get(locationId)?.current(listed) ?? listed;
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

  /**
   * Resolves once every rotated token already being saved is saved, or its failure logged. Call it
   * after `close`, which stops new ones, so a shutdown never loses a rotation.
   */
  async drained(): Promise<void> {
    await Promise.all([...this.#saving]);
  }

  /** Stops every subscription and the probe, and closes the Ring connection. */
  close(): void {
    this.#stopProbe();
    this.#cancelStuck?.();
    this.#cancelStuck = undefined;
    this.#closing.abort(new Error("The Ring Adapter is closing."));
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

  // ring-client-api fetches the locations once and then answers from its memory, even while Ring
  // is down. So the adapter keeps them after the first answer, and asks again only until then:
  // a later read is not a Ring call, and must not count as one (CP-09 review round 5).
  async #knownLocations(
    signal: AbortSignal,
  ): Promise<readonly RingClientLocation[]> {
    if (this.#locationList === undefined) {
      this.#locationList = await this.#call(signal, () =>
        this.#client.getLocations(),
      );
    }
    return this.#locationList;
  }

  // While Ring counts as unavailable, a read starts with one request that reaches Ring: the
  // profile. Its answer, not the library's memory, decides whether Ring is back, so an account
  // without cameras, whose other reads come from memory, still finds its way back to `ok`.
  async #reachRingWhileUnavailable(signal: AbortSignal): Promise<void> {
    if (!this.#callsFailing) {
      return;
    }
    const { profile } = await this.#call(signal, () =>
      this.#client.getProfile(),
    );
    this.#profileId = profile.id;
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

  // A read the library answers from its own memory (`FROM_MEMORY`) still goes through the gate,
  // and its failure still counts, but its success says nothing about Ring: it neither closes the
  // circuit nor marks the session `ok` (CP-09 review round 5).
  async #call<T>(
    signal: AbortSignal,
    work: () => Promise<T>,
    reachesRing = true,
  ): Promise<T> {
    if (this.#lost) {
      throw sessionLost();
    }
    try {
      const value = await this.#gate.call(
        signal,
        () => this.#attempt(signal, work),
        reachesRing,
      );
      if (reachesRing) {
        this.#callSucceeded();
      }
      return value;
    } catch (error) {
      if (error instanceof RingAdapterError) {
        this.#callFailed(error);
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
        if (this.#lost) {
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

  // A request reached Ring and succeeded: calls are fine again, and the probe stops.
  #callSucceeded(): void {
    this.#callsFailing = false;
    this.#stopProbe();
    this.#updateStatus();
  }

  // A lost session is final for this process: the probe stops and no later outcome changes it.
  // Ring unavailable starts the probe.
  #callFailed(error: RingAdapterError): void {
    if (error.kind === "session_lost") {
      this.#lost = true;
      this.#stopProbe();
    } else {
      this.#callsFailing = true;
      this.#scheduleProbe();
    }
    this.#updateStatus();
  }

  #updateStatus(): void {
    const status: RingSessionStatus = this.#lost
      ? "lost"
      : this.#callsFailing || this.#connectionsClosed.size > 0
        ? "unavailable"
        : "ok";
    this.#followStuck();
    if (status === this.#status) {
      return;
    }
    this.#status = status;
    this.#emit({ kind: "session", status });
  }

  #scheduleProbe(): void {
    if (
      this.#cancelProbe !== undefined ||
      this.#lost ||
      this.#closing.signal.aborted
    ) {
      return;
    }
    this.#cancelProbe = this.#clock.schedule(this.#probeMs, () => {
      this.#cancelProbe = undefined;
      void this.#probe();
    });
  }

  #stopProbe(): void {
    this.#cancelProbe?.();
    this.#cancelProbe = undefined;
  }

  // One request that reaches Ring. Its outcome is counted like any call's: a success ends the
  // probing, and a failure schedules the next probe.
  async #probe(): Promise<void> {
    try {
      const { profile } = await this.#call(this.#closing.signal, () =>
        this.#client.getProfile(),
      );
      this.#profileId = profile.id;
    } catch (error) {
      if (error instanceof RingAdapterError) {
        this.#logger.debug("ring_recovery_probe_failed", {
          error_code: error.kind,
        });
      }
    }
  }

  // The owner's choice (y): a hub's connection counted closed while calls to Ring work is stuck once
  // it has stayed so for `#stuckMs`. Calls failing, the session lost, or the connection open again
  // end the wait. It is reported once.
  #followStuck(): void {
    const stuck =
      !this.#lost && !this.#callsFailing && this.#connectionsClosed.size > 0;
    if (!stuck) {
      this.#cancelStuck?.();
      this.#cancelStuck = undefined;
      return;
    }
    if (
      this.#cancelStuck !== undefined ||
      this.#stuckReported ||
      this.#onConnectionStuck === undefined
    ) {
      return;
    }
    const report = this.#onConnectionStuck;
    this.#cancelStuck = this.#clock.schedule(this.#stuckMs, () => {
      this.#cancelStuck = undefined;
      this.#stuckReported = true;
      this.#logger.error("ring_connection_stuck");
      report();
    });
  }

  // A hub's live connection: closed past the grace after it had been open, Ring counts as
  // unavailable until it opens again. Its first `false`, before the first connection, does not
  // count, and a routine reconnect within the grace changes nothing.
  #watchConnection(location: RingClientLocation): Unsubscribe {
    let wasOpen = false;
    let cancelGrace: Cancel | undefined;
    const subscription = location.onConnected.subscribe((open) => {
      if (open) {
        wasOpen = true;
        cancelGrace?.();
        cancelGrace = undefined;
        if (this.#connectionsClosed.delete(location.id)) {
          this.#updateStatus();
        }
        return;
      }
      if (
        !wasOpen ||
        cancelGrace !== undefined ||
        this.#connectionsClosed.has(location.id)
      ) {
        return;
      }
      cancelGrace = this.#clock.schedule(this.#graceMs, () => {
        cancelGrace = undefined;
        this.#connectionsClosed.add(location.id);
        this.#updateStatus();
      });
    });
    return {
      unsubscribe: () => {
        cancelGrace?.();
        subscription.unsubscribe();
      },
    };
  }

  #remember(location: RingClientLocation): void {
    if (this.#locations.has(location.id)) {
      return;
    }
    this.#locations.set(location.id, location);
    if (location.hasHubs) {
      this.#subscriptions.push(this.#watchConnection(location));
    }
    const alarmDevices = new AlarmDevices(location, {
      changed: (data) => {
        this.#deviceChanged(location, data);
      },
      listChanged: () => {
        this.#emit({ kind: "device_list", location_id: location.id });
      },
    });
    this.#alarmDevices.set(location.id, alarmDevices);
    this.#subscriptions.push({
      unsubscribe: () => {
        alarmDevices.stop();
      },
    });
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

  // A rotated token being saved is kept until its save settles, so shutdown can wait for it: Ring
  // may refuse the old token once it has rotated it (CP-10 review).
  #saveToken(token: string): void {
    const saving: Promise<void> = this.#saveRefreshToken(new Secret(token))
      .catch((error: unknown) => {
        this.#logger.error("ring_refresh_token_not_saved", undefined, error);
      })
      .finally(() => {
        this.#saving.delete(saving);
      });
    this.#saving.add(saving);
  }
}
