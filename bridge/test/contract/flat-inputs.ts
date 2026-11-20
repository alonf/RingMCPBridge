// The flat-schema check (T011; FR-048, contracts/mcp-tools.md "Flat inputs"): each tool input is
// an object of string, integer and boolean fields, enums and optional fields only, with no
// combinators, conditionals, dependencies or nullable types anywhere inside it.
import { childrenOf, isSchemaNode, pointer } from "./schema-node.ts";
import type { SchemaNode } from "./schema-node.ts";

const FORBIDDEN_KEYWORDS = [
  "anyOf",
  "oneOf",
  "allOf",
  "not",
  "if",
  "then",
  "else",
  "dependentRequired",
  "dependentSchemas",
] as const;

const NAMED_SCHEMAS: ReadonlySet<string> = new Set(["properties", "$defs"]);

const FLAT_TYPES: ReadonlySet<unknown> = new Set([
  "string",
  "integer",
  "boolean",
]);

function nullableReasons(node: SchemaNode): readonly string[] {
  const type = node.type;
  const nullType =
    type === "null" || (Array.isArray(type) && type.includes("null"));
  const nullValue =
    node.nullable === true ||
    node.const === null ||
    (Array.isArray(node.enum) && node.enum.includes(null));
  return nullType || nullValue ? ["a nullable type"] : [];
}

// Every keyword and nullable form the rule forbids, anywhere under `node`.
function forbiddenInside(node: SchemaNode, path: string): readonly string[] {
  const here = [
    ...FORBIDDEN_KEYWORDS.filter((keyword) => keyword in node).map(
      (keyword) => `${path}: ${keyword}`,
    ),
    ...nullableReasons(node).map((reason) => `${path}: ${reason}`),
  ];
  // `properties` and `$defs` map names to schemas, so a field named `not` is not the keyword.
  const below = Object.entries(node).flatMap(([key, value]) => {
    if (NAMED_SCHEMAS.has(key)) {
      return childrenOf(node, key).flatMap(([name, child]) =>
        forbiddenInside(child, pointer(path, key, name)),
      );
    }
    return isSchemaNode(value)
      ? forbiddenInside(value, pointer(path, key))
      : [];
  });
  return [...here, ...below];
}

function fieldProblems(tool: SchemaNode, path: string): readonly string[] {
  return childrenOf(tool, "properties")
    .filter(([, field]) => !FLAT_TYPES.has(field.type))
    .map(
      ([name]) =>
        `${pointer(path, "properties", name)}: not a string, integer or boolean field`,
    );
}

function toolProblems(tool: SchemaNode, path: string): readonly string[] {
  const shape = tool.type === "object" ? [] : [`${path}: not an object`];
  return [
    ...shape,
    ...fieldProblems(tool, path),
    ...forbiddenInside(tool, path),
  ];
}

/** What breaks the flat rule in a tool-inputs document, one line per problem. */
export function findNonFlatInputs(document: SchemaNode): readonly string[] {
  return childrenOf(document, "$defs").flatMap(([name, tool]) =>
    toolProblems(tool, pointer("#/$defs", name)),
  );
}
