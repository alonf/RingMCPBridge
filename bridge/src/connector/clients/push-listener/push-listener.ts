// Push Listener (CP-08b, T038): Ring's push in. In this first step it is the push probe: it logs
// that a push arrived, about which device, of which kind, and how long after Ring's own time for
// it, and nothing else. Ring's payload carries names and text, which are content: none of it is
// logged (FR-034, OR6). From T044 it also hands each push to Ingest, which makes it an event.
//
// For T042, it also hands each distinct payload shape (field names and value types, never a
// value) to an optional sink, the first `MAX_SHAPES_RECORDED` of them, so the probe at the
// owner's home shows which fields Ring's real pushes carry.
import type { Clock } from "../../../utilities/clock/index.ts";
import type { Logger } from "../../../utilities/logging/index.ts";
import type {
  RingPush,
  RingPushPort,
  StopWatching,
} from "../../access/ring-adapter/index.ts";
import { shapeOf } from "./push-shape.ts";
import type { PayloadShape } from "./push-shape.ts";
import { sightPush } from "./push-sighting.ts";
import type { PushFormat, PushKind } from "./push-sighting.ts";

/** How many distinct payload shapes one process hands to the sink. */
export const MAX_SHAPES_RECORDED = 50;

/** One distinct payload shape, with what the listener made of the push. */
export interface PushShapeRecord {
  readonly format: PushFormat;
  readonly kind: PushKind;
  readonly shape: PayloadShape;
}

/** Where distinct payload shapes go: a file in the data folder, in the connector. */
export type PushShapeSink = (record: PushShapeRecord) => void;

/** What the Push Listener is wired with. */
export interface PushListenerOptions {
  readonly ring: RingPushPort;
  readonly clock: Clock;
  readonly logger: Logger;
  /** Where distinct payload shapes go; none are kept when left out. */
  readonly shapes?: PushShapeSink;
  /** Where each push goes next: Ingest, in the home part (T044). */
  readonly onPush?: (push: RingPush) => void;
}

/** Ring's push notifications, heard. One per connector process; the Host starts and stops it. */
export class PushListener {
  readonly #ring: RingPushPort;
  readonly #clock: Clock;
  readonly #logger: Logger;
  readonly #shapes: PushShapeSink | undefined;
  readonly #onPush: ((push: RingPush) => void) | undefined;
  readonly #shapesSeen = new Set<string>();
  #stopWatching: StopWatching | undefined;

  constructor(options: PushListenerOptions) {
    this.#ring = options.ring;
    this.#clock = options.clock;
    this.#logger = options.logger.with({ component: "push_listener" });
    this.#shapes = options.shapes;
    this.#onPush = options.onPush;
  }

  /** Starts listening. Starting twice listens once. */
  start(): void {
    this.#stopWatching ??= this.#ring.watchPush((push) => {
      this.#heard(push);
    });
  }

  /** Stops listening. */
  stop(): void {
    this.#stopWatching?.();
    this.#stopWatching = undefined;
  }

  #heard(push: RingPush): void {
    const sighting = sightPush(push.payload);
    this.#logger.info("ring_push_received", {
      device_id: push.device_id,
      location_id: push.location_id,
      ...(sighting.ringEventId === undefined
        ? {}
        : { event_id: sighting.ringEventId }),
      kind: sighting.kind,
      ...(sighting.subtype === undefined ? {} : { subtype: sighting.subtype }),
      outcome: sighting.format,
      ...(sighting.triggeredAtMs === undefined
        ? {}
        : { delay_ms: this.#clock.now() - sighting.triggeredAtMs }),
    });
    this.#recordShape({
      format: sighting.format,
      kind: sighting.kind,
      shape: shapeOf(push.payload),
    });
    try {
      this.#onPush?.(push);
    } catch (error) {
      this.#logger.error(
        "ring_push_not_handed_over",
        { device_id: push.device_id },
        error,
      );
    }
  }

  // A shape already handed over, or one past the cap, is not handed over again.
  #recordShape(record: PushShapeRecord): void {
    const sink = this.#shapes;
    const key = JSON.stringify(record);
    if (
      sink === undefined ||
      this.#shapesSeen.has(key) ||
      this.#shapesSeen.size >= MAX_SHAPES_RECORDED
    ) {
      return;
    }
    this.#shapesSeen.add(key);
    try {
      sink(record);
    } catch (error) {
      this.#logger.warn("ring_push_shape_failed", undefined, error);
    }
  }
}
