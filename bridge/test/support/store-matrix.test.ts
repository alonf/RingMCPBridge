// The store matrix hands each test empty databases of its own, on both stores (T010).
import { expect, it } from "vitest";
import { FakeClock } from "../../src/utilities/clock/index.ts";
import {
  CORE_MIGRATIONS,
  runMigrations,
} from "../../src/utilities/query-layer/index.ts";
import { describeStoreMatrix, requireSqlServerInCi } from "./index.ts";

function never(): AbortSignal {
  return new AbortController().signal;
}

requireSqlServerInCi();

describeStoreMatrix("the store matrix", (store) => {
  it("hands out an empty database that the core's migrations bring up to date", async () => {
    const layer = await store.emptyDatabase();

    await expect(
      runMigrations(
        layer,
        CORE_MIGRATIONS,
        { clock: new FakeClock(0) },
        never(),
      ),
    ).resolves.toEqual({
      applied: CORE_MIGRATIONS.map((migration) => migration.version),
      unknown: [],
    });
  });

  it("hands out a separate database each time", async () => {
    const first = await store.emptyDatabase();
    await first.run(
      {
        sql: "CREATE TABLE note (id INTEGER NOT NULL PRIMARY KEY)",
        params: {},
      },
      never(),
    );
    const second = await store.emptyDatabase();

    await expect(
      second.all({ sql: "SELECT id FROM note", params: {} }, never()),
    ).rejects.toMatchObject({ kind: "statement_failed" });
  });

  it("names its dialect", async () => {
    const layer = await store.emptyDatabase();

    await expect(
      layer.transaction((session) => Promise.resolve(session.dialect), never()),
    ).resolves.toBe(store.dialect);
  });
});
