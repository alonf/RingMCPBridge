// The `setup` command (T028): the Setup CLI at the home server's terminal, run by the owner in the
// connector's image as `docker run -it ... <image> setup`. The owner signs in to Ring there; the
// agent never does.
// - **Settings**: only `BRIDGE_DATA_DIR` and `BRIDGE_SECRETS_KEY_FILE`, the names the connector and
//   mode A use, so the setup runs before the rest is set.
// - **A terminal only**: without one (no `-it`), the password could not be typed unseen, so the
//   command is refused.
// - **Ctrl+C** ends it at once, with exit code 130. The Secrets File is written last and in one
//   step, so it is either whole or absent.
// The caller ends the process with the exit code returned: Ring's library may keep retrying a
// request in the background after the setup has stopped waiting for it.
import { openRingLogin } from "../connector/access/ring-adapter/ring-login.live.ts";
import {
  runSetup,
  TerminalConsole,
} from "../connector/clients/setup-cli/index.ts";
import { SystemClock } from "../utilities/clock/index.ts";
import { ConfigError, loadSetupSettings } from "../utilities/config/index.ts";

const EXIT_DONE = 0;
const EXIT_FAILURE = 1;
const EXIT_INTERRUPTED = 130;

/** The terminal the setup runs at. */
export interface SetupTerminal {
  readonly input: NodeJS.ReadStream;
  readonly output: NodeJS.WriteStream;
  readonly errors: NodeJS.WriteStream;
  /** Ends the process at once: Ctrl+C. */
  readonly exit: (code: number) => never;
}

/** Runs the setup; returns the process's exit code. */
export async function runSetupCommand(
  environment: Readonly<Record<string, string | undefined>>,
  terminal: SetupTerminal,
): Promise<number> {
  if (!terminal.input.isTTY) {
    terminal.errors.write(
      "The setup needs a terminal, for the password to be typed unseen: run it with docker run -it.\n",
    );
    return EXIT_FAILURE;
  }
  let settings;
  try {
    settings = loadSetupSettings(environment);
  } catch (error) {
    if (!(error instanceof ConfigError)) {
      throw error;
    }
    terminal.errors.write(`${error.message}\n`);
    return EXIT_FAILURE;
  }
  const console = new TerminalConsole({
    input: terminal.input,
    output: terminal.output,
    onInterrupt: () => {
      terminal.output.write("\nThe setup was cancelled.\n");
      terminal.exit(EXIT_INTERRUPTED);
    },
  });
  try {
    const outcome = await runSetup({
      ...settings,
      console,
      openLogin: openRingLogin,
      clock: new SystemClock(),
    });
    return outcome.kind === "done" ? EXIT_DONE : EXIT_FAILURE;
  } finally {
    console.close();
  }
}
