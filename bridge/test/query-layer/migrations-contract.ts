// The migrations' contract (T008, DS5): the same tests run on SQLite and on SQL Server, each on an
// empty database of its own.
import { describe, expect, it } from "vitest";
import { FakeClock } from "../../src/utilities/clock/index.ts";
import {
  CORE_MIGRATIONS,
  QueryLayerError,
  runMigrations,
} from "../../src/utilities/query-layer/index.ts";
import type {
  Migration,
  QueryLayer,
  SqlDialect,
  SqlParams,
  SqlRow,
  SqlStatement,
} from "../../src/utilities/query-layer/index.ts";

/**
 * The newest migration version in the last release. No release exists yet, so the upgrade starts
 * from an empty database. Raise this at each release, and seed that release's rows before the
 * upgrade.
 */
export const PREVIOUS_RELEASE_SCHEMA_VERSION = 0;

const APPLIED_AT = Date.UTC(2026, 10, 5, 9, 0, 0);
const AS_OF = Date.UTC(2026, 10, 5, 8, 30, 0, 250);
const LATER = AS_OF + 60_000;

/** Each table's columns in order, and whether each is required (NOT NULL). */
const EXPECTED_TABLES: Readonly<
  Record<string, readonly (readonly [string, boolean])[]>
> = {
  schema_migration: [
    ["version", true],
    ["name", true],
    ["applied_at", true],
  ],
  location: [
    ["location_id", true],
    ["name", true],
    ["ownership", true],
    ["time_zone", true],
    ["alarm_mode", false],
    ["as_of", true],
    ["state_version", true],
  ],
  device: [
    ["device_id", true],
    ["location_id", true],
    ["name", true],
    ["kind", true],
    ["room", false],
    ["battery_pct", false],
    ["battery_low", false],
    ["power_mode", true],
    ["online", true],
    ["state", true],
    ["as_of", true],
    ["state_version", true],
  ],
  health_snapshot: [
    ["snapshot_id", true],
    ["home_link_status", false],
    ["home_link_since", false],
    ["ring_session_status", false],
    ["ring_session_since", false],
    ["push_status", false],
    ["push_since", false],
    ["last_event_at", false],
    ["stale_since", false],
    ["outbox_depth", false],
    ["connector_version", false],
    ["as_of", true],
  ],
  setting: [
    ["name", true],
    ["value", true],
    ["updated_at", true],
  ],
  agent: [
    ["client_id", true],
    ["platform", false],
    ["scopes", true],
    ["redirect_uris", true],
    ["revoked_at", false],
    ["last_seen_at", false],
  ],
  connector: [
    ["key_id", true],
    ["public_key", true],
    ["status", true],
    ["requested_at", true],
    ["expires_at", false],
    ["enrolled_at", false],
    ["revoked_at", false],
    ["connector_version", false],
    ["enrollment_code", false],
  ],
  oidc_item: [
    ["model", true],
    ["id", true],
    ["grant_id", false],
    ["uid", false],
    ["data", true],
    ["expires_at", false],
  ],
  lease: [
    ["name", true],
    ["holder", true],
    ["expires_at", true],
  ],
  state_source: [
    ["source_id", true],
    ["key_id", true],
    ["claimed_at", true],
  ],
};

const LOCATION = {
  location_id: "location-1",
  name: "בית",
  ownership: "owned",
  time_zone: "Asia/Tokyo",
  alarm_mode: "home",
  as_of: AS_OF,
  state_version: 7,
};

const DEVICE = {
  device_id: "device-1",
  location_id: LOCATION.location_id,
  name: "דלת כניסה",
  kind: "contact",
  room: "מסדרון",
  battery_pct: 87,
  battery_low: 0,
  power_mode: "battery",
  online: 1,
  state: '{"open":false}',
  as_of: AS_OF,
  state_version: 12,
};

