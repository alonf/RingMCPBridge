import { untilAborted } from "../../../utilities/query-layer/index.ts";

/** Work that must settle before this core closes the media audit store. */
export class DownloadLifetime {
  readonly #shutdown = new AbortController();
  readonly #pending = new Set<Promise<unknown>>();

  get signal(): AbortSignal {
    return this.#shutdown.signal;
  }

  track<T>(work: Promise<T>): Promise<T> {
    this.#pending.add(work);
    return work.finally(() => {
      this.#pending.delete(work);
    });
  }

  async stop(deadline: AbortSignal): Promise<void> {
    this.#shutdown.abort();
    // A request still preparing its first bytes can start an audit as it settles.
    while (this.#pending.size) {
      await untilAborted(Promise.allSettled(this.#pending), deadline);
    }
  }
}
