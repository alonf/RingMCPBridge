import { randomUUID } from "node:crypto";
import { z } from "zod";
import { downloadSnapshot, SnapshotError } from "./snapshot.ts";
import {
  CALLBACK_MEDIA_DELAY_MS,
  downloadEventWindow,
  EventProbeError,
  PROBE_MS,
  probeEventMedia,
} from "./event-media.ts";
import type { RecordingCallback } from "./camera-callback.ts";

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
  links: z.object({ next: z.string().nullish() }).optional(),
  data: z.array(
    z.object({
      id: z.string(),
      attributes: z.object({ name: z.string().optional() }).optional(),
      relationships: z
        .object({
          location: z
            .object({ data: z.object({ id: z.string().min(1) }).nullish() })
            .optional(),
        })
        .optional(),
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
    return inventory.parse(await result.json());
  }
  async function eventCamera(
    token: string,
    camera: { name: string } | { id: string },
  ) {
    const page = await devices(token);
    const matches = page.data.filter((device) =>
      "id" in camera
        ? device.id === camera.id
        : device.attributes?.name === camera.name,
    );
    const [device] = matches;
    if (
      page.links?.next ||
      matches.length !== 1 ||
      !device?.relationships?.location?.data?.id
    )
      throw new EventProbeError(
        "A single shared camera and its household must be identifiable in the inventory.",
      );
    return {
      deviceId: device.id,
      householdId: device.relationships.location.data.id,
    };
  }
  return {
    eventCamera,
    async callbackMedia(
      token: string,
      camera: { deviceId: string; householdId: string },
      receipt: Pick<RecordingCallback, "time" | "eventId" | "components">,
      linkedAt: number,
      now: number,
      retryToken?: (attempt: number) => Promise<string | undefined>,
    ) {
      if (
        receipt.time < linkedAt ||
        now < receipt.time + CALLBACK_MEDIA_DELAY_MS
      )
        throw new EventProbeError(
          "The recording window must follow linking and finish processing first.",
        );
      async function headersFor(token: string) {
        const current = await eventCamera(token, { id: camera.deviceId });
        if (camera.householdId !== current.householdId)
          throw new EventProbeError(
            "The camera household changed during the recording watch.",
          );
        return { ...auth(token), "content-type": "application/json" };
      }
      return downloadEventWindow(
        {
          ...camera,
          eventId: receipt.eventId,
          start: receipt.time,
          end: receipt.time + PROBE_MS,
        },
        receipt.components,
        API,
        await headersFor(token),
        now,
        ringRequest,
        send,
        retryToken &&
          (async (attempt) => {
            const fresh = await retryToken(attempt);
            return fresh ? headersFor(fresh) : undefined;
          }),
      );
    },
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
      return (await devices(token)).data.map(
        (device) => device.attributes?.name ?? device.id,
      );
    },
    async snapshot(token: string, name: string, end: number, linkedAt: number) {
      const matches = (await devices(token)).data.filter(
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
        linkedAt,
      );
    },
    async eventMedia(
      token: string,
      name: string,
      kind: "ding" | "motion",
      linkedAt: number,
      now: number,
      eventId?: string,
    ) {
      const camera = await eventCamera(token, { name });
      return probeEventMedia(
        API,
        camera.deviceId,
        camera.householdId,
        kind,
        linkedAt,
        now,
        eventId,
        token,
        ringRequest,
        send,
      );
    },
  };
}

export class InvalidRingGrant extends Error {}