/** Per table: a row with every column set, then the same key with every nullable column NULL. */
const ROWS: Readonly<Record<string, readonly [SqlParams, SqlParams]>> = {
  location: [LOCATION, { ...LOCATION, alarm_mode: null }],
  device: [
    DEVICE,
    {
      device_id: "device-1",
      location_id: LOCATION.location_id,
      name: "Light",
      kind: "light",
      room: null,
      battery_pct: null,
      battery_low: null,
      power_mode: "wired",
      online: 0,
      state: "{}",
      as_of: AS_OF,
      state_version: 13,
    },
  ],
  health_snapshot: [
    {
      snapshot_id: 1,
      home_link_status: "up",
      home_link_since: AS_OF,
      ring_session_status: "ok",
      ring_session_since: AS_OF,
      push_status: "ok",
      push_since: AS_OF,
      last_event_at: AS_OF,
      stale_since: AS_OF,
      outbox_depth: 3,
      connector_version: "0.1.0",
      as_of: AS_OF,
    },
    {
      snapshot_id: 1,
      home_link_status: null,
      home_link_since: null,
      ring_session_status: null,
      ring_session_since: null,
      push_status: null,
      push_since: null,
      last_event_at: null,
      stale_since: null,
      outbox_depth: null,
      connector_version: null,
      as_of: AS_OF,
    },
  ],
  setting: [
    { name: "battery_threshold_pct", value: "20", updated_at: AS_OF },
    { name: "battery_threshold_pct", value: "25", updated_at: LATER },
  ],
  agent: [
    {
      client_id: "https://agent.example/client.json",
      platform: "chat",
      scopes: '["read"]',
      redirect_uris: '["https://agent.example/callback"]',
      revoked_at: LATER,
      last_seen_at: AS_OF,
    },
    {
      client_id: "https://agent.example/client.json",
      platform: null,
      scopes: "[]",
      redirect_uris: "[]",
      revoked_at: null,
      last_seen_at: null,
    },
  ],
  connector: [
    {
      key_id: "key-1",
      public_key: "public-key-text",
      status: "active",
      requested_at: AS_OF,
      expires_at: LATER,
      enrolled_at: AS_OF,
      revoked_at: LATER,
      connector_version: "0.1.0",
      enrollment_code: "7Q4K-29XM",
    },
    {
      key_id: "key-1",
      public_key: "public-key-text",
      status: "pending",
      requested_at: AS_OF,
      expires_at: null,
      enrolled_at: null,
      revoked_at: null,
      connector_version: null,
      enrollment_code: null,
    },
  ],
  oidc_item: [
    {
      model: "Grant",
      id: "grant-Aa",
      grant_id: "grant-Aa",
      uid: "uid-1",
      data: '{"kind":"Grant"}',
      expires_at: LATER,
    },
    {
      model: "Grant",
      id: "grant-Aa",
      grant_id: null,
      uid: null,
      data: "{}",
      expires_at: null,
    },
  ],
  lease: [
    { name: "core", holder: "replica-a", expires_at: LATER },
    { name: "core", holder: "replica-b", expires_at: LATER + 1 },
  ],
  state_source: [
    { source_id: 1, key_id: "key-1", claimed_at: AS_OF },
    { source_id: 1, key_id: "key-2", claimed_at: LATER },
  ],
};

const DESCRIBE_COLUMNS: Readonly<Record<SqlDialect, string>> = {
  sqlite:
    'SELECT name, "notnull" AS required FROM pragma_table_info(@table) ORDER BY cid',
  tsql: "SELECT COLUMN_NAME AS name, CASE IS_NULLABLE WHEN 'NO' THEN 1 ELSE 0 END AS required FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @table ORDER BY ORDINAL_POSITION",
};

const LIST_TABLES: Readonly<Record<SqlDialect, string>> = {
  sqlite:
    "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
  tsql: "SELECT TABLE_NAME AS name FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE'",
};

function never(): AbortSignal {
  return new AbortController().signal;
}

function sql(text: string, params: SqlParams = {}): SqlStatement {
  return { sql: text, params };
}

function migrate(
  layer: QueryLayer,
  migrations: readonly Migration[] = CORE_MIGRATIONS,
): ReturnType<typeof runMigrations> {
  return runMigrations(
    layer,
    migrations,
    { clock: new FakeClock(APPLIED_AT) },
    never(),
  );
}

