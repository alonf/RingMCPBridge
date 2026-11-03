#!/usr/bin/env node
// Licence gate over npm sbom (T004; supply-chain policy). Runtime packages must carry a licence
// from the runtime allow-list; development-only packages may also use the dev-only additions.
// Reviewed packages without a usable licence are listed in scripts/license-exceptions.json.
// Usage: node scripts/license-gate.mjs
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RUNTIME_ALLOWED = new Set([
  "MIT",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "ISC",
  "0BSD",
  "BlueOak-1.0.0",
  "Unlicense",
]);
const DEV_ALLOWED = new Set([...RUNTIME_ALLOWED, "MPL-2.0", "CC-BY-4.0"]);
const OWN_PACKAGES = /^(ring-mcp-bridge|@ring-mcp-bridge\/)/;

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const exceptions = JSON.parse(
  readFileSync(join(repoRoot, "scripts", "license-exceptions.json"), "utf8"),
);
const excepted = new Set(
  exceptions.map((entry) => `${entry.package}@${entry.version}`),
);

function sbom(extraArgs) {
  // One command string with a shell, so npm resolves on Windows too; the arguments are constants.
  const command = ["npm sbom --sbom-format cyclonedx", ...extraArgs].join(" ");
  const result = spawnSync(command, {
    cwd: repoRoot,
    encoding: "utf8",
    shell: true,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    process.stderr.write(`license-gate: npm sbom failed\n${result.stderr}\n`);
    process.exit(2);
  }
  return JSON.parse(result.stdout).components ?? [];
}

function licenceIds(component) {
  return (component.licenses ?? []).map(
    (entry) =>
      entry.expression ?? entry.license?.id ?? entry.license?.name ?? "",
  );
}

// An SPDX expression passes when every AND part passes; an OR part passes when one side passes.
function expressionAllowed(expression, allowed) {
  const cleaned = expression.replace(/[()]/g, " ").trim();
  if (cleaned === "") return false;
  return cleaned
    .split(/\s+AND\s+/i)
    .every((part) =>
      part.split(/\s+OR\s+/i).some((id) => allowed.has(id.trim())),
    );
}

function componentAllowed(component, allowed) {
  const ids = licenceIds(component);
  return ids.length > 0 && ids.every((id) => expressionAllowed(id, allowed));
}

const runtime = sbom(["--omit", "dev"]);
const all = sbom([]);
const keyOf = (c) => c["bom-ref"] ?? `${c.name}@${c.version}`;
const runtimeKeys = new Set(runtime.map(keyOf));

const failures = [];
for (const component of all) {
  const key = keyOf(component);
  if (OWN_PACKAGES.test(key) || excepted.has(key)) continue;
  const isRuntime = runtimeKeys.has(key);
  const allowed = isRuntime ? RUNTIME_ALLOWED : DEV_ALLOWED;
  if (!componentAllowed(component, allowed)) {
    const found = licenceIds(component).join(", ") || "no licence";
    failures.push(`${isRuntime ? "runtime" : "dev"} ${key}: ${found}`);
  }
}

if (failures.length > 0) {
  for (const failure of failures)
    process.stderr.write(`license-gate: BLOCKING ${failure}\n`);
  process.exit(1);
}
process.stdout.write(
  `license-gate: passed (${String(runtime.length)} runtime and ${String(all.length - runtime.length)} dev-only packages)\n`,
);
