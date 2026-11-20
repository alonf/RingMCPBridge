// Outbox Store (CP-08a): the home's durable queue of messages for the core, and its state_version
// counter, in the connector's own SQLite file. Its only entry point (CD4). Ingest writes to it;
// Core Link sends from it through Ingest (T016).

/** The store, its file's name, its resend time, and the DTOs it declares. */
export {
  EVENT_RESEND_FIRST_MS,
  EVENT_RESEND_JITTER,
  EVENT_RESEND_MAX_MS,
  EVENT_WINDOW,
  OUTBOX_FILE_NAME,
  OutboxStore,
  RESEND_AFTER_MS,
} from "./outbox-store.ts";
export type {
  EventBacklog,
  OutboxBody,
  OutboxDraft,
  OutboxEvent,
  OutboxItem,
  OutboxKind,
  OutboxStoreOptions,
  StateVersions,
} from "./outbox-store.ts";

/** The error every operation throws: `unavailable`. */
export { OutboxStoreError } from "./outbox-store-error.ts";
export type { OutboxStoreErrorKind } from "./outbox-store-error.ts";
