// Core Link (T016) over the in-memory link pair, with the test playing the core: the signed hello,
// enrollment, the outbox's sending and resending, reconnecting with backoff, every close reason, and
// no secret on any frame. The home behind it is the simulated home and a real outbox.
import { afterEach, describe, expect, it } from "vitest";
import { FakeClock } from "../../../utilities/clock/index.ts";
import {
  createLinkPair,
  LinkSlot,
  MAX_FRAME_BYTES,
} from "../../../utilities/link-transport/index.ts";
import type {
  DialOutcome,
  LinkConnection,
  LinkFrame,
  LinkPair,
} from "../../../utilities/link-transport/index.ts";
import { Logger } from "../../../utilities/logging/index.ts";
import {
  exportPrivateKey,
  generateSigningKeyPair,
  signingKeyId,
  verifyChallenge,
} from "../../../utilities/security/index.ts";
import type { SigningKeyPair } from "../../../utilities/security/index.ts";
import { OutboxStore } from "../../access/outbox-store/index.ts";
import { Ingest } from "../../managers/ingest/index.ts";
import {
  HEBREW_DEVICE_ID,
  HEBREW_DEVICE_NAME,
  ScenarioEngine,
} from "../../../../test/scenarios/index.ts";
import { HomeScheduler } from "../home-scheduler/index.ts";
import { CoreLink, HANDSHAKE_TIMEOUT_MS, RECONNECT_BACKOFF } from "./index.ts";

const START = Date.UTC(2026, 10, 7, 9, 0, 0);
const CODE = "CODE-4711";
const VERSION = "0.1.0";
const NONCE = "a-fresh-nonce-from-the-core";
const SECOND_MS = 1_000;
const signal = new AbortController().signal;

interface Connection {
  readonly pair: LinkPair;
  readonly core: LinkConnection;
  readonly frames: LinkFrame[];
}

interface Harness {
  readonly clock: FakeClock;
  readonly lines: string[];
  readonly engine: ScenarioEngine;
  readonly store: OutboxStore;
  readonly slot: LinkSlot;
  readonly key: SigningKeyPair;
  readonly connections: Connection[];
  readonly dialTimes: number[];
  readonly coreLink: CoreLink;
  readonly scheduler: HomeScheduler;
}

const stops: (() => Promise<void>)[] = [];

afterEach(async () => {
  for (const stop of stops.splice(0).reverse()) {
    await stop();
  }
});

async function harness(unreachable = 0): Promise<Harness> {
  const clock = new FakeClock(START);
  const lines: string[] = [];
  const logger = new Logger({
    sink: (line) => lines.push(line),
    now: () => clock.now(),
    minLevel: "debug",
  });
  const engine = new ScenarioEngine(clock);
  const store = await OutboxStore.open({ path: ":memory:", clock }, signal);
  const slot = new LinkSlot();
  const ingest = new Ingest({
    ring: engine,
    outbox: store,
    link: slot,
    clock,
    logger,
  });
  ingest.start();
  const key = await generateSigningKeyPair();
  const connections: Connection[] = [];
  const dialTimes: number[] = [];
  let unreachableLeft = unreachable;
  const dial = (): Promise<DialOutcome> => {
    dialTimes.push(clock.now());
    if (unreachableLeft > 0) {
      unreachableLeft -= 1;
      return Promise.resolve({ kind: "unreachable" });
    }
    const pair = createLinkPair(logger);
    const frames: LinkFrame[] = [];
    pair.acceptor.onFrame((frame) => frames.push(frame));
    connections.push({ pair, core: pair.acceptor, frames });
    return Promise.resolve({ kind: "connected", link: pair.dialer });
  };
  const coreLink = new CoreLink({
    dial,
    slot,
    ingest,
    identity: { key, enrollmentCode: CODE, connectorVersion: VERSION },
    clock,
    logger,
    random: () => 1,
    newSessionId: () => `session-${String(connections.length)}`,
  });
  const scheduler = new HomeScheduler({ ingest, clock, logger });
  stops.push(
    () => store.close(),
    () => ingest.stop(),
    () => coreLink.stop(),
    () => scheduler.stop(),
  );
  return {
    clock,
    lines,
    engine,
    store,
    slot,
    key,
    connections,
    dialTimes,
    coreLink,
    scheduler,
  };
}

