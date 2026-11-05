// The four iteration 001 read tools (contracts/mcp-tools.md "Inquiry";
// contracts/iteration-001-tools.schema.json). Inputs are flat and reject unknown fields (FR-048);
// outputs are the `data` inside the reply envelope.
import { z } from "zod";
import { replyEnvelope } from "./envelopes.ts";
import {
  alarmMode,
  batteryPct,
  deviceId,
  deviceName,
  deviceReference,
  deviceType,
  locationId,
  locationSummary,
  powerMode,
  roomName,
  utcTime,
} from "./shapes.ts";
import { ringObject, toolDescription } from "./untrusted.ts";

const locationIdInput = z.string().min(1).meta({
  description:
    "The location. Omitted: the owned location when there is exactly one; otherwise INVALID_ARGUMENT, with the location ids in details.",
});

const since = utcTime("Since when the status has held, in UTC.");

const online = z.boolean().meta({
  description: "Whether Ring sees the device now.",
});

// get_health

export const getHealthInput = z.strictObject({}).meta({
  title: "get_health input",
  description:
    "Scope: read. The bridge's own health: the home link, the Ring session, push reception, the last event received, and since when data has been stale. Takes no input.",
});

export const healthData = z.object({
  home_link: z.object({ status: z.enum(["up", "down"]), since }).meta({
    description:
      "The link to the home connector; down after 2 minutes without a heartbeat.",
  }),
  ring_session: z
    .object({ status: z.enum(["ok", "unavailable", "lost"]), since })
    .meta({
      description:
        "The home's Ring session. unavailable: Ring is down or refusing; lost: the owner must sign in to Ring again.",
    }),
  push: z
    .object({ status: z.enum(["ok", "down"]), since })
    .meta({
      description: "Push reception from Ring. Absent until events arrive.",
    })
    .optional(),
  last_event_at: utcTime(
    "When the last event was received, in UTC. Absent until events arrive.",
  ).optional(),
  stale_since: utcTime(
    "Since when the data has been stale, in UTC. Present only while it is stale.",
  ).optional(),
  database: z.object({ status: z.enum(["ok", "down"]) }).meta({
    description: "The bridge's own store.",
  }),
});

// get_overview

export const getOverviewInput = z
  .strictObject({ location_id: locationIdInput.optional() })
  .meta({
    title: "get_overview input",
    description:
      "Scope: read. The home in one reply: alarm mode, open contacts, active motion, offline devices, low batteries and bridge health, within about 8,000 tokens.",
  });

export const overviewData = z.object({
  location: locationSummary,
  alarm_mode: alarmMode
    .meta({
      description:
        "The alarm mode: disarmed, home or away. Absent when the location has no alarm.",
    })
    .optional(),
  open_contacts: z.array(deviceReference).meta({
    description: "Contact sensors that are open now.",
  }),
  active_motion: z
    .array(
      z.object({
        device: deviceReference,
        last_motion_at: utcTime("The last motion, in UTC."),
      }),
    )
    .meta({ description: "Motion sensors that saw motion recently." }),
  offline_devices: z.array(deviceReference).meta({
    description: "Devices Ring does not see now.",
  }),
  low_batteries: z
    .array(
      z.object({ device: deviceReference, battery_pct: batteryPct.optional() }),
    )
    .meta({ description: "Devices whose battery is low." }),
  health: healthData,
});

// list_devices

export const listDevicesInput = z
  .strictObject({
    location_id: locationIdInput.optional(),
    type: deviceType
      .meta({ description: "Only devices of this type." })
      .optional(),
    room: z
      .string()
      .min(1)
      .meta({
        description:
          "Only devices in this room, matched against the room Ring assigns.",
      })
      .optional(),
  })
  .meta({
    title: "list_devices input",
    description:
      "Scope: read. Devices with id, name, type, room, battery level, power mode and online status, filterable by type and room.",
  });

export const deviceListData = z.object({
  devices: z.array(
    z.object({
      id: deviceId,
      name: deviceName,
      type: deviceType,
      room: roomName.optional(),
      battery_pct: batteryPct.optional(),
      power_mode: powerMode,
      online,
    }),
  ),
  count: z.int().min(0).meta({ description: "How many devices are listed." }),
});

// get_device

export const getDeviceInput = z
  .strictObject({
    device_id: z.string().min(1).meta({
      description:
        "The device id, as list_devices returns it (id) or an event names it (device.id). Unknown: NOT_FOUND.",
    }),
  })
  .meta({
    title: "get_device input",
    description: "Scope: read. The full state of one device.",
  });

export const deviceData = z.object({
  device: z.object({
    id: deviceId,
    location_id: locationId,
    name: deviceName,
    type: deviceType,
    room: roomName.optional(),
    battery_pct: batteryPct.optional(),
    battery_low: z
      .boolean()
      .meta({
        description:
          "Ring's own low-battery flag. Absent when Ring does not say.",
      })
      .optional(),
    power_mode: powerMode,
    online,
    state: ringObject(
      "The device's state as Ring reports it; its fields depend on the device type.",
    ),
    as_of: utcTime("When this state was true, in UTC."),
  }),
});

// The tools

/** One tool of the public contract: what MCP Endpoint registers. */
export interface ToolContract<
  Input extends z.ZodObject = z.ZodObject,
  Reply extends z.ZodType = z.ZodType,
> {
  readonly name: string;
  /** The OAuth scope the caller's token needs. */
  readonly scope: "read" | "media" | "control";
  /** The MCP tool description; it ends with the untrusted-content sentence. */
  readonly description: string;
  readonly input: Input;
  /** The reply envelope around the tool's data. */
  readonly reply: Reply;
}

export const getOverviewTool = {
  name: "get_overview",
  scope: "read",
  description: toolDescription(
    "The home in one reply: the alarm mode, open contacts, active motion, offline devices, low batteries and the bridge's health.",
  ),
  input: getOverviewInput,
  reply: replyEnvelope(overviewData, "The get_overview reply."),
} satisfies ToolContract;

export const listDevicesTool = {
  name: "list_devices",
  scope: "read",
  description: toolDescription(
    "The devices at a location, with id, name (as written, in any language), type, room, battery level, power mode and online status. Filter by type or room.",
  ),
  input: listDevicesInput,
  reply: replyEnvelope(deviceListData, "The list_devices reply."),
} satisfies ToolContract;

export const getDeviceTool = {
  name: "get_device",
  scope: "read",
  description: toolDescription("The full state of one device."),
  input: getDeviceInput,
  reply: replyEnvelope(deviceData, "The get_device reply."),
} satisfies ToolContract;

export const getHealthTool = {
  name: "get_health",
  scope: "read",
  description: toolDescription(
    "The bridge's own health: the home link, the Ring session, push reception, the last event received, and since when data has been stale.",
  ),
  input: getHealthInput,
  reply: replyEnvelope(healthData, "The get_health reply."),
} satisfies ToolContract;

/** Every tool, in the catalog's order (contracts/mcp-tools.md "Catalog"). */
export const TOOL_CATALOG: readonly ToolContract[] = [
  getOverviewTool,
  listDevicesTool,
  getDeviceTool,
  getHealthTool,
];
