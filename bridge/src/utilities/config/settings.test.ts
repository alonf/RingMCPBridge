import { describe, expect, it } from "vitest";
import { ConfigError, loadSettings } from "./index.ts";

/** Mode A's required settings. */
const LOCAL = {
  BRIDGE_MODE: "all-in-one",
  BRIDGE_DATA_DIR: "/var/lib/ring-bridge",
  BRIDGE_SECRETS_KEY_FILE: "/run/keys/secrets-key",
};

/** Mode H's core, every required setting. Ids are not GUID-shaped. */
const CORE = {
  BRIDGE_MODE: "core",
  BRIDGE_PUBLIC_URL: "https://bridge.example.test",
  BRIDGE_SQL_SERVER: "bridge-sql.database.windows.net",
  BRIDGE_SQL_DATABASE: "bridge",
  BRIDGE_KEY_VAULT_URL: "https://bridge-vault.vault.azure.net",
  BRIDGE_MANAGED_IDENTITY_CLIENT_ID: "core-identity-1",
  BRIDGE_ENTRA_TENANT_ID: "contoso.example",
  BRIDGE_ENTRA_CLIENT_ID: "bridge-app-1",
};

/** Ends a URL's user name and password; kept apart so the URL does not read as an address. */
const USERINFO_END = "@";

/** The connector's required settings. */
const HOME = {
  BRIDGE_MODE: "connector",
  BRIDGE_CORE_URL: "wss://bridge.example.test/link",
  BRIDGE_DATA_DIR: "/data",
  BRIDGE_SECRETS_KEY_FILE: "/run/secrets/bridge-secrets-key",
};

const AGENT = {
  client_id: "https://claude.example.test/oauth/client.json",
  platform: "Claude",
  scopes: ["read"],
  redirect_uris: ["https://claude.example.test/api/mcp/auth_callback"],
};

function configErrorFrom(
  environment: Record<string, string | undefined>,
): ConfigError {
  try {
    loadSettings(environment);
  } catch (error) {
    if (error instanceof ConfigError) {
      return error;
    }
    throw error;
  }
  throw new Error("expected a ConfigError");
}

describe("loadSettings", () => {
  it("applies the recorded defaults", () => {
    expect(loadSettings(LOCAL)).toEqual({
      mode: "all-in-one",
      logLevel: "info",
      readsPerHour: 600,
      batteryThresholdPct: 20,
      staleAfterMs: 120_000,
      eventRetentionDays: 30,
      local: {
        dataDir: "/var/lib/ring-bridge",
        secretsKeyPath: "/run/keys/secrets-key",
        ffmpegPath: "ffmpeg",
      },
    });
  });

  it("reads every common variable", () => {
    const settings = loadSettings({
      ...LOCAL,
      BRIDGE_LOG_LEVEL: "debug",
      BRIDGE_READS_PER_HOUR: "300",
      BRIDGE_BATTERY_THRESHOLD_PCT: "15",
      BRIDGE_STALE_AFTER_S: "90",
      BRIDGE_EVENT_RETENTION_DAYS: "14",
      BRIDGE_FFMPEG_PATH: "/usr/bin/ffmpeg",
    });

    expect(settings).toMatchObject({
      mode: "all-in-one",
      logLevel: "debug",
      readsPerHour: 300,
      batteryThresholdPct: 15,
      staleAfterMs: 90_000,
      eventRetentionDays: 14,
      local: { ffmpegPath: "/usr/bin/ffmpeg" },
    });
  });

  it("treats an empty value as unset", () => {
    expect(loadSettings({ ...LOCAL, BRIDGE_LOG_LEVEL: "" }).logLevel).toBe(
      "info",
    );
  });

  it("returns settings frozen all the way down", () => {
    const settings = loadSettings({
      ...CORE,
      BRIDGE_AGENTS: JSON.stringify([AGENT]),
    });
    if (settings.mode !== "core") {
      throw new Error("expected the core's settings");
    }

    expect(Object.isFrozen(settings)).toBe(true);
    expect(Object.isFrozen(settings.core)).toBe(true);
    expect(Object.isFrozen(settings.core.agents[0]?.redirect_uris)).toBe(true);
  });

  it("requires the run mode", () => {
    expect(configErrorFrom({}).variables).toEqual(["BRIDGE_MODE"]);
  });

  it.each([
    ["an unknown mode", { BRIDGE_MODE: "cloud" }, "BRIDGE_MODE"],
    [
      "a percentage over 100",
      { BRIDGE_BATTERY_THRESHOLD_PCT: "101" },
      "BRIDGE_BATTERY_THRESHOLD_PCT",
    ],
    ["a fraction", { BRIDGE_READS_PER_HOUR: "1.5" }, "BRIDGE_READS_PER_HOUR"],
    [
      "a negative number",
      { BRIDGE_STALE_AFTER_S: "-5" },
      "BRIDGE_STALE_AFTER_S",
    ],
    [
      "zero retention",
      { BRIDGE_EVENT_RETENTION_DAYS: "0" },
      "BRIDGE_EVENT_RETENTION_DAYS",
    ],
    ["an unknown level", { BRIDGE_LOG_LEVEL: "verbose" }, "BRIDGE_LOG_LEVEL"],
  ])("refuses %s", (_, overrides, variable) => {
    const error = configErrorFrom({ ...LOCAL, ...overrides });
    expect(error.kind).toBe("invalid_settings");
    expect(error.variables).toEqual([variable]);
  });

  it("names every bad variable at once, the mode's own with the common ones", () => {
    const error = configErrorFrom({
      BRIDGE_MODE: "connector",
      BRIDGE_READS_PER_HOUR: "x",
      BRIDGE_STALE_AFTER_S: "y",
    });
    expect(error.variables).toEqual([
      "BRIDGE_READS_PER_HOUR",
      "BRIDGE_STALE_AFTER_S",
      "BRIDGE_CORE_URL",
      "BRIDGE_DATA_DIR",
      "BRIDGE_SECRETS_KEY_FILE",
    ]);
  });

  it("never puts a setting's value in the error (FR-034)", () => {
    const pastedSecret = Buffer.from(
      "not-a-number-but-a-pasted-token",
    ).toString("base64url");
    const error = configErrorFrom({
      BRIDGE_MODE: pastedSecret,
      BRIDGE_READS_PER_HOUR: pastedSecret,
      BRIDGE_LOG_LEVEL: "4821",
      BRIDGE_AGENTS: pastedSecret,
    });

    const everything = `${error.message} ${String(error.stack)} ${JSON.stringify(error)}`;
    expect(everything).not.toContain(pastedSecret);
    expect(everything).not.toContain("4821");
    expect(error.message).toBe(
      "Invalid settings: BRIDGE_MODE, BRIDGE_LOG_LEVEL, BRIDGE_READS_PER_HOUR.",
    );
  });
});

