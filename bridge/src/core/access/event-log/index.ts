// Event Log (CP-11b, T046): the durable log of events, in order per location, with dedup on the
// event id. Its only entry point (CD4). The Event manager writes it inside its one transaction
// per event; the read tools reach it through Inquiry from T052.

/** The log and the DTOs it declares. */
export {
  EventLog,
  EventLogError,
  FIRST_LOG_EPOCH,
  MAX_EVENTS_PER_READ,
} from "./event-log.ts";
export type {
  AppendOutcome,
  EventLogOptions,
  EventRecord,
  StoredEvent,
} from "./event-log.ts";
