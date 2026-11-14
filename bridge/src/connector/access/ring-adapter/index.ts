// Ring Adapter (CP-07): the home connector's only way to Ring. Its only entry point (CD4). T009
// declared the port, which the scenario engine implements. T013 adds the implementation, which
// only the Host's connector wiring imports: `RingApiAdapter` (ring-api-adapter.ts) behind the
// shared `RingCallGate` (call-limits.ts), over the client from `createRingClient`
// (ring-client.live.ts). T028 adds Ring's sign-in for the Setup CLI: the `RingLogin` port, and
// `openRingLogin` (ring-login.live.ts), which only the Setup CLI's wiring imports. ring-client-api
// is imported only by the `.live.ts` files.

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

/** Ring's sign-in for the Setup CLI: email and password, then the 2FA code (T028). */
export { RingLoginError } from "./ring-login.ts";
export type {
  RingLogin,
  RingLoginErrorKind,
  RingLoginStep,
} from "./ring-login.ts";
