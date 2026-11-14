// Ring's sign-in for the Setup CLI (T028): the owner's email and password, then the 2FA code Ring
// sends. The Setup CLI drives it from the owner's terminal; the agent never does (FR-032). The live
// implementation is ring-login.live.ts; tests use a fake. Messages are the bridge's own text, and
// nothing Ring sends is copied into one, apart from the prompt shown to the owner (FR-034).
import type { Secret } from "../../../utilities/security/index.ts";

/** Where a sign-in stands after a step. */
export type RingLoginStep =
  /** Ring sent a code to the owner; `prompt` is Ring's own wording of where it went. */
  | { readonly kind: "needs_code"; readonly prompt: string }
  /** Ring did not accept the code. Another may be tried. */
  | { readonly kind: "wrong_code" }
  /** Signed in: the refresh token, in the form the Ring client reads at start. */
  | { readonly kind: "signed_in"; readonly refreshToken: Secret<string> };

/** One sign-in, for one session hardware ID. */
export interface RingLogin {
  /** Sends the email and password. Throws `RingLoginError`. */
  begin(email: string, password: Secret<string>): Promise<RingLoginStep>;
  /** Sends the code Ring asked for. Throws `RingLoginError`. */
  complete(code: string): Promise<RingLoginStep>;
  /** Ends the sign-in and its timers. */
  close(): void;
}

/**
 * - `refused`: Ring did not accept the email and password, or the sign-in failed another way;
 * - `too_many_codes`: Ring's limit of 10 codes in 10 minutes was reached.
 */
export type RingLoginErrorKind = "refused" | "too_many_codes";

/** A sign-in step that failed. */
export class RingLoginError extends Error {
  readonly kind: RingLoginErrorKind;

  constructor(
    kind: RingLoginErrorKind,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "RingLoginError";
    this.kind = kind;
  }
}
