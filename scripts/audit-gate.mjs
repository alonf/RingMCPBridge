#!/usr/bin/env node
// npm audit gate (T004; supply-chain policy): fails on any high or critical advisory over the whole
// tree, except the advisories on the written exception list in scripts/audit-exceptions.json.
// Usage: node scripts/audit-gate.mjs
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BLOCKING = new Set(["high", "critical"]);
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const exceptions = JSON.parse(
  readFileSync(join(repoRoot, "scripts", "audit-exceptions.json"), "utf8"),
);
const excepted = new Map(exceptions.map((entry) => [entry.advisory, entry]));

// npm audit exits non-zero when it finds anything, so its exit status is not the verdict.
// One command string with a shell, so npm resolves on Windows too.
const audit = spawnSync("npm audit --json", {
  cwd: repoRoot,
  encoding: "utf8",
  shell: true,
  maxBuffer: 64 * 1024 * 1024,
});

// Exit 0 (nothing found) and 1 (findings, or an error) are expected; anything else is a failed run.
const AUDIT_EXIT_CODES = new Set([0, 1]);

function failIncomplete(reason) {
  process.stderr.write(
    `audit-gate: npm audit did not complete (${reason}), so there is no verdict\n${audit.stderr ?? ""}\n`,
  );
  process.exit(2);
}

// A complete report has no error member, a vulnerabilities map and whole-number totals. A failed
// run (a registry or network error) also prints JSON and exits 1, so parsing alone proves nothing.
function isCompleteReport(value) {
  const totals = value?.metadata?.vulnerabilities;
  return (
    typeof value === "object" &&
    value !== null &&
    !("error" in value) &&
    typeof value.vulnerabilities === "object" &&
    value.vulnerabilities !== null &&
    typeof totals === "object" &&
    totals !== null &&
    [...BLOCKING].every((level) => Number.isInteger(totals[level]))
  );
}

if (!AUDIT_EXIT_CODES.has(audit.status)) {
  failIncomplete(`exit status ${String(audit.status)}`);
}
let report;
try {
  report = JSON.parse(audit.stdout);
} catch {
  failIncomplete("no JSON report");
}
if (!isCompleteReport(report)) {
  failIncomplete("the report holds an error or no results");
}

function advisoryId(url) {
  const match = /GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}/i.exec(url ?? "");
  return match ? match[0] : (url ?? "unknown");
}

const blocking = new Map();
const applied = new Map();
for (const [name, vulnerability] of Object.entries(report.vulnerabilities)) {
  for (const via of vulnerability.via ?? []) {
    if (typeof via === "string" || !BLOCKING.has(via.severity)) continue;
    const id = advisoryId(via.url);
    const target = excepted.has(id) ? applied : blocking;
    target.set(
      `${id} ${name}`,
      `${via.severity}: ${via.title ?? id} (${name})`,
    );
  }
}

for (const line of applied.values()) {
  process.stdout.write(`audit-gate: excepted ${line}\n`);
}
if (blocking.size > 0) {
  for (const line of blocking.values()) {
    process.stderr.write(`audit-gate: BLOCKING ${line}\n`);
  }
  process.exit(1);
}
const counts = report.metadata.vulnerabilities;
process.stdout.write(
  `audit-gate: passed (high ${String(counts.high ?? 0)}, critical ${String(counts.critical ?? 0)}, ` +
    `excepted ${String(applied.size)}; moderate ${String(counts.moderate ?? 0)} and low ${String(counts.low ?? 0)} do not block)\n`,
);
