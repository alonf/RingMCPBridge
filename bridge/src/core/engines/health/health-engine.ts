// The Health engine's link rules (CP-11a, T018): pure functions, no I/O, thresholds as data (CD2,
// CD map v3). Every time is the core's own clock, the time a sign of life was received, never the
// home's clock, which may be off. Its view has the same fields as State's health snapshot, so the
// Event manager stores it as it is.
//
// - A session opening or a heartbeat is a sign of life: the home link is `up`, its `since` kept
//   while it stays up.
// - After `homeOfflineAfterMs` without one, the home link is `down` and the data `stale`, both
//   since the last sign of life [P] (OR5, FR-005).
// - The Ring session's status and the outbox depth come from the heartbeat; the Ring session's
//   `since` is kept while its status holds.
// - A Ring session that is not `ok` makes the data stale too, since it stopped being `ok` (SC-005,
//   T021): the home is up, but what it reports is no longer Ring's current state. With both down,
//   the data is stale since the earlier of the two.
// - A session opening owes the core a fresh inventory: the data stays stale until that session's
//   own inventory is stored, since the last time it was known true (FR-006, CP-14 review round
//   3). A heartbeat says the link is up, not that the data has caught up.
// - A heartbeat that says the home owes an inventory, because a change it saw could not be written
//   to its outbox, owes the same refresh, since the last sign of life before it (CP-14 review
//   round 5). The Event manager decides which inventory pays it.
// - A sign of life counts at the time the core received it. One older than the last does not move
//   `as_of` back, and one received the threshold ago or longer leaves the home down: `settled`.

/** The engine's thresholds, from the Config utility (`staleAfterMs`, 2 minutes by default). */
export interface HealthPolicy {
  readonly homeOfflineAfterMs: number;
}

/** The bridge's health as the engine sees it. A field not known is left out. */
export interface HealthView {
  readonly home_link_status?: "up" | "down";
  readonly home_link_since?: number;
  readonly ring_session_status?: "ok" | "unavailable" | "lost";
  readonly ring_session_since?: number;
  readonly push_status?: "ok" | "down";
  readonly push_since?: number;
  readonly last_event_at?: number;
  readonly stale_since?: number;
  readonly outbox_depth?: number;
  readonly connector_version?: string;
  /** The last sign of life from home, on the core's clock. */
  readonly as_of: number;
  /**
   * Since when a session has owed its own fresh inventory: the data was known true until then.
   * Left out once that inventory is stored.
   */
  readonly refresh_owed_since?: number;
}

/** What a heartbeat says about the home. */
export interface HeartbeatReading {
  readonly ring_session: "ok" | "unavailable" | "lost";
  /** `null` when the home could not read its outbox. */
  readonly outbox_depth: number | null;
  /** The home owes an inventory the core has not yet stored. */
  readonly inventory_owed: boolean;
}

/** A part of the health whose status changed. */
export type HealthPart = "home_link" | "ring_session";

type Mutable<T> = { -readonly [Key in keyof T]: T[Key] };

/**
 * The view after a session opened, at `now` on the core's clock, from the view as of now. The
 * session owes a fresh inventory, and the data was known true until the earliest of: a refresh
 * already owed, the time it became stale, and the last sign of life before this session. A home
 * that never reported, until now.
 */
export function afterSessionOpened(
  view: HealthView | undefined,
  connectorVersion: string,
  now: number,
): HealthView {
  return {
    ...homeUp(view, now),
    connector_version: connectorVersion,
    refresh_owed_since: knownTrueUntil(view, now),
  };
}

/** The view after the current session's own inventory was stored: nothing is owed any more. */
export function afterRefresh(view: HealthView): HealthView {
  const next: Mutable<HealthView> = { ...view };
  delete next.refresh_owed_since;
  return next;
}

/**
 * The view after a heartbeat received at `now` on the core's clock. A heartbeat that says an
 * inventory is owed owes a refresh, since the data was last known true.
 */
