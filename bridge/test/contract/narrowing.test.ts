// The removal-or-narrowing check (T011): each rule, in both directions.
import { describe, expect, it } from "vitest";
import { findNarrowing } from "./narrowing.ts";
import type { SchemaNode } from "./schema-node.ts";

function tool(properties: SchemaNode, extra: SchemaNode = {}): SchemaNode {
  return { $defs: { t: { type: "object", properties, ...extra } } };
}

const text = { type: "string" };
const at = "#/$defs/t";

function changes(
  published: SchemaNode,
  current: SchemaNode,
  direction: "input" | "output",
): readonly string[] {
  return findNarrowing(published, current, direction).map(
    ({ path, change }) => `${path}: ${change}`,
  );
}

describe("findNarrowing on an input document", () => {
  it("passes an unchanged document", () => {
    const document = tool({ a: text }, { required: ["a"] });
    expect(changes(document, document, "input")).toEqual([]);
  });

  it("passes a new optional field", () => {
    expect(
      changes(tool({ a: text }), tool({ a: text, b: text }), "input"),
    ).toEqual([]);
  });

  it("fails a removed field and a removed tool", () => {
    expect(
      changes(tool({ a: text, b: text }), tool({ a: text }), "input"),
    ).toEqual([`${at}/properties/b: removed`]);
    expect(changes(tool({}), { $defs: {} }, "input")).toEqual([
      "#/$defs/t: removed",
    ]);
  });

  it("fails a field that became required, and a new required field", () => {
    expect(
      changes(
        tool({ a: text }),
        tool({ a: text, b: text }, { required: ["a", "b"] }),
        "input",
      ),
    ).toEqual([
      `${at}/properties/a: became required`,
      `${at}/properties/b: became required`,
    ]);
  });

  it("passes a field that became optional", () => {
    expect(
      changes(
        tool({ a: text }, { required: ["a"] }),
        tool({ a: text }),
        "input",
      ),
    ).toEqual([]);
  });

  it("fails a removed enum value and passes an added one", () => {
    const before = tool({ a: { type: "string", enum: ["x", "y"] } });
    expect(
      changes(before, tool({ a: { type: "string", enum: ["x"] } }), "input"),
    ).toEqual([`${at}/properties/a: enum value "y" was removed`]);
    expect(
      changes(
        before,
        tool({ a: { type: "string", enum: ["x", "y", "z"] } }),
        "input",
      ),
    ).toEqual([]);
  });

  it("fails a new enum on a field that took any value, and passes a dropped one", () => {
    const free = tool({ a: { type: "string", minLength: 1 } });
    const listed = tool({
      a: { type: "string", minLength: 1, enum: ["Kitchen"] },
    });
    expect(changes(free, listed, "input")).toEqual([
      `${at}/properties/a: enum added, so other values became rejected`,
    ]);
    expect(changes(listed, free, "input")).toEqual([]);
  });

  it("fails a tighter bound and passes a looser one", () => {
    const before = tool({ a: { type: "string", minLength: 1, maxLength: 10 } });
    expect(
      changes(
        before,
        tool({ a: { type: "string", minLength: 2, maxLength: 5 } }),
        "input",
      ),
    ).toEqual([
      `${at}/properties/a: minLength tightened to 2`,
      `${at}/properties/a: maxLength tightened to 5`,
    ]);
    expect(changes(before, tool({ a: { type: "string" } }), "input")).toEqual(
      [],
    );
    expect(
      changes(
        tool({ a: { type: "integer" } }),
        tool({ a: { type: "integer", minimum: 0 } }),
        "input",
      ),
    ).toEqual([`${at}/properties/a: minimum tightened to 0`]);
  });

  it("fails when unknown fields become rejected", () => {
    expect(
      changes(
        tool({ a: text }),
        tool({ a: text }, { additionalProperties: false }),
        "input",
      ),
    ).toEqual([`${at}: unknown fields became rejected`]);
    expect(
      changes(
        tool({ a: text }, { additionalProperties: false }),
        tool({ a: text }),
        "input",
      ),
    ).toEqual([]);
  });

  it("fails a new format and passes a dropped one", () => {
    const plain = tool({ a: text });
    const dated = tool({ a: { type: "string", format: "date-time" } });
    expect(changes(plain, dated, "input")).toEqual([
      `${at}/properties/a: format changed`,
    ]);
    expect(changes(dated, plain, "input")).toEqual([]);
  });

  it("fails any change to a keyword it does not know", () => {
    expect(
      changes(tool({ a: text }), tool({ a: { type: "integer" } }), "input"),
    ).toEqual([`${at}/properties/a: type changed`]);
    expect(
      changes(
        tool({ a: text }),
        tool({ a: { anyOf: [text, { type: "integer" }] } }),
        "input",
      ),
    ).toEqual([
      `${at}/properties/a: type changed`,
      `${at}/properties/a: anyOf changed`,
    ]);
  });
});

