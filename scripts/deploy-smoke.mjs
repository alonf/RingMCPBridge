#!/usr/bin/env node
// The deploy's smoke test (T032; quickstart Step 6): what can be checked of the deployed core
// without anyone signing in.
// - `/livez` answers, and `/readyz` answers ready. Not ready, it names each check that is not in
//   place, such as the signing keys.
// - The MCP endpoint's protected-resource metadata names the endpoint and an issuer on the core.
// - `/mcp` refuses a call with no token, pointing at that metadata.
//
// `get_health` needs an agent's token, which only the owner's sign-in gives, so the owner checks it
// at the first agent trial (T033). The core may still be starting after a deploy, so the command
// tries again every 15 seconds, for up to 10 minutes by default.
//
//   node scripts/deploy-smoke.mjs <public-url> [<wait-seconds>]
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HTTP_OK = 200;
const HTTP_UNAUTHORIZED = 401;
const RETRY_MS = 15_000;
const DEFAULT_WAIT_S = 600;
const REQUEST_TIMEOUT_MS = 10_000;
const MS_PER_S = 1000;

async function getJson(fetcher, url, init = {}) {
  const response = await fetcher(url, {
    ...init,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  let body;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }
  return { status: response.status, headers: response.headers, body };
}

async function checkLive(fetcher, origin) {
  const { status } = await getJson(fetcher, `${origin}/livez`);
  return status === HTTP_OK
    ? []
    : [`/livez answered ${String(status)}, not 200.`];
}

async function checkReady(fetcher, origin) {
  const { status, body } = await getJson(fetcher, `${origin}/readyz`);
  if (status === HTTP_OK && body?.status === "ready") {
    return [];
  }
  const checks = body?.checks;
  if (checks === undefined || checks === null || typeof checks !== "object") {
    return [`/readyz answered ${String(status)} with no readiness report.`];
  }
  const failing = Object.entries(checks).filter(
    ([, value]) => !["ok", "loaded", "configured", "held"].includes(value),
  );
  return [
    `/readyz answered ${String(status)}, not ready: ${failing
      .map(([name, value]) => `${name} ${String(value)}`)
      .join(", ")}.`,
  ];
}

async function checkMcp(fetcher, origin) {
  const endpoint = `${origin}/mcp`;
  const metadataUrl = `${origin}/.well-known/oauth-protected-resource/mcp`;
  const problems = [];
  const metadata = await getJson(fetcher, metadataUrl);
  const servers = metadata.body?.authorization_servers;
  if (metadata.status !== HTTP_OK || metadata.body?.resource !== endpoint) {
    problems.push(
      `The MCP endpoint's metadata does not name ${endpoint} (${String(metadata.status)}).`,
    );
  } else if (
    !Array.isArray(servers) ||
    !servers.some((server) => String(server).startsWith(`${origin}/`))
  ) {
    problems.push("The MCP endpoint's metadata names no issuer on the core.");
  }
  const call = await fetcher(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  await call.body?.cancel();
  const challenge = call.headers.get("www-authenticate") ?? "";
  if (call.status !== HTTP_UNAUTHORIZED) {
    problems.push(
      `/mcp answered ${String(call.status)} to a call with no token, not 401.`,
    );
  } else if (!challenge.includes(`resource_metadata="${metadataUrl}"`)) {
    problems.push("/mcp's 401 does not point at the endpoint's metadata.");
  }
  return problems;
}

/**
 * One pass of the smoke test against the core at `publicUrl`: the problems found, or none when it
 * passes. A request that fails outright is a problem too.
 *
 * @param {string} publicUrl
 * @param {typeof fetch} [fetcher]
 * @returns {Promise<string[]>}
 */
export async function smokeTest(publicUrl, fetcher = globalThis.fetch) {
  const origin = new URL(publicUrl).origin;
  /** @type {string[]} */
  const problems = [];
  for (const check of [checkLive, checkReady, checkMcp]) {
    try {
      problems.push(...(await check(fetcher, origin)));
    } catch (error) {
      problems.push(
        `${check.name}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return problems;
}

async function main(publicUrl, waitSeconds) {
  if (publicUrl === undefined) {
    process.stderr.write(
      "usage: node scripts/deploy-smoke.mjs <public-url> [<wait-seconds>]\n",
    );
    return 2;
  }
  const waitMs = Number(waitSeconds ?? String(DEFAULT_WAIT_S)) * MS_PER_S;
  const until = Date.now() + waitMs;
  for (;;) {
    const problems = await smokeTest(publicUrl);
    if (problems.length === 0) {
      process.stdout.write(`The smoke test passed on ${publicUrl}.\n`);
      return 0;
    }
    if (Date.now() + RETRY_MS > until) {
      process.stderr.write(
        `The smoke test failed on ${publicUrl}:\n${problems.map((line) => `- ${line}`).join("\n")}\n`,
      );
      return 1;
    }
    process.stdout.write(`Not yet: ${problems.join(" ")}\n`);
    await new Promise((done) => setTimeout(done, RETRY_MS));
  }
}

if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exitCode = await main(process.argv[2], process.argv[3]);
}
