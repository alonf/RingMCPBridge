// Connector Link (T017) over the in-memory link pair, with the test playing the home: the signed
// hello, every close reason, enrollment held until the owner approves, Event's intake with `ack`
// only after the commit, one step at a time, and the limits across links. Admin and Settings are
// real, on SQLite; Event is a stand-in that records what it is handed (T018 builds the real one).
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { SettingsStore } from "../../access/settings/index.ts";
import { AdminManager } from "../../managers/admin/index.ts";
import type { ConnectorKeyCheck } from "../../managers/admin/index.ts";
import { FakeClock } from "../../../utilities/clock/index.ts";
import { createLinkPair } from "../../../utilities/link-transport/index.ts";
import type {
  LinkClosed,
  LinkConnection,
  LinkFrame,
  LinkPair,
} from "../../../utilities/link-transport/index.ts";
import { Logger } from "../../../utilities/logging/index.ts";
import {
  CORE_MIGRATIONS,
  openSqliteQueryLayer,
  runMigrations,
} from "../../../utilities/query-layer/index.ts";
import type { QueryLayer } from "../../../utilities/query-layer/index.ts";
import {
  generateSigningKeyPair,
  signChallenge,
  signingKeyId,
} from "../../../utilities/security/index.ts";
import type { SigningKeyPair } from "../../../utilities/security/index.ts";
import { RecordingIntake } from "../../../../test/support/index.ts";
import {
  CORE_CLOSE_REASONS,
  CORE_HANDSHAKE_TIMEOUT_MS,
  ConnectorLink,
  ENROLLMENT_POLL_MS,
  KEY_RECHECK_MS,
  MAX_PENDING_MESSAGES,
  MAX_UNPROVEN_LINKS,
} from "./index.ts";

const START = Date.UTC(2026, 10, 7, 9, 0, 0);
const NONCE = "a-fresh-nonce-from-the-core";
const VERSION = "0.1.0";
const CODE = "7Q4K-29XM";
const ENROLLMENT_TTL_MS = 10 * 60_000;
const RING_NAME = "דלת כניסה";
const AS_OF = "2026-11-07T09:00:00.000Z";
const never = new AbortController().signal;

interface Harness {
  readonly clock: FakeClock;
  readonly lines: string[];
  readonly logger: Logger;
  readonly layer: QueryLayer;
  readonly settings: SettingsStore;
  readonly intake: RecordingIntake;
  readonly connectorLink: ConnectorLink;
}

interface Home {
  readonly pair: LinkPair;
  readonly link: LinkConnection;
  readonly frames: LinkFrame[];
}

const stops: (() => Promise<void>)[] = [];

afterEach(async () => {
  for (const stop of stops.splice(0).reverse()) {
    await stop();
  }
});

async function harness(): Promise<Harness> {
  const clock = new FakeClock(START);
  const lines: string[] = [];
  const logger = new Logger({
    sink: (line) => lines.push(line),
    now: () => clock.now(),
    minLevel: "debug",
  });
  const layer = openSqliteQueryLayer(":memory:", { clock });
  await runMigrations(layer, CORE_MIGRATIONS, { clock }, never);
  const settings = new SettingsStore({
    store: layer,
    clock,
    defaultBatteryThresholdPct: 20,
  });
  const intake = new RecordingIntake();
  const connectorLink = new ConnectorLink({
    admin: new AdminManager({ settings }),
    intake,
    clock,
    logger,
    newNonce: () => NONCE,
  });
  stops.push(
    () => layer.close(),
    () => connectorLink.stop(),
  );
  return { clock, lines, logger, layer, settings, intake, connectorLink };
}

async function until(condition: () => boolean): Promise<void> {
  for (let round = 0; !condition(); round += 1) {
    if (round > 500) {
      throw new Error("The link did not get there.");
    }
    await new Promise((resolve) => setImmediate(resolve));
  }
}

