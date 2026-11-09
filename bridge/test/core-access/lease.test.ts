// The single-instance lease (T026) on SQLite and on SQL Server: one holder at a time, renewed every
// 15 s, lost to nobody while it renews, lapsing when its database is down, never held by two
// instances at once even when their clocks differ, and handed over when its holder stops.
import { expect, it } from "vitest";
import {
  Lease,
  LEASE_EXPIRES_MS,
  LEASE_HELD_MS,
  LEASE_RENEW_MS,
  LEASE_WRITE_TIMEOUT_MS,
} from "../../src/core/access/lease/index.ts";
import type { LeaseStore } from "../../src/core/access/lease/index.ts";
import { FakeClock } from "../../src/utilities/clock/index.ts";
import {
  CORE_MIGRATIONS,
  QueryLayerError,
  runMigrations,
} from "../../src/utilities/query-layer/index.ts";
import type {
  QueryLayer,
  SqlStatement,
} from "../../src/utilities/query-layer/index.ts";
import { describeStoreMatrix, requireSqlServerInCi } from "../support/index.ts";

const START = Date.UTC(2026, 10, 9, 9, 0, 0);
const ACCOUNT = "ring-account";
const SECOND_MS = 1000;

function never(): AbortSignal {
  return new AbortController().signal;
}

/**
 * The database as one instance reaches it. `down` makes every statement fail as an unreachable
 * database does; `hang` makes a statement wait until its deadline; `holdTakes` holds each take or
 * renewal (not a release) until `letTakesThrough`.
 */
interface TestStore extends LeaseStore {
  down: boolean;
  hang: boolean;
  holdTakes: boolean;
  /** How many statements reached the database. */
  readonly writes: () => number;
  letTakesThrough(): void;
}

function testStore(layer: QueryLayer): TestStore {
  let writes = 0;
  let held: (() => void)[] = [];
  const store: TestStore = {
    dialect: layer.dialect,
    down: false,
    hang: false,
    holdTakes: false,
    writes: () => writes,
    letTakesThrough: () => {
      store.holdTakes = false;
      const waiting = held;
      held = [];
      for (const go of waiting) {
        go();
      }
    },
    run: async (statement: SqlStatement, signal: AbortSignal) => {
      if (store.hang) {
        return new Promise<number>((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            reject(signal.reason as Error);
          });
        });
      }
      if (store.holdTakes && !statement.sql.startsWith("DELETE")) {
        await new Promise<void>((resolve) => {
          held.push(resolve);
        });
      }
      if (store.down) {
        throw new QueryLayerError("store_down", "The test database is down.");
      }
      writes += 1;
      return layer.run(statement, signal);
    },
  };
  return store;
}

requireSqlServerInCi();

