// Driving the fake clock while real I/O runs: small steps, with I/O let through between them.
import type { FakeClock } from "../../src/utilities/clock/index.ts";

/** One step of fake time. */
export const DRIVE_STEP_MS = 250;
/** How much fake time `driveUntil` allows before it gives up. */
export const DRIVE_LIMIT_MS = 10 * 60_000;
const IO_ROUNDS = 5;

async function ioRound(): Promise<void> {
  for (let round = 0; round < IO_ROUNDS; round += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

/**
 * Moves the fake clock in small steps, letting I/O run between them, until `condition` holds. Each
 * step also runs `everyStep`, for a check that must hold all along. Resolves with the fake time it
 * took.
 */
export async function driveUntil(
  clock: FakeClock,
  condition: () => boolean | Promise<boolean>,
  everyStep: () => void = () => undefined,
): Promise<number> {
  const startedAt = clock.now();
  everyStep();
  while (!(await condition())) {
    if (clock.now() - startedAt > DRIVE_LIMIT_MS) {
      throw new Error("It did not get there in time.");
    }
    await clock.advance(DRIVE_STEP_MS);
    await ioRound();
    everyStep();
  }
  return clock.now() - startedAt;
}

/** Moves the fake clock on by `ms` in small steps, letting I/O run between them. */
export async function driveFor(
  clock: FakeClock,
  ms: number,
  everyStep: () => void = () => undefined,
): Promise<void> {
  const until = clock.now() + ms;
  await driveUntil(clock, () => clock.now() >= until, everyStep);
}
