// Hub events (T062; FR-008, FR-009; DRIFT-002-20): transitions only, the alarm from the panel, the
// arm state the home saw. The shapes are ring-client-api 14.3's (research.md, T062).
import { describe, expect, it } from "vitest";
import {
  alarmEvent,
  armedAt,
  deviceChangeEvents,
  modeChangeEvent,
} from "./index.ts";
import type { HubDevice, HubPanel } from "./index.ts";

const AT = Date.UTC(2026, 10, 18, 19, 0, 0);

function contact(open: boolean | undefined, extra = {}): HubDevice {
  return {
    device_id: "zid-door",
    location_id: "loc-1",
    name: "Front Door",
    type: "contact",
    state: { ...(open === undefined ? {} : { open }), ...extra },
  };
}

function sensor(
  type: "motion" | "flood",
  on: boolean,
  name = "Hall",
): HubDevice {
  return {
    device_id: `zid-${type}`,
    location_id: "loc-1",
    name,
    type,
    state: { [type]: on },
  };
}

function panel(fields: Partial<HubPanel> = {}): HubPanel {
  return { location_id: "loc-1", faulted_device_ids: [], ...fields };
}

const DISARMED = { at: AT, armed: false };

describe("deviceChangeEvents", () => {
  it("reports a contact opening and closing, with the home's arm state", () => {
    const opened = deviceChangeEvents(contact(false), contact(true), {
      at: AT,
      armed: true,
    });
    const closed = deviceChangeEvents(contact(true), contact(false), DISARMED);

    expect(opened).toEqual([
      {
        event_id: `zid-door-open-${String(AT)}`,
        location_id: "loc-1",
        device_id: "zid-door",
        device_type: "contact",
        kind: "contact.open",
        occurred_at: AT,
        name: "Front Door",
        summary: "Front Door opened.",
        armed: true,
      },
    ]);
    expect(closed.map((event) => [event.kind, event.summary])).toEqual([
      ["contact.closed", "Front Door closed."],
    ]);
  });

  it("reports nothing for a device seen for the first time, even an open door", () => {
    expect(deviceChangeEvents(undefined, contact(true), DISARMED)).toEqual([]);
  });

  it("reports nothing when only another field changed, such as the battery or a tamper", () => {
    expect(
      deviceChangeEvents(
        contact(true),
        contact(true, { tampered: true }),
        DISARMED,
      ),
    ).toEqual([]);
  });

  it("reports nothing when the value was unknown before", () => {
    expect(
      deviceChangeEvents(contact(undefined), contact(true), DISARMED),
    ).toEqual([]);
  });

  it("reports a motion sensor and a flood sensor turning on, never turning off", () => {
    const motion = deviceChangeEvents(
      sensor("motion", false),
      sensor("motion", true),
      DISARMED,
    );
    const flood = deviceChangeEvents(
      sensor("flood", false, "Laundry"),
      sensor("flood", true, "Laundry"),
      DISARMED,
    );

    expect(motion.map((event) => [event.kind, event.summary])).toEqual([
      ["motion", "Motion at Hall."],
    ]);
    expect(flood.map((event) => [event.kind, event.summary])).toEqual([
      ["flood", "Water detected at Laundry."],
    ]);
    expect(
      deviceChangeEvents(
        sensor("motion", true),
        sensor("motion", false),
        DISARMED,
      ),
    ).toEqual([]);
  });

  it("keeps an id within the log's 128 characters for a long device id", () => {
    const long = { ...contact(true), device_id: "z".repeat(200) };
    const [event] = deviceChangeEvents(
      { ...contact(false), device_id: long.device_id },
      long,
      DISARMED,
    );

    expect(event?.event_id.length).toBeLessThanOrEqual(128);
    expect(event?.event_id.endsWith(`-${String(AT)}`)).toBe(true);
  });
});

