// The lease guard on Event's intake (T027 part 2): while the lease is held, each message reaches
// Event; while it is not, each is refused as `unavailable` and Event sees nothing, so the message
// stays unacked and the home sends it again.
import { describe, expect, it } from "vitest";
import { EventError } from "../../src/core/managers/event/index.ts";
import type {
  EventIntake,
  HomeLinkSession,
  IncomingHeartbeat,
  IncomingInventory,
  IncomingDeviceState,
} from "../../src/core/managers/event/index.ts";
import { leasedIntake } from "../../src/host/leased-links.ts";
import { RecordingIntake } from "../support/index.ts";

const SESSION: HomeLinkSession = {
  session_id: "session-1",
  key_id: "key-1",
  connector_version: "0.1.0",
  version: 1,
};

function never(): AbortSignal {
  return new AbortController().signal;
}

/** Every intake call once, with bodies the recorder does not look into. */
function everyCall(intake: EventIntake): Promise<unknown>[] {
  return [
    intake.homeSessionOpened(SESSION, never()),
    intake.inventory({} as IncomingInventory, SESSION, never()),
    intake.deviceState({} as IncomingDeviceState, SESSION, never()),
    intake.heartbeat({} as IncomingHeartbeat, SESSION, never()),
  ];
}

describe("Event's intake under the lease", () => {
  it("hands every message to Event while the lease is held", async () => {
    const event = new RecordingIntake();

    await Promise.all(everyCall(leasedIntake(event, { held: true })));

    expect(event.calls.map((call) => call.method)).toEqual([
      "homeSessionOpened",
      "inventory",
      "deviceState",
      "heartbeat",
    ]);
  });

  it("refuses every message as unavailable while the lease is not held, and Event sees none", async () => {
    const event = new RecordingIntake();
    const lease = { held: true };
    const intake = leasedIntake(event, lease);
    lease.held = false;

    const outcomes = await Promise.allSettled(everyCall(intake));

    for (const outcome of outcomes) {
      expect(outcome.status).toBe("rejected");
      if (outcome.status === "rejected") {
        expect(outcome.reason).toBeInstanceOf(EventError);
        expect(outcome.reason).toMatchObject({ kind: "unavailable" });
      }
    }
    expect(event.calls).toEqual([]);
  });
});
