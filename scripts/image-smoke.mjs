// Smoke test of the bridge image (T027): each mode starts, loads its wiring and its libraries, and
// stops at the first thing it lacks, with exit code 1 and a clear reason. Nothing reaches Ring,
// Azure or Entra: every mode is given just enough to start and then fail on purpose.
//
//   node scripts/image-smoke.mjs <image>
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const image = process.argv[2];
if (image === undefined) {
  console.error("usage: node scripts/image-smoke.mjs <image>");
  process.exit(2);
}

// The key mode A reads, written inside the container. Mode A's stdin is held open by a named pipe
// for as long as the bridge runs, so it takes its lease and tries to open its home however slow the
// machine is (an emulated arm64 build takes seconds to start); the shell ends with the bridge.
const MODE_A = [
  "node -e \"require('fs').writeFileSync('/tmp/k', require('crypto').randomBytes(32).toString('base64url'))\"",
  "mkfifo /tmp/stdin",
  "sleep 120 > /tmp/stdin &",
  "node --disable-warning=ExperimentalWarning bridge/src/host/main.ts < /tmp/stdin",
].join("\n");

const CORE_SETTINGS = {
  BRIDGE_MODE: "core",
  BRIDGE_PUBLIC_URL: "https://bridge.example.test",
  BRIDGE_SQL_SERVER: "127.0.0.1",
  BRIDGE_SQL_DATABASE: "bridge",
  BRIDGE_KEY_VAULT_URL: "https://smoke.vault.azure.net",
  BRIDGE_MANAGED_IDENTITY_CLIENT_ID: "smoke-identity",
  BRIDGE_ENTRA_TENANT_ID: randomUUID(),
  BRIDGE_ENTRA_CLIENT_ID: "smoke-app",
};

const CASES = [
  {
    name: "no settings: names the missing variable",
    env: {},
    expect: "Invalid settings: BRIDGE_MODE.",
  },
  {
    name: "the core: loads Azure SQL's driver and stops on the unreachable database",
    env: CORE_SETTINGS,
    expect: '"kind":"store_down"',
  },
  {
    name: "the connector: stops on its missing Secrets File key",
    env: {
      BRIDGE_MODE: "connector",
      BRIDGE_CORE_URL: "wss://bridge.example.test/link",
      BRIDGE_DATA_DIR: "/data",
      BRIDGE_SECRETS_KEY_FILE: "/run/secrets/missing",
    },
    expect: '"kind":"key_unusable"',
  },
  {
    name: "mode A: takes its lease, loads Ring's library, and stops on the missing Secrets File",
    env: {
      BRIDGE_MODE: "all-in-one",
      BRIDGE_DATA_DIR: "/data",
      BRIDGE_SECRETS_KEY_FILE: "/tmp/k",
    },
    shell: MODE_A,
    expect: "run the setup first",
    // Its stdout carries the MCP protocol: the log must go to stderr, and stdout stay empty here.
    logOnStderrOnly: true,
  },
];

let failed = 0;
for (const smoke of CASES) {
  const environment = Object.entries(smoke.env).flatMap(([name, value]) => [
    "-e",
    `${name}=${value}`,
  ]);
  const command =
    smoke.shell === undefined
      ? ["run", "--rm", ...environment, image]
      : [
          "run",
          "--rm",
          ...environment,
          "--entrypoint",
          "sh",
          image,
          "-c",
          smoke.shell,
        ];
  const result = spawnSync("docker", command, {
    encoding: "utf8",
    timeout: 120_000,
  });
  const output = `${result.stdout}${result.stderr}`;
  const stdoutClean = smoke.logOnStderrOnly !== true || result.stdout === "";
  const passed =
    result.status === 1 && output.includes(smoke.expect) && stdoutClean;
  failed += passed ? 0 : 1;
  console.log(`${passed ? "ok  " : "FAIL"}  ${smoke.name}`);
  if (!passed) {
    console.log(`      exit ${String(result.status)}; output:\n${output}`);
  }
}
// The image holds what it runs and nothing else: no tests, no dev script, no dev dependencies.
const contents = spawnSync(
  "docker",
  [
    "run",
    "--rm",
    "--entrypoint",
    "sh",
    image,
    "-c",
    // vitest is the root's; @types/mssql is one of the bridge's own dev dependencies.
    'test -e /app/bridge/dev && echo "dev script"; find /app/bridge -name "*.test.ts" | head -1; for dev in vitest @types/mssql; do test -d /app/node_modules/$dev && echo "dev dependency $dev"; done; true',
  ],
  { encoding: "utf8", timeout: 120_000 },
);
const leaked = contents.stdout.trim();
const clean = contents.status === 0 && leaked === "";
failed += clean ? 0 : 1;
console.log(
  `${clean ? "ok  " : "FAIL"}  the image holds no tests, no dev script and no dev dependencies`,
);
if (!clean) {
  console.log(`      found: ${leaked}`);
}
process.exit(failed === 0 ? 0 : 1);
