// The Query layer's seam types (R21): one way to run SQL on SQLite and on SQL Server (T-SQL).

/** The two SQL dialects. Accessors write their SQL by hand per dialect (B6). */
export type SqlDialect = "sqlite" | "tsql";

/**
 * A value the layer carries in and out. Integers stay within `Number.MAX_SAFE_INTEGER`. There is no
 * boolean: a flag is the number 0 or 1 on both dialects (a T-SQL `BIT` comes back as 0 or 1).
 */
export type SqlValue = string | number | Uint8Array | null;

/** Named parameters: the key `name` fills the placeholder `@name`. */
export type SqlParams = Readonly<Record<string, SqlValue>>;

/** One result row, by column name. */
export type SqlRow = Readonly<Record<string, SqlValue>>;

/**
 * One statement and its parameters. Every `@name` placeholder in `sql` needs a parameter, and every
 * parameter needs a placeholder; a mismatch is refused before the database sees the statement.
 */
export interface SqlStatement {
  readonly sql: string;
  readonly params: SqlParams;
}

/**
 * Runs statements. Two implementations: the Query layer itself (each call is its own unit of work)
 * and the session a transaction hands its work.
 */
export interface SqlSession {
  readonly dialect: SqlDialect;
  /** Runs a statement and resolves with every row it returns. */
  all(statement: SqlStatement, signal: AbortSignal): Promise<readonly SqlRow[]>;
  /** Runs a statement and resolves with its first row, or `undefined` when it returns none. */
  get(
    statement: SqlStatement,
    signal: AbortSignal,
  ): Promise<SqlRow | undefined>;
  /** Runs a statement and resolves with the number of rows it inserted, updated or deleted. */
  run(statement: SqlStatement, signal: AbortSignal): Promise<number>;
}
