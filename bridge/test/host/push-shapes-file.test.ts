// The push probe's shapes file (T038 part 2): one JSON line per shape handed over, in order, and a
// failed write logged without stopping the next one.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  PUSH_SHAPES_FILE_NAME,
  pushShapesFile,
} from "../../src/host/push-shapes-file.ts";
import { FakeClock } from "../../src/utilities/clock/index.ts";
import { Logger } from "../../src/utilities/logging/index.ts";

const AT = Date.UTC(2026, 10, 18, 9, 0, 0);
const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function folder(): string {
  const directory = mkdtempSync(join(tmpdir(), "push-shapes-"));
  directories.push(directory);
  return directory;
}

function logger(lines: string[]): Logger {
  return new Logger({
    sink: (line) => lines.push(line),
    now: () => AT,
    minLevel: "debug",
  });
}

describe("the push shapes file", () => {
  it("appends one JSON line per shape, in order", async () => {
    const dataDir = folder();
    const sink = pushShapesFile(dataDir, new FakeClock(AT), logger([]));

    sink({ format: "ding_v2", kind: "ding", shape: { data: "string" } });
    sink({ format: "unknown", kind: "other", shape: { note: "string" } });

    const path = join(dataDir, PUSH_SHAPES_FILE_NAME);
    await expect
      .poll(() => readFileSync(path, "utf8").trim().split("\n").length)
      .toBe(2);
    const records = readFileSync(path, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(records).toEqual([
      {
        at: new Date(AT).toISOString(),
        format: "ding_v2",
        kind: "ding",
        shape: { data: "string" },
      },
      {
        at: new Date(AT).toISOString(),
        format: "unknown",
        kind: "other",
        shape: { note: "string" },
      },
    ]);
  });

  it("logs a write that fails and writes the next one", async () => {
    const lines: string[] = [];
    const missing = join(folder(), "not-here");
    const sink = pushShapesFile(missing, new FakeClock(AT), logger(lines));

    sink({ format: "alarm", kind: "alarm", shape: {} });

    await expect
      .poll(() => lines.some((line) => line.includes("ring_push_shape_failed")))
      .toBe(true);
  });
});
