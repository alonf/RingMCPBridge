import { describe, expect, it } from "vitest";
import { checkStatement } from "../parameters.ts";
import type { SqlDialect } from "../sql-types.ts";
import { CORE_MIGRATIONS } from "./core-migrations.ts";
import { checkMigrations } from "./migration.ts";
import type { Migration } from "./migration.ts";

const DIALECTS: readonly SqlDialect[] = ["sqlite", "tsql"];
const ADDITIVE_START =
  /^(CREATE TABLE \w+ \(|CREATE (UNIQUE )?INDEX \w+ ON \w+ \(|ALTER TABLE \w+ ADD )/;
const NOT_ADDITIVE = /\b(DROP|RENAME|ALTER COLUMN|TRUNCATE)\b/;
const NVARCHAR = /NVARCHAR\((\d+|MAX)\)( COLLATE \w+)?/g;
const CODE_POINT_TEXT = " COLLATE Latin1_General_100_BIN2";

interface CoreStatement {
  readonly version: number;
  readonly dialect: SqlDialect;
  readonly sql: string;
}

function coreStatements(): CoreStatement[] {
  return CORE_MIGRATIONS.flatMap((migration) =>
    DIALECTS.flatMap((dialect) =>
      migration.statements[dialect].map((sql) => ({
        version: migration.version,
        dialect,
        sql: oneLine(sql),
      })),
    ),
  );
}

function oneLine(sql: string): string {
  return sql.replace(/\s+/g, " ").trim();
}

// Why a statement is not additive, or undefined when it is.
function additiveProblem(sql: string): string | undefined {
  if (!ADDITIVE_START.test(sql)) {
    return "it is not CREATE TABLE, CREATE INDEX or ALTER TABLE ... ADD";
  }
  if (NOT_ADDITIVE.test(sql)) {
    return "it drops, renames or changes something";
  }
  if (
    sql.startsWith("ALTER TABLE") &&
    sql.includes("NOT NULL") &&
    !sql.includes("DEFAULT")
  ) {
    return "a new NOT NULL column needs a DEFAULT, or code N-1 cannot insert";
  }
  return undefined;
}

/** The tables, columns (with whether each is required) and indexes a dialect's statements create. */
function shapeOf(statements: readonly string[]): string[] {
  return statements.flatMap((statement) => {
    const sql = oneLine(statement);
    const table = /^CREATE TABLE (\w+) \((.*)\)( STRICT)?$/.exec(sql);
    if (table !== null) {
      const [, name = "", body = ""] = table;
      return [`table ${name}`, ...columnsOf(name, body)];
    }
    const index = /^CREATE (UNIQUE )?INDEX (\w+) ON (\w+ \(.*\))$/.exec(sql);
    if (index !== null) {
      return [`${index[1] ?? ""}index ${index[2] ?? ""} on ${index[3] ?? ""}`];
    }
    // SQLite says `ADD COLUMN`; T-SQL says `ADD`.
    const added = /^ALTER TABLE (\w+) ADD (?:COLUMN )?(\w+ .*)$/.exec(sql);
    if (added !== null) {
      return columnsOf(added[1] ?? "", added[2] ?? "");
    }
    return [`other: ${sql}`];
  });
}

// Splits a CREATE TABLE body at its top-level commas and keeps the column definitions.
function columnsOf(table: string, body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const character of body) {
    depth += character === "(" ? 1 : character === ")" ? -1 : 0;
    if (character === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else {
      current += character;
    }
  }
  parts.push(current.trim());
  return parts
    .filter((part) => !part.startsWith("CONSTRAINT "))
    .map((part) => {
      const column = part.split(" ")[0] ?? "";
      return `column ${table}.${column}${part.includes("NOT NULL") ? " required" : ""}`;
    });
}

describe("the core migrations", () => {
  it("number 1, 2, 3 without a gap and pass the runner's checks on both dialects", () => {
    for (const dialect of DIALECTS) {
      expect(() => {
        checkMigrations(CORE_MIGRATIONS, dialect);
      }).not.toThrow();
    }
  });

  it("hold one statement per entry, with no placeholders", () => {
    for (const { sql } of coreStatements()) {
      expect(() => {
        checkStatement({ sql, params: {} });
      }).not.toThrow();
    }
  });

  it("only add: tables, indexes, and columns that are nullable or have a default", () => {
    for (const { version, dialect, sql } of coreStatements()) {
      expect(
        additiveProblem(sql),
        `migration ${String(version)} (${dialect}): ${sql}`,
      ).toBeUndefined();
    }
  });

  it("create the same tables, columns and indexes in both dialects", () => {
    for (const migration of CORE_MIGRATIONS) {
      const sqlite = shapeOf(migration.statements.sqlite);
      expect(sqlite.filter((line) => line.startsWith("other"))).toEqual([]);
      expect(shapeOf(migration.statements.tsql)).toEqual(sqlite);
    }
  });

  it("make every SQLite table STRICT and compare every SQL Server text by code point", () => {
    for (const { dialect, sql } of coreStatements()) {
      if (dialect === "sqlite" && sql.startsWith("CREATE TABLE")) {
        expect(sql).toMatch(/\) STRICT$/);
      }
      if (dialect === "tsql") {
        for (const [declaration, , collation] of sql.matchAll(NVARCHAR)) {
          expect(collation, declaration).toBe(CODE_POINT_TEXT);
        }
      }
    }
  });
});

describe("the additive check", () => {
  it("refuses what would break code N-1 or lose data", () => {
    expect(additiveProblem("DROP TABLE device")).toBeDefined();
    expect(
      additiveProblem("ALTER TABLE device DROP COLUMN room"),
    ).toBeDefined();
    expect(
      additiveProblem("ALTER TABLE device RENAME COLUMN room TO area"),
    ).toBeDefined();
    expect(
      additiveProblem("ALTER TABLE device ALTER COLUMN room NVARCHAR(10)"),
    ).toBeDefined();
    expect(
      additiveProblem("ALTER TABLE device ADD floor INTEGER NOT NULL"),
    ).toBeDefined();
    expect(additiveProblem("UPDATE device SET room = NULL")).toBeDefined();
  });

  it("accepts a nullable column, a column with a default, a table and an index", () => {
    expect(
      additiveProblem("ALTER TABLE device ADD floor INTEGER"),
    ).toBeUndefined();
    expect(
      additiveProblem(
        "ALTER TABLE device ADD floor INTEGER NOT NULL DEFAULT 0",
      ),
    ).toBeUndefined();
    expect(additiveProblem("CREATE TABLE note (id INTEGER)")).toBeUndefined();
    expect(
      additiveProblem("CREATE UNIQUE INDEX note_by_id ON note (id)"),
    ).toBeUndefined();
  });
});

describe("checkMigrations", () => {
  function migration(
    version: number,
    name = `step-${String(version)}`,
  ): Migration {
    return {
      version,
      name,
      statements: {
        sqlite: ["CREATE TABLE t (x INTEGER) STRICT"],
        tsql: ["CREATE TABLE t (x INT)"],
      },
    };
  }

  it("accepts an empty list and a list numbered 1, 2, 3", () => {
    expect(() => {
      checkMigrations([], "sqlite");
    }).not.toThrow();
    expect(() => {
      checkMigrations([migration(1), migration(2), migration(3)], "tsql");
    }).not.toThrow();
  });

  it("refuses a gap, a repeat, a list that does not start at 1, and a list out of order", () => {
    for (const versions of [[1, 3], [1, 1], [2], [2, 1]]) {
      expect(() => {
        checkMigrations(
          versions.map((version) => migration(version)),
          "sqlite",
        );
      }).toThrow(expect.objectContaining({ kind: "statement_failed" }));
    }
  });

  it("refuses a name that is not kebab-case", () => {
    for (const name of ["", "Step-One", "step_one", "step-", "-step"]) {
      expect(() => {
        checkMigrations([migration(1, name)], "sqlite");
      }).toThrow("Migration 1 needs a kebab-case name.");
    }
  });

  it("refuses a migration with no statements for the database's dialect", () => {
    for (const dialect of DIALECTS) {
      const empty: Migration = {
        ...migration(1),
        statements: { ...migration(1).statements, [dialect]: [] },
      };
      expect(() => {
        checkMigrations([empty], dialect);
      }).toThrow(`Migration 1 needs statements for ${dialect}.`);
    }
  });

  it("accepts a migration for one dialect on that dialect only", () => {
    const sqliteOnly: Migration<"sqlite"> = {
      version: 1,
      name: "step-1",
      statements: { sqlite: ["CREATE TABLE t (x INTEGER) STRICT"] },
    };
    expect(() => {
      checkMigrations([sqliteOnly], "sqlite");
    }).not.toThrow();
    expect(() => {
      checkMigrations([sqliteOnly], "tsql");
    }).toThrow("Migration 1 needs statements for tsql.");
  });
});
