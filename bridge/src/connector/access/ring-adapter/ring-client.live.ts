// The real Ring client (T013): ring-client-api's `RingApi`, typed as the adapter's narrow
// `RingClient`, so the compiler checks that the library still fits. Imported only by the
// connector's wiring, and never run in CI: tests use the simulated home or fakes (SC4, I4).
import { RingApi } from "ring-client-api";
import type { RingClient } from "./ring-client.ts";
import { RING_SESSION_NAME, silenceRingLibrary } from "./ring-library.live.ts";

/** What the client needs from the Secrets File and the settings. */
export interface RingClientSettings {
  /** From the Secrets File; ring-client-api's form carries the session and push details too. */
  readonly refreshToken: string;
  /** Ring's session hardware ID, from the Secrets File. */
  readonly hardwareId: string;
  /** The system ffmpeg. ring-client-api never uses a bundled one (DRIFT-001-17). */
  readonly ffmpegPath: string;
}

/** A connected client. Its own polling stays off: every call goes through the gate (FR-026). */
export function createRingClient(settings: RingClientSettings): RingClient {
  silenceRingLibrary();
  const client: RingClient = new RingApi({
    refreshToken: settings.refreshToken,
    systemId: settings.hardwareId,
    controlCenterDisplayName: RING_SESSION_NAME,
    ffmpegPath: settings.ffmpegPath,
  });
  return client;
}
