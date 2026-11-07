// The home's messages, mapped to Event's DTOs at Connector Link's edge (CD4: each component maps to
// its callee's DTOs). The names stay the contract's. The link's UTC ISO 8601 times become
// milliseconds since 1970 (the DTO time form, settled at T022).
import type {
  IncomingDevice,
  IncomingDeviceState,
  IncomingHeartbeat,
  IncomingInventory,
  IncomingLocation,
} from "../../managers/event/index.ts";
import type {
  DeviceEntry,
  DeviceStateMessage,
  HeartbeatMessage,
  InventoryLocation,
  InventoryMessage,
} from "./messages/index.ts";

/** An `inventory` as Event takes it. */
export function incomingInventory(
  message: InventoryMessage,
): IncomingInventory {
  return {
    message_id: message.message_id,
    locations: message.locations.map(incomingLocation),
    devices: message.devices.map(incomingDevice),
  };
}

/** A `device_state` as Event takes it. */
export function incomingDeviceState(
  message: DeviceStateMessage,
): IncomingDeviceState {
  return { message_id: message.message_id, device: incomingDevice(message) };
}

/** A `heartbeat` as Event takes it. */
export function incomingHeartbeat(
  message: HeartbeatMessage,
): IncomingHeartbeat {
  return {
    ring_session: message.ring_session,
    push: message.push,
    outbox_depth: message.outbox_depth,
    last_ring_event_at:
      message.last_ring_event_at === null
        ? null
        : Date.parse(message.last_ring_event_at),
    error_counts: { ...message.error_counts },
    as_of: Date.parse(message.as_of),
  };
}

function incomingLocation(location: InventoryLocation): IncomingLocation {
  return {
    location_id: location.location_id,
    name: location.name,
    time_zone: location.time_zone,
    ...(location.alarm_mode === undefined
      ? {}
      : { alarm_mode: location.alarm_mode }),
    ownership: location.ownership,
    as_of: Date.parse(location.as_of),
    state_version: location.state_version,
  };
}

function incomingDevice(entry: DeviceEntry): IncomingDevice {
  return {
    device_id: entry.device_id,
    location_id: entry.location_id,
    name: entry.name,
    type: entry.type,
    ...(entry.room === undefined ? {} : { room: entry.room }),
    ...(entry.battery_pct === undefined
      ? {}
      : { battery_pct: entry.battery_pct }),
    ...(entry.battery_low === undefined
      ? {}
      : { battery_low: entry.battery_low }),
    power_mode: entry.power_mode,
    online: entry.online,
    state: { ...entry.state },
    as_of: Date.parse(entry.as_of),
    state_version: entry.state_version,
  };
}
