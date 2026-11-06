// Ring Adapter (CP-07): the home connector's only way to Ring. Its only entry point (CD4). T009
// declared the port, which the scenario engine implements. T013 adds the implementation, which
// only the Host's connector wiring imports: `RingApiAdapter` (ring-api-adapter.ts) behind the
// shared `RingCallGate` (call-limits.ts), over the client from `createRingClient`
// (ring-client.live.ts, ring-client-api's only import site).

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
