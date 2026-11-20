import { serve } from "@hono/node-server";
import { randomUUID } from "node:crypto";
import { rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Snapshot } from "./snapshot.ts";
import { pilotApp } from "./app.ts";
import { ringClient } from "./client.ts";

const {
  RING_PILOT_ID: id,
  RING_PILOT_SECRET: secret,
  RING_PILOT_SIGNING_KEY: key,
} = process.env;
if (!id || !secret || !key)
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
const { app, expire } = pilotApp(
  id,
  key,
  ringClient(id, secret),
  Date.now,
  directory && name ? { name, save } : undefined,
);
setInterval(expire, 30_000).unref();
serve({ hostname: "127.0.0.1", port: 43821, fetch: app.fetch }, () => {
  console.info("Ring pilot ready on http://127.0.0.1:43821/ring/home");
});
