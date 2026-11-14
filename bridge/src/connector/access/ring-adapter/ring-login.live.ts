// The live sign-in (T028): ring-client-api's `RingRestClient`, which posts the email and password,
// then the 2FA code, to Ring's token endpoint. Only the Setup CLI's wiring imports it, and it never
// runs in CI with real credentials: its test answers the token endpoint with a stubbed `fetch`.
// - **`getAuth` is called directly**, never `getCurrentAuth`: the latter keeps a failed attempt and
//   returns it again, and arms an hour-long timer.
// - **How a step ended** is read from the client: a 412 sets `promptFor2fa` (a code was sent), and
//   a wrong code is Ring's 400 whose text starts "Verification Code". Ring's own error text is never
//   passed on (FR-034); the only text of Ring's shown is its prompt, to the owner.
// - **The token** is the client's wrapped form (Ring's refresh token with the hardware ID), which
//   the Ring client reads at start.
import { RingRestClient } from "ring-client-api/rest-client";
import { Secret } from "../../../utilities/security/index.ts";
import { RING_SESSION_NAME, silenceRingLibrary } from "./ring-library.live.ts";
import { RingLoginError } from "./ring-login.ts";
import type { RingLogin, RingLoginStep } from "./ring-login.ts";

/** How Ring's 400 for a wrong code begins. */
const WRONG_CODE = "Verification Code";
/** Part of the library's message when Ring's limit of 10 codes in 10 minutes is reached. */
const TOO_MANY_CODES = "too many 2fa codes";
/** The prompt when Ring asks for a code without saying where it went. */
const DEFAULT_PROMPT = "Please enter the code Ring sent you";

/** Opens a sign-in for a session hardware ID, the one the connector's Ring client will use. */
export function openRingLogin(hardwareId: string): RingLogin {
  silenceRingLibrary();
  return new LiveRingLogin(hardwareId);
}

class LiveRingLogin implements RingLogin {
  readonly #hardwareId: string;
  #client: RingRestClient | undefined;

  constructor(hardwareId: string) {
    this.#hardwareId = hardwareId;
  }

  async begin(email: string, password: Secret<string>): Promise<RingLoginStep> {
    this.#client?.clearTimeouts();
    this.#client = new RingRestClient({
      email,
      password: password.reveal(),
      systemId: this.#hardwareId,
      controlCenterDisplayName: RING_SESSION_NAME,
    });
    const step = await this.#step(this.#client, undefined);
    return step.kind === "wrong_code"
      ? { kind: "needs_code", prompt: DEFAULT_PROMPT }
      : step;
  }

  async complete(code: string): Promise<RingLoginStep> {
    const client = this.#client;
    if (client === undefined) {
      throw new RingLoginError(
        "refused",
        "The sign-in has not begun: send the email and password first.",
      );
    }
    const step = await this.#step(client, code);
    // A new code sent in place of the one typed counts as a wrong code too.
    return step.kind === "needs_code" ? { kind: "wrong_code" } : step;
  }

  close(): void {
    this.#client?.clearTimeouts();
  }

  async #step(
    client: RingRestClient,
    code: string | undefined,
  ): Promise<RingLoginStep> {
    delete client.promptFor2fa;
    try {
      const auth = await client.getAuth(code);
      return {
        kind: "signed_in",
        refreshToken: new Secret(auth.refresh_token),
      };
    } catch (error) {
      return this.#failed(client, error);
    }
  }

  #failed(client: RingRestClient, error: unknown): RingLoginStep {
    const message = error instanceof Error ? error.message : "";
    if (message.startsWith(WRONG_CODE)) {
      return { kind: "wrong_code" };
    }
    if (client.promptFor2fa !== undefined) {
      return { kind: "needs_code", prompt: client.promptFor2fa };
    }
    // No cause: the library's error quotes Ring's answer.
    if (message.includes(TOO_MANY_CODES)) {
      throw new RingLoginError(
        "too_many_codes",
        "Ring has sent too many codes: it allows 10 in 10 minutes. Wait 10 minutes, then run the setup again.",
      );
    }
    throw new RingLoginError(
      "refused",
      "Ring did not accept the sign-in. Check the email and password, then run the setup again.",
    );
  }
}
