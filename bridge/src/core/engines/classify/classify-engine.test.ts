// The Classify engine (T045): every row of FR-009's table from the shipped policy file, the
// default for a kind no rule names, the late rule at its 2-minute edge, and policy files the
// engine refuses.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  highestPriority,
  isLate,
  keptFromSharedLocation,
  parsePriorityPolicy,
  priorityOf,
  PRIORITY_POLICY_FILE,
  PriorityPolicyError,
} from "./index.ts";
import type { PriorityFacts } from "./index.ts";

const TWO_MINUTES_MS = 120_000;
const RECEIVED_AT = Date.UTC(2026, 10, 17, 9, 0, 0);

function shippedFile(): Record<string, unknown> {
  return JSON.parse(readFileSync(PRIORITY_POLICY_FILE, "utf8")) as Record<
    string,
    unknown
  >;
}

const policy = parsePriorityPolicy(shippedFile());

function refusal(raw: unknown): string {
  try {
    parsePriorityPolicy(raw);
  } catch (error) {
    if (error instanceof PriorityPolicyError) {
      return error.message;
    }
    throw error;
  }
  throw new Error("The policy was accepted.");
}

describe("the Classify engine's priorities, from the shipped policy (FR-009)", () => {
  it.each<[string, PriorityFacts, string]>([
    // HIGH
    ["a flood", { kind: "flood", armed: false }, "HIGH"],
    ["the alarm triggered", { kind: "alarm.triggered", armed: true }, "HIGH"],
    ["the doorbell", { kind: "doorbell.ding", armed: false }, "HIGH"],
    ["an intercom ring", { kind: "intercom.ding", armed: false }, "HIGH"],
    [
      "a contact opening while armed",
      { kind: "contact.open", armed: true, deviceType: "contact" },
      "HIGH",
    ],
    [
      "a contact closing while armed",
      { kind: "contact.closed", armed: true, deviceType: "contact" },
      "HIGH",
    ],
    [
      "a motion sensor while armed",
      { kind: "motion", armed: true, deviceType: "motion" },
      "HIGH",
    ],
    [
      "the Ring session lost",
      { kind: "ring.session_lost", armed: false },
      "HIGH",
    ],
    [
      "Ring unavailable",
      { kind: "health.ring_unavailable", armed: false },
      "HIGH",
    ],
    ["Ring restored", { kind: "health.ring_restored", armed: false }, "HIGH"],
    ["the home offline", { kind: "health.home_offline", armed: true }, "HIGH"],
    [
      "the home online again",
      { kind: "health.home_online", armed: false },
      "HIGH",
    ],
    // MEDIUM
    [
      "camera motion with a person",
      { kind: "motion", armed: false, deviceType: "camera", person: true },
      "MEDIUM",
    ],
    [
      "doorbell-camera motion with a person, armed or not",
      { kind: "motion", armed: true, deviceType: "doorbell", person: true },
      "MEDIUM",
    ],
    // LOW: recorded, not pushed by default
    // The owner's choice (DRIFT-002-21), over FR-009's MEDIUM: a door opened at home is not news.
    [
      "a contact while disarmed",
      { kind: "contact.open", armed: false, deviceType: "contact" },
      "LOW",
    ],
    [
      "a motion sensor while disarmed",
      { kind: "motion", armed: false, deviceType: "motion" },
      "LOW",
    ],
    [
      "other camera motion",
      { kind: "motion", armed: false, deviceType: "camera" },
      "LOW",
    ],
    [
      "other camera motion while armed",
      { kind: "motion", armed: true, deviceType: "camera", person: false },
      "LOW",
    ],
    [
      "motion from a device the core does not know",
      { kind: "motion", armed: true },
      "LOW",
    ],
  ])("%s is %s", (_title, facts, expected) => {
    expect(priorityOf(policy, facts)).toBe(expected);
  });

  it("gives a kind no rule names the policy's default", () => {
    expect(priorityOf(policy, { kind: "ring.other", armed: true })).toBe(
      policy.defaultPriority,
    );
    expect(priorityOf(policy, { kind: "mode.changed", armed: false })).toBe(
      "LOW",
    );
  });

  it("takes every priority from the policy: another policy gives other answers", () => {
    const other = parsePriorityPolicy({
      version: 1,
      late_after_s: 60,
      default_priority: "MEDIUM",
      rules: [{ kinds: ["doorbell.ding"], priority: "LOW" }],
    });

    expect(priorityOf(other, { kind: "doorbell.ding", armed: false })).toBe(
      "LOW",
    );
    expect(priorityOf(other, { kind: "flood", armed: false })).toBe("MEDIUM");
  });

  it("names the highest of some priorities, and nothing for none", () => {
    expect(highestPriority(["LOW", "HIGH", "MEDIUM"])).toBe("HIGH");
    expect(highestPriority(["LOW", "MEDIUM"])).toBe("MEDIUM");
    expect(highestPriority(["LOW"])).toBe("LOW");
    expect(highestPriority([])).toBeUndefined();
  });
});

