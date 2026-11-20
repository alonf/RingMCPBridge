import { serve } from "@hono/node-server";
import { pilotApp } from "./app.ts";
import { ringClient } from "./client.ts";

const {
  RING_PILOT_ID: id,
  RING_PILOT_SECRET: secret,
  RING_PILOT_SIGNING_KEY: key,
} = process.env;
if (!id || !secret || !key)
  throw new Error("Start the pilot with the home PowerShell launcher.");
const { app, expire } = pilotApp(id, key, ringClient(id, secret));
setInterval(expire, 30_000).unref();
serve({ hostname: "127.0.0.1", port: 43821, fetch: app.fetch }, () => {
  console.info("Ring pilot ready on http://127.0.0.1:43821/ring/home");
});
