// Settings (CP-16, T022): what the core keeps about who may use it. It owns three tables, and no
// row, column or statement leaves it (CD4, DS6):
// - `agent`: the listed agents, seeded from deployment configuration (PT-18). A seed replaces the
//   listing, and keeps the owner's revocation and the last-seen time of an agent still listed;
// - `connector`: the home part's keys, `pending`, `active` or `revoked` (SC2). One request waits at
//   a time, for 10 minutes (PT-32), and approving it revokes every older key (FR-032);
// - `setting`: the global battery threshold (FR-001), or the configured default until it is set.
//
// DTO fields that data-model.md or the link contract names keep those names; times are UTC
// milliseconds since 1970, stored and in the DTOs (see ../README.md).
import { z } from "zod";
import type { Clock } from "../../../utilities/clock/index.ts";
import {
  QueryLayerError,
  upsertStatement,
} from "../../../utilities/query-layer/index.ts";
import type {
  QueryLayer,
  SqlParams,
  SqlRow,
  SqlStatement,
} from "../../../utilities/query-layer/index.ts";
import {
  parsePublicSigningKey,
  signingKeyId,
} from "../../../utilities/security/index.ts";
import type { PublicSigningKey } from "../../../utilities/security/index.ts";
import { SettingsStoreError } from "./settings-store-error.ts";

/** How long a pending enrollment request waits for the owner (PT-32): 10 minutes. */
export const ENROLLMENT_REQUEST_TTL_MS = 10 * 60_000;
/** The longest enrollment code kept: the column's size. */
export const MAX_ENROLLMENT_CODE_LENGTH = 64;

// The column sizes on SQL Server, checked here so both dialects refuse the same input.
const MAX_CLIENT_ID_LENGTH = 400;
const MAX_PLATFORM_LENGTH = 64;
const MAX_PERCENT = 100;

const AGENT_SCOPES = ["read", "media", "control"] as const;
const CONNECTOR_STATUSES = ["pending", "active", "revoked"] as const;
const BATTERY_THRESHOLD = "battery_threshold_pct";

/** What an agent may be granted (FR-030, SC3). Iteration 001 grants `read` only: the Issuer's rule. */
export type AgentScope = (typeof AGENT_SCOPES)[number];

/** One agent as deployment configuration lists it (PT-18). */
export interface AgentSeed {
  readonly client_id: string;
  /** What the admin page shows for it, such as the agent's product name. */
  readonly platform?: string;
  readonly scopes: readonly AgentScope[];
  readonly redirect_uris: readonly string[];
}

/** A listed agent. Its scopes come in the order `read`, `media`, `control`, each once. */
export interface ListedAgent extends AgentSeed {
  /** When the owner revoked it (FR-031). A revoked agent may not link. */
  readonly revoked_at?: number;
  readonly last_seen_at?: number;
}

/** What a seed changed. */
export interface AgentSeedReport {
  /**
   * The agents listed before and no longer configured, now removed, in code-point order. Their
   * grants are for a manager to end, through Grants.
   */
  readonly removed: readonly string[];
}

/** The home part asks to be trusted (`enroll`, SC2). */
export interface EnrollmentRequest {
  readonly public_key: PublicSigningKey;
  /** The code the Setup CLI printed, which the owner compares on the admin page. */
  readonly code: string;
}

/**
 * - `pending`: the request waits for the owner until `expires_at`, replacing any other request;
 * - `already_active`: the key is enrolled already;
 * - `revoked`: the key was revoked, and a revoked key is never trusted again.
 */
export type EnrollmentRequestOutcome =
  | {
      readonly kind: "pending";
      readonly key_id: string;
      readonly expires_at: number;
    }
  | { readonly kind: "already_active"; readonly key_id: string }
  | { readonly kind: "revoked"; readonly key_id: string };

/** The request waiting for the owner, as the admin page shows it. */
export interface PendingEnrollment {
  readonly key_id: string;
  readonly enrollment_code: string;
  readonly requested_at: number;
  readonly expires_at: number;
}

/**
 * - `approved`: the key is now the one active key; `revokedKeyIds` lists the keys this revoked;
 * - `not_pending`: no request for this key waits: it expired, a newer request replaced it, or it
 *   was never made. Nothing changed.
 */
export type EnrollmentApproval =
  | { readonly kind: "approved"; readonly revokedKeyIds: readonly string[] }
  | { readonly kind: "not_pending" };

/** A key as Connector Link checks it at `hello`. A pending key is not enrolled yet. */
export type ConnectorKey =
  | { readonly kind: "active"; readonly public_key: PublicSigningKey }
  | { readonly kind: "revoked" }
  | { readonly kind: "not_enrolled" };

