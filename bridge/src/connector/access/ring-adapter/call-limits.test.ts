// The Ring call limits (T013, written first): backoff, the circuit, and the gate that spaces every
// Ring call, one at a time, on the fake clock (FR-026, FR-042, R25).
import { describe, expect, it } from "vitest";
import { FakeClock } from "../../../utilities/clock/index.ts";
import { backoffDelayMs, Circuit, RingCallGate } from "./call-limits.ts";
import type { RingCallLimits } from "./call-limits.ts";
import { RingAdapterError } from "./ring-adapter-error.ts";

const START = Date.UTC(2026, 10, 6, 9, 0, 0);
const LIMITS: RingCallLimits = {
  spacingMs: 1_000,
  backoff: { initialMs: 2_000, capMs: 60_000 },
  circuit: { failureThreshold: 5, probeIntervalMs: 60_000 },
};
const NO_JITTER = (): number => 1;

function unavailable(): RingAdapterError {
  return new RingAdapterError("ring_unavailable", "Ring is down.");
}

function never(): AbortSignal {
  return new AbortController().signal;
}

/** Settles `work` on the fake clock and reports how it ended. */
async function outcome(work: Promise<unknown>): Promise<string> {
  return work.then(
    () => "ok",
    (error: unknown) =>
      error instanceof RingAdapterError ? error.kind : String(error),
  );
}

describe("backoffDelayMs", () => {
  it("doubles from the first delay up to the cap, between half and all of it", () => {
    const policy = LIMITS.backoff;
    expect(backoffDelayMs(0, policy, NO_JITTER)).toBe(0);
    expect(backoffDelayMs(1, policy, NO_JITTER)).toBe(2_000);
    expect(backoffDelayMs(2, policy, NO_JITTER)).toBe(4_000);
    expect(backoffDelayMs(5, policy, NO_JITTER)).toBe(32_000);
    expect(backoffDelayMs(6, policy, NO_JITTER)).toBe(60_000);
    expect(backoffDelayMs(2_000, policy, NO_JITTER)).toBe(60_000);
    expect(backoffDelayMs(1, policy, () => 0)).toBe(1_000);
    expect(backoffDelayMs(6, policy, () => 0.5)).toBe(45_000);
  });
});

describe("Circuit", () => {
  it("opens after 5 failures in a row, then lets one probe through each minute", async () => {
    const clock = new FakeClock(START);
    const circuit = new Circuit(clock, LIMITS.circuit);
    for (let failure = 1; failure <= 4; failure += 1) {
      expect(circuit.admit()).toBe("call");
      circuit.failed();
    }
    expect(circuit.isOpen).toBe(false);
    expect(circuit.admit()).toBe("call");
    circuit.failed();
    expect(circuit.isOpen).toBe(true);
    expect(circuit.admit()).toBe("refuse");

    await clock.advance(60_000);
    expect(circuit.admit()).toBe("probe");
    expect(circuit.admit()).toBe("refuse");
    circuit.failed();
    expect(circuit.admit()).toBe("refuse");
    await clock.advance(60_000);
    expect(circuit.admit()).toBe("probe");
    circuit.succeeded();
    expect(circuit.isOpen).toBe(false);
    expect(circuit.failures).toBe(0);
    expect(circuit.admit()).toBe("call");
  });

  it("frees the probe when it ends without a verdict", async () => {
    const clock = new FakeClock(START);
    const circuit = new Circuit(clock, LIMITS.circuit);
    for (let failure = 1; failure <= 5; failure += 1) {
      circuit.failed();
    }
    await clock.advance(60_000);
    expect(circuit.admit()).toBe("probe");
    circuit.ended();
    expect(circuit.isOpen).toBe(true);
    expect(circuit.admit()).toBe("probe");
  });

  it("starts the count again after a success", () => {
    const circuit = new Circuit(new FakeClock(START), LIMITS.circuit);
    for (let failure = 1; failure <= 4; failure += 1) {
      circuit.failed();
    }
    circuit.succeeded();
    for (let failure = 1; failure <= 4; failure += 1) {
      circuit.failed();
    }
    expect(circuit.isOpen).toBe(false);
  });
});

