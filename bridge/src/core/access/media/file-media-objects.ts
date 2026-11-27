import { mkdir, open, rm } from "node:fs/promises";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { createWriteStream } from "node:fs";
import type { MediaObjects } from "./media-objects.ts";

/** The folder is private to the local bridge process and never mounted on the web server. */
export class FileMediaObjects implements MediaObjects {
  readonly #directory: string;
  constructor(directory: string) {
    this.#directory = directory;
  }
  private path(id: string): string {
    if (!/^[a-f0-9-]{36}$/.test(id))
      throw new Error("Invalid media object ID.");
    return join(this.#directory, id);
  }
  async write(
    id: string,
    chunks: AsyncIterable<Uint8Array>,
    signal: AbortSignal,
  ): Promise<void> {
    await mkdir(this.#directory, { recursive: true, mode: 0o700 });
    await pipeline(
      chunks,
      createWriteStream(this.path(id), { flags: "wx", mode: 0o600 }),
      { signal },
    );
  }
  async read(
    id: string,
    start: number,
    length: number,
    signal: AbortSignal,
  ): Promise<Uint8Array> {
    const file = await open(this.path(id), "r");
    try {
      const bytes = new Uint8Array(length);
      let offset = 0;
      while (offset < length) {
        signal.throwIfAborted();
        const { bytesRead } = await file.read(
          bytes,
          offset,
          length - offset,
          start + offset,
        );
        if (bytesRead === 0) throw new Error("Incomplete media object.");
        offset += bytesRead;
      }
      return bytes;
    } finally {
      await file.close();
    }
  }
  async remove(id: string, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    await rm(this.path(id), { force: true });
  }
}
