// Reading JSON Schema documents as plain JSON, for the contract checks (T011).

/** One node of a JSON Schema document. */
export type SchemaNode = Readonly<Record<string, unknown>>;

/** Whether `value` is a JSON object (a schema node), not an array or a primitive. */
export function isSchemaNode(value: unknown): value is SchemaNode {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The named children of `node[keyword]` (`properties`, `$defs`), or none. */
export function childrenOf(
  node: SchemaNode,
  keyword: string,
): readonly (readonly [string, SchemaNode])[] {
  const children = node[keyword];
  if (!isSchemaNode(children)) {
    return [];
  }
  return Object.entries(children).filter(
    (entry): entry is [string, SchemaNode] => isSchemaNode(entry[1]),
  );
}

/** `node[keyword]` as a list of strings (`required`, `enum`), or empty. */
export function stringsOf(
  node: SchemaNode,
  keyword: string,
): readonly string[] {
  const value = node[keyword];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

/** A JSON Pointer fragment for a child of `path`. */
export function pointer(path: string, ...segments: readonly string[]): string {
  return [path, ...segments].join("/");
}
