// Connector Link (CP-09, T017): the core's end of the link from home. Its only entry point (CD4),
// beside messages/index.ts, where it declares what the home sends.

/** The client the Host wires to the `LinkServer`, and its limits. */
export { ConnectorLink, MAX_UNPROVEN_LINKS } from "./connector-link.ts";
export type { ConnectorLinkOptions } from "./connector-link.ts";

/** The core's own close reasons and timings; the reasons the home acts on are Core Link's. */
export {
  CORE_CLOSE_REASONS,
  CORE_HANDSHAKE_TIMEOUT_MS,
  ENROLLMENT_POLL_MS,
  KEY_RECHECK_MS,
} from "./core-session.ts";
