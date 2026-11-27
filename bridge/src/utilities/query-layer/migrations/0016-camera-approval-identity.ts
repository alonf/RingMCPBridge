import type { Migration } from "./migration.ts";

function statements(sqlite: boolean) {
  const add = sqlite ? "ADD COLUMN" : "ADD";
  const type = sqlite
    ? "TEXT"
    : "NVARCHAR(256) COLLATE Latin1_General_100_BIN2";
  return [
    `ALTER TABLE camera_media_approval ${add} location_id ${type} NULL`,
    `ALTER TABLE camera_media_approval ${add} device_id ${type} NULL`,
    `ALTER TABLE owner_media_change ${add} camera_key ${type} NULL`,
  ];
}
export const CAMERA_APPROVAL_IDENTITY: Migration = {
  version: 16,
  name: "camera-approval-identity",
  statements: { sqlite: statements(true), tsql: statements(false) },
};
