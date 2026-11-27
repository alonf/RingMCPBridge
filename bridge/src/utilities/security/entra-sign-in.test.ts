import { createHash } from "node:crypto";
import { SignJWT, exportJWK, generateKeyPair, importJWK } from "jose";
import type { JWK, JWTPayload } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { FakeClock } from "../clock/index.ts";
import { Logger } from "../logging/index.ts";
import { EntraOwnerSignIn, SecurityError } from "./index.ts";
import type {
  EntraSignInSettings,
  HttpFetch,
  OwnerIdentity,
  SecurityErrorKind,
} from "./index.ts";

const TENANT_PATH = "https://login.example.test/tenant-a";
const ISSUER = `${TENANT_PATH}/v2.0`;
const AUTHORIZE_URL = `${TENANT_PATH}/oauth2/v2.0/authorize`;
const TOKEN_URL = `${TENANT_PATH}/oauth2/v2.0/token`;
const KEYS_URL = `${TENANT_PATH}/discovery/v2.0/keys`;
const DISCOVERY_URL = `${ISSUER}/.well-known/openid-configuration`;
const SETTINGS: EntraSignInSettings = {
  issuer: ISSUER,
  clientId: "bridge-app",
  redirectUri: "https://bridge.example.test/sign-in/return",
  ownerObjectId: "owner-object-7hq2",
};
const SUBJECT = "owner-subject-AbC123";
const OWNER_OID = "owner-object-7hq2";
const START = Date.UTC(2026, 10, 3, 9, 0, 0);
const START_S = START / 1000;
const HOUR_S = 3600;
const KEY_ID = "key-1";
const ASSERTION = "mi-assertion-Vb6Yq2LsP0";
const AUTH_CODE = "auth-code-QXkF93hT0pLmZr7w";
const BASE64URL_43 = /^[A-Za-z0-9_-]{43}$/;
const NEVER = new AbortController().signal;

/** ID token claims to change; `undefined` leaves a claim out. */
type Claims = Readonly<Record<string, unknown>>;

type PrivateKey = Awaited<ReturnType<typeof generateKeyPair>>["privateKey"];

let signingKey: PrivateKey;
let samePssKey: PrivateKey;
let otherKey: PrivateKey;
let publicJwk: JWK;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256", { extractable: true });
  signingKey = pair.privateKey;
  // The same RSA key, usable for RSA-PSS: only the algorithm pin refuses its tokens.
  samePssKey = (await importJWK(
    await exportJWK(pair.privateKey),
    "PS256",
  )) as PrivateKey;
  // Like Entra's published keys: no `alg` member, so the key alone does not limit the algorithm.
  publicJwk = {
    ...(await exportJWK(pair.publicKey)),
    kid: KEY_ID,
    use: "sig",
  };
  otherKey = (await generateKeyPair("RS256")).privateKey;
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** A stand-in Entra behind the injected fetch: discovery, keys, and the token endpoint. */
class FakeEntra {
  readonly calls: string[] = [];
  readonly tokenBodies: URLSearchParams[] = [];
  discovery: Record<string, unknown> = {
    issuer: ISSUER,
    authorization_endpoint: AUTHORIZE_URL,
    token_endpoint: TOKEN_URL,
    jwks_uri: KEYS_URL,
  };
  discoveryFailures = 0;
  keysStatus = 200;
  beforeKeys: () => void = () => undefined;
  tokenReply: (() => Response) | undefined;
  claims: Claims = {};
  /** The object id Entra puts in the ID token when `profile` was asked for. */
  objectId = OWNER_OID;
  sign: (payload: JWTPayload) => Promise<string> = (payload) =>
    new SignJWT(payload)
      .setProtectedHeader({ alg: "RS256", kid: KEY_ID, typ: "JWT" })
      .sign(signingKey);
  lastIdToken = "";
  readonly #clock: FakeClock;
  #challenge = "";
  #nonce = "";
  #scopes: readonly string[] = [];

  constructor(clock: FakeClock) {
    this.#clock = clock;
  }

