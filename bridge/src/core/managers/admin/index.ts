// Admin manager (CD map v3): the owner's use cases from the admin page. Its only entry point
// (CD4). At T017 it holds the connector's key check and enroll request; T029 adds the rest.

/** The manager and the DTOs it declares. */
export { AdminManager } from "./admin-manager.ts";
export type {
  AdminManagerOptions,
  ConnectorEnrollmentOutcome,
  ConnectorEnrollmentRequest,
  ConnectorKeyCheck,
} from "./admin-manager.ts";

/** The error every use case throws: `unavailable` or `failed`. */
export { AdminError } from "./admin-error.ts";
export type { AdminErrorKind } from "./admin-error.ts";
