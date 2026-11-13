// The deploy (T032; DRIFT-001-64). Its two scripts run here; its workflow is read as text, since
// nothing in it can run outside GitHub and the owner's Azure.
// - The parameters: every `main.bicep` parameter the deploy must give has a source, a GitHub variable
//   the bootstrap or the runbook sets, or a value the workflow supplies; a missing one stops the
//   deploy by name, and the listed agents arrive as the string the Bicep takes.
// - The smoke test passes on a ready core, and names what is wrong otherwise.
// - The workflow: pushes get no Azure access; Azure is reached only in jobs on the `production`
//   environment, started by hand, after CI passed on the same commit; each image is smoke-tested
//   before it is pushed; the role ids are looked up by name; one deploy runs at a time; the owner's
//   IDs and the registry's name are read as secrets, which GitHub hides in the public logs.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  deploymentParameters,
  DeployParametersError,
  PARAMETERS,
} from "../../../scripts/deploy-parameters.mjs";
import { smokeTest } from "../../../scripts/deploy-smoke.mjs";
import {
  freePort,
  memorySecrets,
  startTestCore,
} from "../host/core-fixture.ts";
import type { Cleanups } from "../host/core-fixture.ts";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const MAIN_BICEP = readFileSync(join(ROOT, "infra/main.bicep"), "utf8");
const BOOTSTRAP = readFileSync(
  join(ROOT, "infra/bootstrap/bootstrap.ps1"),
  "utf8",
);
const RUNBOOK = readFileSync(
  join(ROOT, "infra/bootstrap/entra-app-registration.md"),
  "utf8",
);
const WORKFLOW = readFileSync(
  join(ROOT, ".github/workflows/deploy.yml"),
  "utf8",
).replace(/\r\n/g, "\n");
const PARAMETERS_SCRIPT = join(ROOT, "scripts/deploy-parameters.mjs");

/** The values that identify the owner's Azure and Entra, kept out of the public logs (DRIFT-001-68). */
const OWNER_SECRETS = [
  "AZURE_CLIENT_ID",
  "AZURE_TENANT_ID",
  "AZURE_SUBSCRIPTION_ID",
  "AZURE_REGISTRY_NAME",
  "BRIDGE_ENTRA_CLIENT_ID",
  "BRIDGE_OWNER_OBJECT_ID",
  "SQL_ADMIN_GROUP_OBJECT_ID",
];

const cleanups: Cleanups = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    await cleanup();
  }
});

/** A value for every variable the deploy reads, each one distinct and easy to spot in output. */
function everyVariable(): Record<string, string> {
  return Object.fromEntries(
    PARAMETERS.map((entry) => [
      entry.variable,
      entry.json === "array" ? "[]" : `value-of-${entry.variable}`,
    ]),
  );
}

/** Each job's text, by name, from the workflow's `jobs:` block. */
function jobs(): ReadonlyMap<string, string> {
  const [, body = ""] = WORKFLOW.split(/^jobs:\n/m);
  const found = new Map<string, string>();
  for (const block of body.split(/^(?= {2}[a-z-]+:\n)/m)) {
    const name = /^ {2}([a-z-]+):\n/.exec(block)?.[1];
    if (name !== undefined) {
      found.set(name, block);
    }
  }
  return found;
}

function job(name: string): string {
  const text = jobs().get(name);
  if (text === undefined) {
    throw new Error(`The workflow has no job ${name}.`);
  }
  return text;
}