async function settle(rounds = 50): Promise<void> {
  for (let round = 0; round < rounds; round += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

async function until(condition: () => boolean): Promise<void> {
  for (let round = 0; !condition(); round += 1) {
    if (round > 500) {
      throw new Error("The link did not get there.");
    }
    await new Promise((resolve) => setImmediate(resolve));
  }
}

function connection(test: Harness, index: number): Connection {
  const found = test.connections.at(index);
  if (found === undefined) {
    throw new Error(`No connection ${String(index)}.`);
  }
  return found;
}

function messagesOf(link: Connection, type: string): Record<string, unknown>[] {
  return link.frames
    .filter((frame) => frame.kind === "message" && frame.type === type)
    .map(
      (frame) =>
        (frame.kind === "message" ? frame.body : {}) as Record<string, unknown>,
    );
}

async function frameOf(
  link: Connection,
  type: string,
  count = 1,
): Promise<Record<string, unknown>> {
  await until(() => messagesOf(link, type).length >= count);
  return messagesOf(link, type)[count - 1] ?? {};
}

/** Plays the core's side of a session start on `link`, checking the signature. */
async function openSession(test: Harness, link: Connection): Promise<void> {
  await frameOf(link, "hello");
  void link.core.send({ type: "challenge", body: { nonce: NONCE } });
  const response = await frameOf(link, "challenge_response");
  expect(
    verifyChallenge(test.key.publicKey, NONCE, String(response.signature)),
  ).toBe(true);
  void link.core.send({ type: "hello_ok", body: { version: 1 } });
  await until(() => test.slot.current === link.pair.dialer);
}

async function started(unreachable = 0): Promise<Harness> {
  const test = await harness(unreachable);
  test.coreLink.start();
  await settle();
  return test;
}

describe("CoreLink: opening a session", () => {
  it("says hello with its key's id, signs the challenge, then sends the inventory and clears it on its ack", async () => {
    const test = await started();
    const link = connection(test, 0);
    expect(await frameOf(link, "hello")).toEqual({
      version: 1,
      key_id: signingKeyId(test.key.publicKey),
      connector_version: VERSION,
      session_id: "session-1",
    });
    await openSession(test, link);
    const inventory = await frameOf(link, "inventory");
    expect(inventory.message_id).toEqual(expect.any(String));
    expect(inventory.devices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          device_id: HEBREW_DEVICE_ID,
          name: HEBREW_DEVICE_NAME,
        }),
      ]),
    );
    void link.core.send({
      type: "ack",
      body: { message_id: inventory.message_id },
    });
    await settle();
    expect(await test.store.depth(signal)).toBe(0);
    expect(test.lines.join("\n")).toContain('"session_id":"session-1"');
  });

  it("answers inventory_request with a fresh inventory, and sends a device change at once, in full", async () => {
    const test = await started();
    const link = connection(test, 0);
    await openSession(test, link);
    await frameOf(link, "inventory");
    void link.core.send({
      type: "inventory_request",
      body: { request_id: "r-1" },
    });
    await frameOf(link, "inventory", 2);

    test.engine.apply({
      kind: "device",
      deviceId: HEBREW_DEVICE_ID,
      changes: { battery_pct: 7 },
    });
    const change = await frameOf(link, "device_state");
    expect(change).toMatchObject({
      device_id: HEBREW_DEVICE_ID,
      name: HEBREW_DEVICE_NAME,
      battery_pct: 7,
      message_id: expect.any(String) as unknown,
    });
    expect(change.state_version).toEqual(expect.any(Number));
  });

  it("sends nothing from the outbox until the session is open", async () => {
    const test = await started();
    const link = connection(test, 0);
    await frameOf(link, "hello");
    void link.core.send({ type: "challenge", body: { nonce: NONCE } });
    await frameOf(link, "challenge_response");
    test.engine.apply({
      kind: "device",
      deviceId: HEBREW_DEVICE_ID,
      changes: { battery_pct: 9 },
    });
    await settle();
    expect(link.frames.map((frame) => frame.type)).toEqual([
      "hello",
      "challenge_response",
    ]);
    void link.core.send({ type: "hello_ok", body: { version: 1 } });
    expect(await frameOf(link, "device_state")).toMatchObject({
      battery_pct: 9,
    });
  });

  it("drops a connection whose handshake does not finish in time, and dials again", async () => {
    const test = await started();
    const link = connection(test, 0);
    await frameOf(link, "hello");
    await test.clock.advance(HANDSHAKE_TIMEOUT_MS);
    await until(() => link.core.closed !== undefined);
    expect(link.core.closed).toEqual({
      cause: "closed_by_peer",
      reason: "handshake_timeout",
    });
    await test.clock.advance(RECONNECT_BACKOFF.initialMs);
    await until(() => test.connections.length === 2);
  });

  it("ignores a message it does not expect or cannot read, and logs only its type", async () => {
    const test = await started();
    const link = connection(test, 0);
    await frameOf(link, "hello");
    void link.core.send({ type: "ack", body: { message_id: "early" } });
    void link.core.send({ type: "ack", body: { note: HEBREW_DEVICE_NAME } });
    void link.core.send({ type: "something_new", body: {} });
    await settle();
    const log = test.lines.join("\n");
    expect(log).toContain("core_link_message_out_of_turn");
    expect(log).toContain("core_link_message_refused");
    expect(log).not.toContain(HEBREW_DEVICE_NAME);
    await openSession(test, link);
  });
});

