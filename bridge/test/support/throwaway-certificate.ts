// A throwaway TLS certificate for this machine, made with the `openssl` command when a test runs
// (the owner's choice a, T015 and T017): no package, and no key material in the repository, where
// gitleaks would flag it. The key lives in memory and in a temporary folder removed at once.
// Without `openssl` the TLS tests skip with a note, except in CI, where `requireOpensslInCi`
// fails the run.
import { execFile, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";

const run = promisify(execFile);

/** A certificate for `localhost` and 127.0.0.1, and its private key, both in PEM. */
export interface ThrowawayCertificate {
  readonly cert: string;
  readonly key: string;
}

/** Whether the `openssl` command runs on this machine. */
export const OPENSSL_AVAILABLE =
  spawnSync("openssl", ["version"], { stdio: "ignore" }).status === 0;

/** Makes a one-day, self-signed P-256 certificate for `localhost` and 127.0.0.1. */
export async function makeThrowawayCertificate(): Promise<ThrowawayCertificate> {
  const folder = await mkdtemp(join(tmpdir(), "throwaway-tls-"));
  try {
    const keyPath = join(folder, "key.pem");
    const certPath = join(folder, "cert.pem");
    await run("openssl", [
      "req",
      "-x509",
      "-newkey",
      "ec",
      "-pkeyopt",
      "ec_paramgen_curve:prime256v1",
      "-nodes",
      "-days",
      "1",
      "-subj",
      "/CN=localhost",
      "-addext",
      "subjectAltName=DNS:localhost,IP:127.0.0.1",
      "-keyout",
      keyPath,
      "-out",
      certPath,
    ]);
    return {
      cert: await readFile(certPath, "utf8"),
      key: await readFile(keyPath, "utf8"),
    };
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

/** Adds a test that fails in CI when `openssl` is missing, so the TLS tests never skip there. */
export function requireOpensslInCi(): void {
  it.runIf(!OPENSSL_AVAILABLE && process.env.CI !== undefined)(
    "has the openssl command in CI",
    () => {
      expect.fail("The TLS tests need the openssl command in CI.");
    },
  );
}
