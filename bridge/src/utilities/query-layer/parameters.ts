// What the layer checks in a statement's text before the database sees it. SQLite binds NULL for a
// placeholder with no value, and compiles only the first of several statements, both without a
// word; so both dialects check every statement here.
import { QueryLayerError } from "./query-layer-error.ts";
import type { SqlStatement } from "./sql-types.ts";

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const NAME_CHARACTER = /[A-Za-z0-9_]/;
const WHITESPACE = /\s/;

/** What a scan of a statement's text finds outside its literals, quoted names and comments. */
interface SqlScan {
  readonly placeholders: ReadonlySet<string>;
  /** Text follows a `;`: a second statement, which SQLite would skip and SQL Server would run. */
  readonly secondStatement: boolean;
}

/**
 * Throws `statement_failed` unless the text is one statement (a closing `;` is allowed) and its
 * placeholders and parameters match exactly.
 */
export function checkStatement(statement: SqlStatement): void {
  const scan = scanSql(statement.sql);
  if (scan.secondStatement) {
    throw refused(
      "The text holds more than one statement; send each one on its own.",
    );
  }
  for (const name of scan.placeholders) {
    if (!Object.hasOwn(statement.params, name)) {
      throw refused(`The placeholder @${name} has no parameter.`);
    }
  }
  for (const name of Object.keys(statement.params)) {
    if (!NAME.test(name)) {
      throw refused("A parameter name is not a plain name.");
    }
    if (!scan.placeholders.has(name)) {
      throw refused(`The parameter ${name} has no placeholder.`);
    }
  }
}

/**
 * The `@name` placeholders in `sql`. Skips string literals, quoted names (`"x"` and `[x]`),
 * comments, and T-SQL's `@@` system functions.
 */
export function placeholderNames(sql: string): ReadonlySet<string> {
  return scanSql(sql).placeholders;
}

function scanSql(sql: string): SqlScan {
  const placeholders = new Set<string>();
  let ended = false;
  let secondStatement = false;
  let index = 0;
  while (index < sql.length) {
    const skipped = skipQuotedOrComment(sql, index);
    if (skipped !== index) {
      secondStatement ||= ended && !isComment(sql, index);
      index = skipped;
      continue;
    }
    const character = sql.charAt(index);
    if (character === ";") {
      ended = true;
    } else if (!WHITESPACE.test(character)) {
      secondStatement ||= ended;
    }
    index = readPlaceholder(sql, index, placeholders);
  }
  return { placeholders, secondStatement };
}

// Adds the placeholder that starts at `index`, if one does, and returns where scanning continues.
function readPlaceholder(
  sql: string,
  index: number,
  placeholders: Set<string>,
): number {
  if (sql.startsWith("@@", index)) {
    return readName(sql, index + 2);
  }
  if (sql[index] !== "@") {
    return index + 1;
  }
  const end = readName(sql, index + 1);
  if (end > index + 1) {
    placeholders.add(sql.slice(index + 1, end));
  }
  return Math.max(end, index + 1);
}

function isComment(sql: string, index: number): boolean {
  return sql.startsWith("--", index) || sql.startsWith("/*", index);
}

function skipQuotedOrComment(sql: string, index: number): number {
  const character = sql[index];
  if (character === "'" || character === '"') {
    return skipQuoted(sql, index, character);
  }
  if (character === "[") {
    return skipQuoted(sql, index, "]");
  }
  if (sql.startsWith("--", index)) {
    const end = sql.indexOf("\n", index);
    return end === -1 ? sql.length : end + 1;
  }
  if (sql.startsWith("/*", index)) {
    const end = sql.indexOf("*/", index + 2);
    return end === -1 ? sql.length : end + 2;
  }
  return index;
}

// A doubled closing quote inside the quoted text stands for the quote itself.
function skipQuoted(sql: string, start: number, closing: string): number {
  let index = start + 1;
  while (index < sql.length) {
    if (sql[index] === closing) {
      if (sql[index + 1] !== closing) {
        return index + 1;
      }
      index += 1;
    }
    index += 1;
  }
  return sql.length;
}

function readName(sql: string, start: number): number {
  let index = start;
  while (index < sql.length && NAME_CHARACTER.test(sql.charAt(index))) {
    index += 1;
  }
  return index;
}

function refused(message: string): QueryLayerError {
  return new QueryLayerError("statement_failed", message);
}
