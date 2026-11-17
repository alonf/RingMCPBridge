// A push payload's shape (T038 part 2): field names and value types only, never a value, with
// id-like field names hidden, arrays as their distinct item shapes, and a depth limit.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MAX_ITEM_SHAPES, MAX_SHAPE_DEPTH, shapeOf } from "./index.ts";

function dingFixture(): unknown {
  const file = new URL(
    "../../../../test/fixtures/ring/push-ding-v2.synthetic.json",
    import.meta.url,
  );
  return JSON.parse(readFileSync(file, "utf8"));
}

describe("a push payload's shape", () => {
  it("keeps field names and value types, and no value", () => {
    const payload = {
      name: "Front Door",
      at: 1_763_370_000,
      armed: true,
      room: null,
      nested: { id: "7400000000000000001" },
    };

    expect(shapeOf(payload)).toEqual({
      armed: "boolean",
      at: "number",
      name: "string",
      nested: { id: "string" },
      room: "null",
    });
    const written = JSON.stringify(shapeOf(payload));
    expect(written).not.toContain("Front Door");
    expect(written).not.toContain("7400000000000000001");
  });

  it("carries none of the synthetic ding's values", () => {
    const written = JSON.stringify(shapeOf(dingFixture()));

    expect(written).not.toContain("Example Door");
    expect(written).not.toContain("7400000000000000001");
    expect(written).toContain('"category":"string"');
  });

  it("hides a field name that is not a plain identifier, keeping the first such field's shape", () => {
    expect(
      shapeOf({ "523456789": { open: true }, "front door": 1, plain: "x" }),
    ).toEqual({ "(key)": { open: "boolean" }, plain: "string" });
  });

  it("writes an array as its distinct item shapes, at most a few", () => {
    expect(shapeOf([1, 2, "a", { b: 1 }, null, true])).toHaveLength(
      MAX_ITEM_SHAPES,
    );
    expect(shapeOf([1, 2, 3])).toEqual(["number"]);
    expect(shapeOf([])).toEqual([]);
  });

  it("stops at the depth limit", () => {
    let deep: unknown = "bottom";
    for (let level = 0; level <= MAX_SHAPE_DEPTH + 2; level += 1) {
      deep = { next: deep };
    }

    expect(JSON.stringify(shapeOf(deep))).toContain("(deeper)");
    expect(JSON.stringify(shapeOf(deep))).not.toContain("bottom");
  });

  it("writes a value that is not JSON by its type", () => {
    expect(shapeOf(undefined)).toBe("undefined");
    expect(shapeOf("text")).toBe("string");
  });
});
