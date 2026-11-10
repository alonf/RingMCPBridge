// Web, the admin page (T029), over stand-in managers and a stand-in sign-in: the owner's fresh
// sign-in bound to the browser, the session, the Health section in each state and its poll, and the
// Enroll section's approval with every check: the sign-in's age either side of 5 minutes, the key
// the page showed, the code typed, the lease, the store down. Forms from another site or without
// the session's token change nothing. Markup from the home is shown as text.
import { describe, expect, it } from "vitest";
import { FakeClock } from "../../../utilities/clock/index.ts";
import { Logger } from "../../../utilities/logging/index.ts";
import { SecurityError } from "../../../utilities/security/index.ts";
import type {
  OwnerIdentity,
  OwnerSignIn,
  PendingSignIn,
  SignInStartOptions,
} from "../../../utilities/security/index.ts";
import { AdminError } from "../../managers/admin/index.ts";
import type {
  ConnectorEnrollmentApproval,
  ConnectorEnrollmentPending,
} from "../../managers/admin/index.ts";
import { InquiryError } from "../../managers/inquiry/index.ts";
import type { OwnerHealth } from "../../managers/inquiry/index.ts";
import {
  FRESH_SIGN_IN_MS,
  SESSION_IDLE_MS,
  SESSION_MAX_MS,
  Web,
} from "./index.ts";

const START = Date.UTC(2026, 10, 10, 9, 0, 0);
const PUBLIC_URL = "https://bridge.example.test";
const CORE_VERSION = "0.2.0";
const KEY_ID = "key-shown-000001";
const NEWER_KEY_ID = "key-newer-000002";
const CODE = "7Q4K-29XM";
const SECOND_MS = 1_000;

interface Fakes {
  readonly clock: FakeClock;
  readonly web: Web;
  readonly lines: string[];
  readonly begun: SignInStartOptions[];
  readonly completed: PendingSignIn[];
  readonly approved: string[];
  pending: ConnectorEnrollmentPending | undefined;
  approval: () => Promise<ConnectorEnrollmentApproval>;
  pendingRead: () => Promise<ConnectorEnrollmentPending | undefined>;
  health: () => Promise<OwnerHealth>;
  serving: boolean;
  signInOutcome: () => Promise<OwnerIdentity>;
}

function ownerHealth(
  changes: Partial<OwnerHealth["health"]["data"]> = {},
  connectorVersion: string | null = CORE_VERSION,
  staleSince?: string,
): OwnerHealth {
  const since = "2026-11-10T08:00:00Z";
  return {
    health: {
      as_of: "2026-11-10T08:59:50Z",
      as_of_local: "2026-11-10T10:59:50+02:00",
      freshness: staleSince === undefined ? "cached" : "stale",
      ...(staleSince === undefined ? {} : { stale_since: staleSince }),
      data: {
        home_link: { status: "up", since },
        ring_session: { status: "ok", since },
        database: { status: "ok" },
        ...changes,
      },
    },
    time_zone: "Asia/Jerusalem",
    ...(connectorVersion === null
      ? {}
      : { connector_version: connectorVersion }),
  };
}

function setUp(): Fakes {
  const clock = new FakeClock(START);
  const lines: string[] = [];
  const fakes: Omit<Fakes, "web"> & { web?: Web } = {
    clock,
    lines,
    begun: [],
    completed: [],
    approved: [],
    pending: undefined,
    approval: () =>
      Promise.resolve({ kind: "approved", revokedKeyIds: ["key-older-00003"] }),
    pendingRead: () => Promise.resolve(fakes.pending),
    health: () => Promise.resolve(ownerHealth()),
    serving: true,
    signInOutcome: () =>
      Promise.resolve({
        subject: "owner-subject",
        objectId: "owner-object",
        authenticatedAt: clock.now(),
        authenticatedAtSource: "auth_time",
      }),
  };
  let started = 0;
  const ownerSignIn: OwnerSignIn = {
    begin: (options) => {
      fakes.begun.push(options);
      started += 1;
      const state = `state-${String(started)}`;
      return Promise.resolve({
        url: `https://login.example.test/authorize?state=${state}`,
        pending: {
          state,
          nonce: "nonce",
          codeVerifier: "verifier",
          startedAt: clock.now(),
          fresh: options.fresh,
        },
      });
    },
    complete: (pending) => {
      fakes.completed.push(pending);
      return fakes.signInOutcome();
    },
  };
  const web = new Web(
    { publicUrl: PUBLIC_URL, coreVersion: CORE_VERSION },
    {
      admin: {
        pendingEnrollment: () => fakes.pendingRead(),
        approveEnrollment: (keyId) => {
          fakes.approved.push(keyId);
          return fakes.approval();
        },
      },
      inquiry: { getOwnerHealth: () => fakes.health() },
      ownerSignIn,
      serving: () => fakes.serving,
      clock,
      logger: new Logger({
        sink: (line) => lines.push(line),
        now: () => clock.now(),
        minLevel: "debug",
      }),
    },
  );
  return Object.assign(fakes, { web });
}

