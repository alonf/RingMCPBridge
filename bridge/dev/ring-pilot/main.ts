import { serve } from "@hono/node-server";
import { createHash, randomUUID } from "node:crypto";
import { rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Snapshot } from "./snapshot.ts";
import { pilotApp } from "./app.ts";
import { ringClient } from "./client.ts";
import { PilotLinks } from "./links.ts";
import { EventProbeError } from "./event-media.ts";
import { RecordingWatchError } from "./camera-callback.ts";
import { runEventProbe } from "./probe-command.ts";

const {
  RING_PILOT_ID: id,
  RING_PILOT_SECRET: secret,
  RING_PILOT_SIGNING_KEY: key,
} = process.env;
const privateDir = process.env.RING_PILOT_PRIVATE_DIR;
if (!id || !secret || !key || !privateDir)
  throw new Error("Start the pilot with the home PowerShell launcher.");
const directory = process.env.RING_PILOT_SNAPSHOT_DIR;
const name = process.env.RING_PILOT_SNAPSHOT_DEVICE;
async function save(image: Snapshot) {
  if (!directory) throw new Error("Missing snapshot directory.");
  const filename = join(
    directory,
    "ring-snapshot-" +
      image.time.replaceAll(":", "-") +
      "-" +
      randomUUID() +
      ".jpg",
  );
  const partial = filename + ".partial";
  try {
    await writeFile(partial, image.jpeg, { flag: "wx", mode: 0o600 });
    await rename(partial, filename);
  } finally {
    await rm(partial, { force: true });
  }
}
const fileId = createHash("sha256").update(id).digest("hex").slice(0, 16);
const links = new PilotLinks(
  join(privateDir, "ring-pilot-links-" + fileId + ".sqlite"),
  id,
  secret,
);
if (process.argv[2] === "--event-probe") {
  try {
    if (
      !(await runEventProbe(
        ringClient(id, secret),
        links,
        privateDir,
        process.argv[3] ?? "",
        process.argv[4] ?? "",
        process.argv[5],
        process.argv[6],
        process.argv[7] === "--wait-for-callback",
      ))
    )
      process.exitCode = 2;
  } catch (error) {
    // Provider bodies, validation errors and redirect addresses can contain private data.
    const message =
      error instanceof EventProbeError || error instanceof RecordingWatchError
        ? error.message
        : "Could not verify the event source or access Ring.";
    console.error(message);
    process.exitCode = 1;
  } finally {
    links.close();
  }
} else if (process.argv[2] === "--browser-code") {
  try {
    console.info(
      "One-time browser code (10 minutes):",
      links.browserCode(Date.now(), process.argv[3]),
    );
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Could not issue browser code.",
    );
    process.exitCode = 1;
  } finally {
    links.close();
  }
} else {
  const { app, maintain } = pilotApp(
    id,
    key,
    ringClient(id, secret),
    Date.now,
    directory && name ? { name, save } : undefined,
    links,
  );
  setInterval(() => {
    void maintain().catch(() => {
      console.warn("Ring pilot could not maintain its saved links.");
    });
  }, 300_000).unref();
  serve({ hostname: "127.0.0.1", port: 43821, fetch: app.fetch }, () => {
    console.info("Ring pilot ready on http://127.0.0.1:43821/ring/home");
  });
}
