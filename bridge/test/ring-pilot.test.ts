import { createHmac } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { pilotApp } from "../dev/ring-pilot/app.ts";
import { InvalidRingGrant, ringClient } from "../dev/ring-pilot/client.ts";
import { PilotLinks } from "../dev/ring-pilot/links.ts";

const START = 1_800_000_000_000;
const SIGNING = "synthetic test key";
const ID = "pilot-test";
const TOKEN = "/ring/token";
const HOME = "/ring/home";
const LINK = "/ring/link";
const HOOK = "/ring/webhook";
const form = (data: Record<string, string>, cookie = "") => ({
  method: "POST",
  body: new URLSearchParams(data),
  headers: { cookie },
});
function setup(
  snapshotTarget?: Parameters<typeof pilotApp>[4],
  store?: PilotLinks,
) {
  const clock = { now: START };
  const ring = {
    exchange: vi
      .fn()
      .mockResolvedValue({ access_token: "demo", expires_in: 14_400 }),
    identity: vi.fn().mockResolvedValue({
      id: "account1",
      attributes: { email: "owner@example.com" },
    }),
    activate: vi
      .fn<ReturnType<typeof ringClient>["activate"]>()
      .mockResolvedValue(undefined),
    devices: vi.fn().mockResolvedValue(["<test camera>"]),
    snapshot: vi.fn<ReturnType<typeof ringClient>["snapshot"]>(),
    refresh: vi.fn<ReturnType<typeof ringClient>["refresh"]>(),
  };
  const { app } = pilotApp(
    ID,
    SIGNING,
    ring,
    () => clock.now,
    snapshotTarget,
    store,
  );
  const issue = (code = "test-code") =>
    app.request(TOKEN, form({ code, client_id: ID }));
  const time = String(START);
  const nonce = createHmac("sha256", SIGNING)
    .update(time + ":account1")
    .digest("base64url");
  const visit = () => app.request(LINK + "?time=" + time + "&nonce=" + nonce);
  async function consent() {
    const page = await visit();
    expect(page.status).toBe(200);
    const cookie = page.headers.get("set-cookie")?.split(";")[0] ?? "";
    const proof =
      /name="proof"\s+value="([^"]+)"/.exec(await page.text())?.[1] ?? "";
    expect(proof).toHaveLength(43);
    return (snapshot = "") =>
      app.request(LINK, form({ time, nonce, proof, snapshot }, cookie));
  }
  return { ring, app, issue, visit, consent, clock, nonce, time };
}
describe("official Ring private-app pilot", () => {
  it("restores a confirmed grant and browser after restart, rotates tokens once across concurrent reads and signs in a new browser", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ring-pilot-test-"));
    const database = join(dir, "private.sqlite");
    let store = new PilotLinks(database, ID, "synthetic storage key");
    try {
      const first = setup(undefined, store);
      first.ring.exchange.mockResolvedValueOnce({
        access_token: "first",
        refresh_token: "refresh-1",
        expires_in: 3600,
      });
      await first.issue();
      const linked = await (await first.consent())();
      const header = linked.headers.get("set-cookie") ?? "";
      expect(header).toContain("SameSite=Lax");
      const cookie = header.split(";")[0] ?? "";
      store.close();
      expect(readFileSync(database).includes(Buffer.from("refresh-1"))).toBe(
        false,
      );
      store = new PilotLinks(database, ID, "synthetic storage key");
      const next = setup(undefined, store);
      next.clock.now += 3_700_000;
      next.ring.refresh.mockResolvedValue({
        access_token: "second",
        refresh_token: "refresh-2",
        expires_in: 14400,
      });
      const read = () => next.app.request(HOME, { headers: { cookie } });
      for (const page of await Promise.all([read(), read()]))
        expect(await page.text()).toContain("Shared devices");
      expect(next.ring.refresh).toHaveBeenCalledExactlyOnceWith("refresh-1");
      expect(next.ring.devices).toHaveBeenCalledWith("second");
      const landing = await next.app.request(HOME);
      const landingText = await landing.text();
      expect(landingText).not.toContain("example.com");
      const proof =
        /name="proof"\s+value="([^"]+)"/.exec(landingText)?.[1] ?? "";
      const signinCookie =
        landing.headers.get("set-cookie")?.split(";")[0] ?? "";
      const code = store.browserCode(next.clock.now);
      const signin = await next.app.request(
        "/ring/sign-in",
        form({ code, proof }, signinCookie),
      );
      expect(signin.status).toBe(303);
      expect(
        (
          await next.app.request(
            "/ring/sign-in",
            form({ code, proof }, signinCookie),
          )
        ).status,
      ).toBe(403);
      expect(
        await (
          await next.app.request(HOME, {
            headers: {
              cookie: signin.headers.get("set-cookie")?.split(";")[0] ?? "",
            },
          })
        ).text(),
      ).toContain("Shared devices");
      expect(await (await read()).text()).toContain("Shared devices");
      const body = JSON.stringify({
        data: {
          type: "app_integration_removed",
          attributes: { source: "account1" },
        },
      });
      await next.app.request(HOOK, {
        method: "POST",
        body,
        headers: {
          "X-Signature":
            "sha256=" +
            createHmac("sha256", SIGNING).update(body).digest("hex"),
        },
      });
      expect(store.load()).toHaveLength(0);
      expect(await (await read()).text()).toContain("No saved Ring connection");
    } finally {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it("saves only the named camera after explicit consent, and retries without relinking", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { app, ring, issue, consent } = setup({ name: "Outside", save });
    expect(
      (await app.request("/ring/snapshot", form({ proof: "missing" }))).status,
    ).toBe(403);
    await issue();
    const done = await (await consent())();
    expect(ring.snapshot).not.toHaveBeenCalled();
    const cookie = done.headers.get("set-cookie")?.split(";")[0] ?? "";
    const home = async () =>
      (await app.request(HOME, { headers: { cookie } })).text();
    const proof =
      /name="proof"\s+value="([^"]+)"/.exec(await home())?.[1] ?? "";
    const snap = () => app.request("/ring/snapshot", form({ proof }, cookie));
    expect(
      (await app.request("/ring/snapshot", form({ proof: "wrong" }, cookie)))
        .status,
    ).toBe(403);
    ring.snapshot.mockRejectedValueOnce(new Error("private upstream details"));
    await snap();
    expect(await home()).toContain("You can retry");
    const image = {
      jpeg: Buffer.from([255, 216, 255, 217]),
      time: new Date(START).toISOString(),
    };
    ring.snapshot.mockResolvedValue(image);
    expect((await snap()).status).toBe(303);
    await snap();
    expect(save).toHaveBeenCalledExactlyOnceWith(image);
    expect(ring.snapshot).toHaveBeenLastCalledWith(
      "demo",
      "Outside",
      START,
      START,
    );
    expect(await home()).toContain(image.time);
  });
  it("downloads immediately when the owner chooses the combined confirmation", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { ring, issue, consent } = setup({ name: "Outside", save });
    ring.snapshot.mockResolvedValue({
      jpeg: Buffer.alloc(4),
      time: new Date(START).toISOString(),
    });
    await issue();
    expect((await (await consent())("save")).status).toBe(303);
    expect(save).toHaveBeenCalledTimes(1);
  });
  it.each([
    [START - 60_000, START - 60_000],
    [START - 2 * 86_400_000, START - 86_400_000],
  ])(
    "requests a JPEG within consent starting at %s and keeps credentials off the signed download",
    async (linkedAt, expectedStart) => {
      const url = "https://example-test.cloudfront.net/v1/download";
      const jpeg = Uint8Array.of(255, 216, 1, 255, 217);
      const send = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          Response.json({
            data: [{ id: "abc", attributes: { name: "Outside" } }],
          }),
        )
        .mockResolvedValueOnce(
          Response.json({
            data: {
              attributes: {
                components: {
                  items: [{ component_type: "lens", component_id: "2" }],
                },
              },
            },
          }),
        )
        .mockResolvedValueOnce(
          new Response(null, { status: 303, headers: { location: url } }),
        )
        .mockResolvedValueOnce(
          new Response(jpeg, {
            headers: {
              "content-type": "image/jpeg",
              "x-media-timestamp": String(START - 1000),
            },
          }),
        );
      const image = await ringClient(ID, "example", send).snapshot(
        "fixture",
        "Outside",
        START,
        linkedAt,
      );
      expect(image.time).toBe(new Date(START - 1000).toISOString());
      expect(image.jpeg).toEqual(Buffer.from(jpeg));
      const [endpoint, init] = send.mock.calls[2] ?? [];
      expect(endpoint).toBe(
        "https://api.amazonvision.com/v1/devices/abc/media/image/download",
      );
      if (typeof init?.body !== "string")
        throw new Error("Missing snapshot request");
      expect(JSON.parse(init.body)).toMatchObject({
        type: "latest_in_range",
        end_timestamp: START,
        start_timestamp: expectedStart,
        components: [{ component_id: "2" }],
      });
      const [location, options] = send.mock.calls[3] ?? [];
      expect(location).toEqual(new URL(url));
      expect(new Headers(options?.headers).has("authorization")).toBe(false);
    },
  );
  it.each([
    ["reading camera capabilities", 1],
    ["requesting a snapshot", 2],
    ["downloading the JPEG", 3],
  ] as const)("identifies a 403 while %s", async (step, failingRequest) => {
    const responses = [
      Response.json({
        data: [{ id: "demo", attributes: { name: "Outside" } }],
      }),
      Response.json({ data: { attributes: {} } }),
      Response.redirect("https://example-test.cloudfront.net/frame", 303),
    ];
    const send = vi.fn<typeof fetch>();
    for (const response of responses.slice(0, failingRequest))
      send.mockResolvedValueOnce(response);
    send.mockResolvedValueOnce(new Response(null, { status: 403 }));
    await expect(
      ringClient(ID, "example", send).snapshot(
        "fixture",
        "Outside",
        START,
        START - 60_000,
      ),
    ).rejects.toThrow("Ring returned HTTP 403 while " + step + ".");
    expect(send).toHaveBeenCalledTimes(failingRequest + 1);
  });
  it("checks the snapshot download host before sending the request", async () => {
    const send = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          data: [{ id: "demo", attributes: { name: "Outside" } }],
        }),
      )
      .mockResolvedValueOnce(Response.json({ data: { attributes: {} } }))
      .mockResolvedValueOnce(
        Response.redirect("https://unlisted.example.test/image", 303),
      );
    await expect(
      ringClient(ID, "example", send).snapshot(
        "fixture",
        "Outside",
        START,
        START - 60_000,
      ),
    ).rejects.toThrow("invalid media location");
    expect(send).toHaveBeenCalledTimes(3);
  });
  it("refuses an ambiguous inventory match and explains when the requested window is empty", async () => {
    const device = { id: "some-id", attributes: { name: "Outside" } };
    const send = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ data: [device, device] }))
      .mockResolvedValueOnce(Response.json({ data: [device] }))
      .mockResolvedValueOnce(Response.json({ data: { attributes: {} } }))
      .mockResolvedValueOnce(new Response(null, { status: 416 }));
    const snap = () =>
      ringClient(ID, "example", send).snapshot(
        "fixture",
        "Outside",
        START,
        START - 60_000,
      );
    await expect(snap()).rejects.toThrow("one shared device");
    await expect(snap()).rejects.toThrow(
      "no image in the requested time range",
    );
  });
  it("links only a matching browser, lists consented devices, and forgets a removed integration", async () => {
    const { app, issue, ring, visit, consent, nonce, time } = setup();
    expect((await visit()).status).toBe(403);
    expect((await issue()).status).toBe(200);
    expect((await issue()).status).toBe(200);
    expect(ring.exchange).toHaveBeenCalledTimes(1);
    expect(await (await visit()).text()).toContain("o***r@example.com");
    expect(
      await app.request(LINK, form({ time, nonce, proof: "fake" })),
    ).toHaveProperty("status", 403);
    const done = await (await consent())();
    expect(done.status).toBe(303);
    expect(ring.activate.mock.calls).toEqual([
      ["demo", "POST", "o***r@example.com", nonce],
      ["demo", "PATCH", "o***r@example.com", nonce],
    ]);
    expect((await visit()).status).toBe(403);
    expect(await (await app.request(HOME)).text()).not.toContain("camera");
    const cookie = done.headers.get("set-cookie")?.split(";")[0] ?? "";
    const home = async () =>
      (await app.request(HOME, { headers: { cookie } })).text();
    expect(await home()).toContain("&lt;test camera&gt;");
    const body = JSON.stringify({
      data: {
        type: "app_integration_removed",
        attributes: { source: "account1" },
      },
    });
    const signature =
      "sha256=" + createHmac("sha256", SIGNING).update(body).digest("hex");
    const options = {
      method: "POST",
      body,
      headers: { "X-Signature": signature },
    };
    expect(
      (await app.request(HOOK, { ...options, body: body + " " })).status,
    ).toBe(403);
    expect(await home()).toContain("&lt;test camera&gt;");
    expect((await app.request(HOOK, options)).status).toBe(200);
    expect(await home()).not.toContain("camera");
  });
  it("expires pending links and rejects callbacks for other clients or accounts", async () => {
    const { app, issue, visit, ring, clock } = setup();
    expect(
      (await app.request(TOKEN, form({ client_id: "other", code: "test" })))
        .status,
    ).toBe(400);
    expect(ring.exchange).not.toHaveBeenCalled();
    await issue();
    clock.now = START - 1;
    expect((await visit()).status).toBe(403);
    clock.now = START;
    expect(
      (
        await app.request(
          LINK + "?time=" + String(START) + "&nonce=" + "a".repeat(43),
        )
      ).status,
    ).toBe(403);
    clock.now += 600_000;
    expect((await visit()).status).toBe(403);
  });
  it("resumes after identity or completion fails without reusing the authorization code or claim", async () => {
    const { issue, ring, consent } = setup();
    ring.identity.mockRejectedValueOnce(new Error("temporary"));
    expect((await issue()).status).toBe(502);
    expect((await issue()).status).toBe(200);
    expect(ring.exchange).toHaveBeenCalledTimes(1);
    const confirm = await consent();
    ring.activate
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("temporary"));
    expect((await confirm()).status).toBe(502);
    expect((await confirm()).status).toBe(303);
    expect(ring.activate.mock.calls.map((args) => args[1])).toEqual([
      "POST",
      "PATCH",
      "PATCH",
    ]);
  });
  it("ends the previous browser session once the replacement grant is confirmed", async () => {
    const { app, issue, consent, ring, clock } = setup();
    await issue();
    const first = await (await consent())();
    const cookie = first.headers.get("set-cookie")?.split(";")[0] ?? "";
    await issue("new-code");
    expect(ring.exchange).toHaveBeenCalledTimes(2);
    expect(
      await (await app.request(HOME, { headers: { cookie } })).text(),
    ).toContain("Shared devices");
    clock.now++;
    const time = String(clock.now);
    const nonce = createHmac("sha256", SIGNING)
      .update(time + ":account1")
      .digest("base64url");
    const page = await app.request(LINK + "?time=" + time + "&nonce=" + nonce);
    const proof =
      /name="proof"\s+value="([^"]+)"/.exec(await page.text())?.[1] ?? "";
    expect(
      (
        await app.request(
          LINK,
          form(
            { time, nonce, proof },
            page.headers.get("set-cookie")?.split(";")[0],
          ),
        )
      ).status,
    ).toBe(303);
    expect(
      await (await app.request(HOME, { headers: { cookie } })).text(),
    ).not.toContain("camera");
  });
  it("expires a linked session at the access token's earlier expiry", async () => {
    const { app, issue, consent, ring, clock } = setup();
    ring.exchange.mockResolvedValueOnce({
      access_token: "demo",
      expires_in: 30,
    });
    await issue();
    const first = await (await consent())();
    const cookie = first.headers.get("set-cookie")?.split(";")[0] ?? "";
    clock.now += 30_000;
    expect(
      await (await app.request(HOME, { headers: { cookie } })).text(),
    ).not.toContain("camera");
    expect(ring.devices).not.toHaveBeenCalled();
  });
  it("recovers after a temporary refresh failure, and clears a revoked grant", async () => {
    const store = new PilotLinks(":memory:", ID, "test-key");
    try {
      const { app, ring, issue, consent, clock } = setup(undefined, store);
      ring.exchange.mockResolvedValue({
        access_token: "first",
        refresh_token: "refresh",
        expires_in: 3600,
      });
      await issue();
      const linked = await (await consent())();
      const cookie = linked.headers.get("set-cookie")?.split(";")[0] ?? "";
      const read = () => app.request(HOME, { headers: { cookie } });
      clock.now += 3_600_000;
      ring.refresh.mockRejectedValueOnce(new Error("temporary"));
      expect((await read()).status).toBe(502);
      expect(store.load()).toHaveLength(1);
      ring.refresh.mockResolvedValueOnce({
        access_token: "second",
        expires_in: 3600,
      });
      expect(await (await read()).text()).toContain("Shared devices");
      clock.now += 3_600_000;
      ring.refresh.mockRejectedValueOnce(new InvalidRingGrant());
      expect((await read()).status).toBe(401);
      expect(store.load()).toHaveLength(0);
    } finally {
      store.close();
    }
  });
  it("posts the refresh credential to Ring and recognizes an explicitly invalid grant", async () => {
    const send = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ error: "invalid_grant" }, { status: 400 }),
      );
    await expect(
      ringClient(ID, "fixture", send).refresh("rotating"),
    ).rejects.toBeInstanceOf(InvalidRingGrant);
    const [url, init] = send.mock.calls[0] ?? [];
    expect(url).toBe("https://oauth.ring.com/oauth/token");
    expect(init?.method).toBe("POST");
    expect(init?.body).toEqual(
      new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: "rotating",
        client_id: ID,
        client_secret: "fixture",
      }),
    );
  });
  it("sends the exchange and device requests to Ring with the documented wire format", async () => {
    const send = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ access_token: "fixture", expires_in: 3600 }),
      )
      .mockResolvedValueOnce(
        Response.json({ data: [{ id: "door", attributes: { name: "Door" } }] }),
      );
    const client = ringClient(ID, "test-value", send);
    await client.exchange("example");
    expect(await client.devices("fixture")).toEqual(["Door"]);
    const [url, init] = send.mock.calls[0] ?? [];
    expect(url).toBe("https://oauth.ring.com/oauth/token");
    expect(init?.body).toEqual(
      new URLSearchParams({
        grant_type: "authorization_code",
        client_id: ID,
        client_secret: "test-value",
        code: "example",
      }),
    );
    const headers = new Headers(init?.headers);
    expect(headers.get("Hardware_Id")).toBeTruthy();
    expect(headers.get("User-Agent")).toBe("RingBridgePilot/1.0");
    expect(send.mock.calls[1]?.[0]).toBe(
      "https://api.amazonvision.com/v1/devices",
    );
    expect(
      new Headers(send.mock.calls[1]?.[1]?.headers).get("Authorization"),
    ).toBe("Bearer fixture");
  });
});

