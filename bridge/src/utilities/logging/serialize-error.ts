// Turns a caught value into the `error` part of a log line (I3: each error is logged once, by
// the handling client). Only the name, kind, code, message, stack and cause are read; any other
// property (a response body, request headers) is never written.
import {
  REDACTED,
  redactText,
  toCode,
  toErrorName,
  toMeasure,
} from "./redaction.ts";

const MAX_CAUSE_DEPTH = 3;
const MAX_STACK_LINES = 12;
const NON_ERROR_NAME = "NonError";
const UNREADABLE_ERROR_NAME = "UnreadableError";

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
  const lines = stack.split("\n").slice(0, MAX_STACK_LINES);
  return { stack: redactText(lines.join("\n")) };
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

function fromError(error: Error & ErrorExtras, depth: number): SerializedError {
  const message: unknown = error.message;
  return {
    name: toErrorName(error.name),
    message: typeof message === "string" ? redactText(message) : REDACTED,
    ...serializeKind(error.kind),
    ...serializeCode(error.code),
    ...serializeStack(error.stack),
    ...serializeCause(error.cause, depth),
  };
}

/** A thrown string is redacted text; any other thrown value is named by its type only. */
function fromNonError(value: unknown): SerializedError {
  const message =
    typeof value === "string" ? redactText(value) : `[${typeof value}]`;
  return { name: NON_ERROR_NAME, message };
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
