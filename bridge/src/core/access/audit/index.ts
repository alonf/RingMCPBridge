// Audit (CP-11b, T046): one record per audited change, with identifiers only, written in the
// transaction of the change it records. Its only entry point (CD4). Iteration 002 writes the
// per-event entries; the hash chain and the write-once copy come in iteration 004.

/** The audit and the DTOs it declares. */
export {
  Audit,
  AuditError,
  EVENT_INGESTED,
  EVENTS_CHAIN,
  MAX_ENTRIES_PER_READ,
} from "./audit.ts";
export type {
  AuditOptions,
  EventIngestedEntry,
  IngestedEvent,
} from "./audit.ts";

export { recordOwnerMediaChange } from "./owner-media-change.ts";
