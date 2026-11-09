// Mode A (T027 part 3; FR-045): the core and the home part in one process on the owner's machine,
// with the MCP endpoint served over stdio to the process that started the bridge.
// - **Storage**: the core's SQLite database and the home's outbox, each its own file in the data
//   folder.
// - **The link**: an in-process pair, with the same frames and order as over WSS and no sockets.
// - **No Issuer, no owner sign-in, no HTTP**: the local client's reads count as `local` (T025).
//   How a local HTTP client would authorize is G14, for iteration 004 (DRIFT-001-42).
// - **One process per data folder.** The lease guards the folder, on a short timing, since it
//   guards one local file. Some MCP clients start a short-lived copy of the server to learn its
//   protocol era, and end it at once, on Windows without letting it clean up. So the home part,
//   with its Ring connection, opens only once this process holds the lease, and a copy that never
//   holds it never reaches Ring. If this process loses the lease, `onFatal` hears of it, and the
//   caller ends the process: mode A is a single process.
// - **The home's key**: like any home's, it waits for the owner's typed confirmation on the admin
//   page (data-model.md "Configuration", T029). `approveLocalKey` approves it at start, for the dev
//   script and the tests. Its enrollment code is new at each start and shown only on that page.
// - **The log goes to stderr**: stdout carries the protocol. The caller serves stdio.
// It reaches no Azure library, oidc-provider or SQL Server driver (a dependency rule checks it).
import { randomBytes } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { OutboxStore } from "../connector/access/outbox-store/index.ts";
import type { LeaseTiming } from "../core/access/lease/index.ts";
import type { SettingsStore } from "../core/access/settings/index.ts";
import { McpEndpoint } from "../core/clients/mcp-endpoint/index.ts";
import type { AccessTokens } from "../core/clients/mcp-endpoint/index.ts";
import type { Cancel, Clock } from "../utilities/clock/index.ts";
import type { Settings } from "../utilities/config/index.ts";
import { createLinkPair } from "../utilities/link-transport/index.ts";
import type { DialOutcome } from "../utilities/link-transport/index.ts";
import type { Logger } from "../utilities/logging/index.ts";
import {
  CORE_MIGRATIONS,
  openSqliteQueryLayer,
  runMigrations,
} from "../utilities/query-layer/index.ts";
import { signingKeyId } from "../utilities/security/index.ts";
import type { SigningKeyPair } from "../utilities/security/index.ts";
import { assembleCore } from "./core-assembly.ts";
import type { CoreAssembly } from "./core-assembly.ts";
import { assembleHome, OUTBOX_FILE } from "./home-assembly.ts";
import type { LocalHome } from "./home-assembly.ts";
import { HostError } from "./host-error.ts";
import { LEASE_CHECK_MS } from "./leased-links.ts";

/** The core's database file in the data folder. */
export const CORE_DATABASE_FILE = "bridge.db";
/**
 * Mode A's lease timing [P]: renewed every 2 s, its row lasting 6 s. A copy of the process ended
 * without cleaning up holds the folder for at most 6 s.
 */
export const LOCAL_LEASE_TIMING: LeaseTiming = {
  renewMs: 2_000,
  expiresMs: 6_000,
};

const ENROLLMENT_CODE_BYTES = 9;
// The endpoint is served over stdio only; these name it in the metadata it never serves over HTTP.
const LOCAL_RESOURCE = "http://localhost/mcp";
const LOCAL_ISSUER = "http://localhost/oauth";
const LOCAL_HOSTS = ["localhost"];
/** Stdio carries no token: every HTTP request would be refused, and none is served. */
const NO_TOKENS: AccessTokens = {
  checkAccessToken: () => Promise.resolve({ kind: "invalid" }),
};

/** What mode A is started with, besides its settings. */
export interface AllInOneParts {
  readonly clock: Clock;
  /** Writes to stderr. */
  readonly logger: Logger;
  /**
   * Opens the home side: the Secrets File and the Ring Adapter in production
   * (`ring-home.live.ts`), the scenario engine in development and tests.
   */
  readonly openHome: () => Promise<LocalHome>;
  /** Approves the home's key at start, as the owner's confirmation will. The dev script and tests only. */
  readonly approveLocalKey?: boolean;
  readonly connectorVersion: string;
  /** Hears that mode A cannot go on: the home could not open, or the lease was lost. */
  readonly onFatal: (error: unknown) => void;
}

/** Mode A, running. */
export interface RunningAllInOne {
  /** The MCP endpoint, for the caller to serve over stdio. */
  readonly endpoint: McpEndpoint;
  readonly core: CoreAssembly;
  /** Stops the home part, then the core, and closes the files. */
  stop(): Promise<void>;
}

type AllInOneSettings = Extract<Settings, { readonly mode: "all-in-one" }>;

