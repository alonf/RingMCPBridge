// The Setup CLI (T028; FR-032, SC2, SC4): run once by the owner, at the home server's terminal, in
// the connector's image. The agent never runs it: the Ring login and its 2FA code are the owner's.
// - **What it makes**: the Secrets File, holding Ring's refresh token and session hardware ID, the
//   connector's key pair (the private key never leaves home) and the enrollment code; the key file
//   that seals it, when there is none yet; and the outbox, which must exist whenever the Secrets
//   File does (DRIFT-001-36).
// - **The Secrets File is written last**: the sign-in comes before any secret is saved, and a run
//   that stops early leaves at most an empty outbox and the key file, which a new run takes as they
//   are. An existing Secrets File is refused and left alone.
// - **The outbox is held** for the whole run, so a connector running on the same folder is found
//   before the owner signs in.
// - **No manager**: the setup is the owner's one-off task at home, so this client calls the
//   access components directly (Secrets File, Outbox Store, the Ring sign-in).
// Nothing it is told or sent is logged; the password and the token are only ever in `Secret`s.
import { randomUUID } from "node:crypto";
import { mkdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  OUTBOX_FILE_NAME,
  OutboxStore,
  OutboxStoreError,
} from "../../access/outbox-store/index.ts";
import { RingLoginError } from "../../access/ring-adapter/index.ts";
import type {
  RingLogin,
  RingLoginStep,
} from "../../access/ring-adapter/index.ts";
import {
  encodeSecretsFileKey,
  readSecretsFileKey,
  SECRETS_FILE_NAME,
  SecretsFile,
  SecretsFileError,
} from "../../access/secrets-file/index.ts";
import type { HomeSecrets } from "../../access/secrets-file/index.ts";
import type { Cancel, Clock } from "../../../utilities/clock/index.ts";
import {
  createAtomically,
  generateSealingKey,
  generateSigningKeyPair,
  Secret,
} from "../../../utilities/security/index.ts";
import { newEnrollmentCode } from "./enrollment-code.ts";
import type { AskOptions, SetupConsole } from "./setup-console.ts";

/** How long one sign-in step may wait for Ring [P]: the library retries without end. */
export const LOGIN_STEP_TIMEOUT_MS = 120_000;
/** Wrong codes allowed before the setup stops. */
export const MAX_WRONG_CODES = 3;

const NOTHING_SAVED = "No secrets were saved.";
const MS_PER_MINUTE = 60_000;

/** What the setup works with. */
export interface SetupOptions {
  /** The connector's data folder: the Secrets File and the outbox. */
  readonly dataDir: string;
  /** The Secrets File's key, apart from the data folder; made when missing. */
  readonly secretsKeyPath: string;
  readonly console: SetupConsole;
  /** Opens a sign-in for a session hardware ID: Ring's in production, a fake in tests. */
  readonly openLogin: (hardwareId: string) => RingLogin;
  readonly clock: Clock;
  /** The enrollment code's random bytes; for tests. */
  readonly random?: (size: number) => Uint8Array;
}

/** Why the setup stopped; its message, said to the owner, names what to do. */
export type SetupRefusal =
  | "already_set_up"
  | "key_unusable"
  | "data_folder_in_use"
  | "no_email"
  | "sign_in_refused"
  | "too_many_codes"
  | "wrong_codes"
  | "ring_silent"
  | "cancelled"
  | "write_failed";

/** How the setup ended. */
export type SetupOutcome =
  | { readonly kind: "done"; readonly enrollmentCode: string }
  | { readonly kind: "refused"; readonly reason: SetupRefusal };

class Refusal extends Error {
  readonly reason: SetupRefusal;

  constructor(reason: SetupRefusal, message: string) {
    super(message);
    this.name = "Refusal";
    this.reason = reason;
  }
}

