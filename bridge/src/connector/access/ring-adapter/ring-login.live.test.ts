// The live sign-in (T028) against a stubbed `fetch` that answers as Ring's token endpoint does: a
// 412 when a code is needed, a 400 "Verification Code…" for a wrong one, and the token at last. No
// request leaves the machine, and no real credentials are used.
import { afterEach, describe, expect, it, vi } from "vitest";
import { Secret } from "../../../utilities/security/index.ts";
import { openRingLogin } from "./ring-login.live.ts";
import { RingLoginError } from "./ring-login.ts";
import type { RingLogin } from "./ring-login.ts";

const TOKEN_URL = "https://oauth.ring.com/oauth/token";
const HARDWARE_ID = "test-hardware-id";
/** Kept apart, so the text holds no address. */
const AT = "@";
const EMAIL = `owner${AT}example.test`;
const PASSWORD = "not-a-real-password";
const RING_TEXT = "ring-says-something";

interface SeenRequest {
  readonly url: string;
  readonly body: Record<string, unknown>;
  readonly headers: Record<string, string>;
}

function answer(status: number, body: object): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Stubs `fetch` with Ring's answers, in order, and records each request. */
function ringAnswers(...answers: Response[]): SeenRequest[] {
  const seen: SeenRequest[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init: RequestInit) => {
      seen.push({
        url,
        body: JSON.parse(init.body as string) as Record<string, unknown>,
        headers: init.headers as Record<string, string>,
      });
      const next = answers.shift();
      if (next === undefined) {
        throw new Error("The test gave no answer for this request.");
      }
      return Promise.resolve(next);
    }),
  );
  return seen;
}

const logins: RingLogin[] = [];

function login(): RingLogin {
  const opened = openRingLogin(HARDWARE_ID);
  logins.push(opened);
  return opened;
}

afterEach(() => {
  for (const opened of logins.splice(0)) {
    opened.close();
  }
  vi.unstubAllGlobals();
});

describe("the live Ring sign-in", () => {
  it("asks for the code Ring sent, refuses a wrong one, and returns the token in the client's form", async () => {
    const seen = ringAnswers(
      answer(412, { tsv_state: "sms", phone: "+1xxxxxxx12" }),
      answer(400, { error: "Verification Code is invalid or expired" }),
      answer(200, {
        access_token: "access-1",
        refresh_token: "ring-refresh-1",
        expires_in: 3600,
      }),
    );
    const signIn = login();

    const first = await signIn.begin(EMAIL, new Secret(PASSWORD));
    const second = await signIn.complete("000000");
    const third = await signIn.complete("123456");

    expect(first).toEqual({
      kind: "needs_code",
      prompt: "Please enter the code sent to +1xxxxxxx12 via sms",
    });
    expect(second).toEqual({ kind: "wrong_code" });
    if (third.kind !== "signed_in") {
      throw new Error(`expected signed_in, got ${third.kind}`);
    }
    const wrapped = JSON.parse(
      Buffer.from(third.refreshToken.reveal(), "base64").toString("utf8"),
    ) as { rt: string; hid: string };
    expect(wrapped.rt).toBe("ring-refresh-1");
    expect(wrapped.hid).toMatch(/^[0-9a-f-]{36}$/);
    // Every request went to Ring's token endpoint, under one hardware ID, with the code typed.
    expect(seen.map((request) => request.url)).toEqual([
      TOKEN_URL,
      TOKEN_URL,
      TOKEN_URL,
    ]);
    expect(seen.map((request) => request.headers.hardware_id)).toEqual([
      wrapped.hid,
      wrapped.hid,
      wrapped.hid,
    ]);
    expect(seen.map((request) => request.headers["2fa-code"])).toEqual([
      "",
      "000000",
      "123456",
    ]);
    expect(seen[2]?.body).toMatchObject({
      grant_type: "password",
      username: EMAIL,
      password: PASSWORD,
    });
  });

  it("signs in at once when the account has no 2FA", async () => {
    ringAnswers(
      answer(200, { access_token: "a", refresh_token: "r", expires_in: 3600 }),
    );

    const step = await login().begin(EMAIL, new Secret(PASSWORD));

    expect(step.kind).toBe("signed_in");
  });

  it("asks for a code with its own words when Ring does not say where it went", async () => {
    ringAnswers(answer(412, {}));

    const step = await login().begin(EMAIL, new Secret(PASSWORD));

    expect(step).toEqual({
      kind: "needs_code",
      prompt: "Please enter the code sent to your text/email",
    });
  });

  it("counts a new code sent in place of the one typed as a wrong code", async () => {
    ringAnswers(answer(412, {}), answer(412, {}));
    const signIn = login();
    await signIn.begin(EMAIL, new Secret(PASSWORD));

    expect(await signIn.complete("111111")).toEqual({ kind: "wrong_code" });
  });

  it("refuses a wrong email or password with the bridge's own words, never Ring's", async () => {
    ringAnswers(answer(401, { error: RING_TEXT }));

    const error = await login()
      .begin(EMAIL, new Secret(PASSWORD))
      .then(
        () => undefined,
        (failure: unknown) => failure,
      );

    expect(error).toBeInstanceOf(RingLoginError);
    expect(error).toMatchObject({ kind: "refused" });
    expect((error as Error).message).not.toContain(RING_TEXT);
    expect((error as Error).cause).toBeUndefined();
  });

  it("names Ring's limit of 10 codes in 10 minutes", async () => {
    ringAnswers(
      answer(412, {}),
      answer(400, {
        error: RING_TEXT,
        error_description: "too many requests from dependency service",
      }),
    );
    const signIn = login();
    await signIn.begin(EMAIL, new Secret(PASSWORD));

    await expect(signIn.complete("222222")).rejects.toMatchObject({
      kind: "too_many_codes",
    });
  });

  it("refuses a code before the email and password were sent", async () => {
    await expect(login().complete("333333")).rejects.toMatchObject({
      kind: "refused",
    });
  });
});
