// The scenario engine (T009, CD3): a simulated Ring account behind the Ring Adapter's port, on the
// fake clock. It stands in for the Ring Adapter in tests and in the dev-only script (PT-20), plays
// scripted changes, and injects Ring's faults: down, a 406, slow answers and a lost session. The
// limiter and circuit belong to the real adapter (T013), so the engine answers every read itself.
import type { Cancel, Clock } from "../../src/utilities/clock/index.ts";
import { RingAdapterError } from "../../src/connector/access/ring-adapter/index.ts";
import type {
  RingAlarmMode,
  RingChange,
  RingDevice,
  RingLocation,
  RingPort,
  RingSessionStatus,
  StopWatching,
} from "../../src/connector/access/ring-adapter/index.ts";
import { standardHome } from "./simulated-home.ts";
import type { HomeSnapshot } from "./simulated-home.ts";

/**
 * A Ring fault:
 * - `ring_down`: every read fails with `ring_unavailable` (a 5xx or no answer);
 * - `blocked`: every read fails with `ring_unavailable`, as a 406 does (R25 counts it as blocking);
 * - `slow`: every read answers `delayMs` later on the clock;
 * - `session_lost`: every read fails with `session_lost`.
 *
 * A slow answer combines with the others; a new outcome fault replaces the previous one.
 */
export type RingFault =
  | { readonly kind: "ring_down" }
  | { readonly kind: "blocked" }
  | { readonly kind: "slow"; readonly delayMs: number }
  | { readonly kind: "session_lost" };

/** What a device change may set. */
export type DeviceChanges = Partial<
  Pick<
    RingDevice,
    "name" | "room" | "battery_pct" | "battery_low" | "online" | "state"
  >
>;

/** One thing that happens in the simulated home. */
export type ScenarioAction =
  | {
      readonly kind: "device";
      readonly deviceId: string;
      readonly changes: DeviceChanges;
    }
  | {
      readonly kind: "alarm_mode";
      readonly locationId: string;
      readonly mode: RingAlarmMode;
    }
  | { readonly kind: "device_added"; readonly device: RingDevice }
  | { readonly kind: "device_removed"; readonly deviceId: string }
  | { readonly kind: "fault"; readonly fault: RingFault }
  | { readonly kind: "recover" };

/** An action, `afterMs` after the script starts. Steps due together run in their listed order. */
export interface ScenarioStep {
  readonly afterMs: number;
  readonly action: ScenarioAction;
}

type Refusal = "ring_down" | "blocked" | "session_lost";

const REFUSAL_STATUS: Readonly<Record<Refusal, RingSessionStatus>> = {
  ring_down: "unavailable",
  blocked: "unavailable",
  session_lost: "lost",
};

/**
 * A simulated Ring account. Changes in the home are reported to watchers while the session is
 * ok. During a refusal the home still changes, but nothing is reported, as when Ring's push stops;
 * a reader catches up by reading again after `recover`.
 */
export class ScenarioEngine implements RingPort {
  readonly #clock: Clock;
  readonly #locations = new Map<string, RingLocation>();
  readonly #devices = new Map<string, RingDevice>();
  readonly #listeners = new Set<(change: RingChange) => void>();
  #refusal: Refusal | undefined;
  #delayMs = 0;
  #reads = 0;

  constructor(clock: Clock, home: HomeSnapshot = standardHome()) {
    this.#clock = clock;
    for (const location of home.locations) {
      this.#locations.set(location.location_id, Object.freeze({ ...location }));
    }
    for (const device of home.devices) {
      if (!this.#locations.has(device.location_id)) {
        throw new Error("A scenario device names a location the home lacks.");
      }
      this.#devices.set(device.device_id, Object.freeze({ ...device }));
    }
  }

  /** How many reads reached Ring, including refused ones. */
  get reads(): number {
    return this.#reads;
  }

  sessionStatus(): RingSessionStatus {
    return this.#refusal === undefined ? "ok" : REFUSAL_STATUS[this.#refusal];
  }

