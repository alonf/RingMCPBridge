// Writing the Secrets File so a reader, or a restart, only ever sees the old file or the new one.
// The bytes go to a temporary file in the same folder, which is flushed to disk and then moved
// over the file (a rename replaces it in one step). On a failure the temporary file is removed
// and the old file stays as it was.
import { randomUUID } from "node:crypto";
import { link, open, rename, rm } from "node:fs/promises";
import { dirname } from "node:path";

/** Owner read and write only. Windows ignores it. */
const OWNER_ONLY = 0o600;
const IS_WINDOWS = process.platform === "win32";

/** Moves a written temporary file over the target; `rename` in production, a seam for tests. */
export type MoveOver = (from: string, to: string) => Promise<void>;

/** Production's `MoveOver`. */
export const moveOverWithRename: MoveOver = rename;

async function writeFlushed(path: string, bytes: Uint8Array): Promise<void> {
  const handle = await open(path, "wx", OWNER_ONLY);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

// Makes the rename itself durable. Windows cannot open a folder this way, and Node flushes its
// metadata there; elsewhere a failure here leaves the new file in place, so it is not fatal.
async function flushFolder(path: string): Promise<void> {
  if (IS_WINDOWS) {
    return;
  }
  try {
    const handle = await open(dirname(path), "r");
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch {
    // Best effort, as above.
  }
}

async function throughTemporary(
  path: string,
  bytes: Uint8Array,
  place: MoveOver,
): Promise<void> {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFlushed(temporary, bytes);
    await place(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
  await flushFolder(path);
}

/** Replaces `path` with `bytes` in one step, or leaves it unchanged and throws. */
export async function replaceAtomically(
  path: string,
  bytes: Uint8Array,
  moveOver: MoveOver,
): Promise<void> {
  await throughTemporary(path, bytes, moveOver);
}

/**
 * Writes a new file at `path` in one step. A hard link never replaces an existing file, so this
 * throws `EEXIST` when one is already there.
 */
export async function createAtomically(
  path: string,
  bytes: Uint8Array,
): Promise<void> {
  await throughTemporary(path, bytes, link);
}
