// Pub/Sub utility (CP-02, T006): queued manager calls. The only entry point (CD4).

/**
 * The typed message bus. Each topic is a first-in, first-out queue whose handlers run one
 * message at a time; a failing handler is reported, never thrown to the publisher.
 */
export { PubSub } from "./pub-sub.ts";

/** A subscription's handler, its unsubscribe handle, and the failure reporter the Host wires. */
export type { Handler, HandlerErrorReporter, Unsubscribe } from "./pub-sub.ts";
