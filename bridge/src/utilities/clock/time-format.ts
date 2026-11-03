// Timestamps for replies and pages: UTC, and a location's local time with its offset.
import { ClockError } from "./clock-error.ts";

const UTC_OFFSET = "+00:00";
const GMT_PREFIX = "GMT";

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  const cached = formatters.get(timeZone);
  if (cached) {
    return cached;
  }
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "longOffset",
  });
  formatters.set(timeZone, formatter);
  return formatter;
}

/** `GMT+02:00` becomes `+02:00`; `GMT` alone is UTC. */
function offsetFrom(timeZoneName: string): string {
  const offset = timeZoneName.slice(GMT_PREFIX.length);
  return offset === "" ? UTC_OFFSET : offset;
}

/** True when Intl knows the IANA time zone, for example `Europe/Athens`. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    formatterFor(timeZone);
    return true;
  } catch {
    return false;
  }
}

/** ISO 8601 in UTC with milliseconds: `2026-11-03T09:00:00.000Z`. */
export function formatUtc(epochMs: number): string {
  return new Date(epochMs).toISOString();
}

/**
 * ISO 8601 in the time zone, with its offset at that moment: `2026-11-03T11:00:00+02:00`.
 * Throws `ClockError` (`unknown_time_zone`) for a zone Intl does not know.
 */
export function formatInTimeZone(epochMs: number, timeZone: string): string {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = formatterFor(timeZone).formatToParts(epochMs);
  } catch (error) {
    throw new ClockError("unknown_time_zone", "The time zone is not known.", {
      cause: error,
    });
  }
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";
  const date = `${part("year")}-${part("month")}-${part("day")}`;
  const time = `${part("hour")}:${part("minute")}:${part("second")}`;
  return `${date}T${time}${offsetFrom(part("timeZoneName"))}`;
}
