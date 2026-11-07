// Grants (CP-16, T022): the Issuer's records, kept for oidc-provider in one generic table,
// `oidc_item`, keyed by `(model, id)` (PT-11, CD X1). It owns that table, and no row, column or
// statement leaves it (CD4, DS6). It imports nothing from oidc-provider: the Issuer (T023) wraps
// these operations in the adapter class oidc-provider asks for, and keeps `findByUserCode`, which
// only the device flow uses, to itself.
//
// A bearer token's id is the token itself. Those records are kept by the id's SHA-256 alone, and
// the payload's `jti`, which repeats the id, is not stored: a copy of the database holds no token
// anyone can present (SC4). `find` hands the `jti` back from the id it was asked for. A session,
// an interaction, a grant and a client keep their ids: oidc-provider finds a session by its `uid`,
// which leaves no id to hand back, and the other three ids are not presented as credentials.
//
// A record whose time is up is never found, as with oidc-provider's own memory adapter. Records are
// untrusted data (a client's metadata comes from the internet), never logged or quoted.
import { createHash } from "node:crypto";
import type { Clock } from "../../../utilities/clock/index.ts";
import {
  QueryLayerError,
  upsertStatement,
} from "../../../utilities/query-layer/index.ts";
import type {
  QueryLayer,
  SqlDialect,
  SqlParams,
  SqlRow,
  SqlStatement,
} from "../../../utilities/query-layer/index.ts";
import { GrantsStoreError } from "./grants-store-error.ts";

/**
 * The oidc-provider models whose id is a bearer value (a token, a code, or a request handle that
 * is presented to the Issuer) and which are found by id alone. They are kept by the id's hash.
 * `DeviceCode` is left out: the device flow, which finds it by its user code, is off.
 */
export const HASHED_MODELS: ReadonlySet<string> = new Set([
  "AccessToken",
  "AuthorizationCode",
  "RefreshToken",
  "ClientCredentials",
  "BackchannelAuthenticationRequest",
  "InitialAccessToken",
  "RegistrationAccessToken",
  "PushedAuthorizationRequest",
]);

/** One record as oidc-provider hands it over and expects it back: JSON-ready data. */
export type GrantPayload = Readonly<Record<string, unknown>>;

/** What Grants is wired with. */
export interface GrantsStoreOptions {
  /** The core's database (Azure SQL in mode H, SQLite in mode A), migrated by the Host. */
  readonly store: QueryLayer;
  readonly clock: Clock;
}

// The column sizes on SQL Server, checked here so both dialects refuse the same input.
const MAX_MODEL_LENGTH = 40;
const MAX_ID_LENGTH = 400;
const MAX_REFERENCE_LENGTH = 128;
const MODEL_NAME = /^[A-Za-z]+$/;
const MS_PER_SECOND = 1000;
const NOT_EXPIRED = "(expires_at IS NULL OR expires_at > @now)";

const SELECT_BY_ID = `SELECT data FROM oidc_item WHERE model = @model AND id = @id AND ${NOT_EXPIRED}`;
const SELECT_BY_UID = `SELECT data FROM oidc_item WHERE model = @model AND uid = @uid AND ${NOT_EXPIRED} ORDER BY id`;
const DELETE_BY_ID = "DELETE FROM oidc_item WHERE model = @model AND id = @id";
const DELETE_BY_GRANT =
  "DELETE FROM oidc_item WHERE model = @model AND grant_id = @grant_id";
const CONSUME: Readonly<Record<SqlDialect, string>> = {
  sqlite:
    "UPDATE oidc_item SET data = json_set(data, '$.consumed', @consumed) WHERE model = @model AND id = @id",
  tsql: "UPDATE oidc_item SET data = JSON_MODIFY(data, '$.consumed', @consumed) WHERE model = @model AND id = @id",
};

/** The Issuer's records. One per core process, over the core's database. */
export class GrantsStore {
  readonly #store: QueryLayer;
  readonly #clock: Clock;

  constructor(options: GrantsStoreOptions) {
    this.#store = options.store;
    this.#clock = options.clock;
  }

