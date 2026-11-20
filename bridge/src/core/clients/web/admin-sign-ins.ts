// The admin page's Entra sign-ins in flight, between the redirect to Entra and the return (T029), as
// the Issuer keeps its own (DRIFT-001-40). Each is found by its `state`, once, for 10 minutes, the
// sign-in client's own limit, and is bound to the browser that started it by a cookie of which only
// the hash is kept. They live in this process's memory. At most 20 wait; a new one beyond that
// pushes out the oldest.
import type { Clock } from "../../../utilities/clock/index.ts";
import type { PendingSignIn } from "../../../utilities/security/index.ts";

const PENDING_TTL_MS = 10 * 60_000;
const MAX_PENDING = 20;

/** The admin page's sections a sign-in returns to. */
export type Section = "health" | "enroll";

/** A sign-in in flight. */
export interface AdminSignIn {
  readonly pending: PendingSignIn;
  /** The SHA-256 of the cookie that binds the sign-in to the browser that started it. */
  readonly binding: string;
  /** Where the owner goes once signed in. */
  readonly then: Section;
}

interface Entry {
  readonly signIn: AdminSignIn;
  readonly expiresAt: number;
}

/** The sign-ins in flight. One per core process. */
export class AdminSignIns {
  readonly #clock: Clock;
  readonly #entries = new Map<string, Entry>();

  constructor(clock: Clock) {
    this.#clock = clock;
  }

  /** Keeps a sign-in under its `state`. */
  add(signIn: AdminSignIn): void {
    const now = this.#clock.now();
    for (const [state, entry] of this.#entries) {
      if (entry.expiresAt <= now) {
        this.#entries.delete(state);
      }
    }
    while (this.#entries.size >= MAX_PENDING) {
      const oldest = this.#entries.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      this.#entries.delete(oldest);
    }
    this.#entries.set(signIn.pending.state, {
      signIn,
      expiresAt: now + PENDING_TTL_MS,
    });
  }

  /** Takes the sign-in with this `state`: once, and only before it expires. */
  take(state: string): AdminSignIn | undefined {
    const entry = this.#entries.get(state);
    this.#entries.delete(state);
    return entry === undefined || entry.expiresAt <= this.#clock.now()
      ? undefined
      : entry.signIn;
  }
}
