/** Only metadata marked ready by EventMedia may be used to read an object. */
export interface MediaObjects {
  /** Remote stores can commit after a failed acknowledgement. Enumerate only bridge-owned
   * object names, one bounded page per sweep. */
  listPage?(
    cursor: string | undefined,
    signal: AbortSignal,
  ): Promise<{ ids: readonly string[]; next?: string }>;
  write(
    id: string,
    chunks: AsyncIterable<Uint8Array>,
    signal: AbortSignal,
  ): Promise<void>;
  read(
    id: string,
    start: number,
    length: number,
    signal: AbortSignal,
  ): Promise<Uint8Array>;
  remove(id: string, signal: AbortSignal): Promise<void>;
}
