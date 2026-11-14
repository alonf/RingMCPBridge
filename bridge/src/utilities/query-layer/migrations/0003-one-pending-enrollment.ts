// Migration 3 (T022, after CP-09's co-review round 4): at most one waiting enrollment request
// (PT-32). Settings replaces the waiting request in one transaction, but on SQL Server two such
// transactions can each find none waiting and both insert. This unique index over the waiting rows
// makes the database refuse the second; Settings then tries once more and replaces the first.
// Additive: an index only. Once released, this file never changes.
import type { Migration } from "./migration.ts";

const ONE_PENDING =
  "CREATE UNIQUE INDEX connector_one_pending ON connector (status) WHERE status = 'pending'";

export const ONE_PENDING_ENROLLMENT: Migration = {
  version: 3,
  name: "one-pending-enrollment",
  statements: { sqlite: [ONE_PENDING], tsql: [ONE_PENDING] },
};
