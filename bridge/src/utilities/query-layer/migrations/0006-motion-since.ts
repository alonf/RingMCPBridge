// Migration 6 (DRIFT-001-86): when a motion sensor's motion began, as the home first reported it.
// - `device.motion_since` is set when State stores a motion sensor going from clear to motion, kept
//   while the motion lasts, and cleared when it ends, so a later report (a battery level, a re-read
//   after a reconnect) does not move it. NULL for every other device.
// - A sensor already in motion when this runs has none until its next report, which starts it; the
//   overview gives its latest report until then. Filling it here would change data, and a migration
//   only adds (DS5).
// Additive: one nullable column, so code N-1 still runs on this schema (DS5).
// Once released, this file never changes.
import type { Migration } from "./migration.ts";

export const MOTION_SINCE: Migration = {
  version: 6,
  name: "motion-since",
  statements: {
    sqlite: ["ALTER TABLE device ADD COLUMN motion_since INTEGER"],
    tsql: ["ALTER TABLE device ADD motion_since BIGINT NULL"],
  },
};