describe("the deploy's parameters (scripts/deploy-parameters.mjs)", () => {
  it("sets every main.bicep parameter that has no default, and only parameters main.bicep has", () => {
    const declared = [...MAIN_BICEP.matchAll(/^param (\w+) /gm)].map(
      (match) => match[1],
    );
    const required = [...MAIN_BICEP.matchAll(/^param (\w+) string\r?$/gm)].map(
      (match) => match[1],
    );
    const set = PARAMETERS.map((entry) => entry.name);

    expect(required).toContain("imageTag");
    expect(required.filter((name) => !set.includes(String(name)))).toEqual([]);
    expect(set.filter((name) => !declared.includes(name))).toEqual([]);
  });

  it("takes each variable from the bootstrap, the runbook, or the workflow's own step", () => {
    const azure = job("azure");
    for (const entry of PARAMETERS) {
      const by =
        entry.from === "bootstrap"
          ? BOOTSTRAP
          : entry.from === "runbook"
            ? RUNBOOK
            : azure;
      expect(by, `${entry.name} from ${entry.variable}`).toContain(
        entry.variable,
      );
      expect(azure, `the workflow passes ${entry.variable}`).toMatch(
        new RegExp(`\\b${entry.variable}[=:]`),
      );
    }
  });

  it("stops on missing variables, naming them and no value", () => {
    const env = everyVariable();
    delete env.BRIDGE_OWNER_OBJECT_ID;
    env.KEY_VAULT_READER_ROLE_ID = "";

    let thrown: unknown;
    try {
      deploymentParameters(env);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(DeployParametersError);
    const message = (thrown as Error).message;
    expect(message).toContain("BRIDGE_OWNER_OBJECT_ID");
    expect(message).toContain("KEY_VAULT_READER_ROLE_ID");
    expect(message).not.toMatch(/value-of-/);
  });

  it("passes the listed agents as a string, and refuses agents that are not a JSON array", () => {
    const agents = JSON.stringify([
      {
        client_id: "agent",
        redirect_uris: ["https://agent.example.test/cb"],
        scopes: ["read"],
      },
    ]);

    const file = deploymentParameters({
      ...everyVariable(),
      BRIDGE_AGENTS: agents,
    });

    expect(file.parameters.agents).toEqual({ value: agents });
    expect(() =>
      deploymentParameters({ ...everyVariable(), BRIDGE_AGENTS: '{"a":1}' }),
    ).toThrow(/BRIDGE_AGENTS must be a JSON array/);
  });

  it("leaves an optional variable left empty to the Bicep's default", () => {
    const file = deploymentParameters({
      ...everyVariable(),
      BRIDGE_AGENTS: "",
      BRIDGE_REGISTRATIONS_PER_HOUR: " ",
      BRIDGE_LOG_LEVEL: "",
    });

    expect(Object.keys(file.parameters)).not.toContain("agents");
    expect(Object.keys(file.parameters)).not.toContain("registrationsPerHour");
    expect(Object.keys(file.parameters)).not.toContain("logLevel");
    expect(file.parameters.imageTag).toEqual({ value: "value-of-IMAGE_TAG" });
  });

  it("writes the file from the command line, printing parameter names only", () => {
    const folder = mkdtempSync(join(tmpdir(), "deploy-parameters-"));
    cleanups.push(() => {
      rmSync(folder, { recursive: true, force: true });
      return Promise.resolve();
    });
    const output = join(folder, "parameters.json");
    const env = { ...process.env, ...everyVariable() };

    const run = spawnSync(process.execPath, [PARAMETERS_SCRIPT, output], {
      env,
      encoding: "utf8",
    });

    expect(run.status).toBe(0);
    expect(run.stdout).toContain("imageTag");
    expect(run.stdout + run.stderr).not.toMatch(/value-of-/);
    expect(JSON.parse(readFileSync(output, "utf8"))).toEqual(
      deploymentParameters(everyVariable()),
    );

    const missing = spawnSync(process.execPath, [PARAMETERS_SCRIPT, output], {
      env: { ...env, AZURE_REGISTRY_NAME: "" },
      encoding: "utf8",
    });
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain("AZURE_REGISTRY_NAME");
  });
});

describe("the deploy's smoke test (scripts/deploy-smoke.mjs)", () => {
  it("passes on a ready core", async () => {
    const { url } = await startTestCore(cleanups);

    expect(await smokeTest(url)).toEqual([]);
  });

  it("names the missing signing keys of a core not yet ready", async () => {
    const { url } = await startTestCore(cleanups, {
      secrets: memorySecrets(),
    });

    const problems = await smokeTest(url);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^\/readyz answered 503, not ready: /);
    expect(problems[0]).toContain("signing_keys missing");
  });

  it("fails when /mcp answers a call with no token", async () => {
    const { url } = await startTestCore(cleanups);
    const open: typeof fetch = (target, init) =>
      new URL(target instanceof Request ? target.url : target).pathname ===
      "/mcp"
        ? Promise.resolve(new Response("{}", { status: 200 }))
        : fetch(target, init);

    expect(await smokeTest(url, open)).toEqual([
      "/mcp answered 200 to a call with no token, not 401.",
    ]);
  });

  it("reports a core it cannot reach", async () => {
    const problems = await smokeTest(
      `http://127.0.0.1:${String(await freePort())}`,
    );

    expect(problems).toHaveLength(3);
  });
});

