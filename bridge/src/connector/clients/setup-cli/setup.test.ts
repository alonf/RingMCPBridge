// The Setup CLI (T028) with a scripted owner and a fake Ring sign-in: it writes the Secrets File
// last, with Ring's token, the session hardware ID, a new key pair and the printed code; it allows
// three wrong codes; it refuses an existing Secrets File, an unusable key file and a folder in use
// before the owner signs in; and no password or token appears in anything it says.
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { OutboxStore } from "../../access/outbox-store/index.ts";
import { RingLoginError } from "../../access/ring-adapter/index.ts";
import type {
  RingLogin,
  RingLoginStep,
} from "../../access/ring-adapter/index.ts";
import {
  encodeSecretsFileKey,
  readSecretsFileKey,
  SecretsFile,
} from "../../access/secrets-file/index.ts";
import { FakeClock, SystemClock } from "../../../utilities/clock/index.ts";
import {
  generateSealingKey,
  Secret,
} from "../../../utilities/security/index.ts";
import { LOGIN_STEP_TIMEOUT_MS, runSetup } from "./index.ts";
import type {
  AskOptions,
  SetupConsole,
  SetupOptions,
  SetupOutcome,
} from "./index.ts";

/** Kept apart, so the text holds no address. */
const AT = "@";
const EMAIL = `owner${AT}example.test`;
const PASSWORD = "  pass-SECRET-0001 ";
const TOKEN = "token-SECRET-0002";
const RIGHT_CODE = "424242";
const START = Date.UTC(2026, 10, 10, 9, 0, 0);

/** The owner at the terminal: answers in order, and the input ends when they run out. */
class ScriptedConsole implements SetupConsole {
  readonly said: string[] = [];
  readonly asked: { question: string; hidden: boolean }[] = [];
  readonly #answers: string[];

  constructor(answers: readonly string[]) {
    this.#answers = [...answers];
  }

  ask(question: string, options: AskOptions = {}): Promise<string> {
    this.asked.push({ question, hidden: options.hidden === true });
    const answer = this.#answers.shift();
    return answer === undefined
      ? Promise.reject(new Error("The input ended."))
      : Promise.resolve(answer);
  }

  say(line: string): void {
    this.said.push(line);
  }

  /** Everything the owner saw. */
  get text(): string {
    return [...this.asked.map((entry) => entry.question), ...this.said].join(
      "\n",
    );
  }
}

/** Ring's sign-in as the tests need it: 2FA with one right code, or a failure. */
class FakeLogin implements RingLogin {
  readonly hardwareId: string;
  readonly codes: string[] = [];
  password: string | undefined;
  closed = false;
  beginWith: () => Promise<RingLoginStep> = () =>
    Promise.resolve({
      kind: "needs_code",
      prompt: "Enter the code sent by sms",
    });
  completeWith: (code: string) => Promise<RingLoginStep> = (code) =>
    Promise.resolve(
      code === RIGHT_CODE
        ? { kind: "signed_in", refreshToken: new Secret(TOKEN) }
        : { kind: "wrong_code" },
    );

  constructor(hardwareId: string) {
    this.hardwareId = hardwareId;
  }

  begin(email: string, password: Secret<string>): Promise<RingLoginStep> {
    expect(email).toBe(EMAIL);
    this.password = password.reveal();
    return this.beginWith();
  }

  complete(code: string): Promise<RingLoginStep> {
    this.codes.push(code);
    return this.completeWith(code);
  }

  close(): void {
    this.closed = true;
  }
}

let folder: string;
let dataDir: string;
let keyPath: string;
let logins: FakeLogin[];
let shape: (login: FakeLogin) => void;
let clock: FakeClock;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "setup-cli-"));
  dataDir = join(folder, "data");
  keyPath = join(folder, "keys", "secrets.key");
  logins = [];
  shape = () => undefined;
  clock = new FakeClock(START);
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

function options(console: SetupConsole): SetupOptions {
  return {
    dataDir,
    secretsKeyPath: keyPath,
    console,
    openLogin: (hardwareId) => {
      const login = new FakeLogin(hardwareId);
      shape(login);
      logins.push(login);
      return login;
    },
    clock,
  };
}

function setup(answers: readonly string[]): {
  console: ScriptedConsole;
  outcome: Promise<SetupOutcome>;
} {
  const console = new ScriptedConsole(answers);
  return { console, outcome: runSetup(options(console)) };
}

