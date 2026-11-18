// Hub events (T062; FR-008, FR-009; DRIFT-002-20): what the alarm hub's live connection reports
// becomes the bridge's events. Pure; Ingest hands it each change with the entry it replaces.
//
// - **Transitions only.** The hub sends a device's full data again for any change, a battery level
//   or a signal, so an event comes only from a value that changed from one known value to another:
//   a contact opening or closing, a motion sensor or a flood sensor turning on. A device seen for
//   the first time, after a restart or a fresh read, gives none: nothing is known to have changed.
// - **The alarm going off** comes from the panel's alarm state. `entry-delay` is a countdown, not
//   an alarm, so it gives none; any other state does, an unknown one included, since a missed alarm
//   costs more than a false one. Its id is Ring's own for the alarm, so seeing it again after a
//   restart is dropped as a duplicate by the outbox and by the core.
// - **Armed** is what the home saw: the location's mode is `home` or `away` and no exit delay runs.
//   During an entry delay the location is armed: that delay is what an arrival starts.
// - **Shared homes** (T063; FR-036, US8): from a location the account was given a share of, only
//   the alarm going off and water are sent, each summary starting with the home's name, since
//   devices in different homes share names. The core keeps or withholds them by its policy.
// - Ring's names are untrusted text, kept exactly as written; Ring's alarm state appears only when
//   it is one of the known values.
import type { HubDeviceType, NormalizedEvent } from "./normalize.ts";
import { MAX_RING_EVENT_ID_LENGTH } from "./normalize.ts";

/** A device's entry as the Ring Adapter gives it; only what the rule reads. */
export interface HubDevice {
  readonly device_id: string;
  readonly location_id: string;
  /** Untrusted text from Ring. */
  readonly name: string;
  readonly type: HubDeviceType;
  readonly state: Readonly<Record<string, unknown>>;
}

/** A location's entry as the Ring Adapter gives it; only what the rule reads. */
export interface HubLocation {
  readonly location_id: string;
  readonly alarm_mode?: "disarmed" | "home" | "away";
}

/** A location's alarm panel as the Ring Adapter gives it (`RingPanel`). */
export interface HubPanel {
  readonly location_id: string;
  readonly alarm_state?: string;
  readonly alarm_id?: string;
  readonly alarm_at?: number;
  readonly faulted_device_ids: readonly string[];
  readonly delay_until?: number;
}

const ENTRY_DELAY = "entry-delay";

/** The kinds a shared home's events may have; the core's policy chooses among them (T063). */
export const SHARED_HOME_KINDS: ReadonlySet<string> = new Set([
  "alarm.triggered",
  "flood",
]);

/**
 * A shared home's events as they are sent: only the kinds in `SHARED_HOME_KINDS`, each summary
 * starting with the home's name (untrusted text from Ring).
 */
export function fromSharedHome(
  events: readonly NormalizedEvent[],
  homeName: string,
): NormalizedEvent[] {
  return events
    .filter((event) => SHARED_HOME_KINDS.has(event.kind))
    .map((event) => ({ ...event, summary: `${homeName}: ${event.summary}` }));
}

/** What each known alarm state is called in a summary. */
const ALARM_WORDS: Readonly<Record<string, string>> = {
  "burglar-alarm": "The burglar alarm is going off",
  "burglar-accelerated-alarm": "The burglar alarm is going off",
  "user-verified-burglar-alarm": "The burglar alarm is going off, verified",
  "fire-alarm": "The fire alarm is going off",
  "fire-accelerated-alarm": "The fire alarm is going off",
  "co-alarm": "The carbon monoxide alarm is going off",
  "user-verified-co-or-fire-alarm":
    "The fire or carbon monoxide alarm is going off, verified",
  panic: "A panic alarm was raised",
};

const MODE_WORDS = { disarmed: "disarmed", home: "home", away: "away" };

/** Whether the location was armed at `at`: armed in `home` or `away`, past any exit delay. */
export function armedAt(
  location: HubLocation | undefined,
  panel: HubPanel | undefined,
  at: number,
): boolean {
  const mode = location?.alarm_mode;
  if (mode !== "home" && mode !== "away") {
    return false;
  }
  const delayRuns = panel?.delay_until !== undefined && panel.delay_until > at;
  return !delayRuns || panel.alarm_state === ENTRY_DELAY;
}

