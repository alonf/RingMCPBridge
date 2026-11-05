// The statements with one version per dialect (R21): insert-or-update and keyset paging. Every
// other statement is written by hand, per dialect, inside its accessor (B6).
import { QueryLayerError } from "./query-layer-error.ts";
import type { SqlDialect, SqlParams, SqlStatement } from "./sql-types.ts";

/** Table and column names: lower-case snake case, so they need no quoting rules beyond the dialect's. */
const IDENTIFIER = /^[a-z][a-z0-9_]*$/;
const PAGE_AFTER = "page_after";
const PAGE_LIMIT = "page_limit";

/** One row to insert, or to update when a row with the same key exists. */
export interface UpsertSpec {
  readonly table: string;
  /** The key columns that decide whether the row exists: the primary key or a unique key. */
  readonly key: readonly [string, ...string[]];
  /** Every column to write, key columns included. Each value is passed as the parameter `@column`. */
  readonly values: SqlParams;
  /** `update` overwrites the other columns of an existing row; `ignore` leaves it as it is. */
  readonly onConflict: "update" | "ignore";
  /**
   * With `update`: overwrite only when this column's new value is greater than the stored one, so
   * the latest version wins whatever order versions arrive in.
   */
  readonly onlyIfNewer?: string;
}

/**
 * The dialect's single-statement insert-or-update. Running it resolves with 1 when it inserted or
 * updated the row, and 0 when it left an existing row alone. On SQL Server it is one `MERGE` under
 * `HOLDLOCK`, which stays atomic outside a transaction too.
 */
export function upsertStatement(
  dialect: SqlDialect,
  spec: UpsertSpec,
): SqlStatement {
  const columns = Object.keys(spec.values);
  checkUpsert(spec, columns);
  const updated =
    spec.onConflict === "update"
      ? columns.filter((column) => !spec.key.includes(column))
      : [];
  const sql =
    dialect === "sqlite"
      ? sqliteUpsert(spec, columns, updated)
      : tsqlUpsert(spec, columns, updated);
  return { sql, params: spec.values };
}

/** One page of rows ordered by an increasing key that is never reused, such as `seq`. */
export interface KeysetPageSpec {
  readonly table: string;
  readonly columns: readonly [string, ...string[]];
  readonly key: string;
  /** Rows with a key greater than this; 0 for the first page, then the last key of the page before. */
  readonly after: number;
  /** The most rows to return: a positive integer. */
  readonly limit: number;
  /**
   * An extra condition, written by the accessor for this dialect, with its own parameters. The
   * names `page_after` and `page_limit` are the layer's.
   */
  readonly where?: SqlStatement;
}

/**
 * The dialect's keyset page. Rows added between two pages are never skipped, because a page starts
 * after a key rather than at a row count.
 */
export function keysetPageStatement(
  dialect: SqlDialect,
  spec: KeysetPageSpec,
): SqlStatement {
  checkPage(spec);
  const quote = quoter(dialect);
  const columns = spec.columns.map(quote).join(", ");
  const key = quote(spec.key);
  const extra = spec.where === undefined ? "" : ` AND (${spec.where.sql})`;
  const condition = `${key} > @${PAGE_AFTER}${extra}`;
  const sql =
    dialect === "sqlite"
      ? `SELECT ${columns} FROM ${quote(spec.table)} WHERE ${condition} ORDER BY ${key} LIMIT @${PAGE_LIMIT}`
      : `SELECT TOP (@${PAGE_LIMIT}) ${columns} FROM ${quote(spec.table)} WHERE ${condition} ORDER BY ${key}`;
  return {
    sql,
    params: {
      ...spec.where?.params,
      [PAGE_AFTER]: spec.after,
      [PAGE_LIMIT]: spec.limit,
    },
  };
}

