import { getRequestListener } from "@hono/node-server";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pilotApp } from "../connector/access/ring-partner/app.ts";
import { ringClient } from "../connector/access/ring-partner/client.ts";
import { CALLBACK_MEDIA_DELAY_MS } from "../connector/access/ring-partner/event-media.ts";
import type { HomeMediaSource } from "../connector/clients/core-link/index.ts";
import { PilotLinks } from "../connector/access/ring-partner/links.ts";
import { partnerConfig } from "../connector/access/ring-partner/index.ts";
import type { Ingest } from "../connector/managers/ingest/index.ts";
import type { Clock } from "../utilities/clock/index.ts";
import type { Logger } from "../utilities/logging/index.ts";

export async function readPartnerConfig(path: string) {
  try {
    return partnerConfig.parse(JSON.parse(await readFile(path, "utf8")));
  } catch {
    throw new Error(
      "Cannot read the private Ring partner configuration or its camera pairings.",
    );
  }
}

export async function startPartnerWebhook(
  config: ReturnType<typeof partnerConfig.parse>,
  dataDir: string,
  ingest: Ingest,
  clock: Clock,
  logger: Logger,
  send?: typeof fetch,
) {
  const fileId = createHash("sha256")
    .update(config.clientId)
    .digest("hex")
    .slice(0, 16);
  const store = new PilotLinks(
    join(dataDir, "ring-pilot-links-" + fileId + ".sqlite"),
    config.clientId,
    config.clientSecret,
  );
  const ring = ringClient(config.clientId, config.clientSecret, send);
  try {
    const { app, maintain, linkedRecording } = pilotApp(
      config.clientId,
      config.signingKey,
      ring,
      () => clock.now(),
      undefined,
      store,
      {
        cameras: config.pairs,
        household: (token, device) =>
          ring.currentCameraHousehold(token, device),
        receive: ingest.pairedRecording.bind(ingest),
      },
    );
    const listen = getRequestListener(app.fetch);
    const server = createServer((req, res) => {
      void listen(req, res).catch(() => res.destroy());
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(config.port, config.host, () => {
        server.removeListener("error", reject);
        resolve();
      });
    });
    let maintenance: Promise<void> | undefined;
    const cancel = clock.every(300_000, () => {
      maintenance ??= maintain()
        .catch(() => {
          logger.warn("ring_partner_maintenance_failed");
        })
        .finally(() => {
          maintenance = undefined;
        });
    });
    const stopped = new AbortController();
    const transfers = new Set<Promise<unknown>>();
    const fetchItem: HomeMediaSource = async (request, signal) => {
      signal.throwIfAborted();
      const pair = config.pairs.find(
        (p) =>
          p.deviceId === request.cameraId &&
          p.locationId === request.householdId,
      );
      if (!pair || (request.kind === "frame" && request.hasSound))
        return { status: "missing" };
      const linked = await linkedRecording(pair, request.eventId);
      if (!linked) return { status: "missing" };
      signal.throwIfAborted();
      const { receipt, access, linkedAt, stillAuthorized } = linked;
      if (clock.now() < receipt.time + CALLBACK_MEDIA_DELAY_MS)
        return { status: "pending" };
      const result = await ring.callbackMedia(
        access,
        { deviceId: pair.ringDeviceId, householdId: pair.ringHouseholdId },
        receipt,
        linkedAt,
        clock.now(),
        undefined,
        { kind: request.kind, hasSound: request.hasSound, signal },
      );
      const item = request.kind === "frame" ? result.photo : result.clip;
      if (result.bridgeEventId !== request.eventId || !stillAuthorized())
        return { status: "missing" };
      if (item.status === "upstream-error")
        throw new Error("Ring event media unavailable.");
      if (item.status !== "available")
        return { status: item.status === "pending" ? "pending" : "missing" };
      if (
        (await ring.currentCameraHousehold(
          access,
          pair.ringDeviceId,
          signal,
        )) !== pair.ringHouseholdId
      )
        return { status: "missing" };
      return {
        status: "available",
        bytes: item.bytes,
        capturedAt: item.time,
        stillAuthorized: () => !stopped.signal.aborted && stillAuthorized(),
      };
    };
    const mediaSource: HomeMediaSource = (request, signal) => {
      const work = fetchItem(
        request,
        AbortSignal.any([signal, stopped.signal]),
      );
      transfers.add(work);
      return work.finally(() => transfers.delete(work));
    };
    async function close() {
      stopped.abort();
      cancel();
      await new Promise<void>((resolve, reject) =>
        server.close((err) => {
          if (err) reject(err);
          else resolve();
        }),
      );
      await Promise.allSettled([...transfers, maintenance]);
      store.close();
    }
    return { mediaSource, close };
  } catch (error) {
    store.close();
    throw error;
  }
}
