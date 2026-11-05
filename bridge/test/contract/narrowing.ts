// The removal-or-narrowing check behind the schema snapshot test (T011; FR-046, IA D2). It compares
// a published document with the current one and lists every change that can break an agent built
// against the published one. Additive change means the opposite for the two directions:
//   - input (what agents send): an agent's old call must still be accepted. A removed field, a
//     field that became required, a removed enum value, a tighter bound or format, or unknown
//     fields becoming rejected all fail. Looser inputs pass.
//   - output (what the bridge returns): what an agent relied on must still hold. A removed field, a
//     field that became optional, a removed enum value, or a looser bound or format all fail. New
//     fields and new enum values pass: the contract adds both (FR-046; contracts/errors.md).
// Any other change to a keyword the check does not know fails, so nothing changes unseen.
// Prose (`title`, `description`) and the untrusted mark are not compared here; the marking check
// covers the mark.
import { isDeepStrictEqual } from "node:util";
import type { ContractDirection } from "../../src/contract/index.ts";
import { childrenOf, isSchemaNode, pointer, stringsOf } from "./schema-node.ts";
import type { SchemaNode } from "./schema-node.ts";

/** A change that removes or narrows part of a published document. */
export interface Narrowing {
  /** Where, as a JSON Pointer fragment into the published document. */
  readonly path: string;
  readonly change: string;
}

interface Comparison {
  readonly published: SchemaNode;
  readonly current: SchemaNode;
  readonly path: string;
  readonly direction: ContractDirection;
  /** Reports a change at this node. */
  readonly report: (change: string) => void;
  /** Reports a change at a field below this node. */
  readonly reportAt: (path: string, change: string) => void;
  readonly compare: (
    published: unknown,
    current: unknown,
    path: string,
  ) => void;
}

type KeywordRule = (comparison: Comparison, keyword: string) => void;

const IGNORED: ReadonlySet<string> = new Set([
  "$schema",
  "$id",
  "title",
  "description",
  "examples",
  "deprecated",
  "default",
  "x-untrusted",
]);

const LOWER_BOUNDS = [
  "minLength",
  "minimum",
  "exclusiveMinimum",
  "minItems",
  "minProperties",
];
const UPPER_BOUNDS = [
  "maxLength",
  "maximum",
  "exclusiveMaximum",
  "maxItems",
  "maxProperties",
];

function numberAt(node: SchemaNode, keyword: string): number | undefined {
  const value = node[keyword];
  return typeof value === "number" ? value : undefined;
}

const namedChildren: KeywordRule = (comparison, keyword) => {
  const current = new Map(childrenOf(comparison.current, keyword));
  for (const [name, published] of childrenOf(comparison.published, keyword)) {
    const path = pointer(comparison.path, keyword, name);
    const now = current.get(name);
    if (now === undefined) {
      comparison.reportAt(path, "removed");
    } else {
      comparison.compare(published, now, path);
    }
  }
};

const required: KeywordRule = (comparison) => {
  const published = new Set(stringsOf(comparison.published, "required"));
  const current = new Set(stringsOf(comparison.current, "required"));
  const present = new Set(
    childrenOf(comparison.current, "properties").map(([name]) => name),
  );
  const at = (name: string): string =>
    pointer(comparison.path, "properties", name);
  if (comparison.direction === "input") {
    const added = [...current].filter((name) => !published.has(name));
    added.forEach((name) => {
      comparison.reportAt(at(name), "became required");
    });
    return;
  }
  // A removed field is reported once, as removed.
  const dropped = [...published].filter(
    (name) => !current.has(name) && present.has(name),
  );
  dropped.forEach((name) => {
    comparison.reportAt(at(name), "no longer always present");
  });
};

const enumValues: KeywordRule = (comparison) => {
  const current = comparison.current.enum;
  const values = Array.isArray(current) ? current : [];
  const published = comparison.published.enum;
  for (const value of Array.isArray(published) ? published : []) {
    if (!values.some((now) => isDeepStrictEqual(now, value))) {
      comparison.report(`enum value ${JSON.stringify(value)} was removed`);
    }
  }
};

