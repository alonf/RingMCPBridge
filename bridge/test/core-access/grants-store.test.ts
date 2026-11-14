// Grants (T022) on SQLite and on SQL Server: oidc-provider's records in one `(model, id)` table
// (PT-11), bearer ids kept only as hashes (SC4), expiry, consume (one redemption only, CP-15's
// review), and revoking by grant. Records whose time is up are removed, and one can be kept past
// its time (CP-17's review).
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import {
  GrantsStore,
  GrantsStoreError,
  HASHED_MODELS,
} from "../../src/core/access/grants/index.ts";
import type { GrantsStoreErrorKind } from "../../src/core/access/grants/index.ts";
import { FakeClock } from "../../src/utilities/clock/index.ts";
import {
  CORE_MIGRATIONS,
  runMigrations,
} from "../../src/utilities/query-layer/index.ts";
import type {
  QueryLayer,
  SqlParams,
  SqlRow,
} from "../../src/utilities/query-layer/index.ts";
import { describeStoreMatrix, requireSqlServerInCi } from "../support/index.ts";

const START = Date.UTC(2026, 10, 7, 9, 0, 0);
const START_S = START / 1000;
const TOKEN = "Rt-8kVq2-bearer-value-only-the-agent-holds";
const HOUR_S = 3600;

const REFRESH_TOKEN = {
  iat: START_S,
  exp: START_S + HOUR_S,
  jti: TOKEN,
  kind: "RefreshToken",
  grantId: "grant-1",
  accountId: "owner",
  clientId: "https://chat.example/client.json",
  scope: "read",
};

function never(): AbortSignal {
  return new AbortController().signal;
}

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("base64url");
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
  kind: GrantsStoreErrorKind,
): Promise<GrantsStoreError> {
  const error = await failureOf(work);
  if (!(error instanceof GrantsStoreError)) {
    throw new Error("expected a GrantsStoreError", { cause: error });
  }
  expect(error.kind).toBe(kind);
  return error;
}

requireSqlServerInCi();