  /**
   * Saves a record, replacing one with the same model and id. It is found until `expiresInS`
   * seconds from now; without it, until it is destroyed. The payload's `grantId` and `uid`, when
   * they are text, are kept for `revokeByGrantId` and `findByUid`.
   */
  async upsert(
    model: string,
    id: string,
    payload: GrantPayload,
    expiresInS: number | undefined,
    signal: AbortSignal,
  ): Promise<void> {
    checkModel(model);
    checkLength(id, MAX_ID_LENGTH, "An id");
    const grantId = reference(payload.grantId, "A grant id");
    const uid = reference(payload.uid, "A uid");
    if (
      expiresInS !== undefined &&
      !(Number.isFinite(expiresInS) && expiresInS >= 0)
    ) {
      throw new RangeError("A lifetime is a number of seconds, 0 or more.");
    }
    const hashed = HASHED_MODELS.has(model);
    const stored = hashed ? withoutJti(payload) : payload;
    const now = this.#clock.now();
    await this.#guard(signal, "The record could not be saved.", () =>
      this.#store.run(
        upsertStatement(this.#store.dialect, {
          table: "oidc_item",
          key: ["model", "id"],
          values: {
            model,
            id: storedId(model, id),
            grant_id: grantId,
            uid,
            data: JSON.stringify(stored),
            expires_at:
              expiresInS === undefined
                ? null
                : now + Math.round(expiresInS * MS_PER_SECOND),
          },
          onConflict: "update",
        }),
        signal,
      ),
    );
  }

  /** The record with this model and id, or `undefined` when there is none or its time is up. */
  async find(
    model: string,
    id: string,
    signal: AbortSignal,
  ): Promise<GrantPayload | undefined> {
    const row = await this.#guard(signal, "The record could not be read.", () =>
      this.#store.get(
        statement(SELECT_BY_ID, {
          model,
          id: storedId(model, id),
          now: this.#clock.now(),
        }),
        signal,
      ),
    );
    if (row === undefined) {
      return undefined;
    }
    const payload = payloadOf(row);
    return HASHED_MODELS.has(model) ? { ...payload, jti: id } : payload;
  }

  /**
   * The record of this model with this `uid` (oidc-provider finds a session this way), or
   * `undefined`. Throws `RangeError` for a model kept by its id's hash, which leaves no id to give
   * back.
   */
  async findByUid(
    model: string,
    uid: string,
    signal: AbortSignal,
  ): Promise<GrantPayload | undefined> {
    if (HASHED_MODELS.has(model)) {
      throw new RangeError("A record kept by its id's hash is found by id.");
    }
    const rows = await this.#guard(
      signal,
      "The record could not be read.",
      () =>
        this.#store.all(
          statement(SELECT_BY_UID, { model, uid, now: this.#clock.now() }),
          signal,
        ),
    );
    const row = rows.at(0);
    return row === undefined ? undefined : payloadOf(row);
  }

  /**
   * Marks a record used, in one statement: `consumed` becomes the time in seconds since 1970, as
   * oidc-provider's own adapter sets it. A reused code or refresh token is then refused.
   */
  async consume(model: string, id: string, signal: AbortSignal): Promise<void> {
    const consumed = Math.floor(this.#clock.now() / MS_PER_SECOND);
    await this.#guard(signal, "The record could not be updated.", () =>
      this.#store.run(
        statement(CONSUME[this.#store.dialect], {
          consumed,
          model,
          id: storedId(model, id),
        }),
        signal,
      ),
    );
  }

  /** Removes one record. Removing one that is not there does nothing. */
  async destroy(model: string, id: string, signal: AbortSignal): Promise<void> {
    await this.#guard(signal, "The record could not be removed.", () =>
      this.#store.run(
        statement(DELETE_BY_ID, { model, id: storedId(model, id) }),
        signal,
      ),
    );
  }

  /**
   * Removes this model's records that belong to a grant. oidc-provider calls it once per model,
   * and removes the grant itself separately, only when it means to.
   */
  async revokeByGrantId(
    model: string,
    grantId: string,
    signal: AbortSignal,
  ): Promise<void> {
    await this.#guard(signal, "The grant's records could not be removed.", () =>
      this.#store.run(
        statement(DELETE_BY_GRANT, { model, grant_id: grantId }),
        signal,
      ),
    );
  }

  // The Query layer's failures become this store's own; an abort and this store's own errors pass
  // through unchanged.
  async #guard<T>(
    signal: AbortSignal,
    message: string,
    work: () => Promise<T>,
  ): Promise<T> {
    try {
      return await work();
    } catch (error) {
      signal.throwIfAborted();
      if (error instanceof QueryLayerError) {
        throw new GrantsStoreError(
          error.kind === "store_down" ? "unavailable" : "failed",
          message,
          { cause: error },
        );
      }
      throw error;
    }
  }
}

/** The id as stored: the SHA-256 of a bearer value, as base64url; any other id as it is. */
function storedId(model: string, id: string): string {
  return HASHED_MODELS.has(model)
    ? createHash("sha256").update(id, "utf8").digest("base64url")
    : id;
}

function withoutJti(payload: GrantPayload): GrantPayload {
  return Object.fromEntries(
    Object.entries(payload).filter(([key]) => key !== "jti"),
  );
}

function checkModel(model: string): void {
  checkLength(model, MAX_MODEL_LENGTH, "A model name");
  if (!MODEL_NAME.test(model)) {
    throw new RangeError("A model name is letters only.");
  }
}

function checkLength(text: string, max: number, what: string): void {
  if (text.length === 0 || text.length > max) {
    throw new RangeError(
      `${what} must be 1 to ${String(max)} characters long.`,
    );
  }
}

// A payload's `grantId` or `uid` as its column holds it: text, or NULL when it is not text.
function reference(value: unknown, what: string): string | null {
  if (typeof value !== "string") {
    return null;
  }
  checkLength(value, MAX_REFERENCE_LENGTH, what);
  return value;
}

// No cause is kept for a record that does not parse: JSON's error quotes the text it read.
function payloadOf(row: SqlRow): GrantPayload {
  if (typeof row.data !== "string") {
    throw unreadableRecord();
  }
  let payload: unknown;
  try {
    payload = JSON.parse(row.data);
  } catch {
    throw unreadableRecord();
  }
  if (!isRecord(payload)) {
    throw unreadableRecord();
  }
  return payload;
}

function isRecord(value: unknown): value is GrantPayload {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unreadableRecord(): GrantsStoreError {
  return new GrantsStoreError(
    "failed",
    "The oidc_item table holds a record this store did not write.",
  );
}

function statement(sql: string, params: SqlParams = {}): SqlStatement {
  return { sql, params };
}
