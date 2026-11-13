// The owner's bootstrap (T031), run by PowerShell 7 against stand-ins for az, gh and node
// (bootstrap-harness.ps1): nothing reaches Azure or GitHub. It checks what the script would do to
// the owner's subscription:
// - print-only, the default, calls nothing at all;
// - with -Apply on an empty subscription, it creates in the recorded order, with the GitHub OIDC
//   subject for the environment and the role-assignment limit (roles looked up by name, service
//   principals only);
// - the IDs and the registry's name go into the GitHub environment as secrets, which GitHub hides in
//   the repository's public logs; only the resource group and the SQL group's name are variables;
// - with -Apply where everything exists, it only reads, besides setting the secrets again, which
//   cannot be read back;
// - after the first deploy, it grants AcrPull, makes the core's identity the Entra app's federated
//   credential, adds the redirect URI, writes the first key through the node command, prints the
//   T-SQL, and restarts the core only once the owner says the database user exists.
// PowerShell 7 ships on the CI runner, so these run in CI; without `pwsh` they fail there, as the
// SQL Server tests do, and are skipped elsewhere.
/* eslint-disable @typescript-eslint/naming-convention -- the script's PowerShell parameter names and Azure's role names */
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SCRIPT = fileURLToPath(
  new URL("../../../infra/bootstrap/bootstrap.ps1", import.meta.url),
);
const HARNESS = fileURLToPath(
  new URL("./bootstrap-harness.ps1", import.meta.url),
);
const RUN_TIMEOUT_MS = 60_000;

const HAS_PWSH =
  spawnSync("pwsh", ["-NoProfile", "-Command", "exit 0"]).status === 0;
if (!HAS_PWSH && process.env.CI !== undefined) {
  throw new Error(
    "PowerShell 7 (pwsh) is required in CI for the bootstrap tests.",
  );
}

const REPO = "example-owner/example-repo";
const REGISTRY = "exampleregistry";
const SUBSCRIPTION_NAME = "Example subscription";

interface Rule {
  readonly tool: "az" | "gh" | "node";
  readonly match: string;
  readonly output?: string;
  readonly exit?: number;
}

interface Run {
  readonly calls: readonly string[];
  readonly output: string;
  readonly exitCode: number;
}

/** IDs as Azure would hand them back, made fresh for each run. */
function ids(): Record<string, string> {
  return {
    subscription: randomUUID(),
    tenant: randomUUID(),
    deployPrincipal: randomUUID(),
    deployClient: randomUUID(),
    corePrincipal: randomUUID(),
    owner: randomUUID(),
    entraApp: randomUUID(),
    keyVaultSecretsUser: randomUUID(),
    keyVaultSecretsOfficer: randomUUID(),
    blobDataContributor: randomUUID(),
    contributor: randomUUID(),
    roleAdministrator: randomUUID(),
    acrPush: randomUUID(),
    acrPull: randomUUID(),
  };
}

function json(value: unknown): string {
  return JSON.stringify(value);
}

function run(
  parameters: Record<string, unknown>,
  rules: readonly Rule[],
  answers = "y",
): Run {
  const result = spawnSync(
    "pwsh",
    ["-NoProfile", "-NonInteractive", "-File", HARNESS, "-ScriptPath", SCRIPT],
    {
      encoding: "utf8",
      timeout: RUN_TIMEOUT_MS,
      env: {
        ...process.env,
        BOOTSTRAP_ARGS: json(parameters),
        BOOTSTRAP_WORLD: json(
          rules.map((rule) => ({ output: "", exit: 0, ...rule })),
        ),
        BOOTSTRAP_ANSWERS: answers,
      },
    },
  );
  const output = `${result.stdout}${result.stderr}`;
  const exit = /^EXIT (\d+)$/m.exec(output);
  return {
    calls: output
      .split(/\r?\n/)
      .filter((line) => line.startsWith("CALL "))
      .map((line) => line.slice("CALL ".length)),
    output,
    exitCode: exit === null ? -1 : Number(exit[1]),
  };
}

const BEFORE = {
  SubscriptionName: SUBSCRIPTION_NAME,
  GitHubRepo: REPO,
  RegistryName: REGISTRY,
};

/** Role ids by name, as `az role definition list --name` answers. */
function roleRules(id: Record<string, string>): Rule[] {
  const roles: Record<string, string> = {
    Contributor: id.contributor ?? "",
    "Role Based Access Control Administrator": id.roleAdministrator ?? "",
    AcrPush: id.acrPush ?? "",
    AcrPull: id.acrPull ?? "",
    "Key Vault Secrets User": id.keyVaultSecretsUser ?? "",
    "Key Vault Secrets Officer": id.keyVaultSecretsOfficer ?? "",
    "Storage Blob Data Contributor": id.blobDataContributor ?? "",
  };
  return Object.entries(roles).map(([name, roleId]) => ({
    tool: "az",
    match: `role definition list --name ${name} *`,
    output: json(roleId),
  }));
}

