// Lease (CP-10, T026): the single-instance lease, one row per Ring account in the core's database
// (FR-044, CD C6). Its only entry point (CD4). The Host holds it; control acts only while it is
// held, and `/readyz` reports it.

/** The lease, its timing, and the DTOs it declares. */
export {
  Lease,
  LEASE_EXPIRES_MS,
  LEASE_HELD_MS,
  LEASE_RENEW_MS,
  LEASE_TIMING,
  LEASE_WRITE_TIMEOUT_MS,
} from "./lease.ts";
export type {
  LeaseLack,
  LeaseOptions,
  LeaseStatus,
  LeaseStore,
  LeaseTiming,
} from "./lease.ts";