/** What Settings is wired with. */
export interface SettingsStoreOptions {
  /** The core's database (Azure SQL in mode H, SQLite in mode A), migrated by the Host. */
  readonly store: QueryLayer;
  readonly clock: Clock;
  /** The battery threshold until the owner sets one: the Config utility's `batteryThresholdPct`. */
  readonly defaultBatteryThresholdPct: number;
}

const SELECT_AGENT_IDS = "SELECT client_id FROM agent ORDER BY client_id";
const SELECT_AGENT =
  "SELECT client_id, platform, scopes, redirect_uris, revoked_at, last_seen_at FROM agent WHERE client_id = @client_id";
const DELETE_AGENT = "DELETE FROM agent WHERE client_id = @client_id";
const SELECT_KEY =
  "SELECT status, public_key FROM connector WHERE key_id = @key_id";
const DELETE_PENDING = "DELETE FROM connector WHERE status = 'pending'";
const INSERT_PENDING =
  "INSERT INTO connector (key_id, public_key, status, requested_at, expires_at, enrollment_code) VALUES (@key_id, @public_key, 'pending', @requested_at, @expires_at, @enrollment_code)";
const SELECT_PENDING =
  "SELECT key_id, enrollment_code, requested_at, expires_at FROM connector WHERE status = 'pending' AND expires_at > @now ORDER BY requested_at DESC";
const ACTIVATE =
  "UPDATE connector SET status = 'active', enrolled_at = @now, expires_at = NULL, enrollment_code = NULL WHERE key_id = @key_id AND status = 'pending' AND expires_at > @now";
const SELECT_OTHER_ACTIVE =
  "SELECT key_id FROM connector WHERE status = 'active' AND key_id <> @key_id ORDER BY key_id";
const REVOKE_OTHERS =
  "UPDATE connector SET status = 'revoked', revoked_at = @now WHERE status = 'active' AND key_id <> @key_id";
const SELECT_SETTING = "SELECT value FROM setting WHERE name = @name";

// A JSON document stored as text, parsed and then checked against `schema`.
function jsonText<Schema extends z.ZodType>(
  schema: Schema,
): z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform>, Schema> {
  return z
    .string()
    .transform((text, context) => {
      try {
        return JSON.parse(text) as unknown;
      } catch {
        context.addIssue({ code: "custom", message: "not JSON" });
        return z.NEVER;
      }
    })
    .pipe(schema);
}

const storedTime = z.number().int();

const AGENT_ROW = z.object({
  client_id: z.string(),
  platform: z.string().nullable(),
  scopes: jsonText(z.array(z.enum(AGENT_SCOPES))),
  redirect_uris: jsonText(z.array(z.string())),
  revoked_at: storedTime.nullable(),
  last_seen_at: storedTime.nullable(),
});

const KEY_ROW = z.object({
  status: z.enum(CONNECTOR_STATUSES),
  public_key: z.string(),
});

const PENDING_ROW = z.object({
  key_id: z.string(),
  enrollment_code: z.string(),
  requested_at: storedTime,
  expires_at: storedTime,
});

const KEY_ID_ROW = z.object({ key_id: z.string() });
const CLIENT_ID_ROW = z.object({ client_id: z.string() });
const BATTERY_ROW = z.object({
  value: jsonText(z.number().int().min(0).max(MAX_PERCENT)),
});

const NOT_ENROLLED: ConnectorKey = { kind: "not_enrolled" };
const REVOKED: ConnectorKey = { kind: "revoked" };
const NOT_PENDING: EnrollmentApproval = { kind: "not_pending" };

/** The core's Settings. One per core process, over the core's database. */
export class SettingsStore {
  readonly #store: QueryLayer;
  readonly #clock: Clock;
  readonly #defaultBatteryThresholdPct: number;

  constructor(options: SettingsStoreOptions) {
    checkPercent(options.defaultBatteryThresholdPct);
    this.#store = options.store;
    this.#clock = options.clock;
    this.#defaultBatteryThresholdPct = options.defaultBatteryThresholdPct;
  }

