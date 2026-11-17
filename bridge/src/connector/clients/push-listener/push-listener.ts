// Push Listener (CP-08b, T038): Ring's push in. In this first step it is the push probe: it logs
// that a push arrived, about which device, of which kind, and how long after Ring's own time for
// it, and nothing else. Ring's payload carries names and text, which are content: none of it is
// logged (FR-034, OR6). Handing each push to Ingest comes with T044.
import type { Clock } from "../../../utilities/clock/index.ts";
import type { Logger } from "../../../utilities/logging/index.ts";
import type {
  RingPush,
  RingPushPort,
  StopWatching,
} from "../../access/ring-adapter/index.ts";
import { sightPush } from "./push-sighting.ts";

/** What the Push Listener is wired with. */
export interface PushListenerOptions {
  readonly ring: RingPushPort;
  readonly clock: Clock;
  readonly logger: Logger;
}

/** Ring's push notifications, heard. One per connector process; the Host starts and stops it. */
export class PushListener {
  readonly #ring: RingPushPort;
  readonly #clock: Clock;
  readonly #logger: Logger;
  #stopWatching: StopWatching | undefined;

  constructor(options: PushListenerOptions) {
    this.#ring = options.ring;
    this.#clock = options.clock;
    this.#logger = options.logger.with({ component: "push_listener" });
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
  }
}