describe("CoreLink: the outbox over the link", () => {
  it("resends what has no ack after 10 s, and sends the heartbeat every 15 s", async () => {
    const test = await started();
    test.scheduler.start();
    const link = connection(test, 0);
    await openSession(test, link);
    const first = await frameOf(link, "inventory");
    await test.clock.advance(10 * SECOND_MS);
    const resent = await frameOf(link, "inventory", 2);
    expect(resent.message_id).toBe(first.message_id);

    await test.clock.advance(5 * SECOND_MS);
    const heartbeat = await frameOf(link, "heartbeat");
    expect(heartbeat).toEqual({
      ring_session: "ok",
      push: "off",
      outbox_depth: 1,
      inventory_owed_after: null,
      last_ring_event_at: null,
      error_counts: {},
      as_of: "2026-11-07T09:00:15.000Z",
    });
  });

  it("after a drop, dials again within a second and sends every unacked message again, oldest first", async () => {
    const test = await started();
    const before = connection(test, 0);
    await openSession(test, before);
    const unacked = await frameOf(before, "inventory");
    before.pair.drop();
    await until(() => test.slot.current === undefined);
    await test.clock.advance(RECONNECT_BACKOFF.initialMs);
    await until(() => test.connections.length === 2);
    const after = connection(test, 1);
    await openSession(test, after);
    const second = await frameOf(after, "inventory", 2);
    const firstAgain = messagesOf(after, "inventory")[0];
    expect(firstAgain?.message_id).toBe(unacked.message_id);
    expect(second.message_id).not.toBe(unacked.message_id);
  });

  it("sends the older unacked messages first, even when a change was written during the new handshake", async () => {
    const test = await started();
    const before = connection(test, 0);
    await openSession(test, before);
    const unacked = await frameOf(before, "inventory");
    before.pair.drop();
    await until(() => test.slot.current === undefined);
    await test.clock.advance(RECONNECT_BACKOFF.initialMs);
    await until(() => test.connections.length === 2);
    const after = connection(test, 1);
    await frameOf(after, "hello");
    void after.core.send({ type: "challenge", body: { nonce: NONCE } });
    await frameOf(after, "challenge_response");
    test.engine.apply({
      kind: "device",
      deviceId: HEBREW_DEVICE_ID,
      changes: { battery_pct: 3 },
    });
    await settle();
    void after.core.send({ type: "hello_ok", body: { version: 1 } });
    await frameOf(after, "device_state");
    await frameOf(after, "inventory", 2);
    const outbox = after.frames.filter(
      (frame) => frame.type === "inventory" || frame.type === "device_state",
    );
    expect(outbox[0]).toMatchObject({
      type: "inventory",
      body: { message_id: unacked.message_id },
    });
  });

  it("logs a failure of its own loop once instead of ending the process unseen", async () => {
    const test = await harness();
    const lines = test.lines;
    const broken = new CoreLink({
      dial: () => {
        throw new RangeError("The link dials only wss:.");
      },
      slot: test.slot,
      ingest: new Ingest({
        ring: test.engine,
        outbox: test.store,
        link: test.slot,
        clock: test.clock,
        logger: new Logger({
          sink: () => undefined,
          now: () => 0,
          minLevel: "debug",
        }),
      }),
      identity: {
        key: test.key,
        enrollmentCode: CODE,
        connectorVersion: VERSION,
      },
      clock: test.clock,
      logger: new Logger({
        sink: (line) => lines.push(line),
        now: () => test.clock.now(),
        minLevel: "debug",
      }),
    });
    broken.start();
    await settle();
    await broken.stop();
    expect(
      lines.filter((line) => line.includes("core_link_failed")),
    ).toHaveLength(1);
  });

  it("leaves no handshake timer behind for a link the core closed before the session began (T027)", async () => {
    const test = await harness();
    const logger = new Logger({
      sink: () => undefined,
      now: () => test.clock.now(),
      minLevel: "debug",
    });
    const refused = new CoreLink({
      // A core without the lease closes the link at once, before the session begins (mode A).
      dial: () => {
        const pair = createLinkPair(logger);
        pair.acceptor.close("core_unavailable");
        return Promise.resolve({ kind: "connected", link: pair.dialer });
      },
      slot: test.slot,
      ingest: new Ingest({
        ring: test.engine,
        outbox: test.store,
        link: test.slot,
        clock: test.clock,
        logger,
      }),
      identity: {
        key: test.key,
        enrollmentCode: CODE,
        connectorVersion: VERSION,
      },
      clock: test.clock,
      logger,
      random: () => 1,
    });
    refused.start();
    await settle();

    await refused.stop();
    await settle();

    expect(test.clock.pendingTimers).toBe(0);
  });

  it("drops a message too large for a frame, logs it once by id, and still sends the rest", async () => {
    const test = await harness();
    const tooLarge = await test.store.append(
      () => ({
        kind: "device_state",
        body: { name: "x".repeat(MAX_FRAME_BYTES) },
      }),
      signal,
    );
    test.coreLink.start();
    await settle();
    const link = connection(test, 0);
    await openSession(test, link);
    const inventory = await frameOf(link, "inventory");
    await settle();
    expect(messagesOf(link, "device_state")).toEqual([]);
    const dropped = test.lines.filter((line) =>
      line.includes("ingest_message_dropped"),
    );
    expect(dropped).toHaveLength(1);
    expect(dropped[0]).toContain(tooLarge);
    void link.core.send({
      type: "ack",
      body: { message_id: inventory.message_id },
    });
    await settle();
    expect(await test.store.depth(signal)).toBe(0);
  });
});

