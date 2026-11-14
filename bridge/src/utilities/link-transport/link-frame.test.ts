// Link frames (T015): the protocol version check, both frame kinds on the wire, and the refusal of
// any frame the link does not accept, keeping nothing of it.
import { describe, expect, it } from "vitest";
import {
  decodeFrame,
  encodeChunk,
  encodeMessage,
  isAcceptedLinkVersion,
  LINK_PROTOCOL_VERSION,
  MAX_FRAME_BYTES,
} from "./link-frame.ts";

const RING_NAME = "דלת כניסה";

function text(value: string): Uint8Array {
  return Buffer.from(value, "utf8");
}

function binary(headerJson: string, bytes: readonly number[]): Uint8Array {
  const header = Buffer.from(headerJson, "utf8");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(header.length, 0);
  return Buffer.concat([length, header, Buffer.from(bytes)]);
}

describe("the link protocol version", () => {
  it("is 1, and a receiver accepts only it until there is an N-1", () => {
    expect(LINK_PROTOCOL_VERSION).toBe(1);
    expect(isAcceptedLinkVersion(1)).toBe(true);
    for (const version of [0, 2, -1, 1.5, Number.NaN]) {
      expect(isAcceptedLinkVersion(version)).toBe(false);
    }
  });
});

describe("messages", () => {
  it("go as text frames and come back with the same type and body, names kept exactly", () => {
    const body = {
      name: RING_NAME,
      list: [1, "two", null],
      nested: { a: true },
    };
    const wire = encodeMessage({ type: "some_message", body });
    expect(wire.isBinary).toBe(false);
    expect(decodeFrame(wire.data, wire.isBinary)).toEqual({
      kind: "message",
      type: "some_message",
      body,
    });
  });

  it("refuses a type name the link does not allow, and a frame over the limit", () => {
    for (const type of [
      "",
      "Upper",
      "has space",
      "9starts_with_digit",
      "a".repeat(65),
    ]) {
      expect(() => encodeMessage({ type, body: {} })).toThrow(RangeError);
    }
    expect(() =>
      encodeMessage({ type: "big", body: "x".repeat(MAX_FRAME_BYTES) }),
    ).toThrow(RangeError);
  });
});

describe("chunks", () => {
  it("go as binary frames and come back with the same header and bytes", () => {
    const bytes = Uint8Array.from([0, 1, 2, 250, 255]);
    const wire = encodeChunk({
      type: "some_chunk",
      header: { part: 3 },
      bytes,
    });
    expect(wire.isBinary).toBe(true);
    const frame = decodeFrame(wire.data, wire.isBinary);
    expect(frame).toEqual({
      kind: "chunk",
      type: "some_chunk",
      header: { part: 3 },
      bytes,
    });
  });

  it("hands over its own copy of the bytes", () => {
    const wire = encodeChunk({
      type: "c",
      header: null,
      bytes: Uint8Array.from([7]),
    });
    const frame = decodeFrame(wire.data, true);
    (wire.data as Buffer).fill(0);
    expect(frame?.kind === "chunk" ? [...frame.bytes] : []).toEqual([7]);
  });

  it("refuses a chunk over the limit", () => {
    expect(() =>
      encodeChunk({
        type: "c",
        header: {},
        bytes: new Uint8Array(MAX_FRAME_BYTES),
      }),
    ).toThrow(RangeError);
  });
});

describe("a frame the link does not accept", () => {
  const refused: readonly [string, Uint8Array, boolean][] = [
    ["text that is not JSON", text(`{"type":"m","body":"${RING_NAME}`), false],
    ["text that is not UTF-8", Uint8Array.from([0xff, 0xfe]), false],
    ["a JSON array", text("[1,2]"), false],
    ["no type", text(`{"body":"${RING_NAME}"}`), false],
    [
      "a type the link does not allow",
      text(`{"type":"Bad Type","body":{}}`),
      false,
    ],
    ["an extra envelope field", text(`{"type":"m","body":{},"x":1}`), false],
    ["a binary frame shorter than its length", Uint8Array.from([0, 0]), true],
    [
      "a header longer than the frame",
      Uint8Array.from([0, 0, 0, 99, 123]),
      true,
    ],
    [
      "a header that is not JSON",
      binary(`{"type":"c","header":"${RING_NAME}`, []),
      true,
    ],
    ["a header without a type", binary(`{"header":{}}`, [1]), true],
    ["a frame over the limit", new Uint8Array(MAX_FRAME_BYTES + 1), false],
  ];

  it.each(refused)("is refused: %s", (_case, data, isBinary) => {
    expect(decodeFrame(data, isBinary)).toBeUndefined();
  });
});
