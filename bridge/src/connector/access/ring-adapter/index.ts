// Ring Adapter (CP-07): the home connector's only way to Ring. Its only entry point (CD4). T009
// declares the port, which the scenario engine implements; T013 adds the adapter over
// ring-client-api, its only import site.

/** The port, its data and the session status. */
export type {
  RingAlarmMode,
  RingChange,
  RingDevice,
  RingDeviceState,
  RingDeviceType,
  RingLocation,
  RingOwnership,
  RingPort,
  RingPowerMode,
  RingSessionStatus,
  StopWatching,
} from "./ring-port.ts";

/** The error every Ring read throws: `ring_unavailable` or `session_lost`. */
export { RingAdapterError } from "./ring-adapter-error.ts";
export type { RingAdapterErrorKind } from "./ring-adapter-error.ts";
