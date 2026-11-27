// Read marks (CP-12, T051; FR-010, FR-011): where each client last read to, per location, in the
// core's database. `get_events` without a cursor starts after the client's mark.
//
// - **A mark only moves forward** within an epoch, so a slow or repeated read can never make a
//   client read an event twice or lose its place; a new epoch replaces the old mark.
// - **Never hidden.** A mark from an older epoch is given back as it is, with its epoch, so the
//   reader can say the epoch changed (PT-28).
// - The marks are kept per client id, separately: two clients never share one.
import { z } from "zod";
import type { Clock } from "../../../utilities/clock/index.ts";
import {
  upsertStatement,
  QueryLayerError,
} from "../../../utilities/query-layer/index.ts";
import type { QueryLayer } from "../../../utilities/query-layer/index.ts";
import { SubscriptionsError } from "./subscriptions-store.ts";

/** Where a client has read to in one location's log. */
export interface ReadMark {
  readonly epoch: number;
  readonly seq: number;
}

/** What the store is made over. */
export interface CursorStoreOptions {
  readonly store: QueryLayer;
  readonly clock: Clock;
}

const ROW = z.object({ epoch: z.number().int(), seq: z.number().int() });
const SELECT_MARK =
  "SELECT epoch, seq FROM event_cursor WHERE client_id = @client_id AND location_id = @location_id";

/** The clients' read marks. One per core process. */
export class CursorStore {
  readonly #store: QueryLayer;
  readonly #clock: Clock;

  constructor(options: CursorStoreOptions) {
    this.#store = options.store;
    this.#clock = options.clock;
  }

  /** The client's mark in the location, or `undefined` when it has none. */
  async mark(
    clientId: string,
    locationId: string,
    signal: AbortSignal,
  ): Promise<ReadMark | undefined> {
    const params = { client_id: clientId, location_id: locationId };
    const row = await this.#guard(signal, () =>
      this.#store.get({ sql: SELECT_MARK, params }, signal),
    );
    if (row === undefined) {
      return undefined;
    }
    const { epoch, seq } = ROW.parse(row);
    return { epoch, seq };
  }

  /**
   * Moves the client's mark to `mark`, when that is ahead of the stored one in the same epoch, or
   * in a later epoch than it; otherwise nothing changes.
   */
  async advance(
    clientId: string,
    locationId: string,
    mark: ReadMark,
    signal: AbortSignal,
  ): Promise<void> {
    await this.#guard(signal, () =>
      this.#store.transaction(async (session) => {
        const params = { client_id: clientId, location_id: locationId };
        const row = await session.get({ sql: SELECT_MARK, params }, signal);
        if (row !== undefined) {
          const held = ROW.parse(row);
          const behind =
            mark.epoch < held.epoch ||
            (mark.epoch === held.epoch && mark.seq <= held.seq);
          if (behind) {
            return;
          }
        }
        await session.run(
          upsertStatement(this.#store.dialect, {
            table: "event_cursor",
            key: ["client_id", "location_id"],
            values: {
              client_id: clientId,
              location_id: locationId,
              epoch: mark.epoch,
              seq: mark.seq,
              updated_at: this.#clock.now(),
            },
            onConflict: "update",
          }),
          signal,
        );
      }, signal),
    );
  }

  async #guard<T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      signal.throwIfAborted();
      if (error instanceof QueryLayerError) {
        throw new SubscriptionsError(
          error.kind === "store_down" ? "unavailable" : "failed",
          "The read marks could not be reached.",
          { cause: error },
        );
      }
      throw error;
    }
  }
}
