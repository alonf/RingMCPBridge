// The messages the home sends the core, as Connector Link, their receiver, declares them (CD4: the
// receiver declares; `contracts/connector-link.md` "Frames" and "Device inventory and state").
// Declared in T016, ahead of Connector Link itself (T017), because Core Link at home sends them.
// This file imports only zod, so the home's wiring can use the types without reaching anything
// of the core.
import { z } from "zod";

/** The link frame type of each message the home sends. */
export const HOME_MESSAGE_TYPES = {
  hello: "hello",
  challengeResponse: "challenge_response",
  enroll: "enroll",
  inventory: "inventory",
  deviceState: "device_state",
  heartbeat: "heartbeat",
} as const;

const utcTime = z.iso.datetime();
const stateVersion = z.number().int().positive();

/** `hello`: opens a session at a link version. */
export const helloSchema = z.strictObject({
  version: z.number().int().positive(),
  key_id: z.string().min(1),
  connector_version: z.string().min(1),
  session_id: z.string().min(1),
});
export type HelloMessage = z.infer<typeof helloSchema>;

/** `challenge_response`: the core's challenge, signed with the connector's private key. */
export const challengeResponseSchema = z.strictObject({
  signature: z.string().min(1),
});
export type ChallengeResponseMessage = z.infer<typeof challengeResponseSchema>;

/** `enroll`: asks to be trusted, with the code the Setup CLI printed (SC2). */
export const enrollSchema = z.strictObject({
  public_key: z.string().min(1),
  code: z.string().min(1),
});
export type EnrollMessage = z.infer<typeof enrollSchema>;

/** A location, as `inventory` carries it. Names are untrusted text from Ring (FR-033). */
export const inventoryLocationSchema = z.strictObject({
  location_id: z.string().min(1),
  name: z.string(),
  time_zone: z.string().min(1),
  alarm_mode: z.enum(["disarmed", "home", "away"]).optional(),
  ownership: z.enum(["owned", "shared"]),
  as_of: utcTime,
  state_version: stateVersion,
});
export type InventoryLocation = z.infer<typeof inventoryLocationSchema>;

/** A device's full current entry, as `inventory` and `device_state` carry it (never a delta). */
export const deviceEntrySchema = z.strictObject({
  device_id: z.string().min(1),
  location_id: z.string().min(1),
  name: z.string(),
  type: z.enum([
    "contact",
    "motion",
    "flood",
    "keypad",
    "base_station",
    "camera",
    "doorbell",
    "light",
    "other",
  ]),
  room: z.string().optional(),
  battery_pct: z.number().int().min(0).max(100).optional(),
  battery_low: z.boolean().optional(),
  power_mode: z.enum(["battery", "wired"]),
  online: z.boolean(),
  state: z.record(z.string(), z.unknown()),
  as_of: utcTime,
  state_version: stateVersion,
});
export type DeviceEntry = z.infer<typeof deviceEntrySchema>;

/** `inventory`: a full snapshot of the home, through the outbox. */
export const inventorySchema = z.strictObject({
  message_id: z.string().min(1),
  locations: z.array(inventoryLocationSchema),
  devices: z.array(deviceEntrySchema),
});
export type InventoryMessage = z.infer<typeof inventorySchema>;

/** `device_state`: one device's full current entry, through the outbox. */
export const deviceStateSchema = deviceEntrySchema.extend({
  message_id: z.string().min(1),
});
export type DeviceStateMessage = z.infer<typeof deviceStateSchema>;

/** `heartbeat`: the home's health summary, every 15 s; not through the outbox. */
export const heartbeatSchema = z.strictObject({
  ring_session: z.enum(["ok", "unavailable", "lost"]),
  /** Ring push: `off` until the Push Listener arrives (iteration 002). */
  push: z.enum(["off", "ok", "failing"]),
  /** Messages waiting for their ack; `null` when the outbox could not be read. */
  outbox_depth: z.number().int().min(0).nullable(),
  /** When the home last received a Ring event; `null` until events arrive (002). */
  last_ring_event_at: utcTime.nullable(),
  /** Failures since the connector started, by error code. */
  error_counts: z.record(z.string(), z.number().int().min(0)),
  as_of: utcTime,
});
export type HeartbeatMessage = z.infer<typeof heartbeatSchema>;
