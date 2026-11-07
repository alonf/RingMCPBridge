// Settings (T022) on SQLite and on SQL Server: the agent listing seeded from configuration, the
// enrollment keys (SC2, PT-32, FR-032) and the battery threshold.
import { expect, it } from "vitest";
import {
  ENROLLMENT_REQUEST_TTL_MS,
  SettingsStore,
  SettingsStoreError,
} from "../../src/core/access/settings/index.ts";
import type {
  AgentSeed,
  SettingsStoreErrorKind,
} from "../../src/core/access/settings/index.ts";
import { FakeClock } from "../../src/utilities/clock/index.ts";
import {
  CORE_MIGRATIONS,
  runMigrations,
} from "../../src/utilities/query-layer/index.ts";
import type {
  QueryLayer,
  SqlParams,
} from "../../src/utilities/query-layer/index.ts";
import {
  generateSigningKeyPair,
  signingKeyId,
} from "../../src/utilities/security/index.ts";
import type { PublicSigningKey } from "../../src/utilities/security/index.ts";
import { describeStoreMatrix, requireSqlServerInCi } from "../support/index.ts";

const START = Date.UTC(2026, 10, 7, 9, 0, 0);
const DEFAULT_THRESHOLD = 25;

const CHAT_AGENT: AgentSeed = {
  clientId: "https://chat.example/client.json",
  platform: "Chat",
  scopes: ["read"],
  redirectUris: ["https://chat.example/callback"],
};
const RELAY: AgentSeed = {
  clientId: "desktop-relay",
  scopes: ["read"],
  redirectUris: ["http://127.0.0.1/callback"],
};

function never(): AbortSignal {
  return new AbortController().signal;
}

async function newKey(): Promise<PublicSigningKey> {
  return (await generateSigningKeyPair()).publicKey;
}

async function failureOf(work: Promise<unknown>): Promise<unknown> {
  try {
    await work;
  } catch (error) {
    return error;
  }
  throw new Error("expected the work to fail");
}

async function expectStoreError(
  work: Promise<unknown>,
  kind: SettingsStoreErrorKind,
): Promise<SettingsStoreError> {
  const error = await failureOf(work);
  if (!(error instanceof SettingsStoreError)) {
    throw new Error("expected a SettingsStoreError", { cause: error });
  }
  expect(error.kind).toBe(kind);
  return error;
}

requireSqlServerInCi();

