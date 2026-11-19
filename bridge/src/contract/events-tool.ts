// `get_events` (T052; contracts/mcp-tools.md "get_events", contracts/iteration-002-tools.schema.json):
// events after a cursor, in `seq` order, filtered, with a cursor for the next read. The input is
// flat and rejects unknown fields (FR-048); the reply is the envelope around `data`.
import { z } from "zod";
import { replyEnvelope } from "./envelopes.ts";
import { EVENT_PRIORITIES, eventShape } from "./event.ts";
import type { ToolContract } from "./tool-contract.ts";
import { toolDescription } from "./untrusted.ts";

/** The most events one read returns unless the agent asks for fewer or more (up to the maximum). */
export const DEFAULT_EVENTS_PER_READ = 50;
/** The most events one read may return: the reply must stay within the token budget [P]. */
export const MAX_EVENTS_PER_REPLY = 200;

export const getEventsInput = z
  .strictObject({
    location_id: z
      .string()
      .min(1)
      .meta({
        description:
          "The location. Omitted: the cursor's location, else the owned location when there is exactly one. When a cursor is also given, it must be the cursor's location, or INVALID_ARGUMENT.",
      })
      .optional(),
    cursor: z
      .string()
      .min(1)
      .meta({
        description:
          "An opaque cursor from a previous next_cursor. Omitted: events after this client's last-read mark in the location, or from the start of the log on a first read. A cursor from an older log epoch returns events from the start of the current epoch, with epoch_changed: true. Malformed or foreign: INVALID_ARGUMENT.",
      })
      .optional(),
    limit: z
      .int()
      .min(1)
      .meta({
        description: `The most events to return. The default is ${String(DEFAULT_EVENTS_PER_READ)}; the server caps it at ${String(MAX_EVENTS_PER_REPLY)}.`,
      })
      .optional(),
    min_priority: z
      .enum(EVENT_PRIORITIES)
      .meta({ description: "Only events of this priority or higher." })
      .optional(),
    kind: z
      .string()
      .min(1)
      .meta({
        description:
          "Only events of this kind, for example contact.open. The kind list is open.",
      })
      .optional(),
    device_id: z
      .string()
      .min(1)
      .meta({ description: "Only events from this device." })
      .optional(),
  })
  .meta({
    title: "get_events input",
    description:
      "Scope: read. Events after a cursor, filtered, in seq order, with next_cursor for the next read. The cursor never skips and survives restarts. The log is the truth and push is a hint.",
  });

export const eventsData = z.object({
  events: z.array(eventShape).meta({
    description:
      "The events that matched, in seq order. Late events are included, with late: true. Event text comes from Ring and is untrusted.",
  }),
  next_cursor: z.string().min(1).meta({
    description:
      "Pass this as cursor to read on. It moves past every event this read examined, matched or not, so a filter never makes a read repeat or skip.",
  }),
  has_more: z.boolean().meta({
    description: "Whether more events follow next_cursor in the log.",
  }),
  epoch_changed: z
    .literal(true)
    .meta({
      description:
        "Present and true only when the cursor was from an older log epoch (after a restore or reset): the reply then starts at the beginning of the current epoch. Dedupe by event_id; nothing is skipped.",
    })
    .optional(),
});

export const getEventsTool = {
  name: "get_events",
  scope: "read",
  description: toolDescription(
    "Events from the bridge's log after a cursor, in order, filtered by priority, kind or device, with a cursor for the next read. Use it to read what push only hinted at, including LOW events that are never pushed.",
  ),
  input: getEventsInput,
  reply: replyEnvelope(eventsData, "The get_events reply."),
} satisfies ToolContract;
