#!/usr/bin/env node
// The deploy's parameters file (T032): each `infra/main.bicep` parameter the deploy sets, from the
// GitHub environment's variables and the deploy's own values, written as an Azure deployment
// parameters file. A file, not `--parameters name=value`: the Azure CLI reads a value that looks
// like JSON as JSON, so the listed agents, a JSON array kept in a string parameter, would arrive as
// an array and fail the parameter's type.
// - A required variable that is missing stops it, naming the variables only.
// - An optional variable left empty leaves the Bicep's default.
// - No value is a secret, but none is printed either: the file stays in the runner's temporary
//   folder.
//
//   node scripts/deploy-parameters.mjs <output-file>
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCHEMA =
  "https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#";

/**
 * Each parameter the deploy sets, and the variable that holds it. `from` says who sets the
 * variable: the bootstrap (infra/bootstrap/bootstrap.ps1), the owner's runbook
 * (infra/bootstrap/entra-app-registration.md), or the deploy workflow itself.
 *
 * @type {readonly {
 *   readonly name: string;
 *   readonly variable: string;
 *   readonly from: "bootstrap" | "runbook" | "deploy";
 *   readonly optional?: boolean;
 *   readonly json?: "array";
 * }[]}
 */
export const PARAMETERS = [
  { name: "registryName", variable: "AZURE_REGISTRY_NAME", from: "bootstrap" },
  { name: "imageTag", variable: "IMAGE_TAG", from: "deploy" },
  {
    name: "entraClientId",
    variable: "BRIDGE_ENTRA_CLIENT_ID",
    from: "bootstrap",
  },
  {
    name: "ownerObjectId",
    variable: "BRIDGE_OWNER_OBJECT_ID",
    from: "bootstrap",
  },
  {
    name: "sqlAdminGroupName",
    variable: "SQL_ADMIN_GROUP_NAME",
    from: "bootstrap",
  },
  {
    name: "sqlAdminGroupObjectId",
    variable: "SQL_ADMIN_GROUP_OBJECT_ID",
    from: "bootstrap",
  },
  {
    name: "keyVaultReaderRoleId",
    variable: "KEY_VAULT_READER_ROLE_ID",
    from: "deploy",
  },
  {
    name: "storageBlobDataContributorRoleId",
    variable: "STORAGE_BLOB_DATA_CONTRIBUTOR_ROLE_ID",
    from: "deploy",
  },
  {
    name: "agents",
    variable: "BRIDGE_AGENTS",
    from: "runbook",
    optional: true,
    json: "array",
  },
  {
    name: "registrationsPerHour",
    variable: "BRIDGE_REGISTRATIONS_PER_HOUR",
    from: "runbook",
    optional: true,
  },
  {
    name: "logLevel",
    variable: "BRIDGE_LOG_LEVEL",
    from: "runbook",
    optional: true,
  },
];

/** A deploy that cannot go ahead, with a message that names variables, never their values. */
export class DeployParametersError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = "DeployParametersError";
  }
}

/** @param {string} text */
function isJsonArray(text) {
  try {
    return Array.isArray(JSON.parse(text));
  } catch {
    return false;
  }
}

/**
 * The parameters file's content, from `env`; throws DeployParametersError naming what is wrong.
 *
 * @param {Readonly<Record<string, string | undefined>>} env
 * @returns {{
 *   $schema: string;
 *   contentVersion: string;
 *   parameters: Record<string, { value: string }>;
 * }}
 */
export function deploymentParameters(env) {
  /** @type {Record<string, { value: string }>} */
  const parameters = {};
  const missing = [];
  const malformed = [];
  for (const entry of PARAMETERS) {
    const value = (env[entry.variable] ?? "").trim();
    if (value === "") {
      if (entry.optional !== true) {
        missing.push(entry.variable);
      }
      continue;
    }
    if (entry.json === "array" && !isJsonArray(value)) {
      malformed.push(entry.variable);
      continue;
    }
    parameters[entry.name] = { value };
  }
  if (missing.length > 0) {
    throw new DeployParametersError(
      `The deploy is missing ${missing.join(", ")}. The bootstrap sets the GitHub environment's variables (infra/bootstrap/bootstrap.ps1).`,
    );
  }
  if (malformed.length > 0) {
    throw new DeployParametersError(
      `${malformed.join(", ")} must be a JSON array (infra/bootstrap/entra-app-registration.md, part B).`,
    );
  }
  return { $schema: SCHEMA, contentVersion: "1.0.0.0", parameters };
}

/** @param {string | undefined} output */
function main(output) {
  if (output === undefined) {
    process.stderr.write(
      "usage: node scripts/deploy-parameters.mjs <output-file>\n",
    );
    return 2;
  }
  try {
    const file = deploymentParameters(process.env);
    writeFileSync(output, `${JSON.stringify(file, null, 2)}\n`, "utf8");
    process.stdout.write(
      `Wrote the parameters ${Object.keys(file.parameters).join(", ")}.\n`,
    );
    return 0;
  } catch (error) {
    if (!(error instanceof DeployParametersError)) {
      throw error;
    }
    process.stderr.write(`${error.message}\n`);
    return 1;
  }
}

if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exitCode = main(process.argv[2]);
}