/**
 * The events one device change makes, from the entry it replaces; none when there was none, or the
 * change is not a transition the bridge reports. `at` is when the home received it.
 */
export function deviceChangeEvents(
  previous: HubDevice | undefined,
  current: HubDevice,
  context: { readonly at: number; readonly armed: boolean },
): NormalizedEvent[] {
  if (previous?.type !== current.type) {
    return [];
  }
  const turned = (key: string): boolean | undefined => {
    const before = previous.state[key];
    const after = current.state[key];
    return typeof before === "boolean" &&
      typeof after === "boolean" &&
      before !== after
      ? after
      : undefined;
  };
  const event = (
    kind: string,
    code: string,
    summary: string,
  ): NormalizedEvent => ({
    event_id: eventId(`${current.device_id}-${code}`, context.at),
    location_id: current.location_id,
    device_id: current.device_id,
    device_type: current.type,
    kind,
    occurred_at: context.at,
    name: current.name,
    summary,
    armed: context.armed,
  });
  switch (current.type) {
    case "contact": {
      const open = turned("open");
      if (open === undefined) {
        return [];
      }
      return [
        open
          ? event("contact.open", "open", `${current.name} opened.`)
          : event("contact.closed", "closed", `${current.name} closed.`),
      ];
    }
    case "motion":
      return turned("motion") === true
        ? [event("motion", "motion", `Motion at ${current.name}.`)]
        : [];
    case "flood":
      return turned("flood") === true
        ? [event("flood", "flood", `Water detected at ${current.name}.`)]
        : [];
    case "keypad":
    case "base_station":
    case "camera":
    case "doorbell":
    case "light":
    case "other":
      return [];
  }
}

/** The event for a location's alarm mode changing; none for the first sight or the same mode. */
export function modeChangeEvent(
  previous: HubLocation | undefined,
  current: HubLocation,
  at: number,
): NormalizedEvent | undefined {
  const before = previous?.alarm_mode;
  const after = current.alarm_mode;
  if (before === undefined || after === undefined || before === after) {
    return undefined;
  }
  return {
    event_id: eventId(`${current.location_id}-mode`, at),
    location_id: current.location_id,
    kind: "mode.changed",
    occurred_at: at,
    summary: `The alarm mode changed from ${MODE_WORDS[before]} to ${MODE_WORDS[after]}.`,
    data: { from: before, to: after },
    armed: after !== "disarmed",
  };
}

/**
 * The event for the alarm going off; none while it is quiet, during an entry delay, or while the
 * same alarm goes on. `nameOf` gives a device's name for the summary.
 */
export function alarmEvent(
  previous: HubPanel | undefined,
  current: HubPanel,
  context: {
    readonly at: number;
    readonly nameOf: (deviceId: string) => string | undefined;
  },
): NormalizedEvent | undefined {
  const state = current.alarm_state;
  if (state === undefined || state === ENTRY_DELAY) {
    return undefined;
  }
  if (
    previous?.alarm_state === state &&
    previous.alarm_id === current.alarm_id
  ) {
    return undefined;
  }
  const known = Object.hasOwn(ALARM_WORDS, state);
  const names = current.faulted_device_ids
    .map((id) => context.nameOf(id))
    .filter((name): name is string => name !== undefined);
  const words =
    (known ? ALARM_WORDS[state] : undefined) ?? "The alarm is going off";
  const id =
    current.alarm_id === undefined
      ? eventId(`${current.location_id}-alarm`, current.alarm_at ?? context.at)
      : truncated(`alarm-${current.alarm_id}-${known ? state : "other"}`);
  return {
    event_id: id,
    location_id: current.location_id,
    kind: "alarm.triggered",
    occurred_at: current.alarm_at ?? context.at,
    summary:
      names.length === 0 ? `${words}.` : `${words}: ${names.join(", ")}.`,
    data: {
      alarm_state: known ? state : "other",
      faulted_device_ids: [...current.faulted_device_ids],
    },
    armed: true,
  };
}

// An id for one change: what changed and when the home saw it, within the log's length.
function eventId(subject: string, at: number): string {
  const suffix = `-${String(at)}`;
  return `${subject.slice(0, MAX_RING_EVENT_ID_LENGTH - suffix.length)}${suffix}`;
}

function truncated(id: string): string {
  return id.slice(0, MAX_RING_EVENT_ID_LENGTH);
}