function insert(table: string, row: SqlParams): SqlStatement {
  const columns = Object.keys(row);
  return sql(
    `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map((column) => `@${column}`).join(", ")})`,
    row,
  );
}

function probe(version: number, name: string, table: string): Migration {
  return {
    version,
    name,
    statements: {
      sqlite: [`CREATE TABLE ${table} (x INTEGER) STRICT`],
      tsql: [`CREATE TABLE ${table} (x INT)`],
    },
  };
}

async function tableNames(layer: QueryLayer): Promise<string[]> {
  const rows = await layer.all(sql(LIST_TABLES[layer.dialect]), never());
  return rows.map((row) => String(row.name)).sort();
}

async function versions(layer: QueryLayer): Promise<readonly SqlRow[]> {
  return layer.all(
    sql(
      "SELECT version, name, applied_at FROM schema_migration ORDER BY version",
    ),
    never(),
  );
}

export function describeMigrationsContract(
  dialect: SqlDialect,
  emptyDatabase: () => Promise<QueryLayer>,
): void {
  describe(`the migrations on ${dialect}`, () => {
    it("upgrade the previous release's schema to this one", async () => {
      const layer = await emptyDatabase();
      const previous = CORE_MIGRATIONS.filter(
        (migration) => migration.version <= PREVIOUS_RELEASE_SCHEMA_VERSION,
      );
      await migrate(layer, previous);

      const report = await migrate(layer);

      expect(report).toEqual({
        applied: CORE_MIGRATIONS.filter(
          (migration) => migration.version > PREVIOUS_RELEASE_SCHEMA_VERSION,
        ).map((migration) => migration.version),
        unknown: [],
      });
      expect(await versions(layer)).toEqual(
        CORE_MIGRATIONS.map((migration) => ({
          version: migration.version,
          name: migration.name,
          applied_at: APPLIED_AT,
        })),
      );
    });

    it("create every table with the expected columns, in order", async () => {
      const layer = await emptyDatabase();
      await migrate(layer);

      expect(await tableNames(layer)).toEqual(
        Object.keys(EXPECTED_TABLES).sort(),
      );
      for (const [table, columns] of Object.entries(EXPECTED_TABLES)) {
        const described = await layer.all(
          sql(DESCRIBE_COLUMNS[dialect], { table }),
          never(),
        );
        expect(
          described.map((row) => [row.name, row.required === 1]),
          table,
        ).toEqual(columns);
      }
    });

    it("apply nothing on a second run", async () => {
      const layer = await emptyDatabase();
      await migrate(layer);

      await expect(migrate(layer)).resolves.toEqual({
        applied: [],
        unknown: [],
      });
    });

    it("report the versions the code does not know, in order, and carry on", async () => {
      const layer = await emptyDatabase();
      await migrate(layer);
      for (const version of [99, 98]) {
        await layer.run(
          insert("schema_migration", {
            version,
            name: "from-a-newer-release",
            applied_at: APPLIED_AT,
          }),
          never(),
        );
      }

      await expect(migrate(layer)).resolves.toEqual({
        applied: [],
        unknown: [98, 99],
      });
    });

    it("refuse a schema_migration table of another shape", async () => {
      const layer = await emptyDatabase();
      await layer.run(
        sql("CREATE TABLE schema_migration (version TEXT, name TEXT)"),
        never(),
      );
      await layer.run(
        sql("INSERT INTO schema_migration (version, name) VALUES ('one', 'x')"),
        never(),
      );

      await expect(migrate(layer)).rejects.toThrow(
        "The table schema_migration holds a row of the wrong shape.",
      );
    });

    it("roll back a migration that fails part-way, then apply it once fixed", async () => {
      const layer = await emptyDatabase();
      const broken: Migration = {
        version: 2,
        name: "probe-two",
        statements: {
          sqlite: [
            "CREATE TABLE probe_two (x INTEGER) STRICT",
            "INSERT INTO no_such_table (x) VALUES (1)",
          ],
          tsql: [
            "CREATE TABLE probe_two (x INT)",
            "INSERT INTO no_such_table (x) VALUES (1)",
          ],
        },
      };
      const first = probe(1, "probe-one", "probe_one");

      await expect(migrate(layer, [first, broken])).rejects.toMatchObject({
        kind: "statement_failed",
      });
      expect(await tableNames(layer)).toEqual([
        "probe_one",
        "schema_migration",
      ]);

      await expect(
        migrate(layer, [first, probe(2, "probe-two", "probe_two")]),
      ).resolves.toEqual({ applied: [2], unknown: [] });
    });

    it("skip a migration that another start applied after this one looked", async () => {
      const layer = await emptyDatabase();
      let looked = false;
      // Lets another start migrate the moment this start has read the applied versions.
      const racing = new Proxy(layer, {
        get(target, property) {
          if (property === "all") {
            return async (...args: Parameters<QueryLayer["all"]>) => {
              const rows = await target.all(...args);
              if (!looked) {
                looked = true;
                await migrate(target);
              }
              return rows;
            };
          }
          const value: unknown = Reflect.get(target, property, target);
          return typeof value === "function"
            ? (value as (this: QueryLayer, ...args: unknown[]) => unknown).bind(
                target,
              )
            : value;
        },
      });

      await expect(migrate(racing)).resolves.toEqual({
        applied: [],
        unknown: [],
      });
      expect(looked).toBe(true);
      expect(await versions(layer)).toHaveLength(CORE_MIGRATIONS.length);
    });

    it("refuse a list with a gap before touching the database", async () => {
      const layer = await emptyDatabase();

      await expect(
        migrate(layer, [probe(2, "probe-two", "probe_two")]),
      ).rejects.toMatchObject({ kind: "statement_failed" });
      expect(await tableNames(layer)).toEqual([]);
    });

    it("refuse a recorded version that the code names differently", async () => {
      const layer = await emptyDatabase();
      await migrate(layer, [probe(1, "probe-one", "probe_one")]);

      await expect(
        migrate(layer, [probe(1, "probe-renamed", "probe_one")]),
      ).rejects.toThrow(
        "The database records migration 1 as probe-one, but this code names it probe-renamed.",
      );
    });

    it("store and return a full row, and a row of NULLs, in every table", async () => {
      const layer = await emptyDatabase();
      await migrate(layer);

      // Location comes first, so the device rows find their location.
      for (const [table, rows] of Object.entries(ROWS)) {
        for (const row of rows) {
          await layer.run(sql(`DELETE FROM ${table}`), never());
          await layer.run(insert(table, row), never());
          const columns = Object.keys(row).join(", ");
          await expect(
            layer.all(sql(`SELECT ${columns} FROM ${table}`), never()),
            table,
          ).resolves.toEqual([row]);
        }
      }
    });

    it("keep ids that differ only in case apart", async () => {
      const layer = await emptyDatabase();
      await migrate(layer);
      for (const id of ["grant-aa", "GRANT-AA"]) {
        await layer.run(
          insert("oidc_item", { model: "Grant", id, data: "{}" }),
          never(),
        );
      }

      await expect(
        layer.all(
          sql("SELECT id FROM oidc_item WHERE model = @model AND id = @id", {
            model: "Grant",
            id: "GRANT-AA",
          }),
          never(),
        ),
      ).resolves.toEqual([{ id: "GRANT-AA" }]);
    });

    it("refuse a device whose location does not exist", async () => {
      const layer = await emptyDatabase();
      await migrate(layer);

      await expect(
        layer.run(insert("device", DEVICE), never()),
      ).rejects.toMatchObject({ kind: "constraint_violated" });
    });

    it("keep one health snapshot row", async () => {
      const layer = await emptyDatabase();
      await migrate(layer);

      await expect(
        layer.run(
          insert("health_snapshot", { snapshot_id: 2, as_of: AS_OF }),
          never(),
        ),
      ).rejects.toMatchObject({ kind: "constraint_violated" });
    });

    it("refuse text in an integer column, so versions always compare as numbers", async () => {
      const layer = await emptyDatabase();
      await migrate(layer);

      await expect(
        layer.run(
          insert("location", { ...LOCATION, state_version: "seven" }),
          never(),
        ),
      ).rejects.toBeInstanceOf(QueryLayerError);
    });
  });
}
