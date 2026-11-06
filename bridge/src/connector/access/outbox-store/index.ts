// Outbox Store (CP-08a): the home's durable queue of messages for the core, and its state_version
// counter, in the connector's own SQLite file. Its only entry point (CD4). Ingest writes to it;
// Core Link sends from it through Ingest (T016).

/** The store, its resend time, and the DTOs it declares. */
export { OutboxStore, RESEND_AFTER_MS } from "./outbox-store.ts";
export type {
  OutboxBody,
  OutboxDraft,
  OutboxItem,
  OutboxKind,
  OutboxStoreOptions,
  StateVersions,
} from "./outbox-store.ts";

/** The error every operation throws: `unavailable`. */
export { OutboxStoreError } from "./outbox-store-error.ts";
export type { OutboxStoreErrorKind } from "./outbox-store-error.ts";