  /** The owner's browser at Entra: read the request, return to the bridge with a code. */
  authorize(url: string): URLSearchParams {
    const query = new URL(url).searchParams;
    this.#challenge = query.get("code_challenge") ?? "";
    this.#nonce = query.get("nonce") ?? "";
    this.#scopes = (query.get("scope") ?? "").split(" ");
    return new URLSearchParams({
      code: AUTH_CODE,
      state: query.get("state") ?? "",
    });
  }

  readonly fetch: HttpFetch = async (url, init) => {
    this.calls.push(`${init.method ?? "GET"} ${url}`);
    if (url === DISCOVERY_URL) {
      if (this.discoveryFailures > 0) {
        this.discoveryFailures -= 1;
        throw new TypeError("fetch failed");
      }
      return json(this.discovery);
    }
    if (url === KEYS_URL) {
      this.beforeKeys();
      return json({ keys: [publicJwk] }, this.keysStatus);
    }
    if (url === TOKEN_URL) {
      const body = init.body instanceof URLSearchParams ? init.body : undefined;
      return this.#token(new URLSearchParams(body));
    }
    return json({ error: "not_found" }, 404);
  };

  async #token(body: URLSearchParams): Promise<Response> {
    this.tokenBodies.push(body);
    if (this.tokenReply !== undefined) {
      return this.tokenReply();
    }
    const verifier = body.get("code_verifier") ?? "";
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    if (body.get("code") !== AUTH_CODE || challenge !== this.#challenge) {
      return json({ error: "invalid_grant" }, 400);
    }
    const nowS = Math.floor(this.#clock.now() / 1000);
    this.lastIdToken = await this.sign({
      iss: ISSUER,
      aud: SETTINGS.clientId,
      sub: SUBJECT,
      ...(this.#scopes.includes("profile") ? { oid: this.objectId } : {}),
      nonce: this.#nonce,
      iat: nowS,
      exp: nowS + HOUR_S,
      ...this.claims,
    });
    return json({
      id_token: this.lastIdToken,
      access_token: "not-used",
      token_type: "Bearer",
    });
  }
}

interface Rig {
  readonly clock: FakeClock;
  readonly entra: FakeEntra;
  readonly client: EntraOwnerSignIn;
  assertionCalls: number;
  assertionFails: boolean;
}

function rig(): Rig {
  const clock = new FakeClock(START);
  const entra = new FakeEntra(clock);
  const state: Rig = {
    clock,
    entra,
    assertionCalls: 0,
    assertionFails: false,
    client: new EntraOwnerSignIn(SETTINGS, {
      clock,
      fetch: entra.fetch,
      clientAssertion: () => {
        state.assertionCalls += 1;
        return state.assertionFails
          ? Promise.reject(new Error("managed identity endpoint unreachable"))
          : Promise.resolve(ASSERTION);
      },
    }),
  };
  return state;
}

async function signIn(
  setup: Rig,
  fresh = false,
  editCallback: (callback: URLSearchParams) => void = () => undefined,
): Promise<OwnerIdentity> {
  const { url, pending } = await setup.client.begin({ fresh }, NEVER);
  const callback = setup.entra.authorize(url);
  editCallback(callback);
  return setup.client.complete(pending, callback, NEVER);
}

async function failureOf(action: Promise<unknown>): Promise<SecurityError> {
  try {
    await action;
  } catch (error) {
    if (error instanceof SecurityError) {
      return error;
    }
    throw error;
  }
  throw new Error("expected a SecurityError");
}

async function kindOf(action: Promise<unknown>): Promise<SecurityErrorKind> {
  return (await failureOf(action)).kind;
}

describe("starting a sign-in", () => {
  it("asks for an authorization code with PKCE (S256), state and nonce", async () => {
    const { client } = rig();
    const { url, pending } = await client.begin({ fresh: false }, NEVER);
    const request = new URL(url);
    const query = request.searchParams;

    expect(`${request.origin}${request.pathname}`).toBe(AUTHORIZE_URL);
    expect(Object.fromEntries(query)).toEqual({
      client_id: SETTINGS.clientId,
      response_type: "code",
      response_mode: "query",
      redirect_uri: SETTINGS.redirectUri,
      scope: "openid profile",
      state: pending.state,
      nonce: pending.nonce,
      code_challenge: createHash("sha256")
        .update(pending.codeVerifier)
        .digest("base64url"),
      code_challenge_method: "S256",
    });
    for (const value of [pending.state, pending.nonce, pending.codeVerifier]) {
      expect(value).toMatch(BASE64URL_43);
    }
    expect(pending).toMatchObject({ startedAt: START, fresh: false });
  });

  it("asks Entra for the owner's credentials again on a fresh sign-in", async () => {
    const { client } = rig();
    const { url, pending } = await client.begin({ fresh: true }, NEVER);

    expect(new URL(url).searchParams.get("prompt")).toBe("login");
    expect(pending.fresh).toBe(true);
  });

  it("makes new values each time and reads the discovery document once", async () => {
    const { client, entra } = rig();
    const first = await client.begin({ fresh: false }, NEVER);
    const second = await client.begin({ fresh: false }, NEVER);

    expect(second.pending.state).not.toBe(first.pending.state);
    expect(second.pending.nonce).not.toBe(first.pending.nonce);
    expect(second.pending.codeVerifier).not.toBe(first.pending.codeVerifier);
    expect(entra.calls).toEqual([`GET ${DISCOVERY_URL}`]);
  });

  it("stops when the caller's signal is already aborted", async () => {
    const { client } = rig();
    const controller = new AbortController();
    const reason = new Error("request closed");
    controller.abort(reason);

    await expect(
      client.begin({ fresh: false }, controller.signal),
    ).rejects.toBe(reason);
  });
});

describe("finishing a sign-in", () => {
  it("redeems the code with the verifier and a client assertion, never a client secret", async () => {
    const setup = rig();
    const identity = await signIn(setup);
    const body = setup.entra.tokenBodies[0];

    expect(identity).toEqual({
      subject: SUBJECT,
      objectId: OWNER_OID,
      authenticatedAt: START,
      authenticatedAtSource: "issued_at",
    });
    expect(body?.get("grant_type")).toBe("authorization_code");
    expect(body?.get("redirect_uri")).toBe(SETTINGS.redirectUri);
    expect(body?.get("client_id")).toBe(SETTINGS.clientId);
    expect(body?.get("client_assertion_type")).toBe(
      "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
    );
    expect(body?.get("client_assertion")).toBe(ASSERTION);
    expect(body?.has("client_secret")).toBe(false);
  });

  it("uses auth_time when Entra sends it", async () => {
    const setup = rig();
    setup.entra.claims = { auth_time: START_S - 30 };

    expect(await signIn(setup)).toMatchObject({
      authenticatedAt: START - 30_000,
      authenticatedAtSource: "auth_time",
    });
  });

  it("accepts a token for several audiences when it names the bridge as the authorized party", async () => {
    const setup = rig();
    setup.entra.claims = {
      aud: [SETTINGS.clientId, "another-api"],
      azp: SETTINGS.clientId,
    };

    expect((await signIn(setup)).subject).toBe(SUBJECT);
  });
});

describe("refusing a reply before anything is sent to Entra", () => {
  it("refuses a reply whose state does not match, or has none", async () => {
    const changed = rig();
    const missing = rig();

    expect(
      await kindOf(
        signIn(changed, false, (c) => {
          c.set("state", "other");
        }),
      ),
    ).toBe("sign_in_invalid");
    expect(
      await kindOf(
        signIn(missing, false, (c) => {
          c.delete("state");
        }),
      ),
    ).toBe("sign_in_invalid");
    expect(changed.entra.tokenBodies).toHaveLength(0);
    expect(changed.assertionCalls).toBe(0);
  });

  it("refuses a sign-in that took more than 10 minutes", async () => {
    const setup = rig();
    const { url, pending } = await setup.client.begin({ fresh: false }, NEVER);
    const callback = setup.entra.authorize(url);
    await setup.clock.advance(10 * 60 * 1000 + 1);

    expect(await kindOf(setup.client.complete(pending, callback, NEVER))).toBe(
      "sign_in_invalid",
    );
    expect(setup.entra.tokenBodies).toHaveLength(0);
  });

  it.each([
    ["access_denied", "sign_in_refused"],
    ["login_required", "sign_in_refused"],
    ["temporarily_unavailable", "sign_in_unavailable"],
    ["server_error", "sign_in_unavailable"],
    ["invalid_request", "sign_in_invalid"],
  ] as const)("maps Entra's %s reply to %s", async (error, kind) => {
    const setup = rig();

    expect(
      await kindOf(
        signIn(setup, false, (c) => {
          c.delete("code");
          c.set("error", error);
        }),
      ),
    ).toBe(kind);
    expect(setup.entra.tokenBodies).toHaveLength(0);
  });

  it("refuses a reply with no code", async () => {
    expect(
      await kindOf(
        signIn(rig(), false, (c) => {
          c.delete("code");
        }),
      ),
    ).toBe("sign_in_invalid");
  });
});

describe("the token request", () => {
  it.each([
    [400, "sign_in_invalid"],
    [401, "sign_in_invalid"],
    [429, "sign_in_unavailable"],
    [503, "sign_in_unavailable"],
  ] as const)("maps a %i reply to %s", async (status, kind) => {
    const setup = rig();
    setup.entra.tokenReply = () => json({ error: "some_error" }, status);

    expect(await kindOf(signIn(setup))).toBe(kind);
  });

  it("treats a reply it cannot read, or no reply, as Entra being unavailable", async () => {
    const unreadable = rig();
    unreadable.entra.tokenReply = () => new Response("<html>", { status: 200 });
    const unreachable = rig();
    unreachable.entra.tokenReply = () => {
      throw new TypeError("fetch failed");
    };

    expect(await kindOf(signIn(unreadable))).toBe("sign_in_unavailable");
    expect(await kindOf(signIn(unreachable))).toBe("sign_in_unavailable");
  });

  it("fails closed when the managed identity gives no assertion", async () => {
    const setup = rig();
    setup.assertionFails = true;

    expect(await kindOf(signIn(setup))).toBe("sign_in_unavailable");
    expect(setup.entra.tokenBodies).toHaveLength(0);
  });

  it("passes on the caller's abort instead of a sign-in error", async () => {
    const setup = rig();
    const controller = new AbortController();
    const reason = new Error("request closed");
    const { url, pending } = await setup.client.begin({ fresh: false }, NEVER);
    const callback = setup.entra.authorize(url);
    setup.entra.tokenReply = () => {
      controller.abort(reason);
      throw reason;
    };

    await expect(
      setup.client.complete(pending, callback, controller.signal),
    ).rejects.toBe(reason);
  });

  it("passes on the caller's abort while the token reply is being read", async () => {
    const setup = rig();
    const controller = new AbortController();
    const reason = new Error("request closed");
    const { url, pending } = await setup.client.begin({ fresh: false }, NEVER);
    const callback = setup.entra.authorize(url);
    setup.entra.tokenReply = () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(stream) {
            stream.enqueue(new TextEncoder().encode('{"id_token":'));
          },
          pull(stream) {
            controller.abort(reason);
            stream.error(reason);
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );

    await expect(
      setup.client.complete(pending, callback, controller.signal),
    ).rejects.toBe(reason);
  });

  it("passes on the caller's abort while the signing keys are being fetched", async () => {
    const setup = rig();
    const controller = new AbortController();
    const reason = new Error("request closed");
    const { url, pending } = await setup.client.begin({ fresh: false }, NEVER);
    const callback = setup.entra.authorize(url);
    setup.entra.beforeKeys = () => {
      controller.abort(reason);
    };

    await expect(
      setup.client.complete(pending, callback, controller.signal),
    ).rejects.toBe(reason);
  });

  it("leaves no failure unobserved when the keys fail after the caller's abort", async () => {
    const setup = rig();
    const controller = new AbortController();
    const reason = new Error("request closed");
    const unobserved: unknown[] = [];
    const onUnhandled = (error: unknown): void => {
      unobserved.push(error);
    };
    process.on("unhandledRejection", onUnhandled);
    try {
      const { url, pending } = await setup.client.begin(
        { fresh: false },
        NEVER,
      );
      const callback = setup.entra.authorize(url);
      setup.entra.keysStatus = 503;
      setup.entra.beforeKeys = () => {
        controller.abort(reason);
      };

      await expect(
        setup.client.complete(pending, callback, controller.signal),
      ).rejects.toBe(reason);
      await new Promise((resolve) => setImmediate(resolve));
      expect(unobserved).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });
});

describe("checking the ID token", () => {
  const nowS = START_S;
  it.each<[string, Claims]>([
    ["another nonce", { nonce: "another-nonce" }],
    ["another audience", { aud: "another-app" }],
    ["another issuer", { iss: "https://login.example.test/tenant-b/v2.0" }],
    ["an expired token", { iat: nowS - 2 * HOUR_S, exp: nowS - 300 }],
    ["a token not valid yet", { nbf: nowS + 600 }],
    ["several audiences and no authorized party", { aud: ["bridge-app", "x"] }],
    [
      "several audiences and another authorized party",
      { aud: ["bridge-app", "x"], azp: "x" },
    ],
    ["no subject", { sub: undefined }],
    ["an empty subject", { sub: "" }],
    ["no nonce", { nonce: undefined }],
  ])("refuses %s", async (_label, claims) => {
    const setup = rig();
    setup.entra.claims = claims;

    expect(await kindOf(signIn(setup))).toBe("sign_in_invalid");
  });

  it("accepts a clock up to two minutes off", async () => {
    const setup = rig();
    setup.entra.claims = { iat: START_S + 90, nbf: START_S + 90 };

    expect((await signIn(setup)).subject).toBe(SUBJECT);
  });

  it("refuses a token signed by another key, with RSA-PSS, or with HMAC instead of RS256", async () => {
    const forged = rig();
    forged.entra.sign = (payload) =>
      new SignJWT(payload)
        .setProtectedHeader({ alg: "RS256", kid: KEY_ID })
        .sign(otherKey);
    const hmac = rig();
    hmac.entra.sign = (payload) =>
      new SignJWT(payload)
        .setProtectedHeader({ alg: "HS256", kid: KEY_ID })
        .sign(new TextEncoder().encode("a-shared-secret-of-thirty-two-bytes"));

    const pss = rig();
    pss.entra.sign = (payload) =>
      new SignJWT(payload)
        .setProtectedHeader({ alg: "PS256", kid: KEY_ID })
        .sign(samePssKey);

    expect(await kindOf(signIn(forged))).toBe("sign_in_invalid");
    expect(await kindOf(signIn(hmac))).toBe("sign_in_invalid");
    expect(await kindOf(signIn(pss))).toBe("sign_in_invalid");
  });

  it("refuses an old auth_time on a fresh sign-in, but not on a plain one", async () => {
    const fresh = rig();
    fresh.entra.claims = { auth_time: START_S - HOUR_S };
    const plain = rig();
    plain.entra.claims = { auth_time: START_S - HOUR_S };

    expect(await kindOf(signIn(fresh, true))).toBe("sign_in_invalid");
    expect((await signIn(plain, false)).authenticatedAt).toBe(
      START - HOUR_S * 1000,
    );
  });

  it("refuses a fresh sign-in whose token does not carry auth_time", async () => {
    const setup = rig();

    expect(await kindOf(signIn(setup, true))).toBe("sign_in_invalid");
  });

  it("accepts a fresh sign-in whose auth_time is after the start", async () => {
    const setup = rig();
    setup.entra.claims = { auth_time: START_S + 20 };

    expect(await signIn(setup, true)).toEqual({
      subject: SUBJECT,
      objectId: OWNER_OID,
      authenticatedAt: START + 20_000,
      authenticatedAtSource: "auth_time",
    });
  });

  it("fails closed when the signing keys cannot be read", async () => {
    const setup = rig();
    setup.entra.keysStatus = 503;

    expect(await kindOf(signIn(setup))).toBe("sign_in_unavailable");
  });
});

describe("the discovery document", () => {
  it("refuses a document that names another issuer (the mix-up defence)", async () => {
    const setup = rig();
    setup.entra.discovery = {
      ...setup.entra.discovery,
      issuer: "https://evil.test",
    };

    expect(await kindOf(setup.client.begin({ fresh: false }, NEVER))).toBe(
      "sign_in_unavailable",
    );
  });

  it.each([
    [
      "a plain-http endpoint",
      { token_endpoint: "http://login.example.test/token" },
    ],
    ["a missing endpoint", { jwks_uri: undefined }],
  ])("refuses %s", async (_label, change) => {
    const setup = rig();
    setup.entra.discovery = { ...setup.entra.discovery, ...change };

    expect(await kindOf(setup.client.begin({ fresh: false }, NEVER))).toBe(
      "sign_in_unavailable",
    );
  });

  it("tries again on the next sign-in after a failed read", async () => {
    const setup = rig();
    setup.entra.discoveryFailures = 1;

    expect(await kindOf(setup.client.begin({ fresh: false }, NEVER))).toBe(
      "sign_in_unavailable",
    );
    expect((await signIn(setup)).subject).toBe(SUBJECT);
  });

  it("refuses a discovery reply that is not 200 or not JSON", async () => {
    const notFound = rig();
    const settings = {
      ...SETTINGS,
      issuer: "https://login.example.test/x/v2.0",
    };
    const client = new EntraOwnerSignIn(settings, {
      clock: notFound.clock,
      fetch: notFound.entra.fetch,
      clientAssertion: () => Promise.resolve(ASSERTION),
    });
    const html = rig();
    const htmlClient = new EntraOwnerSignIn(SETTINGS, {
      clock: html.clock,
      fetch: () => Promise.resolve(new Response("<html>", { status: 200 })),
      clientAssertion: () => Promise.resolve(ASSERTION),
    });

    expect(await kindOf(client.begin({ fresh: false }, NEVER))).toBe(
      "sign_in_unavailable",
    );
    expect(await kindOf(htmlClient.begin({ fresh: false }, NEVER))).toBe(
      "sign_in_unavailable",
    );
  });
});

describe("only the owner signs in (DRIFT-001-39)", () => {
  function rigFor(ownerObjectId: string | undefined): Rig {
    const setup = rig();
    const settings: EntraSignInSettings = {
      issuer: SETTINGS.issuer,
      clientId: SETTINGS.clientId,
      redirectUri: SETTINGS.redirectUri,
      ...(ownerObjectId === undefined ? {} : { ownerObjectId }),
    };
    return {
      ...setup,
      client: new EntraOwnerSignIn(settings, {
        clock: setup.clock,
        fetch: setup.entra.fetch,
        clientAssertion: () => Promise.resolve(ASSERTION),
      }),
    };
  }

  it("refuses someone else in the tenant, without naming their object id", async () => {
    const setup = rig();
    setup.entra.objectId = "someone-else-4Kp9";
    const error = await failureOf(signIn(setup));

    expect(error.kind).toBe("sign_in_not_owner");
    expect(error.message).not.toContain("someone-else-4Kp9");
    expect(error.message).not.toContain(OWNER_OID);
  });

  it("refuses an ID token that names no object id", async () => {
    const setup = rig();
    setup.entra.claims = { oid: undefined };

    expect(await kindOf(signIn(setup))).toBe("sign_in_not_owner");
  });

  it.each<[string, string | undefined]>([
    ["unset", undefined],
    ["blank", "  "],
  ])(
    "refuses everyone while the owner's object id is %s",
    async (_label, value) => {
      expect(await kindOf(signIn(rigFor(value)))).toBe("sign_in_not_owner");
    },
  );

  it("compares object ids without regard to case or surrounding spaces", async () => {
    const identity = await signIn(rigFor(" OWNER-Object-7HQ2 "));

    expect(identity.objectId).toBe(OWNER_OID);
  });
});

describe("settings", () => {
  const dependencies = {
    clock: new FakeClock(START),
    fetch: () => Promise.reject(new Error("unused")),
    clientAssertion: () => Promise.resolve(ASSERTION),
  };

  it.each<[string, Partial<EntraSignInSettings>]>([
    ["a plain-http issuer", { issuer: "http://login.example.test/t/v2.0" }],
    ["an issuer that is not a URL", { issuer: "tenant-a" }],
    [
      "a plain-http return URL",
      { redirectUri: "http://bridge.example.test/r" },
    ],
    ["an empty client id", { clientId: " " }],
  ])("refuses %s", (_label, change) => {
    let kind: SecurityErrorKind | undefined;
    try {
      new EntraOwnerSignIn({ ...SETTINGS, ...change }, dependencies);
    } catch (error) {
      kind = error instanceof SecurityError ? error.kind : undefined;
    }
    expect(kind).toBe("invalid_settings");
  });

  it("accepts plain http on the machine itself, for the stand-in Entra", () => {
    expect(
      () =>
        new EntraOwnerSignIn(
          {
            ...SETTINGS,
            issuer: "http://localhost:4000/tenant-a/v2.0",
            redirectUri: "http://127.0.0.1:3000/sign-in/return",
          },
          dependencies,
        ),
    ).not.toThrow();
  });
});

describe("what a failed sign-in reveals (FR-034)", () => {
  // Entra's error text often names the app or the directory by GUID, which the log lets through as
  // an identifier, so none of it may reach an error.
  const directoryId = ["5f1e2d3c", "4b5a", "4697", "8887", "766554433221"].join(
    "-",
  );
  const description = `AADSTS50011: The redirect URI does not match app ${directoryId}.`;

  it("never puts the code, verifier, assertion, ID token or Entra's text into an error or a log line", async () => {
    const failures: SecurityError[] = [];
    const marks: string[] = [AUTH_CODE, ASSERTION, description, directoryId];
    const record = async (
      prepare: (setup: Rig) => void,
      edit: (callback: URLSearchParams) => void = () => undefined,
    ): Promise<void> => {
      const setup = rig();
      prepare(setup);
      const { url, pending } = await setup.client.begin({ fresh: true }, NEVER);
      const callback = setup.entra.authorize(url);
      edit(callback);
      marks.push(pending.codeVerifier);
      failures.push(
        await failureOf(setup.client.complete(pending, callback, NEVER)),
      );
      if (setup.entra.lastIdToken !== "") {
        marks.push(setup.entra.lastIdToken);
      }
    };

    await record(
      () => undefined,
      (c) => {
        c.set("error", "access_denied");
        c.set("error_description", description);
      },
    );
    await record(
      () => undefined,
      (c) => {
        c.set("error", "invalid_request");
        c.set("error_description", description);
      },
    );
    for (const status of [400, 503]) {
      await record((setup) => {
        setup.entra.tokenReply = () =>
          json(
            {
              error: "invalid_grant",
              error_description: `${description} ${AUTH_CODE}`,
            },
            status,
          );
      });
    }
    await record((setup) => {
      setup.entra.claims = { nonce: "another-nonce" };
    });
    await record((setup) => {
      setup.entra.claims = { exp: START_S - HOUR_S };
    });
    await record((setup) => {
      setup.entra.claims = { auth_time: START_S - HOUR_S };
    });

    const lines: string[] = [];
    const logger = new Logger({
      sink: (line) => lines.push(line),
      now: () => START,
      minLevel: "debug",
    });
    const texts = failures.map((failure) => {
      logger.error("owner_sign_in_failed", { component: "web" }, failure);
      const cause = failure.cause instanceof Error ? failure.cause : undefined;
      return [
        failure.message,
        failure.stack,
        cause?.message,
        cause?.stack,
      ].join("\n");
    });

    expect(failures).toHaveLength(7);
    for (const text of [...texts, ...lines]) {
      for (const mark of marks) {
        expect(text).not.toContain(mark);
      }
    }
  });
});
