// Push Listener (CP-08b, T038): Ring's push in. The only entry point (CD4).

/** The client the Host starts and stops, and its wiring. */
export { MAX_SHAPES_RECORDED, PushListener } from "./push-listener.ts";
export type {
  PushListenerOptions,
  PushShapeRecord,
  PushShapeSink,
} from "./push-listener.ts";

/** A payload's shape: field names and value types, never a value (T038 part 2). */
export { MAX_ITEM_SHAPES, MAX_SHAPE_DEPTH, shapeOf } from "./push-shape.ts";
export type { PayloadShape } from "./push-shape.ts";
