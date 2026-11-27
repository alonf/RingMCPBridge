// Turns a caught value into the `error` part of a log line (I3: each error is logged once, by
// the handling client). Only the name, kind, code, message, stack and cause are read; any other
// property (a response body, request headers) is never written.
//
// Logs carry identifiers, not content (FR-034, OR6), and redaction catches secrets by their shape,
// not ordinary words such as a device name. So only a bridge error (one of the bridge's own error
// classes, which carry a string `kind`) keeps its message: the bridge writes those messages and
// never puts data in them (I3). Any other error, from Ring, the SQL driver or Node, keeps its name,
// code and stack frames only, and a thrown non-error value keeps its type. A stack keeps only frame
// lines of the usual `at name (file:line:column)` shape: its first line repeats the message.
import {
  REDACTED,
  redactText,
  toCode,
  toErrorName,
  toMeasure,
} from "./redaction.ts";

const MAX_CAUSE_DEPTH = 3;
const MAX_STACK_FRAMES = 12;
const NON_ERROR_NAME = "NonError";
const UNREADABLE_ERROR_NAME = "UnreadableError";
const OUTSIDE_MESSAGE = "[not logged]";
// `at name (file:line:column)` or `at file:line:column`, with no spaces in the file path.
const FRAME_LINE =
  /^\s+at (?:(?:async |new )?[\w$.<>[\]]+ \()?[\w./\\:@+-]+:\d+:\d+\)?$/;

/** The `error` part of a log line. Every string in it has passed redaction. */
export interface SerializedError {
  readonly name: string;
  readonly message: string;
  readonly kind?: string;
  readonly code?: string | number;
  readonly stack?: string;
  readonly cause?: SerializedError;
}

interface ErrorExtras {
  readonly kind?: unknown;
  readonly code?: unknown;
}

function serializeKind(kind: unknown): Pick<SerializedError, "kind"> {
  return kind === undefined ? {} : { kind: toCode(kind) };
}

function serializeCode(code: unknown): Pick<SerializedError, "code"> {
  if (code === undefined) {
    return {};
  }
  return { code: typeof code === "number" ? toMeasure(code) : toCode(code) };
}

function serializeStack(stack: unknown): Pick<SerializedError, "stack"> {
  if (typeof stack !== "string") {
    return {};
  }
  const frames = stack
    .split("\n")
    .filter((line) => FRAME_LINE.test(line))
    .slice(0, MAX_STACK_FRAMES);
  return frames.length === 0 ? {} : { stack: redactText(frames.join("\n")) };
}

function serializeCause(
  cause: unknown,
  depth: number,
): Pick<SerializedError, "cause"> {
  const causeDepth = depth + 1;
  return cause === undefined || causeDepth >= MAX_CAUSE_DEPTH
    ? {}
    : { cause: serializeError(cause, causeDepth) };
}

/** A bridge error's own message, redacted; any other error's message is not written. */
function messageOf(error: Error & ErrorExtras): string {
  if (typeof error.kind !== "string") {
    return OUTSIDE_MESSAGE;
  }
  const message: unknown = error.message;
  return typeof message === "string" ? redactText(message) : REDACTED;
}

function fromError(error: Error & ErrorExtras, depth: number): SerializedError {
  return {
    name: toErrorName(error.name),
    message: messageOf(error),
    ...serializeKind(error.kind),
    ...serializeCode(error.code),
    ...serializeStack(error.stack),
    ...serializeCause(error.cause, depth),
  };
}

/** A thrown value that is not an error is named by its type only, a string included. */
function fromNonError(value: unknown): SerializedError {
  return { name: NON_ERROR_NAME, message: `[${typeof value}]` };
}

/**
 * The loggable form of any caught value. It never throws: a value whose properties cannot be
 * read (a getter that throws, a revoked proxy) becomes `UnreadableError`. Causes are followed
 * three levels deep.
 */
export function serializeError(error: unknown, depth = 0): SerializedError {
  try {
    return error instanceof Error
      ? fromError(error, depth)
      : fromNonError(error);
  } catch {
    return { name: UNREADABLE_ERROR_NAME, message: REDACTED };
  }
}
