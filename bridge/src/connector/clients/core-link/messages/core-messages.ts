// The messages the core sends the home, as Core Link, their receiver, declares them (CD4;
// `contracts/connector-link.md` "Frames"), and the reasons the core may close the link with. This
// file imports only zod and the Link transport's frame type, so the core can use the declarations
// without reaching anything of the home.
import { z } from "zod";
import type { LinkFrame } from "../../../../utilities/link-transport/index.ts";

/** The link frame type of each message the core sends the home. */
export const CORE_MESSAGE_TYPES = {
  challenge: "challenge",
  helloOk: "hello_ok",
  enrolled: "enrolled",
  inventoryRequest: "inventory_request",
  ack: "ack",
} as const;

/**
 * The reasons the core closes a link with, and what each tells the home (sent exactly, in the
 * WebSocket close frame):
 * - `key_not_enrolled`: enroll on the next connection;
 * - `key_revoked`: stop, until the Setup CLI makes a new key;
 * - `version_not_accepted`: try again slowly, as the core may be upgraded;
 * - `challenge_failed`: try again.
 */
export const LINK_CLOSE_REASONS = {
  keyNotEnrolled: "key_not_enrolled",
  keyRevoked: "key_revoked",
  versionNotAccepted: "version_not_accepted",
  challengeFailed: "challenge_failed",
} as const;

/** `challenge`: a fresh nonce to sign, one per hello. */
export const challengeSchema = z.strictObject({ nonce: z.string().min(1) });
export type ChallengeMessage = z.infer<typeof challengeSchema>;

/** `hello_ok`: the session is accepted at this version. */
export const helloOkSchema = z.strictObject({
  version: z.number().int().positive(),
});
export type HelloOkMessage = z.infer<typeof helloOkSchema>;

/** `enrolled`: the owner approved this key, named by its id. */
export const enrolledSchema = z.strictObject({ key_id: z.string().min(1) });
export type EnrolledMessage = z.infer<typeof enrolledSchema>;

/** `inventory_request`: send a fresh `inventory`. */
export const inventoryRequestSchema = z.strictObject({
  request_id: z.string().min(1),
});
export type InventoryRequestMessage = z.infer<typeof inventoryRequestSchema>;

/** `ack`: the message is committed in the core; the outbox may clear it. */
export const ackSchema = z.strictObject({ message_id: z.string().min(1) });
export type AckMessage = z.infer<typeof ackSchema>;

/** A message from the core, read from a frame. */
export type CoreMessage =
  | { readonly type: "challenge"; readonly body: ChallengeMessage }
  | { readonly type: "hello_ok"; readonly body: HelloOkMessage }
  | { readonly type: "enrolled"; readonly body: EnrolledMessage }
  | {
      readonly type: "inventory_request";
      readonly body: InventoryRequestMessage;
    }
  | { readonly type: "ack"; readonly body: AckMessage };

/**
 * The message in a frame from the core, or `undefined` for a frame that is not one of them or whose
 * body does not match. Nothing of a refused body is kept.
 */
export function readCoreMessage(frame: LinkFrame): CoreMessage | undefined {
  if (frame.kind !== "message") {
    return undefined;
  }
  const { body } = frame;
  switch (frame.type) {
    case CORE_MESSAGE_TYPES.challenge:
      return read(challengeSchema, body, (data) => ({
        type: "challenge",
        body: data,
      }));
    case CORE_MESSAGE_TYPES.helloOk:
      return read(helloOkSchema, body, (data) => ({
        type: "hello_ok",
        body: data,
      }));
    case CORE_MESSAGE_TYPES.enrolled:
      return read(enrolledSchema, body, (data) => ({
        type: "enrolled",
        body: data,
      }));
    case CORE_MESSAGE_TYPES.inventoryRequest:
      return read(inventoryRequestSchema, body, (data) => ({
        type: "inventory_request",
        body: data,
      }));
    case CORE_MESSAGE_TYPES.ack:
      return read(ackSchema, body, (data) => ({ type: "ack", body: data }));
    default:
      return undefined;
  }
}

function read<Body>(
  schema: z.ZodType<Body>,
  body: unknown,
  message: (data: Body) => CoreMessage,
): CoreMessage | undefined {
  const result = schema.safeParse(body);
  return result.success ? message(result.data) : undefined;
}
