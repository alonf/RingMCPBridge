// Applies the migrations a database lacks, in order, when the Host starts (DS5, R21). Each one
// runs in its own transaction together with its version record, under a lock, so two starts at
// once (a deploy overlapping the old container) apply each migration exactly once.
import type { Clock } from "../../clock/index.ts";
import { QueryLayerError } from "../query-layer-error.ts";
import type { QueryLayer } from "../query-layer.ts";
import type { SqlDialect, SqlSession, SqlStatement } from "../sql-types.ts";
import { checkMigrations } from "./migration.ts";
import type { Migration, MigrationReport } from "./migration.ts";

/**
 * How long a start waits on SQL Server for another start's migration. It stays under mssql's
 * 15-second request timeout, so a long wait ends as a refused lock rather than a lost connection.
 */
export const MIGRATION_LOCK_WAIT_MS = 10_000;

const CREATE_RECORD_TABLE: Readonly<Record<SqlDialect, string>> = {
  sqlite: `CREATE TABLE IF NOT EXISTS schema_migration (
    version INTEGER NOT NULL,
    name TEXT NOT NULL,
    applied_at INTEGER NOT NULL,
    CONSTRAINT schema_migration_pk PRIMARY KEY (version)
  ) STRICT`,
  tsql: `IF OBJECT_ID(N'schema_migration', N'U') IS NULL CREATE TABLE schema_migration (
    version INT NOT NULL,
    name NVARCHAR(128) COLLATE Latin1_General_100_BIN2 NOT NULL,
    applied_at BIGINT NOT NULL,
    CONSTRAINT schema_migration_pk PRIMARY KEY (version)
  )`,
};

export interface MigrationOptions {
  /** Stamps each version record. */
  readonly clock: Clock;
  /** SQL Server only: the wait for another start's lock. Defaults to `MIGRATION_LOCK_WAIT_MS`. */
  readonly lockWaitMs?: number;
}

/**
 * Brings the database up to the newest of `migrations` and reports what it did. Versions the
 * database records but the code does not know are reported, not refused (code N-1 on schema N).
 * Throws `statement_failed` when the list is malformed or a recorded version has another name.
 */
export async function runMigrations(
  layer: QueryLayer,
  migrations: readonly Migration[],
  options: MigrationOptions,
  signal: AbortSignal,
): Promise<MigrationReport> {
  checkMigrations(migrations);
  const lockWaitMs = options.lockWaitMs ?? MIGRATION_LOCK_WAIT_MS;
  await layer.transaction(async (session) => {
    await lockMigrations(session, lockWaitMs, signal);
    await session.run(statement(CREATE_RECORD_TABLE[session.dialect]), signal);
  }, signal);
  const recorded = await recordedVersions(layer, signal);
  checkRecordedNames(migrations, recorded);
  const applied: number[] = [];
  for (const migration of migrations) {
    if (
      !recorded.has(migration.version) &&
      (await applyMigration(
        layer,
        migration,
        { ...options, lockWaitMs },
        signal,
      ))
    ) {
      applied.push(migration.version);
    }
  }
  const known = new Set(migrations.map((migration) => migration.version));
  const unknown = [...recorded.keys()]
    .filter((version) => !known.has(version))
    .sort((left, right) => left - right);
  return { applied, unknown };
}

// Resolves false when another start applied the migration while this one waited for the lock.
async function applyMigration(
  layer: QueryLayer,
  migration: Migration,
  options: Required<MigrationOptions>,
  signal: AbortSignal,
): Promise<boolean> {
  return layer.transaction(async (session) => {
    await lockMigrations(session, options.lockWaitMs, signal);
    const done = await session.get(
      statement(
        "SELECT version FROM schema_migration WHERE version = @version",
        {
          version: migration.version,
        },
      ),
      signal,
    );
    if (done !== undefined) {
      return false;
    }
    for (const sql of migration.statements[session.dialect]) {
      await session.run(statement(sql), signal);
    }
    await session.run(
      statement(
        "INSERT INTO schema_migration (version, name, applied_at) VALUES (@version, @name, @applied_at)",
        {
          version: migration.version,
          name: migration.name,
          applied_at: options.clock.now(),
        },
      ),
      signal,
    );
    return true;
  }, signal);
}

// SQLite needs no lock statement: the layer begins every transaction with BEGIN IMMEDIATE, which
// takes the file's write lock. SQL Server takes an application lock that the commit releases.
async function lockMigrations(
  session: SqlSession,
  waitMs: number,
  signal: AbortSignal,
): Promise<void> {
  if (session.dialect === "sqlite") {
    return;
  }
  // A lock that is not granted in time is a return code, not an error, so the mode is read back.
  await session.run(
    statement(
      "EXEC sp_getapplock N'schema_migration', N'Exclusive', N'Transaction', @wait_ms",
      { wait_ms: waitMs },
    ),
    signal,
  );
  const held = await session.get(
    statement(
      "SELECT APPLOCK_MODE(N'public', N'schema_migration', N'Transaction') AS lock_mode",
    ),
    signal,
  );
  if (held?.lock_mode !== "Exclusive") {
    throw new QueryLayerError(
      "store_down",
      "Another start held the migration lock for too long.",
      { transient: true },
    );
  }
}

async function recordedVersions(
  layer: QueryLayer,
  signal: AbortSignal,
): Promise<ReadonlyMap<number, string>> {
  const rows = await layer.all(
    statement("SELECT version, name FROM schema_migration"),
    signal,
  );
  const recorded = new Map<number, string>();
  for (const { version, name } of rows) {
    if (typeof version !== "number" || typeof name !== "string") {
      throw new QueryLayerError(
        "statement_failed",
        "The table schema_migration holds a row of the wrong shape.",
      );
    }
    recorded.set(version, name);
  }
  return recorded;
}

// A version recorded under another name means a released migration was renumbered.
function checkRecordedNames(
  migrations: readonly Migration[],
  recorded: ReadonlyMap<number, string>,
): void {
  for (const migration of migrations) {
    const name = recorded.get(migration.version);
    if (name !== undefined && name !== migration.name) {
      throw new QueryLayerError(
        "statement_failed",
        `The database records migration ${String(migration.version)} as ${name}, but this code names it ${migration.name}.`,
      );
    }
  }
}

function statement(
  sql: string,
  params: SqlStatement["params"] = {},
): SqlStatement {
  return { sql, params };
}
