#!/usr/bin/env node
// Runs gitleaks 8.30.1 as a pinned binary checked by checksum (T003; supply-chain policy).
// The archive is downloaded once into node_modules/.cache/gitleaks/, verified by checksum before
// every use, and the binary is extracted from it fresh each run.
// Usage: node scripts/run-gitleaks.mjs <gitleaks arguments...>
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const VERSION = "8.30.1";

// From gitleaks_8.30.1_checksums.txt on the GitHub release.
const ASSET_SHA256 = {
  "darwin-arm64": [
    "gitleaks_8.30.1_darwin_arm64.tar.gz",
    "b40ab0ae55c505963e365f271a8d3846efbc170aa17f2607f13df610a9aeb6a5",
  ],
  "darwin-x64": [
    "gitleaks_8.30.1_darwin_x64.tar.gz",
    "dfe101a4db2255fc85120ac7f3d25e4342c3c20cf749f2c20a18081af1952709",
  ],
  "linux-arm64": [
    "gitleaks_8.30.1_linux_arm64.tar.gz",
    "e4a487ee7ccd7d3a7f7ec08657610aa3606637dab924210b3aee62570fb4b080",
  ],
  "linux-x64": [
    "gitleaks_8.30.1_linux_x64.tar.gz",
    "551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb",
  ],
  "win32-arm64": [
    "gitleaks_8.30.1_windows_arm64.zip",
    "b95f5e4f5c425cedca7ee203d9afd29597e692c4924a12ed42f970537c72cc0f",
  ],
  "win32-x64": [
    "gitleaks_8.30.1_windows_x64.zip",
    "d29144deff3a68aa93ced33dddf84b7fdc26070add4aa0f4513094c8332afc4e",
  ],
};

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const cacheDir = join(repoRoot, "node_modules", ".cache", "gitleaks", VERSION);
const platformKey = `${process.platform}-${process.arch}`;
const binaryName = process.platform === "win32" ? "gitleaks.exe" : "gitleaks";
const binaryPath = join(cacheDir, binaryName);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function fail(message) {
  process.stderr.write(`run-gitleaks: ${message}\n`);
  process.exit(2);
}

async function install(assetName, expectedSha) {
  const url = `https://github.com/gitleaks/gitleaks/releases/download/v${VERSION}/${assetName}`;
  const response = await fetch(url);
  if (!response.ok) {
    fail(`download failed (${String(response.status)}) for ${url}`);
  }
  const archive = Buffer.from(await response.arrayBuffer());
  const actualSha = sha256(archive);
  if (actualSha !== expectedSha) {
    fail(
      `checksum mismatch for ${assetName}: expected ${expectedSha}, got ${actualSha}`,
    );
  }
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(join(cacheDir, assetName), archive);
}

// The Windows build is a .zip. Only the bsdtar that ships with Windows 10 or later reads it; the
// GNU tar that Git for Windows puts first on PATH inside git hooks does not. Linux and macOS
// releases are .tar.gz, which any tar reads.
function tarCommand() {
  if (process.platform !== "win32") {
    return "tar";
  }
  return join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe");
}

// The binary is always re-extracted from the verified archive, so a changed binary in the cache
// is never run. Relative names with cwd avoid drive-letter colons, which some tars read as a host.
function extract(assetName) {
  const result = spawnSync(tarCommand(), ["-xf", assetName, binaryName], {
    cwd: cacheDir,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    fail(`could not extract ${binaryName} from ${assetName}`);
  }
}

const asset = ASSET_SHA256[platformKey];
if (!asset) {
  fail(`no pinned gitleaks ${VERSION} build for ${platformKey}`);
}
const [assetName, expectedSha] = asset;

const archivePath = join(cacheDir, assetName);
const cachedArchiveOk =
  existsSync(archivePath) && sha256(readFileSync(archivePath)) === expectedSha;
if (!cachedArchiveOk) {
  await install(assetName, expectedSha);
}
extract(assetName);

const run = spawnSync(binaryPath, process.argv.slice(2), {
  stdio: "inherit",
  cwd: repoRoot,
});
process.exit(run.status ?? 2);