async function settle(rounds = 50): Promise<void> {
  for (let round = 0; round < rounds; round += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

/** A new link from the home, accepted by Connector Link. */
function connect(
  test: Harness,
  connectorLink: ConnectorLink = test.connectorLink,
): Home {
  const pair = createLinkPair(test.logger);
  const frames: LinkFrame[] = [];
  pair.dialer.onFrame((frame) => frames.push(frame));
  connectorLink.accept(pair.acceptor);
  return { pair, link: pair.dialer, frames };
}

function messagesOf(home: Home, type: string): Record<string, unknown>[] {
  return home.frames
    .filter((frame) => frame.kind === "message" && frame.type === type)
    .map(
      (frame) =>
        (frame.kind === "message" ? frame.body : {}) as Record<string, unknown>,
    );
}

async function frameOf(
  home: Home,
  type: string,
  count = 1,
): Promise<Record<string, unknown>> {
  await until(() => messagesOf(home, type).length >= count);
  return messagesOf(home, type)[count - 1] ?? {};
}

async function closedWith(home: Home): Promise<LinkClosed> {
  await until(() => home.link.closed !== undefined);
  const { closed } = home.link;
  if (closed === undefined) {
    throw new Error("The link is still open.");
  }
  return closed;
}

function send(home: Home, type: string, body: unknown): void {
  void home.link.send({ type, body });
}

function hello(key: SigningKeyPair, version = 1): Record<string, unknown> {
  return {
    version,
    key_id: signingKeyId(key.publicKey),
    connector_version: VERSION,
    session_id: randomUUID(),
  };
}

/** A key the owner has approved, through Settings as the admin page will (T029). */
async function enrolledKey(test: Harness): Promise<SigningKeyPair> {
  const key = await generateSigningKeyPair();
  await test.settings.requestEnrollment(
    { public_key: key.publicKey, code: CODE },
    never,
  );
  await test.settings.approveEnrollment(signingKeyId(key.publicKey), never);
  return key;
}

/** Plays the home's side of a session start, as Core Link does. */
async function openSession(
  home: Home,
  key: SigningKeyPair,
  body = hello(key),
): Promise<void> {
  send(home, "hello", body);
  const challenge = await frameOf(home, "challenge");
  send(home, "challenge_response", {
    signature: signChallenge(key.privateKey, String(challenge.nonce)),
  });
  await frameOf(home, "hello_ok");
}

function inventory(messageId: string): Record<string, unknown> {
  return {
    message_id: messageId,
    snapshot_version: 1,
    locations: [
      {
        location_id: "loc-1",
        name: "בית",
        time_zone: "Asia/Jerusalem",
        alarm_mode: "home",
        ownership: "owned",
        as_of: AS_OF,
        state_version: 2,
      },
    ],
    devices: [deviceEntry()],
  };
}

function deviceEntry(): Record<string, unknown> {
  return {
    device_id: "d-1",
    location_id: "loc-1",
    name: RING_NAME,
    type: "contact",
    room: "מטבח",
    battery_pct: 80,
    power_mode: "battery",
    online: true,
    state: { open: false },
    as_of: AS_OF,
    state_version: 2,
  };
}

function heartbeat(): Record<string, unknown> {
  return {
    ring_session: "ok",
    push: "off",
    outbox_depth: 3,
    inventory_owed_after: null,
    last_ring_event_at: null,
    error_counts: { RING_TIMEOUT: 1 },
    as_of: AS_OF,
  };
}

describe("ConnectorLink: the signed hello", () => {
  it("challenges an active key, checks the signature, answers hello_ok at the hello's version, and tells Event", async () => {
    const test = await harness();
    const key = await enrolledKey(test);
    const home = connect(test);
    const body = hello(key);

    await openSession(home, key, body);

    expect(await frameOf(home, "challenge")).toEqual({ nonce: NONCE });
    expect(await frameOf(home, "hello_ok")).toEqual({ version: 1 });
    await until(() => test.intake.calls.length === 1);
    expect(test.intake.calls).toEqual([
      {
        method: "homeSessionOpened",
        body: {
          session_id: body.session_id,
          key_id: signingKeyId(key.publicKey),
          connector_version: VERSION,
          version: 1,
        },
        session: expect.anything() as unknown,
      },
    ]);
    expect(test.lines.join("\n")).toContain(
      `"session_id":"${String(body.session_id)}"`,
    );
  });

  it("closes as core_unavailable, before hello_ok, when Event cannot record the session's start (T018 follow-up)", async () => {
    const test = await harness();
    const key = await enrolledKey(test);
    const home = connect(test);
    test.intake.failNext(1);

    send(home, "hello", hello(key));
    const challenge = await frameOf(home, "challenge");
    send(home, "challenge_response", {
      signature: signChallenge(key.privateKey, String(challenge.nonce)),
    });

    expect(await closedWith(home)).toMatchObject({
      reason: CORE_CLOSE_REASONS.coreUnavailable,
    });
    expect(messagesOf(home, "hello_ok")).toEqual([]);
  });

  it("closes as key_revoked a key the owner replaced between its hello and its signature (T018 follow-up)", async () => {
    const test = await harness();
    const key = await enrolledKey(test);
    const home = connect(test);
    send(home, "hello", hello(key));
    const challenge = await frameOf(home, "challenge");

    await enrolledKey(test);
    send(home, "challenge_response", {
      signature: signChallenge(key.privateKey, String(challenge.nonce)),
    });

    expect(await closedWith(home)).toMatchObject({ reason: "key_revoked" });
    expect(messagesOf(home, "hello_ok")).toEqual([]);
    expect(test.intake.calls).toEqual([]);
  });

  it("closes a key it does not know, or that is still pending, as key_not_enrolled", async () => {
    const test = await harness();
    const stranger = await generateSigningKeyPair();
    const pending = await generateSigningKeyPair();
    await test.settings.requestEnrollment(
      { public_key: pending.publicKey, code: CODE },
      never,
    );

    for (const key of [stranger, pending]) {
      const home = connect(test);
      send(home, "hello", hello(key));
      expect(await closedWith(home)).toEqual({
        cause: "closed_by_peer",
        reason: "key_not_enrolled",
      });
      expect(messagesOf(home, "challenge")).toEqual([]);
    }
  });

  it("closes a revoked key as key_revoked", async () => {
    const test = await harness();
    const old = await enrolledKey(test);
    await enrolledKey(test);
    const home = connect(test);

    send(home, "hello", hello(old));

    expect(await closedWith(home)).toMatchObject({ reason: "key_revoked" });
  });

  it("closes a link whose version it does not accept as version_not_accepted", async () => {
    const test = await harness();
    const key = await enrolledKey(test);
    const home = connect(test);

    send(home, "hello", hello(key, 2));

    expect(await closedWith(home)).toMatchObject({
      reason: "version_not_accepted",
    });
  });

  it("closes a wrong signature as challenge_failed: another nonce, or another key", async () => {
    const test = await harness();
    const key = await enrolledKey(test);
    const other = await generateSigningKeyPair();

    for (const signature of [
      signChallenge(key.privateKey, "another-nonce"),
      signChallenge(other.privateKey, NONCE),
      "not-a-signature",
    ]) {
      const home = connect(test);
      send(home, "hello", hello(key));
      await frameOf(home, "challenge");
      send(home, "challenge_response", { signature });
      expect(await closedWith(home)).toMatchObject({
        reason: "challenge_failed",
      });
      expect(messagesOf(home, "hello_ok")).toEqual([]);
    }
    expect(test.intake.calls).toEqual([]);
  });

  it("closes a link that has not opened a session within 30 s", async () => {
    const test = await harness();
    const key = await enrolledKey(test);
    const silent = connect(test);
    const stalled = connect(test);
    send(stalled, "hello", hello(key));
    await frameOf(stalled, "challenge");

    await test.clock.advance(CORE_HANDSHAKE_TIMEOUT_MS - 1);
    await settle();
    expect(silent.link.closed).toBeUndefined();
    await test.clock.advance(1);

    for (const home of [silent, stalled]) {
      expect(await closedWith(home)).toMatchObject({
        reason: CORE_CLOSE_REASONS.handshakeTimeout,
      });
    }
  });

  it("closes a link that sends anything else before its session opens, keeping none of it", async () => {
    const test = await harness();
    const key = await enrolledKey(test);
    const early = connect(test);
    const malformed = connect(test);
    const doubled = connect(test);

    send(early, "inventory", inventory("m-1"));
    send(malformed, "hello", { ...hello(key), session_id: RING_NAME });
    send(doubled, "hello", hello(key));
    await frameOf(doubled, "challenge");
    send(doubled, "hello", hello(key));

    for (const home of [early, malformed, doubled]) {
      expect(await closedWith(home)).toMatchObject({
        reason: CORE_CLOSE_REASONS.messageRefused,
      });
    }
    expect(test.intake.calls).toEqual([]);
    expect(test.lines.join("\n")).not.toContain(RING_NAME);
  });

  it("closes as core_error on a step that fails unexpectedly, logging it once", async () => {
    const test = await harness();
    const key = await enrolledKey(test);
    const broken = new ConnectorLink({
      admin: new AdminManager({ settings: test.settings }),
      intake: test.intake,
      clock: test.clock,
      logger: test.logger,
      newNonce: () => {
        throw new Error("No randomness left.");
      },
    });
    stops.push(() => broken.stop());
    const pair = createLinkPair(test.logger);
    const home: Home = { pair, link: pair.dialer, frames: [] };
    broken.accept(pair.acceptor);

    send(home, "hello", hello(key));

    expect(await closedWith(home)).toMatchObject({
      reason: CORE_CLOSE_REASONS.coreError,
    });
    expect(
      test.lines.filter((line) =>
        line.includes("connector_link_session_failed"),
      ),
    ).toHaveLength(1);
  });

  it("closes an enroll as core_unavailable when the request cannot be recorded", async () => {
    const test = await harness();
    const { publicKey } = await generateSigningKeyPair();
    await test.layer.close();
    const home = connect(test);

    send(home, "enroll", { public_key: publicKey, code: CODE });

    expect(await closedWith(home)).toMatchObject({
      reason: CORE_CLOSE_REASONS.coreUnavailable,
    });
    expect(
      test.lines.some((line) => line.includes("connector_link_enroll_failed")),
    ).toBe(true);
  });

  it("closes as core_unavailable when the key cannot be checked, logging it once", async () => {
    const test = await harness();
    const key = await generateSigningKeyPair();
    await test.layer.close();
    const home = connect(test);

    send(home, "hello", hello(key));

    expect(await closedWith(home)).toMatchObject({
      reason: CORE_CLOSE_REASONS.coreUnavailable,
    });
    expect(
      test.lines.filter((line) =>
        line.includes("connector_link_key_check_failed"),
      ),
    ).toHaveLength(1);
  });
});

describe("ConnectorLink: the home's messages", () => {
  it("hands an inventory and a device change to Event in its own DTOs, and acks each after the commit", async () => {
    const test = await harness();
    const key = await enrolledKey(test);
    const home = connect(test);
    await openSession(home, key);
    test.intake.holding = true;

    send(home, "inventory", inventory("m-1"));
    await until(() => test.intake.calls.length === 2);
    await settle();
    expect(messagesOf(home, "ack")).toEqual([]);
    test.intake.release();
    expect(await frameOf(home, "ack")).toEqual({ message_id: "m-1" });

    send(home, "device_state", { ...deviceEntry(), message_id: "m-2" });
    expect(await frameOf(home, "ack", 2)).toEqual({ message_id: "m-2" });

    const asOf = Date.parse(AS_OF);
    expect(test.intake.calls.slice(1).map((call) => call.body)).toEqual([
      {
        message_id: "m-1",
        snapshot_version: 1,
        locations: [
          {
            location_id: "loc-1",
            name: "בית",
            time_zone: "Asia/Jerusalem",
            alarm_mode: "home",
            ownership: "owned",
            as_of: asOf,
            state_version: 2,
          },
        ],
        devices: [{ ...deviceEntry(), as_of: asOf }],
      },
      { message_id: "m-2", device: { ...deviceEntry(), as_of: asOf } },
    ]);
    expect(test.lines.join("\n")).not.toContain(RING_NAME);
  });

  it("does not ack a message whose commit failed, and logs the failure once by its message id", async () => {
    const test = await harness();
    const key = await enrolledKey(test);
    const home = connect(test);
    await openSession(home, key);
    test.intake.failNext(3);

    send(home, "inventory", inventory("m-1"));
    send(home, "device_state", { ...deviceEntry(), message_id: "m-2" });
    send(home, "heartbeat", heartbeat());
    send(home, "inventory", inventory("m-3"));

    expect(await frameOf(home, "ack")).toEqual({ message_id: "m-3" });
    expect(messagesOf(home, "ack")).toHaveLength(1);
    const failures = test.lines.filter((line) =>
      line.includes("connector_link_intake_failed"),
    );
    expect(failures).toHaveLength(3);
    expect(failures[0]).toContain('"message_id":"m-1"');
    expect(failures[1]).toContain('"message_id":"m-2"');
    expect(failures[2]).toContain('"message_type":"heartbeat"');
    expect(failures[2]).not.toContain("message_id");
    expect(home.link.closed).toBeUndefined();
  });

  it("takes one message at a time, in the order sent", async () => {
    const test = await harness();
    const key = await enrolledKey(test);
    const home = connect(test);
    await openSession(home, key);
    test.intake.holding = true;

    send(home, "inventory", inventory("m-1"));
    send(home, "device_state", { ...deviceEntry(), message_id: "m-2" });
    send(home, "heartbeat", heartbeat());
    await settle();
    expect(test.intake.methods()).toEqual(["homeSessionOpened", "inventory"]);

    test.intake.release();
    await until(() => test.intake.calls.length === 4);
    expect(test.intake.methods()).toEqual([
      "homeSessionOpened",
      "inventory",
      "deviceState",
      "heartbeat",
    ]);
    expect(messagesOf(home, "ack")).toEqual([
      { message_id: "m-1" },
      { message_id: "m-2" },
    ]);
  });

  it("hands a heartbeat to Event without an ack", async () => {
    const test = await harness();
    const key = await enrolledKey(test);
    const home = connect(test);
    await openSession(home, key);

    send(home, "heartbeat", heartbeat());

    await until(() => test.intake.calls.length === 2);
    expect(test.intake.calls[1]?.body).toEqual({
      ...heartbeat(),
      as_of: Date.parse(AS_OF),
      received_at: test.clock.now(),
    });
    await settle();
    expect(messagesOf(home, "ack")).toEqual([]);
  });

  it("stamps a heartbeat with the core's time as it arrives, though Event takes it minutes later (CP-14 review round 5)", async () => {
    const test = await harness();
    const key = await enrolledKey(test);
    const home = connect(test);
    await openSession(home, key);
    test.intake.holding = true;
    send(home, "inventory", inventory("m-1"));
    await until(() => test.intake.calls.length === 2);

    const arrivedAt = test.clock.now();
    send(home, "heartbeat", heartbeat());
    await settle();
    await test.clock.advance(3 * 60_000);
    test.intake.release();

    await until(() => test.intake.calls.length === 3);
    expect(test.intake.calls[2]?.body).toMatchObject({
      received_at: arrivedAt,
    });
  });

  it("in an open session, logs a message it does not accept and leaves it unacked, keeping the link", async () => {
    const test = await harness();
    const key = await enrolledKey(test);
    const home = connect(test);
    await openSession(home, key);

    send(home, "inventory", { ...inventory("m-1"), extra: RING_NAME });
    send(home, "hello", hello(key));
    send(home, "inventory", inventory("m-2"));

    expect(await frameOf(home, "ack")).toEqual({ message_id: "m-2" });
    expect(messagesOf(home, "ack")).toHaveLength(1);
    expect(home.link.closed).toBeUndefined();
    expect(
      test.lines.filter((line) =>
        line.includes("connector_link_message_refused"),
      ),
    ).toHaveLength(2);
    expect(test.lines.join("\n")).not.toContain(RING_NAME);
  });
});

describe("ConnectorLink: what Event decided (T018)", () => {
  it("acks a device change Event cannot place and asks the home for one inventory until it arrives", async () => {
    const test = await harness();
    const key = await enrolledKey(test);
    const home = connect(test);
    await openSession(home, key);
    test.intake.deviceOutcomes.push(
      "needs_inventory",
      "needs_inventory",
      "needs_inventory",
    );

    send(home, "device_state", { ...deviceEntry(), message_id: "m-1" });
    send(home, "device_state", { ...deviceEntry(), message_id: "m-2" });
    expect(await frameOf(home, "ack", 2)).toEqual({ message_id: "m-2" });
    expect(messagesOf(home, "inventory_request")).toHaveLength(1);

    send(home, "inventory", inventory("m-3"));
    await frameOf(home, "ack", 3);
    send(home, "device_state", { ...deviceEntry(), message_id: "m-4" });
    await frameOf(home, "ack", 4);

    expect(messagesOf(home, "inventory_request")).toHaveLength(2);
    expect(messagesOf(home, "inventory_request")[0]?.request_id).toEqual(
      expect.any(String),
    );
  });

  it("acks a change Event refuses, or one from a key no longer current, and logs each by its type", async () => {
    const test = await harness();
    const key = await enrolledKey(test);
    const home = connect(test);
    await openSession(home, key);
    test.intake.deviceOutcomes.push("refused", "not_current");
    test.intake.inventoryOutcome = { kind: "not_current" };

    send(home, "device_state", { ...deviceEntry(), message_id: "m-1" });
    send(home, "device_state", { ...deviceEntry(), message_id: "m-2" });
    send(home, "inventory", inventory("m-3"));

    expect(await frameOf(home, "ack", 3)).toEqual({ message_id: "m-3" });
    const log = test.lines.join("\n");
    expect(log).toContain("connector_link_change_refused");
    expect(log).toContain('"message_id":"m-1"');
    expect(
      test.lines.filter((line) => line.includes("connector_link_not_current")),
    ).toHaveLength(2);
    expect(messagesOf(home, "inventory_request")).toEqual([]);
  });

  it("logs how many inventory entries were left out or removed", async () => {
    const test = await harness();
    const key = await enrolledKey(test);
    const home = connect(test);
    await openSession(home, key);
    test.intake.inventoryOutcome = { kind: "applied", refused: 2, removed: 5 };

    send(home, "inventory", inventory("m-1"));

    await frameOf(home, "ack");
    const refused = test.lines.find((line) =>
      line.includes("connector_link_inventory_refused"),
    );
    const removed = test.lines.find((line) =>
      line.includes("connector_link_inventory_removed"),
    );
    expect(refused).toContain('"count":2');
    expect(removed).toContain('"count":5');
  });

  // CP-14 review round 3: an inventory carries the session it was composed for, and one State skips
  // as older is acked but answers no pending request, as the home's answer is a newer one.
  it("hands Event the session an inventory was composed for", async () => {
    const test = await harness();
    const key = await enrolledKey(test);
    const home = connect(test);
    await openSession(home, key);
    const composedFor = randomUUID();

    send(home, "inventory", { ...inventory("m-1"), session_id: composedFor });

    await frameOf(home, "ack");
    expect(test.intake.calls.at(-1)?.body).toMatchObject({
      snapshot_version: 1,
      session_id: composedFor,
    });
  });

  it("acks an inventory State skipped as older, still waiting for the answer to its request", async () => {
    const test = await harness();
    const key = await enrolledKey(test);
    const home = connect(test);
    await openSession(home, key);
    test.intake.deviceOutcomes.push(
      "needs_inventory",
      "needs_inventory",
      "needs_inventory",
    );

    send(home, "device_state", { ...deviceEntry(), message_id: "m-1" });
    await frameOf(home, "ack");
    test.intake.inventoryOutcome = { kind: "older" };
    send(home, "inventory", inventory("m-2"));
    await frameOf(home, "ack", 2);
    send(home, "device_state", { ...deviceEntry(), message_id: "m-3" });
    await frameOf(home, "ack", 3);
    expect(messagesOf(home, "inventory_request")).toHaveLength(1);

    test.intake.inventoryOutcome = { kind: "applied", refused: 0, removed: 0 };
    send(home, "inventory", inventory("m-4"));
    await frameOf(home, "ack", 4);
    send(home, "device_state", { ...deviceEntry(), message_id: "m-5" });
    await frameOf(home, "ack", 5);
    expect(messagesOf(home, "inventory_request")).toHaveLength(2);
  });
});

describe("ConnectorLink: enrollment", () => {
  it("holds an enroll request until the owner approves, says enrolled on the same link, then opens the session", async () => {
    const test = await harness();
    const key = await generateSigningKeyPair();
    const keyId = signingKeyId(key.publicKey);
    const home = connect(test);

    send(home, "enroll", { public_key: key.publicKey, code: CODE });
    await until(() => test.lines.join("\n").includes("enrollment_waiting"));
    await expect(test.settings.pendingEnrollment(never)).resolves.toMatchObject(
      { key_id: keyId, enrollment_code: CODE },
    );
    await test.clock.advance(5 * ENROLLMENT_POLL_MS);
    await settle();
    expect(messagesOf(home, "enrolled")).toEqual([]);

    await test.settings.approveEnrollment(keyId, never);
    await test.clock.advance(ENROLLMENT_POLL_MS);
    expect(await frameOf(home, "enrolled")).toEqual({ key_id: keyId });
    await openSession(home, key);
    expect(home.link.closed).toBeUndefined();
  });

  it("closes the waiting link when the request expires after 10 minutes", async () => {
    const test = await harness();
    const key = await generateSigningKeyPair();
    const home = connect(test);
    send(home, "enroll", { public_key: key.publicKey, code: CODE });
    await until(() => test.lines.join("\n").includes("enrollment_waiting"));

    await test.clock.advance(ENROLLMENT_TTL_MS - ENROLLMENT_POLL_MS);
    await settle();
    expect(home.link.closed).toBeUndefined();
    await test.clock.advance(ENROLLMENT_POLL_MS);

    expect(await closedWith(home)).toMatchObject({
      reason: CORE_CLOSE_REASONS.enrollmentExpired,
    });
  });

  it("says enrolled at once to an active key, and closes a revoked one as key_revoked", async () => {
    const test = await harness();
    const old = await enrolledKey(test);
    const active = await enrolledKey(test);
    const activeHome = connect(test);
    const oldHome = connect(test);

    send(activeHome, "enroll", { public_key: active.publicKey, code: CODE });
    send(oldHome, "enroll", { public_key: old.publicKey, code: CODE });

    expect(await frameOf(activeHome, "enrolled")).toEqual({
      key_id: signingKeyId(active.publicKey),
    });
    await openSession(activeHome, active);
    expect(await closedWith(oldHome)).toMatchObject({ reason: "key_revoked" });
  });

  it("lets a newer request replace the one waiting, closing the older link", async () => {
    const test = await harness();
    const first = connect(test);
    const second = connect(test);
    send(first, "enroll", {
      public_key: (await generateSigningKeyPair()).publicKey,
      code: CODE,
    });
    await until(() => test.lines.join("\n").includes("enrollment_waiting"));

    send(second, "enroll", {
      public_key: (await generateSigningKeyPair()).publicKey,
      code: "BBBB",
    });

    expect(await closedWith(first)).toMatchObject({
      reason: CORE_CLOSE_REASONS.enrollmentReplaced,
    });
    expect(second.link.closed).toBeUndefined();
    await expect(test.settings.pendingEnrollment(never)).resolves.toMatchObject(
      { enrollment_code: "BBBB" },
    );
  });

  it("refuses an enroll whose public key is not in its one spelling", async () => {
    const test = await harness();
    const { publicKey } = await generateSigningKeyPair();
    const alphabet =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const last = alphabet.charAt(alphabet.indexOf(publicKey.slice(-1)) ^ 1);
    const home = connect(test);

    send(home, "enroll", {
      public_key: `${publicKey.slice(0, -1)}${last}`,
      code: CODE,
    });

    expect(await closedWith(home)).toMatchObject({
      reason: CORE_CLOSE_REASONS.messageRefused,
    });
    await expect(
      test.settings.pendingEnrollment(never),
    ).resolves.toBeUndefined();
  });
});

/** Admin whose key checks wait until the test lets them go: a slow database. */
class HeldAdmin extends AdminManager {
  #release: (() => void) | undefined;
  #gate = new Promise<void>((resolve) => {
    this.#release = resolve;
  });

  release(): void {
    this.#release?.();
  }

  override async connectorKey(
    keyId: string,
    signal: AbortSignal,
  ): Promise<ConnectorKeyCheck> {
    await this.#gate;
    return super.connectorKey(keyId, signal);
  }
}

