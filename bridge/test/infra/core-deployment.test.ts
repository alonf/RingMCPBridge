// The core's deployment (T030), read as text: nothing in the Bicep runs here, so these checks keep
// it in step with the code that will run under it.
// - Every setting the core reads is set, or left on purpose to its recorded default; nothing is set
//   that the core does not read.
// - The values no other test sees: the proxy trusted, the image's port, the public URL from the host
//   name Azure gave the app, and the health check on `/readyz` with no warm-up path that would
//   gate a switch-over on it.
// - Only the console and platform logs leave App Service: HTTP logs record query strings, which
//   carry OAuth codes.
// - No deploy creates a secret (PT-03).
// - Every parameter the deploy must be given has a named source: a GitHub variable the bootstrap or
//   the runbook sets (T031), or a value the deploy itself supplies (T032).
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CORE_HOST_VARIABLES,
  SETTING_VARIABLES,
} from "../../src/utilities/config/index.ts";

const INFRA = fileURLToPath(new URL("../../../infra/", import.meta.url));
const DOCKERFILE = fileURLToPath(new URL("../../Dockerfile", import.meta.url));

/** Settings the deploy leaves to the core's recorded defaults (research.md, Config). */
const LEFT_AT_DEFAULT: ReadonlySet<string> = new Set([
  SETTING_VARIABLES.readsPerHour,
  SETTING_VARIABLES.batteryThresholdPct,
  SETTING_VARIABLES.staleAfterS,
  SETTING_VARIABLES.eventRetentionDays,
]);

function infraFile(path: string): string {
  return readFileSync(`${INFRA}${path}`, "utf8");
}

function allBicep(): string {
  const modules = readdirSync(`${INFRA}modules`)
    .filter((name) => name.endsWith(".bicep"))
    .map((name) => infraFile(`modules/${name}`));
  return [infraFile("main.bicep"), ...modules].join("\n");
}

const APP_SERVICE = infraFile("modules/app-service.bicep");
const BOOTSTRAP = infraFile("bootstrap/bootstrap.ps1");
const RUNBOOK = infraFile("bootstrap/entra-app-registration.md");

/**
 * Where each `main.bicep` parameter the deploy must be given comes from: a GitHub environment
 * variable the bootstrap sets (`bootstrap`) or the runbook tells the owner to set (`runbook`), or a
 * value the deploy workflow supplies itself (`deploy`, T032).
 */
const PARAMETER_SOURCES: Readonly<
  Record<
    string,
    {
      readonly from: "bootstrap" | "runbook" | "deploy";
      readonly variable?: string;
    }
  >
> = {
  registryName: { from: "bootstrap", variable: "AZURE_REGISTRY_NAME" },
  imageTag: { from: "deploy" },
  entraClientId: { from: "bootstrap", variable: "BRIDGE_ENTRA_CLIENT_ID" },
  ownerObjectId: { from: "bootstrap", variable: "BRIDGE_OWNER_OBJECT_ID" },
  sqlAdminGroupName: { from: "bootstrap", variable: "SQL_ADMIN_GROUP_NAME" },
  sqlAdminGroupObjectId: {
    from: "bootstrap",
    variable: "SQL_ADMIN_GROUP_OBJECT_ID",
  },
  keyVaultReaderRoleId: { from: "deploy" },
  storageBlobDataContributorRoleId: { from: "deploy" },
  // It has a default (no agents), but no agent can link until the owner lists one.
  agents: { from: "runbook", variable: "BRIDGE_AGENTS" },
};

/** The app settings the Bicep names, each with the expression it sets. */
function appSettings(): ReadonlyMap<string, string> {
  const settings = new Map<string, string>();
  for (const match of APP_SERVICE.matchAll(
    /\{\s*name:\s*'([A-Z_]+)',\s*value:\s*([^}]+?)\s*\}/g,
  )) {
    const [, name, value] = match;
    if (name !== undefined && value !== undefined) {
      settings.set(name, value);
    }
  }
  return settings;
}

describe("the core's deployment", () => {
  it("sets every setting the core reads, or leaves it to its default on purpose", () => {
    const set = new Set(appSettings().keys());
    const read: readonly string[] = [
      ...Object.values(SETTING_VARIABLES),
      ...Object.values(CORE_HOST_VARIABLES),
    ];

    const missing = read.filter(
      (variable) => !set.has(variable) && !LEFT_AT_DEFAULT.has(variable),
    );
    const unknown = [...set].filter(
      (name) => name.startsWith("BRIDGE_") && !read.includes(name),
    );

    expect(missing).toEqual([]);
    expect(unknown).toEqual([]);
    expect([...LEFT_AT_DEFAULT].filter((name) => set.has(name))).toEqual([]);
  });

  it("runs the core in mode H, trusting App Service's front end for HTTPS", () => {
    const settings = appSettings();

    expect(settings.get("BRIDGE_MODE")).toBe("'core'");
    expect(settings.get("BRIDGE_TRUST_PROXY")).toBe("'true'");
  });

  it("tells the core its public URL from the host name Azure gave the app, never a guessed one", () => {
    expect(appSettings().get("BRIDGE_PUBLIC_URL")).toBe("effectivePublicUrl");
    expect(APP_SERVICE).toContain(
      "'https://${app.properties.defaultHostName}'",
    );
    expect(allBicep()).not.toContain("azurewebsites.net'");
  });

  it("tells App Service and the core the port the image listens on", () => {
    const settings = appSettings();
    const exposed = /^EXPOSE (\d+)\r?$/m.exec(readFileSync(DOCKERFILE, "utf8"));

    expect(settings.get("WEBSITES_PORT")).toBe("port");
    expect(settings.get("BRIDGE_PORT")).toBe("port");
    expect(APP_SERVICE).toContain(`var port = '${exposed?.[1] ?? ""}'`);
  });

  it("checks health on /readyz, and never gates a switch-over on it", () => {
    expect(APP_SERVICE).toMatch(/healthCheckPath: '\/readyz'/);
    expect(appSettings().has("WEBSITE_WARMUP_PATH")).toBe(false);
  });

  it("sends only the console and platform logs, never the HTTP logs", () => {
    const categories = [
      ...APP_SERVICE.matchAll(/category: '([A-Za-z]+)'/g),
    ].map((match) => match[1]);

    expect(categories).toEqual([
      "AppServiceConsoleLogs",
      "AppServicePlatformLogs",
    ]);
    expect(APP_SERVICE).toMatch(/httpLoggingEnabled: false/);
  });

  it("names a source for every parameter the deploy must be given", () => {
    const required = [
      ...infraFile("main.bicep").matchAll(/^param (\w+) string\r?$/gm),
    ].map((match) => match[1]);

    expect(required).toContain("imageTag");
    expect(
      required.filter(
        (name) => name !== undefined && !(name in PARAMETER_SOURCES),
      ),
    ).toEqual([]);
    for (const [name, source] of Object.entries(PARAMETER_SOURCES)) {
      if (source.variable === undefined) {
        continue;
      }
      const by = source.from === "bootstrap" ? BOOTSTRAP : RUNBOOK;
      expect(by, `${name} from ${source.variable}`).toContain(source.variable);
    }
  });

  it("creates no secret and writes no secret value (PT-03)", () => {
    expect(allBicep()).not.toMatch(/Microsoft\.KeyVault\/vaults\/secrets/);
  });
});
