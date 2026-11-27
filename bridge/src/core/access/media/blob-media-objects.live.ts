import { ManagedIdentityCredential } from "@azure/identity";
import { BlobServiceClient } from "@azure/storage-blob";
import type { ContainerClient } from "@azure/storage-blob";
import { Readable } from "node:stream";
import type { MediaObjects } from "./media-objects.ts";

/** Uses the core identity; object URLs and storage credentials stay inside this adapter. */
export class BlobMediaObjects implements MediaObjects {
  readonly #container: ContainerClient;
  constructor(container: ContainerClient) {
    this.#container = container;
  }
  static forAccount(account: string, clientId: string): BlobMediaObjects {
    const service = new BlobServiceClient(
      `https://${account}.blob.core.windows.net`,
      new ManagedIdentityCredential({ clientId }),
    );
    return new BlobMediaObjects(service.getContainerClient("media"));
  }
  async listPage(cursor: string | undefined, signal: AbortSignal) {
    const pages = this.#container
      .listBlobsFlat({ abortSignal: signal })
      .byPage({
        ...(cursor && { continuationToken: cursor }),
        maxPageSize: 100,
      });
    const page = await pages.next();
    if (page.done) return { ids: [] };
    const ids = page.value.segment.blobItems
      .map((blob) => blob.name)
      .filter((name) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
          name,
        ),
      );
    return {
      ids,
      ...(page.value.continuationToken && {
        next: page.value.continuationToken,
      }),
    };
  }
  async write(
    id: string,
    chunks: AsyncIterable<Uint8Array>,
    signal: AbortSignal,
  ): Promise<void> {
    const stream = Readable.from(chunks, { objectMode: false });
    try {
      await this.#container
        .getBlockBlobClient(id)
        .uploadStream(stream, undefined, undefined, {
          abortSignal: signal,
          conditions: { ifNoneMatch: "*" },
        });
    } finally {
      stream.destroy();
    }
  }
  async read(
    id: string,
    start: number,
    length: number,
    signal: AbortSignal,
  ): Promise<Uint8Array> {
    const bytes = await this.#container
      .getBlockBlobClient(id)
      .downloadToBuffer(start, length, { abortSignal: signal });
    if (bytes.length !== length) throw new Error("Incomplete media object.");
    return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  async remove(id: string, signal: AbortSignal): Promise<void> {
    await this.#container
      .getBlockBlobClient(id)
      .deleteIfExists({ abortSignal: signal });
  }
}
