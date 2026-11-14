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
