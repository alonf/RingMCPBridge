// Delivery (T048) against a stub receiver, on the fake clock: subscribing with verification, what
// is pushed (HIGH and MEDIUM, never LOW or late), the Standard Webhooks signature, retries with
// the same event id and a fresh signature, 410 and 413, one subscription never holding another,
// expiry, and a log of identifiers and the delay only.
import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  DELIVERY_KEY_NAME,
  DeliveryKeySource,
  SubscriptionsStore,
} from "../../access/subscriptions/index.ts";
import type { CoreSecrets, SecretLookup } from "../../access/secrets/index.ts";
import type { StoredEvent } from "../../access/event-log/index.ts";
import { FakeClock } from "../../../utilities/clock/index.ts";
import { Logger } from "../../../utilities/logging/index.ts";
import {
  CORE_MIGRATIONS,
  openSqliteQueryLayer,
  runMigrations,
} from "../../../utilities/query-layer/index.ts";
import {
  generateSealingKey,
  Secret,
} from "../../../utilities/security/index.ts";
import {
  CallbackError,
  Delivery,
  DeliveryError,
  RETRY_DELAYS_MS,
  SUBSCRIPTION_TTL_MS,
} from "./index.ts";
import type {
  CallbackRequest,
  CallbackResponse,
  SubscribeRequest,
} from "./index.ts";

const START = Date.UTC(2026, 10, 18, 9, 0, 0);
const HOST = "connectors.api.openai.com";
const KEY = Buffer.alloc(32, 7);
const SECRET = `whsec_${KEY.toString("base64")}`;
const DOOR_NAME = "דלת כניסה";
const never = new AbortController().signal;

type Answer = (
  request: CallbackRequest,
  signal: AbortSignal,
) => Promise<CallbackResponse>;

function echo(request: CallbackRequest): Promise<CallbackResponse> {
  const body = JSON.parse(request.body) as {
    type?: string;
    challenge?: string;
  };
  return Promise.resolve(
    body.type === "verification"
      ? { status: 200, body: JSON.stringify({ challenge: body.challenge }) }
      : { status: 200, body: "" },
  );
}

class MemorySecrets implements CoreSecrets {
  readonly values = new Map<string, string>([
    [DELIVERY_KEY_NAME, Buffer.from(generateSealingKey()).toString("base64")],
  ]);

  read(name: string): Promise<SecretLookup> {
    const value = this.values.get(name);
    return Promise.resolve(
      value === undefined
        ? { kind: "missing" }
        : { kind: "found", value: new Secret(value) },
    );
  }

  write(name: string, value: Secret<string>): Promise<void> {
    this.values.set(name, value.reveal());
    return Promise.resolve();
  }
}

interface Harness {
  readonly clock: FakeClock;
  readonly delivery: Delivery;
  readonly sent: CallbackRequest[];
  readonly lines: string[];
  /** How each callback, by its path, answers; `echo` unless a test says otherwise. */
  readonly answers: Map<string, Answer>;
  /** The locations State holds as owned; `loc-1` unless a test changes it. */
  readonly owned: Set<string>;
  /** The clients no longer allowed, as a revoked or unlisted agent's are. */
  readonly disallowed: Set<string>;
  subscribe(path: string, changes?: Partial<SubscribeRequest>): Promise<string>;
  eventsTo(path: string): CallbackRequest[];
}

const stops: (() => Promise<void>)[] = [];

afterEach(async () => {
  for (const stop of stops.splice(0).reverse()) {
    await stop();
  }
});

