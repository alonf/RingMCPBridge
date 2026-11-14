// Builds one JSON line from the allow-list: only declared fields, each checked for its kind.
import { LOG_FIELD_KINDS } from "./log-fields.ts";
import type { FieldKind, LogFields } from "./log-fields.ts";
import { toCode, toIdentifier, toMeasure } from "./redaction.ts";
import { serializeError } from "./serialize-error.ts";

/** The log levels, from the most to the least detailed. */
export type LogLevel = "debug" | "info" | "warn" | "error";

/** One log call, before it becomes a line. */
export interface LogEntry {
  readonly at: number;
  readonly level: LogLevel;
  readonly event: string;
  readonly fields: LogFields;
  /** The caught value; `undefined` means the call carried no error. */
  readonly error: unknown;
}

const CHECK_BY_KIND = {
  identifier: toIdentifier,
  code: toCode,
  measure: toMeasure,
} as const satisfies Record<FieldKind, (value: unknown) => string | number>;

const DECLARED_FIELDS = Object.entries(LOG_FIELD_KINDS) as readonly [
  keyof LogFields,
  FieldKind,
][];

function readDeclaredFields(
  fields: LogFields,
): Record<string, string | number> {
  const written: Record<string, string | number> = {};
  for (const [name, kind] of DECLARED_FIELDS) {
    const value: unknown = Object.hasOwn(fields, name)
      ? fields[name]
      : undefined;
    if (value !== undefined) {
      written[name] = CHECK_BY_KIND[kind](value);
    }
  }
  return written;
}

/** The JSON line for one entry: `ts`, `level`, `event`, the declared fields, then `error`. */
export function formatLine(entry: LogEntry): string {
  return JSON.stringify({
    ts: new Date(entry.at).toISOString(),
    level: entry.level,
    event: toCode(entry.event),
    ...readDeclaredFields(entry.fields),
    ...(entry.error === undefined
      ? {}
      : { error: serializeError(entry.error) }),
  });
}
