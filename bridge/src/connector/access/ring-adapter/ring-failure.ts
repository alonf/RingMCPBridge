// A ring-client-api failure as the adapter's own error (R25; spec Edge Cases). Only the HTTP status
// and a known sign-in refusal are read; the library's message, response body and URL are never
// copied or attached, because they carry Ring's content (FR-034, OR6).
import { RingAdapterError } from "./ring-adapter-error.ts";

const HTTP_UNAUTHORIZED = 401;
const HTTP_NOT_ACCEPTABLE = 406;
const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_SERVER_ERROR = 500;

// ring-client-api refreshes the token itself on a 401. These are its words when that fails.
const SIGN_IN_REFUSED = [/refresh token is not valid/i, /2-factor|\b2fa\b/i];

const SESSION_LOST_MESSAGE =
  "Ring refused the saved sign-in; the owner must sign in again with the Setup CLI.";

function statusOf(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("response" in error)) {
    return undefined;
  }
  const { response } = error as { readonly response?: unknown };
  if (typeof response !== "object" || response === null) {
    return undefined;
  }
  const { status } = response as { readonly status?: unknown };
  return typeof status === "number" ? status : undefined;
}

function unavailableMessage(status: number | undefined): string {
  if (status === undefined) {
    return "Ring could not be reached.";
  }
  if (status === HTTP_NOT_ACCEPTABLE) {
    return "Ring refused the bridge (406), which counts as blocking.";
  }
  if (status === HTTP_TOO_MANY_REQUESTS) {
    return "Ring is limiting the bridge's calls (429).";
  }
  if (status >= HTTP_SERVER_ERROR) {
    return `Ring answered with a server error (${String(status)}).`;
  }
  return `Ring answered with status ${String(status)}.`;
}

/** `session_lost` for a refused sign-in; `ring_unavailable` for anything else Ring did. */
export function ringFailure(error: unknown): RingAdapterError {
  const status = statusOf(error);
  const message = error instanceof Error ? error.message : "";
  if (
    status === HTTP_UNAUTHORIZED ||
    SIGN_IN_REFUSED.some((pattern) => pattern.test(message))
  ) {
    return new RingAdapterError("session_lost", SESSION_LOST_MESSAGE);
  }
  return new RingAdapterError("ring_unavailable", unavailableMessage(status));
}

/** The error for a call refused because the session was already lost. */
export function sessionLost(): RingAdapterError {
  return new RingAdapterError("session_lost", SESSION_LOST_MESSAGE);
}
