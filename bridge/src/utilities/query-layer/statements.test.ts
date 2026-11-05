import { describe, expect, it } from "vitest";
import { keysetPageStatement, upsertStatement } from "./index.ts";
import type { UpsertSpec } from "./index.ts";
import { checkParameters, placeholderNames } from "./parameters.ts";

const DEVICE: UpsertSpec = {
  table: "device",
  key: ["device_id"],
  values: { device_id: "d-1", name: "Front door", state_version: 4 },
  onConflict: "update",
  onlyIfNewer: "state_version",
};

function withoutGuard({
  table,
  key,
  values,
  onConflict,
}: UpsertSpec): UpsertSpec {
  return { table, key, values, onConflict };
}

describe("upsertStatement", () => {
  it("writes SQLite's insert with a guarded update on conflict", () => {
    expect(upsertStatement("sqlite", DEVICE)).toEqual({
      sql:
        'INSERT INTO "device" ("device_id", "name", "state_version") VALUES (@device_id, @name, @state_version) ' +
        'ON CONFLICT ("device_id") DO UPDATE SET "name" = excluded."name", "state_version" = excluded."state_version" ' +
        'WHERE excluded."state_version" > "device"."state_version"',
      params: DEVICE.values,
    });
  });

  it("writes T-SQL's single MERGE under HOLDLOCK with the same guard", () => {
    expect(upsertStatement("tsql", DEVICE).sql).toBe(
      "MERGE INTO [device] WITH (HOLDLOCK) AS [target] " +
        "USING (VALUES (@device_id, @name, @state_version)) AS [source] ([device_id], [name], [state_version]) " +
        "ON [target].[device_id] = [source].[device_id] " +
        "WHEN MATCHED AND [target].[state_version] < [source].[state_version] " +
        "THEN UPDATE SET [name] = [source].[name], [state_version] = [source].[state_version] " +
        "WHEN NOT MATCHED THEN INSERT ([device_id], [name], [state_version]) " +
        "VALUES ([source].[device_id], [source].[name], [source].[state_version]);",
    );
  });

  it("updates every column outside the key when no guard is given", () => {
    const unguarded = withoutGuard(DEVICE);

    expect(upsertStatement("sqlite", unguarded).sql).toMatch(
      /DO UPDATE SET "name" = excluded\."name", "state_version" = excluded\."state_version"$/,
    );
    expect(upsertStatement("tsql", unguarded).sql).toContain(
      "WHEN MATCHED THEN UPDATE SET",
    );
  });

  it("leaves an existing row alone when asked to ignore, or when only key columns are written", () => {
    const ignore: UpsertSpec = {
      table: "used_token",
      key: ["token_id"],
      values: { token_id: "t-1", used_at: 5 },
      onConflict: "ignore",
    };
    const keyOnly: UpsertSpec = {
      table: "used_token",
      key: ["token_id"],
      values: { token_id: "t-1" },
      onConflict: "update",
    };

    expect(upsertStatement("sqlite", ignore).sql).toMatch(
      /ON CONFLICT \("token_id"\) DO NOTHING$/,
    );
    expect(upsertStatement("sqlite", keyOnly).sql).toMatch(/DO NOTHING$/);
    expect(upsertStatement("tsql", ignore).sql).not.toContain("WHEN MATCHED");
    expect(upsertStatement("tsql", keyOnly).sql).toMatch(
      /ON \[target\]\.\[token_id\] = \[source\]\.\[token_id\] WHEN NOT MATCHED/,
    );
  });

  it("joins a composite key on every column", () => {
    const spec: UpsertSpec = {
      table: "reading",
      key: ["location", "device"],
      values: { location: "l", device: "d", value: "v" },
      onConflict: "update",
    };

    expect(upsertStatement("sqlite", spec).sql).toContain(
      'ON CONFLICT ("location", "device")',
    );
    expect(upsertStatement("tsql", spec).sql).toContain(
      "ON [target].[location] = [source].[location] AND [target].[device] = [source].[device]",
    );
  });

  it.each([
    ["a table name that is not snake case", { ...DEVICE, table: "Device" }],
    [
      "a column name with a quote",
      { ...DEVICE, values: { ...DEVICE.values, 'x"': 1 } },
    ],
    ["a key column without a value", { ...DEVICE, key: ["location_id"] }],
    ["a guard with ignore", { ...DEVICE, onConflict: "ignore" }],
    [
      "a guard on a column that is not written",
      { ...DEVICE, onlyIfNewer: "version" },
    ],
    ["a guard on a key column", { ...DEVICE, onlyIfNewer: "device_id" }],
  ] as const)("refuses %s", (_label, spec) => {
    expect(() => upsertStatement("sqlite", spec as UpsertSpec)).toThrow(
      expect.objectContaining({ kind: "statement_failed" }),
    );
  });
});