async function filesIn(path: string): Promise<string[]> {
  return (await readdir(path).catch(() => [])).sort();
}

function expectNoSecretIn(text: string): void {
  expect(text).not.toContain(PASSWORD.trim());
  expect(text).not.toContain(TOKEN);
}

describe("the Setup CLI", () => {
  it("signs in with the owner's code after a wrong one, makes the key and the code, and writes the Secrets File", async () => {
    const { console, outcome } = setup([EMAIL, PASSWORD, "000000", RIGHT_CODE]);

    const result = await outcome;

    if (result.kind !== "done") {
      throw new Error(`expected done, got ${result.reason}`);
    }
    expect(result.enrollmentCode).toMatch(
      /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/,
    );
    // The password went to Ring as typed, from a hidden question.
    const [login] = logins;
    expect(login?.password).toBe(PASSWORD);
    expect(login?.codes).toEqual(["000000", RIGHT_CODE]);
    expect(login?.closed).toBe(true);
    expect(console.asked).toEqual([
      { question: "Ring account email: ", hidden: false },
      { question: "Ring password (not shown): ", hidden: true },
      { question: "Enter the code sent by sms: ", hidden: false },
      { question: "Enter the code sent by sms: ", hidden: false },
    ]);
    expect(console.said).toContain("Ring did not accept that code; try again.");
    expect(console.said).toContain(
      `The enrollment code is: ${result.enrollmentCode}`,
    );
    expectNoSecretIn(console.text);

    // The key file it made opens the Secrets File, which holds what the connector needs.
    const file = await SecretsFile.open({
      path: join(dataDir, "secrets.sealed"),
      key: await readSecretsFileKey(keyPath),
    });
    expect(file?.secrets.ringRefreshToken.reveal()).toBe(TOKEN);
    expect(file?.secrets.ringHardwareId.reveal()).toBe(login?.hardwareId);
    expect(file?.secrets.enrollmentCode).toBe(result.enrollmentCode);
    expect(file?.secrets.connectorKey.publicKey).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(await filesIn(dataDir)).toEqual(["outbox.db", "secrets.sealed"]);
  });

  it("uses a key file that is already there, and leaves it as it was", async () => {
    const key = generateSealingKey();
    await rm(join(folder, "keys"), { recursive: true, force: true });
    await writeFile(join(folder, "secrets.key"), encodeSecretsFileKey(key));
    keyPath = join(folder, "secrets.key");
    const before = await readFile(keyPath);

    const result = await setup([EMAIL, PASSWORD, RIGHT_CODE]).outcome;

    expect(result.kind).toBe("done");
    expect(await readFile(keyPath)).toEqual(before);
    await expect(
      SecretsFile.open({ path: join(dataDir, "secrets.sealed"), key }),
    ).resolves.toBeDefined();
  });

  it("signs in at once when Ring asks for no code", async () => {
    shape = (login) => {
      login.beginWith = () =>
        Promise.resolve({ kind: "signed_in", refreshToken: new Secret(TOKEN) });
    };

    const { console, outcome } = setup([EMAIL, PASSWORD]);

    expect((await outcome).kind).toBe("done");
    expect(console.asked).toHaveLength(2);
  });

  it("refuses an existing Secrets File before the owner signs in, and leaves it as it was", async () => {
    await setup([EMAIL, PASSWORD, RIGHT_CODE]).outcome;
    const sealed = join(dataDir, "secrets.sealed");
    const before = await readFile(sealed);

    const { console, outcome } = setup([EMAIL, PASSWORD, RIGHT_CODE]);

    expect(await outcome).toEqual({
      kind: "refused",
      reason: "already_set_up",
    });
    expect(console.asked).toEqual([]);
    expect(logins).toHaveLength(1);
    expect(await readFile(sealed)).toEqual(before);
    expect(console.said.at(-1)).toContain("delete that file");
  });

  it("refuses a key file that holds no key before the owner signs in, and leaves it as it was", async () => {
    keyPath = join(folder, "not-a-key");
    await writeFile(keyPath, "not a key\n");

    const { console, outcome } = setup([EMAIL, PASSWORD, RIGHT_CODE]);

    expect(await outcome).toEqual({ kind: "refused", reason: "key_unusable" });
    expect(console.asked).toEqual([]);
    expect(await readFile(keyPath, "utf8")).toBe("not a key\n");
    expect(console.said.at(-1)).toContain("BRIDGE_SECRETS_KEY_FILE");
  });

  it("refuses a data folder a connector holds before the owner signs in", async () => {
    await setup([]).outcome;
    const held = await OutboxStore.open(
      { path: join(dataDir, "outbox.db"), clock, exclusive: true },
      new AbortController().signal,
    );
    try {
      // The store retries a busy file on its clock, so this run's clock is the system's.
      const console = new ScriptedConsole([EMAIL, PASSWORD, RIGHT_CODE]);
      const outcome = await runSetup({
        ...options(console),
        clock: new SystemClock(),
      });

      expect(outcome).toEqual({
        kind: "refused",
        reason: "data_folder_in_use",
      });
      expect(console.asked).toEqual([]);
    } finally {
      await held.close();
    }
  });

  it("stops after three wrong codes, saving no secret", async () => {
    const { console, outcome } = setup([EMAIL, PASSWORD, "1", "2", "3", "4"]);

    expect(await outcome).toEqual({ kind: "refused", reason: "wrong_codes" });
    expect(logins[0]?.codes).toEqual(["1", "2", "3"]);
    expect(logins[0]?.closed).toBe(true);
    expect(await filesIn(dataDir)).toEqual(["outbox.db"]);
    expect(await filesIn(join(folder, "keys"))).toEqual([]);
    expect(console.said.at(-1)).toContain("No secrets were saved.");
  });

  it.each([
    ["refused", "sign_in_refused"],
    ["too_many_codes", "too_many_codes"],
  ] as const)(
    "passes Ring's %s on to the owner, saving no secret",
    async (kind, reason) => {
      shape = (login) => {
        login.beginWith = () =>
          Promise.reject(new RingLoginError(kind, "Ring said no."));
      };

      const { console, outcome } = setup([EMAIL, PASSWORD]);

      expect(await outcome).toEqual({ kind: "refused", reason });
      expect(console.said.at(-1)).toBe("Ring said no. No secrets were saved.");
      expect(logins[0]?.closed).toBe(true);
      expect(await filesIn(dataDir)).toEqual(["outbox.db"]);
    },
  );

  it("stops when Ring does not answer in time, saving no secret", async () => {
    shape = (login) => {
      login.completeWith = () => new Promise<never>(() => undefined);
    };
    const { console, outcome } = setup([EMAIL, PASSWORD, RIGHT_CODE]);
    await expect.poll(() => logins[0]?.codes.length).toBe(1);

    await clock.advance(LOGIN_STEP_TIMEOUT_MS);

    expect(await outcome).toEqual({ kind: "refused", reason: "ring_silent" });
    expect(console.said.at(-1)).toContain("did not answer within 2 minutes");
    expect(logins[0]?.closed).toBe(true);
    expect(await filesIn(dataDir)).toEqual(["outbox.db"]);
  });

  it("stops as cancelled when the input ends, and on an empty email", async () => {
    expect(await setup([EMAIL]).outcome).toEqual({
      kind: "refused",
      reason: "cancelled",
    });
    expect(await setup([""]).outcome).toEqual({
      kind: "refused",
      reason: "no_email",
    });
    expect(logins).toEqual([]);
  });

  it("refuses when the key file cannot be written, saving no secret, and a later run goes on from there", async () => {
    // A file where the key's folder should be.
    await writeFile(join(folder, "keys"), "");

    expect(await setup([EMAIL, PASSWORD, RIGHT_CODE]).outcome).toEqual({
      kind: "refused",
      reason: "write_failed",
    });
    expect(await filesIn(dataDir)).toEqual(["outbox.db"]);

    await rm(join(folder, "keys"));
    const again = await setup([EMAIL, PASSWORD, RIGHT_CODE]).outcome;
    expect(again.kind).toBe("done");
    expect(await filesIn(dataDir)).toEqual(["outbox.db", "secrets.sealed"]);
  });

  it("leaves a Secrets File that appeared while the owner signed in as it is", async () => {
    shape = (login) => {
      login.completeWith = async () => {
        await writeFile(join(dataDir, "secrets.sealed"), "another run's");
        return { kind: "signed_in", refreshToken: new Secret(TOKEN) };
      };
    };

    const { console, outcome } = setup([EMAIL, PASSWORD, RIGHT_CODE]);

    expect(await outcome).toEqual({ kind: "refused", reason: "write_failed" });
    expect(await readFile(join(dataDir, "secrets.sealed"), "utf8")).toBe(
      "another run's",
    );
    expect(console.said.at(-1)).toContain("appeared");
  });
});
