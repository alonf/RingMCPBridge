// The flat-schema check (T011): each kind of input it must reject.
import { describe, expect, it } from "vitest";
import { findNonFlatInputs } from "./flat-inputs.ts";
import type { SchemaNode } from "./schema-node.ts";

function inputs(tool: SchemaNode): SchemaNode {
  return { $defs: { t: tool } };
}

function fields(properties: SchemaNode, extra: SchemaNode = {}): SchemaNode {
  return inputs({
    type: "object",
    properties,
    additionalProperties: false,
    ...extra,
  });
}

describe("findNonFlatInputs", () => {
  it("passes string, integer and boolean fields, enums and optional fields", () => {
    const document = fields(
      {
        a: { type: "string", minLength: 1 },
        b: { type: "integer", minimum: 0 },
        c: { type: "boolean" },
        d: { type: "string", enum: ["x", "y"] },
      },
      { required: ["a"] },
    );
    expect(findNonFlatInputs(document)).toEqual([]);
  });

  it("rejects each combinator, conditional and dependency keyword", () => {
    const document = fields(
      {
        a: { anyOf: [{ type: "string" }, { type: "integer" }], type: "string" },
      },
      {
        oneOf: [],
        allOf: [],
        not: {},
        if: {},
        then: {},
        else: {},
        dependentRequired: {},
        dependentSchemas: {},
      },
    );
    expect(findNonFlatInputs(document)).toEqual([
      "#/$defs/t: oneOf",
      "#/$defs/t: allOf",
      "#/$defs/t: not",
      "#/$defs/t: if",
      "#/$defs/t: then",
      "#/$defs/t: else",
      "#/$defs/t: dependentRequired",
      "#/$defs/t: dependentSchemas",
      "#/$defs/t/properties/a: anyOf",
    ]);
  });

  it("rejects every nullable form", () => {
    const document = fields({
      a: { type: ["string", "null"] },
      b: { type: "string", nullable: true },
      c: { type: "string", enum: ["x", null] },
      d: { type: "string", const: null },
    });
    expect(findNonFlatInputs(document)).toEqual([
      "#/$defs/t/properties/a: not a string, integer or boolean field",
      "#/$defs/t/properties/a: a nullable type",
      "#/$defs/t/properties/b: a nullable type",
      "#/$defs/t/properties/c: a nullable type",
      "#/$defs/t/properties/d: a nullable type",
    ]);
    expect(findNonFlatInputs(fields({ e: { type: "null" } }))).toEqual([
      "#/$defs/t/properties/e: not a string, integer or boolean field",
      "#/$defs/t/properties/e: a nullable type",
    ]);
  });

  it("rejects nested objects, arrays and numbers as fields", () => {
    const document = fields({
      a: { type: "object", properties: {} },
      b: { type: "array", items: { type: "string" } },
      c: { type: "number" },
    });
    expect(findNonFlatInputs(document)).toEqual([
      "#/$defs/t/properties/a: not a string, integer or boolean field",
      "#/$defs/t/properties/b: not a string, integer or boolean field",
      "#/$defs/t/properties/c: not a string, integer or boolean field",
    ]);
  });

  it("takes a field named like a keyword as a field", () => {
    const document = fields({
      not: { type: "string" },
      if: { type: "boolean" },
    });
    expect(findNonFlatInputs(document)).toEqual([]);
  });

  it("rejects an input that is not an object", () => {
    expect(findNonFlatInputs(inputs({ type: "string" }))).toEqual([
      "#/$defs/t: not an object",
    ]);
  });
});