describeStoreMatrix("Grants", (store) => {
  async function setUp(): Promise<{
    grants: GrantsStore;
    layer: QueryLayer;
    clock: FakeClock;
  }> {
    const clock = new FakeClock(START);
    const layer = await store.emptyDatabase();
    await runMigrations(layer, CORE_MIGRATIONS, { clock }, never());
    return { grants: new GrantsStore({ store: layer, clock }), layer, clock };
  }

  async function rows(
    layer: QueryLayer,
    sql: string,
    params: SqlParams = {},
  ): Promise<readonly SqlRow[]> {
    return layer.all({ sql, params }, never());
  }

  it("gives back what it saved, by model and id", async () => {
    const { grants } = await setUp();
    const client = {
      client_id: "c-1",
      redirect_uris: ["https://a.example/cb"],
    };
    const grant = { jti: "c-1", kind: "Grant", accountId: "owner" };

    await grants.upsert("Client", "c-1", client, undefined, never());
    await grants.upsert("Grant", "c-1", grant, HOUR_S, never());

    await expect(grants.find("Client", "c-1", never())).resolves.toEqual(
      client,
    );
    await expect(grants.find("Grant", "c-1", never())).resolves.toEqual(grant);
    await expect(
      grants.find("Session", "c-1", never()),
    ).resolves.toBeUndefined();
  });

  it("keeps a bearer token only as its id's hash, and gives its jti back on find", async () => {
    const { grants, layer } = await setUp();

    await grants.upsert("RefreshToken", TOKEN, REFRESH_TOKEN, HOUR_S, never());

    const stored = await rows(
      layer,
      "SELECT id, grant_id, data FROM oidc_item",
    );
    expect(stored.map((row) => [row.id, row.grant_id])).toEqual([
      [sha256(TOKEN), "grant-1"],
    ]);
    expect(JSON.stringify(stored)).not.toContain(TOKEN);
    await expect(grants.find("RefreshToken", TOKEN, never())).resolves.toEqual(
      REFRESH_TOKEN,
    );
    await expect(
      grants.find("RefreshToken", sha256(TOKEN), never()),
    ).resolves.toBeUndefined();
  });

  it("keeps every bearer model by its id's hash", async () => {
    const { grants, layer } = await setUp();

    for (const model of HASHED_MODELS) {
      await grants.upsert(
        model,
        TOKEN,
        { jti: TOKEN, kind: model },
        HOUR_S,
        never(),
      );
    }

    const stored = await rows(layer, "SELECT model, id, data FROM oidc_item");
    expect(stored).toHaveLength(HASHED_MODELS.size);
    expect(JSON.stringify(stored)).not.toContain(TOKEN);
  });

  it("does not find a record whose time is up, and keeps one without a lifetime", async () => {
    const { grants, clock } = await setUp();
    await grants.upsert("RefreshToken", TOKEN, REFRESH_TOKEN, HOUR_S, never());
    await grants.upsert(
      "Client",
      "c-1",
      { client_id: "c-1" },
      undefined,
      never(),
    );

    await clock.advance(HOUR_S * 1000 - 1);
    await expect(
      grants.find("RefreshToken", TOKEN, never()),
    ).resolves.toBeDefined();
    await clock.advance(1);
    await expect(
      grants.find("RefreshToken", TOKEN, never()),
    ).resolves.toBeUndefined();
    await expect(grants.find("Client", "c-1", never())).resolves.toEqual({
      client_id: "c-1",
    });
  });

  it("removes every record whose time is up, of every model, and says how many (CP-17's review)", async () => {
    const { grants, layer, clock } = await setUp();
    await grants.upsert("RefreshToken", TOKEN, REFRESH_TOKEN, HOUR_S, never());
    await grants.upsert("Interaction", "i-1", { uid: "u-1" }, 600, never());
    await grants.upsert("Client", "c-1", { client_id: "c-1" }, 600, never());
    await grants.upsert(
      "Client",
      "c-2",
      { client_id: "c-2" },
      undefined,
      never(),
    );
    await clock.advance(600 * 1000 - 1);
    await expect(grants.deleteExpired(never())).resolves.toBe(0);

    await clock.advance(1);

    await expect(grants.deleteExpired(never())).resolves.toBe(2);
    expect(
      await rows(layer, "SELECT model, id FROM oidc_item ORDER BY model, id"),
    ).toEqual([
      { model: "Client", id: "c-2" },
      { model: "RefreshToken", id: sha256(TOKEN) },
    ]);
  });

  it("keeps a record past its time, only while it is there and in time", async () => {
    const { grants, clock } = await setUp();
    await grants.upsert("Client", "c-1", { client_id: "c-1" }, 600, never());
    await grants.upsert("Client", "c-2", { client_id: "c-2" }, 600, never());
    await grants.upsert("RefreshToken", TOKEN, REFRESH_TOKEN, 600, never());

    await expect(grants.keep("Client", "c-1", never())).resolves.toBe(true);
    // Kept again, as when the owner links the same agent a second time.
    await expect(grants.keep("Client", "c-1", never())).resolves.toBe(true);
    await expect(grants.keep("RefreshToken", TOKEN, never())).resolves.toBe(
      true,
    );
    await expect(grants.keep("Client", "c-3", never())).resolves.toBe(false);
    await clock.advance(600 * 1000);
    await expect(grants.keep("Client", "c-2", never())).resolves.toBe(false);
    await grants.deleteExpired(never());

    await clock.advance(HOUR_S * 1000);
    await expect(grants.find("Client", "c-1", never())).resolves.toEqual({
      client_id: "c-1",
    });
    await expect(
      grants.find("RefreshToken", TOKEN, never()),
    ).resolves.toBeDefined();
    await expect(
      grants.find("Client", "c-2", never()),
    ).resolves.toBeUndefined();
  });

  it("replaces a record saved again under the same id", async () => {
    const { grants, clock } = await setUp();
    await grants.upsert(
      "Session",
      "s-1",
      { uid: "u-1", jti: "s-1" },
      60,
      never(),
    );

    await grants.upsert(
      "Session",
      "s-1",
      { uid: "u-2", jti: "s-1", accountId: "owner" },
      HOUR_S,
      never(),
    );

    await clock.advance(61_000);
    await expect(grants.find("Session", "s-1", never())).resolves.toEqual({
      uid: "u-2",
      jti: "s-1",
      accountId: "owner",
    });
    await expect(
      grants.findByUid("Session", "u-1", never()),
    ).resolves.toBeUndefined();
  });

  it("finds a session by its uid until its time is up", async () => {
    const { grants, clock } = await setUp();
    const session = { uid: "u-1", jti: "s-1", kind: "Session" };
    await grants.upsert("Session", "s-1", session, 60, never());

    await expect(grants.findByUid("Session", "u-1", never())).resolves.toEqual(
      session,
    );
    await expect(
      grants.findByUid("Interaction", "u-1", never()),
    ).resolves.toBeUndefined();
    await clock.advance(60_000);
    await expect(
      grants.findByUid("Session", "u-1", never()),
    ).resolves.toBeUndefined();
    await expect(
      grants.findByUid("RefreshToken", "u-1", never()),
    ).rejects.toThrow(RangeError);
  });

  it("marks a record consumed with the time in seconds, in one statement, leaving the rest", async () => {
    const { grants, clock } = await setUp();
    await grants.upsert("RefreshToken", TOKEN, REFRESH_TOKEN, HOUR_S, never());
    await clock.advance(2_500);

    await expect(
      grants.consume("RefreshToken", TOKEN, never()),
    ).resolves.toEqual({ kind: "consumed" });
    await expect(
      grants.consume("RefreshToken", "not-saved", never()),
    ).resolves.toEqual({ kind: "not_found" });

    await expect(grants.find("RefreshToken", TOKEN, never())).resolves.toEqual({
      ...REFRESH_TOKEN,
      consumed: START_S + 2,
    });
  });

  it("marks a record used once, however many redemptions arrive together, and names its grant to the rest", async () => {
    const { grants } = await setUp();
    await grants.upsert("RefreshToken", TOKEN, REFRESH_TOKEN, HOUR_S, never());

    const outcomes = await Promise.all(
      Array.from({ length: 5 }, () =>
        grants.consume("RefreshToken", TOKEN, never()),
      ),
    );

    expect(
      outcomes.filter((outcome) => outcome.kind === "consumed"),
    ).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.kind !== "consumed")).toEqual(
      Array(4).fill({ kind: "already_used", grantId: "grant-1" }),
    );
  });

  it("marks nothing whose time is up, but still names a used record's grant after its time is up", async () => {
    const { grants, clock } = await setUp();
    await grants.upsert(
      "AuthorizationCode",
      "code-1",
      { jti: "code-1", grantId: "grant-1" },
      60,
      never(),
    );
    await grants.upsert("RefreshToken", TOKEN, REFRESH_TOKEN, HOUR_S, never());
    await grants.upsert(
      "PushedAuthorizationRequest",
      "par-1",
      { jti: "par-1" },
      HOUR_S,
      never(),
    );
    await grants.consume("RefreshToken", TOKEN, never());
    await grants.consume("PushedAuthorizationRequest", "par-1", never());

    await clock.advance(HOUR_S * 1000);

    await expect(
      grants.consume("AuthorizationCode", "code-1", never()),
    ).resolves.toEqual({ kind: "not_found" });
    await expect(
      grants.consume("RefreshToken", TOKEN, never()),
    ).resolves.toEqual({ kind: "already_used", grantId: "grant-1" });
    await expect(
      grants.consume("PushedAuthorizationRequest", "par-1", never()),
    ).resolves.toEqual({ kind: "already_used", grantId: undefined });
  });

  it("destroys one record", async () => {
    const { grants } = await setUp();
    await grants.upsert("RefreshToken", TOKEN, REFRESH_TOKEN, HOUR_S, never());
    await grants.upsert("Session", "s-1", { uid: "u-1" }, HOUR_S, never());

    await grants.destroy("RefreshToken", TOKEN, never());
    await grants.destroy("RefreshToken", "not-saved", never());

    await expect(
      grants.find("RefreshToken", TOKEN, never()),
    ).resolves.toBeUndefined();
    await expect(grants.find("Session", "s-1", never())).resolves.toBeDefined();
  });

  it("revokes a grant's records of one model, leaving the grant and other grants", async () => {
    const { grants } = await setUp();
    const other = "Other-refresh-token-value";
    await grants.upsert(
      "Grant",
      "grant-1",
      { jti: "grant-1" },
      HOUR_S,
      never(),
    );
    await grants.upsert("RefreshToken", TOKEN, REFRESH_TOKEN, HOUR_S, never());
    await grants.upsert(
      "AccessToken",
      "access-1",
      { jti: "access-1", grantId: "grant-1" },
      HOUR_S,
      never(),
    );
    await grants.upsert(
      "RefreshToken",
      other,
      { ...REFRESH_TOKEN, jti: other, grantId: "grant-2" },
      HOUR_S,
      never(),
    );

    await grants.revokeByGrantId("RefreshToken", "grant-1", never());

    await expect(
      grants.find("RefreshToken", TOKEN, never()),
    ).resolves.toBeUndefined();
    await expect(
      grants.find("AccessToken", "access-1", never()),
    ).resolves.toBeDefined();
    await expect(
      grants.find("Grant", "grant-1", never()),
    ).resolves.toBeDefined();
    await expect(
      grants.find("RefreshToken", other, never()),
    ).resolves.toBeDefined();
  });

  it("ends a grant: its own record and every record of it, of every model, leaving other grants", async () => {
    const { grants } = await setUp();
    const other = "Other-refresh-token-value";
    for (const grantId of ["grant-1", "grant-2"]) {
      await grants.upsert("Grant", grantId, { jti: grantId }, HOUR_S, never());
    }
    await grants.upsert("RefreshToken", TOKEN, REFRESH_TOKEN, HOUR_S, never());
    await grants.upsert(
      "AccessToken",
      "access-1",
      { jti: "access-1", grantId: "grant-1" },
      HOUR_S,
      never(),
    );
    await grants.upsert(
      "AuthorizationCode",
      "code-1",
      { jti: "code-1", grantId: "grant-1" },
      HOUR_S,
      never(),
    );
    await grants.upsert(
      "RefreshToken",
      other,
      { ...REFRESH_TOKEN, jti: other, grantId: "grant-2" },
      HOUR_S,
      never(),
    );
    // A record of another model whose id happens to be the grant's id is not the grant.
    await grants.upsert(
      "Client",
      "grant-1",
      { client_id: "grant-1" },
      undefined,
      never(),
    );

    await grants.revokeGrant("grant-1", never());

    for (const [model, id] of [
      ["Grant", "grant-1"],
      ["RefreshToken", TOKEN],
      ["AccessToken", "access-1"],
      ["AuthorizationCode", "code-1"],
    ] as const) {
      await expect(grants.find(model, id, never())).resolves.toBeUndefined();
    }
    for (const [model, id] of [
      ["Grant", "grant-2"],
      ["RefreshToken", other],
      ["Client", "grant-1"],
    ] as const) {
      await expect(grants.find(model, id, never())).resolves.toBeDefined();
    }
  });

  it("refuses what it cannot store, on both dialects alike", async () => {
    const { grants } = await setUp();

    for (const [model, id, payload, expiresIn] of [
      ["", "id", {}, 1],
      ["Not a model", "id", {}, 1],
      ["M".repeat(41), "id", {}, 1],
      ["Client", "", {}, 1],
      ["Client", "c".repeat(401), {}, 1],
      ["Grant", "g", { grantId: "g".repeat(129) }, 1],
      ["Session", "s", { uid: "" }, 1],
      ["Session", "s", {}, -1],
      ["Session", "s", {}, Number.NaN],
    ] as const) {
      await expect(
        grants.upsert(model, id, payload, expiresIn, never()),
      ).rejects.toThrow(RangeError);
    }
    await grants.upsert("Client", "c".repeat(400), {}, undefined, never());
  });

  it("reports a record it did not write as failed, quoting nothing from it", async () => {
    const { grants, layer } = await setUp();
    const stored = "UNTRUSTED-RECORD-TEXT";
    for (const [id, data] of [
      ["not-json", stored],
      ["array", `["${stored}"]`],
    ] as const) {
      await layer.run(
        {
          sql: "INSERT INTO oidc_item (model, id, data) VALUES ('Client', @id, @data)",
          params: { id, data },
        },
        never(),
      );
      const error = await expectStoreError(
        grants.find("Client", id, never()),
        "failed",
      );
      expect(error.cause).toBeUndefined();
      expect(error.message).not.toContain(stored);
    }
  });

  it("reports a database it cannot reach as unavailable", async () => {
    const { grants, layer } = await setUp();
    await layer.close();

    for (const work of [
      () => grants.upsert("Client", "c-1", {}, undefined, never()),
      () => grants.find("Client", "c-1", never()),
      () => grants.findByUid("Session", "u-1", never()),
      () => grants.consume("AuthorizationCode", "code", never()),
      () => grants.destroy("Client", "c-1", never()),
      () => grants.revokeByGrantId("AccessToken", "grant-1", never()),
      () => grants.revokeGrant("grant-1", never()),
      () => grants.keep("Client", "c-1", never()),
      () => grants.deleteExpired(never()),
    ]) {
      const error = await expectStoreError(work(), "unavailable");
      expect(error.cause).toMatchObject({ kind: "store_down" });
    }
  });

  it("lets the caller's abort through unchanged", async () => {
    const { grants } = await setUp();
    const controller = new AbortController();
    const reason = new Error("caller left");
    controller.abort(reason);

    await expect(grants.find("Client", "c-1", controller.signal)).rejects.toBe(
      reason,
    );
  });
});
