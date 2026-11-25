import type { Migration } from "./migration.ts";

/** A form revision independent of the generations bound to download grants. */
export const CAMERA_APPROVAL_REVISION: Migration = {
  version: 17,
  name: "camera-approval-revision",
  statements: {
    sqlite: [
      "ALTER TABLE camera_media_policy ADD COLUMN approval_revision TEXT NULL",
    ],
    tsql: [
      "ALTER TABLE camera_media_policy ADD approval_revision VARCHAR(36) NULL",
    ],
  },
};