export function afterHeartbeat(
  view: HealthView | undefined,
  heartbeat: HeartbeatReading,
  now: number,
): HealthView {
  const up = homeUp(view, now);
  const sameSession = up.ring_session_status === heartbeat.ring_session;
  const next: Mutable<HealthView> = {
    ...up,
    ring_session_status: heartbeat.ring_session,
    ring_session_since:
      sameSession && up.ring_session_since !== undefined
        ? up.ring_session_since
        : now,
  };
  if (heartbeat.inventory_owed) {
    next.refresh_owed_since = knownTrueUntil(view, now);
  }
  if (heartbeat.outbox_depth === null) {
    delete next.outbox_depth;
  } else {
    next.outbox_depth = heartbeat.outbox_depth;
  }
  return next;
}

/**
 * The view as of `now`: a home up but silent for `homeOfflineAfterMs` or longer is down since its
 * last sign of life. The data is stale while the home is down, its Ring session is not `ok`, or a
 * session's own inventory is still owed, since the earliest of these (SC-005, FR-006).
 */
export function asOf(
  view: HealthView,
  now: number,
  policy: HealthPolicy,
): HealthView {
  const linked: HealthView = isSilent(view, now, policy)
    ? { ...view, home_link_status: "down", home_link_since: view.as_of }
    : view;
  const since = staleSince(linked);
  return since === undefined || since === linked.stale_since
    ? linked
    : { ...linked, stale_since: since };
}

/**
 * The view to store at `now` after a sign of life: one received `homeOfflineAfterMs` ago or longer
 * leaves the home down, as the silence check would store it, so a heartbeat that waited its turn
 * is never published as the home coming up.
 */
export function settled(
  view: HealthView,
  now: number,
  policy: HealthPolicy,
): HealthView {
  return isSilent(view, now, policy) ? asOf(view, now, policy) : view;
}

/** The parts whose status changed from `before` to `after`, in a fixed order. */
export function healthChanges(
  before: HealthView | undefined,
  after: HealthView,
): readonly HealthPart[] {
  const changed: HealthPart[] = [];
  if (before?.home_link_status !== after.home_link_status) {
    changed.push("home_link");
  }
  if (before?.ring_session_status !== after.ring_session_status) {
    changed.push("ring_session");
  }
  return changed;
}

function isSilent(
  view: HealthView,
  now: number,
  policy: HealthPolicy,
): boolean {
  return (
    view.home_link_status === "up" &&
    now - view.as_of >= policy.homeOfflineAfterMs
  );
}

// The earliest of: when the data was already stale, when the home link went down, when the Ring
// session stopped being `ok`, and since when a session's inventory has been owed. Undefined while
// all are fine.
function staleSince(view: HealthView): number | undefined {
  const times: number[] = [];
  if (view.stale_since !== undefined) {
    times.push(view.stale_since);
  }
  if (view.refresh_owed_since !== undefined) {
    times.push(view.refresh_owed_since);
  }
  if (view.home_link_status === "down" && view.home_link_since !== undefined) {
    times.push(view.home_link_since);
  }
  if (
    view.ring_session_status !== undefined &&
    view.ring_session_status !== "ok" &&
    view.ring_session_since !== undefined
  ) {
    times.push(view.ring_session_since);
  }
  return times.length === 0 ? undefined : Math.min(...times);
}

function knownTrueUntil(view: HealthView | undefined, now: number): number {
  if (view === undefined) {
    return now;
  }
  return Math.min(
    view.as_of,
    view.refresh_owed_since ?? view.as_of,
    view.stale_since ?? view.as_of,
  );
}

// The home is up from `now`, or since it came up if it already was. The link's own staleness ends;
// a refresh still owed stays. A sign of life older than the last one does not move `as_of` back.
function homeUp(view: HealthView | undefined, now: number): HealthView {
  const next: Mutable<HealthView> = {
    ...(view ?? { as_of: now }),
    home_link_status: "up",
    home_link_since:
      view?.home_link_status === "up" && view.home_link_since !== undefined
        ? view.home_link_since
        : now,
    as_of: Math.max(view?.as_of ?? now, now),
  };
  delete next.stale_since;
  return next;
}
