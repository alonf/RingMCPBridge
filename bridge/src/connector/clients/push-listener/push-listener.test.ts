// The Push Listener (T038) on the fake clock, with a stand-in for the Ring push port: one log line
// per push, carrying identifiers, codes and the delay only, never Ring's text; and stopping.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FakeClock } from "../../../utilities/clock/index.ts";
import { Logger } from "../../../utilities/logging/index.ts";
import type {
  RingPush,
  RingPushPort,
} from "../../access/ring-adapter/index.ts";
import { MAX_SHAPES_RECORDED, PushListener } from "./index.ts";
import type { PushShapeRecord, PushShapeSink } from "./index.ts";

const TRIGGERED_AT_MS = Date.UTC(2026, 10, 7, 9, 0, 0);
const DELAY_MS = 1_800;
const DEVICE_ID = "523456789";

class PushSource implements RingPushPort {
  readonly #listeners = new Set<(push: RingPush) => void>();

  get listeners(): number {
    return this.#listeners.size;
  }

  watchPush(listener: (push: RingPush) => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  send(payload: unknown): void {
    for (const listener of this.#listeners) {
      listener({ device_id: DEVICE_ID, location_id: "loc-1", payload });
    }
  }
}

function dingFixture(): unknown {
  const file = new URL(
    "../../../../test/fixtures/ring/push-ding-v2.synthetic.json",
    import.meta.url,
  );
  return JSON.parse(readFileSync(file, "utf8"));
}

function setup(shapes?: PushShapeSink): {
  source: PushSource;
  lines: string[];
  listener: PushListener;
} {
  const clock = new FakeClock(TRIGGERED_AT_MS + DELAY_MS);
  const source = new PushSource();
  const lines: string[] = [];
  const listener = new PushListener({
    ring: source,
    clock,
    logger: new Logger({
      sink: (line) => lines.push(line),
      now: () => clock.now(),
      minLevel: "debug",
    }),
    ...(shapes === undefined ? {} : { shapes }),
  });
  return { source, lines, listener };
}

function received(lines: readonly string[]): Record<string, unknown>[] {
  return lines
    .map((line) => JSON.parse(line) as Record<string, unknown>)
    .filter((line) => line.event === "ring_push_received");
}

describe("PushListener", () => {
  it("logs a push by its identifiers, kind, subtype, format and delay, and none of Ring's text", () => {
    const { source, lines, listener } = setup();
    listener.start();
    source.send(dingFixture());

    expect(received(lines)).toEqual([
      expect.objectContaining({
        component: "push_listener",
        device_id: DEVICE_ID,
        event_id: "7400000000000000001",
        kind: "ding",
        subtype: "button_press",
        outcome: "ding_v2",
        delay_ms: DELAY_MS,
      }),
    ]);
    const written = lines.join("\n");
    expect(written).not.toContain("Example Door");
    expect(written).not.toContain("someone");
  });

  it("logs a push in no known format too, with no delay and no event id", () => {
    const { source, lines, listener } = setup();
    listener.start();
    source.send({ note: "Front Door ajar" });

    const [line] = received(lines);
    expect(line).toMatchObject({ kind: "other", outcome: "unknown" });
    expect(line).not.toHaveProperty("delay_ms");
    expect(line).not.toHaveProperty("event_id");
    expect(lines.join("\n")).not.toContain("Front Door");
  });

  it("does not log a subtype that is not a plain word", () => {
    const { source, lines, listener } = setup();
    listener.start();
    const push = dingFixture() as { data: { event: { ding: object } } };
    push.data.event.ding = { subtype: "Front Door: person!" };
    source.send(push);

    expect(received(lines)).toHaveLength(1);
    expect(lines.join("\n")).not.toContain("Front Door");
  });

  it("hands each distinct payload shape to its sink once, with no value in it", () => {
    const shapes: PushShapeRecord[] = [];
    const { source, listener } = setup((record) => shapes.push(record));
    listener.start();

    source.send(dingFixture());
    source.send(dingFixture());
    source.send({ note: "Front Door ajar" });

    expect(shapes).toHaveLength(2);
    expect(shapes[0]).toMatchObject({ format: "ding_v2", kind: "ding" });
    expect(shapes[1]).toEqual({
      format: "unknown",
      kind: "other",
      shape: { note: "string" },
    });
    expect(JSON.stringify(shapes)).not.toContain("Front Door");
    expect(JSON.stringify(shapes)).not.toContain("Example Door");
  });

  it("hands over no more than the cap, and keeps listening when the sink fails", () => {
    let handed = 0;
    const { source, lines, listener } = setup(() => {
      handed += 1;
      if (handed === 1) {
        throw new Error("disk full");
      }
    });
    listener.start();

    for (let index = 0; index < MAX_SHAPES_RECORDED + 5; index += 1) {
      source.send({ [`field_${String(index)}`]: index });
    }

    expect(handed).toBe(MAX_SHAPES_RECORDED);
    expect(received(lines)).toHaveLength(MAX_SHAPES_RECORDED + 5);
    expect(lines.join("\n")).toContain("ring_push_shape_failed");
  });

  it("listens once however often it is started, and not at all once stopped", () => {
    const { source, lines, listener } = setup();
    listener.start();
    listener.start();
    expect(source.listeners).toBe(1);
    source.send(dingFixture());
    expect(received(lines)).toHaveLength(1);

    listener.stop();
    expect(source.listeners).toBe(0);
    source.send(dingFixture());
    expect(received(lines)).toHaveLength(1);
  });
});
