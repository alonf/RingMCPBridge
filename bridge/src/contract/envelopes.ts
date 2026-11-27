// The reply and error envelopes (contracts/errors.md). A reply carries its data with when it was
// true and how fresh it is (FR-006); a failure carries one of the fourteen codes, which grow only
// additively (FR-046).
import { z } from "zod";
import { localTime, utcTime } from "./shapes.ts";

/** How fresh a reply's data is. */
export const FRESHNESS = ["live", "cached", "stale"] as const;

/** Every error code a tool can return (contracts/errors.md "Error codes"). */
export const ERROR_CODES = [
  "INVALID_ARGUMENT",
  "NOT_FOUND",
  "BRIDGE_UNAVAILABLE",
  "RATE_LIMITED",
  "TIMEOUT",
  "INTERNAL",
  "HOME_OFFLINE",
  "RING_UNAVAILABLE",
  "RING_REJECTED",
  "BATTERY_GUARD",
  "SNAPSHOT_BLOCKED",
  "CONFIRMATION_INVALID",
  "ACTION_DISABLED",
  "HUMAN_DECLINED",
] as const;

/** What happened to a control action. */
export const OUTCOMES = ["done", "not_done", "unknown"] as const;

export type Freshness = (typeof FRESHNESS)[number];
export type ErrorCode = (typeof ERROR_CODES)[number];
export type Outcome = (typeof OUTCOMES)[number];

interface FreshnessFields {
  readonly freshness: Freshness;
  readonly stale_since?: string | undefined;
}

// FR-006: stale data always says since when, and only stale data does.
function staleSinceExactlyWhenStale(
  reply: FreshnessFields,
  context: z.RefinementCtx,
): void {
  if ((reply.freshness === "stale") !== (reply.stale_since !== undefined)) {
    context.addIssue({
      code: "custom",
      path: ["stale_since"],
      message: "stale_since is present exactly when freshness is stale",
    });
  }
}

/** The envelope every successful tool call returns, around the tool's `data`; zod infers its type. */
export function replyEnvelope<Data extends z.ZodType>(
  data: Data,
  description: string,
) {
  return z
    .object({
      as_of: utcTime("When the data was true, in UTC."),
      as_of_local: localTime(
        "The same instant in the location's time zone, with its offset.",
      ),
      freshness: z.enum(FRESHNESS).meta({
        description:
          "live: read now; cached: recent enough for this read; stale: the last known state while the home link is down. Stale data is never current.",
      }),
      stale_since: utcTime(
        "When the data became stale, in UTC. Present only when freshness is stale.",
      ).optional(),
      data,
    })
    .superRefine(staleSinceExactlyWhenStale)
    .meta({ description });
}

/** What a failed tool call returns, as structured content with `isError: true`. */
export const errorEnvelope = z
  .object({
    error: z.object({
      code: z.enum(ERROR_CODES).meta({
        description: "What went wrong. New codes may be added.",
      }),
      message: z.string().min(1).meta({
        description:
          "Plain words for the agent, written by the bridge. It carries identifiers, never content: no tokens, PIN, keys or images.",
      }),
      retryable: z.boolean().meta({
        description: "Whether the same call may succeed later.",
      }),
      retry_after_s: z
        .int()
        .min(0)
        .meta({ description: "When to retry, in seconds, when that applies." })
        .optional(),
      outcome: z
        .enum(OUTCOMES)
        .meta({
          description:
            "Control tools only: what happened to the action. unknown means check the state before anything else.",
        })
        .optional(),
      details: z
        .record(z.string(), z.unknown())
        .meta({ description: "Facts that depend on the code." })
        .optional(),
    }),
    as_of: utcTime("When the failure happened, in UTC."),
  })
  .meta({
    title: "Tool error",
    description:
      "The structured content of a failed tool call (isError: true).",
  });
