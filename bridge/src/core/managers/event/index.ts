// Event manager (CP-11a): ingest from the home and, from iteration 002, events, Classify and
// delivery. Its only entry point (CD4). At T017 it holds only the intake Connector Link calls;
// T018 adds the manager that implements it.

/** The intake from the home link, and the DTOs Event declares for it. */
export type {
  EventIntake,
  HomeDeviceType,
  HomeLinkSession,
  IncomingDevice,
  IncomingDeviceState,
  IncomingHeartbeat,
  IncomingInventory,
  IncomingLocation,
} from "./event-intake.ts";