describe("CoreLink: reconnecting", () => {
  it("backs off from 1 s, doubling to 30 s, while the core is unreachable, and starts over after a session", async () => {
    const test = await started(7);
    const expected = [1, 2, 4, 8, 16, 30, 30].map((s) => s * SECOND_MS);
    for (const gap of expected) {
      await test.clock.advance(gap);
      await settle();
    }
    const gaps = test.dialTimes
      .slice(1)
      .map((time, index) => time - (test.dialTimes[index] ?? 0));
    expect(gaps).toEqual(expected);

    const link = connection(test, 0);
    await openSession(test, link);
    link.pair.drop();
    await until(() => test.slot.current === undefined);
    const droppedAt = test.clock.now();
    await test.clock.advance(RECONNECT_BACKOFF.initialMs);
    await until(() => test.connections.length === 2);
    expect(test.dialTimes.at(-1)).toBe(droppedAt + RECONNECT_BACKOFF.initialMs);
  });

  it("enrolls when the core does not know the key, says hello on the same link once enrolled, and not again later", async () => {
    const test = await started();
    const first = connection(test, 0);
    await frameOf(first, "hello");
    first.core.close("key_not_enrolled");
    await test.clock.advance(RECONNECT_BACKOFF.initialMs);
    await until(() => test.connections.length === 2);

    const second = connection(test, 1);
    expect(await frameOf(second, "enroll")).toEqual({
      public_key: test.key.publicKey,
      code: CODE,
    });
    expect(messagesOf(second, "hello")).toEqual([]);
    // The owner compares the logged code with the admin page's (T028).
    expect(
      test.lines.find((line) => line.includes("core_link_enroll_sent")),
    ).toContain(`"enrollment_code":"${CODE}"`);
    void second.core.send({
      type: "enrolled",
      body: { key_id: signingKeyId(test.key.publicKey) },
    });
    await openSession(test, second);
    second.pair.drop();
    await test.clock.advance(RECONNECT_BACKOFF.initialMs);
    await until(() => test.connections.length === 3);
    const third = connection(test, 2);
    await frameOf(third, "hello");
    expect(messagesOf(third, "enroll")).toEqual([]);
  });

  it("closes when enrolled names another key, and enrolls again next time", async () => {
    const test = await started();
    connection(test, 0).core.close("key_not_enrolled");
    await test.clock.advance(RECONNECT_BACKOFF.initialMs);
    await until(() => test.connections.length === 2);
    const second = connection(test, 1);
    await frameOf(second, "enroll");
    void second.core.send({
      type: "enrolled",
      body: { key_id: "another-key" },
    });
    await until(() => second.core.closed !== undefined);
    expect(second.core.closed?.reason).toBe("key_mismatch");
    await test.clock.advance(2 * RECONNECT_BACKOFF.initialMs);
    await until(() => test.connections.length === 3);
    await frameOf(connection(test, 2), "enroll");
  });

  it("stops dialing when the key is revoked", async () => {
    const test = await started();
    const link = connection(test, 0);
    await openSession(test, link);
    link.core.close("key_revoked");
    await until(() => test.slot.current === undefined);
    await test.clock.advance(5 * 60 * SECOND_MS);
    await settle();
    expect(test.dialTimes).toHaveLength(1);
    expect(test.lines.join("\n")).toContain("core_link_key_revoked");
  });

  it("waits the longest delay when the core does not accept the version", async () => {
    const test = await started();
    connection(test, 0).core.close("version_not_accepted");
    await settle();
    await test.clock.advance(RECONNECT_BACKOFF.capMs - SECOND_MS);
    await settle();
    expect(test.dialTimes).toHaveLength(1);
    await test.clock.advance(SECOND_MS);
    await until(() => test.dialTimes.length === 2);
  });

  it("closes the link when stopped, and dials no more, logging no error for work it cut short", async () => {
    const test = await started();
    const link = connection(test, 0);
    await openSession(test, link);
    await frameOf(link, "inventory");
    test.engine.apply({
      kind: "fault",
      fault: { kind: "slow", delayMs: 60 * SECOND_MS },
    });
    void link.core.send({
      type: "inventory_request",
      body: { request_id: "r-slow" },
    });
    await settle();
    await test.coreLink.stop();
    await until(() => link.core.closed !== undefined);
    expect(link.core.closed).toEqual({
      cause: "closed_by_peer",
      reason: "connector_stopping",
    });
    await test.clock.advance(60 * SECOND_MS);
    await settle();
    expect(test.dialTimes).toHaveLength(1);
    expect(test.lines.join("\n")).not.toContain('"level":"error"');
  });
});

describe("CoreLink: secrets", () => {
  it("never puts the connector's private key on a frame, in any encoding", async () => {
    const test = await started();
    test.scheduler.start();
    connection(test, 0).core.close("key_not_enrolled");
    await test.clock.advance(RECONNECT_BACKOFF.initialMs);
    await until(() => test.connections.length === 2);
    const link = connection(test, 1);
    await frameOf(link, "enroll");
    void link.core.send({
      type: "enrolled",
      body: { key_id: signingKeyId(test.key.publicKey) },
    });
    await openSession(test, link);
    await frameOf(link, "inventory");
    await test.clock.advance(15 * SECOND_MS);
    await frameOf(link, "heartbeat");

    const der = Buffer.from(exportPrivateKey(test.key.privateKey));
    const seed = der.subarray(-32);
    const forbidden = [
      der.toString("base64"),
      der.toString("base64url"),
      der.toString("hex"),
      seed.toString("base64"),
      seed.toString("base64url"),
      seed.toString("hex"),
    ];
    const sent = JSON.stringify(
      test.connections.flatMap((each) => each.frames),
    );
    for (const secret of forbidden) {
      expect(sent).not.toContain(secret);
    }
    expect(sent).toContain(test.key.publicKey);
  });
});
