// The Secrets File (T012): a round trip, failing closed on a wrong key, atomic and ordered writes,
// and no secret value in an error, a log line or a JSON frame.
import {
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { inspect } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Logger } from "../../../utilities/logging/index.ts";
import type { LogFields } from "../../../utilities/logging/index.ts";
import {
  exportPrivateKey,
  generateSealingKey,
  generateSigningKeyPair,
  seal,
  Secret,
} from "../../../utilities/security/index.ts";
import type {
  MoveOver,
  SigningKeyPair,
} from "../../../utilities/security/index.ts";
import { SecretsFile, SecretsFileError } from "./index.ts";
import type { HomeSecrets, SecretsFileErrorKind } from "./index.ts";

const TOKEN = "rt-SECRET-token-0001";
const ROTATED_TOKEN = "rt-SECRET-token-0002";
const HARDWARE_ID = "hw-SECRET-0003";
const PUSH_TOKEN = "push-SECRET-0004";
const ENROLLMENT_CODE = "7Q4K-29XM";
const MOVE_DELAY_MS = 30;

let folder: string;
let path: string;
let key: Uint8Array;
let connectorKey: SigningKeyPair;

function homeSecrets(): HomeSecrets {
  return {
    ringRefreshToken: new Secret(TOKEN),
    ringHardwareId: new Secret(HARDWARE_ID),
    connectorKey,
  };
}

function privateKeyText(pair: SigningKeyPair): string {
  return Buffer.from(exportPrivateKey(pair.privateKey)).toString("base64url");
}

/** Every secret value, in the forms it could leak in. */
function secretValues(): readonly string[] {
  const der = Buffer.from(exportPrivateKey(connectorKey.privateKey));
  return [
    TOKEN,
    ROTATED_TOKEN,
    HARDWARE_ID,
    PUSH_TOKEN,
    der.toString("base64url"),
    der.toString("base64"),
    der.toString("hex"),
  ];
}

function expectNoSecret(text: string): void {
  for (const value of secretValues()) {
    expect(text).not.toContain(value);
  }
}

async function expectKind(
  work: Promise<unknown>,
  kind: SecretsFileErrorKind,
): Promise<SecretsFileError> {
  const error: unknown = await work.then(
    () => undefined,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(SecretsFileError);
  expect((error as SecretsFileError).kind).toBe(kind);
  return error as SecretsFileError;
}

async function writeSealed(plaintext: string): Promise<void> {
  await writeFile(
    path,
    seal(key, Buffer.from(plaintext, "utf8"), "secrets-file"),
  );
}

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "secrets-file-"));
  path = join(folder, "secrets.sealed");
  key = generateSealingKey();
  connectorKey = await generateSigningKeyPair();
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

