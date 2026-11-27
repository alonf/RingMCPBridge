// The untrusted-marking check (T011; FR-033, contracts/mcp-tools.md "Untrusted content"). In an
// output document, every field that can carry Ring's text is marked: free text (a string with no
// enum, const or format) and open objects (a record) carry `x-untrusted: true`, unless the field's
// name is one the bridge writes itself, such as an id. Every marked field's description starts
// with "UNTRUSTED.".
import {
  UNTRUSTED_KEYWORD,
  UNTRUSTED_PREFIX,
} from "../../src/contract/index.ts";
import { childrenOf, isSchemaNode, pointer } from "./schema-node.ts";
import type { SchemaNode } from "./schema-node.ts";

function isFreeText(node: SchemaNode): boolean {
  return (
    node.type === "string" &&
    !("enum" in node) &&
    !("const" in node) &&
    !("format" in node)
  );
}

function isOpenObject(node: SchemaNode): boolean {
  const extra = node.additionalProperties;
  return node.type === "object" && (extra === true || isSchemaNode(extra));
}

function fieldProblems(
  name: string,
  node: SchemaNode,
  path: string,
  bridgeText: ReadonlySet<string>,
): readonly string[] {
  if (node[UNTRUSTED_KEYWORD] === true) {
    const description = node.description;
    return typeof description === "string" &&
      description.startsWith(UNTRUSTED_PREFIX)
      ? []
      : [`${path}: marked untrusted, but its description does not say so`];
  }
  const carriesText = isFreeText(node) || isOpenObject(node);
  return carriesText && !bridgeText.has(name)
    ? [`${path}: text that is not marked untrusted`]
    : [];
}

function walk(
  name: string,
  node: SchemaNode,
  path: string,
  bridgeText: ReadonlySet<string>,
): readonly string[] {
  const items = node.items;
  return [
    ...fieldProblems(name, node, path, bridgeText),
    ...childrenOf(node, "properties").flatMap(([child, schema]) =>
      walk(child, schema, pointer(path, "properties", child), bridgeText),
    ),
    ...(isSchemaNode(items)
      ? walk(name, items, pointer(path, "items"), bridgeText)
      : []),
  ];
}

/**
 * What breaks the marking rule in an output document, one line per problem. `bridgeText` names
 * the fields whose text the bridge writes (ids, its own messages), which need no mark.
 */
export function findMarkingProblems(
  document: SchemaNode,
  bridgeText: ReadonlySet<string>,
): readonly string[] {
  const definitions = childrenOf(document, "$defs");
  if (definitions.length === 0) {
    return walk("", document, "#", bridgeText);
  }
  return definitions.flatMap(([name, schema]) =>
    walk(name, schema, pointer("#/$defs", name), bridgeText),
  );
}