/** Starts mode A's core. The home part follows once the lease is held. */
export async function startAllInOne(
  settings: AllInOneSettings,
  parts: AllInOneParts,
): Promise<RunningAllInOne> {
  const { clock, logger } = parts;
  const dataDir = settings.local.dataDir;
  await mkdir(dataDir, { recursive: true });
  const layer = openSqliteQueryLayer(join(dataDir, CORE_DATABASE_FILE), {
    clock,
  });
  try {
    await runMigrations(layer, CORE_MIGRATIONS, { clock }, never());
  } catch (error) {
    await layer.close();
    throw error;
  }
  const core = assembleCore({
    store: layer,
    clock,
    logger,
    settings,
    leaseTiming: LOCAL_LEASE_TIMING,
  });
  const endpoint = new McpEndpoint(
    {
      resource: LOCAL_RESOURCE,
      issuer: LOCAL_ISSUER,
      allowedHosts: LOCAL_HOSTS,
      readsPerHour: settings.readsPerHour,
    },
    { inquiry: core.inquiry, tokens: NO_TOKENS, clock, logger },
  );
  const homePart = new HomePart(dataDir, core, parts);
  core.start();
  homePart.follow();
  logger.info("bridge_started", { mode: "all_in_one" });
  return {
    endpoint,
    core,
    stop: async () => {
      await homePart.stop();
      await core.stop();
      await layer.close();
    },
  };
}

/** The home part, opened once the core holds the lease, and watched for the lease's loss. */
class HomePart {
  readonly #dataDir: string;
  readonly #core: CoreAssembly;
  readonly #parts: AllInOneParts;
  #watch: Cancel | undefined;
  #opening: Promise<void> | undefined;
  readonly #closers: (() => Promise<void>)[] = [];
  #stopped = false;

  constructor(dataDir: string, core: CoreAssembly, parts: AllInOneParts) {
    this.#dataDir = dataDir;
    this.#core = core;
    this.#parts = parts;
  }

  follow(): void {
    this.#watch = this.#parts.clock.every(LEASE_CHECK_MS, () => {
      this.#check();
    });
  }

  async stop(): Promise<void> {
    this.#stopped = true;
    this.#watch?.();
    await this.#opening;
    for (const close of this.#closers.splice(0).reverse()) {
      await close();
    }
  }

  #check(): void {
    if (this.#stopped) {
      return;
    }
    const serving = this.#core.links.serving;
    if (serving && this.#opening === undefined) {
      this.#opening = this.#open().catch((error: unknown) => {
        this.#fatal(error);
      });
    } else if (!serving && this.#opening !== undefined) {
      this.#fatal(
        new HostError(
          "lease_lost",
          "Another process took this data folder's lease.",
        ),
      );
    }
  }

  #fatal(error: unknown): void {
    this.#watch?.();
    this.#watch = undefined;
    this.#parts.onFatal(error);
  }

  async #open(): Promise<void> {
    const { clock, logger } = this.#parts;
    const signal = never();
    const home = await this.#parts.openHome();
    this.#closers.push(() => home.close());
    const enrollmentCode = randomBytes(ENROLLMENT_CODE_BYTES).toString(
      "base64url",
    );
    if (this.#parts.approveLocalKey === true) {
      await approveKey(this.#core.settings, home.key, enrollmentCode, signal);
    }
    const outbox = await OutboxStore.open(
      { path: join(this.#dataDir, OUTBOX_FILE), clock },
      signal,
    );
    this.#closers.push(() => outbox.close());
    const homeSide = assembleHome({
      ring: home.ring,
      outbox,
      dial: inProcessDial(this.#core, logger),
      identity: {
        key: home.key,
        enrollmentCode,
        connectorVersion: this.#parts.connectorVersion,
      },
      clock,
      logger,
    });
    this.#closers.push(() => homeSide.stop());
    if (this.#stopped) {
      return;
    }
    homeSide.start();
    logger.info("home_part_started", { mode: "all_in_one" });
  }
}

function never(): AbortSignal {
  return new AbortController().signal;
}

/** The in-process link: each dial is a new pair, its accepting end handed to the core. */
function inProcessDial(
  core: CoreAssembly,
  logger: Logger,
): (signal: AbortSignal) => Promise<DialOutcome> {
  return () => {
    const pair = createLinkPair(logger);
    core.links.accept(pair.acceptor);
    return Promise.resolve({ kind: "connected", link: pair.dialer });
  };
}

/** Approves the home's key as the owner would: asked for with its code, then approved. */
async function approveKey(
  settings: SettingsStore,
  key: SigningKeyPair,
  code: string,
  signal: AbortSignal,
): Promise<void> {
  const outcome = await settings.requestEnrollment(
    { public_key: key.publicKey, code },
    signal,
  );
  if (outcome.kind === "revoked") {
    throw new HostError(
      "key_revoked",
      "The owner revoked this home's key; it must enroll a new one.",
    );
  }
  if (outcome.kind === "pending") {
    await settings.approveEnrollment(signingKeyId(key.publicKey), signal);
  }
}
