// The Ring-boundary contract test (T013): no ring-client-api type, error or event crosses the Ring
// Adapter's port, and the scenario engine implements the same port. The same checks run against
// both, so every test that uses the engine in place of Ring tests what the adapter really does.
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  RING_CALL_LIMITS,
  RingCallGate,
} from "../../src/connector/access/ring-adapter/call-limits.ts";
import { RingAdapterError } from "../../src/connector/access/ring-adapter/index.ts";
import type {
  RingChange,
  RingPort,
} from "../../src/connector/access/ring-adapter/index.ts";
import { RingApiAdapter } from "../../src/connector/access/ring-adapter/ring-api-adapter.ts";
import { FakeClock } from "../../src/utilities/clock/index.ts";
import { Logger } from "../../src/utilities/logging/index.ts";
import { ScenarioEngine, STANDARD_LOCATION_ID } from "../scenarios/index.ts";
import {
  driveFakeClock,
  FAKE_RING_BODY,
  FakeRingClient,
  ringHttpError,
} from "../support/fake-ring-client.ts";

const START = Date.UTC(2026, 10, 6, 9, 0, 0);
const SOURCE_ROOT = fileURLToPath(new URL("../../src/", import.meta.url));
const ADAPTER_FOLDER = "connector/access/ring-adapter";
const IMPORTS_RING_CLIENT_API =
  /\bfrom\s+["']ring-client-api[/"']|import\(\s*["']ring-client-api/;
// The only files that may import ring-client-api: the adapter's and live media's live clients.
const LIVE_CLIENT =
  /^connector\/access\/(?:ring-adapter|live-media)\/[\w-]+\.live\.ts$/;

async function sourceFiles(folder: string): Promise<readonly string[]> {
  const entries = await readdir(folder, {
    withFileTypes: true,
    recursive: true,
  });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => join(entry.parentPath, entry.name));
}

/** True when nothing in `value` is a class instance, a function or a symbol: JSON data only. */
function isPlainData(value: unknown): boolean {
  if (
    value === null ||
    ["string", "number", "boolean"].includes(typeof value)
  ) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every(isPlainData);
  }
  if (typeof value !== "object") {
    return false;
  }
  return (
    Object.getPrototypeOf(value) === Object.prototype &&
    Object.values(value).every(isPlainData)
  );
}

interface PortUnderTest {
  readonly port: RingPort;
  readonly clock: FakeClock;
  readonly locationId: string;
  /** Makes Ring refuse the bridge, as a 406 does. */
  readonly blockRing: () => void;
}

const PORTS: readonly {
  readonly name: string;
  readonly make: () => PortUnderTest;
}[] = [
  {
    name: "the scenario engine",
    make: () => {
      const clock = new FakeClock(START);
      const engine = new ScenarioEngine(clock);
      return {
        port: engine,
        clock,
        locationId: STANDARD_LOCATION_ID,
        blockRing: () => {
          engine.apply({ kind: "fault", fault: { kind: "blocked" } });
        },
      };
    },
  },
  {
    name: "the Ring Adapter over ring-client-api",
    make: () => {
      const clock = new FakeClock(START);
      const client = new FakeRingClient();
      const adapter = new RingApiAdapter({
        client,
        gate: new RingCallGate(clock, RING_CALL_LIMITS),
        clock,
        logger: new Logger({
          sink: () => undefined,
          now: () => clock.now(),
          minLevel: "debug",
        }),
        saveRefreshToken: () => Promise.resolve(),
      });
      return {
        port: adapter,
        clock,
        locationId: "loc-1",
        blockRing: () => {
          client.nextFailure = () => Promise.reject(ringHttpError(406));
        },
      };
    },
  },
];

describe("only the live clients import ring-client-api", () => {
  it("is imported by no other source file", async () => {
    const importers: string[] = [];
    for (const file of await sourceFiles(SOURCE_ROOT)) {
      if (IMPORTS_RING_CLIENT_API.test(await readFile(file, "utf8"))) {
        importers.push(relative(SOURCE_ROOT, file).replaceAll("\\", "/"));
      }
    }
    // The client, what the live files share, and the Setup CLI's sign-in (T028).
    expect(importers.sort()).toEqual([
      `${ADAPTER_FOLDER}/ring-client.live.ts`,
      `${ADAPTER_FOLDER}/ring-library.live.ts`,
      `${ADAPTER_FOLDER}/ring-login.live.ts`,
    ]);
    expect(importers.every((file) => LIVE_CLIENT.test(file))).toBe(true);
  });
});

describe.each(PORTS)("the Ring port: $name", ({ make }) => {
  it("returns locations and devices as plain data", async () => {
    const { port, clock, locationId } = make();
    const signal = new AbortController().signal;
    const locations = await driveFakeClock(clock, port.locations(signal));
    expect(locations.length).toBeGreaterThan(0);
    expect(isPlainData(locations)).toBe(true);
    const devices = await driveFakeClock(
      clock,
      port.devices(locationId, signal),
    );
    expect(devices.length).toBeGreaterThan(0);
    expect(isPlainData(devices)).toBe(true);
    expect(port.sessionStatus()).toBe("ok");
  });

  it("returns no devices for a location Ring does not know", async () => {
    const { port, clock } = make();
    const signal = new AbortController().signal;
    await expect(
      driveFakeClock(clock, port.devices("no-such-location", signal)),
    ).resolves.toEqual([]);
  });

  it("fails only with the adapter's own error, and reports the session as plain data", async () => {
    const { port, clock, blockRing } = make();
    const changes: RingChange[] = [];
    const stop = port.watch((change) => changes.push(change));
    expect(typeof stop).toBe("function");
    blockRing();
    const error: unknown = await driveFakeClock(
      clock,
      port.locations(new AbortController().signal),
    ).then(
      () => undefined,
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(RingAdapterError);
    expect((error as RingAdapterError).kind).toBe("ring_unavailable");
    expect((error as RingAdapterError).cause).toBeUndefined();
    expect((error as RingAdapterError).message).not.toContain(FAKE_RING_BODY);
    expect(port.sessionStatus()).toBe("unavailable");
    expect(changes).toContainEqual({ kind: "session", status: "unavailable" });
    expect(isPlainData(changes)).toBe(true);
    stop();
  });
});
