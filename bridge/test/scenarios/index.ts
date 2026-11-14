// The scenario engine (T009, CP-04): a simulated Ring account on the fake clock, the standard
// 100-device home, and link faults. Tests and the dev-only script import from here.

/** The engine behind the Ring Adapter's port, its scripts and its Ring faults. */
export { ScenarioEngine } from "./scenario-engine.ts";
export type {
  DeviceChanges,
  RingFault,
  ScenarioAction,
  ScenarioStep,
} from "./scenario-engine.ts";

/** The standard home and its known devices. */
export {
  HEBREW_DEVICE_ID,
  HEBREW_DEVICE_NAME,
  HEBREW_ROOM,
  STANDARD_LOCATION_ID,
  STANDARD_TIME_ZONE,
  standardHome,
} from "./simulated-home.ts";
export type { HomeSnapshot } from "./simulated-home.ts";

/** Drops, delays and duplicates in front of a message sink. */
export { FaultyChannel } from "./faulty-channel.ts";
