// Grants (CP-16, T022): the Issuer's records for oidc-provider, in one `(model, id)` table in the
// core's database (PT-11). Its only entry point (CD4). Only the Issuer uses it.

/** The store, the models it keeps by their id's hash, and the DTOs it declares. */
export { GrantsStore, HASHED_MODELS } from "./grants-store.ts";
export type {
  ConsumeOutcome,
  GrantPayload,
  GrantsStoreOptions,
} from "./grants-store.ts";

/** The error every operation throws: `unavailable` or `failed`. */
export { GrantsStoreError } from "./grants-store-error.ts";
export type { GrantsStoreErrorKind } from "./grants-store-error.ts";
