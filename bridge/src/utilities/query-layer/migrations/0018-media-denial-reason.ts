import type { Migration } from "./migration.ts";

/** Historical refusals keep NULL when the original check was not recorded. */
export const MEDIA_DENIAL_REASON: Migration = {
  version: 18,
  name: "media-denial-reason",
  statements: {
    sqlite: ["ALTER TABLE media_access_log ADD COLUMN denial_reason TEXT"],
    tsql: ["ALTER TABLE media_access_log ADD denial_reason VARCHAR(64) NULL"],
  },
};
