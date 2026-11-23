import { expect, it } from "vitest";
import { MediaPermissions } from "../../src/core/access/settings/media-permissions.ts";
import { FakeClock } from "../../src/utilities/clock/index.ts";
import { MediaTickets } from "../../src/core/access/media/index.ts";
import {
  CORE_MIGRATIONS,
  runMigrations,
} from "../../src/utilities/query-layer/index.ts";

import { describeStoreMatrix } from "../support/index.ts";
describeStoreMatrix("per-camera media approval", (backend) => {
  it("checks the grant against its receiver, item, both generations and the exact five-minute boundary", async () => {
    const clock = new FakeClock(1234),
      signal = new AbortController().signal;
    const db = await backend.emptyDatabase();
    try {
      await runMigrations(db, CORE_MIGRATIONS, { clock }, signal);
      const tickets = new MediaTickets(db, clock);
      const { token } = await tickets.issue(
        "one",
        "receiver",
        "camera-v1",
        "approval-v1",
        clock.now() + 900_000,
        signal,
      );
      const check = (
        item = "one",
        receiver = "receiver",
        policy = "camera-v1",
        approval = "approval-v1",
      ) => tickets.valid(token, item, receiver, policy, approval, signal);
      expect(await check("two")).toBe(false);
      expect(await check("one", "other")).toBe(false);
      expect(await check("one", "receiver", "camera-v2")).toBe(false);
      expect(await check("one", "receiver", "camera-v1", "approval-v2")).toBe(
        false,
      );
      await clock.advance(299_999);
      expect(await check()).toBe(true);
      await clock.advance(1);
      expect(await check()).toBe(false);
    } finally {
      await db.close();
    }
  });
  it("preserves another service and invalidates outstanding grants across withdrawal and reapproval", async () => {
    const clock = new FakeClock(1000);
    const signal = new AbortController().signal;
    const db = await backend.emptyDatabase();
    try {
      await runMigrations(db, CORE_MIGRATIONS, { clock }, signal);
      const settings = new MediaPermissions(db);
      expect((await settings.camera("home", "door", signal)).enabled).toBe(
        false,
      );
      await settings.save(
        "home",
        "door",
        "one",
        { enabled: true, sound: true, approved: true },
        signal,
      );
      const first = await settings.camera("home", "door", signal);
      await settings.save(
        "home",
        "door",
        "two",
        { enabled: true, sound: true, approved: true },
        signal,
      );
      await settings.save(
        "home",
        "door",
        "one",
        { enabled: true, sound: true, approved: false },
        signal,
      );
      await settings.save(
        "home",
        "door",
        "one",
        { enabled: true, sound: true, approved: true },
        signal,
      );
      const current = await new MediaPermissions(db).camera(
        "home",
        "door",
        signal,
      );
      expect(current.approvals.get("one")).toBeDefined();
      expect(current.approvals.get("one")).not.toBe(first.approvals.get("one"));
      expect(current.approvals.get("two")).toBeDefined();
      expect((await settings.camera("home", "other", signal)).enabled).toBe(
        false,
      );
    } finally {
      await db.close();
    }
  });
});
