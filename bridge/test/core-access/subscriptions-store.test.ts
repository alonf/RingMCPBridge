// Subscriptions (T048) on SQLite and on SQL Server: a subscription is stored sealed, so the row
// holds neither its callback nor its secret; a renewal updates the same row; only unexpired rows
// are active; a client ends only its own; a row that does not open is skipped; and nothing is
// stored while the delivery key is not set.
import { expect, it } from "vitest";
import type {
  CoreSecrets,
  SecretLookup,
} from "../../src/core/access/secrets/index.ts";
import {
  DELIVERY_KEY_NAME,
  DeliveryKeySource,
  SubscriptionsError,
  SubscriptionsStore,
} from "../../src/core/access/subscriptions/index.ts";
import type { NewSubscription } from "../../src/core/access/subscriptions/index.ts";
import { FakeClock } from "../../src/utilities/clock/index.ts";
import {
  CORE_MIGRATIONS,
  runMigrations,
} from "../../src/utilities/query-layer/index.ts";
import type { QueryLayer } from "../../src/utilities/query-layer/index.ts";
import {
  generateSealingKey,
  Secret,
} from "../../src/utilities/security/index.ts";
import { describeStoreMatrix, requireSqlServerInCi } from "../support/index.ts";

const START = Date.UTC(2026, 10, 18, 9, 0, 0);
const HOUR_MS = 3_600_000;
const CALLBACK = new URL(
  "https://connectors.api.openai.com/hooks/private-path-1",
);
const SIGNING_KEY = new Uint8Array(32).fill(7);

function never(): AbortSignal {
  return new AbortController().signal;
}

/** The core's secrets in memory, holding a delivery key unless a test removes it. */
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

function subscription(changes: Partial<NewSubscription> = {}): NewSubscription {
  return {
    client_id: "https://chatgpt.example.test/client.json",
    event_name: "ring.event",
    callback: CALLBACK,
    signing_key: new Secret(SIGNING_KEY),
    expires_at: START + HOUR_MS,
    ...changes,
  };
}

requireSqlServerInCi();

describeStoreMatrix("Subscriptions", (store) => {
  async function setUp(secrets = new MemorySecrets()): Promise<{
    layer: QueryLayer;
    clock: FakeClock;
    subscriptions: SubscriptionsStore;
    secrets: MemorySecrets;
  }> {
    const clock = new FakeClock(START);
    const layer = await store.emptyDatabase();
    await runMigrations(layer, CORE_MIGRATIONS, { clock }, never());
    const key = new DeliveryKeySource({ secrets });
    return {
      layer,
      clock,
      secrets,
      subscriptions: new SubscriptionsStore({ store: layer, key, clock }),
    };
  }

  it("stores a subscription sealed, and opens it again for delivery", async () => {
    const test = await setUp();

    const id = await test.subscriptions.save(subscription(), never());

    const [active] = await test.subscriptions.active("ring.event", never());
    expect(active).toMatchObject({
      sub_id: id,
      client_id: "https://chatgpt.example.test/client.json",
      event_name: "ring.event",
      expires_at: START + HOUR_MS,
    });
    expect(active?.callback.href).toBe(CALLBACK.href);
    expect(active?.signing_key.reveal()).toEqual(SIGNING_KEY);
    const rows = await test.layer.all(
      { sql: "SELECT delivery FROM webhook_subscription", params: {} },
      never(),
    );
    const raw = Buffer.from(rows[0]?.delivery as Uint8Array).toString("latin1");
    expect(raw).not.toContain("private-path-1");
    expect(raw).not.toContain(Buffer.from(SIGNING_KEY).toString("base64"));
  });

  it("updates the same row when the same subscription is renewed", async () => {
    const test = await setUp();
    const first = await test.subscriptions.save(subscription(), never());

    const renewed = await test.subscriptions.save(
      subscription({ expires_at: START + 2 * HOUR_MS }),
      never(),
    );

    expect(renewed).toBe(first);
    await expect(
      test.subscriptions.active("ring.event", never()),
    ).resolves.toMatchObject([{ expires_at: START + 2 * HOUR_MS }]);
  });

  it("keeps a subscription active only until its expiry, and purges it after", async () => {
    const test = await setUp();
    await test.subscriptions.save(subscription(), never());

    await test.clock.advance(HOUR_MS);

    await expect(
      test.subscriptions.active("ring.event", never()),
    ).resolves.toEqual([]);
    await expect(test.subscriptions.purgeExpired(never())).resolves.toBe(1);
  });

  it("ends a client's own subscription only, twice without complaint, and forgets a gone one", async () => {
    const test = await setUp();
    const id = await test.subscriptions.save(subscription(), never());
    const other = await test.subscriptions.save(
      subscription({ client_id: "other-client" }),
      never(),
    );

    await test.subscriptions.remove(id, "other-client", never());
    expect(await test.subscriptions.active("ring.event", never())).toHaveLength(
      2,
    );
    await test.subscriptions.remove(
      id,
      "https://chatgpt.example.test/client.json",
      never(),
    );
    await test.subscriptions.remove(
      id,
      "https://chatgpt.example.test/client.json",
      never(),
    );
    await test.subscriptions.forget(other, never());

    await expect(
      test.subscriptions.active("ring.event", never()),
    ).resolves.toEqual([]);
  });

  it("skips a row that does not open with the key, as after the key was replaced", async () => {
    const test = await setUp();
    await test.subscriptions.save(subscription(), never());
    const replaced = new MemorySecrets();
    const other = new SubscriptionsStore({
      store: test.layer,
      key: new DeliveryKeySource({ secrets: replaced }),
      clock: test.clock,
    });

    await expect(other.active("ring.event", never())).resolves.toEqual([]);
  });

  it("stores nothing, and says why, while the delivery key is not set", async () => {
    const secrets = new MemorySecrets();
    secrets.values.clear();
    const test = await setUp(secrets);

    const error: unknown = await test.subscriptions
      .save(subscription(), never())
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(SubscriptionsError);
    expect(error).toMatchObject({ kind: "not_set_up" });
    await expect(
      test.subscriptions.active("ring.event", never()),
    ).resolves.toEqual([]);
  });
});
