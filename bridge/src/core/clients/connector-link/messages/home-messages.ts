// The messages the home sends the core, as Connector Link, their receiver, declares them (CD4: the
// receiver declares; `contracts/connector-link.md` "Frames" and "Device inventory and state").
// Declared in T016, ahead of Connector Link itself (T017), because Core Link at home sends them.
// This file imports only zod, so the home's wiring can use the types without reaching anything
// of the core.
import { z } from "zod";
import type { LinkFrame } from "../../../../utilities/link-transport/index.ts";

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

/** The longest enrollment code the core keeps: Settings' column size (T022). */
export const MAX_ENROLLMENT_CODE_LENGTH = 64;

// These fields arrive before the connector has proved its key, and the core logs some of them, so
// they are held to the exact form the home sends: a key id is 16 base64url characters
// (`signingKeyId`), a public key 43 (an Ed25519 key's 32 bytes), a session id a UUID, and the
// connector's version a package version of at most 64 characters (the health snapshot's column).
const keyId = z.string().regex(/^[A-Za-z0-9_-]{16}$/);
const publicKey = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

/** `hello`: opens a session at a link version. */
export const helloSchema = z.strictObject({
  version: z.number().int().positive(),
  key_id: keyId,
  connector_version: z.string().regex(/^[0-9A-Za-z.+-]{1,64}$/),
  session_id: z.uuid(),
});
export type HelloMessage = z.infer<typeof helloSchema>;

/** `challenge_response`: the core's challenge, signed with the connector's private key. */
export const challengeResponseSchema = z.strictObject({
  signature: z.string().min(1),
});
export type ChallengeResponseMessage = z.infer<typeof challengeResponseSchema>;

/** `enroll`: asks to be trusted, with the code the Setup CLI printed (SC2). */
export const enrollSchema = z.strictObject({
  public_key: publicKey,
  code: z.string().min(1).max(MAX_ENROLLMENT_CODE_LENGTH),
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

/**
 * `inventory`: a full snapshot of the home, through the outbox. `snapshot_version` comes from the
 * home's counter before its entries' versions; `session_id` names the session it was composed for,
 * left out when none was open (CP-14 review round 3).
 */
export const inventorySchema = z.strictObject({
  message_id: z.string().min(1),
  snapshot_version: stateVersion,
  session_id: z.uuid().optional(),
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
  /**
   * Set while the home owes an inventory because a change it saw could not be written to its
   * outbox: the newest `state_version` it had written before that change. The inventory that pays
   * it has a higher `snapshot_version`. `null` when no such inventory is owed (CP-14 review round 5).
   */
  inventory_owed_after: z.number().int().min(0).nullable(),
  /** When the home last received a Ring event; `null` until events arrive (002). */
  last_ring_event_at: utcTime.nullable(),
  /** Failures since the connector started, by error code. */
  error_counts: z.record(z.string(), z.number().int().min(0)),
  as_of: utcTime,
});
export type HeartbeatMessage = z.infer<typeof heartbeatSchema>;

/** A message from the home, read from a frame. */
export type HomeMessage =
  | { readonly type: "hello"; readonly body: HelloMessage }
  | {
      readonly type: "challenge_response";
      readonly body: ChallengeResponseMessage;
    }
  | { readonly type: "enroll"; readonly body: EnrollMessage }
  | { readonly type: "inventory"; readonly body: InventoryMessage }
  | { readonly type: "device_state"; readonly body: DeviceStateMessage }
  | { readonly type: "heartbeat"; readonly body: HeartbeatMessage };

/**
 * The message in a frame from the home, or `undefined` for a frame that is not one of them or whose
 * body does not match. Nothing of a refused body is kept: it can hold Ring's names.
 */
export function readHomeMessage(frame: LinkFrame): HomeMessage | undefined {
  if (frame.kind !== "message") {
    return undefined;
  }
  const { body } = frame;
  switch (frame.type) {
    case HOME_MESSAGE_TYPES.hello:
      return read(helloSchema, body, (data) => ({ type: "hello", body: data }));
    case HOME_MESSAGE_TYPES.challengeResponse:
      return read(challengeResponseSchema, body, (data) => ({
        type: "challenge_response",
        body: data,
      }));
    case HOME_MESSAGE_TYPES.enroll:
      return read(enrollSchema, body, (data) => ({
        type: "enroll",
        body: data,
      }));
    case HOME_MESSAGE_TYPES.inventory:
      return read(inventorySchema, body, (data) => ({
        type: "inventory",
        body: data,
      }));
    case HOME_MESSAGE_TYPES.deviceState:
      return read(deviceStateSchema, body, (data) => ({
        type: "device_state",
        body: data,
      }));
    case HOME_MESSAGE_TYPES.heartbeat:
      return read(heartbeatSchema, body, (data) => ({
        type: "heartbeat",
        body: data,
      }));
    default:
      return undefined;
  }
}

function read<Body>(
  schema: z.ZodType<Body>,
  body: unknown,
  message: (data: Body) => HomeMessage,
): HomeMessage | undefined {
  const result = schema.safeParse(body);
  return result.success ? message(result.data) : undefined;
}
