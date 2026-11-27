// The push probe's shapes file (T038 part 2): each distinct payload shape the Push Listener hands
// over becomes one JSON line in `push-shapes.jsonl` in the connector's data folder. A shape holds
// field names and value types only, never a value, so the file holds no Ring content and the owner
// can send it as it is. Writes are queued one after another; a failed write is logged and the
// next one still runs. Delete the file to start a new record.
import { appendFile } from "node:fs/promises";
import { join } from "node:path";
import type { PushShapeSink } from "../connector/clients/push-listener/index.ts";
import type { Clock } from "../utilities/clock/index.ts";
import type { Logger } from "../utilities/logging/index.ts";

/** The shapes file's name in the data folder. */
export const PUSH_SHAPES_FILE_NAME = "push-shapes.jsonl";

/** A sink that appends each shape to the shapes file in `dataDir`. */
export function pushShapesFile(
  dataDir: string,
  clock: Clock,
  logger: Logger,
): PushShapeSink {
  const path = join(dataDir, PUSH_SHAPES_FILE_NAME);
  let writing = Promise.resolve();
  return (record) => {
    const line = `${JSON.stringify({
      at: new Date(clock.now()).toISOString(),
      ...record,
    })}\n`;
    writing = writing
      .then(() => appendFile(path, line, "utf8"))
      .catch((error: unknown) => {
        logger.warn(
          "ring_push_shape_failed",
          { component: "push_listener" },
          error,
        );
      });
  };
}