describe("post-link event media pilot", () => {
  const fixture = (
    videoStatus: number,
    photoOffset = 0,
    linkedAt = START - 1,
    redirectTo?: string,
    clipHeaders?: Record<string, string>,
  ) => {
    const json = Response.json.bind(Response);
    const event = {
      id: "evt",
      type: "history-events",
      attributes: { event_type: "ding", start: START, end: START + 8000 },
      relationships: { source: { data: { type: "devices", id: "cam" } } },
    };
    const requests: {
      path: string;
      body: unknown;
      authorization: string | null;
    }[] = [];
    const respond = (url: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const path = new URL(url instanceof Request ? url.url : url).pathname;
      requests.push({
        path,
        authorization: new Headers(init?.headers).get("authorization"),
        body:
          typeof init?.body === "string"
            ? (JSON.parse(init.body) as unknown)
            : null,
      });
      if (path.endsWith("/devices"))
        return json({
          data: [
            {
              id: "cam",
              attributes: { name: "Outside" },
              relationships: { location: { data: { id: "home" } } },
            },
          ],
        });
      if (path.endsWith("/events")) return json({ data: [event] });
      if (path.endsWith("/capabilities"))
        return json({
          data: {
            attributes: {
              components: {
                items: [{ component_id: "1", component_type: "lens" }],
              },
            },
          },
        });
      if (redirectTo && path.includes("/media/"))
        return new Response(null, {
          status: 303,
          headers: {
            location: redirectTo + path.replace("/media/", "/signed/"),
          },
        });
      if (path.endsWith("/image/download"))
        return new Response(Uint8Array.from([255, 216, 1, 255, 217]), {
          headers: {
            "content-type": "image/jpeg",
            "x-media-timestamp": String(START + photoOffset),
          },
        });
      return new Response(
        Uint8Array.from([
          0, 0, 0, 16, 102, 116, 121, 112, 105, 115, 111, 109, 0, 0, 0, 0,
        ]),
        {
          status: videoStatus,
          headers: {
            "content-type": "video/mp4",
            "x-media-timestamp": String(START),
            ...clipHeaders,
          },
        },
      );
    };
    return {
      requests,
      run: (eventId?: string, now = START + 200000) =>
        ringClient(ID, "example", (url, init) =>
          Promise.resolve(respond(url, init)),
        ).eventMedia("example", "Outside", "ding", linkedAt, now, eventId),
    };
  };
  it("binds both requests to the same completed event and module", async () => {
    const probe = fixture(200);
    expect(await probe.run()).toMatchObject({
      eventId: "evt",
      deviceId: "cam",
      householdId: "home",
      photo: { status: "available" },
      clip: { status: "available" },
    });
    expect(
      probe.requests.find((r) => r.path.endsWith("/image/download"))?.body,
    ).toMatchObject({
      start_timestamp: START,
      end_timestamp: START + 4999,
      components: [{ component_id: "1" }],
    });
    expect(
      probe.requests.find((r) => r.path.endsWith("/video/download"))?.body,
    ).toMatchObject({
      timestamp: START,
      duration: 5000,
      components: [{ component_id: "1" }],
    });
  });
  it.each([
    ["2500", "available"],
    ["4000", "available"],
    [undefined, "unmatched"],
    ["0", "unmatched"],
    ["-1", "unmatched"],
    ["4001", "unmatched"],
    ["NaN", "unmatched"],
  ] as const)(
    "checks duration %s on a partial clip starting inside the event",
    async (length, status) => {
      const probe = fixture(206, 0, START - 1, undefined, {
        "x-media-timestamp": String(START + 1000),
        ...(length === undefined ? {} : { "x-media-length": length }),
      });
      expect(await probe.run()).toMatchObject({ clip: { status } });
    },
  );
  it("fetches signed items from a Ring regional download host without forwarding the account credential", async () => {
    const probe = fixture(
      200,
      0,
      START - 1,
      "https://download-us-east-1.prod.phoenix.devices.amazon.dev",
    );
    expect(await probe.run()).toMatchObject({
      photo: { status: "available" },
      clip: { status: "available" },
    });
    expect(
      probe.requests
        .filter((r) => r.path.includes("/signed/"))
        .map((r) => r.authorization),
    ).toEqual([null, null]);
  });
  it("rejects other origins that resemble a Ring download host", async () => {
    const probe = fixture(
      200,
      0,
      START - 1,
      "https://download-us-east-1.prod.phoenix.devices.amazon.dev.example.org",
    );
    expect(await probe.run()).toMatchObject({
      photo: { status: "upstream-error" },
      clip: { status: "upstream-error" },
    });
    expect(probe.requests.some((r) => r.path.includes("/signed/"))).toBe(false);
  });
  it.each([
    [416, "missing"],
    [425, "pending"],
    [503, "upstream-error"],
  ] as const)(
    "keeps photo evidence separate from clip HTTP %s",
    async (code, status) => {
      expect(await fixture(code).run()).toMatchObject({
        photo: { status: "available" },
        clip: { status, httpStatus: code },
      });
    },
  );
  it("preserves the selected event on retry and distinguishes a recent missing recording", async () => {
    expect(await fixture(416).run("evt", START + 15000)).toMatchObject({
      clip: { status: "pending", httpStatus: 416 },
    });
    const other = fixture(200);
    await expect(other.run("different-event")).rejects.toThrow(
      /No matching completed/,
    );
    expect(other.requests.some((r) => r.path.includes("/media/"))).toBe(false);
  });
  it("rejects a later JPEG and never requests media for a pre-link event", async () => {
    expect(await fixture(200, 8001).run()).toMatchObject({
      photo: { status: "unmatched" },
    });
    const probe = fixture(200, 0, START + 1);
    await expect(probe.run()).rejects.toThrow(/event/i);
    expect(probe.requests.some((r) => r.path.includes("/media/"))).toBe(false);
  });
});
