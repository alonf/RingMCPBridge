import type { Logger } from "../../../utilities/logging/index.ts";
import { MediaDenied } from "../../managers/media/index.ts";
import type { MediaHandoff } from "../../managers/media/index.ts";
import type { AccessTokens, ReadLimit } from "../mcp-endpoint/index.ts";

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
) {
  const headers = new Headers({
    "cache-control": "private, no-store",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
  });
  const empty = (status: number) => new Response(null, { status, headers });
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
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(30_000)]);
  let receiver: string | undefined;
  try {
    const identity = token
      ? await tokens.checkAccessToken(token, signal)
      : { kind: "invalid" as const };
    if (identity.kind === "unavailable") {
      logger?.error("media_identity_unavailable", { request_id: itemId });
      return empty(503);
    }
    const bucket =
      identity.kind === "valid"
        ? "receiver:" + (identity.listedClientId ?? identity.clientId)
        : "anonymous";
    const allowance = limit.take(bucket);
    if (!allowance.allowed) {
      headers.set("retry-after", String(allowance.retryAfterS));
      return empty(429);
    }
    if (identity.kind === "invalid") {
      await media.auditFetch(itemId, "", "denied", signal);
      headers.set("www-authenticate", "Bearer");
      return empty(401);
    }
    receiver = identity.listedClientId ?? identity.clientId;
    if (!grant || !/^[A-Za-z0-9_-]{43}$/.test(grant)) {
      await media.auditFetch(itemId, receiver, "denied", signal);
      return empty(404);
    }
    if (!identity.scopes.includes("media")) throw new MediaDenied();
    const item = await media.authorize(itemId, receiver, grant, signal);
    const rangeHeader = request.headers.get("range");
    const range = byteRange(rangeHeader, item.length);
    if (!range) {
      headers.set("content-range", "bytes */" + String(item.length));
      return empty(416);
    }
    const bytes = await media.read(
      item,
      receiver,
      grant,
      range.start,
      range.end - range.start + 1,
      signal,
    );
    headers.set(
      "content-type",
      item.kind === "frame" ? "image/jpeg" : "video/mp4",
    );
    headers.set("content-length", String(bytes.length));
    headers.set("accept-ranges", "bytes");
    if (rangeHeader)
      headers.set(
        "content-range",
        `bytes ${String(range.start)}-${String(range.end)}/${String(item.length)}`,
      );
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    });
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