describe("mode H's core settings", () => {
  it("reads the core's settings, with the port 8080, no proxy trust, no owner and no agents by default", () => {
    const settings = loadSettings(CORE);

    expect(settings).toMatchObject({
      mode: "core",
      core: {
        publicUrl: "https://bridge.example.test",
        port: 8080,
        trustProxy: false,
        sqlServer: "bridge-sql.database.windows.net",
        sqlDatabase: "bridge",
        keyVaultUrl: "https://bridge-vault.vault.azure.net",
        managedIdentityClientId: "core-identity-1",
        entraTenantId: "contoso.example",
        entraClientId: "bridge-app-1",
        agents: [],
      },
    });
    expect(settings.mode === "core" && "ownerObjectId" in settings.core).toBe(
      false,
    );
  });

  it("reads the owner, the port, proxy trust and the listed agents", () => {
    const settings = loadSettings({
      ...CORE,
      BRIDGE_PUBLIC_URL: "https://bridge.example.test/",
      BRIDGE_PORT: "3000",
      BRIDGE_TRUST_PROXY: "true",
      BRIDGE_OWNER_OBJECT_ID: "owner-object-1",
      BRIDGE_AGENTS: JSON.stringify([
        AGENT,
        {
          client_id: "registering-agent",
          scopes: ["read", "media"],
          redirect_uris: ["http://127.0.0.1:33418/callback"],
        },
      ]),
    });

    expect(settings).toMatchObject({
      core: {
        publicUrl: "https://bridge.example.test",
        port: 3000,
        trustProxy: true,
        ownerObjectId: "owner-object-1",
        agents: [
          AGENT,
          {
            client_id: "registering-agent",
            scopes: ["read", "media"],
            redirect_uris: ["http://127.0.0.1:33418/callback"],
          },
        ],
      },
    });
  });

  it("names exactly the required settings that are missing", () => {
    expect(configErrorFrom({ BRIDGE_MODE: "core" }).variables).toEqual([
      "BRIDGE_PUBLIC_URL",
      "BRIDGE_SQL_SERVER",
      "BRIDGE_SQL_DATABASE",
      "BRIDGE_KEY_VAULT_URL",
      "BRIDGE_MANAGED_IDENTITY_CLIENT_ID",
      "BRIDGE_ENTRA_TENANT_ID",
      "BRIDGE_ENTRA_CLIENT_ID",
    ]);
  });

  it.each([
    [
      "a public URL with a path",
      { BRIDGE_PUBLIC_URL: "https://b.example.test/mcp" },
      "BRIDGE_PUBLIC_URL",
    ],
    [
      "a plain-http public URL off this machine",
      { BRIDGE_PUBLIC_URL: "http://b.example.test" },
      "BRIDGE_PUBLIC_URL",
    ],
    [
      "a public URL with a password",
      { BRIDGE_PUBLIC_URL: `https://u:p${USERINFO_END}b.example.test` },
      "BRIDGE_PUBLIC_URL",
    ],
    [
      "a plain-http vault",
      { BRIDGE_KEY_VAULT_URL: "http://localhost:8200" },
      "BRIDGE_KEY_VAULT_URL",
    ],
    ["port 0", { BRIDGE_PORT: "0" }, "BRIDGE_PORT"],
    ["a port over 65535", { BRIDGE_PORT: "70000" }, "BRIDGE_PORT"],
    [
      "a proxy flag other than true or false",
      { BRIDGE_TRUST_PROXY: "yes" },
      "BRIDGE_TRUST_PROXY",
    ],
    [
      "an owner id with spaces",
      { BRIDGE_OWNER_OBJECT_ID: "owner 1" },
      "BRIDGE_OWNER_OBJECT_ID",
    ],
    ["agents that are not JSON", { BRIDGE_AGENTS: "[{" }, "BRIDGE_AGENTS"],
    [
      "an agent with an unknown scope",
      { BRIDGE_AGENTS: JSON.stringify([{ ...AGENT, scopes: ["admin"] }]) },
      "BRIDGE_AGENTS",
    ],
    [
      "an agent with no redirect URI",
      { BRIDGE_AGENTS: JSON.stringify([{ ...AGENT, redirect_uris: [] }]) },
      "BRIDGE_AGENTS",
    ],
    [
      "an agent redirecting to plain http off this machine",
      {
        BRIDGE_AGENTS: JSON.stringify([
          { ...AGENT, redirect_uris: ["http://claude.example.test/cb"] },
        ]),
      },
      "BRIDGE_AGENTS",
    ],
    [
      "an agent with a field the bridge does not know",
      { BRIDGE_AGENTS: JSON.stringify([{ ...AGENT, secret: "x" }]) },
      "BRIDGE_AGENTS",
    ],
  ])("refuses %s", (_, overrides, variable) => {
    expect(configErrorFrom({ ...CORE, ...overrides }).variables).toEqual([
      variable,
    ]);
  });

  it("accepts plain http to this machine, for a local run", () => {
    expect(
      loadSettings({ ...CORE, BRIDGE_PUBLIC_URL: "http://localhost:8080" }),
    ).toMatchObject({ core: { publicUrl: "http://localhost:8080" } });
  });
});