describe("ConnectorLink: across links", () => {
  it("keeps an enrolled home's session when a stranger asks to enroll afterwards (round 3)", async () => {
    const test = await harness();
    const key = await generateSigningKeyPair();
    const keyId = signingKeyId(key.publicKey);
    const home = connect(test);
    send(home, "enroll", { public_key: key.publicKey, code: CODE });
    await until(() => test.lines.join("\n").includes("enrollment_waiting"));
    await test.settings.approveEnrollment(keyId, never);
    await test.clock.advance(ENROLLMENT_POLL_MS);
    await frameOf(home, "enrolled");
    await openSession(home, key);

    const stranger = connect(test);
    send(stranger, "enroll", {
      public_key: (await generateSigningKeyPair()).publicKey,
      code: "BBBB",
    });
    await until(
      () =>
        test.lines.filter((line) => line.includes("enrollment_waiting"))
          .length === 2,
    );
    await settle();

    expect(home.link.closed).toBeUndefined();
    expect(stranger.link.closed).toBeUndefined();
    send(home, "inventory", inventory("m-1"));
    expect(await frameOf(home, "ack")).toEqual({ message_id: "m-1" });
  });

  it("closes a link that sends a second message before the core has answered the first, without queueing it (round 3)", async () => {
    const test = await harness();
    const key = await enrolledKey(test);
    const admin = new HeldAdmin({ settings: test.settings });
    const held = new ConnectorLink({
      admin,
      intake: test.intake,
      clock: test.clock,
      logger: test.logger,
      newNonce: () => NONCE,
    });
    stops.push(() => held.stop());
    const pair = createLinkPair(test.logger);
    const home: Home = { pair, link: pair.dialer, frames: [] };
    pair.dialer.onFrame((frame) => home.frames.push(frame));
    held.accept(pair.acceptor);

    send(home, "hello", hello(key));
    send(home, "inventory", inventory("m-1"));

    expect(await closedWith(home)).toMatchObject({
      reason: CORE_CLOSE_REASONS.messageRefused,
    });
    admin.release();
    await settle();
    expect(messagesOf(home, "challenge")).toEqual([]);
  });

  it(`closes an open session with more than ${String(MAX_PENDING_MESSAGES)} messages waiting for Event (round 3)`, async () => {
    const test = await harness();
    const key = await enrolledKey(test);
    const home = connect(test);
    await openSession(home, key);
    test.intake.holding = true;

    for (let sent = 0; sent < MAX_PENDING_MESSAGES; sent += 1) {
      send(home, "heartbeat", heartbeat());
    }
    await until(() => test.intake.calls.length === 2);
    await settle();
    expect(home.link.closed).toBeUndefined();

    send(home, "heartbeat", heartbeat());

    expect(await closedWith(home)).toMatchObject({
      reason: CORE_CLOSE_REASONS.tooManyMessages,
    });
    test.intake.release();
  });

  it("replaces an older session for the same key", async () => {
    const test = await harness();
    const key = await enrolledKey(test);
    const older = connect(test);
    await openSession(older, key);

    const newer = connect(test);
    await openSession(newer, key);

    expect(await closedWith(older)).toMatchObject({
      reason: CORE_CLOSE_REASONS.sessionReplaced,
    });
    send(newer, "inventory", inventory("m-1"));
    expect(await frameOf(newer, "ack")).toEqual({ message_id: "m-1" });
  });

  it("closes an open session as key_revoked within 15 s of the owner approving a newer key", async () => {
    const test = await harness();
    const old = await enrolledKey(test);
    const home = connect(test);
    await openSession(home, old);

    await enrolledKey(test);
    await test.clock.advance(KEY_RECHECK_MS);

    expect(await closedWith(home)).toMatchObject({ reason: "key_revoked" });
  });

  it("keeps an open session when the key cannot be rechecked", async () => {
    const test = await harness();
    const key = await enrolledKey(test);
    const home = connect(test);
    await openSession(home, key);
    await test.layer.close();

    await test.clock.advance(3 * KEY_RECHECK_MS);
    await settle();

    expect(home.link.closed).toBeUndefined();
    expect(
      test.lines.filter((line) =>
        line.includes("connector_link_key_check_failed"),
      ),
    ).toHaveLength(1);
  });

  it(`refuses more than ${String(MAX_UNPROVEN_LINKS)} links that have not proved a key`, async () => {
    const test = await harness();
    const key = await enrolledKey(test);
    const proven = connect(test);
    await openSession(proven, key);
    const unproven = Array.from({ length: MAX_UNPROVEN_LINKS }, () =>
      connect(test),
    );

    const refused = connect(test);

    expect(await closedWith(refused)).toMatchObject({
      reason: CORE_CLOSE_REASONS.tooManyLinks,
    });
    expect(unproven.every((home) => home.link.closed === undefined)).toBe(true);
    expect(test.connectorLink.linkCount).toBe(MAX_UNPROVEN_LINKS + 1);
  });

  it("closes every link as core_stopping, and refuses new ones after", async () => {
    const test = await harness();
    const key = await enrolledKey(test);
    const open = connect(test);
    await openSession(open, key);
    const waiting = connect(test);

    await test.connectorLink.stop();
    const late = connect(test);

    for (const home of [open, waiting, late]) {
      expect(await closedWith(home)).toMatchObject({
        reason: CORE_CLOSE_REASONS.coreStopping,
      });
    }
    expect(test.connectorLink.linkCount).toBe(0);
  });

  it("never throws from accept: a failure is logged and the link closed", async () => {
    const test = await harness();
    const closedWithReasons: string[] = [];
    const broken: LinkConnection = {
      send: () => Promise.resolve("closed"),
      sendChunk: () => Promise.resolve("closed"),
      onFrame: () => {
        throw new Error("The transport broke.");
      },
      onClose: () => () => undefined,
      close: (reason) => {
        closedWithReasons.push(reason);
      },
      closed: undefined,
    };

    expect(() => {
      test.connectorLink.accept(broken);
    }).not.toThrow();
    expect(closedWithReasons).toEqual([CORE_CLOSE_REASONS.coreError]);
    expect(test.lines.join("\n")).toContain("connector_link_accept_failed");
  });
});