function get(web: Web, path: string, cookies?: string): Promise<Response> {
  return web.fetch(
    new Request(`${PUBLIC_URL}${path}`, {
      headers: cookies === undefined ? {} : { cookie: cookies },
    }),
  );
}

function post(
  web: Web,
  path: string,
  form: Record<string, string>,
  options: { readonly cookies?: string; readonly origin?: string | null } = {},
): Promise<Response> {
  const headers: Record<string, string> = {
    "content-type": "application/x-www-form-urlencoded",
  };
  if (options.cookies !== undefined) {
    headers.cookie = options.cookies;
  }
  if (options.origin !== null) {
    headers.origin = options.origin ?? PUBLIC_URL;
  }
  return web.fetch(
    new Request(`${PUBLIC_URL}${path}`, {
      method: "POST",
      headers,
      body: new URLSearchParams(form).toString(),
    }),
  );
}

function cookieFrom(response: Response, name: string): string | undefined {
  return response.headers
    .getSetCookie()
    .find((cookie) => cookie.startsWith(`${name}=`));
}

function valueOf(setCookie: string | undefined): string {
  return setCookie?.split(";")[0] ?? "";
}

/** Signs in as the owner: the session cookie as a `Cookie` header. */
async function signIn(fakes: Fakes, then?: "enroll"): Promise<string> {
  const started = await get(
    fakes.web,
    `/admin/sign-in${then === undefined ? "" : `?then=${then}`}`,
  );
  const state = new URL(started.headers.get("location") ?? "").searchParams.get(
    "state",
  );
  const returned = await get(
    fakes.web,
    `/sign-in/return?state=${state ?? ""}&code=entra-code`,
    valueOf(cookieFrom(started, "admin_sign_in")),
  );
  expect(returned.status).toBe(303);
  return valueOf(cookieFrom(returned, "admin_session"));
}

async function pageOf(fakes: Fakes, session: string): Promise<string> {
  const page = await get(fakes.web, "/admin", session);
  expect(page.status).toBe(200);
  return page.text();
}

function formToken(page: string): string {
  return /name="form_token" value="([^"]+)"/.exec(page)?.[1] ?? "";
}

function noticeOn(page: string): string {
  return /role="status"\s*>.*?<p>\s*(.*?)\s*<\/p>/s.exec(page)?.[1] ?? "";
}

async function approve(
  fakes: Fakes,
  session: string,
  confirmation: string,
  keyId = KEY_ID,
): Promise<string> {
  const page = await pageOf(fakes, session);
  const answer = await post(
    fakes.web,
    "/admin/enroll/approve",
    { form_token: formToken(page), key_id: keyId, confirmation },
    { cookies: session },
  );
  expect(answer.status).toBe(303);
  expect(answer.headers.get("location")).toBe("/admin#enroll");
  return noticeOn(await pageOf(fakes, session));
}

function waiting(keyId = KEY_ID, code = CODE): ConnectorEnrollmentPending {
  return {
    key_id: keyId,
    enrollment_code: code,
    requested_at: START,
    expires_at: START + 10 * 60 * SECOND_MS,
  };
}

