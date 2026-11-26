import { getRequestListener } from "@hono/node-server";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pilotApp } from "../connector/access/ring-partner/app.ts";
import { ringClient } from "../connector/access/ring-partner/client.ts";
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
    const { app, maintain } = pilotApp(
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
    return async () => {
      cancel();
      await new Promise<void>((resolve, reject) =>
        server.close((err) => {
          if (err) reject(err);
          else resolve();
        }),
      );
      await maintenance;
      store.close();
    };
  } catch (error) {
    store.close();
    throw error;
  }
}
