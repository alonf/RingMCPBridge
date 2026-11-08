// The owner's Entra sign-ins in flight, between the redirect to Entra and the return (T023). Each
// is found by its `state`, once, for 10 minutes, the sign-in client's own limit. They live in this
// process's memory: the core runs as one instance (FR-044), and a restart only means the owner
// starts the link again. At most 100 wait; a new one beyond that pushes out the oldest.
import type { Clock } from "../../../utilities/clock/index.ts";
import type { PendingSignIn } from "../../../utilities/security/index.ts";

const PENDING_TTL_MS = 10 * 60_000;
const MAX_PENDING = 100;

/** A sign-in in flight: what the sign-in client keeps, and the authorization it belongs to. */
export interface PendingLink {
  /** The provider's interaction, which the owner's sign-in finishes. */
  readonly uid: string;
  readonly pending: PendingSignIn;
}

interface Entry {
  readonly link: PendingLink;
  readonly expiresAt: number;
}

/** The sign-ins in flight. */
export class PendingSignIns {
  readonly #clock: Clock;
  readonly #entries = new Map<string, Entry>();

  constructor(clock: Clock) {
    this.#clock = clock;
  }

  /** Keeps a sign-in under its `state`. */
  add(link: PendingLink): void {
    const now = this.#clock.now();
    for (const [state, entry] of this.#entries) {
      if (entry.expiresAt <= now) {
        this.#entries.delete(state);
      }
    }
    while (this.#entries.size >= MAX_PENDING) {
      const oldest = this.#entries.keys().next();
      if (oldest.done === true) {
        break;
      }
      this.#entries.delete(oldest.value);
    }
    this.#entries.set(link.pending.state, {
      link,
      expiresAt: now + PENDING_TTL_MS,
    });
  }

  /** Takes the sign-in with this `state`, once; `undefined` when there is none or its time is up. */
  take(state: string): PendingLink | undefined {
    const entry = this.#entries.get(state);
    this.#entries.delete(state);
    return entry !== undefined && entry.expiresAt > this.#clock.now()
      ? entry.link
      : undefined;
  }
}