// A tighter bound narrows an input; a looser (or dropped) bound breaks an output's promise.
function boundRule(
  tighter: (published: number, current: number) => boolean,
): KeywordRule {
  return (comparison, keyword) => {
    const published = numberAt(comparison.published, keyword);
    const current = numberAt(comparison.current, keyword);
    if (comparison.direction === "input") {
      if (
        current !== undefined &&
        (published === undefined || tighter(published, current))
      ) {
        comparison.report(`${keyword} tightened to ${String(current)}`);
      }
      return;
    }
    if (
      published !== undefined &&
      (current === undefined || tighter(current, published))
    ) {
      comparison.report(`${keyword} loosened from ${String(published)}`);
    }
  };
}

// A new or changed format (or pattern) narrows an input; a dropped or changed one breaks an output.
const constraint: KeywordRule = (comparison, keyword) => {
  const published = comparison.published[keyword];
  const current = comparison.current[keyword];
  if (isDeepStrictEqual(published, current)) {
    return;
  }
  // The side whose constraint an agent depends on: the new one for inputs, the old one for outputs.
  const relied = comparison.direction === "input" ? current : published;
  if (relied !== undefined) {
    comparison.report(`${keyword} changed`);
  }
};

// zod writes a date-time format's regular expression as `pattern`; while the format holds, a new
// zod rendering of the same format is not a contract change.
const pattern: KeywordRule = (comparison, keyword) => {
  const format = comparison.published.format;
  if (
    format !== undefined &&
    isDeepStrictEqual(format, comparison.current.format)
  ) {
    return;
  }
  constraint(comparison, keyword);
};

const additionalProperties: KeywordRule = (comparison, keyword) => {
  const published = comparison.published[keyword];
  const current = comparison.current[keyword];
  if (isSchemaNode(published) && isSchemaNode(current)) {
    comparison.compare(published, current, pointer(comparison.path, keyword));
    return;
  }
  if (
    comparison.direction === "input" &&
    current === false &&
    published !== false
  ) {
    comparison.report("unknown fields became rejected");
  }
};

const subschema: KeywordRule = (comparison, keyword) => {
  comparison.compare(
    comparison.published[keyword],
    comparison.current[keyword],
    pointer(comparison.path, keyword),
  );
};

const unchanged: KeywordRule = (comparison, keyword) => {
  if (
    !isDeepStrictEqual(
      comparison.published[keyword],
      comparison.current[keyword],
    )
  ) {
    comparison.report(`${keyword} changed`);
  }
};

const RULES: ReadonlyMap<string, KeywordRule> = new Map<string, KeywordRule>([
  ["properties", namedChildren],
  ["$defs", namedChildren],
  ["required", required],
  ["enum", enumValues],
  ["format", constraint],
  ["pattern", pattern],
  ["additionalProperties", additionalProperties],
  ["items", subschema],
  ["propertyNames", subschema],
  ...LOWER_BOUNDS.map((keyword): [string, KeywordRule] => [
    keyword,
    boundRule((published, current) => current > published),
  ]),
  ...UPPER_BOUNDS.map((keyword): [string, KeywordRule] => [
    keyword,
    boundRule((published, current) => current < published),
  ]),
]);

/**
 * Every removal or narrowing from `published` to `current`, for a document of the given
 * direction. Empty when `current` only adds.
 */
export function findNarrowing(
  published: unknown,
  current: unknown,
  direction: ContractDirection,
): readonly Narrowing[] {
  const found: Narrowing[] = [];
  const compare = (before: unknown, now: unknown, path: string): void => {
    if (!isSchemaNode(before) || !isSchemaNode(now)) {
      if (!isDeepStrictEqual(before, now)) {
        found.push({ path, change: "changed" });
      }
      return;
    }
    const comparison: Comparison = {
      published: before,
      current: now,
      path,
      direction,
      report: (change) => found.push({ path, change }),
      reportAt: (at, change) => found.push({ path: at, change }),
      compare,
    };
    const keywords = new Set([...Object.keys(before), ...Object.keys(now)]);
    for (const keyword of keywords) {
      if (!IGNORED.has(keyword)) {
        (RULES.get(keyword) ?? unchanged)(comparison, keyword);
      }
    }
  };
  compare(published, current, "#");
  return found;
}
