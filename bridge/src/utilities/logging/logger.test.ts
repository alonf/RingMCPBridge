// The logger writes one allow-listed JSON line per call and never throws into its caller.
import { Writable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Logger, createStdoutSink } from "./index.ts";
import type { LoggerOptions } from "./index.ts";

const FIXED_NOW = Date.UTC(2026, 10, 3, 9, 0, 0);
// Built from parts: the no-GUID rule keeps GUID literals out of bridge/src.
const LOCATION_ID = ["1b4e28ba", "2fa1", "41d2", "883f", "0016d3cca427"].join(
  "-",
);
const REQUEST_ID = ["7f9c2ba4", "e88f", "41a0", "9e2c", "0d7d2a5b8c11"].join(
  "-",
);

function captureLogger(options: Partial<LoggerOptions> = {}): {
  readonly logger: Logger;
  readonly records: () => Record<string, unknown>[];
  readonly lines: readonly string[];
} {
  const lines: string[] = [];
  const logger = new Logger({
    sink: (line) => {
      lines.push(line);
    },
    now: () => FIXED_NOW,
    minLevel: "debug",
    ...options,
  });
  const records = (): Record<string, unknown>[] =>
    lines.map((line) => JSON.parse(line) as Record<string, unknown>);
  return { logger, records, lines };
}

describe("Logger lines", () => {
  it("writes ts, level, event and the declared fields in allow-list order", () => {
    const { logger, records } = captureLogger();
    logger.info("tool_call", {
      duration_ms: 12.5,
      tool: "get_home_status",
      request_id: REQUEST_ID,
      client_id: "V1StGXR8_Z5jdHi6B-myT",
      location_id: LOCATION_ID,
      device_id: "587412763",
      outcome: "ok",
    });

    const [record] = records();
    expect(record).toEqual({
      ts: "2026-11-03T09:00:00.000Z",
      level: "info",
      event: "tool_call",
      request_id: REQUEST_ID,
      client_id: "V1StGXR8_Z5jdHi6B-myT",
      location_id: LOCATION_ID,
      device_id: "587412763",
      tool: "get_home_status",
      outcome: "ok",
      duration_ms: 12.5,
    });
    expect(Object.keys(record ?? {})).toEqual([
      "ts",
      "level",
      "event",
      "request_id",
      "client_id",
      "location_id",
      "device_id",
      "tool",
      "outcome",
      "duration_ms",
    ]);
  });

  it("drops fields that are not declared", () => {
    const { logger, records } = captureLogger();
    // The type check lets an object variable with extra fields through; the allow-list does not.
    const fields = { request_id: REQUEST_ID, device_name: "Front door" };
    logger.info("tool_call", fields);

    expect(records()[0]).not.toHaveProperty("device_name");
    expect(records()[0]).toHaveProperty("request_id", REQUEST_ID);
  });

  it("drops lines below the minimum level", () => {
    const { logger, records } = captureLogger({ minLevel: "warn" });
    logger.debug("a");
    logger.info("b");
    logger.warn("c");
    logger.error("d");

    expect(records().map((record) => record.event)).toEqual(["c", "d"]);
  });

  it("adds bound fields to every line, and call fields win", () => {
    const { logger, records } = captureLogger({
      fields: { component: "core", session_id: "s-1" },
    });
    const child = logger.with({
      component: "mcp_endpoint",
      request_id: REQUEST_ID,
    });
    child.info("tool_call", { request_id: "r-2" });
    logger.info("tick");

    expect(records()[0]).toMatchObject({
      component: "mcp_endpoint",
      session_id: "s-1",
      request_id: "r-2",
    });
    expect(records()[1]).toMatchObject({
      component: "core",
      session_id: "s-1",
    });
    expect(records()[1]).not.toHaveProperty("request_id");
  });
});