  /**
   * Makes the listing match deployment configuration, in one transaction: each seed is added or
   * updated, and an agent no longer configured is removed. An agent still listed keeps its
   * revocation and its last-seen time. Throws `RangeError`, changing nothing, for a client listed
   * twice or a value too long to store.
   */
  async seedAgents(
    seeds: readonly AgentSeed[],
    signal: AbortSignal,
  ): Promise<AgentSeedReport> {
    checkSeeds(seeds);
    return this.#guard(signal, "The agent listing could not be seeded.", () =>
      this.#store.transaction(async (session) => {
        const listed = await session.all(statement(SELECT_AGENT_IDS), signal);
        for (const seed of seeds) {
          await session.run(
            upsertStatement(session.dialect, {
              table: "agent",
              key: ["client_id"],
              values: agentValues(seed),
              onConflict: "update",
            }),
            signal,
          );
        }
        const configured = new Set(seeds.map((seed) => seed.client_id));
        const removed = listed
          .map((row) => parseRow(CLIENT_ID_ROW, row, "agent").client_id)
          .filter((clientId) => !configured.has(clientId));
        for (const clientId of removed) {
          await session.run(
            statement(DELETE_AGENT, { client_id: clientId }),
            signal,
          );
        }
        return { removed };
      }, signal),
    );
  }

  /** The listed agent with this client id, or `undefined` when none is listed. */
  async agent(
    clientId: string,
    signal: AbortSignal,
  ): Promise<ListedAgent | undefined> {
    const row = await this.#guard(signal, "The agent could not be read.", () =>
      this.#store.get(statement(SELECT_AGENT, { client_id: clientId }), signal),
    );
    return row === undefined ? undefined : agentOf(row);
  }

  /**
   * Records an `enroll` request. It waits `ENROLLMENT_REQUEST_TTL_MS` for the owner and replaces
   * any other waiting request (PT-32). A key that is active or revoked is reported, and nothing
   * changes. Throws `RangeError` for an empty code or one over `MAX_ENROLLMENT_CODE_LENGTH`.
   */
  async requestEnrollment(
    request: EnrollmentRequest,
    signal: AbortSignal,
  ): Promise<EnrollmentRequestOutcome> {
    checkLength(request.code, MAX_ENROLLMENT_CODE_LENGTH, "enrollment code");
    const keyId = signingKeyId(request.public_key);
    return this.#guard(
      signal,
      "The enrollment request could not be saved.",
      () =>
        this.#store.transaction(
          async (session): Promise<EnrollmentRequestOutcome> => {
            const row = await session.get(
              statement(SELECT_KEY, { key_id: keyId }),
              signal,
            );
            const status =
              row === undefined
                ? undefined
                : parseRow(KEY_ROW, row, "connector").status;
            if (status === "active") {
              return { kind: "already_active", key_id: keyId };
            }
            if (status === "revoked") {
              return { kind: "revoked", key_id: keyId };
            }
            const requestedAt = this.#clock.now();
            const expiresAt = requestedAt + ENROLLMENT_REQUEST_TTL_MS;
            await session.run(statement(DELETE_PENDING), signal);
            await session.run(
              statement(INSERT_PENDING, {
                key_id: keyId,
                public_key: request.public_key,
                requested_at: requestedAt,
                expires_at: expiresAt,
                enrollment_code: request.code,
              }),
              signal,
            );
            return { kind: "pending", key_id: keyId, expires_at: expiresAt };
          },
          signal,
        ),
    );
  }

  /** The request waiting for the owner, or `undefined` when none waits or it expired. */
  async pendingEnrollment(
    signal: AbortSignal,
  ): Promise<PendingEnrollment | undefined> {
    const rows = await this.#guard(
      signal,
      "The enrollment request could not be read.",
      () =>
        this.#store.all(
          statement(SELECT_PENDING, { now: this.#clock.now() }),
          signal,
        ),
    );
    const row = rows.at(0);
    if (row === undefined) {
      return undefined;
    }
    const pending = parseRow(PENDING_ROW, row, "connector");
    return {
      key_id: pending.key_id,
      enrollment_code: pending.enrollment_code,
      requested_at: pending.requested_at,
      expires_at: pending.expires_at,
    };
  }

  /**
   * The owner approves the waiting request for this key: in one transaction it becomes the one
   * active key, and every older key is revoked (FR-032, SC2). The code is cleared: it was for
   * this one comparison.
   */
  async approveEnrollment(
    keyId: string,
    signal: AbortSignal,
  ): Promise<EnrollmentApproval> {
    return this.#guard(signal, "The enrollment could not be approved.", () =>
      this.#store.transaction(async (session) => {
        const now = this.#clock.now();
        const activated = await session.run(
          statement(ACTIVATE, { key_id: keyId, now }),
          signal,
        );
        if (activated === 0) {
          return NOT_PENDING;
        }
        const others = await session.all(
          statement(SELECT_OTHER_ACTIVE, { key_id: keyId }),
          signal,
        );
        await session.run(
          statement(REVOKE_OTHERS, { key_id: keyId, now }),
          signal,
        );
        const revokedKeyIds = others.map(
          (other) => parseRow(KEY_ID_ROW, other, "connector").key_id,
        );
        return { kind: "approved", revokedKeyIds };
      }, signal),
    );
  }

  /** The key named in a `hello`, as Connector Link checks it (SC2). */
  async connectorKey(
    keyId: string,
    signal: AbortSignal,
  ): Promise<ConnectorKey> {
    const row = await this.#guard(signal, "The key could not be read.", () =>
      this.#store.get(statement(SELECT_KEY, { key_id: keyId }), signal),
    );
    if (row === undefined) {
      return NOT_ENROLLED;
    }
    const key = parseRow(KEY_ROW, row, "connector");
    if (key.status === "pending") {
      return NOT_ENROLLED;
    }
    if (key.status === "revoked") {
      return REVOKED;
    }
    const publicKey = parsePublicSigningKey(key.public_key);
    if (publicKey === undefined) {
      throw unreadableRow("connector");
    }
    return { kind: "active", public_key: publicKey };
  }

  /** The global battery threshold, in percent (FR-001): the owner's, or the configured default. */
  async batteryThresholdPct(signal: AbortSignal): Promise<number> {
    const row = await this.#guard(
      signal,
      "The battery threshold could not be read.",
      () =>
        this.#store.get(
          statement(SELECT_SETTING, { name: BATTERY_THRESHOLD }),
          signal,
        ),
    );
    return row === undefined
      ? this.#defaultBatteryThresholdPct
      : parseRow(BATTERY_ROW, row, "setting").value;
  }

  /** Sets the global battery threshold. Throws `RangeError` unless it is a whole number 0 to 100. */
  async setBatteryThresholdPct(
    percent: number,
    signal: AbortSignal,
  ): Promise<void> {
    checkPercent(percent);
    await this.#guard(signal, "The battery threshold could not be saved.", () =>
      this.#store.run(
        upsertStatement(this.#store.dialect, {
          table: "setting",
          key: ["name"],
          values: {
            name: BATTERY_THRESHOLD,
            value: JSON.stringify(percent),
            updated_at: this.#clock.now(),
          },
          onConflict: "update",
        }),
        signal,
      ),
    );
  }

  // The Query layer's failures become this store's own; an abort, a `RangeError` and this
  // store's own errors pass through unchanged.
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
        throw new SettingsStoreError(
          error.kind === "store_down" ? "unavailable" : "failed",
          message,
          { cause: error },
        );
      }
      throw error;
    }
  }
}

