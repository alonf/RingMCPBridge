// The Query layer on a real SQL Server (T007, FR-006): the shared contract, plus what only the
// T-SQL driver does: cancelling a running request or a transaction's start, an unreachable server,
// a connection cut during a statement, and connecting again after a failed connection. CI starts the server (.github/workflows/ci.yml); locally the tests
// skip unless TEST_MSSQL_HOST, TEST_MSSQL_PORT and TEST_MSSQL_PASSWORD are set.
import { randomBytes } from "node:crypto";
import { connect, createServer } from "node:net";
import type { AddressInfo, Socket } from "node:net";
import mssql from "mssql";
import type { config as MssqlConfig } from "mssql";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { FakeClock, SystemClock } from "../../src/utilities/clock/index.ts";
import {
  CORE_MIGRATIONS,
  runMigrations,
} from "../../src/utilities/query-layer/index.ts";
import type {
  QueryLayer,
  SqlStatement,
} from "../../src/utilities/query-layer/index.ts";
import { createTsqlQueryLayer } from "../../src/utilities/query-layer/tsql.ts";
import { describeMigrationsContract } from "./migrations-contract.ts";
import {
  connectWhenReady,
  requireSqlServerInCi,
  SQL_SERVER_SETUP_TIMEOUT_MS,
  sqlServerTestSettings,
} from "../support/index.ts";
import { describeQueryLayerContract } from "./query-layer-contract.ts";

const CANCEL_LIMIT_MS = 3_000;
const UNUSED_PORT = 1;
const CUT_AFTER_MS = 300;
const SQL_SERVER_PORT = 1433;

type TediousConnection = Parameters<
  NonNullable<MssqlConfig["beforeConnect"]>
>[0];

/** A TCP relay to the server; `cut` drops every connection through it, as a network fault would. */
interface Relay {
  readonly port: number;
  cut(): void;
  close(): Promise<void>;
}

const settings = sqlServerTestSettings();
const database = `query_layer_${randomBytes(6).toString("hex")}`;
const opened: QueryLayer[] = [];
const extraDatabases: string[] = [];

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

async function openRelay(host: string, port: number): Promise<Relay> {
  const sockets = new Set<Socket>();
  const relay = createServer((client) => {
    const upstream = connect(port, host);
    for (const socket of [client, upstream]) {
      sockets.add(socket);
      socket.on("error", () => undefined);
      socket.on("close", () => sockets.delete(socket));
    }
    client.pipe(upstream).pipe(client);
  });
  await new Promise<void>((resolve) => {
    relay.listen(0, "127.0.0.1", resolve);
  });
  const cut = (): void => {
    for (const socket of sockets) {
      socket.destroy();
    }
  };
  return {
    port: (relay.address() as AddressInfo).port,
    cut,
    close: () =>
      new Promise<void>((resolve) => {
        cut();
        relay.close(() => {
          resolve();
        });
      }),
  };
}

requireSqlServerInCi();

