// The SQLite driver's error sorting. The codes are node:sqlite's (`code: "ERR_SQLITE_ERROR"` with
// SQLite's extended `errcode`), as a probe on Node 24.13 printed them.
import { describe, expect, it } from "vitest";
import { classifySqliteError } from "./sqlite.ts";

function sqliteError(errcode: number): object {
  return { code: "ERR_SQLITE_ERROR", errcode, errstr: "not copied" };
}

describe("classifySqliteError", () => {
  it.each([
    [5, "retryable"],
    [517, "retryable"],
    [6, "retryable"],
    [1555, "constraint"],
    [2067, "constraint"],
    [13, "unavailable"],
    [14, "unavailable"],
    [266, "unavailable"],
    [1, "statement"],
    [20, "statement"],
  ] as const)("sorts SQLite error %i as %s", (errcode, failureClass) => {
    expect(classifySqliteError(sqliteError(errcode))).toEqual({
      failureClass,
      label: `SQLite error ${String(errcode)}`,
    });
  });

  it("treats a failure from node:sqlite itself as a statement error", () => {
    const unknown = { failureClass: "statement", label: "SQLite driver error" };

    expect(classifySqliteError({ code: "ERR_INVALID_STATE" })).toEqual(unknown);
    expect(classifySqliteError({ code: "ERR_SQLITE_ERROR" })).toEqual(unknown);
    expect(classifySqliteError(undefined)).toEqual(unknown);
  });
});
