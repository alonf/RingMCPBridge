// The home side as production opens it (T027), for the connector and mode A: the Secrets File,
// sealed under the key kept apart from the data folder, and the Ring Adapter over ring-client-api.
// A rotated Ring refresh token is written back to the Secrets File (T012). Only the Host's wiring
// imports this file; the dev script and the tests hand in the scenario engine instead.
import { join } from "node:path";
import { SecretsFile } from "../connector/access/secrets-file/index.ts";
import { readSecretsFileKey } from "../connector/access/secrets-file/index.ts";
import {
  RING_CALL_LIMITS,
  RingCallGate,
} from "../connector/access/ring-adapter/call-limits.ts";
import { RingApiAdapter } from "../connector/access/ring-adapter/ring-api-adapter.ts";
import { createRingClient } from "../connector/access/ring-adapter/ring-client.live.ts";
import type { Clock } from "../utilities/clock/index.ts";
import type { Logger } from "../utilities/logging/index.ts";
import type { LocalHome } from "./home-assembly.ts";
import { HostError } from "./host-error.ts";

/** The Secrets File's name in the data folder; the Setup CLI makes it (T028). */
export const SECRETS_FILE = "secrets.sealed";

/** Where the home keeps its secrets, and the system ffmpeg. */
export interface RingHomeSettings {
  readonly dataDir: string;
  readonly secretsKeyPath: string;
  readonly ffmpegPath: string;
}

/**
 * Opens the Secrets File and the Ring Adapter. `onConnectionStuck` hears, once, that a hub's live
 * connection has stayed closed for 5 minutes while Ring's calls work (the owner's (y)). Throws
 * `HostError` (`setup_needed`) when there is no Secrets File yet.
 */
export async function openRingHome(
  settings: RingHomeSettings,
  clock: Clock,
  logger: Logger,
  onConnectionStuck?: () => void,
): Promise<LocalHome> {
  const key = await readSecretsFileKey(settings.secretsKeyPath);
  const file = await SecretsFile.open({
    path: join(settings.dataDir, SECRETS_FILE),
    key,
  });
  if (file === undefined) {
    throw new HostError(
      "setup_needed",
      `There is no ${SECRETS_FILE} in the data folder: run the setup first.`,
    );
  }
  const secrets = file.secrets;
  const ring = new RingApiAdapter({
    client: createRingClient({
      refreshToken: secrets.ringRefreshToken.reveal(),
      hardwareId: secrets.ringHardwareId.reveal(),
      ffmpegPath: settings.ffmpegPath,
    }),
    gate: new RingCallGate(clock, RING_CALL_LIMITS),
    clock,
    logger,
    saveRefreshToken: (token) => file.update({ ringRefreshToken: token }),
    ...(onConnectionStuck === undefined ? {} : { onConnectionStuck }),
  });
  return {
    ring,
    key: secrets.connectorKey,
    close: () => {
      ring.close();
      return Promise.resolve();
    },
  };
}