function sqliteUpsert(
  spec: UpsertSpec,
  columns: readonly string[],
  updated: readonly string[],
): string {
  const quote = quoter("sqlite");
  const table = quote(spec.table);
  const insert = `INSERT INTO ${table} (${columns.map(quote).join(", ")}) VALUES (${columns.map((column) => `@${column}`).join(", ")})`;
  const conflict = `ON CONFLICT (${spec.key.map(quote).join(", ")})`;
  if (updated.length === 0) {
    return `${insert} ${conflict} DO NOTHING`;
  }
  const set = updated
    .map((column) => `${quote(column)} = excluded.${quote(column)}`)
    .join(", ");
  const guard =
    spec.onlyIfNewer === undefined
      ? ""
      : ` WHERE excluded.${quote(spec.onlyIfNewer)} > ${table}.${quote(spec.onlyIfNewer)}`;
  return `${insert} ${conflict} DO UPDATE SET ${set}${guard}`;
}

function tsqlUpsert(
  spec: UpsertSpec,
  columns: readonly string[],
  updated: readonly string[],
): string {
  const quote = quoter("tsql");
  const target = (column: string): string => `[target].${quote(column)}`;
  const source = (column: string): string => `[source].${quote(column)}`;
  const using = `USING (VALUES (${columns.map((column) => `@${column}`).join(", ")})) AS [source] (${columns.map(quote).join(", ")})`;
  const on = spec.key
    .map((column) => `${target(column)} = ${source(column)}`)
    .join(" AND ");
  const insert = `WHEN NOT MATCHED THEN INSERT (${columns.map(quote).join(", ")}) VALUES (${columns.map(source).join(", ")})`;
  const merge = `MERGE INTO ${quote(spec.table)} WITH (HOLDLOCK) AS [target] ${using} ON ${on}`;
  if (updated.length === 0) {
    return `${merge} ${insert};`;
  }
  const guard =
    spec.onlyIfNewer === undefined
      ? ""
      : ` AND ${target(spec.onlyIfNewer)} < ${source(spec.onlyIfNewer)}`;
  const set = updated
    .map((column) => `${quote(column)} = ${source(column)}`)
    .join(", ");
  return `${merge} WHEN MATCHED${guard} THEN UPDATE SET ${set} ${insert};`;
}

function checkUpsert(spec: UpsertSpec, columns: readonly string[]): void {
  checkIdentifier(spec.table);
  columns.forEach(checkIdentifier);
  for (const column of spec.key) {
    if (!columns.includes(column)) {
      throw refused("Every key column needs a value.");
    }
  }
  if (spec.onlyIfNewer === undefined) {
    return;
  }
  if (spec.onConflict !== "update") {
    throw refused("A version guard applies only when the row is updated.");
  }
  if (
    !columns.includes(spec.onlyIfNewer) ||
    spec.key.includes(spec.onlyIfNewer)
  ) {
    throw refused(
      "The version column must be a written column outside the key.",
    );
  }
}

function checkPage(spec: KeysetPageSpec): void {
  checkIdentifier(spec.table);
  checkIdentifier(spec.key);
  spec.columns.forEach(checkIdentifier);
  if (!Number.isSafeInteger(spec.limit) || spec.limit < 1) {
    throw refused("A page limit must be a positive integer.");
  }
  if (!Number.isSafeInteger(spec.after)) {
    throw refused("A page must start after an integer key.");
  }
  const params = spec.where?.params ?? {};
  if (Object.hasOwn(params, PAGE_AFTER) || Object.hasOwn(params, PAGE_LIMIT)) {
    throw refused("The names page_after and page_limit are the layer's.");
  }
}

function checkIdentifier(name: string): void {
  if (!IDENTIFIER.test(name)) {
    throw refused("A table or column name must be lower-case snake case.");
  }
}

function quoter(dialect: SqlDialect): (name: string) => string {
  return dialect === "sqlite" ? (name) => `"${name}"` : (name) => `[${name}]`;
}

function refused(message: string): QueryLayerError {
  return new QueryLayerError("statement_failed", message);
}
