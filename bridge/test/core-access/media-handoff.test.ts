import { expect, it } from "vitest";
import { Audit } from "../../src/core/access/audit/index.ts";
import { MediaPermissions } from "../../src/core/access/settings/media-permissions.ts";
import { FakeClock } from "../../src/utilities/clock/index.ts";
import { MediaTickets } from "../../src/core/access/media/index.ts";
import {
  CORE_MIGRATIONS,
  runMigrations,
} from "../../src/utilities/query-layer/index.ts";

import { describeStoreMatrix } from "../support/index.ts";
describeStoreMatrix("per-camera media approval", (backend) => {
  it("rejects an old add after approval and withdrawal return the receiver list to its original state", async () => {
    const signal = new AbortController().signal;
    const db = await backend.emptyDatabase();
    try {
      await runMigrations(
        db,
        CORE_MIGRATIONS,
        { clock: new FakeClock(1000) },
        signal,
      );
      const settings = new MediaPermissions(db);
      const switches = { enabled: true, sound: false, approved: true };
      await settings.save("home", "door", "existing", switches, signal);
      const before = await settings.camera("home", "door", signal);
      const expected = {
        generation: before.generation,
        personAction: "inherit" as const,
        approvalRevision: before.approvalRevision,
      };
      await settings.save(
        "home",
        "door",
        "guest",
        { ...switches, expected },
        signal,
      );
      await settings.save(
        "home",
        "door",
        "guest",
        { ...switches, approved: false },
        signal,
      );
      expect(
        await settings.save(
          "home",
          "door",
          "guest",
          { ...switches, expected },
          signal,
        ),
      ).toBe("stale");
      const after = await settings.camera("home", "door", signal);
      expect(after.approvals).toEqual(before.approvals);
      expect(after.generation).toBe(before.generation);
      expect(after.approvalRevision).not.toBe(before.approvalRevision);
      expect(
        await settings.save(
          "home",
          "door",
          "guest",
          {
            ...switches,
            expected: { ...expected, approvalRevision: after.approvalRevision },
          },
          signal,
        ),
      ).toBe("saved");
    } finally {
      await db.close();
    }
  });
  it("rejects an old person-detection choice before changing approvals or writing an audit row", async () => {
    const clock = new FakeClock(1000);
    const signal = new AbortController().signal;
    const db = await backend.emptyDatabase();
    try {
      await runMigrations(db, CORE_MIGRATIONS, { clock }, signal);
      const settings = new MediaPermissions(db);
      const switches = { enabled: true, sound: true, approved: true };
      await settings.save("home", "door", "one", switches, signal);
      const original = await settings.camera("home", "door", signal);
      const expected = {
        generation: original.generation,
        approvalRevision: original.approvalRevision,
        personAction: "inherit" as const,
      };
      await settings.save(
        "home",
        "door",
        "",
        { ...switches, expected, personAction: "drop" },
        signal,
      );
      const auditCount = () =>
        db.get(
          { sql: "SELECT COUNT(*) AS n FROM owner_media_change", params: {} },
          signal,
        );
      const before = await auditCount();
      expect(
        await settings.save(
          "home",
          "door",
          "two",
          { ...switches, expected, personAction: "inherit", remove: ["one"] },
          signal,
        ),
      ).toBe("stale");
      const after = await settings.camera("home", "door", signal);
      expect(after.personAction).toBe("drop");
      expect(after.generation).toBe(original.generation);
      expect(after.approvals).toEqual(original.approvals);
      expect(await auditCount()).toEqual(before);
    } finally {
      await db.close();
    }
  });
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
      const settings = new MediaPermissions(db, () => clock.now());
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
      const changes = await db.all(
        {
          sql: "SELECT action, location_id, device_id, receiver_id, ts FROM owner_media_change",
          params: {},
        },
        signal,
      );
      expect(changes).toHaveLength(5);
      expect(changes).toEqual(
        expect.arrayContaining([
          {
            action: "approval_removed",
            location_id: "home",
            device_id: "door",
            receiver_id: "one",
            ts: clock.now(),
          },
          {
            action: "camera_settings",
            location_id: "home",
            device_id: "door",
            receiver_id: null,
            ts: clock.now(),
          },
          {
            action: "approval_added",
            location_id: "home",
            device_id: "door",
            receiver_id: "two",
            ts: clock.now(),
          },
        ]),
      );
      const audit = new Audit({ clock });
      const count = () =>
        db.get(
          { sql: "SELECT COUNT(*) AS n FROM owner_media_change", params: {} },
          signal,
        );
      await clock.advance(365 * 86_400_000);
      await db.transaction(
        (tx) => audit.purgeEventsBefore(tx, clock.now(), signal),
        signal,
      );
      expect(await count()).toEqual({ n: 5 });
      await clock.advance(1);
      await db.transaction(
        (tx) => audit.purgeEventsBefore(tx, clock.now(), signal),
        signal,
      );
      expect(await count()).toEqual({ n: 0 });
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
