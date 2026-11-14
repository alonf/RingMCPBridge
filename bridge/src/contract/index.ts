// Public Contract (CP-05, T011): the MCP tools' schemas, the reply and error envelopes, and their
// JSON Schema publication. Only MCP Endpoint (and Delivery, from iteration 002) import it (CD4 Q1).

/** The four iteration 001 read tools: inputs, data, replies and the catalog. */
export {
  deviceData,
  deviceListData,
  getDeviceInput,
  getDeviceTool,
  getHealthInput,
  getHealthTool,
  getOverviewInput,
  getOverviewTool,
  healthData,
  listDevicesInput,
  listDevicesTool,
  overviewData,
  TOOL_CATALOG,
} from "./inquiry-tools.ts";
export type { ToolContract } from "./inquiry-tools.ts";

/** The reply envelope, the error envelope and their enumerations. */
export {
  ERROR_CODES,
  errorEnvelope,
  FRESHNESS,
  OUTCOMES,
  replyEnvelope,
} from "./envelopes.ts";
export type { ErrorCode, Freshness, Outcome } from "./envelopes.ts";

/** Shapes the tools share. */
export {
  ALARM_MODES,
  DEVICE_TYPES,
  deviceReference,
  locationSummary,
} from "./shapes.ts";

/** How Ring-sourced content is marked (FR-033). */
export {
  ringObject,
  ringText,
  toolDescription,
  UNTRUSTED_KEYWORD,
  UNTRUSTED_PREFIX,
  UNTRUSTED_TOOL_SENTENCE,
} from "./untrusted.ts";

/** The contract as the JSON Schema documents `schemas/` publishes (FR-047). */
export { contractDocuments } from "./json-schema.ts";
export type {
  ContractDirection,
  ContractDocument,
  JsonSchemaDocument,
} from "./json-schema.ts";
