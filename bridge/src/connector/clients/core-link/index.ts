// Core Link (CP-09, T016): the home's end of the link. The only entry point for the component
// (CD4); the messages it receives are declared in `messages/index.ts`.

/** The client the Host starts and stops, and what it is wired with. */
export { CoreLink, RECONNECT_BACKOFF, reconnectDelayMs } from "./core-link.ts";
export type { CoreLinkOptions } from "./core-link.ts";

/** Who the connector is, and how long the core may take to open a session. */
export { HANDSHAKE_TIMEOUT_MS } from "./home-session.ts";
export type { CoreLinkIdentity } from "./home-session.ts";
