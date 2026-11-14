// Waiting on shared work without being held by it after the caller's abort.

/**
 * Settles with `work`, or rejects with the signal's reason as soon as it aborts. `work` itself goes
 * on, because it is shared (a connection being opened, the queue's turn). Its failure is observed
 * here first, even when the caller has already gone: an unobserved rejection ends the process.
 */
export async function untilAborted<T>(
  work: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  work.catch(() => undefined);
  signal.throwIfAborted();
  let onAbort = (): void => undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => {
      reject(signal.reason as Error);
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    return await Promise.race([work, aborted]);
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}
