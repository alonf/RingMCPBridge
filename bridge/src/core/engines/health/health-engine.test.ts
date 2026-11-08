// The Health engine's link rules (T018), written before the engine, on the core's clock: a home
// silent for the configured time shows offline with `stale_since`, and a sign of life brings it
// back; the Ring session's status follows the heartbeat, its `since` kept while it holds. Since
// CP-14 review round 3, a session's data is stale until its own inventory is stored; since round
// 5, also while a heartbeat says an inventory is owed, and a late sign of life never moves `as_of`
// back or brings a home up that was silent too long.
import { describe, expect, it } from "vitest";
import {
  afterHeartbeat,
  afterRefresh,
  afterSessionOpened,
  asOf,
  healthChanges,
  settled,
} from "./index.ts";
import type { HealthPolicy, HealthView } from "./index.ts";

const START = Date.UTC(2026, 10, 7, 9, 0, 0);
const POLICY: HealthPolicy = { homeOfflineAfterMs: 120_000 };
const BEAT = {
  ring_session: "ok",
  outbox_depth: 3,
  inventory_owed: false,
} as const;

/** A session opened at `at` whose own inventory is stored. */
function refreshed(at: number): HealthView {
  return afterRefresh(afterSessionOpened(undefined, "0.1.0", at));
}

describe("the Health engine: the home link", () => {
  it("shows the home up from the session's start, with its connector version", () => {
    const view = afterSessionOpened(undefined, "0.1.0", START);

    expect(view).toEqual({
      home_link_status: "up",
      home_link_since: START,
      connector_version: "0.1.0",
      as_of: START,
      refresh_owed_since: START,
    });
  });

  it("shows the home offline, stale since its last sign of life, after the configured silence", () => {
    const view = afterHeartbeat(refreshed(START), BEAT, START + 15_000);

    expect(asOf(view, START + 15_000 + 119_999, POLICY)).toEqual(view);
    expect(asOf(view, START + 15_000 + 120_000, POLICY)).toEqual({
      ...view,
      home_link_status: "down",
      home_link_since: START + 15_000,
      stale_since: START + 15_000,
    });
  });

  it("brings the home back up on the next sign of life, clearing stale_since", () => {
    const silent = asOf(refreshed(START), START + 200_000, POLICY);

    const back = afterHeartbeat(silent, BEAT, START + 300_000);

    expect(back.home_link_status).toBe("up");
    expect(back.home_link_since).toBe(START + 300_000);
    expect(back.stale_since).toBeUndefined();
  });

  it("keeps the up-since time across heartbeats while the home stays up", () => {
    let view = refreshed(START);
    for (let beat = 1; beat <= 10; beat += 1) {
      view = afterHeartbeat(
        asOf(view, START + beat * 15_000, POLICY),
        BEAT,
        START + beat * 15_000,
      );
    }

    expect(view.home_link_since).toBe(START);
    expect(view.as_of).toBe(START + 150_000);
  });
});

describe("the Health engine: the Ring session and the outbox", () => {
  it("takes the Ring session's status and the outbox depth from the heartbeat, keeping since while it holds", () => {
    const opened = refreshed(START);
    const first = afterHeartbeat(opened, BEAT, START + 15_000);
    const same = afterHeartbeat(
      first,
      { ...BEAT, outbox_depth: 0 },
      START + 30_000,
    );
    const lost = afterHeartbeat(
      same,
      { ring_session: "lost", outbox_depth: null, inventory_owed: false },
      START + 45_000,
    );

    expect(first).toMatchObject({
      ring_session_status: "ok",
      ring_session_since: START + 15_000,
      outbox_depth: 3,
    });
    expect(same).toMatchObject({
      ring_session_status: "ok",
      ring_session_since: START + 15_000,
      outbox_depth: 0,
    });
    expect(lost).toMatchObject({
      ring_session_status: "lost",
      ring_session_since: START + 45_000,
    });
    expect(lost.outbox_depth).toBeUndefined();
    expect(lost.connector_version).toBe("0.1.0");
  });

  it("names what changed: the home link and the Ring session, not the outbox depth or the time", () => {
    const up = afterHeartbeat(refreshed(START), BEAT, START);
    const deeper = afterHeartbeat(
      up,
      { ...BEAT, outbox_depth: 9 },
      START + 15_000,
    );
    const down = asOf(deeper, START + 500_000, POLICY);
    const lost = afterHeartbeat(
      down,
      { ring_session: "unavailable", outbox_depth: 0, inventory_owed: false },
      START + 600_000,
    );

    expect(healthChanges(undefined, up)).toEqual(["home_link", "ring_session"]);
    expect(healthChanges(up, deeper)).toEqual([]);
    expect(healthChanges(deeper, down)).toEqual(["home_link"]);
    expect(healthChanges(down, lost)).toEqual(["home_link", "ring_session"]);
  });
});

