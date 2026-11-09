// Lease (CP-10, T026): the single-instance lease (FR-044, CD C6). One row per Ring account in the
// `lease` table, which Lease owns. The instance that holds it renews it every 15 s, and the row
// expires 45 s after its last renewal, so another instance may take it over only then. An instance
// without the lease controls nothing (fail closed), and its status says why it lacks it, for
// `/readyz` (data-model.md "Single writer").
//
// - **Taking or keeping it** is one statement per dialect. It writes only when the row is absent,
//   already this instance's, or expired, so of two instances asking at once only one writes.
// - **The hold ends before the row does.** Each instance compares times on its own clock. The
//   holder counts on the lease for 30 s from the start of its last successful renewal, 15 s before
//   the row expires, so two instances whose clocks differ by less than 15 s never both hold it. The
//   time is read before the write, so a slow write never stretches the hold (DRIFT-001-46).
// - **Fail closed.** A renewal that finds another holder drops the hold at once. One that fails
//   (the database down, or a write past its deadline) does not extend it, so it runs out by itself.
// - **One write at a time**, each with a deadline. A tick while one is in flight joins it.
// - **Stopping** waits for the write in flight, then removes this instance's row, so the next
//   instance takes over at its next renewal instead of when the row expires.
import { randomBytes } from "node:crypto";
import type { Cancel, Clock } from "../../../utilities/clock/index.ts";
import type {
  QueryLayer,
  SqlDialect,
  SqlParams,
} from "../../../utilities/query-layer/index.ts";

/** How often an instance takes or keeps the lease. */
export const LEASE_RENEW_MS = 15_000;
/** How long the row lasts after a renewal. Another instance may take the lease only after it. */
export const LEASE_EXPIRES_MS = 45_000;
/** How long the holder counts on the lease after a renewal: one renewal short of the row's end. */
export const LEASE_HELD_MS = LEASE_EXPIRES_MS - LEASE_RENEW_MS;
/** How long one write may take before it counts as failed, at most. */
export const LEASE_WRITE_TIMEOUT_MS = 10_000;

/**
 * How often the lease is renewed and how long its row lasts after a renewal. The holder counts on
 * it for the difference. Mode H uses the recorded 15 s and 45 s; mode A, whose lease guards one
 * local file, may use shorter ones (T027).
 */
export interface LeaseTiming {
  readonly renewMs: number;
  readonly expiresMs: number;
}

/** The recorded timing: renewed every 15 s, expiring after 45 s (FR-044). */
export const LEASE_TIMING: LeaseTiming = {
  renewMs: LEASE_RENEW_MS,
  expiresMs: LEASE_EXPIRES_MS,
};

const MAX_TEXT_LENGTH = 128;
const HOLDER_BYTES = 12;

/** Why an instance lacks the lease. */
export type LeaseLack =
  /** It has not asked yet. */
  | "not_started"
  /** Another instance holds it. */
  | "held_elsewhere"
  /** Its last write failed, so its hold ran out. */
  | "store_unavailable"
  /** Its hold ran out with no newer renewal. */
  | "expired"
  /** It was stopped. */
  | "stopped";

/** Whether this instance holds the lease now, and until when on its clock; or why it does not. */
export type LeaseStatus =
  | { readonly held: true; readonly until: number }
  | { readonly held: false; readonly reason: LeaseLack };

/** The part of the Query layer Lease uses. */
export type LeaseStore = Pick<QueryLayer, "dialect" | "run">;

/** What a Lease is built with. */
export interface LeaseOptions {
  /** The core's database (Azure SQL in mode H, SQLite in mode A), migrated by the Host. */
  readonly store: LeaseStore;
  readonly clock: Clock;
  /** The lease's name: one lease per Ring account. 1 to 128 characters. */
  readonly name: string;
  /** This instance's id, as the row stores it; a random one when left out. 1 to 128 characters. */
  readonly holder?: string;
  /** The recorded `LEASE_TIMING` when left out. The row must outlast two renewals. */
  readonly timing?: LeaseTiming;
}

const TAKE: Readonly<Record<SqlDialect, string>> = {
  sqlite:
    "INSERT INTO lease (name, holder, expires_at) VALUES (@name, @holder, @expires_at) ON CONFLICT (name) DO UPDATE SET holder = excluded.holder, expires_at = excluded.expires_at WHERE lease.holder = excluded.holder OR lease.expires_at <= @now",
  tsql: "MERGE INTO lease WITH (HOLDLOCK) AS [target] USING (VALUES (@name, @holder, @expires_at)) AS [source] (name, holder, expires_at) ON [target].name = [source].name WHEN MATCHED AND ([target].holder = [source].holder OR [target].expires_at <= @now) THEN UPDATE SET holder = [source].holder, expires_at = [source].expires_at WHEN NOT MATCHED THEN INSERT (name, holder, expires_at) VALUES ([source].name, [source].holder, [source].expires_at);",
};
const RELEASE = "DELETE FROM lease WHERE name = @name AND holder = @holder";