/** The Secrets File's key: the one on disk, or a new one to write once the owner is signed in. */
interface SealingKey {
  readonly bytes: Uint8Array;
  readonly isNew: boolean;
}

/** Runs the setup. Says each step and any refusal to the owner. */
export async function runSetup(options: SetupOptions): Promise<SetupOutcome> {
  const { console } = options;
  console.say(
    "Ring MCP Bridge setup. You sign in to Ring here; your password and code go only to Ring and are never saved.",
  );
  let outbox: OutboxStore | undefined;
  try {
    const secretsPath = join(options.dataDir, SECRETS_FILE_NAME);
    await refuseExistingSecrets(secretsPath);
    const sealingKey = await readOrMakeKey(options.secretsKeyPath);
    outbox = await holdOutbox(options.dataDir, options.clock);
    const hardwareId = randomUUID();
    const refreshToken = await signIn(options, hardwareId);
    if (sealingKey.isNew) {
      await writeKey(options.secretsKeyPath, sealingKey.bytes);
    }
    const enrollmentCode = newEnrollmentCode(options.random);
    await writeSecrets(secretsPath, sealingKey.bytes, {
      ringRefreshToken: refreshToken,
      ringHardwareId: new Secret(hardwareId),
      connectorKey: await generateSigningKeyPair(),
      enrollmentCode,
    });
    console.say("Signed in, and the connector's key is made.");
    console.say(`The enrollment code is: ${enrollmentCode}`);
    console.say(
      "Start the connector. On the admin page, sign in, check that the code shown there is this one, then approve it.",
    );
    return { kind: "done", enrollmentCode };
  } catch (error) {
    if (error instanceof Refusal) {
      console.say(error.message);
      return { kind: "refused", reason: error.reason };
    }
    throw error;
  } finally {
    await outbox?.close();
  }
}

async function refuseExistingSecrets(secretsPath: string): Promise<void> {
  if (await exists(secretsPath)) {
    throw new Refusal(
      "already_set_up",
      `This data folder is already set up: ${secretsPath} exists, and was left as it is. To start again with a new Ring sign-in and a new key, stop the connector, delete that file, run the setup again, and approve the new code on the admin page.`,
    );
  }
}

async function readOrMakeKey(keyPath: string): Promise<SealingKey> {
  if (!(await exists(keyPath))) {
    return { bytes: generateSealingKey(), isNew: true };
  }
  try {
    return { bytes: await readSecretsFileKey(keyPath), isNew: false };
  } catch (error) {
    if (error instanceof SecretsFileError) {
      throw new Refusal(
        "key_unusable",
        `The file at ${keyPath} is not a Secrets File key, and was left as it is. Remove it, or set BRIDGE_SECRETS_KEY_FILE to a path with no file, then run the setup again.`,
      );
    }
    throw error;
  }
}

// Opening the outbox makes it when it is missing, and holds it while the setup runs.
async function holdOutbox(dataDir: string, clock: Clock): Promise<OutboxStore> {
  await mkdir(dataDir, { recursive: true });
  try {
    return await OutboxStore.open(
      { path: join(dataDir, OUTBOX_FILE_NAME), clock, exclusive: true },
      new AbortController().signal,
    );
  } catch (error) {
    if (error instanceof OutboxStoreError && error.kind === "in_use") {
      throw new Refusal(
        "data_folder_in_use",
        "The bridge is running on this data folder. Stop it, then run the setup again.",
      );
    }
    throw error;
  }
}

async function signIn(
  options: SetupOptions,
  hardwareId: string,
): Promise<Secret<string>> {
  const email = await ask(options.console, "Ring account email: ");
  if (email === "") {
    throw new Refusal(
      "no_email",
      `No email was given. ${NOTHING_SAVED} Run the setup again.`,
    );
  }
  const password = new Secret(
    await ask(options.console, "Ring password (not shown): ", {
      hidden: true,
    }),
  );
  const login = options.openLogin(hardwareId);
  try {
    options.console.say("Signing in to Ring...");
    return await untilSignedIn(
      options,
      login,
      await withDeadline(options.clock, login.begin(email, password)),
    );
  } catch (error) {
    if (error instanceof RingLoginError) {
      throw new Refusal(
        error.kind === "too_many_codes" ? "too_many_codes" : "sign_in_refused",
        `${error.message} ${NOTHING_SAVED}`,
      );
    }
    throw error;
  } finally {
    login.close();
  }
}

