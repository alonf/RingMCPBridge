// Shapes the tools share (contracts/mcp-tools.md; data-model "Location" and "Device"): the
// enumerations, times, the device reference and the location summary. Enumerations grow only
// additively (FR-046).
import { z } from "zod";
import { ringText } from "./untrusted.ts";

/** The device types (PT-26). Anything the bridge does not know is `other`. */
export const DEVICE_TYPES = [
  "contact",
  "motion",
  "flood",
  "keypad",
  "base_station",
  "camera",
  "doorbell",
  "light",
  "other",
] as const;

/** A location's alarm mode. */
export const ALARM_MODES = ["disarmed", "home", "away"] as const;

const MAX_BATTERY_PCT = 100;

export const deviceType = z.enum(DEVICE_TYPES).meta({
  description:
    "The device type. New types may be added; a device the bridge cannot place is other.",
});

export const alarmMode = z.enum(ALARM_MODES).meta({
  description: "The alarm mode: disarmed, home or away.",
});

export const ownership = z.enum(["owned", "shared"]).meta({
  description:
    "owned: the owner's account owns the location; shared: the location was shared with it.",
});

export const powerMode = z.enum(["battery", "wired"]).meta({
  description: "How the device is powered. A wired device reports no battery.",
});

export const batteryPct = z.int().min(0).max(MAX_BATTERY_PCT).meta({
  description:
    "The battery level, 0 to 100. Absent for a wired device or when Ring does not say.",
});

/** An instant in UTC, as ISO 8601 text ending in Z. */
export function utcTime(description: string): z.ZodISODateTime {
  return z.iso.datetime().meta({ description });
}

/** An instant with the location's UTC offset, as ISO 8601 text. */
export function localTime(description: string): z.ZodISODateTime {
  return z.iso.datetime({ offset: true }).meta({ description });
}

export const locationId = z.string().min(1).meta({
  description: "The location id.",
});

export const deviceId = z.string().min(1).meta({
  description: "The device id. Tool inputs call it device_id.",
});

export const deviceName = ringText(
  "The device name exactly as written in Ring, in any language.",
);

export const roomName = ringText(
  "The room Ring assigns. Absent when the device has no room.",
);

/** A device as events and lists name it (integration-api D7). */
export const deviceReference = z.object({
  id: deviceId,
  name: deviceName,
  room: roomName.optional(),
});

/** A location as the overview names it. */
export const locationSummary = z.object({
  location_id: locationId,
  name: ringText("The location name exactly as written in Ring."),
  time_zone: ringText("The location's IANA time zone, as Ring reports it."),
  ownership,
});
