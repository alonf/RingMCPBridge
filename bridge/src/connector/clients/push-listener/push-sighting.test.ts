// The push sighting (T038): what is read from a push without its content, on a version 2 payload
// shaped as ring-client-api types it (a synthetic fixture; real shapes come from the probe at
// home), on Ring's alarm format, and on payloads that are malformed or unknown.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { sightPush } from "./push-sighting.ts";

const TRIGGERED_AT_MS = Date.UTC(2026, 10, 7, 9, 0, 0);
const MS_PER_SECOND = 1000;

function dingFixture(): Record<string, unknown> {
  const file = new URL(
    "../../../../test/fixtures/ring/push-ding-v2.synthetic.json",
    import.meta.url,
  );
  return JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
}

function withCategory(category: string): Record<string, unknown> {
  return { ...dingFixture(), android_config: { category, body: "text" } };
}

describe("sightPush", () => {
  it("reads the kind, subtype, event id and trigger time of a version 2 ding", () => {
    expect(sightPush(dingFixture())).toEqual({
      format: "ding_v2",
      kind: "ding",
      subtype: "button_press",
      ringEventId: "7400000000000000001",
      triggeredAtMs: TRIGGERED_AT_MS,
    });
  });

  it.each([
    ["com.ring.pn.live-event.motion", "motion"],
    ["com.ring.pn.live-event.intercom", "intercom_ding"],
    ["com.ring.pn.something-new", "other"],
  ])("maps the category %s to the kind %s", (category, kind) => {
    expect(sightPush(withCategory(category)).kind).toBe(kind);
  });

  it("takes a trigger time in seconds as seconds", () => {
    const push = {
      ...dingFixture(),
      analytics: { triggered_at: TRIGGERED_AT_MS / MS_PER_SECOND },
    };
    expect(sightPush(push).triggeredAtMs).toBe(TRIGGERED_AT_MS);
  });

  it("falls back to the ding's creation time when Ring gives no trigger time", () => {
    const push = { ...dingFixture(), analytics: {} };
    expect(sightPush(push).triggeredAtMs).toBe(TRIGGERED_AT_MS);
  });

  it("leaves out what is absent or of the wrong type, and still sights the push", () => {
    const push = {
      android_config: { category: "com.ring.pn.live-event.motion" },
      analytics: { triggered_at: "soon" },
      data: {
        event: { ding: { id: 7, subtype: "", created_at: "not a date" } },
      },
    };
    expect(sightPush(push)).toEqual({ format: "ding_v2", kind: "motion" });
  });

  it("sights Ring's alarm format by its format alone", () => {
    const push = { data: { gcmData: { alarm_meta: { device_zid: 1 } } } };
    expect(sightPush(push)).toEqual({ format: "alarm", kind: "alarm" });
  });

  it.each([
    ["nothing", undefined],
    ["a string", "ding"],
    ["a list", [1, 2]],
    ["an object in no known format", { hello: "world" }],
    ["a category that is not text", { android_config: { category: 5 } }],
  ])("sights %s as unknown, without throwing", (_name, payload) => {
    expect(sightPush(payload)).toEqual({ format: "unknown", kind: "other" });
  });
});
