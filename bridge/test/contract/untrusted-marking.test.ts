// The untrusted-marking check (T011): which fields it requires to be marked, and how.
import { describe, expect, it } from "vitest";
import type { SchemaNode } from "./schema-node.ts";
import { findMarkingProblems } from "./untrusted-marking.ts";

const BRIDGE_TEXT: ReadonlySet<string> = new Set(["id"]);
const marked = {
  type: "string",
  description: "UNTRUSTED. A name.",
  "x-untrusted": true,
};

function reply(properties: SchemaNode): SchemaNode {
  return { $defs: { t: { type: "object", properties } } };
}

describe("findMarkingProblems", () => {
  it("passes marked Ring text, bridge-written ids and constrained strings", () => {
    const document = reply({
      name: marked,
      id: { type: "string", minLength: 1 },
      mode: { type: "string", enum: ["a"] },
      kind: { type: "string", const: "a" },
      at: { type: "string", format: "date-time" },
      count: { type: "integer" },
      closed: { type: "object", properties: {}, additionalProperties: false },
    });
    expect(findMarkingProblems(document, BRIDGE_TEXT)).toEqual([]);
  });

  it("fails free text that is not marked", () => {
    expect(
      findMarkingProblems(reply({ name: { type: "string" } }), BRIDGE_TEXT),
    ).toEqual(["#/$defs/t/properties/name: text that is not marked untrusted"]);
  });

  it("fails an open object that is not marked, and passes a marked one", () => {
    const open = { type: "object", additionalProperties: {} };
    expect(findMarkingProblems(reply({ state: open }), BRIDGE_TEXT)).toEqual([
      "#/$defs/t/properties/state: text that is not marked untrusted",
    ]);
    expect(
      findMarkingProblems(
        reply({ state: { type: "object", additionalProperties: true } }),
        BRIDGE_TEXT,
      ),
    ).toHaveLength(1);
    const markedOpen = {
      ...open,
      description: "UNTRUSTED. State.",
      "x-untrusted": true,
    };
    expect(
      findMarkingProblems(reply({ state: markedOpen }), BRIDGE_TEXT),
    ).toEqual([]);
  });

  it("fails a marked field whose description does not start with UNTRUSTED.", () => {
    const quiet = {
      type: "string",
      description: "A name.",
      "x-untrusted": true,
    };
    const silent = { type: "string", "x-untrusted": true };
    expect(
      findMarkingProblems(reply({ a: quiet, b: silent }), BRIDGE_TEXT),
    ).toEqual([
      "#/$defs/t/properties/a: marked untrusted, but its description does not say so",
      "#/$defs/t/properties/b: marked untrusted, but its description does not say so",
    ]);
  });

  it("looks inside nested objects and array items", () => {
    const document = reply({
      devices: {
        type: "array",
        items: { type: "object", properties: { room: { type: "string" } } },
      },
      rooms: { type: "array", items: { type: "string" } },
    });
    expect(findMarkingProblems(document, BRIDGE_TEXT)).toEqual([
      "#/$defs/t/properties/devices/items/properties/room: text that is not marked untrusted",
      "#/$defs/t/properties/rooms/items: text that is not marked untrusted",
    ]);
  });

  it("checks a document with no $defs from its root", () => {
    const document = {
      type: "object",
      properties: { note: { type: "string" } },
    };
    expect(findMarkingProblems(document, BRIDGE_TEXT)).toEqual([
      "#/properties/note: text that is not marked untrusted",
    ]);
  });
});
