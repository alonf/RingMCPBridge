// Setup CLI (CP-06, T028): the owner's one-off setup of the home connector, at the home server's
// terminal. Its only entry point (CD4). The Host's `setup` command wires it to the terminal and to
// Ring's sign-in.

/** The setup: signs in to Ring, makes the key and the code, and writes the Secrets File. */
export { LOGIN_STEP_TIMEOUT_MS, MAX_WRONG_CODES, runSetup } from "./setup.ts";
export type { SetupOptions, SetupOutcome, SetupRefusal } from "./setup.ts";

/** The enrollment code: eight characters of Crockford's base32, as `7Q4K-29XM`. */
export { newEnrollmentCode } from "./enrollment-code.ts";

/** The owner's terminal: the seam the tests script, and the real one over readline. */
export type { AskOptions, SetupConsole } from "./setup-console.ts";
export { TerminalConsole } from "./terminal-console.ts";
export type { TerminalConsoleOptions } from "./terminal-console.ts";
