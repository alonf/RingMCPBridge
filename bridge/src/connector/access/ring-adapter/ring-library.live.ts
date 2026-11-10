// What the live Ring client and the live sign-in share about ring-client-api.
import { useLogger } from "ring-client-api/util";

/** The name Ring shows for the bridge's session, in the owner's list of authorized devices. */
export const RING_SESSION_NAME = "ring-mcp-bridge";

// ring-client-api's own log lines quote URLs and Ring's answers: content the bridge never logs
// (FR-034, OR6). Failures reach the bridge's log as its own errors instead.
const SILENT_LOGGER = {
  logInfo: (): void => undefined,
  logError: (): void => undefined,
};

/** Turns ring-client-api's log off; it applies to the whole process. */
export function silenceRingLibrary(): void {
  useLogger(SILENT_LOGGER);
}
