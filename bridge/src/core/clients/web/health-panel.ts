// The Health section's content (T029; FR-005, FR-040; UX U3, U4): `get_health`'s data as rows, each
// status a word with a tone the page shows as an icon and a colour, each with its time; a banner
// for each thing that is down, saying what it means and what to do; and "connector behind". A pure
// function of what Inquiry read, so the page and the poll render the same thing.
import type { OwnerHealth } from "../../managers/inquiry/index.ts";

/** How a status reads: each tone has its own icon, so colour is never the only sign. */
export type Tone = "ok" | "warn" | "bad" | "none";

/** One row: what it is, its status as a word, and when or what. */
export interface StatusRow {
  readonly label: string;
  readonly word: string;
  readonly tone: Tone;
  readonly detail: string;
}

/** Something down: what it means and what to do. */
export interface Banner {
  readonly tone: "warn" | "bad";
  readonly title: string;
  readonly action: string;
}

/** The section's content. */
export interface HealthPanel {
  /** When the data was true, in the home's time; absent when nothing could be read. */
  readonly asOf?: string;
  readonly rows: readonly StatusRow[];
  readonly banners: readonly Banner[];
}

const STORE_DOWN: Banner = {
  tone: "bad",
  title: "The bridge's database is not answering",
  action:
    "What the page shows may be old. It tries again every 15 seconds; if this lasts, check the database in Azure.",
};

const HOME_OFFLINE: Banner = {
  tone: "bad",
  title: "The home is offline",
  action:
    "The connector has not been heard from for 2 minutes. Check that the machine it runs on is on and online; its service restarts it.",
};

const RING_LOST: Banner = {
  tone: "bad",
  title: "Ring signed the home out",
  action:
    "At home, delete secrets.sealed from the connector's data folder, run the setup again, and approve its new code here.",
};

/** The section when Inquiry could not read the health: the store is down. */
export const UNREADABLE_PANEL: HealthPanel = {
  rows: [],
  banners: [STORE_DOWN],
};

/** The section's content from what Inquiry read, and the core's own version. */
export function healthPanel(
  read: OwnerHealth,
  coreVersion: string,
): HealthPanel {
  const { data } = read.health;
  const time = timeIn(read.time_zone);
  const rows: StatusRow[] = [
    {
      label: "Home link",
      word: data.home_link.status === "up" ? "Connected" : "Offline",
      tone: data.home_link.status === "up" ? "ok" : "bad",
      detail: `since ${time(data.home_link.since)}`,
    },
    {
      label: "Ring",
      ...RING_WORDS[data.ring_session.status],
      detail: `since ${time(data.ring_session.since)}`,
    },
  ];
  if (data.push !== undefined) {
    rows.push({
      label: "Push",
      word: data.push.status === "ok" ? "OK" : "Down",
      tone: data.push.status === "ok" ? "ok" : "bad",
      detail: `since ${time(data.push.since)}`,
    });
  }
  if (data.last_event_at !== undefined) {
    rows.push({
      label: "Last event",
      word: "Received",
      tone: "none",
      detail: time(data.last_event_at),
    });
  }
  rows.push(
    {
      label: "Database",
      word: data.database.status === "ok" ? "OK" : "Down",
      tone: data.database.status === "ok" ? "ok" : "bad",
      detail: data.database.status === "ok" ? "answering" : "not answering",
    },
    connectorRow(read.connector_version, coreVersion),
  );
  return {
    asOf: time(read.health.as_of),
    rows,
    banners: banners(read, time),
  };
}

const RING_WORDS: Readonly<
  Record<
    OwnerHealth["health"]["data"]["ring_session"]["status"],
    Pick<StatusRow, "word" | "tone">
  >
> = {
  ok: { word: "OK", tone: "ok" },
  unavailable: { word: "Unavailable", tone: "warn" },
  lost: { word: "Signed out", tone: "bad" },
};

function banners(read: OwnerHealth, time: (utc: string) => string): Banner[] {
  const { data } = read.health;
  const found: Banner[] = [];
  if (data.database.status === "down") {
    found.push(STORE_DOWN);
  }
  if (data.home_link.status === "down") {
    found.push(HOME_OFFLINE);
  }
  if (data.ring_session.status === "lost") {
    found.push(RING_LOST);
  }
  if (data.home_link.status === "up" && read.health.stale_since !== undefined) {
    found.push({
      tone: "warn",
      title: `The home's data is out of date since ${time(read.health.stale_since)}`,
      action:
        "Agents are told so with each answer. It is current again once the connector's next full update arrives.",
    });
  }
  return found;
}

function connectorRow(
  connectorVersion: string | undefined,
  coreVersion: string,
): StatusRow {
  if (connectorVersion === undefined) {
    return {
      label: "Connector",
      word: "Not linked",
      tone: "none",
      detail: "No connector has linked yet.",
    };
  }
  if (connectorBehind(connectorVersion, coreVersion)) {
    return {
      label: "Connector",
      word: "Update",
      tone: "warn",
      detail: `v${connectorVersion}; the core is v${coreVersion}. Pull the new image at home and restart the connector.`,
    };
  }
  return {
    label: "Connector",
    word: "Current",
    tone: "ok",
    detail: `v${connectorVersion}`,
  };
}

const VERSION = /^(\d+)\.(\d+)\.(\d+)$/;
const VERSION_PARTS = 3;

/**
 * Whether the connector runs an older release than the core [P]: both are `major.minor.patch`, and
 * the connector's is lower. A version in any other form is never called behind.
 */
export function connectorBehind(
  connectorVersion: string,
  coreVersion: string,
): boolean {
  const connector = VERSION.exec(connectorVersion);
  const core = VERSION.exec(coreVersion);
  if (connector === null || core === null) {
    return false;
  }
  for (let part = 1; part <= VERSION_PARTS; part += 1) {
    const difference = Number(connector[part]) - Number(core[part]);
    if (difference !== 0) {
      return difference < 0;
    }
  }
  return false;
}

/** A time, UTC text or epoch milliseconds, as the owner reads it: the home's local date and time. */
export function timeIn(timeZone: string): (time: string | number) => string {
  const format = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    dateStyle: "medium",
    timeStyle: "medium",
  });
  return (time) => format.format(new Date(time));
}
