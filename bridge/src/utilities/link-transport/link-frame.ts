// Link frames (CP-09, T015): the two kinds of frame the link carries, how each is written on the
// wire, and the link protocol version. The transport reads a frame's type name and nothing of its
// body or header: the receivers declare and parse their own messages (CD4), so no name from the
// bridge or from Ring appears here (CD X2).
//
// - A message is a UTF-8 text frame: the JSON object `{"type": ..., "body": ...}`.
// - A chunk is a binary frame: a 4-byte big-endian header length, the UTF-8 JSON object
//   `{"type": ..., "header": ...}`, then the bytes.
//
// A frame this link does not accept is refused whole. Nothing of its text is kept, because a
// frame's content can hold names from Ring, and JSON's and zod's errors quote what they read
// (FR-034).
import { z } from "zod";

/** The link protocol version this build speaks: N (FR-046). */
export const LINK_PROTOCOL_VERSION = 1;

const FIRST_LINK_VERSION = 1;

/**
 * True for a version a receiver accepts: N, or N-1 once there is one (FR-046, IA D2). Iteration
 * 001 has only version 1, so the N-1 case starts to matter with the first version bump (PT-07).
 */
export function isAcceptedLinkVersion(version: number): boolean {
  return (
    Number.isSafeInteger(version) &&
    version >= FIRST_LINK_VERSION &&
    (version === LINK_PROTOCOL_VERSION || version === LINK_PROTOCOL_VERSION - 1)
  );
}

/**
 * The largest frame either end sends or accepts, in bytes (derived): a full home snapshot of a
 * few hundred entries is well under 200 KB, and a media chunk's size is set below this in
 * iteration 003 (PT-08). It also bounds what an unauthenticated peer can make the core read.
 */
export const MAX_FRAME_BYTES = 1_048_576;

/** A frame's type name: lower-case letters, digits and `_`, starting with a letter. */
const TYPE_NAME = /^[a-z][a-z0-9_]{0,63}$/;
const HEADER_LENGTH_BYTES = 4;

/** A message: a type name and a JSON body, which the receiver parses. */
export interface LinkMessage {
  readonly type: string;
  readonly body: unknown;
}

/** A chunk of bytes, with a small JSON header the sender defines. Chunks go after messages. */
export interface LinkChunk {
  readonly type: string;
  readonly header: unknown;
  readonly bytes: Uint8Array;
}

/** A frame as received. */
export type LinkFrame =
  | ({ readonly kind: "message" } & LinkMessage)
  | ({ readonly kind: "chunk" } & LinkChunk);

/** A frame ready for the wire: its bytes, and whether it goes as a binary frame. */
export interface WireFrame {
  readonly data: Uint8Array;
  readonly isBinary: boolean;
}

const messageEnvelope = z.strictObject({
  type: z.string().regex(TYPE_NAME),
  body: z.unknown(),
});

const chunkEnvelope = z.strictObject({
  type: z.string().regex(TYPE_NAME),
  header: z.unknown(),
});

const textDecoder = new TextDecoder("utf-8", { fatal: true });

/**
 * A message as a text frame. Throws `RangeError` for a type name the link does not allow, or a
 * frame over `MAX_FRAME_BYTES`; the body must be JSON data.
 */
export function encodeMessage(message: LinkMessage): WireFrame {
  assertTypeName(message.type);
  const data = Buffer.from(
    JSON.stringify({ type: message.type, body: message.body }),
    "utf8",
  );
  assertFrameSize(data.length);
  return { data, isBinary: false };
}

/** A chunk as a binary frame. Throws `RangeError` as `encodeMessage` does. */
export function encodeChunk(chunk: LinkChunk): WireFrame {
  assertTypeName(chunk.type);
  const header = Buffer.from(
    JSON.stringify({ type: chunk.type, header: chunk.header }),
    "utf8",
  );
  const size = HEADER_LENGTH_BYTES + header.length + chunk.bytes.length;
  assertFrameSize(size);
  const data = Buffer.alloc(size);
  data.writeUInt32BE(header.length, 0);
  header.copy(data, HEADER_LENGTH_BYTES);
  data.set(chunk.bytes, HEADER_LENGTH_BYTES + header.length);
  return { data, isBinary: true };
}

/** A received frame, or `undefined` for one this link does not accept. */
export function decodeFrame(
  data: Uint8Array,
  isBinary: boolean,
): LinkFrame | undefined {
  if (data.length > MAX_FRAME_BYTES) {
    return undefined;
  }
  return isBinary ? decodeChunk(data) : decodeMessage(data);
}

function decodeMessage(data: Uint8Array): LinkFrame | undefined {
  const parsed = messageEnvelope.safeParse(parseJson(data));
  if (!parsed.success) {
    return undefined;
  }
  return { kind: "message", type: parsed.data.type, body: parsed.data.body };
}

function decodeChunk(data: Uint8Array): LinkFrame | undefined {
  if (data.length < HEADER_LENGTH_BYTES) {
    return undefined;
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const headerEnd = HEADER_LENGTH_BYTES + view.getUint32(0);
  if (headerEnd > data.length) {
    return undefined;
  }
  const parsed = chunkEnvelope.safeParse(
    parseJson(data.subarray(HEADER_LENGTH_BYTES, headerEnd)),
  );
  if (!parsed.success) {
    return undefined;
  }
  return {
    kind: "chunk",
    type: parsed.data.type,
    header: parsed.data.header,
    // A copy: a Buffer's slice would share the frame's memory.
    bytes: new Uint8Array(data.subarray(headerEnd)),
  };
}

// No cause and no excerpt: JSON's error quotes the text it read.
function parseJson(data: Uint8Array): unknown {
  try {
    return JSON.parse(textDecoder.decode(data)) as unknown;
  } catch {
    return undefined;
  }
}

function assertTypeName(type: string): void {
  if (!TYPE_NAME.test(type)) {
    throw new RangeError(
      "A frame's type name must be lower-case letters, digits and _.",
    );
  }
}

function assertFrameSize(size: number): void {
  if (size > MAX_FRAME_BYTES) {
    throw new RangeError("The frame is larger than the link allows.");
  }
}