  async locations(signal: AbortSignal): Promise<readonly RingLocation[]> {
    await this.#answer(signal);
    return [...this.#locations.values()];
  }

  async devices(
    locationId: string,
    signal: AbortSignal,
  ): Promise<readonly RingDevice[]> {
    await this.#answer(signal);
    return [...this.#devices.values()].filter(
      (device) => device.location_id === locationId,
    );
  }

  watch(listener: (change: RingChange) => void): StopWatching {
    const own = (change: RingChange): void => {
      listener(change);
    };
    this.#listeners.add(own);
    return () => {
      this.#listeners.delete(own);
    };
  }

  /** Plays `steps` on the clock from now. The returned function cancels the steps not yet run. */
  play(steps: readonly ScenarioStep[]): Cancel {
    const cancels = steps.map((step) =>
      this.#clock.schedule(step.afterMs, () => {
        this.apply(step.action);
      }),
    );
    return () => {
      for (const cancel of cancels) {
        cancel();
      }
    };
  }

  /** Does one action now. */
  apply(action: ScenarioAction): void {
    switch (action.kind) {
      case "device":
        this.#changeDevice(action.deviceId, action.changes);
        return;
      case "alarm_mode":
        this.#changeAlarmMode(action.locationId, action.mode);
        return;
      case "device_added":
        this.#addDevice(action.device);
        return;
      case "device_removed":
        this.#removeDevice(action.deviceId);
        return;
      case "fault":
        this.#inject(action.fault);
        return;
      case "recover":
        this.#delayMs = 0;
        this.#setRefusal(undefined);
        return;
    }
  }

  #changeDevice(deviceId: string, changes: DeviceChanges): void {
    const current = this.#devices.get(deviceId);
    if (current === undefined) {
      throw new Error(`The scenario names no device ${deviceId}.`);
    }
    const device: RingDevice = Object.freeze({ ...current, ...changes });
    this.#devices.set(deviceId, device);
    this.#report({ kind: "device", device });
  }

  #changeAlarmMode(locationId: string, mode: RingAlarmMode): void {
    const current = this.#locations.get(locationId);
    if (current === undefined) {
      throw new Error(`The scenario names no location ${locationId}.`);
    }
    const location: RingLocation = Object.freeze({
      ...current,
      alarm_mode: mode,
    });
    this.#locations.set(locationId, location);
    this.#report({ kind: "location", location });
  }

  // As the Ring Adapter reports it: the location's device list changed, so read it again.
  #addDevice(device: RingDevice): void {
    if (!this.#locations.has(device.location_id)) {
      throw new Error(`The scenario names no location ${device.location_id}.`);
    }
    this.#devices.set(device.device_id, Object.freeze({ ...device }));
    this.#report({ kind: "device_list", location_id: device.location_id });
  }

  #removeDevice(deviceId: string): void {
    const current = this.#devices.get(deviceId);
    if (current === undefined) {
      throw new Error(`The scenario names no device ${deviceId}.`);
    }
    this.#devices.delete(deviceId);
    this.#report({ kind: "device_list", location_id: current.location_id });
  }

  #inject(fault: RingFault): void {
    if (fault.kind === "slow") {
      this.#delayMs = fault.delayMs;
      return;
    }
    this.#setRefusal(fault.kind);
  }

  #setRefusal(refusal: Refusal | undefined): void {
    const before = this.sessionStatus();
    this.#refusal = refusal;
    const status = this.sessionStatus();
    if (status !== before) {
      this.#notify({ kind: "session", status });
    }
  }

  #report(change: RingChange): void {
    if (this.#refusal === undefined) {
      this.#notify(change);
    }
  }

  #notify(change: RingChange): void {
    for (const listener of [...this.#listeners]) {
      listener(change);
    }
  }

  // Counts the read, waits out a slow answer, then answers or refuses as the session stands then.
  async #answer(signal: AbortSignal): Promise<void> {
    this.#reads += 1;
    signal.throwIfAborted();
    if (this.#delayMs > 0) {
      await this.#clock.sleep(this.#delayMs, signal);
    }
    if (this.#refusal !== undefined) {
      throw refusalError(this.#refusal);
    }
  }
}

function refusalError(refusal: Refusal): RingAdapterError {
  switch (refusal) {
    case "ring_down":
      return new RingAdapterError(
        "ring_unavailable",
        "Ring did not answer (simulated).",
      );
    case "blocked":
      return new RingAdapterError(
        "ring_unavailable",
        "Ring refused the request with 406 (simulated).",
      );
    case "session_lost":
      return new RingAdapterError(
        "session_lost",
        "Ring refused the session (simulated).",
      );
  }
}
