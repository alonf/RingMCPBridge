// Mode H's core with its real resources (T027 part 4): Azure SQL and Key Vault, each reached with
// the core's user-assigned managed identity, and the owner's Entra sign-in, whose client assertion
// that identity signs (no client secret exists). Only `main.ts` imports this file. It reaches no
// Ring library (the dependency rule `core-reaches-no-ring-libraries`).
import { KeyVaultSecrets } from "../core/access/secrets/index.ts";
import { createKeyVaultSecretClient } from "../core/access/secrets/key-vault-client.live.ts";
import type { Clock } from "../utilities/clock/index.ts";
import type { Settings } from "../utilities/config/index.ts";
import type { Logger } from "../utilities/logging/index.ts";
import { createTsqlQueryLayer } from "../utilities/query-layer/tsql.ts";
import { managedIdentityTsqlConfig } from "../utilities/query-layer/tsql-managed-identity.live.ts";
import { EntraOwnerSignIn } from "../utilities/security/index.ts";
import { managedIdentityAssertion } from "../utilities/security/managed-identity-assertion.live.ts";
import { SIGN_IN_RETURN_PATH, startCoreService } from "./core-service.ts";
import type { RunningCore } from "./core-service.ts";

type CoreSettings = Extract<Settings, { readonly mode: "core" }>;

/** The Entra issuer for a tenant id or verified domain. */
export function entraIssuer(tenant: string): string {
  return `https://login.microsoftonline.com/${tenant}/v2.0`;
}

/** Starts mode H's core over Azure SQL, Key Vault and Entra. `clock` must be the `SystemClock`. */
export async function startCore(
  settings: CoreSettings,
  clock: Clock,
  logger: Logger,
): Promise<RunningCore> {
  const { core } = settings;
  const identity = core.managedIdentityClientId;
  const httpFetch = (url: string, init: RequestInit): Promise<Response> =>
    fetch(url, init);
  const store = createTsqlQueryLayer(
    managedIdentityTsqlConfig({
      server: core.sqlServer,
      database: core.sqlDatabase,
      managedIdentityClientId: identity,
    }),
    { clock },
  );
  const secrets = new KeyVaultSecrets(
    createKeyVaultSecretClient({
      vaultUrl: core.keyVaultUrl,
      managedIdentityClientId: identity,
    }),
  );
  const ownerSignIn = new EntraOwnerSignIn(
    {
      issuer: entraIssuer(core.entraTenantId),
      clientId: core.entraClientId,
      redirectUri: `${core.publicUrl}${SIGN_IN_RETURN_PATH}`,
      ...(core.ownerObjectId === undefined
        ? {}
        : { ownerObjectId: core.ownerObjectId }),
    },
    {
      clock,
      fetch: httpFetch,
      clientAssertion: managedIdentityAssertion(identity),
    },
  );
  return startCoreService(settings, {
    store,
    secrets,
    ownerSignIn,
    fetch: httpFetch,
    clock,
    logger,
  });
}
