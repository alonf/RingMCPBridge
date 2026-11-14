// The settings each run mode needs beyond the common ones (T027): where the core is reached, its
// database, secrets, sign-in and listed agents (mode H's core); where the home side keeps its files
// and dials the core (the connector); and the one folder mode A keeps everything in.
// Values tuned or set per deployment, never secrets: those live in Key Vault or the sealed files.
import { z } from "zod";

const PORT_DEFAULT = 8080;
const MAX_PORT = 65_535;
const REGISTRATIONS_PER_HOUR_DEFAULT = 10;
const MAX_REGISTRATIONS_PER_HOUR = 1000;
const MAX_ID_LENGTH = 400;
const LOCAL_HOSTS: ReadonlySet<string> = new Set([
  "localhost",
  "127.0.0.1",
  "[::1]",
]);
/** An Entra object or client id: letters, digits, `.` and `-`. */
const ENTRA_ID = /^[A-Za-z0-9.-]{1,100}$/;
/**
 * The Entra directory (tenant) ID. Not a domain name: Entra names a tenant's issuer by its ID, and
 * the sign-in requires that exact issuer (CP-10 review).
 */
const TENANT_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_FFMPEG = "ffmpeg";

/** The scopes an agent may be listed with (FR-030). */
export type ListedAgentScope = "read" | "media" | "control";

/** One listed agent, as the deployment names it (data-model.md "Agent client and grant"). */
export interface ListedAgentSetting {
  readonly client_id: string;
  /** What the admin page shows, for example "Claude". */
  readonly platform?: string;
  readonly scopes: readonly ListedAgentScope[];
  readonly redirect_uris: readonly string[];
}

/** Mode H's core. */
export interface CoreHostSettings {
  /** The core's public origin, `https://<host>`. The Issuer, `/mcp`, `/link` and the sign-in return hang off it. */
  readonly publicUrl: string;
  /** The port the core listens on. */
  readonly port: number;
  /** Whether to trust App Service's front end for `X-Forwarded-Proto` and the client's address. */
  readonly trustProxy: boolean;
  /** Azure SQL: `<server>.database.windows.net`. */
  readonly sqlServer: string;
  readonly sqlDatabase: string;
  /** The vault holding the core's secrets: `https://<vault>.vault.azure.net`. */
  readonly keyVaultUrl: string;
  /** The user-assigned identity the core reaches SQL, Key Vault and Entra with. */
  readonly managedIdentityClientId: string;
  /** The directory (tenant) ID, not a domain name. */
  readonly entraTenantId: string;
  /** The bridge's app registration. */
  readonly entraClientId: string;
  /** The owner's Entra object id. Unset, every sign-in is refused, and `/readyz` says so. */
  readonly ownerObjectId?: string;
  readonly agents: readonly ListedAgentSetting[];
  /** New agent registrations (DCR) the Issuer accepts in an hour, across all agents (CP-17's review). */
  readonly registrationsPerHour: number;
}

/** The home part (connector). */
export interface HomeSettings {
  /** The core's link: `wss://<host>/link`. */
  readonly coreUrl: string;
  /** The folder holding the outbox and the Secrets File. */
  readonly dataDir: string;
  /** The file holding the Secrets File's key, apart from the data folder. */
  readonly secretsKeyPath: string;
  readonly ffmpegPath: string;
}

/** Mode A: core and home in one process, with everything in one folder. */
export interface LocalSettings {
  /** The folder holding the database, the outbox and the Secrets File. */
  readonly dataDir: string;
  readonly secretsKeyPath: string;
  readonly ffmpegPath: string;
}

/** The Setup CLI (T028): the home's folder and the Secrets File's key, for the connector or mode A. */
export interface SetupSettings {
  readonly dataDir: string;
  readonly secretsKeyPath: string;
}

/** The variable behind each of mode H's core settings. */
export const CORE_HOST_VARIABLES = {
  publicUrl: "BRIDGE_PUBLIC_URL",
  port: "BRIDGE_PORT",
  trustProxy: "BRIDGE_TRUST_PROXY",
  sqlServer: "BRIDGE_SQL_SERVER",
  sqlDatabase: "BRIDGE_SQL_DATABASE",
  keyVaultUrl: "BRIDGE_KEY_VAULT_URL",
  managedIdentityClientId: "BRIDGE_MANAGED_IDENTITY_CLIENT_ID",
  entraTenantId: "BRIDGE_ENTRA_TENANT_ID",
  entraClientId: "BRIDGE_ENTRA_CLIENT_ID",
  ownerObjectId: "BRIDGE_OWNER_OBJECT_ID",
  agents: "BRIDGE_AGENTS",
  registrationsPerHour: "BRIDGE_REGISTRATIONS_PER_HOUR",
} as const;

/** The variable behind each of the connector's settings. */
export const HOME_VARIABLES = {
  coreUrl: "BRIDGE_CORE_URL",
  dataDir: "BRIDGE_DATA_DIR",
  secretsKeyPath: "BRIDGE_SECRETS_KEY_FILE",
  ffmpegPath: "BRIDGE_FFMPEG_PATH",
} as const;

