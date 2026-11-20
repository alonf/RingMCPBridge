import { randomUUID } from "node:crypto";
import { z } from "zod";

const API = "https://api.amazonvision.com/v1";
const INTEGRATION = API + "/accounts/me/app-integrations";
const tokenResponse = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().positive(),
});
const profile = z.object({
  data: z.object({
    id: z.string().min(1),
    attributes: z.object({ email: z.email() }),
  }),
});
const inventory = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      attributes: z.object({ name: z.string().optional() }).optional(),
    }),
  ),
});

export function ringClient(
  clientId: string,
  secret: string,
  send: typeof fetch = fetch,
) {
  const hardware = randomUUID();
  async function request(url: string, init: RequestInit) {
    const headers = new Headers(init.headers);
    headers.set("User-Agent", "RingBridgePilot/1.0");
    headers.set("Hardware_Id", hardware);
    const response = await send(url, {
      ...init,
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok)
      throw new Error("Ring request failed (" + String(response.status) + ")");
    return response;
  }
  const auth = (token: string) => ({ authorization: "Bearer " + token });
  return {
    async exchange(code: string) {
      const body = new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId,
        client_secret: secret,
        code,
      });
      const result = await request("https://oauth.ring.com/oauth/token", {
        method: "POST",
        body,
      });
      return tokenResponse.parse(await result.json());
    },
    async identity(token: string) {
      return profile.parse(
        await (
          await request(API + "/users/me", { headers: auth(token) })
        ).json(),
      ).data;
    },
    async activate(
      token: string,
      method: "POST" | "PATCH",
      identifier: string,
      nonce: string,
    ) {
      const fields = method === "POST" ? { nonce } : { status: "completed" };
      await request(INTEGRATION, {
        method,
        headers: { ...auth(token), "content-type": "application/json" },
        body: JSON.stringify({ ...fields, account_identifier: identifier }),
      });
    },
    async devices(token: string) {
      const result = await request(API + "/devices", { headers: auth(token) });
      return inventory
        .parse(await result.json())
        .data.map((device) => device.attributes?.name ?? device.id);
    },
  };
}
