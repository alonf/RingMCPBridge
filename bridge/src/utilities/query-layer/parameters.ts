// Placeholders against parameters. SQLite binds NULL for a placeholder with no value, without a
// word, so both dialects check every statement here before the database sees it.
import { QueryLayerError } from "./query-layer-error.ts";
import type { SqlStatement } from "./sql-types.ts";

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const NAME_CHARACTER = /[A-Za-z0-9_]/;

/** Throws `statement_failed` unless the statement's placeholders and parameters match exactly. */
export function checkParameters(statement: SqlStatement): void {
  const placeholders = placeholderNames(statement.sql);
  for (const name of placeholders) {
    if (!Object.hasOwn(statement.params, name)) {
      throw refused(`The placeholder @${name} has no parameter.`);
    }
  }
  for (const name of Object.keys(statement.params)) {
    if (!NAME.test(name)) {
      throw refused("A parameter name is not a plain name.");
    }
    if (!placeholders.has(name)) {
      throw refused(`The parameter ${name} has no placeholder.`);
    }
  }
}

/**
 * The `@name` placeholders in `sql`. Skips string literals, quoted names (`"x"` and `[x]`),
 * comments, and T-SQL's `@@` system functions.
 */
export function placeholderNames(sql: string): ReadonlySet<string> {
  const names = new Set<string>();
  let index = 0;
  while (index < sql.length) {
    const skipped = skipQuotedOrComment(sql, index);
    if (skipped !== index) {
      index = skipped;
    } else if (sql.startsWith("@@", index)) {
      index = readName(sql, index + 2);
    } else if (sql[index] === "@") {
      const end = readName(sql, index + 1);
      if (end > index + 1) {
        names.add(sql.slice(index + 1, end));
      }
      index = Math.max(end, index + 1);
    } else {
      index += 1;
    }
  }
  return names;
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
