// The Entra stand-in (T010) signs the owner in through the bridge's own sign-in client (T006), with
// Entra's issuer shape and claims.
import { decodeJwt } from "jose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SystemClock } from "../../src/utilities/clock/index.ts";
import { EntraOwnerSignIn } from "../../src/utilities/security/index.ts";
import type { HttpFetch } from "../../src/utilities/security/index.ts";
import { startEntraStandIn } from "./index.ts";
import type { EntraStandIn } from "./index.ts";

const REDIRECT_URI = "http://127.0.0.1:9/owner/signed-in";
const ENTRA_ISSUER_PATH = /^\/[0-9a-f-]{36}\/v2\.0$/;

function never(): AbortSignal {
  return new AbortController().signal;
}

describe("the Entra stand-in", () => {
  let standIn: EntraStandIn;
  const idTokens: string[] = [];

  // The real fetch, keeping each ID token the token endpoint returns.
  const recordingFetch: HttpFetch = async (url, init) => {
    const response = await fetch(url, init);
    if (url.endsWith("/token") && response.ok) {
      const body = (await response.clone().json()) as { id_token?: string };
      idTokens.push(body.id_token ?? "");
    }
    return response;
  };

  function signIn(): EntraOwnerSignIn {
    return new EntraOwnerSignIn(
      {
        issuer: standIn.issuer,
        clientId: standIn.clientId,
        redirectUri: REDIRECT_URI,
        ownerObjectId: standIn.owner.objectId,
      },
      {
        clock: new SystemClock(),
        fetch: recordingFetch,
        clientAssertion: (signal) => standIn.clientAssertion(signal),
      },
    );
  }

  beforeAll(async () => {
    standIn = await startEntraStandIn({ redirectUri: REDIRECT_URI });
  });

  afterAll(async () => {
    await standIn.close();
  });

  it("names its issuer by tenant id, as Entra does", async () => {
    expect(new URL(standIn.issuer).pathname).toMatch(ENTRA_ISSUER_PATH);
    expect(standIn.issuer).toContain(standIn.tenantId);
    const response = await fetch(
      `${standIn.issuer}/.well-known/openid-configuration`,
    );

    await expect(response.json()).resolves.toMatchObject({
      issuer: standIn.issuer,
    });
  });

  it("signs the owner in through the bridge's sign-in client, with Entra's claims", async () => {
    const client = signIn();
    const { url, pending } = await client.begin({ fresh: false }, never());

    const callback = await standIn.signInAsOwner(url);
    const identity = await client.complete(pending, callback, never());

    expect(identity).toMatchObject({
      subject: standIn.owner.subject,
      objectId: standIn.owner.objectId,
    });
    expect(decodeJwt(idTokens.at(-1) ?? "")).toMatchObject({
      sub: standIn.owner.subject,
      oid: standIn.owner.objectId,
      tid: standIn.tenantId,
    });
  });

  it("completes a fresh sign-in, which needs auth_time", async () => {
    const client = signIn();
    const { url, pending } = await client.begin({ fresh: true }, never());

    const callback = await standIn.signInAsOwner(url);

    await expect(
      client.complete(pending, callback, never()),
    ).resolves.toMatchObject({
      subject: standIn.owner.subject,
      authenticatedAtSource: "auth_time",
    });
  });

  it("signs in a stranger from the same tenant, whom the sign-in client refuses", async () => {
    const client = signIn();
    const { url, pending } = await client.begin({ fresh: true }, never());
    standIn.signInNext(standIn.stranger);
    try {
      const callback = await standIn.signInAsOwner(url);

      await expect(
        client.complete(pending, callback, never()),
      ).rejects.toMatchObject({ kind: "sign_in_not_owner" });
      expect(decodeJwt(idTokens.at(-1) ?? "")).toMatchObject({
        sub: standIn.stranger.subject,
        oid: standIn.stranger.objectId,
      });
    } finally {
      standIn.signInNext(standIn.owner);
    }
  });

  it("sends the object id only when the profile scope is asked for, as Entra does", async () => {
    const response = await fetch(
      `${standIn.issuer}/.well-known/openid-configuration`,
    );
    const metadata = (await response.json()) as {
      scopes_supported?: string[];
      claims_supported?: string[];
    };

    expect(metadata.scopes_supported).toEqual(
      expect.arrayContaining(["openid", "profile"]),
    );
    const client = signIn();
    const { url, pending } = await client.begin({ fresh: false }, never());
    const openidOnly = new URL(url);
    openidOnly.searchParams.set("scope", "openid");
    const callback = await standIn.signInAsOwner(openidOnly.href);

    await expect(
      client.complete(pending, callback, never()),
    ).rejects.toMatchObject({ kind: "sign_in_not_owner" });
    expect(decodeJwt(idTokens.at(-1) ?? "")).not.toHaveProperty("oid");
  });

  it("answers 404 outside the tenant's path", async () => {
    const response = await fetch(new URL("/elsewhere", standIn.issuer));

    expect(response.status).toBe(404);
  });

  it("refuses an assertion after the caller has gone", async () => {
    const gone = new AbortController();
    gone.abort(new Error("caller gone"));

    await expect(standIn.clientAssertion(gone.signal)).rejects.toThrow(
      "caller gone",
    );
  });
});
