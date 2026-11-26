import type { PartnerHandler } from "../connector/clients/core-link/index.ts";
import { partnerResult } from "../core/clients/connector-link/messages/index.ts";
import type { pilotApp } from "../connector/access/ring-partner/app.ts";

/** Reuse the same account-link and signed webhook handlers for local and Azure ingress. */
export function partnerOperations(
  partner: ReturnType<typeof pilotApp>,
): PartnerHandler {
  return async (operation) => {
    if (operation.kind === "begin") {
      const accountLabel = partner.confirmationAccount(
        operation.time,
        operation.nonce,
      );
      return accountLabel ? { status: 200, accountLabel } : { status: 403 };
    }
    let response: Response;
    if (operation.kind === "webhook") {
      response = await partner.app.request("/ring/webhook", {
        method: "POST",
        headers: { "x-signature": operation.signature },
        body: Uint8Array.from(Buffer.from(operation.payload, "base64")),
      });
    } else if (operation.kind === "confirm") {
      const { time, nonce, proof } = operation;
      response = await partner.app.request("/ring/link", {
        method: "POST",
        headers: { cookie: "__Host-ring-confirm=" + proof },
        body: new URLSearchParams({ time, nonce, proof }),
      });
    } else {
      response = await partner.app.request("/ring/token", {
        method: "POST",
        body: new URLSearchParams({
          client_id: operation.clientId,
          code: operation.code,
        }),
      });
    }
    await response.body?.cancel();
    const parsed = partnerResult.safeParse({ status: response.status });
    return parsed.success ? parsed.data : { status: 502 };
  };
}
