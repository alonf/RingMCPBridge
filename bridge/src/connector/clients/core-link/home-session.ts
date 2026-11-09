// One connection of Core Link (CP-09, T016): from the first message to the link's close.
//
//   enrolling           --enrolled {key_id}-->   send hello    -> awaiting_challenge
//   awaiting_challenge  --challenge {nonce}-->   sign, send it -> awaiting_hello_ok
//   awaiting_hello_ok   --hello_ok {version}-->  put the link in the slot, Ingest's session -> open
//   open                --ack, inventory_request--> Ingest
//
// A connection starts in `enrolling` when the core last said the key is not enrolled, and in
// `awaiting_challenge` (after sending `hello`) otherwise. The core's close reason decides what the
// next connection does (SC2, `LINK_CLOSE_REASONS`).
import type { Cancel, Clock } from "../../../utilities/clock/index.ts";
import { LINK_PROTOCOL_VERSION } from "../../../utilities/link-transport/index.ts";
import type {
  LinkClosed,
  LinkConnection,
  LinkFrame,
  LinkSlot,
} from "../../../utilities/link-transport/index.ts";
import type { Logger } from "../../../utilities/logging/index.ts";
import { signChallenge } from "../../../utilities/security/index.ts";
import type { SigningKeyPair } from "../../../utilities/security/index.ts";
import { HOME_MESSAGE_TYPES } from "../../../core/clients/connector-link/messages/index.ts";
import type {
  ChallengeResponseMessage,
  EnrollMessage,
  HelloMessage,
} from "../../../core/clients/connector-link/messages/index.ts";
import type { Ingest } from "../../managers/ingest/index.ts";
import { LINK_CLOSE_REASONS, readCoreMessage } from "./messages/index.ts";
import type {
  ChallengeMessage,
  CoreMessage,
  EnrolledMessage,
  HelloOkMessage,
} from "./messages/index.ts";

/** How long the core may take from `hello` to `hello_ok` before the connection is dropped [P]. */
export const HANDSHAKE_TIMEOUT_MS = 30_000;

/**
 * What the next connection should do:
 * - `opened`: a session was open, so reconnect soon;
 * - `retry`: reconnect with the usual backoff;
 * - `enroll`: the core does not know the key: enroll on the next connection;
 * - `slow`: the core does not speak this version: reconnect at the longest delay;
 * - `halt`: the key was revoked: stop until a new key is made.
 */
export type SessionEnd = "opened" | "retry" | "enroll" | "slow" | "halt";

/** Who the connector is. */
export interface CoreLinkIdentity {
  readonly key: SigningKeyPair;
  /** The one-time code the Setup CLI printed, sent with `enroll` (SC2). */
  readonly enrollmentCode: string;
  readonly connectorVersion: string;
}

/** What one session works with. */
export interface HomeSessionContext {
  readonly link: LinkConnection;
  readonly slot: LinkSlot;
  readonly ingest: Ingest;
  readonly identity: CoreLinkIdentity;
  readonly keyId: string;
  readonly sessionId: string;
  readonly enroll: boolean;
  /** The core accepted the key: later connections say `hello` again. */
  readonly onEnrolled: () => void;
  readonly clock: Clock;
  readonly logger: Logger;
}

type Phase = "enrolling" | "awaiting_challenge" | "awaiting_hello_ok" | "open";

const KEY_MISMATCH = "key_mismatch";
const HANDSHAKE_TIMED_OUT = "handshake_timeout";
const VERSION_MISMATCH = "version_mismatch";

/** One connection, from its first message to its close. */
export class HomeSession {
  readonly #context: HomeSessionContext;
  readonly #logger: Logger;
  #phase: Phase;
  #opened = false;
  #cancelHandshake: Cancel = () => undefined;

  constructor(context: HomeSessionContext) {
    this.#context = context;
    this.#logger = context.logger.with({ session_id: context.sessionId });
    this.#phase = context.enroll ? "enrolling" : "awaiting_challenge";
  }

