// The home's files in its data folder (T028), for the connector and mode A: the Secrets File,
// sealed under a key kept apart from the folder, and the outbox, which must not be lost while the
// Secrets File is kept. Nothing here reaches Ring's library, so the tests open a real Secrets File
// over a simulated home.
// - **One home part per data folder, in either mode** (CP-06 review): both modes open the outbox
//   here, holding its file, before they open Ring. A second home part on the same folder, a
//   connector or mode A, stops before it reaches Ring, and the two never rotate the same saved
//   Ring token. The Setup CLI holds the same file while it runs.
import { stat } from "node:fs/promises";
import { join } from "node:path";
import {
  OUTBOX_FILE_NAME,
  OutboxStore,
  OutboxStoreError,
} from "../connector/access/outbox-store/index.ts";
import {
  readSecretsFileKey,
  SECRETS_FILE_NAME,
  SecretsFile,
} from "../connector/access/secrets-file/index.ts";
import type { Clock } from "../utilities/clock/index.ts";
import { HostError } from "./host-error.ts";

/** Where the home keeps its files. */
export interface HomeFileSettings {
  /** The folder holding the outbox and the Secrets File. */
  readonly dataDir: string;
  /** The Secrets File's key, apart from the data folder. */
  readonly secretsKeyPath: string;
}

/**
 * Opens the Secrets File under its key. Throws `HostError` (`setup_needed`) when there is none
 * yet, and the Secrets File's own error when the key or the file cannot be used.
 */
export async function openHomeSecrets(
  settings: HomeFileSettings,
): Promise<SecretsFile> {
  const key = await readSecretsFileKey(settings.secretsKeyPath);
  const file = await SecretsFile.open({
    path: join(settings.dataDir, SECRETS_FILE_NAME),
    key,
  });
  if (file === undefined) {
    throw new HostError(
      "setup_needed",
      `There is no ${SECRETS_FILE_NAME} in the data folder: run the setup first.`,
    );
  }
  return file;
}

/**
 * Takes the data folder for this process's home part: refuses a lost outbox, then opens the outbox
 * holding its file until it is closed. Called before Ring is opened. Throws `HostError`
 * (`outbox_lost`, `data_folder_in_use`), or the Outbox Store's own error.
 */
export async function openHomeOutbox(
  dataDir: string,
  clock: Clock,
): Promise<OutboxStore> {
  await refuseLostOutbox(dataDir);
  try {
    return await OutboxStore.open(
      { path: join(dataDir, OUTBOX_FILE_NAME), clock, exclusive: true },
      new AbortController().signal,
    );
  } catch (error) {
    if (error instanceof OutboxStoreError && error.kind === "in_use") {
      throw new HostError(
        "data_folder_in_use",
        "Another bridge process is using this data folder.",
        { cause: error },
      );
    }
    throw error;
  }
}

/**
 * Refuses a data folder whose outbox is gone while its Secrets File is kept (DRIFT-001-36). The
 * outbox holds the home's version counter, and the core keeps the newest versions it has seen from
 * the home's key: a new outbox would count from 1 again, and the core would skip every change as
 * older until a new key is enrolled. Runs before the outbox is opened, since opening makes it.
 */
async function refuseLostOutbox(dataDir: string): Promise<void> {
  const secretsKept = await exists(join(dataDir, SECRETS_FILE_NAME));
  if (secretsKept && !(await exists(join(dataDir, OUTBOX_FILE_NAME)))) {
    throw new HostError(
      "outbox_lost",
      `The data folder has its ${SECRETS_FILE_NAME} but no ${OUTBOX_FILE_NAME}. Delete ${SECRETS_FILE_NAME}, run the setup again, and approve the new code on the admin page.`,
    );
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