describe("the connector's settings", () => {
  it("reads the connector's settings, with ffmpeg from the path and no enrollment code by default", () => {
    const settings = loadSettings(HOME);

    expect(settings).toMatchObject({
      mode: "connector",
      home: {
        coreUrl: "wss://bridge.example.test/link",
        dataDir: "/data",
        secretsKeyPath: "/run/secrets/bridge-secrets-key",
        ffmpegPath: "ffmpeg",
      },
    });
    expect(
      settings.mode === "connector" && "enrollmentCode" in settings.home,
    ).toBe(false);
  });

  it("reads an enrollment code of up to 64 characters, and plain ws to this machine", () => {
    expect(
      loadSettings({
        ...HOME,
        BRIDGE_CORE_URL: "ws://127.0.0.1:8080/link",
        BRIDGE_ENROLLMENT_CODE: "c".repeat(64),
      }),
    ).toMatchObject({
      home: {
        coreUrl: "ws://127.0.0.1:8080/link",
        enrollmentCode: "c".repeat(64),
      },
    });
  });

  it.each([
    [
      "an https core URL",
      { BRIDGE_CORE_URL: "https://bridge.example.test/link" },
      "BRIDGE_CORE_URL",
    ],
    [
      "plain ws off this machine",
      { BRIDGE_CORE_URL: "ws://bridge.example.test/link" },
      "BRIDGE_CORE_URL",
    ],
    [
      "an enrollment code over 64 characters",
      { BRIDGE_ENROLLMENT_CODE: "c".repeat(65) },
      "BRIDGE_ENROLLMENT_CODE",
    ],
  ])("refuses %s", (_, overrides, variable) => {
    expect(configErrorFrom({ ...HOME, ...overrides }).variables).toEqual([
      variable,
    ]);
  });
});
