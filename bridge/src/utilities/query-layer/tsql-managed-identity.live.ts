// The core's connection settings for Azure SQL: the user-assigned managed identity signs in, so no
// SQL password exists (R12, R21). Only the core's wiring (host/core.ts) imports this file, never
// index.ts, so the connector never reaches mssql or @azure/identity (I5.3). It talks to the real
// managed identity endpoint, so it is excluded from coverage and runs in the pilot (I4.3).
import { ManagedIdentityCredential } from "@azure/identity";
import type { config as MssqlConfig } from "mssql";

/** Azure SQL's listening port. */
const AZURE_SQL_PORT = 1433;

/** Where the core's database is, and which managed identity signs in to it. */
export interface ManagedIdentitySqlSettings {
  /** The logical server's host name, such as `<server>.database.windows.net`. */
  readonly server: string;
  readonly database: string;
  readonly managedIdentityClientId: string;
}

/** mssql settings that sign in with the managed identity, over an encrypted, verified connection. */
export function managedIdentityTsqlConfig(
  settings: ManagedIdentitySqlSettings,
): MssqlConfig {
  const credential = new ManagedIdentityCredential({
    clientId: settings.managedIdentityClientId,
  });
  return {
    server: settings.server,
    port: AZURE_SQL_PORT,
    database: settings.database,
    authentication: { type: "token-credential", options: { credential } },
    options: { encrypt: true, trustServerCertificate: false },
  };
}