describe("RingCallGate", () => {
  it("runs one call at a time, starting each at least the spacing after the last", async () => {
    const clock = new FakeClock(START);
    const gate = new RingCallGate(clock, LIMITS, NO_JITTER);
    const starts: number[] = [];
    let running = 0;
    let most = 0;
    const call = (): Promise<string> =>
      gate.call(never(), async () => {
        starts.push(clock.now());
        running += 1;
        most = Math.max(most, running);
        await clock.sleep(300);
        running -= 1;
        return "done";
      });
    const calls = [call(), call(), call()];
    await clock.advance(5_000);
    await expect(Promise.all(calls)).resolves.toEqual(["done", "done", "done"]);
    expect(most).toBe(1);
    expect(starts).toEqual([START, START + 1_000, START + 2_000]);
  });

  it("holds the next call for the backoff after a failure, and resets it on success", async () => {
    const clock = new FakeClock(START);
    const gate = new RingCallGate(clock, LIMITS, NO_JITTER);
    const starts: number[] = [];
    const failing = (): Promise<never> => {
      starts.push(clock.now());
      return Promise.reject(unavailable());
    };
    const first = outcome(gate.call(never(), failing));
    const second = outcome(gate.call(never(), failing));
    const third = outcome(
      gate.call(never(), () => {
        starts.push(clock.now());
        return Promise.resolve("back");
      }),
    );
    const fourth = outcome(
      gate.call(never(), () => {
        starts.push(clock.now());
        return Promise.resolve("again");
      }),
    );
    await clock.advance(10_000);
    expect(await Promise.all([first, second, third, fourth])).toEqual([
      "ring_unavailable",
      "ring_unavailable",
      "ok",
      "ok",
    ]);
    // After failure 1, a 2 s hold; after failure 2, 4 s; after the success, the spacing only.
    expect(starts).toEqual([
      START,
      START + 2_000,
      START + 6_000,
      START + 7_000,
    ]);
  });

  it("pauses calls after 5 failures, refusing them without calling Ring, and probes each minute", async () => {
    const clock = new FakeClock(START);
    const gate = new RingCallGate(clock, LIMITS, NO_JITTER);
    let ringCalls = 0;
    const failing = (): Promise<never> => {
      ringCalls += 1;
      return Promise.reject(unavailable());
    };
    // Queued while the circuit is still closed: the ones still waiting when it opens are refused.
    const queued = Array.from({ length: 8 }, () =>
      outcome(gate.call(never(), failing)),
    );
    await clock.advance(120_000);
    expect(await Promise.all(queued)).toEqual(
      Array.from({ length: 8 }, () => "ring_unavailable"),
    );
    expect(ringCalls).toBe(5);
    expect(gate.isPaused).toBe(true);

    await clock.advance(80_000);
    const probe = outcome(gate.call(never(), () => Promise.resolve("up")));
    await clock.advance(61_000);
    expect(await probe).toBe("ok");
    expect(gate.isPaused).toBe(false);
  });

  it("counts only ring_unavailable as a failure, and frees a probe that ends otherwise", async () => {
    const clock = new FakeClock(START);
    const gate = new RingCallGate(clock, LIMITS, NO_JITTER);
    const lost = new RingAdapterError("session_lost", "Sign in again.");
    for (let call = 0; call < 6; call += 1) {
      const settled = outcome(gate.call(never(), () => Promise.reject(lost)));
      await clock.advance(1_000);
      expect(await settled).toBe("session_lost");
    }
    expect(gate.isPaused).toBe(false);

    for (let call = 0; call < 5; call += 1) {
      const settled = outcome(
        gate.call(never(), () => Promise.reject(unavailable())),
      );
      await clock.advance(60_000);
      await settled;
    }
    expect(gate.isPaused).toBe(true);
    await clock.advance(60_000);
    const odd = outcome(
      gate.call(never(), () => Promise.reject(new Error("unmapped"))),
    );
    await clock.advance(1_000);
    expect(await odd).toBe("Error: unmapped");
    const probe = outcome(gate.call(never(), () => Promise.resolve("up")));
    await clock.advance(1_000);
    expect(await probe).toBe("ok");
  });

  it("drops a queued call at once when its signal aborts, without calling Ring", async () => {
    const clock = new FakeClock(START);
    const gate = new RingCallGate(clock, LIMITS, NO_JITTER);
    let ringCalls = 0;
    const slow = gate.call(never(), async () => {
      ringCalls += 1;
      await clock.sleep(5_000);
      return "slow";
    });
    const controller = new AbortController();
    const queued = outcome(
      gate.call(controller.signal, () => {
        ringCalls += 1;
        return Promise.resolve("queued");
      }),
    );
    const after = gate.call(never(), () => {
      ringCalls += 1;
      return Promise.resolve(clock.now());
    });
    controller.abort(new Error("caller gave up"));
    expect(await queued).toBe("Error: caller gave up");
    await clock.advance(10_000);
    await expect(slow).resolves.toBe("slow");
    // The call after the dropped one still waits for the slow call, then the spacing.
    await expect(after).resolves.toBe(START + 5_000);
    expect(ringCalls).toBe(2);
  });

  it("refuses a call whose signal has already aborted", async () => {
    const gate = new RingCallGate(new FakeClock(START), LIMITS, NO_JITTER);
    const controller = new AbortController();
    controller.abort(new Error("already"));
    expect(
      await outcome(gate.call(controller.signal, () => Promise.resolve(1))),
    ).toBe("Error: already");
  });
});
