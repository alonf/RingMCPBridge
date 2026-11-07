// Summary engine (CP-14, T020): the read tools' replies within the token budget. Its only entry
// point (CD4). Pure rules, no I/O; Inquiry calls it.

/** The rules, the budget, and the types it reads and composes. */
export {
  DATA_BUDGET_TOKENS,
  deviceList,
  ENVELOPE_RESERVE_TOKENS,
  estimateTokens,
  healthData,
  overview,
  TOKEN_BUDGET,
} from "./summary-engine.ts";
export type {
  DeviceListData,
  DeviceReference,
  HealthData,
  ListedDevice,
  OverviewData,
  OverviewInput,
  SummaryDevice,
  SummaryDeviceType,
  SummaryHealth,
  SummaryLocation,
  SummaryPolicy,
} from "./summary-engine.ts";
