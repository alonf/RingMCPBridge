// The Issuer's first signing key (T031; PT-03, PT-04, DRIFT-001-05): the owner writes it once,
// with their own sign-in, after the first deploy. One key is generated in memory, and its document
// is written straight to the core's secrets as `issuer-signing-keys`. Nothing is written when a
// document is already there, so a rerun never replaces the keys the Issuer signs with. The key is
// never returned, printed or logged. The core's Issuer, which retries its start every minute until
// its keys exist, then begins to serve.
import type { CoreSecrets } from "../../access/secrets/index.ts";
import { Secret } from "../../../utilities/security/index.ts";
import { generateSigningKey, signingKeyDocument } from "./signing-keys.ts";

/** What the step did: wrote the first key, or found keys already there and wrote nothing. */
export type FirstSigningKeyOutcome = "written" | "already_set";

/** Writes the first `issuer-signing-keys` document, unless one exists. Throws the store's error. */
export async function writeFirstSigningKey(
  secrets: CoreSecrets,
  signal: AbortSignal,
): Promise<FirstSigningKeyOutcome> {
  const existing = await secrets.read("issuer-signing-keys", signal);
  if (existing.kind === "found") {
    return "already_set";
  }
  await secrets.write(
    "issuer-signing-keys",
    new Secret(signingKeyDocument([generateSigningKey()])),
    signal,
  );
  return "written";
}
