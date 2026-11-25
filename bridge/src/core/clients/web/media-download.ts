import type { Logger } from "../../../utilities/logging/index.ts";
import type { DownloadLifetime } from "./download-lifetime.ts";
import { MediaDenied } from "../../managers/media/index.ts";
import type { MediaHandoff } from "../../managers/media/index.ts";
import type { AccessTokens, ReadLimit } from "../mcp-endpoint/index.ts";

const DOWNLOAD_CHUNK_BYTES = 256 * 1024;
const READ_TIMEOUT_MS = 30_000;

function byteRange(header: string | null, length: number) {
  if (header === null) return { start: 0, end: length - 1 };
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2])) return undefined;
  const start = match[1]
    ? Number(match[1])
    : Math.max(0, length - Number(match[2]));
  const end =
    match[1] && match[2] ? Math.min(length - 1, Number(match[2])) : length - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end)
    return undefined;
  return { start, end };
}
/** Every new GET, including a Range request, resolves the receiver's current identity and grant. */
export async function mediaDownload(
  request: Request,
  media: Pick<MediaHandoff, "authorize" | "read" | "auditFetch">,
  tokens: AccessTokens,
  limit: Pick<ReadLimit, "take">,
  logger?: Pick<Logger, "error">,
  lifetime?: DownloadLifetime,
) {
  const headers = new Headers({
    "cache-control": "private, no-store",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
  });
  const empty = (status: number) => new Response(null, { status, headers });
  if (lifetime?.signal.aborted) return empty(503);
  if (request.method !== "GET") {
    headers.set("allow", "GET");
    return empty(405);
  }
  const url = new URL(request.url);
  const itemId = /^\/media\/items\/([0-9a-f-]{36})$/.exec(url.pathname)?.[1];
  const grant = url.searchParams.get("grant");
  const token = /^Bearer ([^\s]+)$/i.exec(
    request.headers.get("authorization") ?? "",
  )?.[1];
  if (!itemId) return empty(404);
  const cancelled = new AbortController();
  const disconnect = lifetime
    ? AbortSignal.any([request.signal, lifetime.signal])
    : request.signal;
  const connection = AbortSignal.any([disconnect, cancelled.signal]);
  const deadline = () =>
    AbortSignal.any([connection, AbortSignal.timeout(READ_TIMEOUT_MS)]);
  const signal = deadline();
  let receiver: string | undefined;
  try {
    const identity = token
      ? await tokens.checkAccessToken(token, signal)
      : { kind: "invalid" as const };
    if (identity.kind === "unavailable") {
      logger?.error("media_identity_unavailable", { request_id: itemId });
      return empty(503);
    }
    if (identity.kind === "invalid") {
      headers.set("www-authenticate", "Bearer");
      if (limit.take("anonymous").allowed)
        await media
          .auditFetch(itemId, "", "denied", signal)
          .catch((error: unknown) =>
            logger?.error("media_audit_failed", { request_id: itemId }, error),
          );
      return empty(401);
    }
    receiver = identity.listedClientId ?? identity.clientId;
    const allowance = limit.take("receiver:" + receiver);
    if (!allowance.allowed) {
      headers.set("retry-after", String(allowance.retryAfterS));
      return empty(429);
    }
    if (!grant || !/^[A-Za-z0-9_-]{43}$/.test(grant)) {
      await media.auditFetch(itemId, receiver, "denied", signal);
      return empty(404);
    }
    if (!identity.scopes.includes("media")) throw new MediaDenied();
    const item = await media.authorize(itemId, receiver, grant, signal);
    const rangeHeader = request.headers.get("range");
    const range = byteRange(rangeHeader, item.length);
    if (!range) {
      await media.auditFetch(itemId, receiver, "range_rejected", signal, item);
      headers.set("content-range", "bytes */" + String(item.length));
      return empty(416);
    }
    const recipient = receiver;
    let offset = range.start;
    const nextChunk = async () => {
      const chunkSignal = offset === range.start ? signal : deadline();
      chunkSignal.throwIfAborted();
      const size = Math.min(DOWNLOAD_CHUNK_BYTES, range.end - offset + 1);
      const chunk = await media.read(
        item,
        recipient,
        grant,
        offset,
        size,
        chunkSignal,
        offset === range.start,
      );
      if (chunk.byteLength !== size) throw new Error("Incomplete media range.");
      return chunk;
    };
    // Authorize the first bytes before sending successful headers.
    const first = await nextChunk();
    headers.set(
      "content-type",
      item.kind === "frame" ? "image/jpeg" : "video/mp4",
    );
    headers.set("content-length", String(range.end - range.start + 1));
    headers.set("accept-ranges", "bytes");
    if (rangeHeader)
      headers.set(
        "content-range",
        `bytes ${String(range.start)}-${String(range.end)}/${String(item.length)}`,
      );
    let failureAudit: Promise<void> | undefined;
    const auditInterruption = (outcome: "denied" | "incomplete") => {
      // Cancellation and a rejected storage read can describe the same interruption.
      // The connection's signal may already be aborted when the audit starts.
      if (failureAudit) return failureAudit;
      const write = media
        .auditFetch(
          itemId,
          recipient,
          outcome,
          AbortSignal.timeout(READ_TIMEOUT_MS),
          item,
        )
        .catch((error: unknown) =>
          logger?.error("media_audit_failed", { request_id: itemId }, error),
        );
      failureAudit = lifetime ? lifetime.track(write) : write;
      return failureAudit;
    };
    const abortListener = new AbortController();
    const enqueue = (
      controller: ReadableStreamDefaultController<Uint8Array>,
      chunk: Uint8Array,
    ) => {
      connection.throwIfAborted();
      controller.enqueue(chunk);
      offset += chunk.byteLength;
      if (offset > range.end) {
        abortListener.abort();
        controller.close();
      }
    };
    const body = new ReadableStream<Uint8Array>(
      {
        start(controller) {
          const onDisconnect = () => {
            controller.error(new Error("Media download interrupted."));
            void auditInterruption("incomplete");
          };
          if (disconnect.aborted) {
            onDisconnect();
            return;
          }
          disconnect.addEventListener("abort", onDisconnect, {
            once: true,
            signal: abortListener.signal,
          });
          enqueue(controller, first);
        },
        async pull(controller) {
          try {
            const chunk = await nextChunk();
            enqueue(controller, chunk);
          } catch (error) {
            abortListener.abort();
            logger?.error(
              "media_download_failed",
              { request_id: itemId },
              error,
            );
            await auditInterruption(
              error instanceof MediaDenied ? "denied" : "incomplete",
            );
            controller.error(new Error("Media download interrupted."));
          }
        },
        cancel() {
          abortListener.abort();
          cancelled.abort();
          return offset <= range.end
            ? auditInterruption("incomplete")
            : undefined;
        },
      },
      { highWaterMark: 0 },
    );
    return new Response(body, {
      status: rangeHeader ? 206 : 200,
      headers,
    });
  } catch (error) {
    if (error instanceof MediaDenied && receiver) {
      try {
        await media.auditFetch(itemId, receiver, "denied", signal);
      } catch (auditError) {
        logger?.error("media_audit_failed", { request_id: itemId }, auditError);
        return empty(503);
      }
      return empty(403);
    }
    logger?.error("media_download_failed", { request_id: itemId }, error);
    return empty(503);
  }
}
