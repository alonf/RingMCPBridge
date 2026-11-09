// The adapter's consume (CP-15's review): the redemption that loses the store's one-statement mark
// is refused. A code or refresh token used already ends its grant first; a pushed request, which
// belongs to no grant, is refused as oidc-provider refuses a used one.
import { describe, expect, it } from "vitest";
import { GrantsStore } from "../../access/grants/index.ts";
import { FakeClock } from "../../../utilities/clock/index.ts";
import {
  CORE_MIGRATIONS,
  openSqliteQueryLayer,
  runMigrations,
} from "../../../utilities/query-layer/index.ts";
import { adapterFor } from "./grants-adapter.ts";
import { ListedAgents } from "./listed-agents.ts";

const START = Date.UTC(2026, 10, 9, 9, 0, 0);
const HOUR_S = 3600;
const CODE = "Ac-7rT-code-value-only-the-agent-holds";

function never(): AbortSignal {
  return new AbortController().signal;
}

async function setUp(): Promise<{
  grants: GrantsStore;
  adapter: ReturnType<typeof adapterFor>;
  close: () => Promise<void>;
}> {
  const clock = new FakeClock(START);
  const layer = openSqliteQueryLayer(":memory:", { clock });
  await runMigrations(layer, CORE_MIGRATIONS, { clock }, never());
  const grants = new GrantsStore({ store: layer, clock });
  const agents = new ListedAgents({
    agent: () => Promise.resolve(undefined),
    agents: () => Promise.resolve([]),
  });
  await grants.upsert(
    "Grant",
    "grant-1",
    { jti: "grant-1", kind: "Grant" },
    HOUR_S,
    never(),
  );
  await grants.upsert(
    "AuthorizationCode",
    CODE,
    { jti: CODE, kind: "AuthorizationCode", grantId: "grant-1" },
    60,
    never(),
  );
  await grants.upsert(
    "AccessToken",
    "access-1",
    { jti: "access-1", kind: "AccessToken", grantId: "grant-1" },
    HOUR_S,
    never(),
  );
  return {
    grants,
    adapter: adapterFor({ grants, agents, lifetime: never() }),
    close: () => layer.close(),
  };
}

describe("the Issuer's storage adapter, consuming", () => {
  it("refuses a code used already with invalid_grant, and ends its grant", async () => {
    const { grants, adapter, close } = await setUp();
    try {
      const codes = adapter("AuthorizationCode");
      await codes.consume(CODE);

      await expect(codes.consume(CODE)).rejects.toMatchObject({
        error: "invalid_grant",
        statusCode: 400,
      });
      await expect(
        grants.find("Grant", "grant-1", never()),
      ).resolves.toBeUndefined();
      await expect(
        grants.find("AccessToken", "access-1", never()),
      ).resolves.toBeUndefined();
    } finally {
      await close();
    }
  });

  it("refuses a code that is not there with invalid_grant, ending no grant", async () => {
    const { grants, adapter, close } = await setUp();
    try {
      await expect(
        adapter("AuthorizationCode").consume("not-saved"),
      ).rejects.toMatchObject({ error: "invalid_grant" });
      await expect(
        grants.find("Grant", "grant-1", never()),
      ).resolves.toBeDefined();
    } finally {
      await close();
    }
  });

  it("refuses a pushed request used already with invalid_request_uri", async () => {
    const { grants, adapter, close } = await setUp();
    try {
      await grants.upsert(
        "PushedAuthorizationRequest",
        "par-1",
        { jti: "par-1", kind: "PushedAuthorizationRequest" },
        60,
        never(),
      );
      const requests = adapter("PushedAuthorizationRequest");
      await requests.consume("par-1");

      await expect(requests.consume("par-1")).rejects.toMatchObject({
        error: "invalid_request_uri",
      });
      await expect(
        grants.find("Grant", "grant-1", never()),
      ).resolves.toBeDefined();
    } finally {
      await close();
    }
  });
});
