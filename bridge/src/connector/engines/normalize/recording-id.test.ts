import { expect, it } from "vitest";
import { recordingEventId } from "./recording-id.ts";

it("fits a long Ring ID in the bridge log and preserves its entire source identity across retries", () => {
  const source = {
    householdId: "home",
    deviceId: "cam",
    eventId: "x".repeat(1024),
  };
  const id = recordingEventId(source);
  expect(id).toMatch(/^ring-recording-[a-f0-9]{64}$/);
  expect(recordingEventId({ ...source })).toBe(id);
  for (const field of ["householdId", "deviceId", "eventId"] as const)
    expect(
      recordingEventId({ ...source, [field]: source[field] + "y" }),
    ).not.toBe(id);
});