describe("the admin page's sign-in", () => {
  it("shows the sign-in page to anyone not signed in, under the page's policy", async () => {
    const { web } = setUp();

    const page = await get(web, "/admin");

    expect(page.status).toBe(200);
    expect(await page.text()).toContain(`href="/admin/sign-in"`);
    expect(page.headers.get("content-security-policy")).toContain(
      "frame-ancestors 'none'",
    );
    expect(page.headers.get("content-security-policy")).toContain(
      "script-src 'self'",
    );
    expect(page.headers.get("x-content-type-options")).toBe("nosniff");
    expect(page.headers.get("cache-control")).toBe("no-store");
    expect(page.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("starts a fresh sign-in bound to this browser, and opens a session on its return", async () => {
    const fakes = setUp();

    const started = await get(fakes.web, "/admin/sign-in?then=enroll");

    expect(started.status).toBe(303);
    expect(started.headers.get("location")).toContain(
      "https://login.example.test/",
    );
    expect(fakes.begun).toEqual([{ fresh: true }]);
    const binding = cookieFrom(started, "admin_sign_in") ?? "";
    expect(binding).toContain("Path=/sign-in/return");
    expect(binding).toContain("HttpOnly");
    expect(binding).toContain("Secure");
    expect(binding).toContain("SameSite=Lax");

    const returned = await get(
      fakes.web,
      "/sign-in/return?state=state-1&code=entra-code",
      valueOf(binding),
    );

    expect(returned.status).toBe(303);
    expect(returned.headers.get("location")).toBe("/admin#enroll");
    const session = cookieFrom(returned, "admin_session") ?? "";
    expect(session).toContain("Path=/admin");
    expect(session).toContain("HttpOnly");
    const page = await pageOf(fakes, valueOf(session));
    expect(page).toContain(`id="health"`);
    expect(page).toContain(`id="enroll"`);
    expect(fakes.lines.join("\n")).toContain("web_owner_signed_in");
    expect(fakes.lines.join("\n")).not.toContain("owner-subject");
  });

  it("refuses a return in another browser before Entra's code is redeemed", async () => {
    const fakes = setUp();
    await get(fakes.web, "/admin/sign-in");

    const returned = await get(
      fakes.web,
      "/sign-in/return?state=state-1&code=entra-code",
      "admin_sign_in=another-browser",
    );

    expect(returned.headers.get("location")).toBe(
      "/admin?problem=other_browser",
    );
    expect(fakes.completed).toEqual([]);
    expect(cookieFrom(returned, "admin_session")).toBeUndefined();
  });

  it("takes each sign-in once: an unknown or used state shows the sign-in page again", async () => {
    const fakes = setUp();
    await signIn(fakes);

    const again = await get(fakes.web, "/sign-in/return?state=state-1&code=x");

    expect(again.headers.get("location")).toBe("/admin?problem=expired");
    const page = await (await get(fakes.web, "/admin?problem=expired")).text();
    expect(page).toContain("That sign-in has ended. Sign in again.");
  });

  it("opens no session for anyone but the owner, and says why", async () => {
    const fakes = setUp();
    fakes.signInOutcome = () =>
      Promise.reject(new SecurityError("sign_in_not_owner", "Not the owner."));
    const started = await get(fakes.web, "/admin/sign-in");

    const returned = await get(
      fakes.web,
      "/sign-in/return?state=state-1&code=entra-code",
      valueOf(cookieFrom(started, "admin_sign_in")),
    );

    expect(returned.headers.get("location")).toBe("/admin?problem=not_owner");
    expect(cookieFrom(returned, "admin_session")).toBeUndefined();
  });

  it("ends the session on sign-out, and after 30 idle minutes or 8 hours", async () => {
    const fakes = setUp();
    const session = await signIn(fakes);
    const page = await pageOf(fakes, session);

    const out = await post(
      fakes.web,
      "/admin/sign-out",
      { form_token: formToken(page) },
      { cookies: session },
    );

    expect(out.headers.get("location")).toBe("/admin?problem=signed_out");
    expect(await (await get(fakes.web, "/admin", session)).text()).toContain(
      `href="/admin/sign-in"`,
    );

    const idle = await signIn(fakes);
    await fakes.clock.advance(SESSION_IDLE_MS);
    expect((await get(fakes.web, "/admin/health", idle)).status).toBe(401);

    const kept = await signIn(fakes);
    for (let used = 0; used < SESSION_MAX_MS; used += SESSION_IDLE_MS / 2) {
      await fakes.clock.advance(SESSION_IDLE_MS / 2);
      await get(fakes.web, "/admin/health", kept);
    }
    expect((await get(fakes.web, "/admin/health", kept)).status).toBe(401);
  });
});

describe("the admin page's Health section", () => {
  it("shows each part as a word and an icon, with its time, and a current connector", async () => {
    const fakes = setUp();
    const session = await signIn(fakes);

    const page = await pageOf(fakes, session);

    expect(page).toContain("as of 10 Nov 2026, 10:59:50");
    expect(page).toMatch(
      /Home link<\/span\s*>\s*<span class="badge tone-ok"\s*>\s*<svg[^>]*>.*?<\/svg>\s*Connected/s,
    );
    expect(page).toContain("since 10 Nov 2026, 10:00:00");
    expect(page).toMatch(
      /Connector<\/span\s*>\s*<span class="badge tone-ok"\s*>.*?Current/s,
    );
    expect(page).not.toContain(`class="banner banner-bad"`);
  });

  it.each([
    [
      "the home offline",
      ownerHealth({
        home_link: { status: "down", since: "2026-11-10T08:30:00Z" },
      }),
      "The home is offline",
    ],
    [
      "the Ring session lost",
      ownerHealth({
        ring_session: { status: "lost", since: "2026-11-10T08:30:00Z" },
      }),
      "Ring signed the home out",
    ],
    [
      "the store down",
      ownerHealth({ database: { status: "down" } }),
      "The bridge&#39;s database is not answering",
    ],
    [
      "the data stale",
      ownerHealth({}, CORE_VERSION, "2026-11-10T08:40:00Z"),
      "The home&#39;s data is out of date since 10 Nov 2026, 10:40:00",
    ],
  ])("shows a banner with what to do for %s", async (_name, health, title) => {
    const fakes = setUp();
    fakes.health = () => Promise.resolve(health);
    const session = await signIn(fakes);

    const page = await pageOf(fakes, session);

    expect(page).toContain(title);
  });

  it("says the connector is behind the core, and what to do", async () => {
    const fakes = setUp();
    fakes.health = () => Promise.resolve(ownerHealth({}, "0.1.9"));
    const session = await signIn(fakes);

    const page = await pageOf(fakes, session);

    expect(page).toMatch(
      /Connector<\/span\s*>\s*<span class="badge tone-warn"\s*>.*?Update/s,
    );
    expect(page).toContain(
      "v0.1.9; the core is v0.2.0. Pull the new image at home",
    );
  });

  it("says when no connector has linked yet", async () => {
    const fakes = setUp();
    fakes.health = () => Promise.resolve(ownerHealth({}, null));
    const session = await signIn(fakes);

    const page = await pageOf(fakes, session);

    expect(page).toMatch(
      /Connector<\/span\s*>\s*<span class="badge tone-none"\s*>.*?Not linked/s,
    );
    expect(page).toContain("No connector has linked yet.");
  });

  it("renders the page with the store-down banner when the health cannot be read", async () => {
    const fakes = setUp();
    fakes.health = () =>
      Promise.reject(
        new InquiryError("unavailable", "The health could not be read."),
      );
    const session = await signIn(fakes);

    const page = await get(fakes.web, "/admin", session);

    expect(page.status).toBe(200);
    const text = await page.text();
    expect(text).toContain("The bridge&#39;s database is not answering");
    expect(text).toContain("No health could be read.");
    expect(fakes.lines.join("\n")).toContain("web_health_not_read");
  });

  it("answers the poll with the section alone, and a signed-out notice once the session ends", async () => {
    const fakes = setUp();
    const session = await signIn(fakes);

    const polled = await get(fakes.web, "/admin/health", session);
    const signedOut = await get(fakes.web, "/admin/health");

    expect(polled.status).toBe(200);
    const section = await polled.text();
    expect(section.startsWith(`<section id="health"`)).toBe(true);
    expect(section).not.toContain(`id="enroll"`);
    expect(signedOut.status).toBe(401);
    expect(await signedOut.text()).toContain("You are signed out");
  });

  it("shows an error page, and logs it, when a read fails unexpectedly", async () => {
    const fakes = setUp();
    fakes.health = () => Promise.reject(new TypeError("a bug"));
    const session = await signIn(fakes);

    const page = await get(fakes.web, "/admin", session);

    expect(page.status).toBe(500);
    expect(await page.text()).toContain("Something went wrong on the bridge.");
    expect(fakes.lines.join("\n")).toContain("web_request_failed");
  });
});

describe("the admin page's Enroll section", () => {
  it("shows the waiting request's code as text, never as markup", async () => {
    const fakes = setUp();
    fakes.pending = waiting(KEY_ID, `<b onclick="x()">ABCD</b>`);
    const session = await signIn(fakes);

    const page = await pageOf(fakes, session);

    expect(page).toContain("&lt;b onclick=&quot;x()&quot;&gt;ABCD&lt;/b&gt;");
    expect(page).not.toContain(`<b onclick`);
    expect(page).toContain(`name="key_id" value="${KEY_ID}"`);
  });

  it("says when no connector is asking", async () => {
    const fakes = setUp();
    const session = await signIn(fakes);

    expect(await pageOf(fakes, session)).toContain(
      "No connector is asking to enroll.",
    );
  });

  it("approves the key the page showed when its code is typed, in any case and without the dash", async () => {
    const fakes = setUp();
    fakes.pending = waiting();
    const session = await signIn(fakes);

    const notice = await approve(fakes, session, "7q4k 29xm");

    expect(fakes.approved).toEqual([KEY_ID]);
    expect(notice).toBe(
      "Approved. The connector links within a minute. 1 older connector key was revoked.",
    );
    expect(fakes.lines.join("\n")).toContain(`"key_id":"${KEY_ID}"`);
  });

  it("approves nothing when a newer request replaced the one shown", async () => {
    const fakes = setUp();
    fakes.pending = waiting();
    const session = await signIn(fakes);
    const page = await pageOf(fakes, session);
    fakes.pending = waiting(NEWER_KEY_ID, "NEW2-NEW2");

    await post(
      fakes.web,
      "/admin/enroll/approve",
      { form_token: formToken(page), key_id: KEY_ID, confirmation: CODE },
      { cookies: session },
    );

    expect(fakes.approved).toEqual([]);
    const next = await pageOf(fakes, session);
    expect(noticeOn(next)).toContain(
      "a newer one replaced it. Nothing was approved.",
    );
    expect(next).toContain("NEW2-NEW2");
  });

  it("says so when the request ends between the check and the approval", async () => {
    const fakes = setUp();
    fakes.pending = waiting();
    fakes.approval = () => Promise.resolve({ kind: "not_pending" });
    const session = await signIn(fakes);

    expect(await approve(fakes, session, CODE)).toContain(
      "Nothing was approved.",
    );
  });

  it("approves nothing when the typed code does not match", async () => {
    const fakes = setUp();
    fakes.pending = waiting();
    const session = await signIn(fakes);

    const notice = await approve(fakes, session, "7Q4K-29XN");

    expect(fakes.approved).toEqual([]);
    expect(notice).toContain("does not match");
  });

  it("needs a sign-in under 5 minutes old: the form until then, a new sign-in from then", async () => {
    const fakes = setUp();
    fakes.pending = waiting();
    const session = await signIn(fakes);
    await fakes.clock.advance(FRESH_SIGN_IN_MS - SECOND_MS);
    const page = await pageOf(fakes, session);
    expect(page).toContain(`action="/admin/enroll/approve"`);
    await fakes.clock.advance(SECOND_MS);

    const stale = await post(
      fakes.web,
      "/admin/enroll/approve",
      { form_token: formToken(page), key_id: KEY_ID, confirmation: CODE },
      { cookies: session },
    );

    expect(stale.status).toBe(303);
    expect(fakes.approved).toEqual([]);
    const next = await pageOf(fakes, session);
    expect(noticeOn(next)).toContain("more than 5 minutes old");
    expect(next).not.toContain(`action="/admin/enroll/approve"`);
    expect(next).toContain(`href="/admin/sign-in?then=enroll"`);

    const fresh = await signIn(fakes, "enroll");
    expect(await approve(fakes, fresh, CODE)).toContain("Approved.");
    expect(fakes.approved).toEqual([KEY_ID]);
  });

  it("approves nothing on a core instance without the lease, or with the store down", async () => {
    const fakes = setUp();
    fakes.pending = waiting();
    const session = await signIn(fakes);
    fakes.serving = false;

    expect(await approve(fakes, session, CODE)).toContain("not serving");

    fakes.serving = true;
    fakes.approval = () =>
      Promise.reject(
        new AdminError("unavailable", "The enrollment could not be approved."),
      );
    expect(await approve(fakes, session, CODE)).toContain(
      "database did not answer",
    );
  });

  it("shows the section's own state when the request cannot be read", async () => {
    const fakes = setUp();
    fakes.pendingRead = () =>
      Promise.reject(
        new AdminError("unavailable", "The request could not be read."),
      );
    const session = await signIn(fakes);

    expect(await pageOf(fakes, session)).toContain(
      "The enrollment request could not be read",
    );
  });
});

describe("the admin page's forms", () => {
  it("refuses a form from another site, or with no Origin, and changes nothing", async () => {
    const fakes = setUp();
    fakes.pending = waiting();
    const session = await signIn(fakes);
    const token = formToken(await pageOf(fakes, session));

    for (const origin of ["https://evil.example.test", null]) {
      const refused = await post(
        fakes.web,
        "/admin/enroll/approve",
        { form_token: token, key_id: KEY_ID, confirmation: CODE },
        { cookies: session, origin },
      );
      expect(refused.status).toBe(403);
    }
    expect(fakes.approved).toEqual([]);
  });

  it("refuses a form without the session's token, and sends one without a session to sign in", async () => {
    const fakes = setUp();
    fakes.pending = waiting();
    const session = await signIn(fakes);

    const wrong = await post(
      fakes.web,
      "/admin/enroll/approve",
      { form_token: "not-the-token", key_id: KEY_ID, confirmation: CODE },
      { cookies: session },
    );
    const none = await post(fakes.web, "/admin/enroll/approve", {
      form_token: "x",
      key_id: KEY_ID,
      confirmation: CODE,
    });

    expect(wrong.status).toBe(403);
    expect(none.headers.get("location")).toBe("/admin?problem=expired");
    expect(fakes.approved).toEqual([]);
  });
});

describe("the admin page's theme", () => {
  it("is dark by default, light once chosen, and the choice is a cookie the page script may read", async () => {
    const fakes = setUp();

    expect(await (await get(fakes.web, "/admin")).text()).toContain(
      `data-theme="dark"`,
    );
    const chosen = await post(fakes.web, "/admin/theme", { theme: "light" });
    const cookie = cookieFrom(chosen, "admin_theme") ?? "";

    expect(chosen.headers.get("location")).toBe("/admin");
    expect(cookie).toContain("admin_theme=light");
    expect(cookie).not.toContain("HttpOnly");
    expect(
      await (await get(fakes.web, "/admin", valueOf(cookie))).text(),
    ).toContain(`data-theme="light"`);
  });

  it("serves its stylesheet and script from its own paths", async () => {
    const { web } = setUp();

    const style = await get(web, "/admin/app.css");
    const script = await get(web, "/admin/app.js");

    expect(style.headers.get("content-type")).toContain("text/css");
    expect(await style.text()).toContain(`:root[data-theme="light"]`);
    expect(script.headers.get("content-type")).toContain("text/javascript");
    const code = await script.text();
    expect(code).toContain(`"/admin/health"`);
    expect(code).toContain("15000");
    expect((await get(web, "/admin/elsewhere")).status).toBe(404);
  });
});

describe("the admin page's edges", () => {
  it("says so when Entra cannot start a sign-in", async () => {
    const fakes = setUp();
    const web = new Web(
      { publicUrl: PUBLIC_URL, coreVersion: CORE_VERSION },
      {
        admin: {
          pendingEnrollment: () => Promise.resolve(undefined),
          approveEnrollment: () => Promise.resolve({ kind: "not_pending" }),
        },
        inquiry: { getOwnerHealth: () => Promise.resolve(ownerHealth()) },
        ownerSignIn: {
          begin: () =>
            Promise.reject(
              new SecurityError("sign_in_unavailable", "Entra is down."),
            ),
          complete: () => Promise.reject(new Error("not reached")),
        },
        serving: () => true,
        clock: fakes.clock,
        logger: new Logger({
          sink: () => undefined,
          now: () => 0,
          minLevel: "debug",
        }),
      },
    );

    const started = await get(web, "/admin/sign-in");

    expect(started.headers.get("location")).toBe("/admin?problem=unavailable");
    expect(cookieFrom(started, "admin_sign_in")).toBeUndefined();
  });

  it("lets a sign-in in flight end after 10 minutes, and keeps at most 20", async () => {
    const fakes = setUp();
    const first = await get(fakes.web, "/admin/sign-in");
    await fakes.clock.advance(10 * 60 * SECOND_MS);

    const late = await get(
      fakes.web,
      "/sign-in/return?state=state-1&code=entra-code",
      valueOf(cookieFrom(first, "admin_sign_in")),
    );
    expect(late.headers.get("location")).toBe("/admin?problem=expired");

    const bindings: string[] = [];
    for (let started = 0; started < 21; started += 1) {
      bindings.push(
        valueOf(
          cookieFrom(await get(fakes.web, "/admin/sign-in"), "admin_sign_in"),
        ),
      );
    }
    const pushedOut = await get(
      fakes.web,
      "/sign-in/return?state=state-2&code=entra-code",
      bindings[0],
    );
    const kept = await get(
      fakes.web,
      "/sign-in/return?state=state-22&code=entra-code",
      bindings[20],
    );
    expect(pushedOut.headers.get("location")).toBe("/admin?problem=expired");
    expect(kept.headers.get("location")).toBe("/admin#health");
  });

  it("keeps at most 20 sessions, ending the oldest first", async () => {
    const fakes = setUp();
    const sessions: string[] = [];
    for (let opened = 0; opened < 21; opened += 1) {
      sessions.push(await signIn(fakes));
    }

    expect((await get(fakes.web, "/admin/health", sessions[0])).status).toBe(
      401,
    );
    expect((await get(fakes.web, "/admin/health", sessions[20])).status).toBe(
      200,
    );
  });

  it("refuses a sign-out or a theme from another site", async () => {
    const fakes = setUp();
    const session = await signIn(fakes);
    const token = formToken(await pageOf(fakes, session));

    const out = await post(
      fakes.web,
      "/admin/sign-out",
      { form_token: token },
      { cookies: session, origin: "https://evil.example.test" },
    );
    const theme = await post(
      fakes.web,
      "/admin/theme",
      { theme: "light" },
      { origin: "https://evil.example.test" },
    );

    expect(out.status).toBe(403);
    expect(theme.status).toBe(403);
    expect(cookieFrom(theme, "admin_theme")).toBeUndefined();
    expect((await get(fakes.web, "/admin/health", session)).status).toBe(200);
  });

  it("shows an error page when an approval or a read fails unexpectedly", async () => {
    const fakes = setUp();
    fakes.pending = waiting();
    const session = await signIn(fakes);
    const token = formToken(await pageOf(fakes, session));
    fakes.approval = () => Promise.reject(new TypeError("a bug"));

    const approval = await post(
      fakes.web,
      "/admin/enroll/approve",
      { form_token: token, key_id: KEY_ID, confirmation: CODE },
      { cookies: session },
    );
    fakes.pendingRead = () => Promise.reject(new TypeError("another bug"));
    const read = await get(fakes.web, "/admin", session);

    expect(approval.status).toBe(500);
    expect(read.status).toBe(500);
  });
});
