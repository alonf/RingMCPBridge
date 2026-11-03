// The production sink: one line per write to stdout, which Container Apps and Docker collect (OR1).
import type { LogSink } from "./logger.ts";

/** Writes each finished line to stdout, newline-terminated. */
export const writeLineToStdout: LogSink = (line) => {
  process.stdout.write(`${line}\n`);
};
