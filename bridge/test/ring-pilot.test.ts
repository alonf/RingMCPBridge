import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { pilotApp } from "../dev/ring-pilot/app.ts";
import { ringClient } from "../dev/ring-pilot/client.ts";

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
function setup(snapshotTarget?: Parameters<typeof pilotApp>[4]) {
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
  };
  const { app } = pilotApp(ID, SIGNING, ring, () => clock.now, snapshotTarget);
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
    expect(ring.snapshot).toHaveBeenLastCalledWith("demo", "Outside", START);
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
  it("requests a stored JPEG for the selected camera and keeps the access token off the download request", async () => {
    const url = "https://download.example.org/v1/download";
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
      start_timestamp: START - 86_400_000,
      components: [{ component_id: "2" }],
    });
    const [location, options] = send.mock.calls[3] ?? [];
    expect(location).toEqual(new URL(url));
    expect(new Headers(options?.headers).has("authorization")).toBe(false);
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
      ringClient(ID, "example", send).snapshot("fixture", "Outside", START);
    await expect(snap()).rejects.toThrow("one shared device");
    await expect(snap()).rejects.toThrow("no image in the last 24 hours");
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
  it("ends an existing browser session when Ring supplies a new grant for the same account", async () => {
    const { app, issue, consent, ring } = setup();
    await issue();
    const first = await (await consent())();
    const cookie = first.headers.get("set-cookie")?.split(";")[0] ?? "";
    await issue("new-code");
    expect(ring.exchange).toHaveBeenCalledTimes(2);
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
