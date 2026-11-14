// The Health section's content (T029): the push and last-event rows once events arrive, and when
// the connector counts as behind the core [P].
import { describe, expect, it } from "vitest";
import type { OwnerHealth } from "../../managers/inquiry/index.ts";
import { connectorBehind, healthPanel } from "./health-panel.ts";

const SINCE = "2026-11-10T08:00:00Z";

function health(data: Partial<OwnerHealth["health"]["data"]>): OwnerHealth {
  return {
    health: {
      as_of: SINCE,
      as_of_local: "2026-11-10T10:00:00+02:00",
      freshness: "cached",
      data: {
        home_link: { status: "up", since: SINCE },
        ring_session: { status: "ok", since: SINCE },
        database: { status: "ok" },
        ...data,
      },
    },
    time_zone: "Asia/Jerusalem",
    connector_version: "1.4.0",
  };
}

describe("the Health section's content", () => {
  it("shows push and the last event once events arrive, in the home's time", () => {
    const panel = healthPanel(
      health({
        push: { status: "down", since: SINCE },
        last_event_at: "2026-11-10T08:30:00Z",
      }),
      "1.4.0",
    );

    expect(panel.rows.map((row) => [row.label, row.word, row.tone])).toEqual([
      ["Home link", "Connected", "ok"],
      ["Ring", "OK", "ok"],
      ["Push", "Down", "bad"],
      ["Last event", "Received", "none"],
      ["Database", "OK", "ok"],
      ["Connector", "Current", "ok"],
    ]);
    expect(panel.rows[3]?.detail).toBe("10 Nov 2026, 10:30:00");
  });

  it("shows Ring unavailable as a warning, with no banner", () => {
    const panel = healthPanel(
      health({ ring_session: { status: "unavailable", since: SINCE } }),
      "1.4.0",
    );

    expect(panel.rows[1]).toMatchObject({ word: "Unavailable", tone: "warn" });
    expect(panel.banners).toEqual([]);
  });

  it.each([
    ["1.4.0", "1.5.0", true],
    ["1.4.9", "1.5.0", true],
    ["0.9.9", "1.0.0", true],
    ["1.4.0", "1.4.1", true],
    ["1.4.0", "1.4.0", false],
    ["1.5.0", "1.4.0", false],
    ["1.10.0", "1.9.0", false],
    ["1.4.0-beta", "1.5.0", false],
    ["1.4", "1.5.0", false],
  ])(
    "counts connector %s against core %s as behind: %s",
    (connector, core, behind) => {
      expect(connectorBehind(connector, core)).toBe(behind);
    },
  );
});
