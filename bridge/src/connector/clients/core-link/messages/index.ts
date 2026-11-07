// Core Link's link messages (CP-09): what the core sends the home, declared by its receiver
// (CD4). A second, narrow entry point beside Core Link's own, so the core can import these
// declarations without reaching the home's components; it exports schemas, types and the reader.

/** The frame type names, the close reasons, and each message's schema and type. */
export {
  ackSchema,
  challengeSchema,
  CORE_MESSAGE_TYPES,
  enrolledSchema,
  helloOkSchema,
  inventoryRequestSchema,
  LINK_CLOSE_REASONS,
  readCoreMessage,
} from "./core-messages.ts";
export type {
  AckMessage,
  ChallengeMessage,
  CoreMessage,
  EnrolledMessage,
  HelloOkMessage,
  InventoryRequestMessage,
} from "./core-messages.ts";
