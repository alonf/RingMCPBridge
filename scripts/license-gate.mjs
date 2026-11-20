#!/usr/bin/env node
// Licence gate over npm sbom (T004; supply-chain policy). Runtime packages must carry a licence
// from the runtime allow-list; development-only packages may also use the dev-only additions.
// Reviewed packages without a usable licence are listed in scripts/license-exceptions.json.
//
// npm sbom refuses to run when npm calls a dependency edge invalid. An edge the owner approved,
// overriding a version a library pins, is listed in scripts/npm-tree-exceptions.json
// (DRIFT-002-16). When every problem npm reports is such an edge, and nothing else, the gate reads
// the same facts from package-lock.json instead: each installed package's name, version, licence,
// and whether it is development-only. Any other problem still stops the gate.
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
const treeExceptions = JSON.parse(
  readFileSync(join(repoRoot, "scripts", "npm-tree-exceptions.json"), "utf8"),
);
const acceptedEdges = new Set(
  treeExceptions.map((entry) => `${entry.package}@${entry.version}`),
);

// The edges npm called invalid, as "package@version", or `undefined` when npm reported anything
// else. npm names an invalid edge on lines such as
//   npm error invalid: @scope/name@1.2.3, 1.2.0 required by parent@4.5.6
//   npm error invalid: @scope/name@1.2.3 C:\path\to\node_modules\@scope\name
function invalidEdgesOnly(stderr) {
  const lines = stderr
    .split(/\r?\n/)
    .map((line) => line.replace(/^npm error\s*/, "").trim())
    .filter((line) => line !== "" && !/^(code |A complete log)/.test(line));
  const edges = [];
  for (const line of lines) {
    const match = /^invalid: ((?:@[^/\s]+\/)?[^@\s]+@[^,\s]+)/.exec(line);
    if (match === null) return undefined;
    edges.push(match[1]);
  }
  return edges.length > 0 ? edges : undefined;
}

// The installed packages as npm sbom lists them, from the lockfile: name, version, licence, and
// whether each is development-only. Own workspace links are left out, as the gate skips them.
function componentsFromLock(omitDev) {
  const lock = JSON.parse(
    readFileSync(join(repoRoot, "package-lock.json"), "utf8"),
  );
  const components = [];
  for (const [path, entry] of Object.entries(lock.packages ?? {})) {
    if (path === "" || entry.link === true || !path.includes("node_modules/"))
      continue;
    if (omitDev && entry.dev === true) continue;
    const name =
      entry.name ??
      path.slice(path.lastIndexOf("node_modules/") + "node_modules/".length);
    components.push({
      "bom-ref": `${name}@${entry.version}`,
      name,
      version: entry.version,
      licenses:
        entry.license === undefined ? [] : [{ expression: entry.license }],
    });
  }
  return components;
}

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
    const edges = invalidEdgesOnly(result.stderr ?? "");
    if (edges !== undefined && edges.every((edge) => acceptedEdges.has(edge))) {
      process.stdout.write(
        `license-gate: npm sbom refused the approved override ${[...new Set(edges)].join(", ")}; reading the lockfile instead\n`,
      );
      return componentsFromLock(extraArgs.includes("dev"));
    }
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
