// Logging utility (CP-02, T005): structured JSON lines that carry identifiers, never content
// (FR-034, OR1, OR2, B3). This file is the utility's only entry point (CD4).

/**
 * The logger. Build one in the Host's wiring with `createStdoutSink()`, the Clock's `now` and the
 * run mode's minimum level; give each component a child from `with({ component })`.
 */
export { Logger } from "./logger.ts";

/** The logger's construction options and its sink type. */
export type { LoggerOptions, LogSink } from "./logger.ts";

/** `debug`, `info`, `warn` or `error`. */
export type { LogLevel } from "./format-line.ts";

/**
 * The allow-listed fields a line may carry: correlation identifiers (`request_id`, `client_id`,
 * `session_id`, `event_id`, `device_id` and others), codes and measures. Anything else is dropped.
 */
export type { LogFields } from "./log-fields.ts";

/** The production sink: newline-terminated lines on stdout, which survives a closed pipe. */
export { createStdoutSink } from "./stdout-sink.ts";
