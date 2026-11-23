import { MediaDenied } from "../../managers/media/index.ts";
import type { MediaHandoff } from "../../managers/media/index.ts";
import type { AccessTokens } from "../mcp-endpoint/index.ts";

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
  media: Pick<MediaHandoff, "authorize" | "read">,
  tokens: AccessTokens,
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
  if (!token) {
    headers.set("www-authenticate", "Bearer");
    return empty(401);
  }
  if (!itemId || !grant || !/^[A-Za-z0-9_-]{43}$/.test(grant))
    return empty(404);
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(30_000)]);
  try {
    const identity = await tokens.checkAccessToken(token, signal);
    if (identity.kind === "unavailable") return empty(503);
    if (identity.kind === "invalid") {
      headers.set("www-authenticate", "Bearer");
      return empty(401);
    }
    if (!identity.scopes.includes("media")) return empty(403);
    const receiver = identity.listedClientId ?? identity.clientId;
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
    return new Response(new Uint8Array(bytes), {
      status: rangeHeader ? 206 : 200,
      headers,
    });
  } catch (error) {
    return empty(error instanceof MediaDenied ? 403 : 503);
  }
}
