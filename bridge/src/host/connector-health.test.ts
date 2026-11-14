// The connector's health for Docker (DRIFT-001-72): the rule, the file, the command, and the
// writer the connector runs.
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeClock } from "../utilities/clock/index.ts";
import { Logger } from "../utilities/logging/index.ts";
import {
  HEALTH_FILE_MAX_AGE_MS,
  HEALTH_FILE_NAME,
  HEALTH_WRITE_INTERVAL_MS,
  HealthWriter,
  judgeHealth,
  LINK_DOWN_UNHEALTHY_MS,
  readHealthRecord,
  runHealthCommand,
} from "./connector-health.ts";
import type { ConnectorHealthRecord } from "./connector-health.ts";

const START = Date.UTC(2026, 10, 15, 8, 0, 0);
const SECOND_MS = 1_000;

function record(
  changes: Partial<ConnectorHealthRecord> = {},
): ConnectorHealthRecord {
  return {
    written_at: new Date(START).toISOString(),
    link: "up",
    link_since: new Date(START - 60 * SECOND_MS).toISOString(),
    ring_session: "ok",
    ...changes,
  };
}

let folder: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "connector-health-"));
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

describe("the health rule", () => {
  it("is healthy with the link up and Ring fine, and says so in words", () => {
    expect(judgeHealth(record(), START)).toEqual({
      healthy: true,
      line: "Healthy: link up since 2026-11-15T07:59:00.000Z, Ring session ok.",
    });
  });

  it("allows the link down for under 2 minutes, the core's own rule, and not from then on", () => {
    const downSince = new Date(START).toISOString();
    const writtenAt = (at: number) =>
      record({
        link: "down",
        link_since: downSince,
        written_at: new Date(at).toISOString(),
      });
    const justUnder = START + LINK_DOWN_UNHEALTHY_MS - 1;
    const atTwoMinutes = START + LINK_DOWN_UNHEALTHY_MS;

    expect(judgeHealth(writtenAt(justUnder), justUnder).healthy).toBe(true);
    const late = judgeHealth(writtenAt(atTwoMinutes), atTwoMinutes);
    expect(late.healthy).toBe(false);
    expect(late.line).toContain("down for 2 minutes or more");
  });

  it("is unhealthy when the file is over a minute old: the connector stopped writing it", () => {
    expect(judgeHealth(record(), START + HEALTH_FILE_MAX_AGE_MS).healthy).toBe(
      true,
    );
    const stale = judgeHealth(record(), START + HEALTH_FILE_MAX_AGE_MS + 1);
    expect(stale.healthy).toBe(false);
    expect(stale.line).toContain("over a minute ago");
  });

  it("is unhealthy with the Ring session lost, but shows Ring unavailable and stays healthy", () => {
    const lost = judgeHealth(record({ ring_session: "lost" }), START);
    expect(lost.healthy).toBe(false);
    expect(lost.line).toContain("log in to Ring again");

    const unavailable = judgeHealth(
      record({ ring_session: "unavailable" }),
      START,
    );
    expect(unavailable).toEqual({
      healthy: true,
      line: "Healthy: link up since 2026-11-15T07:59:00.000Z, Ring session unavailable.",
    });
  });

  it("is unhealthy with no readable file", () => {
    expect(judgeHealth(undefined, START).healthy).toBe(false);
  });
});

describe("the health file and the command", () => {
  it("reads only a file the connector wrote: none, broken JSON or another shape is no file", async () => {
    expect(await readHealthRecord(folder)).toBeUndefined();
    await writeFile(join(folder, HEALTH_FILE_NAME), "{not json");
    expect(await readHealthRecord(folder)).toBeUndefined();
    await writeFile(
      join(folder, HEALTH_FILE_NAME),
      JSON.stringify({ ...record(), link: "sideways" }),
    );
    expect(await readHealthRecord(folder)).toBeUndefined();

    await writeFile(join(folder, HEALTH_FILE_NAME), JSON.stringify(record()));
    expect(await readHealthRecord(folder)).toEqual(record());
  });

  it("exits 0 when healthy and 1 when not, with one line; in another mode it checks nothing", async () => {
    const lines: string[] = [];
    const output = { write: (text: string) => lines.push(text) };
    await writeFile(join(folder, HEALTH_FILE_NAME), JSON.stringify(record()));
    const connector = { BRIDGE_MODE: "connector", BRIDGE_DATA_DIR: folder };

    expect(await runHealthCommand(connector, output, () => START)).toBe(0);
    expect(
      await runHealthCommand(connector, output, () => START + 2 * 60_000),
    ).toBe(1);
    expect(
      await runHealthCommand({ BRIDGE_MODE: "connector" }, output, () => START),
    ).toBe(1);
    expect(await runHealthCommand({ BRIDGE_MODE: "core" }, output)).toBe(0);

    expect(lines).toEqual([
      "Healthy: link up since 2026-11-15T07:59:00.000Z, Ring session ok.\n",
      expect.stringContaining("Unhealthy. The connector last wrote its health"),
      "Unhealthy. BRIDGE_DATA_DIR is not set.\n",
      "Not checked in this mode: only the connector reports its health here.\n",
    ]);
  });
});

describe("the health writer", () => {
  function writer(sources: {
    up: boolean;
    ring: ConnectorHealthRecord["ring_session"];
  }): { clock: FakeClock; health: HealthWriter } {
    const clock = new FakeClock(START);
    const health = new HealthWriter({
      dataDir: folder,
      clock,
      logger: new Logger({
        sink: () => undefined,
        now: () => clock.now(),
        minLevel: "debug",
      }),
      sources: { linkUp: () => sources.up, ringSession: () => sources.ring },
    });
    return { clock, health };
  }

  async function written(): Promise<ConnectorHealthRecord | undefined> {
    return readHealthRecord(folder);
  }

  it("writes at once, then every 15 s, with when the link last changed, and the link down on stop", async () => {
    const sources = { up: false, ring: "ok" as const };
    const { clock, health } = writer(sources);

    health.start();
    await vi.waitFor(async () => {
      expect(await written()).toEqual({
        written_at: new Date(START).toISOString(),
        link: "down",
        link_since: new Date(START).toISOString(),
        ring_session: "ok",
      });
    });

    sources.up = true;
    await clock.advance(HEALTH_WRITE_INTERVAL_MS);
    const upAt = new Date(START + HEALTH_WRITE_INTERVAL_MS).toISOString();
    await vi.waitFor(async () => {
      expect(await written()).toMatchObject({ link: "up", link_since: upAt });
    });
    await clock.advance(HEALTH_WRITE_INTERVAL_MS);
    await vi.waitFor(async () => {
      expect(await written()).toMatchObject({
        written_at: new Date(
          START + 2 * HEALTH_WRITE_INTERVAL_MS,
        ).toISOString(),
        link: "up",
        link_since: upAt,
      });
    });

    await health.stop();
    expect(await written()).toMatchObject({
      link: "down",
      written_at: new Date(START + 2 * HEALTH_WRITE_INTERVAL_MS).toISOString(),
    });
    expect(await readdir(folder)).toEqual([HEALTH_FILE_NAME]);
    await clock.advance(HEALTH_WRITE_INTERVAL_MS);
    expect((await written())?.written_at).toBe(
      new Date(START + 2 * HEALTH_WRITE_INTERVAL_MS).toISOString(),
    );
  });
});