/** The single-instance lease, as one instance holds it. One per core process. */
export class Lease {
  readonly #store: LeaseStore;
  readonly #clock: Clock;
  readonly #name: string;
  readonly #timing: LeaseTiming;
  readonly #holder: string;
  #heldUntil = 0;
  #lack: LeaseLack = "not_started";
  #timer: Cancel | undefined;
  #stopped = false;
  #inFlight: Promise<LeaseStatus> | undefined;

  constructor(options: LeaseOptions) {
    const holder =
      options.holder ?? randomBytes(HOLDER_BYTES).toString("base64url");
    checkText(options.name, "A lease name");
    checkText(holder, "A holder");
    const timing = options.timing ?? LEASE_TIMING;
    if (
      !Number.isInteger(timing.renewMs) ||
      timing.renewMs < 1 ||
      !Number.isInteger(timing.expiresMs) ||
      timing.expiresMs <= 2 * timing.renewMs
    ) {
      throw new RangeError(
        "A lease is renewed every whole number of milliseconds, and its row outlasts two renewals.",
      );
    }
    this.#timing = timing;
    this.#store = options.store;
    this.#clock = options.clock;
    this.#name = options.name;
    this.#holder = holder;
  }

  /** This instance's id, as the row stores it. */
  get holder(): string {
    return this.#holder;
  }

  /** Whether this instance holds the lease now. Control acts only while it does (fail closed). */
  get held(): boolean {
    return this.#heldUntil > this.#clock.now();
  }

  /** Whether this instance holds the lease now, or why it does not, for `/readyz`. */
  get status(): LeaseStatus {
    return this.held
      ? { held: true, until: this.#heldUntil }
      : { held: false, reason: this.#lack };
  }

  /** Takes or keeps the lease now, then every 15 s until `stop`. A second call does nothing. */
  start(): void {
    if (this.#timer !== undefined || this.#stopped) {
      return;
    }
    this.#timer = this.#clock.every(this.#timing.renewMs, () => {
      void this.renew();
    });
    void this.renew();
  }

  /**
   * One attempt to take or keep the lease now; a call while one is in flight joins it. Resolves
   * with the status after it and never rejects: a failed write leaves the hold to run out.
   */
  renew(): Promise<LeaseStatus> {
    if (this.#stopped) {
      return Promise.resolve(this.status);
    }
    this.#inFlight ??= this.#attempt().finally(() => {
      this.#inFlight = undefined;
    });
    return this.#inFlight;
  }

  /** Resolves once the write in flight, if any, has finished. */
  async settled(): Promise<void> {
    await this.#inFlight;
  }

  /**
   * Stops renewing and lets the lease go. The hold ends at once. Once the write in flight has
   * finished, this instance's row is removed, so the next instance takes over at its next renewal.
   * A row that cannot be removed (the database down) expires by itself.
   */
  async stop(): Promise<void> {
    this.#timer?.();
    this.#timer = undefined;
    this.#stopped = true;
    this.#heldUntil = 0;
    this.#lack = "stopped";
    await this.#inFlight;
    await this.#write(RELEASE, {
      name: this.#name,
      holder: this.#holder,
    }).catch(() => 0);
  }

  async #attempt(): Promise<LeaseStatus> {
    const startedAt = this.#clock.now();
    let written: number;
    try {
      written = await this.#write(TAKE[this.#store.dialect], {
        name: this.#name,
        holder: this.#holder,
        expires_at: startedAt + this.#timing.expiresMs,
        now: startedAt,
      });
    } catch {
      this.#recordFailure();
      return this.status;
    }
    if (!this.#stopped) {
      this.#heldUntil =
        written > 0
          ? startedAt + this.#timing.expiresMs - this.#timing.renewMs
          : 0;
      this.#lack = written > 0 ? "expired" : "held_elsewhere";
    }
    return this.status;
  }

  // The hold is left to run out on its own end; once it has, the failure is the reason.
  #recordFailure(): void {
    if (!this.#stopped) {
      this.#lack = "store_unavailable";
    }
  }

  // One statement with a deadline on the instance's clock, so a write that hangs counts as failed.
  async #write(sql: string, params: SqlParams): Promise<number> {
    const deadline = new AbortController();
    const timeoutMs = Math.min(LEASE_WRITE_TIMEOUT_MS, this.#timing.renewMs);
    const cancel = this.#clock.schedule(timeoutMs, () => {
      deadline.abort(new Error("The lease write took too long."));
    });
    try {
      return await this.#store.run({ sql, params }, deadline.signal);
    } finally {
      cancel();
    }
  }
}

function checkText(text: string, what: string): void {
  if (text.length === 0 || text.length > MAX_TEXT_LENGTH) {
    throw new RangeError(
      `${what} must be 1 to ${String(MAX_TEXT_LENGTH)} characters long.`,
    );
  }
}
