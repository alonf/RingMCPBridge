// MCP Endpoint (CP-15, T024): the agents' MCP endpoint for both protocol eras, its token check
// against the Issuer, its protected-resource metadata, and mode A's stdio. Its only entry point
// (CD4). The Host mounts it.

/** The endpoint, its settings and seams. */
export {
  McpEndpoint,
  READ_SCOPE,
  TOKEN_CHECK_RETRY_AFTER_S,
  TOKEN_CHECK_TIMEOUT_MS,
} from "./mcp-endpoint.ts";
export type {
  AccessTokens,
  McpEndpointDependencies,
  McpEndpointSettings,
  TokenCheck,
} from "./mcp-endpoint.ts";

/** The read rate limit (T025). */
export { ReadLimit } from "./read-limit.ts";
export type { ReadAllowance } from "./read-limit.ts";

/** The read tools' deadline and retry time, and the Inquiry reads they make. */
export { TOOL_DEADLINE_MS, UNAVAILABLE_RETRY_AFTER_S } from "./read-tools.ts";
export type { InquiryReads } from "./read-tools.ts";

/** The MCP Events probe (T039): a test subscription handler, wired in only when its switch is on. */
export {
  CALLBACK_ENDPOINT_ERROR,
  CALLBACK_TIMEOUT_MS,
  EventsProbe,
  PROBE_EVENT_DELAY_MS,
  PROBE_EVENT_NAME,
  PROBE_SUBSCRIPTION_TTL_MS,
} from "./events-probe.ts";
export type { CallbackFetch, EventsProbeDependencies } from "./events-probe.ts";