function checkSeeds(seeds: readonly AgentSeed[]): void {
  const clientIds = new Set<string>();
  for (const seed of seeds) {
    checkLength(seed.client_id, MAX_CLIENT_ID_LENGTH, "client id");
    if (seed.platform !== undefined) {
      checkLength(seed.platform, MAX_PLATFORM_LENGTH, "platform");
    }
    if (seed.redirect_uris.some((uri) => uri.length === 0)) {
      throw new RangeError("A redirect URI cannot be empty.");
    }
    if (clientIds.has(seed.client_id)) {
      throw new RangeError("Deployment configuration lists a client twice.");
    }
    clientIds.add(seed.client_id);
  }
}

function checkLength(text: string, max: number, what: string): void {
  if (text.length === 0 || text.length > max) {
    throw new RangeError(
      `A ${what} must be 1 to ${String(max)} characters long.`,
    );
  }
}

function checkPercent(percent: number): void {
  if (!Number.isInteger(percent) || percent < 0 || percent > MAX_PERCENT) {
    throw new RangeError(
      "A battery threshold is a whole number from 0 to 100.",
    );
  }
}

function agentValues(seed: AgentSeed): SqlParams {
  return {
    client_id: seed.client_id,
    platform: seed.platform ?? null,
    scopes: JSON.stringify(
      AGENT_SCOPES.filter((scope) => seed.scopes.includes(scope)),
    ),
    redirect_uris: JSON.stringify(seed.redirect_uris),
  };
}

function agentOf(row: SqlRow): ListedAgent {
  const agent = parseRow(AGENT_ROW, row, "agent");
  return {
    client_id: agent.client_id,
    ...(agent.platform === null ? {} : { platform: agent.platform }),
    scopes: agent.scopes,
    redirect_uris: agent.redirect_uris,
    ...(agent.revoked_at === null ? {} : { revoked_at: agent.revoked_at }),
    ...(agent.last_seen_at === null
      ? {}
      : { last_seen_at: agent.last_seen_at }),
  };
}

// No cause is kept for a row that does not parse: zod's issues and JSON's errors can quote it.
function parseRow<Schema extends z.ZodType>(
  schema: Schema,
  row: SqlRow,
  table: string,
): z.output<Schema> {
  const parsed = schema.safeParse(row);
  if (!parsed.success) {
    throw unreadableRow(table);
  }
  return parsed.data;
}

function unreadableRow(table: string): SettingsStoreError {
  return new SettingsStoreError(
    "failed",
    `The ${table} table holds a row this store did not write.`,
  );
}

function statement(sql: string, params: SqlParams = {}): SqlStatement {
  return { sql, params };
}
