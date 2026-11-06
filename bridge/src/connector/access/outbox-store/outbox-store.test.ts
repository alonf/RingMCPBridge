// The Outbox Store (T014): written before it is sent, resent after 10 s without an ack, oldest
// first, cleared only on its ack, and a state_version counter that survives a restart.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FakeClock } from "../../../utilities/clock/index.ts";
import { openSqliteQueryLayer } from "../../../utilities/query-layer/index.ts";
import { OutboxStore, OutboxStoreError, RESEND_AFTER_MS } from "./index.ts";
import type { OutboxDraft, OutboxItem } from "./index.ts";

const START = Date.UTC(2026, 10, 6, 9, 0, 0);
const ROOM = "סלון";
const signal = new AbortController().signal;

let folder: string;
let clock: FakeClock;
const opened: OutboxStore[] = [];

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "outbox-store-"));
  clock = new FakeClock(START);
});

afterEach(async () => {
  for (const store of opened.splice(0)) {
    await store.close();
  }
  await rm(folder, { recursive: true, force: true });
});

async function open(path = join(folder, "outbox.db")): Promise<OutboxStore> {
  const store = await OutboxStore.open({ path, clock }, signal);
  opened.push(store);
  return store;
}

function deviceState(name: string, version: number): OutboxDraft {
  return {
    kind: "device_state",
    body: { device_id: "device-1", name, room: ROOM, state_version: version },
  };
}

/** Appends one device_state message, numbered from the store's counter. */
function appendOne(store: OutboxStore, name: string): Promise<string> {
  return store.append((versions) => deviceState(name, versions.next()), signal);
}

/** Writes a row past the store, as a newer release or a damaged file would leave it. */
async function insertRow(
  path: string,
  kind: string,
  body: string,
): Promise<void> {
  const raw = openSqliteQueryLayer(path, { clock });
  await raw.run(
    {
      sql: "INSERT INTO outbox (message_id, kind, body, created_at) VALUES (@message_id, @kind, @body, @created_at)",
      params: { message_id: `raw-${kind}`, kind, body, created_at: START },
    },
    signal,
  );
  await raw.close();
}

function idsOf(items: readonly OutboxItem[]): string[] {
  return items.map((item) => item.messageId);
}