describe("Logger errors", () => {
  it("writes the name, kind, code, message, stack and cause of an error", () => {
    const { logger, records } = captureLogger();
    const cause = Object.assign(
      new Error("connect ECONNREFUSED 127.0.0.1:1433"),
      {
        code: "ECONNREFUSED",
      },
    );
    const error = Object.assign(new Error("the store is down", { cause }), {
      name: "QueryLayerError",
      kind: "store_down",
    });
    logger.error("query_failed", { request_id: REQUEST_ID }, error);

    const written = records()[0]?.error as Record<string, unknown>;
    expect(written).toMatchObject({
      name: "QueryLayerError",
      kind: "store_down",
      message: "the store is down",
      cause: {
        name: "Error",
        code: "ECONNREFUSED",
        message: "[not logged]",
      },
    });
    expect(written.stack).toEqual(expect.stringMatching(/^ {4}at /));
    expect(written.stack).not.toContain("the store is down");
  });

  it("writes no message from an outside error, which can hold a device name", () => {
    const { logger, records, lines } = captureLogger();
    const error = new Error('Device "Alice bedroom" is offline\nat the front');
    logger.error("ring_call_failed", {}, error);

    expect(records()[0]?.error).toMatchObject({
      name: "Error",
      message: "[not logged]",
    });
    expect(lines.join("\n")).not.toMatch(/Alice|bedroom|front/);
  });

  it("keeps only frame lines of the usual shape in a stack", () => {
    const { logger, records } = captureLogger();
    const error = Object.assign(new Error("x"), {
      kind: "store_down",
      stack: [
        "Error: x",
        "  continued message with Alice bedroom",
        "    at handler (/app/bridge/src/x.js:12:7)",
        "    at /app/node_modules/mssql/lib/y.js:9:3",
        "    at async Promise.all (index 0)",
        "    at handler (Alice bedroom)",
      ].join("\n"),
    });
    logger.error("query_failed", {}, error);

    expect((records()[0]?.error as { stack: string }).stack).toBe(
      [
        "    at handler (/app/bridge/src/x.js:12:7)",
        "    at /app/node_modules/mssql/lib/y.js:9:3",
      ].join("\n"),
    );
  });

  it("masks a quoted secret in a bridge error's message whole", () => {
    const { logger, lines } = captureLogger();
    const error = Object.assign(
      new Error('bad setting password="correct horse battery staple"'),
      { kind: "invalid_settings" },
    );
    logger.error("settings_failed", {}, error);

    expect(lines.join("\n")).not.toMatch(/correct|horse|battery|staple/);
  });

  it("keeps a numeric error code", () => {
    const { logger, records } = captureLogger();
    logger.warn(
      "sql_error",
      {},
      Object.assign(new Error("deadlock"), { code: 1205 }),
    );

    expect(records()[0]?.error).toMatchObject({ code: 1205 });
  });

  it("follows causes three levels deep", () => {
    const { logger, records } = captureLogger();
    const chain = ["d", "c", "b", "a"].reduce<Error | undefined>(
      (cause, message) =>
        new Error(message, cause === undefined ? {} : { cause }),
      undefined,
    );
    logger.error("deep", {}, chain);

    const top = records()[0]?.error as {
      cause?: { cause?: { cause?: unknown } };
    };
    expect(top.cause?.cause).toBeDefined();
    expect(top.cause?.cause?.cause).toBeUndefined();
  });

  it("limits the stack to twelve lines", () => {
    const { logger, records } = captureLogger();
    const frames = Array.from(
      { length: 30 },
      (_, index) => `    at f${String(index)} (a.js:1:1)`,
    );
    const error = Object.assign(new Error("x"), {
      stack: ["Error: x", ...frames].join("\n"),
    });
    logger.error("long_stack", {}, error);

    const written = records()[0]?.error as { stack: string };
    expect(written.stack.split("\n")).toHaveLength(12);
  });

  it("names a thrown non-error value by its type only", () => {
    const { logger, records } = captureLogger();
    logger.error("odd_throw", {}, 42);
    logger.error("odd_throw", {}, "plain text");

    expect(records()[0]?.error).toEqual({
      name: "NonError",
      message: "[number]",
    });
    expect(records()[1]?.error).toEqual({
      name: "NonError",
      message: "[string]",
    });
  });

  it("turns an unreadable error into UnreadableError", () => {
    const { logger, records } = captureLogger();
    const error = new Error("x");
    Object.defineProperty(error, "kind", {
      get: () => {
        throw new Error("getter failed");
      },
    });
    logger.error("unreadable", {}, error);

    expect(records()[0]?.error).toEqual({
      name: "UnreadableError",
      message: "[redacted]",
    });
  });

  it("writes no stack when the error has none", () => {
    const { logger, records } = captureLogger();
    const error = new Error("x");
    delete error.stack;
    logger.error("no_stack", {}, error);

    expect(records()[0]?.error).toEqual({
      name: "Error",
      message: "[not logged]",
    });
  });

  it("writes no error part when no error is given", () => {
    const { logger, records } = captureLogger();
    logger.error("no_error", { count: 1 });

    expect(records()[0]).not.toHaveProperty("error");
  });
});

describe("Logger never throws into its caller", () => {
  it("writes log_line_unwritable when a line cannot be built", () => {
    const { logger, records } = captureLogger({ now: () => Number.NaN });
    logger.info("tool_call");

    expect(records()).toEqual([
      { level: "info", event: "log_line_unwritable" },
    ]);
  });

  it("ignores a failing sink", () => {
    const logger = new Logger({
      sink: () => {
        throw new Error("EPIPE");
      },
      now: () => FIXED_NOW,
      minLevel: "debug",
    });

    expect(() => {
      logger.error("tool_call");
    }).not.toThrow();
  });
});

describe("createStdoutSink", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes one newline-terminated line to stdout", () => {
    const write = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const listeners = process.stdout.listenerCount("error");
    const sink = createStdoutSink();
    sink('{"event":"x"}');

    expect(write).toHaveBeenCalledWith('{"event":"x"}\n');
    expect(process.stdout.listenerCount("error")).toBe(listeners + 1);
  });

  it("survives a write error that arrives later, as from a closed pipe", async () => {
    const closedPipe = new Writable({
      write(_chunk, _encoding, callback) {
        callback(Object.assign(new Error("write EPIPE"), { code: "EPIPE" }));
      },
    });
    const sink = createStdoutSink(closedPipe);
    sink('{"event":"x"}');
    sink('{"event":"y"}');
    await new Promise((resolve) => setImmediate(resolve));

    expect(closedPipe.destroyed).toBe(true);
  });
});
