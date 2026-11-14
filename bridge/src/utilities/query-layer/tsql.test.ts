// The T-SQL driver's pure parts. The failure shapes are the ones mssql 12.7.13 produced against a
// SQL Server 2022 container: a RequestError with `code: "EREQUEST"` and the server's `number`
// (a killed session: 596); a ConnectionError with only a `code` (a refused port: ESOCKET; a wrong
// password: ELOGIN); and a RequestError carrying the system's code when the connection was cut
// during a request (ECONNRESET).
import mssql from "mssql";
import { describe, expect, it } from "vitest";
import { bindParameter, classifyTsqlError, normalizeTsqlRow } from "./tsql.ts";

function requestError(number: number): object {
  return { name: "RequestError", code: "EREQUEST", number };
}

// As mssql 12.7.13's request handler wraps an error the connection raises while a request runs.
function wrappedRequestError(info: object): mssql.RequestError {
  const carrier = Object.assign(new Error("wrapped"), { info });
  return new mssql.RequestError(carrier, "EREQUEST");
}

describe("classifyTsqlError", () => {
  it.each([
    [1205, "retryable"],
    [596, "lost"],
    [40613, "retryable"],
    [40501, "retryable"],
    [4060, "retryable"],
    [2627, "constraint"],
    [2601, "constraint"],
    [547, "constraint"],
    [515, "constraint"],
    [18456, "unavailable"],
    [9002, "unavailable"],
    [208, "statement"],
    [257, "statement"],
  ] as const)("sorts SQL Server error %i as %s", (number, failureClass) => {
    expect(classifyTsqlError(requestError(number))).toEqual({
      failureClass,
      label: `SQL Server error ${String(number)}`,
    });
  });

  it.each([
    ["ESOCKET", "lost"],
    ["ETIMEOUT", "lost"],
    ["ECONNCLOSED", "lost"],
    ["EABORT", "lost"],
    ["ECONNRESET", "lost"],
    ["ECONNABORTED", "lost"],
    ["EPIPE", "lost"],
    ["ETIMEDOUT", "lost"],
    ["ELOGIN", "unavailable"],
    ["ENOTOPEN", "unavailable"],
    ["EREQINPROG", "statement"],
    ["EARGS", "statement"],
  ] as const)("sorts the driver code %s as %s", (code, failureClass) => {
    expect(classifyTsqlError({ name: "ConnectionError", code })).toEqual({
      failureClass,
      label: `SQL Server driver ${code}`,
    });
  });

  it("sorts a connection error wrapped in a request error by the connection's code", () => {
    const wrapped = wrappedRequestError(
      Object.assign(new Error("Connection lost - read ECONNRESET"), {
        code: "ESOCKET",
      }),
    );

    expect(wrapped).toMatchObject({ code: "EREQUEST", number: undefined });
    expect(classifyTsqlError(wrapped)).toEqual({
      failureClass: "lost",
      label: "SQL Server driver ESOCKET",
    });
  });

  it("keeps the server's number when a request error wraps a server error", () => {
    expect(
      classifyTsqlError(wrappedRequestError({ number: 2627, message: "dup" })),
    ).toEqual({ failureClass: "constraint", label: "SQL Server error 2627" });
  });

  it("leaves a request error with nothing wrapped inside as a statement error", () => {
    const label = "SQL Server driver EREQUEST";

    expect(
      classifyTsqlError(new mssql.RequestError("odd", "EREQUEST")),
    ).toEqual({ failureClass: "statement", label });
    expect(classifyTsqlError(wrappedRequestError({ message: "odd" }))).toEqual({
      failureClass: "statement",
      label,
    });
  });

  it("treats anything without a number or a driver code as a statement error", () => {
    const unknown = {
      failureClass: "statement",
      label: "SQL Server driver error",
    };

    expect(classifyTsqlError(new Error("odd"))).toEqual(unknown);
    expect(classifyTsqlError({ code: "not a driver code" })).toEqual(unknown);
    expect(classifyTsqlError("text")).toEqual(unknown);
    expect(classifyTsqlError(null)).toEqual(unknown);
  });
});

describe("bindParameter", () => {
  it("types every value explicitly", () => {
    const request = new mssql.Request();
    bindParameter(request, "text", "דלת");
    bindParameter(request, "small", 7);
    bindParameter(request, "large", 2 ** 40);
    bindParameter(request, "negative", -(2 ** 40));
    bindParameter(request, "fraction", 0.5);
    bindParameter(request, "bytes", new Uint8Array([1, 2, 3]).subarray(1));
    bindParameter(request, "nothing", null);

    const types = Object.fromEntries(
      Object.entries(request.parameters).map(([name, parameter]) => [
        name,
        parameter.type,
      ]),
    );
    expect(types).toEqual({
      text: mssql.NVarChar,
      small: mssql.Int,
      large: mssql.BigInt,
      negative: mssql.BigInt,
      fraction: mssql.Float,
      bytes: mssql.VarBinary,
      nothing: mssql.VarBinary,
    });
    const bytes: unknown = request.parameters.bytes?.value;
    expect(Buffer.isBuffer(bytes)).toBe(true);
    expect([...(bytes as Buffer)]).toEqual([2, 3]);
  });
});

describe("normalizeTsqlRow", () => {
  it("turns BIGINT text into a number, BIT into 0 or 1, and bytes into a plain Uint8Array", () => {
    const row = normalizeTsqlRow(
      {
        id: "9007199254740991",
        label: "12",
        on: true,
        off: false,
        payload: Buffer.from([0, 255]),
        count: 3,
        missing: null,
      },
      { id: { type: mssql.BigInt }, label: { type: mssql.NVarChar } },
    );

    expect(row).toEqual({
      id: Number.MAX_SAFE_INTEGER,
      label: "12",
      on: 1,
      off: 0,
      payload: new Uint8Array([0, 255]),
      count: 3,
      missing: null,
    });
    expect(Object.getPrototypeOf(row.payload)).toBe(Uint8Array.prototype);
  });

  it("refuses an integer beyond the safe range and a value type it does not carry", () => {
    expect(() =>
      normalizeTsqlRow(
        { id: "9007199254740993" },
        { id: { type: mssql.BigInt } },
      ),
    ).toThrow(expect.objectContaining({ kind: "statement_failed" }));
    expect(() => normalizeTsqlRow({ at: new Date(0) }, {})).toThrow(
      expect.objectContaining({ kind: "statement_failed" }),
    );
  });
});
