// History events (T053): the push's own event ids, so a repeat is one event.
import { describe, expect, it } from "vitest";
import { historyEvent, normalizePush } from "./index.ts";
import type { HistoryInput } from "./index.ts";

const AT = Date.UTC(2026, 10, 19, 8, 30, 0);

function entry(changes: Partial<HistoryInput> = {}): HistoryInput {
  return {
    device_id: "42",
    location_id: "loc-1",
    device_type: "doorbell",
    ring_event_id: "7709540341840519240",
    kind: "motion",
    person: false,
    occurred_at: AT,
    name: "Front Door",
    ...changes,
  };
}

describe("historyEvent", () => {
  it("gives a plain motion, a person and a press the ids their pushes have", () => {
    expect(historyEvent(entry())).toMatchObject({
      event_id: "7709540341840519240-m",
      kind: "motion",
      summary: "Motion at Front Door.",
      occurred_at: AT,
    });
    expect(historyEvent(entry({ person: true }))).toMatchObject({
      event_id: "7709540341840519240-p",
      kind: "motion",
      person: true,
      summary: "A person was seen by Front Door.",
    });
    expect(historyEvent(entry({ kind: "ding" }))).toMatchObject({
      event_id: "7709540341840519240-d",
      kind: "doorbell.ding",
      summary: "The doorbell Front Door was pressed.",
    });
  });

  it("has the same event id and kind as normalizing the push for the same event", () => {
    const push = normalizePush(
      {
        device_id: "42",
        location_id: "loc-1",
        device_type: "doorbell",
        payload: {
          android_config: { category: "com.ring.pn.live-event.motion" },
          analytics: { triggered_at: AT },
          data: {
            device: { name: "Front Door" },
            event: {
              ding: { id: "7709540341840519240", detection_type: "human" },
            },
          },
        },
      },
      AT,
    );
    const history = historyEvent(entry({ person: true }));

    expect(push.ok && push.event.event_id).toBe(history?.event_id);
    expect(push.ok && push.event.kind).toBe(history?.kind);
  });

  it("words a camera with no name, keeps an unknown kind as ring.other, and refuses an id too long for the log", () => {
    const nameless = Object.fromEntries(
      Object.entries(entry()).filter(([key]) => key !== "name"),
    ) as unknown as HistoryInput;

    expect(historyEvent(nameless)?.summary).toBe("Motion at a camera.");
    expect(historyEvent(entry({ kind: "other" }))).toMatchObject({
      event_id: "7709540341840519240-o",
      kind: "ring.other",
    });
    expect(historyEvent(entry({ ring_event_id: "9".repeat(127) }))).toBe(
      undefined,
    );
  });
});
