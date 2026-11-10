// The owner's sessions on the admin page (T029). Each starts with a fresh Entra sign-in and is found
// by a random cookie. They live in this process's memory: the core runs as one instance (FR-044),
// and a restart only means the owner signs in again. A session ends 30 minutes after its last use or
// 8 hours after it began [P]; the health panel's poll counts as use. At most 20 are kept, the
// oldest dropped first: only the owner signs in, from a few browsers.
import { randomBytes } from "node:crypto";
import type { Clock } from "../../../utilities/clock/index.ts";

const ID_BYTES = 32;
const MINUTE_MS = 60_000;
/** How long a session lasts after its last use [P]. */
export const SESSION_IDLE_MS = 30 * MINUTE_MS;
/** How long a session lasts at most [P]. */
export const SESSION_MAX_MS = 8 * 60 * MINUTE_MS;
const MAX_SESSIONS = 20;

/** Something to tell the owner on the next page, once. */
export type Notice =
  | { readonly kind: "approved"; readonly revoked: number }
  | { readonly kind: "not_pending" }
  | { readonly kind: "code_mismatch" }
  | { readonly kind: "sign_in_stale" }
  | { readonly kind: "not_serving" }
  | { readonly kind: "unavailable" };

/** A signed-in owner. */
export interface OwnerSession {
  /** The session cookie's value. */
  readonly id: string;
  /** The token each of the session's forms carries. */
  readonly formToken: string;
  /** When the owner last entered their credentials, by Entra's account. */
  readonly authenticatedAt: number;
}

interface Entry {
  readonly session: OwnerSession;
  readonly startedAt: number;
  lastUsedAt: number;
  notice: Notice | undefined;
}

/** The sessions open now. One per core process. */
export class OwnerSessions {
  readonly #clock: Clock;
  readonly #entries = new Map<string, Entry>();

  constructor(clock: Clock) {
    this.#clock = clock;
  }

  /** Opens a session for an owner who has just signed in. */
  open(authenticatedAt: number): OwnerSession {
    const now = this.#clock.now();
    this.#dropEnded(now);
    while (this.#entries.size >= MAX_SESSIONS) {
      const oldest = this.#entries.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      this.#entries.delete(oldest);
    }
    const session: OwnerSession = {
      id: randomText(),
      formToken: randomText(),
      authenticatedAt,
    };
    this.#entries.set(session.id, {
      session,
      startedAt: now,
      lastUsedAt: now,
      notice: undefined,
    });
    return session;
  }

  /** The open session with this id, counted as used now; `undefined` when there is none. */
  use(id: string | undefined): OwnerSession | undefined {
    if (id === undefined) {
      return undefined;
    }
    const entry = this.#entries.get(id);
    if (entry === undefined) {
      return undefined;
    }
    const now = this.#clock.now();
    if (ended(entry, now)) {
      this.#entries.delete(id);
      return undefined;
    }
    entry.lastUsedAt = now;
    return entry.session;
  }

  /** Ends a session. Ending one that is gone changes nothing. */
  end(id: string): void {
    this.#entries.delete(id);
  }

  /** Keeps a notice for the session's next page. */
  tell(id: string, notice: Notice): void {
    const entry = this.#entries.get(id);
    if (entry !== undefined) {
      entry.notice = notice;
    }
  }

  /** The notice kept for this session, once. */
  takeNotice(id: string): Notice | undefined {
    const entry = this.#entries.get(id);
    const notice = entry?.notice;
    if (entry !== undefined) {
      entry.notice = undefined;
    }
    return notice;
  }

  #dropEnded(now: number): void {
    for (const [id, entry] of this.#entries) {
      if (ended(entry, now)) {
        this.#entries.delete(id);
      }
    }
  }
}

function ended(entry: Entry, now: number): boolean {
  return (
    now - entry.lastUsedAt >= SESSION_IDLE_MS ||
    now - entry.startedAt >= SESSION_MAX_MS
  );
}

function randomText(): string {
  return randomBytes(ID_BYTES).toString("base64url");
}
