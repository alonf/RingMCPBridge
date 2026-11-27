// The production sink: one line per write to stdout, which App Service and Docker collect (OR1).
// A closed pipe (EPIPE) reaches a stream as a later 'error' event, not as a throw, so the Logger's
// try/catch cannot see it. Without a listener Node would end the process. The sink ignores the
// event: a broken stdout has nowhere left to report to.
import type { Writable } from "node:stream";
import type { LogSink } from "./logger.ts";

function ignoreStreamError(): void {
  // Deliberately empty: see the header.
}

/**
 * A sink that writes each finished line to `stream` (stdout in the bridge), newline-terminated.
 * The Host builds it once; it adds one 'error' listener to the stream.
 */
export function createStdoutSink(stream: Writable = process.stdout): LogSink {
  stream.on("error", ignoreStreamError);
  return (line) => {
    stream.write(`${line}
`);
  };
}
