// Development only (T027): mode A with the scenario engine's simulated home of about 100 devices in
// place of the Ring Adapter, served over stdio. `npm run dev:all-in-one` starts it; an MCP client
// can also start it as its server. It needs no Ring account and no secrets. The home's key is
// generated at start and approved at once. The data goes to a new temporary folder, or to
// BRIDGE_DATA_DIR when set. Left out of the production image, with `bridge/test/`.
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startAllInOne } from "../src/host/all-in-one.ts";
import { BRIDGE_VERSION } from "../src/host/version.ts";
import { SystemClock } from "../src/utilities/clock/index.ts";
import { loadSettings } from "../src/utilities/config/index.ts";
import { createStdoutSink, Logger } from "../src/utilities/logging/index.ts";
import { generateSigningKeyPair } from "../src/utilities/security/index.ts";
import { ScenarioEngine } from "../test/scenarios/index.ts";

let stopping: Promise<void> | undefined;
const settings = loadSettings({
  ...process.env,
  BRIDGE_MODE: "all-in-one",
  BRIDGE_DATA_DIR:
    process.env.BRIDGE_DATA_DIR ??
    (await mkdtemp(join(tmpdir(), "ring-bridge-dev-"))),
  // The simulated home has no Secrets File, so no key is read.
  BRIDGE_SECRETS_KEY_FILE: "unused-by-the-simulated-home",
});
if (settings.mode !== "all-in-one") {
  throw new Error("The dev script runs mode A only.");
}
const clock = new SystemClock();
const logger = new Logger({
  sink: createStdoutSink(process.stderr),
  now: () => clock.now(),
  minLevel: settings.logLevel,
});
const key = await generateSigningKeyPair();
const running = await startAllInOne(settings, {
  clock,
  logger,
  openHome: () =>
    Promise.resolve({
      ring: new ScenarioEngine(clock),
      key,
      close: () => Promise.resolve(),
    }),
  approveLocalKey: true,
  connectorVersion: BRIDGE_VERSION,
  onFatal: (error) => {
    logger.error("bridge_failed", { mode: "all_in_one" }, error);
    process.exitCode = 1;
    stop();
  },
});
const stdio = running.endpoint.serveStdio();
logger.info("mcp_stdio_serving", { mode: "all_in_one" });

function stop(): void {
  stopping ??= (async () => {
    await stdio.close();
    await running.stop();
    logger.info("bridge_stopped", { mode: "all_in_one" });
  })();
}
process.stdin.on("end", stop);
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