// Asks for the code Ring sent until Ring accepts one, allowing `MAX_WRONG_CODES` wrong ones.
async function untilSignedIn(
  options: SetupOptions,
  login: RingLogin,
  first: RingLoginStep,
): Promise<Secret<string>> {
  let step = first;
  let prompt = "";
  let wrongCodes = 0;
  while (step.kind !== "signed_in") {
    if (step.kind === "needs_code") {
      prompt = step.prompt;
    } else {
      wrongCodes += 1;
      if (wrongCodes >= MAX_WRONG_CODES) {
        throw new Refusal(
          "wrong_codes",
          `Ring did not accept ${String(MAX_WRONG_CODES)} codes. ${NOTHING_SAVED} Run the setup again for a new code.`,
        );
      }
      options.console.say("Ring did not accept that code; try again.");
    }
    const code = await ask(options.console, `${prompt}: `);
    step = await withDeadline(options.clock, login.complete(code));
  }
  return step.refreshToken;
}

async function ask(
  console: SetupConsole,
  question: string,
  options?: AskOptions,
): Promise<string> {
  try {
    return await console.ask(question, options);
  } catch {
    throw new Refusal("cancelled", `The setup was cancelled. ${NOTHING_SAVED}`);
  }
}

async function withDeadline<T>(clock: Clock, work: Promise<T>): Promise<T> {
  let cancel: Cancel = () => undefined;
  const silence = new Promise<never>((_, reject) => {
    cancel = clock.schedule(LOGIN_STEP_TIMEOUT_MS, () => {
      reject(
        new Refusal(
          "ring_silent",
          `Ring did not answer within ${String(LOGIN_STEP_TIMEOUT_MS / MS_PER_MINUTE)} minutes. Check this machine's internet connection, then run the setup again. ${NOTHING_SAVED}`,
        ),
      );
    });
  });
  try {
    return await Promise.race([work, silence]);
  } finally {
    cancel();
  }
}

async function writeKey(keyPath: string, key: Uint8Array): Promise<void> {
  try {
    await mkdir(dirname(keyPath), { recursive: true });
    await createAtomically(
      keyPath,
      Buffer.from(encodeSecretsFileKey(key), "utf8"),
    );
  } catch {
    throw new Refusal(
      "write_failed",
      `The key file could not be written at ${keyPath}. Check that its folder can be written, then run the setup again. ${NOTHING_SAVED}`,
    );
  }
}

async function writeSecrets(
  secretsPath: string,
  key: Uint8Array,
  secrets: HomeSecrets,
): Promise<void> {
  try {
    await SecretsFile.create({ path: secretsPath, key }, secrets);
  } catch (error) {
    if (error instanceof SecretsFileError) {
      throw new Refusal(
        "write_failed",
        error.kind === "already_exists"
          ? `A Secrets File appeared at ${secretsPath} while the setup ran, and was left as it is. ${NOTHING_SAVED}`
          : `The Secrets File could not be written at ${secretsPath}. Check that the data folder can be written, then run the setup again. ${NOTHING_SAVED}`,
      );
    }
    throw error;
  }
}

// A path is missing when it is not there, or when a folder on its way is a file: Linux answers
// that with ENOTDIR, where Windows answers ENOENT.
const MISSING: ReadonlySet<unknown> = new Set(["ENOENT", "ENOTDIR"]);

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && MISSING.has(error.code)) {
      return false;
    }
    throw error;
  }
}