describe.skipIf(settings === undefined)("the Query layer on SQL Server", () => {
  const config = settings ?? { server: "" };
  const inDatabase: MssqlConfig = { ...config, database };
  let master: mssql.ConnectionPool;

  beforeAll(async () => {
    master = await connectWhenReady(config);
    await master.request().query(`CREATE DATABASE [${database}]`);
  }, SQL_SERVER_SETUP_TIMEOUT_MS);

  afterAll(async () => {
    for (const layer of opened) {
      await layer.close();
    }
    for (const name of [database, ...extraDatabases]) {
      await master
        .request()
        .query(
          `ALTER DATABASE [${name}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [${name}]`,
        );
    }
    await master.close();
  });

  // An empty database of its own, dropped with the others after the file.
  async function emptyDatabase(): Promise<MssqlConfig> {
    const name = `${database}_${String(extraDatabases.length + 1)}`;
    await master.request().query(`CREATE DATABASE [${name}]`);
    extraDatabases.push(name);
    return { ...config, database: name };
  }

  describeQueryLayerContract("tsql", () => open(inDatabase));

  describeMigrationsContract("tsql", async () => open(await emptyDatabase()));

  it("applies each migration once when two starts migrate together", async () => {
    const empty = await emptyDatabase();
    const starts = [open(empty), open(empty)];

    const reports = await Promise.all(
      starts.map((layer) =>
        runMigrations(
          layer,
          CORE_MIGRATIONS,
          { clock: new FakeClock(0) },
          never(),
        ),
      ),
    );

    expect(reports.flatMap((report) => report.applied).sort()).toEqual(
      CORE_MIGRATIONS.map((migration) => migration.version),
    );
    await expect(
      starts[0]?.get(
        sql("SELECT COUNT(*) AS recorded FROM schema_migration"),
        never(),
      ),
    ).resolves.toEqual({ recorded: CORE_MIGRATIONS.length });
  });

  it("fails with a transient store_down when another start holds the migration lock too long", async () => {
    const empty = await emptyDatabase();
    const holder = await new mssql.ConnectionPool(empty).connect();
    const held = new mssql.Transaction(holder);
    await held.begin();
    try {
      await new mssql.Request(held).query(
        "EXEC sp_getapplock N'schema_migration', N'Exclusive', N'Transaction', 0",
      );

      await expect(
        runMigrations(
          open(empty),
          CORE_MIGRATIONS,
          { clock: new FakeClock(0), lockWaitMs: 100 },
          never(),
        ),
      ).rejects.toMatchObject({ kind: "store_down", transient: true });
    } finally {
      await held.rollback();
      await holder.close();
    }
  });

  it("compares every text column by code point, as SQLite does", async () => {
    const layer = open(await emptyDatabase());
    await runMigrations(
      layer,
      CORE_MIGRATIONS,
      { clock: new FakeClock(0) },
      never(),
    );

    await expect(
      layer.all(
        sql(
          "SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name, COLLATION_NAME AS collation_name FROM INFORMATION_SCHEMA.COLUMNS WHERE DATA_TYPE = 'nvarchar' AND COLLATION_NAME <> 'Latin1_General_100_BIN2'",
        ),
        never(),
      ),
    ).resolves.toEqual([]);
  });

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

  it("stops waiting for a transaction's start when the caller aborts, and gives its connection back", async () => {
    const layer = open({
      ...inDatabase,
      pool: { max: 1, acquireTimeoutMillis: CANCEL_LIMIT_MS },
    });
    let release = (): void => undefined;
    const holding = new Promise<void>((resolve) => {
      release = resolve;
    });
    let started = (): void => undefined;
    const holdsConnection = new Promise<void>((resolve) => {
      started = resolve;
    });
    const first = layer.transaction(async (session) => {
      await session.get(sql("SELECT 1 AS one"), never());
      started();
      await holding;
      return "first";
    }, never());
    await holdsConnection;
    const controller = new AbortController();
    const reason = new Error("caller gone");
    const work = vi.fn(() => Promise.resolve("second"));
    const begun = Date.now();

    const second = layer.transaction(work, controller.signal);
    setTimeout(() => {
      controller.abort(reason);
    }, CUT_AFTER_MS);

    await expect(second).rejects.toBe(reason);
    expect(Date.now() - begun).toBeLessThan(CANCEL_LIMIT_MS);
    release();
    await expect(first).resolves.toBe("first");
    await expect(
      layer.get(sql("SELECT @@TRANCOUNT AS open_transactions"), never()),
    ).resolves.toEqual({ open_transactions: 0 });
    expect(work).not.toHaveBeenCalled();
  });

  it("keeps running when the driver raises a connection error on the pool", async () => {
    const connections: TediousConnection[] = [];
    const layer = open({
      ...inDatabase,
      beforeConnect: (connection) => {
        connections.push(connection);
      },
    });
    await layer.get(sql("SELECT 1 AS one"), never());
    const fault = Object.assign(new Error("connection fault"), {
      code: "EFAULT",
    });

    expect(connections.length).toBeGreaterThan(0);
    for (const connection of connections) {
      expect(() => connection.emit("error", fault)).not.toThrow();
    }
    await expect(layer.get(sql("SELECT 1 AS one"), never())).resolves.toEqual({
      one: 1,
    });
  });

  it("fails with a transient store_down when the connection drops during a statement", async () => {
    const relay = await openRelay(
      config.server,
      config.port ?? SQL_SERVER_PORT,
    );
    try {
      const layer = open({ ...inDatabase, port: relay.port });
      await layer.get(sql("SELECT 1 AS one"), never());

      const waiting = layer.run(sql("WAITFOR DELAY '00:00:05'"), never());
      setTimeout(() => {
        relay.cut();
      }, CUT_AFTER_MS);

      await expect(waiting).rejects.toMatchObject({
        kind: "store_down",
        transient: true,
      });
    } finally {
      await relay.close();
    }
  });

  it("runs a transaction again when its connection drops during the work", async () => {
    const relay = await openRelay(
      config.server,
      config.port ?? SQL_SERVER_PORT,
    );
    try {
      const layer = open({ ...inDatabase, port: relay.port });
      let attempts = 0;

      const done = layer.transaction(async (session) => {
        attempts += 1;
        if (attempts === 1) {
          setTimeout(() => {
            relay.cut();
          }, CUT_AFTER_MS);
        }
        await session.run(sql("WAITFOR DELAY '00:00:01'"), never());
        return attempts;
      }, never());

      await expect(done).resolves.toBe(2);
    } finally {
      await relay.close();
    }
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