async function harness(): Promise<Harness> {
  const clock = new FakeClock(START);
  const layer = openSqliteQueryLayer(":memory:", { clock });
  await runMigrations(layer, CORE_MIGRATIONS, { clock }, never);
  const lines: string[] = [];
  const sent: CallbackRequest[] = [];
  const answers = new Map<string, Answer>();
  const owned = new Set(["loc-1"]);
  const disallowed = new Set<string>();
  const delivery = new Delivery({
    subscriptions: new SubscriptionsStore({
      store: layer,
      key: new DeliveryKeySource({ secrets: new MemorySecrets() }),
      clock,
    }),
    transport: (request, signal) => {
      sent.push(request);
      return (answers.get(request.url.pathname) ?? echo)(request, signal);
    },
    allowedHosts: [HOST],
    deviceLabel: (deviceId) =>
      Promise.resolve(
        deviceId === "d-door" ? { name: DOOR_NAME, room: "Hall" } : undefined,
      ),
    // As the core decides (core-service.ts): any kind from an owned location, and from the shared
    // one only its alarm (T063).
    pushedFrom: (locationId, kind) =>
      Promise.resolve(
        owned.has(locationId) ||
          (locationId === "loc-shared" && kind === "alarm.triggered"),
      ),
    clientAllowed: (clientId) => Promise.resolve(!disallowed.has(clientId)),
    clock,
    logger: new Logger({
      sink: (line) => lines.push(line),
      now: () => clock.now(),
      minLevel: "debug",
    }),
  });
  stops.push(async () => {
    await delivery.stop();
    await layer.close();
  });
  return {
    clock,
    delivery,
    sent,
    lines,
    answers,
    owned,
    disallowed,
    subscribe: async (path, changes = {}) =>
      (
        await delivery.subscribe(
          {
            clientId: `client-${path}`,
            name: "ring.event",
            mode: "webhook",
            url: `https://${HOST}${path}`,
            secret: new Secret(SECRET),
            ...changes,
          },
          never,
        )
      ).id,
    eventsTo: (path) =>
      sent.filter(
        (request) =>
          request.url.pathname === path &&
          !request.body.includes('"verification"'),
      ),
  };
}

function stored(changes: Partial<StoredEvent> = {}): StoredEvent {
  return {
    event_id: "7400000000000000001",
    location_id: "loc-1",
    seq: 1,
    kind: "doorbell.ding",
    priority: "HIGH",
    occurred_at: START - 1_500,
    received_at: START - 1_000,
    stored_at: START - 500,
    device_id: "d-door",
    summary: `The doorbell ${DOOR_NAME} was pressed.`,
    late: false,
    ...changes,
  };
}

function signatureOf(request: CallbackRequest): string {
  const signed = `${request.headers["webhook-id"] ?? ""}.${
    request.headers["webhook-timestamp"] ?? ""
  }.${request.body}`;
  return `v1,${createHmac("sha256", KEY).update(signed).digest("base64")}`;
}