describeStoreMatrix("Lease", (database) => {
  // One database for the file, migrated once. Each test takes a lease of its own name, so the
  // tests stay apart without each making a database, which loads CI's shared SQL Server.
  let shared: Promise<QueryLayer> | undefined;
  let tests = 0;
  let account = ACCOUNT;

  async function migrated(): Promise<QueryLayer> {
    const layer = await database.emptyDatabase();
    await runMigrations(
      layer,
      CORE_MIGRATIONS,
      { clock: new FakeClock(START) },
      never(),
    );
    return layer;
  }

  async function setUp(): Promise<{ layer: QueryLayer; clock: FakeClock }> {
    shared ??= migrated();
    tests += 1;
    account = `${ACCOUNT}-${String(tests)}`;
    return { layer: await shared, clock: new FakeClock(START) };
  }

  function leaseFor(
    store: LeaseStore,
    clock: FakeClock,
    holder: string,
  ): Lease {
    return new Lease({ store, clock, name: account, holder });
  }

  /** Moves every clock on by `ms`, then waits for each lease's write in flight. */
  async function pass(
    ms: number,
    clocks: readonly FakeClock[],
    leases: readonly Lease[],
  ): Promise<void> {
    for (const clock of clocks) {
      await clock.advance(ms);
    }
    await Promise.all(leases.map((lease) => lease.settled()));
  }

  it("lets one of two instances hold the lease, and tells the other it is held elsewhere", async () => {
    const { layer, clock } = await setUp();
    const first = leaseFor(layer, clock, "core-a");
    const second = leaseFor(layer, clock, "core-b");

    await expect(first.renew()).resolves.toEqual({
      held: true,
      until: START + LEASE_HELD_MS,
    });
    await expect(second.renew()).resolves.toEqual({
      held: false,
      reason: "held_elsewhere",
    });
    expect([first.held, second.held]).toEqual([true, false]);

    // Stopping an instance that does not hold the lease leaves the holder's row.
    await second.stop();
    await expect(leaseFor(layer, clock, "core-c").renew()).resolves.toEqual({
      held: false,
      reason: "held_elsewhere",
    });
  });

  it("times its hold and the row from before the write, so a slow write stretches neither", async () => {
    const { layer, clock } = await setUp();
    const store = testStore(layer);
    const lease = leaseFor(store, clock, "core-a");
    store.holdTakes = true;

    const renewing = lease.renew();
    await clock.advance(5 * SECOND_MS);
    store.letTakesThrough();

    await expect(renewing).resolves.toEqual({
      held: true,
      until: START + LEASE_HELD_MS,
    });
    await clock.advance(LEASE_EXPIRES_MS - 5 * SECOND_MS);
    await expect(
      leaseFor(layer, clock, "core-b").renew(),
    ).resolves.toMatchObject({ held: true });
  });

  it("gives the lease to exactly one of five instances that ask at the same moment", async () => {
    const { layer, clock } = await setUp();
    const leases = ["a", "b", "c", "d", "e"].map((name) =>
      leaseFor(layer, clock, `core-${name}`),
    );

    const statuses = await Promise.all(leases.map((lease) => lease.renew()));

    expect(statuses.filter((status) => status.held)).toHaveLength(1);
    expect(leases.filter((lease) => lease.held)).toHaveLength(1);
  });

  it("keeps the lease with its holder while it renews every 15 s", async () => {
    const { layer, clock } = await setUp();
    const holder = leaseFor(layer, clock, "core-a");
    const other = leaseFor(layer, clock, "core-b");
    holder.start();
    await holder.settled();
    other.start();
    await other.settled();

    for (let renewal = 0; renewal < 20; renewal += 1) {
      await pass(LEASE_RENEW_MS, [clock], [holder, other]);
      expect(holder.status).toEqual({
        held: true,
        until: clock.now() + LEASE_HELD_MS,
      });
      expect(other.status).toEqual({ held: false, reason: "held_elsewhere" });
    }
  });

  it("lapses 30 s after the last renewal when the holder's database is down, and the other instance takes over only once the row has expired", async () => {
    const { layer, clock } = await setUp();
    const holderStore = testStore(layer);
    const holder = leaseFor(holderStore, clock, "core-a");
    const other = leaseFor(layer, clock, "core-b");
    holder.start();
    await holder.settled();
    other.start();
    await other.settled();
    holderStore.down = true;

    const seen: [number, boolean, boolean][] = [];
    for (let step = 0; step < 10; step += 1) {
      await pass(5 * SECOND_MS, [clock], [holder, other]);
      expect(holder.held && other.held).toBe(false);
      seen.push([clock.now() - START, holder.held, other.held]);
    }

    expect(seen).toEqual([
      [5_000, true, false],
      [10_000, true, false],
      [15_000, true, false],
      [20_000, true, false],
      [25_000, true, false],
      [LEASE_HELD_MS, false, false],
      [35_000, false, false],
      [40_000, false, false],
      [LEASE_EXPIRES_MS, false, true],
      [50_000, false, true],
    ]);
    expect(holder.status).toEqual({
      held: false,
      reason: "store_unavailable",
    });
  });

  it("takes the lease again when its database comes back and nobody else holds it", async () => {
    const { layer, clock } = await setUp();
    const store = testStore(layer);
    const lease = leaseFor(store, clock, "core-a");
    lease.start();
    await lease.settled();
    store.down = true;
    for (let renewal = 0; renewal < 4; renewal += 1) {
      await pass(LEASE_RENEW_MS, [clock], [lease]);
    }
    expect(lease.status).toEqual({ held: false, reason: "store_unavailable" });

    store.down = false;
    await pass(LEASE_RENEW_MS, [clock], [lease]);

    expect(lease.held).toBe(true);
  });

  it("is never held by two instances at once when the other instance's clock runs up to 15 s ahead", async () => {
    const { layer } = await setUp();
    const holderClock = new FakeClock(START);
    const aheadClock = new FakeClock(START + LEASE_RENEW_MS);
    const holderStore = testStore(layer);
    const holder = leaseFor(holderStore, holderClock, "core-a");
    const other = leaseFor(layer, aheadClock, "core-b");
    holder.start();
    await holder.settled();
    other.start();
    await other.settled();
    holderStore.down = true;

    let handedOver = false;
    for (let second = 0; second < 60; second += 1) {
      await pass(SECOND_MS, [holderClock, aheadClock], [holder, other]);
      expect(holder.held && other.held).toBe(false);
      handedOver ||= other.held;
    }

    expect(handedOver).toBe(true);
  });

  it("hands the lease over at the other instance's next renewal when its holder stops", async () => {
    const { layer, clock } = await setUp();
    const holder = leaseFor(layer, clock, "core-a");
    const other = leaseFor(layer, clock, "core-b");
    holder.start();
    await holder.settled();
    other.start();
    await other.settled();

    await holder.stop();
    expect(holder.status).toEqual({ held: false, reason: "stopped" });
    await expect(holder.renew()).resolves.toEqual({
      held: false,
      reason: "stopped",
    });
    await pass(LEASE_RENEW_MS, [clock], [holder, other]);

    expect(other.held).toBe(true);
    expect(holder.held).toBe(false);
  });

  it("removes its row only after the renewal in flight, so a stopped holder never keeps the lease", async () => {
    const { layer, clock } = await setUp();
    const holderStore = testStore(layer);
    const holder = leaseFor(holderStore, clock, "core-a");
    const other = leaseFor(layer, clock, "core-b");
    await holder.renew();
    holderStore.holdTakes = true;

    const renewing = holder.renew();
    const stopping = holder.stop();
    holderStore.letTakesThrough();
    await renewing;
    await stopping;

    expect(holder.status).toEqual({ held: false, reason: "stopped" });
    await expect(other.renew()).resolves.toMatchObject({ held: true });
  });

  it("stays stopped when the renewal in flight fails after it stops", async () => {
    const { layer, clock } = await setUp();
    const store = testStore(layer);
    const lease = leaseFor(store, clock, "core-a");
    await lease.renew();
    store.holdTakes = true;

    const renewing = lease.renew();
    const stopping = lease.stop();
    store.down = true;
    store.letTakesThrough();

    await expect(renewing).resolves.toEqual({ held: false, reason: "stopped" });
    await stopping;
    expect(lease.status).toEqual({ held: false, reason: "stopped" });
  });

  it("counts a write past its deadline as failed, and joins a renewal already in flight", async () => {
    const { layer, clock } = await setUp();
    const store = testStore(layer);
    const lease = leaseFor(store, clock, "core-a");
    await lease.renew();
    store.hang = true;

    const renewing = lease.renew();
    expect(lease.renew()).toBe(renewing);
    await clock.advance(LEASE_WRITE_TIMEOUT_MS);
    await expect(renewing).resolves.toEqual({
      held: true,
      until: START + LEASE_HELD_MS,
    });

    await clock.advance(LEASE_HELD_MS - LEASE_WRITE_TIMEOUT_MS);
    expect(lease.status).toEqual({ held: false, reason: "store_unavailable" });
    expect(store.writes()).toBe(1);
  });

  it("starts once, never again once stopped, and stops even when its database is down", async () => {
    const { layer, clock } = await setUp();
    const store = testStore(layer);
    const lease = leaseFor(store, clock, "core-a");
    lease.start();
    lease.start();
    await lease.settled();
    expect(clock.pendingTimers).toBe(1);
    await pass(LEASE_RENEW_MS, [clock], [lease]);
    expect(store.writes()).toBe(2);

    store.down = true;
    await lease.stop();
    lease.start();
    await pass(LEASE_RENEW_MS, [clock], [lease]);
    store.down = false;

    expect(lease.status).toEqual({ held: false, reason: "stopped" });
    expect(store.writes()).toBe(2);
    expect(clock.pendingTimers).toBe(0);
    // The row it could not remove keeps the lease from others until it expires.
    await expect(leaseFor(layer, clock, "core-b").renew()).resolves.toEqual({
      held: false,
      reason: "held_elsewhere",
    });
  });

  it("drops its hold at once when a renewal finds another holder, as when clocks differ past the margin", async () => {
    const { layer } = await setUp();
    const clock = new FakeClock(START);
    const farAhead = new FakeClock(START + LEASE_EXPIRES_MS);
    const first = leaseFor(layer, clock, "core-a");
    await first.renew();
    await expect(
      leaseFor(layer, farAhead, "core-b").renew(),
    ).resolves.toMatchObject({ held: true });

    await expect(first.renew()).resolves.toEqual({
      held: false,
      reason: "held_elsewhere",
    });
    expect(first.held).toBe(false);
  });

  it("holds nothing before it asks, and its hold runs out with no newer renewal", async () => {
    const { layer, clock } = await setUp();
    const lease = leaseFor(layer, clock, "core-a");
    expect(lease.status).toEqual({ held: false, reason: "not_started" });

    await lease.renew();
    await clock.advance(LEASE_HELD_MS - 1);
    expect(lease.held).toBe(true);
    await clock.advance(1);

    expect(lease.status).toEqual({ held: false, reason: "expired" });
  });

  it("refuses a name or a holder it cannot store, and gives each instance its own holder by default", async () => {
    const { layer, clock } = await setUp();

    for (const [name, holder] of [
      ["", "core-a"],
      [account, ""],
      ["n".repeat(129), "core-a"],
      [account, "h".repeat(129)],
    ] as const) {
      expect(() => new Lease({ store: layer, clock, name, holder })).toThrow(
        RangeError,
      );
    }
    const longest = new Lease({
      store: layer,
      clock,
      name: "n".repeat(128),
      holder: "h".repeat(128),
    });
    await expect(longest.renew()).resolves.toMatchObject({ held: true });
    expect(new Lease({ store: layer, clock, name: ACCOUNT }).holder).not.toBe(
      new Lease({ store: layer, clock, name: ACCOUNT }).holder,
    );
  });
});
