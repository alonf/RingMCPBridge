// Event manager (CP-11a): ingest from the home and, from iteration 002, events, Classify and
// delivery. Its only entry point (CD4). At T018: the intake Connector Link calls, State kept
// latest-wins, and the bridge's health with the Health engine, published on Pub/Sub.

/** The manager. */
export { EventManager } from "./event-manager.ts";
export type { EventManagerOptions } from "./event-manager.ts";

/** The intake from the home link, its outcomes, the health topic, and the DTOs Event declares. */
export type {
  DeviceChangeOutcome,
  EventIntake,
  EventTopics,
  HealthChanged,
  HomeDeviceType,
  HomeHealth,
  HomeLinkSession,
  IncomingDevice,
  IncomingDeviceState,
  IncomingHeartbeat,
  IncomingInventory,
  IncomingLocation,
  InventoryOutcome,
} from "./event-intake.ts";

/** The error every use case throws: `unavailable` or `failed`. */
export { EventError } from "./event-error.ts";
export type { EventErrorKind } from "./event-error.ts";