describe("the deploy workflow (.github/workflows/deploy.yml)", () => {
  it("gives pushes no Azure access: they build the Bicep only", () => {
    const bicep = job("bicep");

    expect(bicep).toContain("if: github.event_name == 'push'");
    expect(bicep).toContain("az bicep build --file infra/main.bicep");
    expect(bicep).not.toMatch(
      /azure\/login|id-token|environment:|vars\.|secrets\./,
    );
    expect(WORKFLOW).not.toMatch(/pull_request_target/);
    expect(WORKFLOW).toMatch(/^permissions:\n {2}contents: read\n\n/m);
  });

  it("reaches Azure only in jobs on the production environment, started by hand after CI passed", () => {
    const tested = job("tested");
    expect(tested).toContain("if: github.event_name == 'workflow_dispatch'");
    expect(tested).toMatch(
      /gh run list .*--workflow ci\.yml --commit "\$GITHUB_SHA" --status success/,
    );
    expect(job("image")).toMatch(/needs: tested\n/);
    expect(job("publish")).toMatch(/needs: image\n/);
    expect(job("azure")).toMatch(/needs: \[tested, publish\]/);
    expect(job("azure")).toContain("needs.tested.result == 'success'");

    const azureJobs = [...jobs()].filter(([, text]) =>
      /azure\/login|vars\.|secrets\./.test(text),
    );
    expect(azureJobs.map(([name]) => name)).toEqual(["publish", "azure"]);
    for (const [name, text] of azureJobs) {
      expect(text, name).toContain("environment: production");
      expect(text, name).toContain("id-token: write");
    }
    for (const [name, text] of jobs()) {
      if (!["publish", "azure"].includes(name)) {
        expect(text, name).not.toMatch(/id-token|environment:/);
      }
    }
  });

  it("deploys a build only once its images are pushed", () => {
    expect(job("azure")).toMatch(
      /needs\.publish\.result == 'success' \|\| inputs\.action != 'deploy' \|\| inputs\.image_tag != ''/,
    );
  });

  it("smoke-tests each image, amd64 and arm64, before pushing it", () => {
    const image = job("image");

    expect(image).toMatch(/arch: amd64\n\s+runner: ubuntu-latest/);
    expect(image).toMatch(/arch: arm64\n\s+runner: ubuntu-24\.04-arm/);
    const smoke = image.indexOf("node scripts/image-smoke.mjs");
    expect(smoke).toBeGreaterThan(image.indexOf("docker build"));
    expect(image.indexOf("docker push")).toBeGreaterThan(smoke);
  });

  it("looks the role ids up by name, and deploys under the name the bootstrap reads", () => {
    const azure = job("azure");

    expect(azure).toContain(
      "az role definition list --name 'Key Vault Secrets User'",
    );
    expect(azure).toContain(
      "az role definition list --name 'Storage Blob Data Contributor'",
    );
    const name = /DEPLOYMENT_NAME: (\S+)/.exec(WORKFLOW)?.[1];
    expect(BOOTSTRAP).toContain(`$DeploymentName = '${String(name)}'`);
  });

  it("pushes the core's image where App Service pulls it from", () => {
    const image = /IMAGE_NAME: (\S+)/.exec(WORKFLOW)?.[1];

    expect(MAIN_BICEP).toContain(`param imageName string = '${String(image)}'`);
    expect(job("publish")).toContain('"$server/$IMAGE_NAME:$GITHUB_SHA"');
    expect(job("azure")).toContain(
      "IMAGE_TAG: ${{ inputs.image_tag || github.sha }}",
    );
  });

  it("reaches the registry with AcrPush alone: no command reads it through Resource Manager", () => {
    const registryCommands = new Set(
      [...WORKFLOW.matchAll(/az acr (\w+)/g)].map((match) => match[1]),
    );

    expect([...registryCommands].sort()).toEqual(["login", "repository"]);
  });

  it("passes the parameters as a file, never as name=value", () => {
    const azure = job("azure");
    const deployments = [
      ...azure.matchAll(/az deployment group (what-if|create) .*$/gm),
    ].map((match) => match[0]);

    expect(deployments).toHaveLength(2);
    for (const command of deployments) {
      expect(command).toContain('--parameters "@$RUNNER_TEMP/parameters.json"');
    }
    expect(WORKFLOW).not.toMatch(/--parameters \w+=/);
  });

  it("skips the smoke test on the first deploy, and runs one deploy at a time", () => {
    const azure = job("azure");

    expect(azure).toContain(
      "if: inputs.action == 'smoke' || (inputs.action == 'deploy' && steps.first.outputs.first != 'true')",
    );
    expect(WORKFLOW).toMatch(/cancel-in-progress: false/);
  });

  it("reads only secrets and variables the bootstrap or the runbook sets", () => {
    const read = new Set(
      [...WORKFLOW.matchAll(/(?:vars|secrets)\.(\w+)/g)].map(
        (match) => match[1],
      ),
    );

    for (const variable of read) {
      expect(
        BOOTSTRAP.includes(String(variable)) ||
          RUNBOOK.includes(String(variable)),
        String(variable),
      ).toBe(true);
    }
  });

  it("keeps the owner's IDs and the registry's name out of the public logs, as secrets", () => {
    const secrets = new Set(
      [...WORKFLOW.matchAll(/secrets\.(\w+)/g)].map((match) => match[1]),
    );
    expect([...secrets].sort()).toEqual([...OWNER_SECRETS].sort());
    for (const name of OWNER_SECRETS) {
      expect(WORKFLOW, name).not.toContain(`vars.${name}`);
    }
    const bootstrapSecrets =
      /\$secrets = \[ordered\]@\{\n([\s\S]*?)\n\s*\}/.exec(
        BOOTSTRAP.replace(/\r\n/g, "\n"),
      )?.[1] ?? "";
    expect(
      [...bootstrapSecrets.matchAll(/^\s*(\w+)\s*=/gm)].map(
        (match) => match[1],
      ),
    ).toEqual(OWNER_SECRETS);
  });

  it("hides the registry's name in lowercase too, in each job that reads it, before its first use", () => {
    const mask = 'echo "::add-mask::${AZURE_REGISTRY_NAME,,}"';
    const publish = job("publish");
    expect(publish.indexOf(mask)).toBeGreaterThan(0);
    expect(publish.indexOf(mask)).toBeLessThan(
      publish.indexOf('az acr login --name "$AZURE_REGISTRY_NAME"'),
    );
    const azure = job("azure");
    expect(azure.indexOf(mask)).toBeGreaterThan(0);
    expect(azure.indexOf(mask)).toBeLessThan(azure.indexOf("azure/login"));
    // A value put into the script itself would be printed with the script.
    expect(WORKFLOW).not.toMatch(/add-mask::\$\{\{/);
  });
});
