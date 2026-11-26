import type {
  LinkConnection,
  LinkFrame,
} from "../../../utilities/link-transport/index.ts";
import { MEDIA_CHUNK_BYTES } from "../../../core/clients/connector-link/messages/index.ts";
import {
  mediaCancel,
  mediaRequest,
  type MediaRequest,
} from "./messages/index.ts";

export type HomeMediaSource = (
  request: MediaRequest,
  signal: AbortSignal,
) => Promise<
  | { status: "pending" | "missing" }
  | {
      status: "available";
      capturedAt: number;
      bytes: Uint8Array;
      stillAuthorized: () => boolean;
    }
>;

/** One bounded transfer on this authenticated connection. Upstream work never owns the event lane. */
export class HomeMedia {
  private active: { id: string; controller: AbortController } | undefined;
  private readonly link: LinkConnection;
  private readonly source: HomeMediaSource;
  constructor(link: LinkConnection, source: HomeMediaSource) {
    this.link = link;
    this.source = source;
  }
  close() {
    this.active?.controller.abort();
  }
  receive(frame: LinkFrame): boolean {
    if (frame.kind !== "message") return false;
    if (frame.type === "media_cancel") {
      const cancel = mediaCancel.safeParse(frame.body);
      if (cancel.success && cancel.data.requestId === this.active?.id)
        this.close();
      return true;
    }
    if (frame.type !== "media_request") return false;
    const parsed = mediaRequest.safeParse(frame.body);
    if (!parsed.success) return true;
    const request = parsed.data;
    if (this.active) {
      void this.reply(request.requestId, "pending");
      return true;
    }
    const controller = new AbortController();
    this.active = { id: request.requestId, controller };
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(55_000),
    ]);
    void this.transfer(request, signal)
      .catch(() => this.reply(request.requestId, "failed"))
      .finally(() => {
        this.active = undefined;
      });
    return true;
  }
  private reply(
    requestId: string,
    status: "pending" | "missing" | "failed" | "complete",
  ) {
    return this.link.send({ type: "media_reply", body: { requestId, status } });
  }
  private async transfer(request: MediaRequest, signal: AbortSignal) {
    const { requestId } = request;
    const item = await this.source(request, signal);
    signal.throwIfAborted();
    if (item.status !== "available") {
      await this.reply(requestId, item.status);
      return;
    }
    const { bytes, capturedAt } = item;
    if (!item.stillAuthorized()) {
      await this.reply(requestId, "missing");
      return;
    }
    if (
      (await this.link.send({
        type: "media_reply",
        body: { requestId, status: "start", capturedAt, length: bytes.length },
      })) !== "sent"
    )
      return;
    for (let offset = 0; offset < bytes.length; offset += MEDIA_CHUNK_BYTES) {
      signal.throwIfAborted();
      if (
        (await this.link.sendChunk({
          type: "media_chunk",
          header: { requestId, offset },
          bytes: bytes.subarray(offset, offset + MEDIA_CHUNK_BYTES),
        })) !== "sent"
      )
        return;
    }
    signal.throwIfAborted();
    await this.reply(
      requestId,
      item.stillAuthorized() ? "complete" : "missing",
    );
  }
}