describe("SecretsFile", () => {
  it("returns undefined when there is no file yet", async () => {
    await expect(SecretsFile.open({ path, key })).resolves.toBeUndefined();
  });

  it("round-trips every value", async () => {
    const created = await SecretsFile.create({ path, key }, homeSecrets());
    await created.update({
      pushCredentials: new Secret({ fcm: { token: PUSH_TOKEN } }),
    });
    const opened = await SecretsFile.open({ path, key });
    const secrets = opened?.secrets;
    expect(secrets?.ringRefreshToken.reveal()).toBe(TOKEN);
    expect(secrets?.ringHardwareId.reveal()).toBe(HARDWARE_ID);
    expect(secrets?.pushCredentials?.reveal()).toEqual({
      fcm: { token: PUSH_TOKEN },
    });
    expect(secrets?.connectorKey.publicKey).toBe(connectorKey.publicKey);
    expect(privateKeyText(secrets?.connectorKey ?? connectorKey)).toBe(
      privateKeyText(connectorKey),
    );
  });

  it.skipIf(process.platform === "win32")(
    "keeps the file readable by its owner only",
    async () => {
      await SecretsFile.create({ path, key }, homeSecrets());
      const { mode } = await stat(path);
      expect(mode & 0o777).toBe(0o600);
    },
  );

  it("fails closed on a wrong key or a changed byte, and leaves the file as it was", async () => {
    await SecretsFile.create({ path, key }, homeSecrets());
    const before = await readFile(path);
    await expectKind(
      SecretsFile.open({ path, key: generateSealingKey() }),
      "open_failed",
    );
    const changed = Buffer.from(before);
    changed[changed.byteLength - 1] = (changed.at(-1) ?? 0) ^ 1;
    await writeFile(path, changed);
    await expectKind(SecretsFile.open({ path, key }), "open_failed");
    await writeFile(path, before);
    await expect(readFile(path)).resolves.toEqual(before);
    await expect(SecretsFile.open({ path, key })).resolves.toBeDefined();
  });

  it("refuses contents it does not know, without quoting them", async () => {
    await writeSealed(`{"ring_refresh_token":"${TOKEN}"`);
    const notJson = await expectKind(
      SecretsFile.open({ path, key }),
      "open_failed",
    );
    expect(notJson.cause).toBeUndefined();

    await writeSealed(
      JSON.stringify({
        format: 2,
        ring_refresh_token: TOKEN,
        ring_hardware_id: HARDWARE_ID,
        connector_private_key: privateKeyText(connectorKey),
      }),
    );
    const otherFormat = await expectKind(
      SecretsFile.open({ path, key }),
      "open_failed",
    );
    expect(otherFormat.cause).toBeUndefined();

    await writeSealed(
      JSON.stringify({
        format: 1,
        ring_refresh_token: TOKEN,
        ring_hardware_id: HARDWARE_ID,
        connector_private_key: "AAAA",
      }),
    );
    await expectKind(SecretsFile.open({ path, key }), "open_failed");
  });

  it("refuses a file it cannot read, and a key that is not 32 bytes", async () => {
    await expectKind(SecretsFile.open({ path: folder, key }), "open_failed");
    const shortKey = key.subarray(1);
    await expectKind(SecretsFile.open({ path, key: shortKey }), "key_unusable");
    await expectKind(
      SecretsFile.create({ path, key: shortKey }, homeSecrets()),
      "key_unusable",
    );
  });

  it("never replaces an existing file when creating one", async () => {
    await SecretsFile.create({ path, key }, homeSecrets());
    const before = await readFile(path);
    await expectKind(
      SecretsFile.create(
        { path, key },
        { ...homeSecrets(), ringRefreshToken: new Secret(ROTATED_TOKEN) },
      ),
      "already_exists",
    );
    await expect(readFile(path)).resolves.toEqual(before);
    await expect(readdir(folder)).resolves.toEqual(["secrets.sealed"]);
  });

  it("writes nothing for incomplete secrets or a missing folder", async () => {
    await expectKind(
      SecretsFile.create(
        { path, key },
        { ...homeSecrets(), ringRefreshToken: new Secret("") },
      ),
      "write_failed",
    );
    await expectKind(
      SecretsFile.create(
        { path: join(folder, "missing", "file"), key },
        homeSecrets(),
      ),
      "write_failed",
    );
    await expect(readdir(folder)).resolves.toEqual([]);
  });

  it("writes a rotated token, keeping the other values", async () => {
    const file = await SecretsFile.create({ path, key }, homeSecrets());
    await file.update({ ringRefreshToken: new Secret(ROTATED_TOKEN) });
    const reopened = await SecretsFile.open({ path, key });
    expect(reopened?.secrets.ringRefreshToken.reveal()).toBe(ROTATED_TOKEN);
    expect(reopened?.secrets.ringHardwareId.reveal()).toBe(HARDWARE_ID);
    await expect(readdir(folder)).resolves.toEqual(["secrets.sealed"]);
  });

  // T028: the Setup CLI keeps the enrollment code with the key it was printed for.
  it("keeps the enrollment code through a token rotation, and opens a file written before it was kept", async () => {
    const file = await SecretsFile.create(
      { path, key },
      { ...homeSecrets(), enrollmentCode: ENROLLMENT_CODE },
    );
    await file.update({ ringRefreshToken: new Secret(ROTATED_TOKEN) });
    const reopened = await SecretsFile.open({ path, key });
    expect(reopened?.secrets.enrollmentCode).toBe(ENROLLMENT_CODE);

    await writeSealed(
      JSON.stringify({
        format: 1,
        ring_refresh_token: TOKEN,
        ring_hardware_id: HARDWARE_ID,
        connector_private_key: privateKeyText(connectorKey),
      }),
    );
    const older = await SecretsFile.open({ path, key });
    expect(older?.secrets.ringRefreshToken.reveal()).toBe(TOKEN);
    expect(older?.secrets).not.toHaveProperty("enrollmentCode");
  });

  it("writes overlapping rotations in order, so the newest token is on disk", async () => {
    let moves = 0;
    const slowFirstMove: MoveOver = async (from, to) => {
      moves += 1;
      if (moves === 1) {
        await delay(MOVE_DELAY_MS);
      }
      await rename(from, to);
    };
    const file = await SecretsFile.create(
      { path, key, moveOver: slowFirstMove },
      homeSecrets(),
    );
    await Promise.all([
      file.update({ ringRefreshToken: new Secret(ROTATED_TOKEN) }),
      file.update({ ringRefreshToken: new Secret(TOKEN) }),
    ]);
    const reopened = await SecretsFile.open({ path, key });
    expect(reopened?.secrets.ringRefreshToken.reveal()).toBe(TOKEN);
    expect(moves).toBe(2);
  });

  it("keeps the previous file when a write fails, and the next write carries the change", async () => {
    let failing = true;
    const moveOver: MoveOver = async (from, to) => {
      if (failing) {
        throw new Error("disk full");
      }
      await rename(from, to);
    };
    const file = await SecretsFile.create(
      { path, key, moveOver },
      homeSecrets(),
    );
    await expectKind(
      file.update({ ringRefreshToken: new Secret(ROTATED_TOKEN) }),
      "write_failed",
    );
    const unchanged = await SecretsFile.open({ path, key });
    expect(unchanged?.secrets.ringRefreshToken.reveal()).toBe(TOKEN);
    expect(file.secrets.ringRefreshToken.reveal()).toBe(ROTATED_TOKEN);
    await expect(readdir(folder)).resolves.toEqual(["secrets.sealed"]);

    failing = false;
    await file.update({
      pushCredentials: new Secret({ fcm: { token: PUSH_TOKEN } }),
    });
    const reopened = await SecretsFile.open({ path, key });
    expect(reopened?.secrets.ringRefreshToken.reveal()).toBe(ROTATED_TOKEN);
    expect(reopened?.secrets.pushCredentials?.reveal()).toEqual({
      fcm: { token: PUSH_TOKEN },
    });
  });
});

