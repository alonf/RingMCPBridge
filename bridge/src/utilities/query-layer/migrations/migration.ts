// A numbered schema change, written once per dialect (B6, DS5). Migrations are forward-only and
// additive, so code N-1 still runs on schema N: a released migration's text never changes, and a
// later change is a new migration.
import { QueryLayerError } from "../query-layer-error.ts";
import type { SqlDialect } from "../sql-types.ts";

const MIGRATION_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface Migration {
  /** 1, 2, 3 and so on: the order migrations run in. Never reused or renumbered. */
  readonly version: number;
  /** A short kebab-case name, recorded with the version. */
  readonly name: string;
  /** Each dialect's statements, one statement per entry, run in order inside one transaction. */
  readonly statements: Readonly<Record<SqlDialect, readonly string[]>>;
}

/** What one run of the migrations did. */
export interface MigrationReport {
  /** The versions this run applied, in order. */
  readonly applied: readonly number[];
  /**
   * Versions the database records that this code does not know: a newer release migrated it. The
   * changes are additive, so this code still runs (code N-1 on schema N).
   */
  readonly unknown: readonly number[];
}

/**
 * Throws `statement_failed` unless the versions run 1, 2, 3 without a gap, every name is kebab-case,
 * and every migration has statements for both dialects.
 */
export function checkMigrations(migrations: readonly Migration[]): void {
  migrations.forEach((migration, index) => {
    if (migration.version !== index + 1) {
      throw refused(
        `Migration ${String(index + 1)} is missing: the list must number 1, 2, 3 in order.`,
      );
    }
    if (!MIGRATION_NAME.test(migration.name)) {
      throw refused(
        `Migration ${String(migration.version)} needs a kebab-case name.`,
      );
    }
    if (
      migration.statements.sqlite.length === 0 ||
      migration.statements.tsql.length === 0
    ) {
      throw refused(
        `Migration ${String(migration.version)} needs statements for both dialects.`,
      );
    }
  });
}

function refused(message: string): QueryLayerError {
  return new QueryLayerError("statement_failed", message);
}
