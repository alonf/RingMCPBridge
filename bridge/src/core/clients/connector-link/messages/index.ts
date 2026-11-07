// Connector Link's link messages (CP-09): what the home sends the core, declared by its receiver
// (CD4). A second, narrow entry point beside Connector Link's own, so the home can import these
// declarations without reaching the core's components; it exports schemas and types only.

/** The frame type names, and each message's schema and type. */
export {
  challengeResponseSchema,
  deviceEntrySchema,
  deviceStateSchema,
  enrollSchema,
  heartbeatSchema,
  helloSchema,
  HOME_MESSAGE_TYPES,
  inventoryLocationSchema,
  inventorySchema,
} from "./home-messages.ts";
export type {
  ChallengeResponseMessage,
  DeviceEntry,
  DeviceStateMessage,
  EnrollMessage,
  HeartbeatMessage,
  HelloMessage,
  InventoryLocation,
  InventoryMessage,
} from "./home-messages.ts";
