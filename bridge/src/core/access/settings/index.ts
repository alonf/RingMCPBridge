// Settings (CP-16, T022): the listed agents, the home part's enrollment keys and the global battery
// threshold, in the core's database. Its only entry point (CD4). The Issuer reads the listing,
// Connector Link checks keys and records enrollment requests, and the admin page approves them.

/** The store, its limits, and the DTOs it declares. */
export {
  ENROLLMENT_REQUEST_TTL_MS,
  MAX_ENROLLMENT_CODE_LENGTH,
  SettingsStore,
} from "./settings-store.ts";
export type {
  AgentScope,
  AgentSeed,
  AgentSeedReport,
  ConnectorKey,
  EnrollmentApproval,
  EnrollmentRequest,
  EnrollmentRequestOutcome,
  ListedAgent,
  PendingEnrollment,
  SettingsStoreOptions,
} from "./settings-store.ts";

/** The error every operation throws: `unavailable` or `failed`. */
export { SettingsStoreError } from "./settings-store-error.ts";
export type { SettingsStoreErrorKind } from "./settings-store-error.ts";
