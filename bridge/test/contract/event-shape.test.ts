// The event shape (T041) against the plan's contracts/events.schema.json: the same fields, the
// same required ones, the same types, enumerations and untrusted marks, at every level. Prose is
// not compared: the plan's descriptions carry its [P] marks and source references. Also what the
// shape accepts and refuses.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  contractDocuments,
  EVENTS_RECOVERED_KIND,
  eventShape,
  UNTRUSTED_KEYWORD,
} from "../../src/contract/index.ts";
import { childrenOf, isSchemaNode, stringsOf } from "./schema-node.ts";
import type { SchemaNode } from "./schema-node.ts";

const PLANNED_EVENT = fileURLToPath(
  new URL(
    "../../../specs/001-ring-mcp-bridge/contracts/events.schema.json",
    import.meta.url,
  ),
);

/** What is compared of one field: its structure, without prose. */
interface FieldFacts {
  readonly type: unknown;
  readonly format: unknown;
  readonly enum: readonly string[];
  readonly const: unknown;
  readonly minimum: unknown;
  readonly minLength: unknown;
  readonly untrusted: boolean;
  readonly required: readonly string[];
  readonly fields: Readonly<Record<string, FieldFacts>>;
}

// A `$ref` into the document's own `$defs`, followed; the referring node's own keywords win.
function resolved(node: SchemaNode, root: SchemaNode): SchemaNode {
  const reference = node.$ref;
  if (typeof reference !== "string") {
    return node;
  }
  const name = reference.replace("#/$defs/", "");
  const target = new Map(childrenOf(root, "$defs")).get(name) ?? {};
  return { ...target, ...node };
}

function factsOf(node: SchemaNode, root: SchemaNode): FieldFacts {
  const schema = resolved(node, root);
  return {
    type: schema.type,
    format: schema.format,
    enum: stringsOf(schema, "enum"),
    const: schema.const,
    minimum: schema.minimum,
    minLength: schema.minLength,
    untrusted: schema[UNTRUSTED_KEYWORD] === true,
    required: [...stringsOf(schema, "required")].sort(),
    fields: Object.fromEntries(
      childrenOf(schema, "properties").map(([name, child]) => [
        name,
        factsOf(child, root),
      ]),
    ),
  };
}

function published(): SchemaNode {
  const document = contractDocuments().find(
    (candidate) => candidate.fileName === "event.schema.json",
  );
  if (document === undefined) {
    throw new Error("The event document is not published.");
  }
  return document.schema;
}

function event(changes: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    event_id: "evt_1",
    seq: 1,
    location_id: "loc-1",
    priority: "HIGH",
    kind: "doorbell.ding",
    occurred_at: "2026-11-17T09:00:00Z",
    received_at: "2026-11-17T09:00:01.250Z",
    summary: "Someone rang the front door.",
    ...changes,
  };
}

describe("the event shape", () => {
  it("has the plan's fields, types, required fields and untrusted marks (contracts/events.schema.json)", () => {
    const planned: unknown = JSON.parse(readFileSync(PLANNED_EVENT, "utf8"));
    if (!isSchemaNode(planned)) {
      throw new Error("The plan's event schema is not an object.");
    }
    const ours = published();

    expect(factsOf(ours, ours)).toEqual(factsOf(planned, planned));
  });

  it("accepts an event with only the required fields, and one with every field", () => {
    expect(eventShape.safeParse(event()).success).toBe(true);
    expect(
      eventShape.safeParse(
        event({
          occurred_at_local: "2026-11-17T11:00:00+02:00",
          received_at_local: "2026-11-17T11:00:01.250+02:00",
          device: { id: "dev-1", name: "דלת כניסה", room: "Hall" },
          frame: {
            uri: "https://core.example.test/media/m-1",
            mime_type: "image/jpeg",
            media_id: "m-1",
          },
          late: true,
          kind: "ring.other",
          ring_kind: "new_ring_thing",
        }),
      ).success,
    ).toBe(true);
  });

  it.each([
    ["no event id", { event_id: "" }],
    ["a seq of zero", { seq: 0 }],
    ["a priority outside the three", { priority: "URGENT" }],
    ["a time without Z", { occurred_at: "2026-11-17T09:00:00+02:00" }],
    ["an empty summary", { summary: "" }],
    [
      "a frame that is not a JPEG",
      { frame: { uri: "https://x.example.test/f", mime_type: "image/png" } },
    ],
  ])("refuses %s", (_title, change) => {
    expect(eventShape.safeParse(event(change)).success).toBe(false);
  });

  it("requires the recovery summary on the events-recovered event, and only there", () => {
    const recovered = {
      count: 3,
      oldest_at: "2026-11-17T06:00:00Z",
      newest_at: "2026-11-17T08:30:00Z",
      seq_from: 10,
      seq_to: 12,
    };

    expect(
      eventShape.safeParse(event({ kind: EVENTS_RECOVERED_KIND })).success,
    ).toBe(false);
    expect(
      eventShape.safeParse(event({ kind: EVENTS_RECOVERED_KIND, recovered }))
        .success,
    ).toBe(true);
    expect(eventShape.safeParse(event()).success).toBe(true);
  });
});