describe("findNarrowing on an output document", () => {
  it("passes a new field and a new enum value", () => {
    const before = tool(
      { a: { type: "string", enum: ["x"] } },
      { required: ["a"] },
    );
    const after = tool(
      { a: { type: "string", enum: ["x", "y"] }, b: text },
      { required: ["a", "b"] },
    );
    expect(changes(before, after, "output")).toEqual([]);
  });

  it("fails a removed field and a removed enum value", () => {
    const before = tool({ a: { type: "string", enum: ["x", "y"] }, b: text });
    const after = tool({ a: { type: "string", enum: ["x"] } });
    expect(changes(before, after, "output")).toEqual([
      `${at}/properties/a: enum value "y" was removed`,
      `${at}/properties/b: removed`,
    ]);
  });

  it("fails a dropped enum and passes a new one", () => {
    const free = tool({ a: text });
    const listed = tool({ a: { type: "string", enum: ["x", "y"] } });
    expect(changes(listed, free, "output")).toEqual([
      `${at}/properties/a: enum dropped, so any value can be returned`,
    ]);
    expect(changes(free, listed, "output")).toEqual([]);
  });

  it("fails a field that is no longer always present, once", () => {
    const before = tool({ a: text, b: text }, { required: ["a", "b"] });
    expect(
      changes(
        before,
        tool({ a: text, b: text }, { required: ["b"] }),
        "output",
      ),
    ).toEqual([`${at}/properties/a: no longer always present`]);
    expect(
      changes(before, tool({ b: text }, { required: ["b"] }), "output"),
    ).toEqual([`${at}/properties/a: removed`]);
  });

  it("fails a looser or dropped bound and passes a tighter one", () => {
    const before = tool({ a: { type: "integer", minimum: 0, maximum: 100 } });
    expect(
      changes(
        before,
        tool({ a: { type: "integer", minimum: -1, maximum: 200 } }),
        "output",
      ),
    ).toEqual([
      `${at}/properties/a: minimum loosened from 0`,
      `${at}/properties/a: maximum loosened from 100`,
    ]);
    expect(changes(before, tool({ a: { type: "integer" } }), "output")).toEqual(
      [
        `${at}/properties/a: minimum loosened from 0`,
        `${at}/properties/a: maximum loosened from 100`,
      ],
    );
    expect(
      changes(
        before,
        tool({ a: { type: "integer", minimum: 1, maximum: 50 } }),
        "output",
      ),
    ).toEqual([]);
  });

  it("fails a dropped format and passes a new one", () => {
    const plain = tool({ a: text });
    const dated = tool({ a: { type: "string", format: "date-time" } });
    expect(changes(dated, plain, "output")).toEqual([
      `${at}/properties/a: format changed`,
    ]);
    expect(changes(plain, dated, "output")).toEqual([]);
  });

  it("ignores zod's new pattern for an unchanged format, but not a pattern alone", () => {
    const dated = (regex: string): SchemaNode =>
      tool({ a: { type: "string", format: "date-time", pattern: regex } });
    expect(changes(dated("^a$"), dated("^b$"), "output")).toEqual([]);
    const patterned = (regex: string): SchemaNode =>
      tool({ a: { type: "string", pattern: regex } });
    expect(changes(patterned("^a$"), patterned("^b$"), "output")).toEqual([
      `${at}/properties/a: pattern changed`,
    ]);
  });

  it("follows array items and record values", () => {
    const list = (item: SchemaNode): SchemaNode =>
      tool({
        a: { type: "array", items: { type: "object", properties: item } },
      });
    expect(
      changes(list({ x: text, y: text }), list({ x: text }), "output"),
    ).toEqual([`${at}/properties/a/items/properties/y: removed`]);
    const record = (value: SchemaNode): SchemaNode =>
      tool({ a: { type: "object", additionalProperties: value } });
    expect(
      changes(
        record({ type: "string" }),
        record({ type: "integer" }),
        "output",
      ),
    ).toEqual([`${at}/properties/a/additionalProperties: type changed`]);
    expect(
      changes(list({ x: text }), tool({ a: { type: "array" } }), "output"),
    ).toEqual([`${at}/properties/a/items: changed`]);
  });

  it("ignores prose and the untrusted mark", () => {
    const before = tool(
      { a: { type: "string", description: "x", "x-untrusted": true } },
      { title: "t" },
    );
    const after = tool(
      { a: { type: "string", description: "y" } },
      { title: "u" },
    );
    expect(changes(before, after, "output")).toEqual([]);
  });

  it("passes a record that becomes closed", () => {
    expect(
      changes(
        tool({ a: { type: "object", additionalProperties: {} } }),
        tool({ a: { type: "object", additionalProperties: false } }),
        "output",
      ),
    ).toEqual([]);
  });
});
