// The connector's health for Docker (T033 step 2, DRIFT-001-72, PT-02). The connector serves no
// port, so it writes its health to a small file in its data folder, and the image's `health`
// command reads that file: the image's HEALTHCHECK runs the command in the container.
// - **The file** (`connector-health.json`) holds codes and times only, never an id or Ring's text.
//   It is written when the connector starts, every 15 s, and once more on stop with the link down.
//   Each write replaces it whole: a temporary file renamed in place.
// - **Healthy**, unless:
//   - the file is over 60 s old, so the process hung or stopped writing;
//   - the link to the core has been down 2 minutes or more, the core's own rule;
//   - the Ring session is lost, which needs the owner's Ring login.
//   Ring unavailable is shown but stays healthy: that is Ring's outage, not the connector's, and
//   the core already reports it.
// - **The command only reads.** It opens no outbox, Secrets File or Ring, so it runs beside the
//   connector. In any other mode, such as the core's in App Service, it checks nothing and passes.
// - **Docker restarts a container when it exits, not when it is unhealthy.** This is a status for
//   `docker ps` and `docker inspect`, not a repair.
import { readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { Cancel, Clock } from "../utilities/clock/index.ts";
import type { Logger } from "../utilities/logging/index.ts";

/** The health file's name in the connector's data folder. */
export const HEALTH_FILE_NAME = "connector-health.json";
/** How often the connector writes its health [P]: twice for each of Docker's 30 s checks. */
export const HEALTH_WRITE_INTERVAL_MS = 15_000;
/** A health file older than this means the connector stopped writing it [P]. */
export const HEALTH_FILE_MAX_AGE_MS = 60_000;
/** How long the link may be down before the connector is unhealthy: the core's 2 minutes. */
export const LINK_DOWN_UNHEALTHY_MS = 120_000;

const RECORD = z.object({
  written_at: z.iso.datetime(),
  link: z.enum(["up", "down"]),
  link_since: z.iso.datetime(),
  ring_session: z.enum(["ok", "unavailable", "lost"]),
});

/** What the health file holds. */
export type ConnectorHealthRecord = z.infer<typeof RECORD>;

/** The command's answer: whether Docker should count the connector healthy, and why, in words. */
export interface HealthVerdict {
  readonly healthy: boolean;
  readonly line: string;
}

/** The health rule, as of `now`. A missing or unreadable file is `undefined`. */
export function judgeHealth(
  record: ConnectorHealthRecord | undefined,
  now: number,
): HealthVerdict {
  if (record === undefined) {
    return unhealthy(
      "No readable health file: the connector has not started, or cannot write its data folder.",
    );
  }
  const status = `link ${record.link} since ${record.link_since}, Ring session ${record.ring_session}`;
  if (now - Date.parse(record.written_at) > HEALTH_FILE_MAX_AGE_MS) {
    return unhealthy(
      `The connector last wrote its health at ${record.written_at}, over a minute ago (${status}).`,
    );
  }
  if (record.ring_session === "lost") {
    return unhealthy(
      `The Ring session is lost: log in to Ring again with the setup (${status}).`,
    );
  }
  if (
    record.link === "down" &&
    now - Date.parse(record.link_since) >= LINK_DOWN_UNHEALTHY_MS
  ) {
    return unhealthy(
      `The link to the core has been down for 2 minutes or more (${status}).`,
    );
  }
  return { healthy: true, line: `Healthy: ${status}.` };
}

function unhealthy(reason: string): HealthVerdict {
  return { healthy: false, line: `Unhealthy. ${reason}` };
}

/** Reads the health file, or `undefined` when it is missing or not one the connector wrote. */
export async function readHealthRecord(
  dataDir: string,
): Promise<ConnectorHealthRecord | undefined> {
  try {
    const text = await readFile(join(dataDir, HEALTH_FILE_NAME), "utf8");
    const parsed = RECORD.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The image's `health` command: exit code 0 when healthy, 1 when not, with one line in words. It
 * reads `BRIDGE_MODE` and `BRIDGE_DATA_DIR` only.
 */
export async function runHealthCommand(
  env: NodeJS.ProcessEnv,
  output: { write(text: string): unknown },
  now: () => number = Date.now,
): Promise<number> {
  if (env.BRIDGE_MODE !== "connector") {
    output.write(
      "Not checked in this mode: only the connector reports its health here.\n",
    );
    return 0;
  }
  const dataDir = env.BRIDGE_DATA_DIR;
  if (dataDir === undefined || dataDir === "") {
    output.write("Unhealthy. BRIDGE_DATA_DIR is not set.\n");
    return 1;
  }
  const verdict = judgeHealth(await readHealthRecord(dataDir), now());
  output.write(`${verdict.line}\n`);
  return verdict.healthy ? 0 : 1;
}

/** What the health file reports, read when it is written. */
export interface HealthSources {
  /** Whether a session with the core is open. */
  linkUp(): boolean;
  ringSession(): ConnectorHealthRecord["ring_session"];
}

/** Writes the connector's health file, from start until stop. One per connector process. */
export class HealthWriter {
  readonly #dataDir: string;
  readonly #clock: Clock;
  readonly #logger: Logger;
  readonly #sources: HealthSources;
  readonly #intervalMs: number;
  #link: ConnectorHealthRecord["link"] = "down";
  #linkSince: number;
  #cancel: Cancel | undefined;
  #writing: Promise<void> = Promise.resolve();
  #failed = false;

  constructor(options: {
    readonly dataDir: string;
    readonly clock: Clock;
    readonly logger: Logger;
    readonly sources: HealthSources;
    /** How often it writes; `HEALTH_WRITE_INTERVAL_MS` unless a test shortens it. */
    readonly intervalMs?: number;
  }) {
    this.#dataDir = options.dataDir;
    this.#clock = options.clock;
    this.#logger = options.logger;
    this.#sources = options.sources;
    this.#intervalMs = options.intervalMs ?? HEALTH_WRITE_INTERVAL_MS;
    this.#linkSince = options.clock.now();
  }

  /** Writes at once, so an older file never reads as this process's health, then every 15 s. */
  start(): void {
    this.#writeNow();
    this.#cancel = this.#clock.every(this.#intervalMs, () => {
      this.#writeNow();
    });
  }

  /** Stops the writes, and writes once more with the link down. */
  async stop(): Promise<void> {
    this.#cancel?.();
    this.#cancel = undefined;
    await this.#write("down");
  }

  #writeNow(): void {
    void this.#write(this.#sources.linkUp() ? "up" : "down");
  }

  // One write at a time, in order; a failure is logged once, until a write succeeds again.
  #write(link: ConnectorHealthRecord["link"]): Promise<void> {
    const now = this.#clock.now();
    if (link !== this.#link) {
      this.#link = link;
      this.#linkSince = now;
    }
    const record: ConnectorHealthRecord = {
      written_at: new Date(now).toISOString(),
      link,
      link_since: new Date(this.#linkSince).toISOString(),
      ring_session: this.#sources.ringSession(),
    };
    this.#writing = this.#writing.then(() => this.#replace(record));
    return this.#writing;
  }

  async #replace(record: ConnectorHealthRecord): Promise<void> {
    const path = join(this.#dataDir, HEALTH_FILE_NAME);
    const temporary = `${path}.tmp`;
    try {
      await writeFile(temporary, `${JSON.stringify(record)}\n`, "utf8");
      await rename(temporary, path);
      this.#failed = false;
    } catch (error) {
      if (!this.#failed) {
        this.#failed = true;
        this.#logger.warn("connector_health_not_written", undefined, error);
      }
    }
  }
}