describe("OutboxStore", () => {
  it("returns a written message once, with its kind and body, until it is due again", async () => {
    const store = await open();
    const id = await appendOne(store, "front door");

    const first = await store.takeDue(10, signal);
    expect(first).toEqual([
      {
        messageId: id,
        kind: "device_state",
        body: {
          device_id: "device-1",
          name: "front door",
          room: ROOM,
          state_version: 1,
        },
      },
    ]);
    expect(await store.takeDue(10, signal)).toEqual([]);
  });

  it("resends a message 10 s after it was sent without an ack, and not a moment earlier", async () => {
    const store = await open();
    const id = await appendOne(store, "front door");
    await store.takeDue(10, signal);

    await clock.advance(RESEND_AFTER_MS - 1);
    expect(await store.takeDue(10, signal)).toEqual([]);

    await clock.advance(1);
    expect(idsOf(await store.takeDue(10, signal))).toEqual([id]);
    expect(await store.takeDue(10, signal)).toEqual([]);
  });

  it("sends the oldest first, up to the limit asked for", async () => {
    const store = await open();
    const ids = [
      await appendOne(store, "a"),
      await appendOne(store, "b"),
      await appendOne(store, "c"),
    ];

    expect(idsOf(await store.takeDue(2, signal))).toEqual(ids.slice(0, 2));
    expect(idsOf(await store.takeDue(2, signal))).toEqual(ids.slice(2));
  });

  it("clears a message only on its ack, and an unknown or repeated ack changes nothing", async () => {
    const store = await open();
    const kept = await appendOne(store, "kept");
    const acked = await appendOne(store, "acked");
    await store.takeDue(10, signal);

    expect(await store.acknowledge(acked, signal)).toBe(true);
    expect(await store.acknowledge(acked, signal)).toBe(false);
    expect(await store.acknowledge("no-such-message", signal)).toBe(false);
    expect(await store.depth(signal)).toBe(1);

    await clock.advance(RESEND_AFTER_MS);
    expect(idsOf(await store.takeDue(10, signal))).toEqual([kept]);
  });

  it("sends every unacked message again, oldest first, once the link reconnects", async () => {
    const store = await open();
    const ids = [await appendOne(store, "a"), await appendOne(store, "b")];
    await store.takeDue(1, signal);
    await clock.advance(1_000);
    await store.takeDue(1, signal);

    await store.markAllUnsent(signal);
    expect(idsOf(await store.takeDue(10, signal))).toEqual(ids);
  });

  it("keeps unacked messages across a restart, with their send times", async () => {
    const path = join(folder, "outbox.db");
    const before = await open(path);
    const sent = await appendOne(before, "sent before the restart");
    await before.takeDue(10, signal);
    const unsent = await appendOne(before, "never sent");
    await before.close();

    const after = await open(path);
    expect(await after.depth(signal)).toBe(2);
    expect(idsOf(await after.takeDue(10, signal))).toEqual([unsent]);
    await clock.advance(RESEND_AFTER_MS);
    const resent = await after.takeDue(10, signal);
    expect(idsOf(resent)).toEqual([sent, unsent]);
    expect(resent[0]?.body).toMatchObject({ name: "sent before the restart" });
  });

  it("keeps state versions increasing across a restart", async () => {
    const path = join(folder, "outbox.db");
    const before = await open(path);
    await before.append(
      (versions) => ({
        kind: "inventory",
        body: { versions: [versions.next(), versions.next(), versions.next()] },
      }),
      signal,
    );
    await before.close();

    const after = await open(path);
    await appendOne(after, "after the restart");
    const bodies = (await after.takeDue(10, signal)).map((item) => item.body);
    expect(bodies).toEqual([
      { versions: [1, 2, 3] },
      expect.objectContaining({ state_version: 4 }),
    ]);
  });

  it("writes nothing and uses no version when composing the message fails", async () => {
    const store = await open();
    const failure = new Error("compose failed");
    await expect(
      store.append((versions) => {
        versions.next();
        throw failure;
      }, signal),
    ).rejects.toBe(failure);

    expect(await store.depth(signal)).toBe(0);
    await appendOne(store, "next");
    expect((await store.takeDue(10, signal))[0]?.body).toMatchObject({
      state_version: 1,
    });
  });

  it("leaves a message of a kind this release does not know in place, unsent", async () => {
    const path = join(folder, "outbox.db");
    const store = await open(path);
    await insertRow(path, "event", "{}");
    const known = await appendOne(store, "known");

    expect(idsOf(await store.takeDue(10, signal))).toEqual([known]);
    expect(await store.depth(signal)).toBe(2);
  });

  it("fails as unavailable on a row it did not write, without quoting the row", async () => {
    const path = join(folder, "outbox.db");
    const store = await open(path);
    await insertRow(path, "device_state", `{"room": "${ROOM}"`);

    const failure = await store
      .takeDue(10, signal)
      .catch((error: unknown) => error);
    expect(failure).toMatchObject({
      name: "OutboxStoreError",
      kind: "unavailable",
    });
    expect((failure as Error).message).not.toContain(ROOM);
    expect((failure as Error).cause).toBeUndefined();
  });

  it("passes a caller's abort through unchanged", async () => {
    const store = await open();
    const controller = new AbortController();
    const reason = new Error("the caller left");
    controller.abort(reason);

    await expect(store.takeDue(1, controller.signal)).rejects.toBe(reason);
    await expect(
      store.append(() => deviceState("x", 1), controller.signal),
    ).rejects.toBe(reason);
  });

  it("fails as unavailable, without the message's contents, once the file is closed", async () => {
    const store = await open();
    await store.close();

    const failure = await appendOne(store, ROOM).catch(
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(OutboxStoreError);
    expect(failure).toMatchObject({ kind: "unavailable" });
    expect((failure as Error).message).not.toContain(ROOM);
    await expect(store.takeDue(1, signal)).rejects.toMatchObject({
      kind: "unavailable",
    });
  });

  it("fails as unavailable when the file cannot be opened", async () => {
    await expect(
      OutboxStore.open(
        { path: join(folder, "no-such-folder", "x.db"), clock },
        signal,
      ),
    ).rejects.toMatchObject({ name: "OutboxStoreError", kind: "unavailable" });
  });

  it("refuses a limit that is not a positive whole number", async () => {
    const store = await open();
    for (const limit of [0, -1, 1.5, Number.NaN]) {
      await expect(store.takeDue(limit, signal)).rejects.toThrow(RangeError);
    }
  });
});
