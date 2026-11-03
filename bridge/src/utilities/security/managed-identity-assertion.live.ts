// The core's user-assigned managed identity as the Entra sign-in's credential (R12): the app
// registration trusts it as a federated credential, so no client secret exists. Only the core's
// wiring (host/core.ts) imports this file, never index.ts, so the connector never reaches
// @azure/identity (I5.3). It talks to the real managed identity endpoint, so it is excluded from
// coverage and runs in the pilot (I4.3).
import { ManagedIdentityCredential } from "@azure/identity";
import type { ClientAssertionSource } from "./entra-sign-in.ts";

// The audience a federated credential trusts in Azure's public cloud (Microsoft Entra Workload ID:
// "Configure an application to trust a managed identity").
const TOKEN_EXCHANGE_SCOPE = "api://AzureADTokenExchange/.default";

/** Client assertions from the user-assigned managed identity with this client id. */
export function managedIdentityAssertion(
  managedIdentityClientId: string,
): ClientAssertionSource {
  const credential = new ManagedIdentityCredential({
    clientId: managedIdentityClientId,
  });
  return async (signal) => {
    const token = await credential.getToken(TOKEN_EXCHANGE_SCOPE, {
      abortSignal: signal,
    });
    return token.token;
  };
}
