// Classify engine (CP-11b, T045): an event's priority from policy data, and the late-event rule.
// Its only entry point (CD4). Pure rules, no I/O; the Host reads the policy file when the core
// starts, and the Event manager applies the rules.

/** The rules, and reading the policy. */
export {
  highestPriority,
  isLate,
  keptFromSharedLocation,
  parsePriorityPolicy,
  priorityOf,
  PRIORITY_ORDER,
  PRIORITY_POLICY_VERSION,
  PriorityPolicyError,
  SHARED_LOCATION_KINDS,
} from "./classify-engine.ts";
export type {
  EventPriority,
  LatenessFacts,
  PriorityFacts,
  PriorityPolicy,
  PriorityRule,
} from "./classify-engine.ts";

/** Where the policy file is: `priority-policy.json`, beside this engine. */
export const PRIORITY_POLICY_FILE = new URL(
  "./priority-policy.json",
  import.meta.url,
);
