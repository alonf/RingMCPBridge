// The core's deployment (T030), read as text: nothing in the Bicep runs here, so these checks keep
// it in step with the code that will run under it.
// - Every setting the core reads is set, or left on purpose to its recorded default; nothing is set
//   that the core does not read.
// - The values no other test sees: the proxy trusted, the image's port, the health check on
//   `/readyz` with no warm-up path that would gate a switch-over on it.
// - Only the console and platform logs leave App Service: HTTP logs record query strings, which
//   carry OAuth codes.
// - No deploy creates a secret (PT-03).
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

  it("tells App Service and the core the port the image listens on", () => {
    const settings = appSettings();
    const exposed = /^EXPOSE (\d+)$/m.exec(readFileSync(DOCKERFILE, "utf8"));

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

  it("creates no secret and writes no secret value (PT-03)", () => {
    expect(allBicep()).not.toMatch(/Microsoft\.KeyVault\/vaults\/secrets/);
  });
});
