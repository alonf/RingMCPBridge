// Subscriptions (CP-12/CP-13, T048; FR-010, FR-012): the MCP Events webhook subscriptions in the
// core's database. The cursors per client and location come with T051.
//
// - **Sealed.** A subscription's callback address and signing secret are stored sealed with the
//   delivery key, so a copy of the database alone reveals neither. A row that does not open (a
//   different key, a damaged row) is skipped as if expired; the client's next renewal stores it
//   again.
// - **One row per subscription.** Its id is derived from the client, the event type and the
//   callback, so a renewal updates the row's secret and expiry rather than adding a second row.
// - **Expiry.** `active` returns only rows whose expiry is still ahead. Ending a subscription when
//   the client pauses it cannot be counted on (research.md, T039 part 2), so expiry is the end.
// - Callback addresses and secrets are never logged or returned outside Delivery (FR-034).
import { createHash } from "node:crypto";
import { z } from "zod";
import type { Clock } from "../../../utilities/clock/index.ts";
import {
  QueryLayerError,
  upsertStatement,
} from "../../../utilities/query-layer/index.ts";
import type {
  QueryLayer,
  SqlRow,
} from "../../../utilities/query-layer/index.ts";
import {
  open as unseal,
  seal,
  Secret,
} from "../../../utilities/security/index.ts";
import type { DeliveryKeySource } from "./delivery-key.ts";

const PURPOSE = "delivery-subscription";
const ID_HASH_CHARACTERS = 32;

/** A webhook subscription as Delivery uses it. */
export interface WebhookSubscription {
  readonly sub_id: string;
  readonly client_id: string;
  readonly event_name: string;
  readonly callback: URL;
  /** The signing key's bytes from the client's `whsec_` secret. */
  readonly signing_key: Secret<Uint8Array>;
  readonly expires_at: number;
}

/** A subscription to store: who, for which event type, where, and the signing key. */
export interface NewSubscription {
  readonly client_id: string;
  readonly event_name: string;
  readonly callback: URL;
  readonly signing_key: Secret<Uint8Array>;
  readonly expires_at: number;
}

/**
 * - `unavailable`: the database could not be reached;
 * - `not_set_up`: the delivery key is not set, so nothing can be stored sealed;
 * - `failed`: the database refused a statement.
 */
export type SubscriptionsErrorKind = "unavailable" | "not_set_up" | "failed";

/** A Subscriptions operation that did not succeed. Its message never quotes a stored value. */
export class SubscriptionsError extends Error {
  readonly kind: SubscriptionsErrorKind;

  constructor(
    kind: SubscriptionsErrorKind,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "SubscriptionsError";
    this.kind = kind;
  }
}

/** What the store is made over. */
export interface SubscriptionsStoreOptions {
  readonly store: QueryLayer;
  readonly key: DeliveryKeySource;
  readonly clock: Clock;
}

const ROW = z.object({
  sub_id: z.string(),
  client_id: z.string(),
  event_name: z.string(),
  delivery: z.instanceof(Uint8Array),
  expires_at: z.number().int(),
});
const SEALED = z.object({ url: z.url(), key: z.string() });

const SELECT_CURRENT =
  "SELECT sub_id, client_id, event_name, delivery, expires_at FROM webhook_subscription WHERE sub_id = @sub_id AND expires_at > @now";
const SELECT_ACTIVE =
  "SELECT sub_id, client_id, event_name, delivery, expires_at FROM webhook_subscription WHERE event_name = @event_name AND expires_at > @now ORDER BY sub_id";
const DELETE_OWN =
  "DELETE FROM webhook_subscription WHERE sub_id = @sub_id AND client_id = @client_id";
const DELETE_ONE = "DELETE FROM webhook_subscription WHERE sub_id = @sub_id";
const DELETE_EXPIRED =
  "DELETE FROM webhook_subscription WHERE expires_at <= @now";

/** The subscription id for a client, an event type and a callback: the same for a renewal. */
export function subscriptionId(
  clientId: string,
  eventName: string,
  callback: URL,
): string {
  return createHash("sha256")
    .update(`${clientId}\n${eventName}\n${callback.href}`)
    .digest("base64url")
    .slice(0, ID_HASH_CHARACTERS);
}

/** The webhook subscriptions. One per core process. */
export class SubscriptionsStore {
  readonly #store: QueryLayer;
  readonly #key: DeliveryKeySource;
  readonly #clock: Clock;

  constructor(options: SubscriptionsStoreOptions) {
    this.#store = options.store;
    this.#key = options.key;
    this.#clock = options.clock;
  }

