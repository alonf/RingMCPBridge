// The Query layer contract (T007, FR-006): the same tests on SQLite and on SQL Server, so an
// accessor sees the same values, counts and errors on both.
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  keysetPageStatement,
  upsertStatement,
} from "../../src/utilities/query-layer/index.ts";
import type {
  QueryLayer,
  SqlDialect,
  SqlStatement,
  UpsertSpec,
} from "../../src/utilities/query-layer/index.ts";

const TABLES: Readonly<Record<SqlDialect, readonly string[]>> = {
  sqlite: [
    "CREATE TABLE sample (id INTEGER PRIMARY KEY, name TEXT, version INTEGER NOT NULL DEFAULT 0, payload BLOB, flag INTEGER)",
    "CREATE TABLE reading (location TEXT NOT NULL, device TEXT NOT NULL, version INTEGER NOT NULL, value TEXT, PRIMARY KEY (location, device))",
    "CREATE TABLE feed (seq INTEGER PRIMARY KEY, location TEXT NOT NULL)",
  ],
  tsql: [
    "CREATE TABLE sample (id BIGINT NOT NULL PRIMARY KEY, name NVARCHAR(200) NULL, version INT NOT NULL DEFAULT 0, payload VARBINARY(MAX) NULL, flag BIT NULL)",
    "CREATE TABLE reading (location NVARCHAR(50) NOT NULL, device NVARCHAR(50) NOT NULL, version INT NOT NULL, value NVARCHAR(200) NULL, PRIMARY KEY (location, device))",
    "CREATE TABLE feed (seq BIGINT NOT NULL PRIMARY KEY, location NVARCHAR(50) NOT NULL)",
  ],
};
const TABLE_NAMES = ["sample", "reading", "feed"];

function withoutGuard({
  table,
  key,
  values,
  onConflict,
}: UpsertSpec): UpsertSpec {
  return { table, key, values, onConflict };
}

function never(): AbortSignal {
  return new AbortController().signal;
}

function sql(text: string, params: SqlStatement["params"] = {}): SqlStatement {
  return { sql: text, params };
}

function insertSample(params: SqlStatement["params"]): SqlStatement {
  return sql(
    "INSERT INTO sample (id, name, version, payload, flag) VALUES (@id, @name, @version, @payload, @flag)",
    params,
  );
}

/**
 * Registers the contract for one dialect. `open` returns a layer on an empty database that stays
 * for the whole file; the tables are made again before each test.
 */
