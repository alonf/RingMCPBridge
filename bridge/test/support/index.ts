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

/** The owner's browser: redirects across the core and the Entra stand-in, with cookies. */
export { browse, cookiesOf, walk } from "./owner-browser.ts";
export type { Jars } from "./owner-browser.ts";

/** The agent's side of MCP, through the MCP SDK client. */
export { connectInMemory, connectOverHttp, eraOptions } from "./mcp-client.ts";
export type {
  ConnectedClient,
  InMemoryServer,
  ProtocolEra,
} from "./mcp-client.ts";

/** A throwaway TLS certificate for localhost, made with openssl at test time (T017). */
export {
  makeThrowawayCertificate,
  OPENSSL_AVAILABLE,
  requireOpensslInCi,
} from "./throwaway-certificate.ts";
export type { ThrowawayCertificate } from "./throwaway-certificate.ts";

/** Event's intake as a recorder, until the Event manager exists (T017, T018). */
export { RecordingIntake } from "./recording-intake.ts";
export type { IntakeCall, IntakeMethod } from "./recording-intake.ts";

/** Driving the fake clock in small steps while real I/O runs. */
export {
  DRIVE_LIMIT_MS,
  DRIVE_STEP_MS,
  driveFor,
  driveUntil,
} from "./drive-clock.ts";