/** The variable behind each of mode A's settings. */
export const LOCAL_VARIABLES = {
  dataDir: "BRIDGE_DATA_DIR",
  secretsKeyPath: "BRIDGE_SECRETS_KEY_FILE",
  ffmpegPath: "BRIDGE_FFMPEG_PATH",
} as const;

/** The variable behind each of the Setup CLI's settings: the same as the connector's and mode A's. */
export const SETUP_VARIABLES = {
  dataDir: "BRIDGE_DATA_DIR",
  secretsKeyPath: "BRIDGE_SECRETS_KEY_FILE",
} as const;

/** A URL with one of `protocols`; plain `http:` or `ws:` only to this machine, for local runs. */
function urlWith(secure: string, local: string): z.ZodType<URL, string> {
  return z
    .url()
    .transform((text) => new URL(text))
    .refine(
      (url) =>
        url.protocol === secure ||
        (url.protocol === local && LOCAL_HOSTS.has(url.hostname)),
    )
    .refine((url) => url.username === "" && url.password === "");
}

const text = (max: number): z.ZodString => z.string().min(1).max(max);

const AGENT_SCHEMA = z
  .object({
    client_id: text(MAX_ID_LENGTH),
    platform: text(MAX_ID_LENGTH).optional(),
    scopes: z.array(z.enum(["read", "media", "control"])).min(1),
    redirect_uris: z.array(urlWith("https:", "http:")).min(1),
  })
  .strict()
  .transform(({ platform, ...agent }): ListedAgentSetting => ({
    ...agent,
    ...(platform === undefined ? {} : { platform }),
    redirect_uris: agent.redirect_uris.map((uri) => uri.href),
  }));

const AGENTS_SCHEMA = z
  .string()
  .optional()
  .transform((json, context): unknown => {
    if (json === undefined) {
      return [];
    }
    try {
      return JSON.parse(json) as unknown;
    } catch {
      context.addIssue({ code: "custom", message: "not JSON" });
      return z.NEVER;
    }
  })
  .pipe(z.array(AGENT_SCHEMA));

/** The core's public origin: `https:` with no path, query or fragment. */
const ORIGIN_SCHEMA = urlWith("https:", "http:")
  .refine((url) => url.pathname === "/" && url.search === "" && url.hash === "")
  .transform((url) => url.origin);

const FLAG_SCHEMA = z
  .enum(["true", "false"])
  .optional()
  .transform((flag) => flag === "true");

export const CORE_HOST_SCHEMA: z.ZodType<CoreHostSettings> = z
  .object({
    publicUrl: ORIGIN_SCHEMA,
    port: z
      .string()
      .regex(/^\d{1,5}$/)
      .transform(Number)
      .pipe(z.number().int().min(1).max(MAX_PORT))
      .optional()
      .transform((port) => port ?? PORT_DEFAULT),
    trustProxy: FLAG_SCHEMA,
    sqlServer: text(MAX_ID_LENGTH),
    sqlDatabase: text(MAX_ID_LENGTH),
    keyVaultUrl: urlWith("https:", "https:").transform((url) => url.origin),
    managedIdentityClientId: z.string().regex(ENTRA_ID),
    entraTenantId: z.string().regex(TENANT_ID),
    entraClientId: z.string().regex(ENTRA_ID),
    ownerObjectId: z.string().regex(ENTRA_ID).optional(),
    agents: AGENTS_SCHEMA,
    registrationsPerHour: z
      .string()
      .regex(/^\d{1,4}$/)
      .transform(Number)
      .pipe(z.number().int().min(1).max(MAX_REGISTRATIONS_PER_HOUR))
      .optional()
      .transform((limit) => limit ?? REGISTRATIONS_PER_HOUR_DEFAULT),
  })
  .transform(({ ownerObjectId, ...core }): CoreHostSettings => ({
    ...core,
    ...(ownerObjectId === undefined ? {} : { ownerObjectId }),
  }));

export const HOME_SCHEMA: z.ZodType<HomeSettings> = z.object({
  coreUrl: urlWith("wss:", "ws:").transform((url) => url.href),
  dataDir: text(MAX_ID_LENGTH),
  secretsKeyPath: text(MAX_ID_LENGTH),
  ffmpegPath: text(MAX_ID_LENGTH)
    .optional()
    .transform((path) => path ?? DEFAULT_FFMPEG),
});

export const SETUP_SCHEMA: z.ZodType<SetupSettings> = z.object({
  dataDir: text(MAX_ID_LENGTH),
  secretsKeyPath: text(MAX_ID_LENGTH),
});

export const LOCAL_SCHEMA: z.ZodType<LocalSettings> = z.object({
  dataDir: text(MAX_ID_LENGTH),
  secretsKeyPath: text(MAX_ID_LENGTH),
  ffmpegPath: text(MAX_ID_LENGTH)
    .optional()
    .transform((path) => path ?? DEFAULT_FFMPEG),
});