describe("keysetPageStatement", () => {
  it("pages after a key with LIMIT on SQLite and TOP on T-SQL", () => {
    const spec = {
      table: "event",
      columns: ["seq", "kind"],
      key: "seq",
      after: 40,
      limit: 25,
    } as const;

    expect(keysetPageStatement("sqlite", spec)).toEqual({
      sql: 'SELECT "seq", "kind" FROM "event" WHERE "seq" > @page_after ORDER BY "seq" LIMIT @page_limit',
      params: { page_after: 40, page_limit: 25 },
    });
    expect(keysetPageStatement("tsql", spec)).toEqual({
      sql: "SELECT TOP (@page_limit) [seq], [kind] FROM [event] WHERE [seq] > @page_after ORDER BY [seq]",
      params: { page_after: 40, page_limit: 25 },
    });
  });

  it("adds the accessor's own condition and parameters", () => {
    const page = keysetPageStatement("sqlite", {
      table: "event",
      columns: ["seq"],
      key: "seq",
      after: 0,
      limit: 10,
      where: {
        sql: '"location_id" = @location_id',
        params: { location_id: "l-1" },
      },
    });

    expect(page.sql).toContain(
      'WHERE "seq" > @page_after AND ("location_id" = @location_id)',
    );
    expect(page.params).toEqual({
      location_id: "l-1",
      page_after: 0,
      page_limit: 10,
    });
  });

  it.each([
    ["a limit of 0", { limit: 0 }],
    ["a fractional limit", { limit: 2.5 }],
    ["a fractional start", { after: 1.5 }],
    ["a bad column name", { columns: ["seq; DROP"] }],
    [
      "a condition that uses the layer's names",
      { where: { sql: "1 = @page_limit", params: { page_limit: 1 } } },
    ],
  ] as const)("refuses %s", (_label, change) => {
    expect(() =>
      keysetPageStatement("tsql", {
        table: "event",
        columns: ["seq"],
        key: "seq",
        after: 0,
        limit: 10,
        ...change,
      }),
    ).toThrow(expect.objectContaining({ kind: "statement_failed" }));
  });
});

describe("placeholders", () => {
  it("finds named placeholders and skips literals, quoted names, comments and @@ functions", () => {
    const sql = [
      "SELECT @a, '@not_this', 'it''s @still_not', \"@quoted\", [@bracketed], @@ROWCOUNT",
      "-- @comment",
      "/* @block */ FROM t WHERE x = @b AND y = @a",
    ].join("\n");

    expect([...placeholderNames(sql)]).toEqual(["a", "b"]);
  });

  it("reads to the end of an unfinished literal or comment", () => {
    expect([...placeholderNames("SELECT @a, 'open @x")]).toEqual(["a"]);
    expect([...placeholderNames("SELECT @a /* open @x")]).toEqual(["a"]);
    expect([...placeholderNames("SELECT @a -- @x")]).toEqual(["a"]);
    expect([...placeholderNames("SELECT @ + 1")]).toEqual([]);
  });

  it("accepts an exact match and refuses a missing, an extra or a badly named parameter", () => {
    expect(() => {
      checkParameters({ sql: "SELECT @a", params: { a: 1 } });
    }).not.toThrow();
    expect(() => {
      checkParameters({ sql: "SELECT @a, @b", params: { a: 1 } });
    }).toThrow("The placeholder @b has no parameter.");
    expect(() => {
      checkParameters({ sql: "SELECT @a", params: { a: 1, extra: 2 } });
    }).toThrow("The parameter extra has no placeholder.");
    expect(() => {
      checkParameters({ sql: "SELECT 1", params: { "a b": 1 } });
    }).toThrow("A parameter name is not a plain name.");
  });
});