describe("the Health engine: stale data while Ring is down (SC-005, T021)", () => {
  it("marks the data stale since the Ring session stopped being ok, the home still up", () => {
    const up = afterHeartbeat(refreshed(START), BEAT, START);
    const down = afterHeartbeat(
      up,
      { ring_session: "unavailable", outbox_depth: 0, inventory_owed: false },
      START + 15_000,
    );

    expect(asOf(down, START + 30_000, POLICY)).toEqual({
      ...down,
      stale_since: START + 15_000,
    });
    expect(
      asOf(afterHeartbeat(down, BEAT, START + 45_000), START + 50_000, POLICY)
        .stale_since,
    ).toBeUndefined();
  });

  it("takes the earlier of the two when Ring and the home link are both down", () => {
    const up = afterHeartbeat(refreshed(START), BEAT, START);
    const lost = afterHeartbeat(
      up,
      { ring_session: "lost", outbox_depth: 0, inventory_owed: false },
      START + 15_000,
    );
    const stillLost = afterHeartbeat(
      lost,
      { ring_session: "lost", outbox_depth: 0, inventory_owed: false },
      START + 30_000,
    );

    const silent = asOf(stillLost, START + 30_000 + 120_000, POLICY);

    expect(silent.home_link_status).toBe("down");
    expect(silent.home_link_since).toBe(START + 30_000);
    expect(silent.stale_since).toBe(START + 15_000);
  });

  it("takes the home link's time when Ring went down after the home fell silent", () => {
    const up = afterHeartbeat(refreshed(START), BEAT, START);
    const silent = asOf(up, START + 120_000, POLICY);

    expect(asOf(silent, START + 300_000, POLICY).stale_since).toBe(START);
  });
});

describe("the Health engine: fresh only once the session's own inventory is stored (CP-14 review round 3)", () => {
  it("keeps a home back from silence stale, since it went silent, until its session's inventory is stored", () => {
    const silent = asOf(refreshed(START), START + 300_000, POLICY);
    const reopened = afterSessionOpened(silent, "0.1.0", START + 300_000);
    const beating = afterHeartbeat(reopened, BEAT, START + 315_000);

    expect(asOf(beating, START + 320_000, POLICY)).toMatchObject({
      home_link_status: "up",
      stale_since: START,
    });
    expect(
      asOf(afterRefresh(beating), START + 320_000, POLICY).stale_since,
    ).toBeUndefined();
  });

  it("owes a refresh after a quick reconnect too, since the last sign of life before it", () => {
    const up = afterHeartbeat(refreshed(START), BEAT, START + 15_000);
    const reopened = afterSessionOpened(up, "0.1.0", START + 20_000);

    expect(reopened.refresh_owed_since).toBe(START + 15_000);
    expect(asOf(reopened, START + 21_000, POLICY).stale_since).toBe(
      START + 15_000,
    );
  });

  it("keeps the earliest time owed across sessions that open before any inventory is stored", () => {
    const first = afterSessionOpened(undefined, "0.1.0", START);
    const second = afterSessionOpened(
      asOf(first, START + 5_000, POLICY),
      "0.1.0",
      START + 5_000,
    );

    expect(second.refresh_owed_since).toBe(START);
  });

  it("does not let a heartbeat end the refresh owed", () => {
    const opened = afterSessionOpened(undefined, "0.1.0", START);

    const beating = afterHeartbeat(opened, BEAT, START + 15_000);

    expect(beating.refresh_owed_since).toBe(START);
    expect(asOf(beating, START + 16_000, POLICY).stale_since).toBe(START);
  });
});

describe("the Health engine after CP-14 review round 5", () => {
  it("owes a refresh from a heartbeat that says an inventory is owed, since the last sign of life before it", () => {
    const up = afterHeartbeat(refreshed(START), BEAT, START + 15_000);

    const owing = afterHeartbeat(
      up,
      { ...BEAT, inventory_owed: true },
      START + 30_000,
    );

    expect(owing.refresh_owed_since).toBe(START + 15_000);
    expect(asOf(owing, START + 31_000, POLICY)).toMatchObject({
      home_link_status: "up",
      stale_since: START + 15_000,
    });
    expect(
      afterHeartbeat(owing, { ...BEAT, inventory_owed: true }, START + 45_000)
        .refresh_owed_since,
    ).toBe(START + 15_000);
  });

  it("does not move as_of back for a sign of life older than the last", () => {
    const up = afterHeartbeat(refreshed(START), BEAT, START + 30_000);

    const late = afterHeartbeat(up, BEAT, START + 15_000);

    expect(late.as_of).toBe(START + 30_000);
  });

  it("stores a home whose sign of life came the threshold ago or longer as down since then, and any other view as it is", () => {
    const silent = asOf(refreshed(START), START + 200_000, POLICY);
    const late = afterHeartbeat(silent, BEAT, START + 70_000);

    expect(settled(late, START + 189_999, POLICY)).toEqual(late);
    expect(settled(late, START + 190_000, POLICY)).toEqual({
      ...late,
      home_link_status: "down",
      home_link_since: START + 70_000,
      stale_since: START + 70_000,
    });
  });
});
