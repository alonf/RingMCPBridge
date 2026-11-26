import { SystemClock } from "../../src/utilities/clock/index.ts";
import { EventLog } from "../../src/core/access/event-log/index.ts";
import type { QueryLayer } from "../../src/utilities/query-layer/index.ts";
import {
  eventually,
  type Cleanups,
  type StartedCore,
} from "../host/core-fixture.ts";
import { linkTestHome } from "../host/link-test-home.ts";

/** Replay an already queued event across the production connector's restart and enrollment path. */
export async function replayRecordedEvent(
  core: StartedCore,
  store: QueryLayer,
  cleanups: Cleanups,
  source: {
    home: string;
    device: string;
    event: string;
    eventAt: number;
    kind: string;
  },
) {
  const signal = new AbortController().signal;
  const clock = new SystemClock();
  const cameraType = source.kind === "doorbell.ding" ? "doorbell" : "camera";
  await linkTestHome(
    core,
    cleanups,
    {
      locations: [
        {
          location_id: source.home,
          name: "Pilot home",
          time_zone: "UTC",
          ownership: "owned",
        },
      ],
      devices: [
        {
          device_id: source.device,
          location_id: source.home,
          name: "Pilot camera",
          type: cameraType,
          power_mode: "wired",
          online: true,
          state: {},
        },
      ],
    },
    {
      event_id: source.event,
      location_id: source.home,
      device_id: source.device,
      device_type: cameraType,
      kind: source.kind,
      occurred_at: new Date(source.eventAt).toISOString(),
      received_at: new Date(clock.now()).toISOString(),
      from_history: false,
      summary: "Recorded detection",
    },
  );
  const { state } = core.running.core;
  const log = new EventLog({ clock });
  await eventually(
    async () =>
      (await state.device(source.device, signal))?.location_id ===
        source.home &&
      (await log.fromCamera(
        store,
        source.home,
        source.device,
        source.event,
        signal,
      )),
  );
}
