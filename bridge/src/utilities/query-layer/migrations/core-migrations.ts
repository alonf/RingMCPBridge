// The core's schema, in order (DS3): Azure SQL in mode H, the same schema in one SQLite file in
// mode A. A new migration goes at the end; a released one is never edited or removed.
import { ITERATION_001_SCHEMA } from "./0001-iteration-001-schema.ts";
import { CONNECTOR_ENROLLMENT_CODE } from "./0002-connector-enrollment-code.ts";
import { ONE_PENDING_ENROLLMENT } from "./0003-one-pending-enrollment.ts";
import { STATE_SOURCE } from "./0004-state-source.ts";
import type { Migration } from "./migration.ts";

export const CORE_MIGRATIONS: readonly Migration[] = [
  ITERATION_001_SCHEMA,
  CONNECTOR_ENROLLMENT_CODE,
  ONE_PENDING_ENROLLMENT,
  STATE_SOURCE,
];
