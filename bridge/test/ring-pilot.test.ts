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
function setup() {
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
  };
  const { app } = pilotApp(ID, SIGNING, ring, () => clock.now);
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
    return () => app.request(LINK, form({ time, nonce, proof }, cookie));
  }
  return { ring, app, issue, visit, consent, clock, nonce, time };
}
describe("official Ring private-app pilot", () => {
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
