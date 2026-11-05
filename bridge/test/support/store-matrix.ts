// The store matrix (T010, FR-006): runs one integration suite on SQLite and on SQL Server, each
// test with empty databases of its own. SQL Server comes from the environment (docker-compose.yml
// locally, a service in CI); without its settings the SQL Server half skips, except in CI, where
// `requireSqlServerInCi` fails the run.
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import mssql from "mssql";
import type { config as MssqlConfig } from "mssql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SystemClock } from "../../src/utilities/clock/index.ts";
import { openSqliteQueryLayer } from "../../src/utilities/query-layer/index.ts";
import type {
  QueryLayer,
  SqlDialect,
} from "../../src/utilities/query-layer/index.ts";
import { createTsqlQueryLayer } from "../../src/utilities/query-layer/tsql.ts";

/** How long to wait for a SQL Server that is still starting (CI's service container). */
export const SQL_SERVER_READY_TIMEOUT_MS = 90_000;
const READY_POLL_MS = 2_000;
/** A `beforeAll` timeout that covers the wait, with room for its last attempt. */
export const SQL_SERVER_SETUP_TIMEOUT_MS =
  SQL_SERVER_READY_TIMEOUT_MS + 2 * READY_POLL_MS;
const NAME_BYTES = 6;

/** One store a matrix suite runs on. */
export interface StoreUnderTest {
  readonly dialect: SqlDialect;
  /** A Query layer on a new, empty database, closed and removed after the suite. */
  emptyDatabase(): Promise<QueryLayer>;
}

/**
 * The test SQL Server's settings from TEST_MSSQL_HOST, TEST_MSSQL_PORT and TEST_MSSQL_PASSWORD, or
 * `undefined` when any is missing. The login is `sa`.
 */
export function sqlServerTestSettings(): MssqlConfig | undefined {
  const {
    TEST_MSSQL_HOST: host,
    TEST_MSSQL_PORT: port,
    TEST_MSSQL_PASSWORD: password,
  } = process.env;
  if (host === undefined || port === undefined || password === undefined) {
    return undefined;
  }
  return {
    server: host,
    port: Number(port),
    user: "sa",
    password,
    // The test container's certificate is self-signed; production keeps the check.
    options: { encrypt: true, trustServerCertificate: true },
  };
}

/** Connects to SQL Server, waiting up to `SQL_SERVER_READY_TIMEOUT_MS` for it to start. */
export async function connectWhenReady(
  config: MssqlConfig,
): Promise<mssql.ConnectionPool> {
  const deadline = Date.now() + SQL_SERVER_READY_TIMEOUT_MS;
  for (;;) {
    const pool = new mssql.ConnectionPool(config);
    try {
      return await pool.connect();
    } catch (error) {
      await pool.close().catch(() => undefined);
      if (Date.now() > deadline) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, READY_POLL_MS));
    }
  }
}

/** Adds a test that fails in CI when the SQL Server settings are missing, so nothing skips there. */
export function requireSqlServerInCi(): void {
  it.runIf(
    sqlServerTestSettings() === undefined && process.env.CI !== undefined,
  )("has the SQL Server settings in CI", () => {
    expect.fail(
      "TEST_MSSQL_HOST, TEST_MSSQL_PORT and TEST_MSSQL_PASSWORD must be set in CI.",
    );
  });
}

/** Runs `suite` once on SQLite and once on SQL Server. */
export function describeStoreMatrix(
  title: string,
  suite: (store: StoreUnderTest) => void,
): void {
  describe(`${title} (SQLite)`, () => {
    suite(sqliteStore());
  });
  const settings = sqlServerTestSettings();
  describe.skipIf(settings === undefined)(`${title} (SQL Server)`, () => {
    suite(sqlServerStore(settings ?? { server: "" }));
  });
}

// Must be called inside a describe block: it registers the cleanup there.
function sqliteStore(): StoreUnderTest {
  const folder = mkdtempSync(join(tmpdir(), "store-matrix-"));
  const opened: QueryLayer[] = [];
  afterAll(async () => {
    for (const layer of opened) {
      await layer.close();
    }
    rmSync(folder, { recursive: true, force: true });
  });
  return {
    dialect: "sqlite",
    emptyDatabase: () => {
      const file = join(folder, `${String(opened.length + 1)}.db`);
      const layer = openSqliteQueryLayer(file, { clock: new SystemClock() });
      opened.push(layer);
      return Promise.resolve(layer);
    },
  };
}

// Must be called inside a describe block: it registers the connection and the cleanup there.
function sqlServerStore(config: MssqlConfig): StoreUnderTest {
  let master: mssql.ConnectionPool | undefined;
  const opened: QueryLayer[] = [];
  const databases: string[] = [];
  beforeAll(async () => {
    master = await connectWhenReady(config);
  }, SQL_SERVER_SETUP_TIMEOUT_MS);
  afterAll(async () => {
    for (const layer of opened) {
      await layer.close();
    }
    for (const name of databases) {
      await master
        ?.request()
        .query(
          `ALTER DATABASE [${name}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [${name}]`,
        );
    }
    await master?.close();
  });
  return {
    dialect: "tsql",
    emptyDatabase: async () => {
      if (master === undefined) {
        throw new Error("The test SQL Server is not connected.");
      }
      const name = `store_${randomBytes(NAME_BYTES).toString("hex")}`;
      await master.request().query(`CREATE DATABASE [${name}]`);
      databases.push(name);
      const layer = createTsqlQueryLayer(
        { ...config, database: name },
        { clock: new SystemClock() },
      );
      opened.push(layer);
      return layer;
    },
  };
}