describe("the Classify engine's late rule (FR-013, PT-25)", () => {
  const arriving = (afterMs: number, fromHistory = false): boolean =>
    isLate(policy, {
      receivedAtMs: RECEIVED_AT,
      arrivedAtMs: RECEIVED_AT + afterMs,
      fromHistory,
    });

  it("is not late at exactly 2 minutes, and late one millisecond after", () => {
    expect(policy.lateAfterMs).toBe(TWO_MINUTES_MS);
    expect(arriving(0)).toBe(false);
    expect(arriving(TWO_MINUTES_MS)).toBe(false);
    expect(arriving(TWO_MINUTES_MS + 1)).toBe(true);
  });

  it("is late when read from Ring's history, however soon it arrives", () => {
    expect(arriving(0, true)).toBe(true);
  });

  it("is not late when the home's clock is ahead of the core's", () => {
    expect(arriving(-5_000)).toBe(false);
  });
});

// T063 (FR-036, US8; DRIFT-002-20): what is kept from a shared home is data too.
describe("the Classify engine's shared-location kinds", () => {
  it("keeps a shared home's alarm and water by the shipped policy, and nothing else", () => {
    expect(
      [
        "alarm.triggered",
        "flood",
        "doorbell.ding",
        "motion",
        "contact.open",
      ].map((kind) => keptFromSharedLocation(policy, kind)),
    ).toEqual([true, true, false, false, false]);
  });

  it("keeps nothing from a shared home when the policy names no kinds, or has no such entry", () => {
    const withoutEntry = Object.fromEntries(
      Object.entries(shippedFile()).filter(
        ([key]) => key !== "shared_locations",
      ),
    );
    const none = parsePriorityPolicy({
      ...shippedFile(),
      shared_locations: { kinds: [] },
    });
    const absent = parsePriorityPolicy(withoutEntry);

    expect(keptFromSharedLocation(none, "alarm.triggered")).toBe(false);
    expect(keptFromSharedLocation(absent, "alarm.triggered")).toBe(false);
  });

  it("refuses a kind a shared home never sends", () => {
    expect(
      refusal({
        ...shippedFile(),
        shared_locations: { kinds: ["doorbell.ding"] },
      }),
    ).toContain('"shared_locations.kinds.0"');
  });
});

describe("the priority policy file, as the engine checks it", () => {
  it.each<[string, (file: Record<string, unknown>) => unknown, string]>([
    ["is not an object", () => "HIGH", '""'],
    ["has another version", (file) => ({ ...file, version: 2 }), '"version"'],
    [
      "has no late limit",
      (file) => ({ ...file, late_after_s: undefined }),
      '"late_after_s"',
    ],
    [
      "has a late limit of zero",
      (file) => ({ ...file, late_after_s: 0 }),
      '"late_after_s"',
    ],
    [
      "has a default outside the three priorities",
      (file) => ({ ...file, default_priority: "URGENT" }),
      '"default_priority"',
    ],
    ["has no rules", (file) => ({ ...file, rules: [] }), '"rules"'],
    [
      "has a rule with a priority in lower case",
      (file) => ({
        ...file,
        rules: [{ kinds: ["flood"], priority: "high" }],
      }),
      '"rules.0.priority"',
    ],
    [
      "has a rule with a kind that is not a kind",
      (file) => ({
        ...file,
        rules: [{ kinds: ["Front Door"], priority: "HIGH" }],
      }),
      '"rules.0.kinds.0"',
    ],
    [
      "has a rule with a condition the engine does not know",
      (file) => ({
        ...file,
        rules: [
          { kinds: ["flood"], when: { raining: true }, priority: "HIGH" },
        ],
      }),
      '"rules.0.when"',
    ],
    [
      "has a rule with a device type the bridge does not have",
      (file) => ({
        ...file,
        rules: [
          {
            kinds: ["motion"],
            when: { device_types: ["drone"] },
            priority: "LOW",
          },
        ],
      }),
      '"rules.0.when.device_types.0"',
    ],
    [
      "has a field the engine does not know",
      (file) => ({ ...file, push_defaults: {} }),
      '""',
    ],
  ])("refuses a file that %s, and says where", (_title, change, where) => {
    expect(refusal(change(shippedFile()))).toContain(`not valid at ${where}`);
  });

  it("refuses a rule that can never apply, because an earlier rule without conditions decides its kind", () => {
    const message = refusal({
      ...shippedFile(),
      rules: [
        { kinds: ["motion", "flood"], priority: "LOW" },
        { kinds: ["flood"], when: { armed: true }, priority: "HIGH" },
      ],
    });

    expect(message).toContain("rules[1] can never apply to flood");
  });
});
