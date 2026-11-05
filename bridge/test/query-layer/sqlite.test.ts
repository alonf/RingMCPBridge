// The Query layer on a real SQLite file (T007, FR-006): the shared contract, plus what only SQLite
// does: a file another connection has locked, a file that cannot be opened, and foreign keys.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterAll, describe, expect, it, vi } from "vitest";
import { FakeClock, SystemClock } from "../../src/utilities/clock/index.ts";
import {
  openSqliteQueryLayer,
  RETRY_PAUSE_MS,
} from "../../src/utilities/query-layer/index.ts";
import type {
  QueryLayer,
  SqlStatement,
} from "../../src/utilities/query-layer/index.ts";
import { describeQueryLayerContract } from "./query-layer-contract.ts";

const folder = mkdtempSync(join(tmpdir(), "query-layer-"));
const contractFile = join(folder, "contract.db");
const opened: QueryLayer[] = [];

function open(path: string, clock = new SystemClock()): QueryLayer {
  const layer = openSqliteQueryLayer(path, { clock });
  opened.push(layer);
  return layer;
}

function never(): AbortSignal {
  return new AbortController().signal;
}

function sql(text: string, params: SqlStatement["params"] = {}): SqlStatement {
  return { sql: text, params };
}

afterAll(async () => {
  for (const layer of opened) {
    await layer.close();
  }
  rmSync(folder, { recursive: true, force: true });
});

describeQueryLayerContract("sqlite", () => open(contractFile));

describe("the Query layer on SQLite", () => {
  it("retries once when another connection holds the file's write lock, and succeeds once it lets go", async () => {
    const file = join(folder, "busy.db");
    const clock = new FakeClock(0);
    const layer = open(file, clock);
    await layer.run(sql("CREATE TABLE note (id INTEGER PRIMARY KEY)"), never());
    const other = new DatabaseSync(file);
    other.exec("BEGIN IMMEDIATE");

    const write = layer.transaction(
      (session) =>
        session.run(
          sql("INSERT INTO note (id) VALUES (@id)", { id: 1 }),
          never(),
        ),
      never(),
    );
    await vi.waitFor(() => {
      expect(clock.pendingTimers).toBe(1);
    });
    other.exec("ROLLBACK");
    other.close();
    await clock.advance(RETRY_PAUSE_MS);

    await expect(write).resolves.toBe(1);
  });

  it("fails with a transient store_down when the file stays locked through the retry", async () => {
    const file = join(folder, "locked.db");
    const clock = new FakeClock(0);
    const layer = open(file, clock);
    await layer.run(sql("CREATE TABLE note (id INTEGER PRIMARY KEY)"), never());
    const other = new DatabaseSync(file);
    other.exec("BEGIN IMMEDIATE");

    const write = layer
      .run(sql("INSERT INTO note (id) VALUES (@id)", { id: 1 }), never())
      .catch((error: unknown) => error);
    await vi.waitFor(() => {
      expect(clock.pendingTimers).toBe(1);
    });
    await clock.advance(RETRY_PAUSE_MS);

    await expect(write).resolves.toMatchObject({
      kind: "store_down",
      transient: true,
    });
    other.exec("ROLLBACK");
    other.close();
  });

  it("fails with store_down when the file cannot be opened", () => {
    expect(() => open(join(folder, "no-such-folder", "x.db"))).toThrow(
      expect.objectContaining({ kind: "store_down" }),
    );
  });

  it("enforces foreign keys, as SQL Server does", async () => {
    const layer = open(join(folder, "keys.db"));
    await layer.run(
      sql("CREATE TABLE parent (id INTEGER PRIMARY KEY)"),
      never(),
    );
    await layer.run(
      sql(
        "CREATE TABLE child (id INTEGER PRIMARY KEY, parent_id INTEGER NOT NULL REFERENCES parent (id))",
      ),
      never(),
    );

    await expect(
      layer.run(
        sql("INSERT INTO child (id, parent_id) VALUES (1, @parent)", {
          parent: 9,
        }),
        never(),
      ),
    ).rejects.toMatchObject({ kind: "constraint_violated" });
  });
});