function signedIn(id: Record<string, string>): Rule[] {
  return [
    {
      tool: "az",
      match: "account list *",
      output: json([
        { name: SUBSCRIPTION_NAME, id: id.subscription, tenantId: id.tenant },
      ]),
    },
  ];
}

function emptySubscription(id: Record<string, string>): Rule[] {
  return [
    ...signedIn(id),
    ...roleRules(id),
    { tool: "az", match: "group exists *", output: "false" },
    // az answers a list with nothing in it as `[]`, as here, not with no output.
    { tool: "az", match: "identity list *", output: "[]" },
    { tool: "az", match: "identity federated-credential list *", output: "[]" },
    {
      tool: "az",
      match: "identity create *",
      output: json({
        principalId: id.deployPrincipal,
        clientId: id.deployClient,
      }),
    },
    {
      tool: "az",
      match: "acr show *",
      output: json(`/registries/${REGISTRY}`),
    },
    {
      tool: "az",
      match: "acr config authentication-as-arm show *",
      output: json("enabled"),
    },
    { tool: "gh", match: "variable list *", output: "[]" },
    // No environment yet: reading it fails.
    { tool: "gh", match: "api repos/*", exit: 1 },
  ];
}

function index(calls: readonly string[], prefix: string): number {
  return calls.findIndex((call) => call.startsWith(prefix));
}

/** The names the run set with `gh <kind> set`, in order. */
function setNames(calls: readonly string[], kind: "secret" | "variable") {
  return calls
    .filter((call) => call.startsWith(`gh ${kind} set `))
    .map((call) => call.split(" ")[3]);
}

const RUNBOOK_VALUES = {
  EntraAppClientId: randomUUID(),
  OwnerObjectId: randomUUID(),
  SqlAdminGroupName: "Example SQL admins",
  SqlAdminGroupObjectId: randomUUID(),
};

