import { randomUUID } from "node:crypto";
import { z } from "zod";
import { downloadSnapshot, SnapshotError } from "./snapshot.ts";

const API = "https://api.amazonvision.com/v1";
const INTEGRATION = API + "/accounts/me/app-integrations";
const tokenResponse = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
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
  function ringRequest(url: string, init: RequestInit) {
    const headers = new Headers(init.headers);
    headers.set("User-Agent", "RingBridgePilot/1.0");
    headers.set("Hardware_Id", hardware);
    return send(url, {
      ...init,
      headers,
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
    });
  }
  async function request(url: string, init: RequestInit) {
    const response = await ringRequest(url, init);
    if (!response.ok)
      throw new Error("Ring request failed (" + String(response.status) + ")");
    return response;
  }
  const auth = (token: string) => ({ authorization: "Bearer " + token });
  async function devices(token: string) {
    const result = await request(API + "/devices", { headers: auth(token) });
    return inventory.parse(await result.json()).data;
  }
  return {
    async refresh(refreshToken: string) {
      const body = new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: secret,
      });
      const result = await ringRequest("https://oauth.ring.com/oauth/token", {
        method: "POST",
        body,
      });
      if (!result.ok) {
        const error = z
          .object({ error: z.literal("invalid_grant") })
          .safeParse(await result.json().catch(() => null));
        if ((result.status === 400 || result.status === 401) && error.success)
          throw new InvalidRingGrant();
        throw new Error("Ring token renewal temporarily unavailable.");
      }
      return tokenResponse.parse(await result.json());
    },
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
      return (await devices(token)).map(
        (device) => device.attributes?.name ?? device.id,
      );
    },
    async snapshot(token: string, name: string, end: number) {
      const matches = (await devices(token)).filter(
        (device) => device.attributes?.name === name,
      );
      const [device] = matches;
      if (!device || matches.length !== 1)
        throw new SnapshotError(
          "Expected one shared device with the configured name.",
        );
      return downloadSnapshot(
        API + "/devices/" + encodeURIComponent(device.id),
        ringRequest,
        token,
        send,
        end,
      );
    },
  };
}

export class InvalidRingGrant extends Error {}
