// The Classify engine (CP-11b, T045; FR-009, FR-013, PT-25): an event's priority and whether it is
// late. Pure rules, no I/O. Every priority comes from the policy, which is data: the file
// `priority-policy.json` beside this engine, read and checked by the Host when the core starts.
//
// - **Priority:** the policy's rules are read in order and the first that matches decides. A rule
//   names event kinds and may add conditions: whether the location is armed, the device's type,
//   and whether Ring reported a person. A kind no rule matches gets the policy's default.
// - **Armed** means the location's alarm mode is `home` or `away`. A location with no alarm mode
//   is not armed, so `armed: false` matches it.
// - **Late** (PT-25): an event read from Ring's history after a gap is late, and so is one that
//   reaches the core more than the policy's limit after the home received it. Both times are
//   compared as given; the home's and the core's clocks are assumed synced (CD-A4).
// - The recovery summary's priority is the highest among the late events: `highestPriority`.
import { z } from "zod";

/** The priorities, lowest first. */
export const PRIORITY_ORDER = ["LOW", "MEDIUM", "HIGH"] as const;

/** An event's priority. */
export type EventPriority = (typeof PRIORITY_ORDER)[number];

/** The policy file's version this engine reads. */
export const PRIORITY_POLICY_VERSION = 1;

const MS_PER_SECOND = 1000;
const MAX_LATE_AFTER_S = 3600;
const KIND = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*$/;
const DEVICE_TYPES = [
  "contact",
  "motion",
  "flood",
  "keypad",
  "base_station",
  "camera",
  "doorbell",
  "light",
  "other",
] as const;

const priority = z.enum(PRIORITY_ORDER);

const conditions = z.strictObject({
  armed: z.boolean().optional(),
  device_types: z.array(z.enum(DEVICE_TYPES)).min(1).optional(),
  person: z.boolean().optional(),
});

const rule = z.strictObject({
  kinds: z.array(z.string().regex(KIND)).min(1),
  when: conditions.optional(),
  priority,
});

const policyFile = z.strictObject({
  version: z.literal(PRIORITY_POLICY_VERSION),
  late_after_s: z.int().min(1).max(MAX_LATE_AFTER_S),
  default_priority: priority,
  rules: z.array(rule).min(1),
});

/** One rule of the policy: the kinds it covers, its conditions, and the priority it gives. */
export interface PriorityRule {
  readonly kinds: readonly string[];
  readonly armed?: boolean;
  readonly deviceTypes?: readonly string[];
  readonly person?: boolean;
  readonly priority: EventPriority;
}

/** The checked policy. */
export interface PriorityPolicy {
  /** An event that reaches the core more than this after the home received it is late. */
  readonly lateAfterMs: number;
  readonly defaultPriority: EventPriority;
  readonly rules: readonly PriorityRule[];
}

/** What the engine needs to know about an event to give it a priority. */
export interface PriorityFacts {
  readonly kind: string;
  /** Whether the event's location is armed (`home` or `away`) as the event is classified. */
  readonly armed: boolean;
  /** The event's device type, when it has a device the core knows. */
  readonly deviceType?: string;
  /** Whether Ring reported a person with the event. */
  readonly person?: boolean;
}

/** What the engine needs to know about an event to decide whether it is late. */
export interface LatenessFacts {
  /** When the home received it, in epoch milliseconds. */
  readonly receivedAtMs: number;
  /** When it reached the core, in epoch milliseconds. */
  readonly arrivedAtMs: number;
  /** Whether the home read it from Ring's history after a gap. */
  readonly fromHistory: boolean;
}

/** The policy file cannot be used. The message says where and why, for the start-up log. */
export class PriorityPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PriorityPolicyError";
  }
}

function hasNoConditions(candidate: PriorityRule): boolean {
  return (
    candidate.armed === undefined &&
    candidate.deviceTypes === undefined &&
    candidate.person === undefined
  );
}

// A rule after an unconditional rule for the same kind can never decide: a mistake in the file.
function unreachableRule(rules: readonly PriorityRule[]): string | undefined {
  const decided = new Set<string>();
  for (const [index, candidate] of rules.entries()) {
    const shadowed = candidate.kinds.find((kind) => decided.has(kind));
    if (shadowed !== undefined) {
      return `rules[${String(index)}] can never apply to ${shadowed}: an earlier rule without conditions already decides it`;
    }
    if (hasNoConditions(candidate)) {
      candidate.kinds.forEach((kind) => decided.add(kind));
    }
  }
  return undefined;
}

/**
 * The policy from the policy file's parsed JSON. Throws `PriorityPolicyError` for a file in the
 * wrong form, or one with a rule that can never apply.
 */
export function parsePriorityPolicy(raw: unknown): PriorityPolicy {
  const parsed = policyFile.safeParse(raw);
  if (!parsed.success) {
    const [issue] = parsed.error.issues;
    const where = issue?.path.join(".") ?? "";
    throw new PriorityPolicyError(
      `The priority policy is not valid at "${where}": ${issue?.message ?? "unknown"}`,
    );
  }
  const rules = parsed.data.rules.map((entry): PriorityRule => ({
    kinds: entry.kinds,
    priority: entry.priority,
    ...(entry.when?.armed === undefined ? {} : { armed: entry.when.armed }),
    ...(entry.when?.device_types === undefined
      ? {}
      : { deviceTypes: entry.when.device_types }),
    ...(entry.when?.person === undefined ? {} : { person: entry.when.person }),
  }));
  const unreachable = unreachableRule(rules);
  if (unreachable !== undefined) {
    throw new PriorityPolicyError(
      `The priority policy is not valid: ${unreachable}.`,
    );
  }
  return {
    lateAfterMs: parsed.data.late_after_s * MS_PER_SECOND,
    defaultPriority: parsed.data.default_priority,
    rules,
  };
}

function matches(candidate: PriorityRule, facts: PriorityFacts): boolean {
  const armed =
    candidate.armed === undefined || candidate.armed === facts.armed;
  const deviceType =
    candidate.deviceTypes === undefined ||
    (facts.deviceType !== undefined &&
      candidate.deviceTypes.includes(facts.deviceType));
  const person =
    candidate.person === undefined ||
    candidate.person === (facts.person ?? false);
  return candidate.kinds.includes(facts.kind) && armed && deviceType && person;
}

/** The event's priority: the first matching rule's, or the policy's default. */
export function priorityOf(
  policy: PriorityPolicy,
  facts: PriorityFacts,
): EventPriority {
  return (
    policy.rules.find((candidate) => matches(candidate, facts))?.priority ??
    policy.defaultPriority
  );
}

/** Whether the event is late: read from history, or held at home past the policy's limit. */
export function isLate(policy: PriorityPolicy, facts: LatenessFacts): boolean {
  return (
    facts.fromHistory ||
    facts.arrivedAtMs - facts.receivedAtMs > policy.lateAfterMs
  );
}

/** The highest of some priorities, as the recovery summary carries it; nothing for none. */
export function highestPriority(
  priorities: readonly EventPriority[],
): EventPriority | undefined {
  return PRIORITY_ORDER.findLast((candidate) => priorities.includes(candidate));
}
