// The adapter's consume (CP-15's review): the redemption that loses the store's one-statement mark
// is refused. A code or refresh token used already ends its grant first; a pushed request, which
// belongs to no grant, is refused as oidc-provider refuses a used one.
// Registration (CP-17's review): a listed agent's registration is stored for 7 days, unless the
// Issuer keeps it, and only while the hour's limit admits it.
import { describe, expect, it } from "vitest";
import { GrantsStore } from "../../access/grants/index.ts";
import { FakeClock } from "../../../utilities/clock/index.ts";
import {
  CORE_MIGRATIONS,
  openSqliteQueryLayer,
  runMigrations,
} from "../../../utilities/query-layer/index.ts";
import {
  adapterFor,
  keepRegisteredClient,
  UNUSED_REGISTRATION_TTL_S,
} from "./grants-adapter.ts";
import { ListedAgents } from "./listed-agents.ts";

const START = Date.UTC(2026, 10, 9, 9, 0, 0);
const HOUR_S = 3600;
const CODE = "Ac-7rT-code-value-only-the-agent-holds";
const MS_PER_SECOND = 1000;
const LISTED_URI = "https://chat.example.test/oauth/callback";
const REGISTRATION = {
  client_id: "registered-1",
  redirect_uris: [LISTED_URI],
  token_endpoint_auth_method: "none",
};

function never(): AbortSignal {
  return new AbortController().signal;
}

async function setUp(admitted = Number.POSITIVE_INFINITY): Promise<{
  grants: GrantsStore;
  clock: FakeClock;
  adapter: ReturnType<typeof adapterFor>;
  admissions: () => number;
  close: () => Promise<void>;
}> {
  const clock = new FakeClock(START);
  const layer = openSqliteQueryLayer(":memory:", { clock });
  await runMigrations(layer, CORE_MIGRATIONS, { clock }, never());
  const grants = new GrantsStore({ store: layer, clock });
  const agents = new ListedAgents({
    agent: () => Promise.resolve(undefined),
    agents: () =>
      Promise.resolve([
        {
          client_id: "registering-agent",
          platform: "Registering agent",
          scopes: ["read"],
          redirect_uris: [LISTED_URI],
        },
      ]),
  });
  let admissions = 0;
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
    clock,
    adapter: adapterFor({
      grants,
      agents,
      admitRegistration: () => {
        admissions += 1;
        return admissions <= admitted;
      },
      lifetime: never(),
    }),
    admissions: () => admissions,
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

describe("the Issuer's storage adapter, registering", () => {
  it("stores a listed agent's registration for 7 days, then finds it no more", async () => {
    const { adapter, clock, close } = await setUp();
    try {
      const clients = adapter("Client");
      await clients.upsert("registered-1", REGISTRATION, undefined);
      await clock.advance(UNUSED_REGISTRATION_TTL_S * MS_PER_SECOND - 1);
      await expect(clients.find("registered-1")).resolves.toMatchObject({
        redirect_uris: [LISTED_URI],
      });

      await clock.advance(1);

      await expect(clients.find("registered-1")).resolves.toBeUndefined();
    } finally {
      await close();
    }
  });

  it("keeps a registration the owner linked past its 7 days", async () => {
    const { grants, adapter, clock, close } = await setUp();
    try {
      const clients = adapter("Client");
      await clients.upsert("registered-1", REGISTRATION, undefined);

      await expect(
        keepRegisteredClient(grants, "registered-1", never()),
      ).resolves.toBe(true);
      await clock.advance(2 * UNUSED_REGISTRATION_TTL_S * MS_PER_SECOND);

      await expect(clients.find("registered-1")).resolves.toBeDefined();
    } finally {
      await close();
    }
  });

  it("keeps nothing that is not there, or whose time is up", async () => {
    const { grants, adapter, clock, close } = await setUp();
    try {
      await adapter("Client").upsert("registered-1", REGISTRATION, undefined);
      await clock.advance(UNUSED_REGISTRATION_TTL_S * MS_PER_SECOND);

      await expect(
        keepRegisteredClient(grants, "registered-1", never()),
      ).resolves.toBe(false);
      await expect(
        keepRegisteredClient(grants, "never-registered", never()),
      ).resolves.toBe(false);
    } finally {
      await close();
    }
  });

  it("refuses a registration over the hour's limit with 429, storing nothing", async () => {
    const { grants, adapter, close } = await setUp(1);
    try {
      const clients = adapter("Client");
      await clients.upsert("registered-1", REGISTRATION, undefined);

      await expect(
        clients.upsert(
          "registered-2",
          { ...REGISTRATION, client_id: "registered-2" },
          undefined,
        ),
      ).rejects.toMatchObject({
        error: "temporarily_unavailable",
        statusCode: 429,
      });
      await expect(
        grants.find("Client", "registered-2", never()),
      ).resolves.toBeUndefined();
    } finally {
      await close();
    }
  });

  it("does not count an unlisted registration against the limit", async () => {
    const { adapter, admissions, close } = await setUp();
    try {
      await expect(
        adapter("Client").upsert(
          "unlisted-1",
          {
            ...REGISTRATION,
            redirect_uris: ["https://attacker.example.test/callback"],
          },
          undefined,
        ),
      ).rejects.toMatchObject({ error: "invalid_client_metadata" });
      expect(admissions()).toBe(0);
    } finally {
      await close();
    }
  });
});
