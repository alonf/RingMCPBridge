// A push payload's shape, for the push probe (T038 part 2): its field names and the JSON type of
// each value, never a value. It tells T042 (Normalize) which fields Ring's real pushes carry,
// without carrying a name, a time, an id or any text from Ring (FR-034).
//
// - A value becomes its type: "string", "number", "boolean" or "null".
// - An object keeps its field names, sorted. A name that is not a plain identifier (it could be an
//   id used as a key) is written as "(key)", and only the first such field's shape is kept.
// - An array becomes the distinct shapes of its items, at most `MAX_ITEM_SHAPES` of them.
// - Below `MAX_SHAPE_DEPTH` levels, a value is written as "(deeper)".

/** A payload's shape: a type name, the shapes of an array's items, or an object's fields. */
export type PayloadShape =
  string | readonly PayloadShape[] | { readonly [field: string]: PayloadShape };

/** How many levels of a payload a shape follows. */
export const MAX_SHAPE_DEPTH = 8;
/** How many distinct item shapes an array's shape keeps. */
export const MAX_ITEM_SHAPES = 3;

const PLAIN_FIELD = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const OTHER_FIELD = "(key)";
const DEEPER = "(deeper)";

function arrayShape(items: readonly unknown[], depth: number): PayloadShape {
  const shapes = new Map<string, PayloadShape>();
  for (const item of items) {
    const shape = shapeAt(item, depth + 1);
    shapes.set(JSON.stringify(shape), shape);
    if (shapes.size === MAX_ITEM_SHAPES) {
      break;
    }
  }
  return [...shapes.values()];
}

function objectShape(
  fields: Readonly<Record<string, unknown>>,
  depth: number,
): PayloadShape {
  const shape: Record<string, PayloadShape> = {};
  for (const name of Object.keys(fields).sort()) {
    const field = PLAIN_FIELD.test(name) ? name : OTHER_FIELD;
    shape[field] ??= shapeAt(fields[name], depth + 1);
  }
  return shape;
}

function shapeAt(value: unknown, depth: number): PayloadShape {
  if (depth > MAX_SHAPE_DEPTH) {
    return DEEPER;
  }
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return arrayShape(value, depth);
  }
  if (typeof value === "object") {
    return objectShape(value as Readonly<Record<string, unknown>>, depth);
  }
  return typeof value;
}

/** The shape of a push payload: field names and value types only. */
export function shapeOf(payload: unknown): PayloadShape {
  return shapeAt(payload, 0);
}
