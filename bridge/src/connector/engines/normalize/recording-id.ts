import { createHash } from "node:crypto";

/** Stable key for the bridge log. Ring's opaque IDs remain intact at home for provider reads. */
export function recordingEventId(source: {
  householdId: string;
  deviceId: string;
  eventId: string;
}): string {
  const tuple = JSON.stringify([
    source.householdId,
    source.deviceId,
    source.eventId,
  ]);
  return "ring-recording-" + createHash("sha256").update(tuple).digest("hex");
}
