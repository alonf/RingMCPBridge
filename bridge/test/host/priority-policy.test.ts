// Reading the priority policy at the core's start (T045): the shipped file is good, and a file
// that is missing, is not JSON or fails the engine's check stops the start with a clear error.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { PriorityPolicyError } from "../../src/core/engines/classify/index.ts";
import { readPriorityPolicy } from "../../src/host/priority-policy.ts";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function fileWith(content: string | undefined): URL {
  const directory = mkdtempSync(join(tmpdir(), "priority-policy-"));
  directories.push(directory);
  const path = join(directory, "priority-policy.json");
  if (content !== undefined) {
    writeFileSync(path, content);
  }
  return pathToFileURL(path);
}

describe("reading the priority policy at start", () => {
  it("reads the shipped policy: 2 minutes, LOW by default, and its rules", () => {
    const policy = readPriorityPolicy();

    expect(policy.lateAfterMs).toBe(120_000);
    expect(policy.defaultPriority).toBe("LOW");
    expect(policy.rules.length).toBeGreaterThan(0);
  });

  it.each([
    ["is missing", undefined, "cannot be read as JSON"],
    ["is not JSON", "{ version: 1", "cannot be read as JSON"],
    [
      "fails the engine's check",
      JSON.stringify({ version: 1, late_after_s: 120, rules: [] }),
      "is not valid at",
    ],
  ])("stops on a file that %s, saying why", (_title, content, reason) => {
    const file = fileWith(content);

    expect(() => readPriorityPolicy(file)).toThrow(PriorityPolicyError);
    expect(() => readPriorityPolicy(file)).toThrow(reason);
  });
});
