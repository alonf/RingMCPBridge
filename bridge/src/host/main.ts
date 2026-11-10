// The bridge's one entry point (T027): one image for every mode, picked by `BRIDGE_MODE`.
// - **Each mode loads only its own wiring**, by a dynamic import: the connector never loads the
//   Azure libraries or oidc-provider, and the core never loads Ring's library.
// - **The log** goes to stdout, except in mode A, whose stdout carries the MCP protocol: there it
//   goes to stderr.
// - **Ending**: SIGTERM or SIGINT, and in mode A the client closing stdin, stop the process cleanly.
//   A fatal error (the home cannot open, mode A's lease lost, a stuck Ring connection) stops it with
//   exit code 1, for its service to restart it.
// - **Escaped errors** (the owner's (y), DRIFT-001-35): a rejection nothing handled, such as one
//   from Ring's library, is logged and the process goes on; the (y) rule restarts it if Ring stays
//   unreachable. An uncaught exception is logged and ends the process, since its state is unknown.
// - **Settings that fail their check** end the process before anything starts, naming the
//   variables only.
// - **`setup`** as the first argument runs the Setup CLI at the terminal instead (T028), before the
//   run mode's settings are read: it needs only the data folder and the key's path.
import { SystemClock } from "../utilities/clock/index.ts";
import { ConfigError, loadSettings } from "../utilities/config/index.ts";
import type { Settings } from "../utilities/config/index.ts";
import { createStdoutSink, Logger } from "../utilities/logging/index.ts";
import { BRIDGE_VERSION } from "./version.ts";

const EXIT_FAILURE = 1;

/** Something running that can be stopped. */
interface Running {
  stop(): Promise<void>;
}

if (process.argv[2] === "setup") {
  const { runSetupCommand } = await import("./setup.ts");
  let code: number;
  try {
    code = await runSetupCommand(process.env, {
      input: process.stdin,
      output: process.stdout,
      errors: process.stderr,
      exit: (exitCode) => process.exit(exitCode),
    });
  } catch (error) {
    const reason =
      error instanceof Error ? `${error.name}: ${error.message}` : "unknown";
    process.stderr.write(
      `The setup stopped on an unexpected error. ${reason}\n`,
    );
    code = EXIT_FAILURE;
  }
  process.exit(code);
}

const clock = new SystemClock();
let settings: Settings;
try {
  settings = loadSettings(process.env);
} catch (error) {
  if (!(error instanceof ConfigError)) {
    throw error;
  }
  process.stderr.write(`${error.message}\n`);
  process.exit(EXIT_FAILURE);
}
const logger = new Logger({
  sink: createStdoutSink(
    settings.mode === "all-in-one" ? process.stderr : process.stdout,
  ),
  now: () => clock.now(),
  minLevel: settings.logLevel,
});

let running: Running | undefined;
let stopping: Promise<void> | undefined;

/** Stops whatever runs, once, then ends the process with the exit code set so far. */
function stop(): void {
  stopping ??= (async () => {
    try {
      await running?.stop();
    } catch (error) {
      logger.error("bridge_stop_failed", undefined, error);
      process.exitCode = EXIT_FAILURE;
    }
    process.exit();
  })();
}

function fatal(error: unknown): void {
  logger.error("bridge_failed", { mode: settings.mode }, error);
  process.exitCode = EXIT_FAILURE;
  stop();
}

process.on("unhandledRejection", (error) => {
  logger.error("process_unhandled_rejection", undefined, error);
});
process.on("uncaughtException", (error) => {
  logger.error("process_uncaught_exception", undefined, error);
  process.exitCode = EXIT_FAILURE;
  stop();
});
process.on("SIGTERM", stop);
process.on("SIGINT", stop);

try {
  running = await start(settings);
} catch (error) {
  fatal(error);
}

async function start(chosen: Settings): Promise<Running> {
  switch (chosen.mode) {
    case "core": {
      const { startCore } = await import("./core.ts");
      return startCore(chosen, clock, logger);
    }
    case "connector": {
      const { startRingConnector } = await import("./connector.ts");
      return startRingConnector(chosen, {
        clock,
        logger,
        connectorVersion: BRIDGE_VERSION,
        onFatal: fatal,
      });
    }
    case "all-in-one": {
      const { startAllInOne } = await import("./all-in-one.ts");
      const { openRingHome } = await import("./ring-home.live.ts");
      const modeA = await startAllInOne(chosen, {
        clock,
        logger,
        openHome: () => openRingHome(chosen.local, clock, logger),
        // Mode A's in-process home part has no network link, so no other home can enroll: its key
        // is approved at start (the owner's choice (i), DRIFT-001-53).
        approveLocalKey: true,
        connectorVersion: BRIDGE_VERSION,
        onFatal: fatal,
      });
      const stdio = modeA.endpoint.serveStdio();
      process.stdin.on("end", stop);
      logger.info("mcp_stdio_serving", { mode: "all_in_one" });
      return {
        stop: async () => {
          await stdio.close();
          await modeA.stop();
        },
      };
    }
  }
}
