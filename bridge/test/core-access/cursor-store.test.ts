// Read marks (T051; FR-010, FR-011) on SQLite and on SQL Server: a client has no mark until it
// reads; a mark survives a restart (a new store over the same database); two clients and two
// locations keep separate marks; a mark only moves forward within an epoch, and a later epoch
// replaces it, never hidden.
import { expect, it } from "vitest";
import { CursorStore } from "../../src/core/access/subscriptions/index.ts";
import { FakeClock } from "../../src/utilities/clock/index.ts";
import {
  CORE_MIGRATIONS,
  runMigrations,
} from "../../src/utilities/query-layer/index.ts";
import { describeStoreMatrix, requireSqlServerInCi } from "../support/index.ts";

const START = Date.UTC(2026, 11, 19, 9, 0, 0);
const A = "https://agent-a.example.test/client.json";
const B = "https://agent-b.example.test/client.json";

function never(): AbortSignal {
  return new AbortController().signal;
}

requireSqlServerInCi();

describeStoreMatrix("Read marks", (store) => {
  async function setUp() {
    const layer = await store.emptyDatabase();
    const clock = new FakeClock(START);
    await runMigrations(layer, CORE_MIGRATIONS, { clock }, never());
    return { layer, clock, cursors: new CursorStore({ store: layer, clock }) };
  }

  it("has no mark until the client reads", async () => {
    const { cursors } = await setUp();

    await expect(cursors.mark(A, "loc-1", never())).resolves.toBeUndefined();
  });

  it("keeps a client's mark across a restart, which is a new store over the same database", async () => {
    const { layer, clock, cursors } = await setUp();
    await cursors.advance(A, "loc-1", { epoch: 1, seq: 7 }, never());

    const restarted = new CursorStore({ store: layer, clock });

    await expect(restarted.mark(A, "loc-1", never())).resolves.toEqual({
      epoch: 1,
      seq: 7,
    });
  });

  it("keeps separate marks for two clients and for two locations", async () => {
    const { cursors } = await setUp();

    await cursors.advance(A, "loc-1", { epoch: 1, seq: 5 }, never());
    await cursors.advance(B, "loc-1", { epoch: 1, seq: 9 }, never());
    await cursors.advance(A, "loc-2", { epoch: 1, seq: 2 }, never());

    await expect(cursors.mark(A, "loc-1", never())).resolves.toEqual({
      epoch: 1,
      seq: 5,
    });
    await expect(cursors.mark(B, "loc-1", never())).resolves.toEqual({
      epoch: 1,
      seq: 9,
    });
    await expect(cursors.mark(A, "loc-2", never())).resolves.toEqual({
      epoch: 1,
      seq: 2,
    });
  });

  it("only moves a mark forward within an epoch", async () => {
    const { cursors } = await setUp();
    await cursors.advance(A, "loc-1", { epoch: 1, seq: 10 }, never());

    await cursors.advance(A, "loc-1", { epoch: 1, seq: 4 }, never());
    await cursors.advance(A, "loc-1", { epoch: 1, seq: 10 }, never());

    await expect(cursors.mark(A, "loc-1", never())).resolves.toEqual({
      epoch: 1,
      seq: 10,
    });
    await cursors.advance(A, "loc-1", { epoch: 1, seq: 11 }, never());
    await expect(cursors.mark(A, "loc-1", never())).resolves.toEqual({
      epoch: 1,
      seq: 11,
    });
  });

  it("lets a later epoch replace the mark, and never an earlier one", async () => {
    const { cursors } = await setUp();
    await cursors.advance(A, "loc-1", { epoch: 1, seq: 10 }, never());

    await cursors.advance(A, "loc-1", { epoch: 2, seq: 3 }, never());
    await expect(cursors.mark(A, "loc-1", never())).resolves.toEqual({
      epoch: 2,
      seq: 3,
    });

    await cursors.advance(A, "loc-1", { epoch: 1, seq: 99 }, never());
    await expect(cursors.mark(A, "loc-1", never())).resolves.toEqual({
      epoch: 2,
      seq: 3,
    });
  });
});
