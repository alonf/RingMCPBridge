// State (CP-14, T019): the core's picture of the home (locations, devices and the health
// snapshot) in the core's database. Its only entry point (CD4). Event writes it from the link;
// Inquiry reads it for the four read tools. It also records which connector key its versions
// belong to.

/** The store and the DTOs it declares. */
export { StateStore } from "./state-store.ts";
export type {
  DeviceApplied,
  DeviceFilter,
  DeviceState,
  DeviceType,
  HealthSnapshot,
  InventoryApplied,
  InventorySnapshot,
  LocationState,
  StateStoreOptions,
  VersionsClaim,
} from "./state-store.ts";

/** The error every operation throws: `unavailable` (the store is down) or `failed`. */
export { StateStoreError } from "./state-store-error.ts";
export type { StateStoreErrorKind } from "./state-store-error.ts";