export function describeQueryLayerContract(
  dialect: SqlDialect,
  open: () => QueryLayer,
): void {
  describe(`the Query layer contract on ${dialect}`, () => {
    let layer: QueryLayer;

    beforeAll(() => {
      layer = open();
    });

    beforeEach(async () => {
      for (const table of TABLE_NAMES) {
        await layer.run(sql(`DROP TABLE IF EXISTS ${table}`), never());
      }
      for (const statement of TABLES[dialect]) {
        await layer.run(sql(statement), never());
      }
    });

    it("carries text, integers up to 2^53 - 1, bytes, flags and nulls both ways", async () => {
      await layer.run(
        insertSample({
          id: Number.MAX_SAFE_INTEGER,
          name: "דלת כניסה",
          version: 3,
          payload: new Uint8Array([0, 127, 255]),
          flag: 1,
        }),
        never(),
      );
      await layer.run(
        insertSample({
          id: 2,
          name: null,
          version: 0,
          payload: null,
          flag: null,
        }),
        never(),
      );

      const rows = await layer.all(
        sql("SELECT id, name, version, payload, flag FROM sample ORDER BY id"),
        never(),
      );

      expect(rows).toEqual([
        { id: 2, name: null, version: 0, payload: null, flag: null },
        {
          id: Number.MAX_SAFE_INTEGER,
          name: "דלת כניסה",
          version: 3,
          payload: new Uint8Array([0, 127, 255]),
          flag: 1,
        },
      ]);
      expect(Object.getPrototypeOf(rows[1]?.payload)).toBe(
        Uint8Array.prototype,
      );
    });

    it("counts changed rows and returns undefined when no row matches", async () => {
      for (const id of [1, 2, 3]) {
        await layer.run(
          insertSample({ id, name: "n", version: 0, payload: null, flag: 0 }),
          never(),
        );
      }

      await expect(
        layer.run(
          sql("UPDATE sample SET version = 1 WHERE id < @limit", { limit: 3 }),
          never(),
        ),
      ).resolves.toBe(2);
      await expect(
        layer.get(
          sql("SELECT id FROM sample WHERE id = @id", { id: 99 }),
          never(),
        ),
      ).resolves.toBeUndefined();
    });

    describe("insert-or-update", () => {
      const reading = (version: number, value: string): UpsertSpec => ({
        table: "reading",
        key: ["location", "device"],
        values: { location: "l-1", device: "d-1", version, value },
        onConflict: "update",
        onlyIfNewer: "version",
      });
      const stored = (): Promise<unknown> =>
        layer.get(sql("SELECT version, value FROM reading"), never());

      it("inserts, takes a newer version, and leaves the row alone for an older or equal one", async () => {
        await expect(
          layer.run(upsertStatement(dialect, reading(2, "two")), never()),
        ).resolves.toBe(1);
        await expect(
          layer.run(upsertStatement(dialect, reading(5, "five")), never()),
        ).resolves.toBe(1);
        await expect(
          layer.run(upsertStatement(dialect, reading(4, "four")), never()),
        ).resolves.toBe(0);
        await expect(
          layer.run(upsertStatement(dialect, reading(5, "again")), never()),
        ).resolves.toBe(0);

        await expect(stored()).resolves.toEqual({ version: 5, value: "five" });
      });

      it("overwrites without a version guard", async () => {
        const unguarded = withoutGuard(reading(5, "five"));
        await layer.run(upsertStatement(dialect, unguarded), never());

        await expect(
          layer.run(
            upsertStatement(dialect, {
              ...unguarded,
              values: { ...unguarded.values, version: 1, value: "one" },
            }),
            never(),
          ),
        ).resolves.toBe(1);
        await expect(stored()).resolves.toEqual({ version: 1, value: "one" });
      });

      it("ignores a second insert of the same key without an error", async () => {
        const once: UpsertSpec = {
          ...reading(1, "first"),
          onConflict: "ignore",
        };
        const ignore = withoutGuard(once);

        await expect(
          layer.run(upsertStatement(dialect, ignore), never()),
        ).resolves.toBe(1);
        await expect(
          layer.run(
            upsertStatement(dialect, {
              ...ignore,
              values: { ...ignore.values, value: "second" },
            }),
            never(),
          ),
        ).resolves.toBe(0);
        await expect(stored()).resolves.toEqual({ version: 1, value: "first" });
      });
    });

    it("pages by key without skipping rows added between pages", async () => {
      const add = (seq: number, location = "home"): Promise<number> =>
        layer.run(
          sql("INSERT INTO feed (seq, location) VALUES (@seq, @location)", {
            seq,
            location,
          }),
          never(),
        );
      const page = (after: number) =>
        layer.all(
          keysetPageStatement(dialect, {
            table: "feed",
            columns: ["seq"],
            key: "seq",
            after,
            limit: 2,
            where: sql("location = @location", { location: "home" }),
          }),
          never(),
        );
      for (const seq of [1, 2, 3, 5]) {
        await add(seq);
      }
      await add(4, "elsewhere");

      await expect(page(0)).resolves.toEqual([{ seq: 1 }, { seq: 2 }]);
      await add(6);
      await expect(page(2)).resolves.toEqual([{ seq: 3 }, { seq: 5 }]);
      await expect(page(5)).resolves.toEqual([{ seq: 6 }]);
      await expect(page(6)).resolves.toEqual([]);
    });

    describe("transactions", () => {
      const count = async (): Promise<unknown> =>
        (await layer.get(sql("SELECT COUNT(*) AS n FROM sample"), never()))?.n;

      it("commits the work and rolls it back when it throws, passing its error on unchanged", async () => {
        await layer.transaction(async (session) => {
          await session.run(
            insertSample({
              id: 1,
              name: "a",
              version: 0,
              payload: null,
              flag: 0,
            }),
            never(),
          );
          await session.run(
            insertSample({
              id: 2,
              name: "b",
              version: 0,
              payload: null,
              flag: 0,
            }),
            never(),
          );
        }, never());
        const own = new Error("the work failed");

        await expect(
          layer.transaction(async (session) => {
            await session.run(
              insertSample({
                id: 3,
                name: "c",
                version: 0,
                payload: null,
                flag: 0,
              }),
              never(),
            );
            throw own;
          }, never()),
        ).rejects.toBe(own);
        await expect(count()).resolves.toBe(2);
      });

      it("runs statements the work starts together", async () => {
        await layer.transaction(
          (session) =>
            Promise.all(
              [1, 2, 3].map((id) =>
                session.run(
                  insertSample({
                    id,
                    name: "n",
                    version: 0,
                    payload: null,
                    flag: 0,
                  }),
                  never(),
                ),
              ),
            ),
          never(),
        );

        await expect(count()).resolves.toBe(3);
      });

      it("rolls back every statement the work started together when one of them fails", async () => {
        await layer.run(
          insertSample({
            id: 2,
            name: "seed",
            version: 0,
            payload: null,
            flag: 0,
          }),
          never(),
        );

        await expect(
          layer.transaction(
            (session) =>
              Promise.all(
                [1, 2, 3].map((id) =>
                  session.run(
                    insertSample({
                      id,
                      name: "new",
                      version: 0,
                      payload: null,
                      flag: 0,
                    }),
                    never(),
                  ),
                ),
              ),
            never(),
          ),
        ).rejects.toMatchObject({ kind: "constraint_violated" });
        await expect(
          layer.all(sql("SELECT id FROM sample"), never()),
        ).resolves.toEqual([{ id: 2 }]);
        await expect(count()).resolves.toBe(1);
      });

      it("keeps another caller's write out of a transaction that rolls back", async () => {
        let started = (): void => undefined;
        const workStarted = new Promise<void>((resolve) => {
          started = resolve;
        });
        let finish = (): void => undefined;
        const mayFinish = new Promise<void>((resolve) => {
          finish = resolve;
        });
        const own = new Error("roll back");

        const transaction = layer.transaction(async (session) => {
          await session.run(
            insertSample({
              id: 1,
              name: "inside",
              version: 0,
              payload: null,
              flag: 0,
            }),
            never(),
          );
          started();
          await mayFinish;
          throw own;
        }, never());
        await workStarted;
        const outside = layer.run(
          insertSample({
            id: 2,
            name: "outside",
            version: 0,
            payload: null,
            flag: 0,
          }),
          never(),
        );
        finish();

        await expect(transaction).rejects.toBe(own);
        await expect(outside).resolves.toBe(1);
        await expect(
          layer.all(sql("SELECT name FROM sample"), never()),
        ).resolves.toEqual([{ name: "outside" }]);
      });
    });

    it("reports a key violation as constraint_violated without the row's values", async () => {
      const row = insertSample({
        id: 4242,
        name: "secret-name",
        version: 0,
        payload: null,
        flag: 0,
      });
      await layer.run(row, never());

      const error: unknown = await layer
        .run(row, never())
        .catch((caught: unknown) => caught);

      expect(error).toMatchObject({
        name: "QueryLayerError",
        kind: "constraint_violated",
      });
      expect((error as Error).message).not.toMatch(/4242|secret-name/);
    });

    it("reports an unknown table and a placeholder without a value as statement_failed", async () => {
      await expect(
        layer.all(sql("SELECT * FROM missing_table"), never()),
      ).rejects.toMatchObject({
        kind: "statement_failed",
      });
      await expect(
        layer.run(
          sql("INSERT INTO feed (seq, location) VALUES (@seq, @location)", {
            seq: 1,
          }),
          never(),
        ),
      ).rejects.toMatchObject({ kind: "statement_failed" });
      await expect(
        layer.all(sql("SELECT seq FROM feed"), never()),
      ).resolves.toEqual([]);
    });

    it("passes on an abort that came first and writes nothing", async () => {
      const controller = new AbortController();
      const reason = new Error("caller gone");
      controller.abort(reason);

      await expect(
        layer.run(
          insertSample({
            id: 1,
            name: "n",
            version: 0,
            payload: null,
            flag: 0,
          }),
          controller.signal,
        ),
      ).rejects.toBe(reason);
      await expect(
        layer.all(sql("SELECT id FROM sample"), never()),
      ).resolves.toEqual([]);
    });

    it("refuses work with store_down once closed", async () => {
      const second = open();
      await expect(
        second.all(sql("SELECT id FROM sample"), never()),
      ).resolves.toEqual([]);
      await second.close();

      await expect(
        second.all(sql("SELECT id FROM sample"), never()),
      ).rejects.toMatchObject({
        kind: "store_down",
      });
    });
  });
}