  /** Stores a subscription, or renews the same one; returns its id. */
  async save(
    subscription: NewSubscription,
    signal: AbortSignal,
  ): Promise<string> {
    const key = await this.#requireKey(signal);
    const subId = subscriptionId(
      subscription.client_id,
      subscription.event_name,
      subscription.callback,
    );
    const sealed = seal(
      key.reveal(),
      Buffer.from(
        JSON.stringify({
          url: subscription.callback.href,
          key: Buffer.from(subscription.signing_key.reveal()).toString(
            "base64",
          ),
        }),
        "utf8",
      ),
      PURPOSE,
    );
    await this.#guard(signal, () =>
      this.#store.run(
        upsertStatement(this.#store.dialect, {
          table: "webhook_subscription",
          key: ["sub_id"],
          values: {
            sub_id: subId,
            client_id: subscription.client_id,
            event_name: subscription.event_name,
            delivery: sealed,
            created_at: this.#clock.now(),
            expires_at: subscription.expires_at,
          },
          onConflict: "update",
        }),
        signal,
      ),
    );
    return subId;
  }

  /** The subscriptions to `eventName` whose expiry is still ahead, opened. */
  async active(
    eventName: string,
    signal: AbortSignal,
  ): Promise<readonly WebhookSubscription[]> {
    const key = await this.#key.key(signal);
    if (key === undefined) {
      return [];
    }
    const rows = await this.#guard(signal, () =>
      this.#store.all(
        {
          sql: SELECT_ACTIVE,
          params: { event_name: eventName, now: this.#clock.now() },
        },
        signal,
      ),
    );
    return rows.flatMap((row) => opened(row, key));
  }

  /**
   * The subscription as it stands now, or `undefined` when it has ended, expired, or does not open.
   * Delivery reads it again before every retry (T050's review).
   */
  async current(
    subId: string,
    signal: AbortSignal,
  ): Promise<WebhookSubscription | undefined> {
    const key = await this.#key.key(signal);
    if (key === undefined) {
      return undefined;
    }
    const row = await this.#guard(signal, () =>
      this.#store.get(
        {
          sql: SELECT_CURRENT,
          params: { sub_id: subId, now: this.#clock.now() },
        },
        signal,
      ),
    );
    return row === undefined ? undefined : opened(row, key)[0];
  }

  /** Ends a client's own subscription. Ending one that is not there is not an error. */
  async remove(
    subId: string,
    clientId: string,
    signal: AbortSignal,
  ): Promise<void> {
    await this.#guard(signal, () =>
      this.#store.run(
        { sql: DELETE_OWN, params: { sub_id: subId, client_id: clientId } },
        signal,
      ),
    );
  }

  /** Ends a subscription whose callback said it is gone (410). */
  async forget(subId: string, signal: AbortSignal): Promise<void> {
    await this.#guard(signal, () =>
      this.#store.run({ sql: DELETE_ONE, params: { sub_id: subId } }, signal),
    );
  }

  /** Deletes the subscriptions whose expiry has passed; returns how many. */
  async purgeExpired(signal: AbortSignal): Promise<number> {
    return this.#guard(signal, () =>
      this.#store.run(
        { sql: DELETE_EXPIRED, params: { now: this.#clock.now() } },
        signal,
      ),
    );
  }

  async #requireKey(signal: AbortSignal): Promise<Secret<Uint8Array>> {
    const key = await this.#key.key(signal);
    if (key === undefined) {
      throw new SubscriptionsError(
        "not_set_up",
        "Event delivery is not set up on this bridge: its delivery-sealing-key is not set.",
      );
    }
    return key;
  }

  async #guard<T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      signal.throwIfAborted();
      if (error instanceof QueryLayerError) {
        throw new SubscriptionsError(
          error.kind === "store_down" ? "unavailable" : "failed",
          "The subscriptions could not be reached.",
          { cause: error },
        );
      }
      throw error;
    }
  }
}

// A row opened with the key, or nothing when it does not open or holds what this store did not
// write.
function opened(
  row: SqlRow,
  key: Secret<Uint8Array>,
): readonly WebhookSubscription[] {
  const parsed = ROW.safeParse(row);
  if (!parsed.success) {
    return [];
  }
  let delivery: z.infer<typeof SEALED>;
  try {
    const plaintext = unseal(key.reveal(), parsed.data.delivery, PURPOSE);
    delivery = SEALED.parse(
      JSON.parse(Buffer.from(plaintext).toString("utf8")),
    );
  } catch {
    return [];
  }
  return [
    {
      sub_id: parsed.data.sub_id,
      client_id: parsed.data.client_id,
      event_name: parsed.data.event_name,
      callback: new URL(delivery.url),
      signing_key: new Secret(
        new Uint8Array(Buffer.from(delivery.key, "base64")),
      ),
      expires_at: parsed.data.expires_at,
    },
  ];
}