describeStoreMatrix("Settings", (store) => {
  async function setUp(): Promise<{
    settings: SettingsStore;
    layer: QueryLayer;
    clock: FakeClock;
  }> {
    const clock = new FakeClock(START);
    const layer = await store.emptyDatabase();
    await runMigrations(layer, CORE_MIGRATIONS, { clock }, never());
    const settings = new SettingsStore({
      store: layer,
      clock,
      defaultBatteryThresholdPct: DEFAULT_THRESHOLD,
    });
    return { settings, layer, clock };
  }

  async function exec(
    layer: QueryLayer,
    sql: string,
    params: SqlParams = {},
  ): Promise<void> {
    await layer.run({ sql, params }, never());
  }

  it("lists the configured agents, each scope once in a fixed order", async () => {
    const { settings } = await setUp();

    await expect(
      settings.seedAgents(
        [{ ...CHAT_AGENT, scopes: ["control", "read", "control"] }, RELAY],
        never(),
      ),
    ).resolves.toEqual({ removed: [] });

    await expect(settings.agent(CHAT_AGENT.clientId, never())).resolves.toEqual(
      { ...CHAT_AGENT, scopes: ["read", "control"] },
    );
    await expect(settings.agent(RELAY.clientId, never())).resolves.toEqual(
      RELAY,
    );
    await expect(
      settings.agent("not-listed", never()),
    ).resolves.toBeUndefined();
  });

  it("replaces the listing on the next seed, keeping a listed agent's revocation and last-seen time", async () => {
    const { settings, layer } = await setUp();
    await settings.seedAgents([CHAT_AGENT, RELAY], never());
    await exec(
      layer,
      "UPDATE agent SET revoked_at = @revoked_at, last_seen_at = @last_seen_at WHERE client_id = @client_id",
      {
        revoked_at: START + 1,
        last_seen_at: START + 2,
        client_id: CHAT_AGENT.clientId,
      },
    );
    const changed: AgentSeed = {
      clientId: CHAT_AGENT.clientId,
      scopes: ["read", "media"],
      redirectUris: ["https://chat.example/new-callback"],
    };

    await expect(settings.seedAgents([changed], never())).resolves.toEqual({
      removed: [RELAY.clientId],
    });

    await expect(settings.agent(CHAT_AGENT.clientId, never())).resolves.toEqual(
      { ...changed, revokedAt: START + 1, lastSeenAt: START + 2 },
    );
    await expect(
      settings.agent(RELAY.clientId, never()),
    ).resolves.toBeUndefined();
  });

  it("refuses a seed that lists a client twice or holds a value it cannot store, changing nothing", async () => {
    const { settings } = await setUp();
    await settings.seedAgents([RELAY], never());

    for (const seeds of [
      [CHAT_AGENT, { ...CHAT_AGENT, platform: "Other" }],
      [{ ...CHAT_AGENT, clientId: "" }],
      [{ ...CHAT_AGENT, clientId: "c".repeat(401) }],
      [{ ...CHAT_AGENT, platform: "" }],
      [{ ...CHAT_AGENT, platform: "p".repeat(65) }],
      [{ ...CHAT_AGENT, redirectUris: [""] }],
    ]) {
      await expect(settings.seedAgents(seeds, never())).rejects.toThrow(
        RangeError,
      );
    }

    await expect(settings.agent(RELAY.clientId, never())).resolves.toEqual(
      RELAY,
    );
    await expect(
      settings.agent(CHAT_AGENT.clientId, never()),
    ).resolves.toBeUndefined();
  });

  it("keeps an enrollment request with its code for 10 minutes", async () => {
    const { settings, clock } = await setUp();
    const publicKey = await newKey();
    const keyId = signingKeyId(publicKey);

    await expect(
      settings.requestEnrollment({ publicKey, code: "7Q4K-29XM" }, never()),
    ).resolves.toEqual({
      kind: "pending",
      keyId,
      expiresAt: START + ENROLLMENT_REQUEST_TTL_MS,
    });
    await expect(settings.pendingEnrollment(never())).resolves.toEqual({
      keyId,
      code: "7Q4K-29XM",
      requestedAt: START,
      expiresAt: START + ENROLLMENT_REQUEST_TTL_MS,
    });
    await expect(settings.connectorKey(keyId, never())).resolves.toEqual({
      kind: "not_enrolled",
    });

    await clock.advance(ENROLLMENT_REQUEST_TTL_MS - 1);
    await expect(settings.pendingEnrollment(never())).resolves.toMatchObject({
      keyId,
    });
    await clock.advance(1);
    await expect(settings.pendingEnrollment(never())).resolves.toBeUndefined();
    await expect(settings.approveEnrollment(keyId, never())).resolves.toEqual({
      kind: "not_pending",
    });
  });

  it("keeps one request at a time: a new one replaces the one waiting", async () => {
    const { settings, clock } = await setUp();
    const first = await newKey();
    const second = await newKey();
    await settings.requestEnrollment(
      { publicKey: first, code: "AAAA" },
      never(),
    );
    await clock.advance(1_000);

    await settings.requestEnrollment(
      { publicKey: second, code: "BBBB" },
      never(),
    );

    await expect(settings.pendingEnrollment(never())).resolves.toEqual({
      keyId: signingKeyId(second),
      code: "BBBB",
      requestedAt: START + 1_000,
      expiresAt: START + 1_000 + ENROLLMENT_REQUEST_TTL_MS,
    });
    await expect(
      settings.approveEnrollment(signingKeyId(first), never()),
    ).resolves.toEqual({ kind: "not_pending" });
  });

  it("asks again with a fresh 10 minutes when the same key repeats its request", async () => {
    const { settings, clock } = await setUp();
    const publicKey = await newKey();
    await settings.requestEnrollment({ publicKey, code: "AAAA" }, never());
    await clock.advance(ENROLLMENT_REQUEST_TTL_MS - 1);

    await settings.requestEnrollment({ publicKey, code: "CCCC" }, never());

    await clock.advance(ENROLLMENT_REQUEST_TTL_MS - 1);
    await expect(settings.pendingEnrollment(never())).resolves.toMatchObject({
      code: "CCCC",
    });
  });

  it("approves a waiting request: its key becomes the one active key and every older key is revoked", async () => {
    const { settings, clock, layer } = await setUp();
    const oldestKey = await newKey();
    const olderKey = await newKey();
    const newestKey = await newKey();
    for (const publicKey of [oldestKey, olderKey]) {
      await settings.requestEnrollment({ publicKey, code: "AAAA" }, never());
      await settings.approveEnrollment(signingKeyId(publicKey), never());
    }
    await settings.requestEnrollment(
      { publicKey: newestKey, code: "NEW1" },
      never(),
    );
    await clock.advance(5_000);
    const newest = signingKeyId(newestKey);

    await expect(settings.approveEnrollment(newest, never())).resolves.toEqual({
      kind: "approved",
      revokedKeyIds: [signingKeyId(olderKey)],
    });

    await expect(settings.connectorKey(newest, never())).resolves.toEqual({
      kind: "active",
      publicKey: newestKey,
    });
    for (const publicKey of [oldestKey, olderKey]) {
      await expect(
        settings.connectorKey(signingKeyId(publicKey), never()),
      ).resolves.toEqual({ kind: "revoked" });
    }
    await expect(settings.pendingEnrollment(never())).resolves.toBeUndefined();
    await expect(
      layer.all(
        {
          sql: "SELECT enrolled_at, revoked_at, expires_at, enrollment_code FROM connector WHERE key_id = @key_id",
          params: { key_id: newest },
        },
        never(),
      ),
    ).resolves.toEqual([
      {
        enrolled_at: START + 5_000,
        revoked_at: null,
        expires_at: null,
        enrollment_code: null,
      },
    ]);
  });

  it("reports a request from an active or a revoked key, and leaves the waiting request alone", async () => {
    const { settings } = await setUp();
    const revoked = await newKey();
    const active = await newKey();
    const waiting = await newKey();
    for (const publicKey of [revoked, active]) {
      await settings.requestEnrollment({ publicKey, code: "AAAA" }, never());
      await settings.approveEnrollment(signingKeyId(publicKey), never());
    }
    await settings.requestEnrollment(
      { publicKey: waiting, code: "WAIT" },
      never(),
    );

    await expect(
      settings.requestEnrollment({ publicKey: active, code: "BBBB" }, never()),
    ).resolves.toEqual({
      kind: "already_active",
      keyId: signingKeyId(active),
    });
    await expect(
      settings.requestEnrollment({ publicKey: revoked, code: "CCCC" }, never()),
    ).resolves.toEqual({ kind: "revoked", keyId: signingKeyId(revoked) });

    await expect(settings.pendingEnrollment(never())).resolves.toMatchObject({
      keyId: signingKeyId(waiting),
      code: "WAIT",
    });
  });

  it("does not know a key that never asked", async () => {
    const { settings } = await setUp();

    await expect(
      settings.connectorKey(signingKeyId(await newKey()), never()),
    ).resolves.toEqual({ kind: "not_enrolled" });
  });

  it("refuses an empty or overlong enrollment code, changing nothing", async () => {
    const { settings } = await setUp();
    const publicKey = await newKey();

    for (const code of ["", "x".repeat(65)]) {
      await expect(
        settings.requestEnrollment({ publicKey, code }, never()),
      ).rejects.toThrow(RangeError);
    }
    await expect(
      settings.requestEnrollment({ publicKey, code: "x".repeat(64) }, never()),
    ).resolves.toMatchObject({ kind: "pending" });
  });

  it("holds the owner's battery threshold, or the configured default", async () => {
    const { settings } = await setUp();
    await expect(settings.batteryThresholdPct(never())).resolves.toBe(
      DEFAULT_THRESHOLD,
    );

    await settings.setBatteryThresholdPct(35, never());
    await settings.setBatteryThresholdPct(0, never());
    await expect(settings.batteryThresholdPct(never())).resolves.toBe(0);

    for (const refused of [-1, 101, 12.5, Number.NaN]) {
      await expect(
        settings.setBatteryThresholdPct(refused, never()),
      ).rejects.toThrow(RangeError);
    }
    await expect(settings.batteryThresholdPct(never())).resolves.toBe(0);
  });

  it("reports a row it did not write as failed, quoting nothing from it", async () => {
    const { settings, layer } = await setUp();
    const stored = "UNTRUSTED-ROW-TEXT";
    await exec(
      layer,
      "INSERT INTO agent (client_id, scopes, redirect_uris) VALUES ('a', @scopes, '[]')",
      { scopes: `["${stored}"]` },
    );
    await exec(
      layer,
      "INSERT INTO connector (key_id, public_key, status, requested_at) VALUES ('k', 'p', @status, 0)",
      { status: stored },
    );
    await exec(
      layer,
      "INSERT INTO connector (key_id, public_key, status, requested_at) VALUES ('bad-key', @public_key, 'active', 0)",
      { public_key: stored },
    );
    await exec(
      layer,
      "INSERT INTO setting (name, value, updated_at) VALUES ('battery_threshold_pct', @value, 0)",
      { value: stored },
    );

    for (const work of [
      () => settings.agent("a", never()),
      () => settings.connectorKey("k", never()),
      () => settings.connectorKey("bad-key", never()),
      () => settings.batteryThresholdPct(never()),
    ]) {
      const error = await expectStoreError(work(), "failed");
      expect(error.cause).toBeUndefined();
      expect(error.message).not.toContain(stored);
    }
  });

  it("reports a database it cannot reach as unavailable", async () => {
    const { settings, layer } = await setUp();
    const publicKey = await newKey();
    await layer.close();

    for (const work of [
      () => settings.seedAgents([RELAY], never()),
      () => settings.agent(RELAY.clientId, never()),
      () => settings.requestEnrollment({ publicKey, code: "A" }, never()),
      () => settings.pendingEnrollment(never()),
      () => settings.approveEnrollment("k", never()),
      () => settings.connectorKey("k", never()),
      () => settings.batteryThresholdPct(never()),
      () => settings.setBatteryThresholdPct(30, never()),
    ]) {
      const error = await expectStoreError(work(), "unavailable");
      expect(error.cause).toMatchObject({ kind: "store_down" });
    }
  });

  it("lets the caller's abort through unchanged", async () => {
    const { settings } = await setUp();
    const controller = new AbortController();
    const reason = new Error("caller left");
    controller.abort(reason);

    await expect(
      settings.agent(RELAY.clientId, controller.signal),
    ).rejects.toBe(reason);
  });
});

it("refuses a configured default threshold outside 0 to 100", () => {
  expect(
    () =>
      new SettingsStore({
        store: {} as QueryLayer,
        clock: new FakeClock(START),
        defaultBatteryThresholdPct: 101,
      }),
  ).toThrow(RangeError);
});