async function settle(): Promise<void> {
  for (let round = 0; round < 20; round += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

describe("Delivery: subscribing", () => {
  it("verifies the callback with a signed challenge, then stores the subscription for a day", async () => {
    const test = await harness();

    const answer = await test.delivery.subscribe(
      {
        clientId: "client-1",
        name: "ring.event",
        mode: "webhook",
        url: `https://${HOST}/hook`,
        secret: new Secret(SECRET),
      },
      never,
    );

    expect(answer.refreshBefore).toBe(
      new Date(START + SUBSCRIPTION_TTL_MS).toISOString(),
    );
    const [verification] = test.sent;
    expect(verification?.headers["webhook-signature"]).toBe(
      verification === undefined ? "" : signatureOf(verification),
    );
    expect(verification?.headers["x-mcp-subscription-id"]).toBeDefined();
  });

  it("carries one subscription id in the verification, the answer and every delivery", async () => {
    const test = await harness();

    const id = await test.subscribe("/hook");
    test.delivery.eventStored({ event: stored(), epoch: 1 });
    await expect.poll(() => test.eventsTo("/hook").length).toBe(1);

    const ids = test.sent.map(
      (request) => request.headers["x-mcp-subscription-id"],
    );
    expect(ids).toEqual([id, id]);
  });

  it.each([
    [{ ttlMs: 600_000 }, 600_000],
    [{ ttlMs: 1_000 }, 60_000],
    [{ ttlMs: null }, SUBSCRIPTION_TTL_MS],
    [{ ttlMs: 10 * SUBSCRIPTION_TTL_MS }, SUBSCRIPTION_TTL_MS],
  ])("grants %o as %i ms", async (changes, granted) => {
    const test = await harness();
    const delivery = test.delivery;

    const answer = await delivery.subscribe(
      {
        clientId: "client-1",
        name: "ring.event",
        mode: "webhook",
        url: `https://${HOST}/hook`,
        secret: new Secret(SECRET),
        ...changes,
      },
      never,
    );

    expect(answer.refreshBefore).toBe(new Date(START + granted).toISOString());
  });

  it.each([
    ["another event type", { name: "doorbell" }, "unknown_event"],
    ["another delivery mode", { mode: "poll" }, "unsupported_mode"],
    [
      "a callback on another host",
      { url: "https://hooks.example.test/h" },
      "callback_not_allowed",
    ],
    [
      "a callback without TLS",
      { url: `http://${HOST}/h` },
      "callback_not_allowed",
    ],
    [
      "a callback on another port",
      { url: `https://${HOST}:8443/h` },
      "callback_not_allowed",
    ],
    ["a secret in another form", { secret: new Secret("plain") }, "bad_secret"],
  ])("refuses %s, sending nothing", async (_title, changes, reason) => {
    const test = await harness();

    const error: unknown = await test
      .subscribe("/hook", changes as Partial<SubscribeRequest>)
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(DeliveryError);
    expect(error).toMatchObject({ kind: "invalid", reason });
    expect(test.sent).toHaveLength(0);
  });

  it.each([
    [
      "answers with another challenge",
      (): Promise<CallbackResponse> =>
        Promise.resolve({ status: 200, body: '{"challenge":"x"}' }),
      "challenge_failed",
    ],
    [
      "times out",
      (): Promise<CallbackResponse> =>
        Promise.reject(new CallbackError("timeout")),
      "timeout",
    ],
    [
      "cannot be reached",
      (): Promise<CallbackResponse> =>
        Promise.reject(new CallbackError("unreachable")),
      "unreachable",
    ],
  ])(
    "refuses a callback that %s, storing nothing",
    async (_title, answer, reason) => {
      const test = await harness();
      test.answers.set("/hook", answer);

      const error: unknown = await test
        .subscribe("/hook")
        .catch((thrown: unknown) => thrown);

      expect(error).toMatchObject({ kind: "callback_failed", reason });
      test.delivery.eventStored({ event: stored(), epoch: 1 });
      await settle();
      expect(test.eventsTo("/hook")).toHaveLength(0);
    },
  );
});

describe("Delivery: pushing events", () => {
  it("pushes a HIGH event to the callback, signed, with the contract's event and the device's name", async () => {
    const test = await harness();
    await test.subscribe("/hook");

    test.delivery.eventStored({ event: stored(), epoch: 1 });

    await expect.poll(() => test.eventsTo("/hook").length).toBe(1);
    const [webhook] = test.eventsTo("/hook");
    expect(webhook?.headers["webhook-id"]).toBe("7400000000000000001");
    expect(webhook?.headers["webhook-signature"]).toBe(
      webhook === undefined ? "" : signatureOf(webhook),
    );
    expect(JSON.parse(webhook?.body ?? "{}")).toMatchObject({
      eventId: "7400000000000000001",
      name: "ring.event",
      cursor: null,
      data: {
        event_id: "7400000000000000001",
        seq: 1,
        priority: "HIGH",
        kind: "doorbell.ding",
        device: { id: "d-door", name: DOOR_NAME, room: "Hall" },
      },
    });
    await expect
      .poll(() =>
        test.lines.find(
          (line) =>
            line.includes('"outcome":"accepted"') &&
            line.includes("delivery_webhook"),
        ),
      )
      .toContain('"delay_ms":1500');
    const logged = test.lines.join("\n");
    expect(logged).not.toContain(DOOR_NAME);
    expect(logged).not.toContain("/hook");
    expect(logged).not.toContain("client-/hook");
  });

  it.each([
    ["a LOW event", { priority: "LOW" as const }],
    ["a late event", { late: true }],
  ])("does not push %s", async (_title, changes) => {
    const test = await harness();
    await test.subscribe("/hook");

    test.delivery.eventStored({ event: stored(changes), epoch: 1 });
    await settle();

    expect(test.eventsTo("/hook")).toHaveLength(0);
  });

  it("pushes a MEDIUM event", async () => {
    const test = await harness();
    await test.subscribe("/hook");

    test.delivery.eventStored({
      event: stored({ priority: "MEDIUM", kind: "motion" }),
      epoch: 1,
    });

    await expect.poll(() => test.eventsTo("/hook").length).toBe(1);
  });

  it("tries a receiver that times out again, with the same event id and a fresh signature, until it accepts", async () => {
    const test = await harness();
    await test.subscribe("/hook");
    let calls = 0;
    test.answers.set("/hook", (request) => {
      calls += 1;
      return calls <= 2
        ? Promise.reject(new CallbackError("timeout"))
        : echo(request);
    });

    test.delivery.eventStored({ event: stored(), epoch: 1 });
    await expect.poll(() => test.eventsTo("/hook").length).toBe(1);
    await test.clock.advance(RETRY_DELAYS_MS[0] ?? 0);
    await expect.poll(() => test.eventsTo("/hook").length).toBe(2);
    await test.clock.advance(RETRY_DELAYS_MS[1] ?? 0);
    await expect.poll(() => test.eventsTo("/hook").length).toBe(3);

    const attempts = test.eventsTo("/hook");
    expect(new Set(attempts.map((r) => r.headers["webhook-id"]))).toEqual(
      new Set(["7400000000000000001"]),
    );
    expect(attempts[2]?.headers["webhook-timestamp"]).not.toBe(
      attempts[0]?.headers["webhook-timestamp"],
    );
    for (const attempt of attempts) {
      expect(attempt.headers["webhook-signature"]).toBe(signatureOf(attempt));
    }
    await test.clock.advance(60_000);
    expect(test.eventsTo("/hook")).toHaveLength(3);
  });

  it("gives up after its last retry", async () => {
    const test = await harness();
    await test.subscribe("/hook");
    test.answers.set("/hook", () => Promise.resolve({ status: 503, body: "" }));

    test.delivery.eventStored({ event: stored(), epoch: 1 });
    for (const wait of RETRY_DELAYS_MS) {
      await expect.poll(() => test.eventsTo("/hook").length).toBeGreaterThan(0);
      await test.clock.advance(wait);
    }
    await test.clock.advance(60_000);

    await expect
      .poll(() => test.eventsTo("/hook").length)
      .toBe(RETRY_DELAYS_MS.length + 1);
  });

  it("ends a subscription whose callback answers 410, and does not try a 413 again", async () => {
    const test = await harness();
    await test.subscribe("/gone");
    await test.subscribe("/large");
    test.answers.set("/gone", () => Promise.resolve({ status: 410, body: "" }));
    test.answers.set("/large", () =>
      Promise.resolve({ status: 413, body: "" }),
    );

    test.delivery.eventStored({ event: stored(), epoch: 1 });
    await expect.poll(() => test.eventsTo("/large").length).toBe(1);
    await test.clock.advance(60_000);
    test.delivery.eventStored({
      event: stored({ event_id: "e-2", seq: 2 }),
      epoch: 1,
    });
    await expect.poll(() => test.eventsTo("/large").length).toBe(2);

    expect(test.eventsTo("/gone")).toHaveLength(1);
    expect(test.eventsTo("/large")).toHaveLength(2);
  });

  it("never lets one slow callback hold another, or the next event", async () => {
    const test = await harness();
    await test.subscribe("/slow");
    await test.subscribe("/fast");
    // As the real transport does, it settles only when its time limit or Delivery's stop ends it.
    test.answers.set(
      "/slow",
      (_request, signal) =>
        new Promise<never>((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            reject(new CallbackError("unreachable"));
          });
        }),
    );

    test.delivery.eventStored({ event: stored(), epoch: 1 });
    test.delivery.eventStored({
      event: stored({ event_id: "e-2", seq: 2 }),
      epoch: 1,
    });

    await expect.poll(() => test.eventsTo("/fast").length).toBe(2);
  });

  it("sends nothing to a subscription after its expiry", async () => {
    const test = await harness();
    await test.subscribe("/hook", { ttlMs: 60_000 });

    await test.clock.advance(60_000);
    test.delivery.eventStored({ event: stored(), epoch: 1 });
    await settle();

    expect(test.eventsTo("/hook")).toHaveLength(0);
  });

  // T050's review (DRIFT-002-19): shared locations stay off for push as for reads (FR-036, US8),
  // and a location State does not hold is not pushed: the check fails closed.
  it("does not push an event from a shared location, nor from one State does not hold", async () => {
    const test = await harness();
    await test.subscribe("/hook");

    test.delivery.eventStored({
      event: stored({ location_id: "loc-shared" }),
      epoch: 1,
    });
    test.owned.delete("loc-1");
    test.delivery.eventStored({ event: stored({ event_id: "e-2" }), epoch: 1 });
    await settle();

    expect(test.eventsTo("/hook")).toHaveLength(0);
    expect(test.lines.join("\n")).toContain('"outcome":"location_not_pushed"');
  });

  // T063: the location rule is asked with the event's kind, so a shared home's alarm goes out.
  it("pushes a shared home's event of a kind the location rule allows", async () => {
    const test = await harness();
    await test.subscribe("/hook");

    test.delivery.eventStored({
      event: stored({
        event_id: "alarm-1",
        location_id: "loc-shared",
        kind: "alarm.triggered",
        summary: "The burglar alarm is going off.",
      }),
      epoch: 1,
    });
    await settle();

    expect(test.eventsTo("/hook")).toHaveLength(1);
  });

  // T050's review (DRIFT-002-19): revoking or unlisting an agent ends its deliveries at once.
  it("sends nothing to a client that is no longer allowed", async () => {
    const test = await harness();
    await test.subscribe("/revoked");
    await test.subscribe("/kept");
    test.disallowed.add("client-/revoked");

    test.delivery.eventStored({ event: stored(), epoch: 1 });

    await expect.poll(() => test.eventsTo("/kept").length).toBe(1);
    expect(test.eventsTo("/revoked")).toHaveLength(0);
  });

  it("stops retrying a client that is no longer allowed during the wait", async () => {
    const test = await harness();
    await test.subscribe("/hook");
    test.answers.set("/hook", () => Promise.resolve({ status: 503, body: "" }));

    test.delivery.eventStored({ event: stored(), epoch: 1 });
    await expect.poll(() => test.eventsTo("/hook").length).toBe(1);
    test.disallowed.add("client-/hook");
    await test.clock.advance(60_000);
    await settle();

    expect(test.eventsTo("/hook")).toHaveLength(1);
  });

  // T050's review (DRIFT-002-19): nothing is delivered after a subscription ends, retries included.
  it("stops retrying when the subscription is ended during the wait", async () => {
    const test = await harness();
    const id = await test.subscribe("/hook");
    test.answers.set("/hook", () => Promise.resolve({ status: 503, body: "" }));

    test.delivery.eventStored({ event: stored(), epoch: 1 });
    await expect.poll(() => test.eventsTo("/hook").length).toBe(1);
    await test.delivery.unsubscribe("client-/hook", id, never);
    await test.clock.advance(60_000);
    await settle();

    expect(test.eventsTo("/hook")).toHaveLength(1);
  });

  it("stops retrying when the subscription expires during the wait", async () => {
    const test = await harness();
    await test.subscribe("/hook", { ttlMs: 60_000 });
    test.answers.set("/hook", () => Promise.resolve({ status: 503, body: "" }));
    await test.clock.advance(59_500);

    test.delivery.eventStored({ event: stored(), epoch: 1 });
    await expect.poll(() => test.eventsTo("/hook").length).toBe(1);
    await test.clock.advance(60_000);
    await settle();

    expect(test.eventsTo("/hook")).toHaveLength(1);
  });

  it("ends a client's subscription on unsubscribe", async () => {
    const test = await harness();
    const id = await test.subscribe("/hook");

    await test.delivery.unsubscribe("client-/hook", id, never);
    test.delivery.eventStored({ event: stored(), epoch: 1 });
    await settle();

    expect(test.eventsTo("/hook")).toHaveLength(0);
  });
});
