// The Public Contract's checks (T011; FR-033, FR-046, FR-047, FR-048):
//   - the schema snapshot: `schemas/` holds exactly the generated documents, and a document may
//     change only by adding. The narrowing check runs before the file snapshot, so
//     `npm run schemas:generate` (vitest --update) cannot write a removal or a narrowing;
//   - the flat-schema check on every tool input;
//   - the untrusted-marking check on every output, and the closing sentence on every tool;
//   - the inputs match the plan's contracts/iteration-001-tools.schema.json.
// A document not yet published fails unless SCHEMAS_BOOTSTRAP=1 is set for the run that first
// writes it, so a deleted file cannot be regenerated past the narrowing check unseen. With
// SCHEMAS_BASE_DIRECTORY set to a copy of the base commit's `schemas/`, the documents are also
// checked against the base, so editing the committed files by hand cannot hide a narrowing.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  contractDocuments,
  TOOL_CATALOG,
  UNTRUSTED_TOOL_SENTENCE,
} from "../../src/contract/index.ts";
import type { ContractDocument } from "../../src/contract/index.ts";
import { findNonFlatInputs } from "./flat-inputs.ts";
import { findNarrowing } from "./narrowing.ts";
import { childrenOf, isSchemaNode } from "./schema-node.ts";
import type { SchemaNode } from "./schema-node.ts";
import { findMarkingProblems } from "./untrusted-marking.ts";

const SCHEMAS_DIRECTORY = fileURLToPath(
  new URL("../../../schemas/", import.meta.url),
);
const PLANNED_INPUTS = fileURLToPath(
  new URL(
    "../../../specs/001-ring-mcp-bridge/contracts/iteration-001-tools.schema.json",
    import.meta.url,
  ),
);
const BOOTSTRAP = process.env.SCHEMAS_BOOTSTRAP === "1";
const BASE_DIRECTORY = process.env.SCHEMAS_BASE_DIRECTORY;

/** Fields whose text the bridge writes itself: ids and its own error text. */
const BRIDGE_TEXT: ReadonlySet<string> = new Set([
  "id",
  "location_id",
  "device_id",
  "message",
  "details",
]);

/** The Ring-sourced fields contracts/mcp-tools.md lists, as tool and data path. */
const RING_SOURCED = [
  "get_overview location.name",
  "get_overview location.time_zone",
  "get_overview open_contacts.name",
  "get_overview open_contacts.room",
  "get_overview active_motion.device.name",
  "get_overview active_motion.device.room",
  "get_overview offline_devices.name",
  "get_overview offline_devices.room",
  "get_overview low_batteries.device.name",
  "get_overview low_batteries.device.room",
  "list_devices devices.name",
  "list_devices devices.room",
  "get_device device.name",
  "get_device device.room",
  "get_device device.state",
] as const;

const documents = contractDocuments();

function documentNamed(fileName: string): ContractDocument {
  const found = documents.find((document) => document.fileName === fileName);
  if (found === undefined) {
    throw new Error(`No document ${fileName}.`);
  }
  return found;
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

// One step down a data path: into a named property, through an array's items.
function step(
  node: SchemaNode | undefined,
  name: string,
): SchemaNode | undefined {
  const items = node?.items;
  const holder = node?.type === "array" && isSchemaNode(items) ? items : node;
  return holder === undefined
    ? undefined
    : new Map(childrenOf(holder, "properties")).get(name);
}

function dataField(tool: string, path: string): SchemaNode | undefined {
  const replies = documentNamed("tool-replies.schema.json").schema;
  const root = new Map(childrenOf(replies, "$defs")).get(tool);
  return ["data", ...path.split(".")].reduce<SchemaNode | undefined>(
    step,
    root,
  );
}

// The structure without prose, for comparing with the plan's file, whose prose carries [P] marks.
function withoutDescriptions(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(withoutDescriptions);
  }
  if (!isSchemaNode(value)) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== "description")
      .map(([key, child]) => [key, withoutDescriptions(child)]),
  );
}

describe("the published Public Contract", () => {
  it.each(documents)(
    "$fileName is current, and changes only by adding",
    async (document) => {
      const file = join(SCHEMAS_DIRECTORY, document.fileName);
      const published = existsSync(file) ? readJson(file) : undefined;
      if (published === undefined) {
        expect(
          BOOTSTRAP,
          `${document.fileName} is not published; set SCHEMAS_BOOTSTRAP=1 to publish a new document`,
        ).toBe(true);
      } else {
        expect(
          findNarrowing(published, document.schema, document.direction),
        ).toEqual([]);
      }
      await expect(
        `${JSON.stringify(document.schema, null, 2)}\n`,
      ).toMatchFileSnapshot(file);
    },
  );

  it("publishes no other document", () => {
    const names = new Set(documents.map((document) => document.fileName));
    const others = readdirSync(SCHEMAS_DIRECTORY).filter(
      (name) => !names.has(name),
    );
    expect(others).toEqual([]);
  });
});

// Against the base commit: CI's lint job extracts the base's `schemas/` (the pull request's base,
// or main's previous commit) into SCHEMAS_BASE_DIRECTORY, so a hand edit to the committed files
// cannot hide a narrowing. An empty directory means the base published nothing yet.
describe.runIf(BASE_DIRECTORY !== undefined)(
  "the Public Contract against the base commit",
  () => {
    const base = BASE_DIRECTORY ?? "";
    const published = (): readonly string[] =>
      readdirSync(base).filter((name) => name.endsWith(".json"));

    it.each(documents)(
      "$fileName changes only by adding since the base",
      (document) => {
        const file = join(base, document.fileName);
        if (existsSync(file)) {
          expect(
            findNarrowing(readJson(file), document.schema, document.direction),
          ).toEqual([]);
        }
      },
    );

    it("keeps every document the base published", () => {
      const names = new Set(documents.map((document) => document.fileName));
      expect(published().filter((name) => !names.has(name))).toEqual([]);
    });
  },
);

describe("the tool inputs", () => {
  const inputs = documentNamed("tool-inputs.schema.json");

  it("are flat", () => {
    expect(findNonFlatInputs(inputs.schema)).toEqual([]);
  });

  it("match the plan's iteration 001 inputs (contracts/iteration-001-tools.schema.json)", () => {
    const planned = readJson(PLANNED_INPUTS);
    expect(isSchemaNode(planned)).toBe(true);
    const published = new Map(childrenOf(inputs.schema, "$defs"));
    for (const [tool, schema] of childrenOf(planned as SchemaNode, "$defs")) {
      expect(withoutDescriptions(published.get(tool)), tool).toEqual(
        withoutDescriptions(schema),
      );
    }
  });
});

describe("untrusted content", () => {
  it.each(documents.filter((document) => document.direction === "output"))(
    "$fileName marks every field that can carry Ring's text",
    (document) => {
      expect(findMarkingProblems(document.schema, BRIDGE_TEXT)).toEqual([]);
    },
  );

  it.each(RING_SOURCED.map((entry) => entry.split(" ")))(
    "%s marks %s",
    (tool = "", path = "") => {
      expect(dataField(tool, path)).toMatchObject({ "x-untrusted": true });
    },
  );

  it.each(TOOL_CATALOG.map((tool) => [tool.name, tool.description]))(
    "%s's description ends with the untrusted-content sentence",
    (_name, description) => {
      expect(description.endsWith(` ${UNTRUSTED_TOOL_SENTENCE}`)).toBe(true);
    },
  );
});