// Each test starts PowerShell, which can take over Vitest's default 5 seconds on a CI runner.
describe.runIf(HAS_PWSH)(
  "the owner's bootstrap",
  { timeout: RUN_TIMEOUT_MS },
  () => {
    it("only prints its plan without -Apply, calling neither az nor gh", () => {
      const { calls, output, exitCode } = run(BEFORE, []);

      expect(exitCode).toBe(0);
      expect(calls).toEqual([]);
      expect(output).toContain("Print only");
      expect(output).toContain(`repo:${REPO}:environment:production`);
    });

    it("creates everything in the recorded order on an empty subscription", () => {
      const id = ids();

      const { calls, output, exitCode } = run(
        { ...BEFORE, Apply: true },
        emptySubscription(id),
      );

      expect(exitCode).toBe(0);
      const order = [
        "az account set",
        "az group create --name rg-ring-mcp-bridge --location israelcentral",
        "az identity create",
        "az identity federated-credential create",
        "az role assignment create",
        "gh api --method PUT repos/example-owner/example-repo/environments/production",
        "gh secret set AZURE_CLIENT_ID",
      ].map((prefix) => index(calls, prefix));
      expect(order.every((at) => at >= 0)).toBe(true);
      expect([...order].sort((a, b) => a - b)).toEqual(order);

      const credential = calls.find((call) =>
        call.startsWith("az identity federated-credential create"),
      );
      expect(credential).toContain(
        `--subject repo:${REPO}:environment:production`,
      );
      expect(credential).toContain("--audiences api://AzureADTokenExchange");

      const grants = calls.filter((call) =>
        call.startsWith("az role assignment create"),
      );
      expect(grants).toHaveLength(3);
      const limited = grants.find((call) => call.includes("--condition"));
      for (const roleId of [
        id.keyVaultSecretsUser,
        id.keyVaultSecretsOfficer,
        id.blobDataContributor,
      ]) {
        expect(limited).toContain(String(roleId));
      }
      // Only those three: no other role, and only for service principals.
      const condition = limited?.split("--condition ")[1] ?? "";
      for (const other of [id.contributor, id.roleAdministrator, id.acrPush]) {
        expect(condition).not.toContain(String(other));
      }
      expect(condition.match(/\{'ServicePrincipal'\}/g)).toHaveLength(2);
      expect(limited).toContain("--condition-version 2.0");
      expect(setNames(calls, "secret")).toEqual([
        "AZURE_CLIENT_ID",
        "AZURE_TENANT_ID",
        "AZURE_SUBSCRIPTION_ID",
        "AZURE_REGISTRY_NAME",
      ]);
      expect(setNames(calls, "variable")).toEqual(["AZURE_RESOURCE_GROUP"]);
      expect(output).toContain(
        "BRIDGE_ENTRA_CLIENT_ID not given: pass it from the runbook",
      );
    });

    it("sets every ID and the registry's name as a secret, never as a variable", () => {
      const id = ids();

      const { calls, exitCode } = run(
        { ...BEFORE, ...RUNBOOK_VALUES, Apply: true },
        emptySubscription(id),
      );

      expect(exitCode).toBe(0);
      expect(setNames(calls, "secret")).toEqual([
        "AZURE_CLIENT_ID",
        "AZURE_TENANT_ID",
        "AZURE_SUBSCRIPTION_ID",
        "AZURE_REGISTRY_NAME",
        "BRIDGE_ENTRA_CLIENT_ID",
        "BRIDGE_OWNER_OBJECT_ID",
        "SQL_ADMIN_GROUP_OBJECT_ID",
      ]);
      expect(setNames(calls, "variable")).toEqual([
        "AZURE_RESOURCE_GROUP",
        "SQL_ADMIN_GROUP_NAME",
      ]);
      const variables = calls
        .filter((call) => call.startsWith("gh variable set "))
        .join(" ");
      for (const value of [
        id.subscription,
        id.tenant,
        id.deployClient,
        REGISTRY,
        RUNBOOK_VALUES.EntraAppClientId,
        RUNBOOK_VALUES.OwnerObjectId,
        RUNBOOK_VALUES.SqlAdminGroupObjectId,
      ]) {
        expect(variables).not.toContain(String(value));
      }
      expect(calls).toContain(
        `gh secret set BRIDGE_OWNER_OBJECT_ID --env production --repo ${REPO} --body ${RUNBOOK_VALUES.OwnerObjectId}`,
      );
    });

    it("only reads where everything already exists, besides setting the secrets again", () => {
      const id = ids();
      const existing: Rule[] = [
        ...signedIn(id),
        ...roleRules(id),
        { tool: "az", match: "group exists *", output: "true" },
        {
          tool: "az",
          match: "identity list *",
          output: json([
            { principalId: id.deployPrincipal, clientId: id.deployClient },
          ]),
        },
        {
          tool: "az",
          match: "identity federated-credential list *",
          output: json([{ name: "github-production" }]),
        },
        {
          tool: "az",
          match: "role assignment list *",
          output: json("an-assignment"),
        },
        { tool: "az", match: "acr show *", output: json("/registries/x") },
        {
          tool: "az",
          match: "acr config authentication-as-arm show *",
          output: json("enabled"),
        },
        {
          tool: "gh",
          match: "variable list *",
          output: json([
            { name: "AZURE_RESOURCE_GROUP", value: "rg-ring-mcp-bridge" },
          ]),
        },
      ];

      const { calls, exitCode } = run({ ...BEFORE, Apply: true }, existing);

      expect(exitCode).toBe(0);
      const changes = calls.filter((call) =>
        /^(az \S+( \S+)? (create|update)|gh variable set|gh api --method PUT)/.test(
          call,
        ),
      );
      expect(changes).toEqual([]);
      // A secret cannot be read back: each is set again, to the value it already holds.
      const secrets = calls.filter((call) => call.startsWith("gh secret set "));
      expect(secrets).toEqual(
        [
          ["AZURE_CLIENT_ID", id.deployClient],
          ["AZURE_TENANT_ID", id.tenant],
          ["AZURE_SUBSCRIPTION_ID", id.subscription],
          ["AZURE_REGISTRY_NAME", REGISTRY],
        ].map(
          ([name, value]) =>
            `gh secret set ${String(name)} --env production --repo ${REPO} --body ${String(value)}`,
        ),
      );
    });

    it("stops before changing anything when the owner does not confirm the subscription", () => {
      const id = ids();

      const { calls, exitCode } = run(
        { ...BEFORE, Apply: true },
        emptySubscription(id),
        "n",
      );

      expect(exitCode).toBe(1);
      expect(calls.filter((call) => /create|account set/.test(call))).toEqual(
        [],
      );
    });

    it("stops when no subscription, or more than one, has the name", () => {
      const id = ids();

      const { calls, output, exitCode } = run({ ...BEFORE, Apply: true }, [
        { tool: "az", match: "account list *", output: "[]" },
        ...roleRules(id),
      ]);

      expect(exitCode).toBe(1);
      expect(output).toContain("Expected one subscription named");
      expect(calls.filter((call) => call.includes("create"))).toEqual([]);
    });

    it("after the first deploy, gives the core's identity what it needs, then restarts the core once the owner says so", () => {
      const id = ids();
      const publicUrl = "https://core.example.test";
      const rules: Rule[] = [
        ...signedIn(id),
        ...roleRules(id),
        {
          tool: "az",
          match: "deployment group show *",
          output: json({
            coreIdentityPrincipalId: { value: id.corePrincipal },
            coreIdentityName: { value: "ringbridge-core" },
            publicUrl: { value: publicUrl },
            keyVaultName: { value: "ringbridge-kv-abc123" },
            sqlServerHostName: { value: "ringbridge-sql.database.windows.net" },
            appName: { value: "ringbridge-abc123" },
          }),
        },
        { tool: "az", match: "acr show *", output: json("/registries/x") },
        {
          tool: "az",
          match: "ad app federated-credential list *",
          output: "[]",
        },
        {
          tool: "az",
          match: "ad app show *",
          output: json(["https://elsewhere.example.test/callback"]),
        },
        {
          tool: "az",
          match: "keyvault show *",
          output: json({
            id: "/vaults/ringbridge-kv-abc123",
            uri: "https://ringbridge-kv-abc123.vault.azure.net/",
          }),
        },
        {
          tool: "az",
          match: "ad signed-in-user show *",
          output: json(id.owner),
        },
      ];

      const { calls, output, exitCode } = run(
        {
          ...BEFORE,
          Stage: "after-deploy",
          EntraAppClientId: id.entraApp,
          Apply: true,
        },
        rules,
      );

      expect(exitCode).toBe(0);
      const grants = calls.filter((call) =>
        call.startsWith("az role assignment create"),
      );
      expect(grants[0]).toContain(
        `--assignee-object-id ${String(id.corePrincipal)}`,
      );
      expect(grants[1]).toContain(`--assignee-object-id ${String(id.owner)}`);
      expect(grants[1]).toContain("--assignee-principal-type User");
      expect(
        calls.some((call) =>
          call.startsWith(
            `az ad app federated-credential create --id ${String(id.entraApp)} --parameters @`,
          ),
        ),
      ).toBe(true);
      expect(
        calls.find((call) => call.startsWith("az ad app update")),
      ).toContain(
        `--web-redirect-uris https://elsewhere.example.test/callback ${publicUrl}/sign-in/return`,
      );
      const key = index(calls, "node ");
      expect(calls[key]).toMatch(
        /first-signing-key https:\/\/ringbridge-kv-abc123\.vault\.azure\.net$/,
      );
      expect(output).toContain(
        "CREATE USER [ringbridge-core] FROM EXTERNAL PROVIDER;",
      );
      expect(output).toContain(
        "ALTER ROLE db_ddladmin ADD MEMBER [ringbridge-core];",
      );
      // The key last: Key Vault takes minutes to honour the owner's new role.
      expect(key).toBeGreaterThan(index(calls, "az webapp restart"));
    });

    it("does not restart the core until the owner says the database user exists", () => {
      const id = ids();
      const rules: Rule[] = [
        ...signedIn(id),
        ...roleRules(id),
        {
          tool: "az",
          match: "deployment group show *",
          output: json({
            coreIdentityPrincipalId: { value: id.corePrincipal },
            coreIdentityName: { value: "ringbridge-core" },
            publicUrl: { value: "https://core.example.test" },
            keyVaultName: { value: "kv" },
            sqlServerHostName: { value: "sql" },
            appName: { value: "app" },
          }),
        },
        {
          tool: "az",
          match: "ad app federated-credential list *",
          output: "[]",
        },
        {
          tool: "az",
          match: "keyvault show *",
          output: json({
            id: "/vaults/kv",
            uri: "https://kv.vault.azure.net/",
          }),
        },
      ];

      // The owner confirms the subscription and the database user.
      const { calls } = run(
        {
          ...BEFORE,
          Stage: "after-deploy",
          EntraAppClientId: id.entraApp,
          Apply: true,
        },
        rules,
        "y",
      );
      expect(calls.some((call) => call.startsWith("az webapp restart"))).toBe(
        true,
      );

      // The owner confirms the subscription, then says no at the database user.
      const refused = run(
        {
          ...BEFORE,
          Stage: "after-deploy",
          EntraAppClientId: id.entraApp,
          Apply: true,
        },
        rules,
        "y,n",
      );
      expect(refused.output).toContain("Is the database user created?");
      expect(
        refused.calls.some((call) => call.startsWith("az webapp restart")),
      ).toBe(false);
      expect(refused.exitCode).toBe(1);
    });
  },
);
