// The JSON-lines logger (B3, OR1, OR2, FR-034).
import { formatLine } from "./format-line.ts";
import type { LogLevel } from "./format-line.ts";
import type { LogFields } from "./log-fields.ts";

/** Where finished lines go: stdout in the bridge, an array in tests. */
export type LogSink = (line: string) => void;

/** What a logger is built from. The Host wires these. */
export interface LoggerOptions {
  readonly sink: LogSink;
  /** The current time in epoch milliseconds, from the Clock utility. */
  readonly now: () => number;
  /** Lines below this level are dropped. */
  readonly minLevel: LogLevel;
  /** Fields written on every line, such as `component` and the connector `session_id`. */
  readonly fields?: LogFields;
}

const LEVEL_RANK = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
} as const satisfies Record<LogLevel, number>;

const UNWRITABLE_EVENT = "log_line_unwritable";

/**
 * Writes one JSON line per call, carrying only the declared fields. It never throws into its
 * caller: a line it cannot build becomes a `log_line_unwritable` line, and a failing sink is
 * ignored.
 */
export class Logger {
  readonly #options: LoggerOptions;

  constructor(options: LoggerOptions) {
    this.#options = options;
  }

  /** A logger that adds these fields to every line; fields given in a call win. */
  with(fields: LogFields): Logger {
    return new Logger({
      ...this.#options,
      fields: { ...this.#options.fields, ...fields },
    });
  }

  debug(event: string, fields?: LogFields, error?: unknown): void {
    this.#write("debug", event, fields, error);
  }

  info(event: string, fields?: LogFields, error?: unknown): void {
    this.#write("info", event, fields, error);
  }

  warn(event: string, fields?: LogFields, error?: unknown): void {
    this.#write("warn", event, fields, error);
  }

  error(event: string, fields?: LogFields, error?: unknown): void {
    this.#write("error", event, fields, error);
  }

  #write(
    level: LogLevel,
    event: string,
    fields: LogFields | undefined,
    error: unknown,
  ): void {
    if (LEVEL_RANK[level] < LEVEL_RANK[this.#options.minLevel]) {
      return;
    }
    const line = this.#format(level, event, fields, error);
    try {
      this.#options.sink(line);
    } catch {
      // Logging never takes the caller down; a broken stdout has nowhere left to report to.
    }
  }

  #format(
    level: LogLevel,
    event: string,
    fields: LogFields | undefined,
    error: unknown,
  ): string {
    try {
      return formatLine({
        at: this.#options.now(),
        level,
        event,
        fields: { ...this.#options.fields, ...fields },
        error,
      });
    } catch {
      return JSON.stringify({ level, event: UNWRITABLE_EVENT });
    }
  }
}