  /** Runs the session; resolves when its link closes, with what the next connection should do. */
  run(signal: AbortSignal): Promise<SessionEnd> {
    const { link } = this.#context;
    return new Promise((resolve) => {
      link.onFrame((frame) => {
        this.#received(frame, signal);
      });
      link.onClose((closed) => {
        this.#cancelHandshake();
        this.#context.slot.clear(link);
        resolve(this.#ended(closed));
      });
      // A link closed before the session began has already ended it, above: sending would leave
      // a handshake timer nothing cancels, which keeps the process alive for 30 s (T027).
      if (link.closed !== undefined) {
        return;
      }
      if (this.#phase === "enrolling") {
        this.#sendEnroll();
      } else {
        this.#sendHello();
      }
    });
  }

  #received(frame: LinkFrame, signal: AbortSignal): void {
    const message = readCoreMessage(frame);
    if (message === undefined) {
      this.#logger.warn("core_link_message_refused", {
        message_type: frame.type,
      });
      return;
    }
    if (!this.#expects(message)) {
      this.#logger.warn("core_link_message_out_of_turn", {
        message_type: message.type,
      });
      return;
    }
    this.#handle(message, signal);
  }

  #expects(message: CoreMessage): boolean {
    switch (message.type) {
      case "enrolled":
        return this.#phase === "enrolling";
      case "challenge":
        return this.#phase === "awaiting_challenge";
      case "hello_ok":
        return this.#phase === "awaiting_hello_ok";
      case "ack":
      case "inventory_request":
        return this.#phase === "open";
    }
  }

  #handle(message: CoreMessage, signal: AbortSignal): void {
    switch (message.type) {
      case "enrolled":
        this.#enrolled(message.body);
        return;
      case "challenge":
        this.#challenged(message.body);
        return;
      case "hello_ok":
        this.#helloOk(message.body, signal);
        return;
      case "ack":
        this.#settle(
          "ack",
          this.#context.ingest.acknowledged(message.body.message_id, signal),
          signal,
        );
        return;
      case "inventory_request":
        this.#settle(
          "inventory_request",
          this.#context.ingest.inventoryRequested(signal),
          signal,
        );
        return;
    }
  }

  #sendEnroll(): void {
    const enroll: EnrollMessage = {
      public_key: this.#context.identity.key.publicKey,
      code: this.#context.identity.enrollmentCode,
    };
    void this.#context.link.send({
      type: HOME_MESSAGE_TYPES.enroll,
      body: enroll,
    });
    this.#logger.info("core_link_enroll_sent");
  }

  #sendHello(): void {
    const hello: HelloMessage = {
      version: LINK_PROTOCOL_VERSION,
      key_id: this.#context.keyId,
      connector_version: this.#context.identity.connectorVersion,
      session_id: this.#context.sessionId,
    };
    this.#phase = "awaiting_challenge";
    this.#cancelHandshake = this.#context.clock.schedule(
      HANDSHAKE_TIMEOUT_MS,
      () => {
        this.#logger.warn("core_link_handshake_timed_out");
        this.#context.link.close(HANDSHAKE_TIMED_OUT);
      },
    );
    void this.#context.link.send({
      type: HOME_MESSAGE_TYPES.hello,
      body: hello,
    });
  }

  #enrolled(body: EnrolledMessage): void {
    if (body.key_id !== this.#context.keyId) {
      this.#logger.error("core_link_enrolled_other_key");
      this.#context.link.close(KEY_MISMATCH);
      return;
    }
    this.#logger.info("core_link_enrolled");
    this.#context.onEnrolled();
    this.#sendHello();
  }

  #challenged(body: ChallengeMessage): void {
    const response: ChallengeResponseMessage = {
      signature: signChallenge(
        this.#context.identity.key.privateKey,
        body.nonce,
      ),
    };
    this.#phase = "awaiting_hello_ok";
    void this.#context.link.send({
      type: HOME_MESSAGE_TYPES.challengeResponse,
      body: response,
    });
  }

  // The new session's "everything is due again" runs before Ingest sends anything on the link:
  // Ingest takes its steps in order (T016).
  #helloOk(body: HelloOkMessage, signal: AbortSignal): void {
    this.#cancelHandshake();
    if (body.version !== LINK_PROTOCOL_VERSION) {
      this.#logger.error("core_link_version_mismatch");
      this.#context.link.close(VERSION_MISMATCH);
      return;
    }
    this.#phase = "open";
    this.#opened = true;
    this.#context.slot.put(this.#context.link);
    this.#logger.info("core_link_session_open");
    this.#settle(
      "session",
      this.#context.ingest.sessionOpened(this.#context.sessionId, signal),
      signal,
    );
  }

  // Ingest handles the outbox's failures itself; anything else that escapes is logged here, once.
  #settle(kind: string, work: Promise<unknown>, signal: AbortSignal): void {
    work.catch((error: unknown) => {
      if (!signal.aborted) {
        this.#logger.error("core_link_work_failed", { kind }, error);
      }
    });
  }

  #ended(closed: LinkClosed): SessionEnd {
    const end = this.#endFor(closed);
    this.#logger.info("core_link_session_closed", {
      kind: closed.cause,
      outcome: end,
    });
    return end;
  }

  #endFor(closed: LinkClosed): SessionEnd {
    if (closed.cause === "closed_by_peer") {
      switch (closed.reason) {
        case LINK_CLOSE_REASONS.keyRevoked:
          this.#logger.error("core_link_key_revoked");
          return "halt";
        case LINK_CLOSE_REASONS.keyNotEnrolled:
          this.#logger.warn("core_link_key_not_enrolled");
          return "enroll";
        case LINK_CLOSE_REASONS.versionNotAccepted:
          this.#logger.error("core_link_version_not_accepted");
          return "slow";
        case LINK_CLOSE_REASONS.challengeFailed:
          this.#logger.warn("core_link_challenge_failed");
          return "retry";
        default:
          break;
      }
    }
    return this.#opened ? "opened" : "retry";
  }
}