describe("modeChangeEvent", () => {
  it("reports the alarm mode changing, not its first sight or the same mode again", () => {
    const changed = modeChangeEvent(
      { location_id: "loc-1", alarm_mode: "away" },
      { location_id: "loc-1", alarm_mode: "disarmed" },
      AT,
    );

    expect(changed).toMatchObject({
      kind: "mode.changed",
      summary: "The alarm mode changed from away to disarmed.",
      data: { from: "away", to: "disarmed" },
      armed: false,
    });
    expect(
      modeChangeEvent(
        undefined,
        { location_id: "loc-1", alarm_mode: "away" },
        AT,
      ),
    ).toBeUndefined();
    expect(
      modeChangeEvent(
        { location_id: "loc-1", alarm_mode: "away" },
        { location_id: "loc-1", alarm_mode: "away" },
        AT,
      ),
    ).toBeUndefined();
  });
});

describe("alarmEvent", () => {
  const names = new Map([["zid-door", "Front Door"]]);
  const context = { at: AT, nameOf: (id: string) => names.get(id) };

  it("reports the alarm going off under Ring's id, naming what set it off", () => {
    const event = alarmEvent(
      panel(),
      panel({
        alarm_state: "burglar-alarm",
        alarm_id: "uuid-1",
        alarm_at: AT - 1000,
        faulted_device_ids: ["zid-door", "zid-unknown"],
      }),
      context,
    );

    expect(event).toEqual({
      event_id: "alarm-uuid-1-burglar-alarm",
      location_id: "loc-1",
      kind: "alarm.triggered",
      occurred_at: AT - 1000,
      summary: "The burglar alarm is going off: Front Door.",
      data: {
        alarm_state: "burglar-alarm",
        faulted_device_ids: ["zid-door", "zid-unknown"],
      },
      armed: true,
    });
  });

  it("reports nothing during an entry delay, or while the same alarm goes on", () => {
    const going = panel({ alarm_state: "fire-alarm", alarm_id: "uuid-2" });

    expect(
      alarmEvent(panel(), panel({ alarm_state: "entry-delay" }), context),
    ).toBeUndefined();
    expect(alarmEvent(going, going, context)).toBeUndefined();
  });

  it("reports an alarm already going off when the home first sees the panel: Ring's id makes a repeat a duplicate", () => {
    const event = alarmEvent(
      undefined,
      panel({ alarm_state: "co-alarm", alarm_id: "uuid-3" }),
      context,
    );

    expect(event?.event_id).toBe("alarm-uuid-3-co-alarm");
  });

  it("reports an alarm state it does not know, without repeating Ring's text", () => {
    const event = alarmEvent(
      panel(),
      panel({ alarm_state: "<new-kind>" }),
      context,
    );

    expect(event).toMatchObject({
      event_id: `loc-1-alarm-${String(AT)}`,
      summary: "The alarm is going off.",
      data: { alarm_state: "other" },
    });
  });
});

describe("armedAt", () => {
  const away = { location_id: "loc-1", alarm_mode: "away" as const };

  it("is armed in home or away mode, and not while disarmed or unknown", () => {
    expect(armedAt(away, undefined, AT)).toBe(true);
    expect(
      armedAt({ location_id: "loc-1", alarm_mode: "home" }, undefined, AT),
    ).toBe(true);
    expect(
      armedAt({ location_id: "loc-1", alarm_mode: "disarmed" }, undefined, AT),
    ).toBe(false);
    expect(armedAt(undefined, undefined, AT)).toBe(false);
  });

  it("is not armed during an exit delay, and armed during an entry delay", () => {
    expect(armedAt(away, panel({ delay_until: AT + 30_000 }), AT)).toBe(false);
    expect(
      armedAt(
        away,
        panel({ delay_until: AT + 30_000, alarm_state: "entry-delay" }),
        AT,
      ),
    ).toBe(true);
    expect(armedAt(away, panel({ delay_until: AT - 1 }), AT)).toBe(true);
  });
});
