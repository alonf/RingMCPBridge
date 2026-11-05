// Test support (T010, CP-04): the stand-ins and fixtures integration and end-to-end tests share.

/** One integration suite on SQLite and on SQL Server, and the test SQL Server's settings. */
export {
  connectWhenReady,
  describeStoreMatrix,
  requireSqlServerInCi,
  SQL_SERVER_READY_TIMEOUT_MS,
  SQL_SERVER_SETUP_TIMEOUT_MS,
  sqlServerTestSettings,
} from "./store-matrix.ts";
export type { StoreUnderTest } from "./store-matrix.ts";

/** A second oidc-provider standing in for Entra ID. */
export { startEntraStandIn } from "./entra-stand-in.ts";
export type { EntraStandIn, StandInOwner } from "./entra-stand-in.ts";

/** The agent's side of MCP, through the MCP SDK client. */
export { connectInMemory, connectOverHttp } from "./mcp-client.ts";
export type { ConnectedClient, InMemoryServer } from "./mcp-client.ts";
