// Ingest (CP-08a now, CP-08b in iteration 002): the home's way from Ring into the outbox. Its only
// entry point (CD4). Iteration 001 has the state path: `inventory` and `device_state`.

/** The manager and what it is wired with. */
export { Ingest } from "./ingest.ts";
export type { IngestOptions, InventoryOutcome } from "./ingest.ts";