describe("no secret value leaves the Secrets File", () => {
  async function everyFailure(): Promise<readonly unknown[]> {
    const failures: unknown[] = [];
    const record = async (work: Promise<unknown>): Promise<void> => {
      await work.then(
        () => {
          throw new Error("expected a failure");
        },
        (caught: unknown) => {
          failures.push(caught);
        },
      );
    };
    const failingMove: MoveOver = () => Promise.reject(new Error("disk full"));
    const file = await SecretsFile.create(
      { path, key, moveOver: failingMove },
      homeSecrets(),
    );
    await record(file.update({ ringRefreshToken: new Secret(ROTATED_TOKEN) }));
    await record(SecretsFile.create({ path, key }, homeSecrets()));
    await record(SecretsFile.open({ path, key: generateSealingKey() }));
    // A JSON error quotes a short text whole, so this one would leak through an attached cause.
    await writeSealed(HARDWARE_ID);
    await record(SecretsFile.open({ path, key }));
    await writeSealed(
      JSON.stringify({
        format: 1,
        ring_refresh_token: TOKEN,
        extra: PUSH_TOKEN,
      }),
    );
    await record(SecretsFile.open({ path, key }));
    return failures;
  }

  it("is in no error's message, cause, JSON or printed form", async () => {
    const failures = await everyFailure();
    expect(failures).toHaveLength(5);
    for (const failure of failures) {
      expect(failure).toBeInstanceOf(SecretsFileError);
      expectNoSecret(String(failure));
      expectNoSecret(JSON.stringify(failure));
      expectNoSecret(inspect(failure, { depth: 10 }));
    }
  });

  it("is in no log line, even when an error or the secrets are logged", async () => {
    const lines: string[] = [];
    const logger = new Logger({
      sink: (line) => lines.push(line),
      now: () => 0,
      minLevel: "debug",
    });
    for (const failure of await everyFailure()) {
      logger.error("secrets_file_failed", undefined, failure);
    }
    logger.info("secrets_logged", homeSecrets() as unknown as LogFields);
    expect(lines.length).toBeGreaterThan(0);
    expectNoSecret(lines.join("\n"));
  });

  it("serializes and prints as placeholders, so a JSON frame cannot carry it", async () => {
    const file = await SecretsFile.create({ path, key }, homeSecrets());
    await file.update({
      pushCredentials: new Secret({ fcm: { token: PUSH_TOKEN } }),
    });
    const frame = JSON.stringify({ type: "heartbeat", body: file.secrets });
    expectNoSecret(frame);
    expect(frame).toContain("[secret]");
    expectNoSecret(inspect(file.secrets, { depth: 10 }));
    expectNoSecret(inspect(file, { depth: 10 }));
    expectNoSecret(String(file.secrets.ringRefreshToken));
  });
});
