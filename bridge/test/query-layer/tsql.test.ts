// The Query layer on a real SQL Server (T007, FR-006): the shared contract, plus what only the
// T-SQL driver does: cancelling a running request, an unreachable server, and connecting again
// after a failed connection. CI starts the server (.github/workflows/ci.yml); locally the tests
// skip unless TEST_MSSQL_HOST, TEST_MSSQL_PORT and TEST_MSSQL_PASSWORD are set.
import { randomBytes } from "node:crypto";
import mssql from "mssql";
import type { config as MssqlConfig } from "mssql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SystemClock } from "../../src/utilities/clock/index.ts";
import type {
  QueryLayer,
  SqlStatement,
} from "../../src/utilities/query-layer/index.ts";
import { createTsqlQueryLayer } from "../../src/utilities/query-layer/tsql.ts";
import { describeQueryLayerContract } from "./query-layer-contract.ts";

const READY_TIMEOUT_MS = 90_000;
const READY_POLL_MS = 2_000;
const CANCEL_LIMIT_MS = 3_000;
const UNUSED_PORT = 1;

const settings = testSettings();
const database = `query_layer_${randomBytes(6).toString("hex")}`;
const opened: QueryLayer[] = [];

function testSettings(): MssqlConfig | undefined {
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

function open(config: MssqlConfig): QueryLayer {
  const layer = createTsqlQueryLayer(config, {
    clock: new SystemClock(),
    retryPauseMs: 1,
  });
  opened.push(layer);
  return layer;
}

function never(): AbortSignal {
  return new AbortController().signal;
}

function sql(text: string, params: SqlStatement["params"] = {}): SqlStatement {
  return { sql: text, params };
}

// CI's service container may still be starting when the tests begin.
async function connectToMaster(
  config: MssqlConfig,
): Promise<mssql.ConnectionPool> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
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

it.runIf(settings === undefined && process.env.CI !== undefined)(
  "has the SQL Server settings in CI",
  () => {
    expect.fail(
      "TEST_MSSQL_HOST, TEST_MSSQL_PORT and TEST_MSSQL_PASSWORD must be set in CI.",
    );
  },
);

describe.skipIf(settings === undefined)("the Query layer on SQL Server", () => {
  const config = settings ?? { server: "" };
  const inDatabase: MssqlConfig = { ...config, database };
  let master: mssql.ConnectionPool;

  beforeAll(async () => {
    master = await connectToMaster(config);
    await master.request().query(`CREATE DATABASE [${database}]`);
  }, READY_TIMEOUT_MS + READY_POLL_MS);

  afterAll(async () => {
    for (const layer of opened) {
      await layer.close();
    }
    await master
      .request()
      .query(
        `ALTER DATABASE [${database}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [${database}]`,
      );
    await master.close();
  });

  describeQueryLayerContract("tsql", () => open(inDatabase));

  it("cancels a running request when the caller aborts", async () => {
    const layer = open(inDatabase);
    const controller = new AbortController();
    const reason = new Error("caller gone");
    const started = Date.now();

    const waiting = layer.run(
      sql("WAITFOR DELAY '00:00:10'"),
      controller.signal,
    );
    setTimeout(() => {
      controller.abort(reason);
    }, 200);

    await expect(waiting).rejects.toBe(reason);
    expect(Date.now() - started).toBeLessThan(CANCEL_LIMIT_MS);
    await expect(layer.get(sql("SELECT 1 AS one"), never())).resolves.toEqual({
      one: 1,
    });
  });

  it("fails with store_down when the server cannot be reached", async () => {
    const layer = open({
      ...inDatabase,
      port: UNUSED_PORT,
      connectionTimeout: CANCEL_LIMIT_MS,
    });

    await expect(
      layer.get(sql("SELECT 1 AS one"), never()),
    ).rejects.toMatchObject({
      kind: "store_down",
    });
  });

  it("connects again on the next call after a failed connection", async () => {
    const later = `${database}_later`;
    const layer = open({ ...config, database: later });
    try {
      await expect(
        layer.get(sql("SELECT 1 AS one"), never()),
      ).rejects.toMatchObject({
        kind: "store_down",
      });
      await master.request().query(`CREATE DATABASE [${later}]`);

      await expect(
        layer.get(sql("SELECT DB_NAME() AS name"), never()),
      ).resolves.toEqual({
        name: later,
      });
    } finally {
      await layer.close();
      await master
        .request()
        .query(
          `IF DB_ID('${later}') IS NOT NULL BEGIN ALTER DATABASE [${later}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [${later}] END`,
        );
    }
  });

  it("shares one connection attempt between callers that start together", async () => {
    const layer = open(inDatabase);

    const rows = await Promise.all(
      [1, 2, 3].map((value) =>
        layer.get(sql("SELECT @value AS value", { value }), never()),
      ),
    );

    expect(rows).toEqual([{ value: 1 }, { value: 2 }, { value: 3 }]);
  });
});
