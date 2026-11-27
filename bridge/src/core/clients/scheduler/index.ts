import type { Clock } from "../../../utilities/clock/index.ts";

const MINUTE_MS = 60_000;
/** A lease term owns the timer. Slow ticks never overlap and shutdown cancels pending work. */
export function startCoreScheduler(
  clock: Clock,
  tick: (signal: AbortSignal) => Promise<void>,
  onError: (error: unknown) => void,
): () => void {
  const controller = new AbortController();
  let busy = false;
  const cancel = clock.every(MINUTE_MS, () => {
    if (busy) return;
    busy = true;
    void tick(controller.signal)
      .catch((error: unknown) => {
        if (!controller.signal.aborted) onError(error);
      })
      .finally(() => {
        busy = false;
      });
  });
  return () => {
    cancel();
    controller.abort();
  };
}
