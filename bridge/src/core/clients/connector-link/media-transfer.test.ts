import { expect, it } from "vitest";
import { Logger } from "../../../utilities/logging/index.ts";
import { createLinkPair } from "../../../utilities/link-transport/index.ts";
import { mediaRequest } from "../../../connector/clients/core-link/messages/index.ts";
import { MediaTransfer } from "./media-transfer.ts";

const key = {
  householdId: "home",
  cameraId: "camera",
  eventId: "event",
  kind: "frame",
  hasSound: false,
} as const;
it.each(["dropped", "truncated", "out-of-order", "oversized"] as const)(
  "discards a %s transfer before it reaches storage",
  async (failure) => {
    const pair = createLinkPair(
      new Logger({ sink: () => undefined, now: () => 0, minLevel: "debug" }),
    );
    const transfer = new MediaTransfer(pair.acceptor);
    pair.acceptor.onFrame((frame) => transfer.receive(frame));
    const request = Promise.withResolvers<string>();
    pair.dialer.onFrame((frame) => {
      if (frame.kind === "message" && frame.type === "media_request")
        request.resolve(mediaRequest.parse(frame.body).requestId);
    });
    await pair.dialer.send({ type: "media_capable", body: {} });
    const result = transfer.request(key, new AbortController().signal);
    const rejected = expect(result).rejects.toThrow("interrupted");
    const requestId = await request.promise;
    await pair.dialer.send({
      type: "media_reply",
      body: {
        requestId,
        status: "start",
        capturedAt: 1,
        length: failure === "oversized" ? 8 * 1024 * 1024 + 1 : 8,
      },
    });
    await pair.dialer.sendChunk({
      type: "media_chunk",
      header: { requestId, offset: failure === "out-of-order" ? 1 : 0 },
      bytes: Uint8Array.of(1, 2, 3, 4),
    });
    if (failure === "dropped") pair.drop();
    else
      await pair.dialer.send({
        type: "media_reply",
        body: { requestId, status: "complete" },
      });
    await rejected;
    pair.drop();
  },
);