/**
 * Admin whose next check of one key reads at once but answers only when the test lets it go: a
 * pooled database connection that read the key before the owner's approval and answers after it.
 */
class LateAnswerAdmin extends AdminManager {
  #heldKey: string | undefined;
  #release: (() => void) | undefined;

  get holding(): boolean {
    return this.#release !== undefined;
  }

  holdNextCheckOf(keyId: string): void {
    this.#heldKey = keyId;
  }

  release(): void {
    this.#release?.();
  }

  override async connectorKey(
    keyId: string,
    signal: AbortSignal,
  ): Promise<ConnectorKeyCheck> {
    const read = await super.connectorKey(keyId, signal);
    if (keyId !== this.#heldKey) {
      return read;
    }
    this.#heldKey = undefined;
    await new Promise<void>((resolve) => {
      this.#release = resolve;
    });
    return read;
  }
}

describe("ConnectorLink after CP-14 review round 4", () => {
  it("lets a newer key's session claim State last when an older key's last check answers late", async () => {
    const test = await harness();
    const admin = new LateAnswerAdmin({ settings: test.settings });
    const connectorLink = new ConnectorLink({
      admin,
      intake: test.intake,
      clock: test.clock,
      logger: test.logger,
      newNonce: () => NONCE,
    });
    stops.push(() => connectorLink.stop());
    const older = await enrolledKey(test);
    const olderHome = connect(test, connectorLink);
    send(olderHome, "hello", hello(older));
    const challenge = await frameOf(olderHome, "challenge");
    admin.holdNextCheckOf(signingKeyId(older.publicKey));
    send(olderHome, "challenge_response", {
      signature: signChallenge(older.privateKey, String(challenge.nonce)),
    });
    await until(() => admin.holding);

    const newer = await enrolledKey(test);
    const newerHome = connect(test, connectorLink);
    send(newerHome, "hello", hello(newer));
    const newerChallenge = await frameOf(newerHome, "challenge");
    send(newerHome, "challenge_response", {
      signature: signChallenge(newer.privateKey, String(newerChallenge.nonce)),
    });
    await settle();
    admin.release();
    await frameOf(newerHome, "hello_ok");

    expect(test.intake.calls.map((call) => call.session.key_id)).toEqual([
      signingKeyId(older.publicKey),
      signingKeyId(newer.publicKey),
    ]);
    await test.clock.advance(KEY_RECHECK_MS);
    expect(await closedWith(olderHome)).toMatchObject({
      reason: "key_revoked",
    });
    expect(newerHome.link.closed).toBeUndefined();
  });
});

describe("ConnectorLink: a link closed before its session (T027)", () => {
  it("leaves no handshake timer behind for a link that closed before it was accepted", async () => {
    const test = await harness();
    const pair = createLinkPair(test.logger);
    pair.dialer.close("connector_stopping");
    await settle();

    test.connectorLink.accept(pair.acceptor);
    await settle();

    expect(pair.acceptor.closed).toBeDefined();
    expect(test.clock.pendingTimers).toBe(0);
  });
});
