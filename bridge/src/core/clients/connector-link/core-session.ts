// One link from home, as the core sees it (CP-09, T017), from the first message to the close:
//
//   first      --hello {version, key_id}-->  version N or N-1? key active? -> challenge -> challenged
//   first      --enroll {public_key, code}-> record the request (Admin)   -> enrolling
//   enrolling  --the owner approved (polled)-------------------------------> enrolled -> first
//   challenged --challenge_response {signature}--> verified -> hello_ok    -> open
//   open       --inventory, device_state--> Event, then ack; --heartbeat--> Event
//
// Every step of a link runs one at a time, in the order its frames and timers come, so no step sees
// another's half-done state (L2), and an `ack` always follows its commit. The close reasons the home
// acts on are Core Link's (`LINK_CLOSE_REASONS`); a key is reported revoked only when Settings
// says so, because a revoked key stops the home for good. The core's other reasons are its own,
// and the home dials again after them (SC2).
import type { Cancel, Clock } from "../../../utilities/clock/index.ts";
import { isAcceptedLinkVersion } from "../../../utilities/link-transport/index.ts";
import type {
  LinkClosed,
  LinkConnection,
  LinkFrame,
} from "../../../utilities/link-transport/index.ts";
import type { Logger } from "../../../utilities/logging/index.ts";
import {
  parsePublicSigningKey,
  verifyChallenge,
} from "../../../utilities/security/index.ts";
import type { PublicSigningKey } from "../../../utilities/security/index.ts";
import type {
  AdminManager,
  ConnectorEnrollmentOutcome,
  ConnectorKeyCheck,
} from "../../managers/admin/index.ts";
import type {
  EventIntake,
  HomeLinkSession,
} from "../../managers/event/index.ts";
import {
  CORE_MESSAGE_TYPES,
  LINK_CLOSE_REASONS,
} from "../../../connector/clients/core-link/messages/index.ts";
import type {
  AckMessage,
  ChallengeMessage,
  EnrolledMessage,
  HelloOkMessage,
} from "../../../connector/clients/core-link/messages/index.ts";
import {
  incomingDeviceState,
  incomingHeartbeat,
  incomingInventory,
} from "./intake-mapping.ts";
import { readHomeMessage } from "./messages/index.ts";
import type {
  ChallengeResponseMessage,
  EnrollMessage,
  HelloMessage,
  HomeMessage,
} from "./messages/index.ts";

/**
 * From a link's start until `hello_ok`, and again after `enrolled`: the home's own limit for the
 * same span is 30 s too (`HANDSHAKE_TIMEOUT_MS` at home) [P].
 */
export const CORE_HANDSHAKE_TIMEOUT_MS = 30_000;
/** How often a link waiting for the owner checks whether its key was approved [P]. */
export const ENROLLMENT_POLL_MS = 2_000;
/** How often an open session checks that its key is still the active one [P]. */
export const KEY_RECHECK_MS = 15_000;
/**
 * The most messages an open session may have waiting for Event, each at most 1 MiB, so a link
 * cannot fill the core's memory (round 3) [P]. The home sends up to 100 at a time.
 */
export const MAX_PENDING_MESSAGES = 256;

/**
 * The core's own close reasons. The home dials again after each of them, with its usual backoff
 * (it acts only on `LINK_CLOSE_REASONS`).
 */
export const CORE_CLOSE_REASONS = {
  handshakeTimeout: "handshake_timeout",
  messageRefused: "message_refused",
  sessionReplaced: "session_replaced",
  enrollmentExpired: "enrollment_expired",
  enrollmentReplaced: "enrollment_replaced",
  tooManyLinks: "too_many_links",
  coreUnavailable: "core_unavailable",
  coreStopping: "core_stopping",
  coreError: "core_error",
  tooManyMessages: "too_many_messages",
} as const;

// Where a link stands. Each phase carries exactly what it needs, so a challenge response is only
// checked against the challenge this link sent, and only an open session hands messages on (L3).
type SessionState =
  | { readonly phase: "first" }
  | {
      readonly phase: "challenged";
      readonly keyId: string;
      readonly publicKey: PublicSigningKey;
      readonly nonce: string;
      readonly session: HomeLinkSession;
    }
  | {
      readonly phase: "enrolling";
      readonly keyId: string;
      readonly expiresAt: number;
    }
  | {
      readonly phase: "open";
      readonly keyId: string;
      readonly session: HomeLinkSession;
    }
  | { readonly phase: "closed"; readonly keyId: string | undefined };

type Challenged = Extract<SessionState, { phase: "challenged" }>;
type Open = Extract<SessionState, { phase: "open" }>;

const FIRST: SessionState = { phase: "first" };

/** What one session is wired with; Connector Link keeps the registry of sessions. */
export interface CoreSessionContext {
  readonly link: LinkConnection;
  readonly admin: AdminManager;
  readonly intake: EventIntake;
  readonly clock: Clock;
  readonly logger: Logger;
  readonly newNonce: () => string;
  /** The connector proved its key: an older session for the same key gives way. */
  readonly onProven: (session: CoreSession) => void;
  /** An enroll request now waits on this link: an older waiting link gives way. */
  readonly onEnrolling: (session: CoreSession) => void;
  readonly onClosed: (session: CoreSession) => void;
}

/** One link from home. */
export class CoreSession {
  readonly #context: CoreSessionContext;
  readonly #controller = new AbortController();
  #logger: Logger;
  #state: SessionState = FIRST;
  #steps: Promise<void> = Promise.resolve();
  #cancelTimer: Cancel = () => undefined;
  #checkFailing = false;
  #pendingFrames = 0;
  #releaseFrame: (() => void) | undefined;

  constructor(context: CoreSessionContext) {
    this.#context = context;
    this.#logger = context.logger;
  }

  /** The key this link speaks for, once a `hello` named an active key or an `enroll` waits. */
  get keyId(): string | undefined {
    return this.#state.phase === "first" ? undefined : this.#state.keyId;
  }

  /** True once the connector proved its key and `hello_ok` went out. */
  get isOpen(): boolean {
    return this.#state.phase === "open";
  }

  /** True while an `enroll` request on this link waits for the owner. */
  get isWaitingForOwner(): boolean {
    return this.#state.phase === "enrolling";
  }

  /** Starts listening, with the handshake's time limit running. */
  start(): void {
    const { link } = this.#context;
    link.onFrame((frame) => {
      this.#arrived(frame);
    });
    link.onClose((closed) => {
      this.#ended(closed);
    });
    this.#timer(CORE_HANDSHAKE_TIMEOUT_MS, () => {
      this.#close(CORE_CLOSE_REASONS.handshakeTimeout);
    });
  }

  /** Closes the link with one of the core's reasons, logging the reason once. */
  close(reason: string): void {
    this.#close(reason);
  }

  /** Resolves once the link has closed and its last step has finished. */
  async finished(): Promise<void> {
    await this.#steps;
  }

  #enqueue(step: () => Promise<void> | void): void {
    this.#steps = this.#steps
      .then(async () => {
        if (this.#state.phase !== "closed") {
          await step();
        }
      })
      .catch((error: unknown) => {
        this.#failed(error);
      });
  }

  // A step's unexpected failure is logged once, here, and ends the link.
  #failed(error: unknown): void {
    if (this.#signal.aborted) {
      return;
    }
    this.#logger.error("connector_link_session_failed", undefined, error);
    this.#close(CORE_CLOSE_REASONS.coreError);
  }

  // Frames wait their turn in memory, so their number is bounded (round 3). Before a session
  // opens, the home sends one message and waits for the core's answer, so a second one before that
  // answer ends the link at once, unqueued. An open session may queue up to `MAX_PENDING_MESSAGES`.
  // A frame stops counting once the core has answered it, or when its step ends.
  #arrived(frame: LinkFrame): void {
    if (this.#state.phase === "closed") {
      return;
    }
    if (this.#state.phase !== "open" && this.#pendingFrames > 0) {
      this.#refuse(frame.type);
      return;
    }
    if (this.#pendingFrames >= MAX_PENDING_MESSAGES) {
      this.#logger.warn("connector_link_too_many_messages", {
        count: this.#pendingFrames,
      });
      this.#close(CORE_CLOSE_REASONS.tooManyMessages);
      return;
    }
    this.#pendingFrames += 1;
    let counted = true;
    const release = (): void => {
      if (counted) {
        counted = false;
        this.#pendingFrames -= 1;
      }
    };
    this.#enqueue(async () => {
      this.#releaseFrame = release;
      try {
        await this.#received(frame);
      } finally {
        release();
        this.#releaseFrame = undefined;
      }
    });
  }

  // The core answers the message it is handling. The home may send its next one at once (over the
  // in-memory pair, even before this step has ended), so that message is no longer a second one.
  #answered(): void {
    this.#releaseFrame?.();
  }

  async #received(frame: LinkFrame): Promise<void> {
    const message = readHomeMessage(frame);
    const state = this.#state;
    if (message === undefined) {
      this.#refuse(frame.type);
      return;
    }
    if (state.phase === "open") {
      await this.#openMessage(message, state);
      return;
    }
    if (state.phase === "first" && message.type === "hello") {
      await this.#hello(message.body);
      return;
    }
    if (state.phase === "first" && message.type === "enroll") {
      await this.#enroll(message.body);
      return;
    }
    if (state.phase === "challenged" && message.type === "challenge_response") {
      this.#verify(message.body, state);
      await this.#sessionOpened();
      return;
    }
    this.#refuse(message.type);
  }

  // Before a session opens, a message the core does not accept here ends the link; in an open
  // session it is logged and left unacked, so the home sends it again.
  #refuse(messageType: string): void {
    this.#logger.warn("connector_link_message_refused", {
      message_type: messageType,
    });
    if (this.#state.phase !== "open") {
      this.#close(CORE_CLOSE_REASONS.messageRefused);
    }
  }

  async #hello(hello: HelloMessage): Promise<void> {
    const session: HomeLinkSession = {
      session_id: hello.session_id,
      connector_version: hello.connector_version,
      version: hello.version,
    };
    this.#logger = this.#context.logger.with({ session_id: hello.session_id });
    if (!isAcceptedLinkVersion(hello.version)) {
      this.#close(LINK_CLOSE_REASONS.versionNotAccepted);
      return;
    }
    const key = await this.#checkKey(hello.key_id);
    this.#signal.throwIfAborted();
    if (key === undefined) {
      this.#close(CORE_CLOSE_REASONS.coreUnavailable);
      return;
    }
    if (key.kind !== "active") {
      this.#close(closeReasonFor(key));
      return;
    }
    const nonce = this.#context.newNonce();
    this.#state = {
      phase: "challenged",
      keyId: hello.key_id,
      publicKey: key.public_key,
      nonce,
      session,
    };
    const challenge: ChallengeMessage = { nonce };
    this.#answered();
    this.#send(CORE_MESSAGE_TYPES.challenge, challenge);
  }

  // The nonce is used once: the state leaves `challenged` whatever the outcome.
  #verify(response: ChallengeResponseMessage, challenged: Challenged): void {
    const { keyId, publicKey, nonce, session } = challenged;
    if (!verifyChallenge(publicKey, nonce, response.signature)) {
      this.#close(LINK_CLOSE_REASONS.challengeFailed);
      return;
    }
    this.#state = { phase: "open", keyId, session };
    this.#context.onProven(this);
    const helloOk: HelloOkMessage = { version: session.version };
    this.#answered();
    this.#send(CORE_MESSAGE_TYPES.helloOk, helloOk);
    this.#logger.info("connector_link_session_open");
    this.#timer(KEY_RECHECK_MS, () => {
      this.#enqueue(() => this.#recheckKey());
    });
  }

  async #sessionOpened(): Promise<void> {
    const state = this.#state;
    if (state.phase !== "open") {
      return;
    }
    await this.#toEvent("hello", (signal) =>
      this.#context.intake.homeSessionOpened(state.session, signal),
    );
  }

  async #enroll(enroll: EnrollMessage): Promise<void> {
    const publicKey = parsePublicSigningKey(enroll.public_key);
    if (publicKey === undefined) {
      this.#refuse("enroll");
      return;
    }
    let outcome: ConnectorEnrollmentOutcome;
    try {
      outcome = await this.#context.admin.requestEnrollment(
        { public_key: publicKey, code: enroll.code },
        this.#signal,
      );
    } catch (error) {
      this.#signal.throwIfAborted();
      this.#logger.error("connector_link_enroll_failed", undefined, error);
      this.#close(CORE_CLOSE_REASONS.coreUnavailable);
      return;
    }
    this.#signal.throwIfAborted();
    if (outcome.kind === "revoked") {
      this.#close(LINK_CLOSE_REASONS.keyRevoked);
      return;
    }
    if (outcome.kind === "already_active") {
      this.#enrolled(outcome.key_id);
      return;
    }
    this.#state = {
      phase: "enrolling",
      keyId: outcome.key_id,
      expiresAt: outcome.expires_at,
    };
    this.#context.onEnrolling(this);
    this.#logger.info("connector_link_enrollment_waiting");
    this.#nextPoll();
  }

  // While the owner has not approved, the link waits, until the request expires (PT-32).
  async #pollEnrollment(): Promise<void> {
    const state = this.#state;
    if (state.phase !== "enrolling") {
      return;
    }
    if (this.#context.clock.now() >= state.expiresAt) {
      this.#close(CORE_CLOSE_REASONS.enrollmentExpired);
      return;
    }
    const key = await this.#checkKey(state.keyId);
    this.#signal.throwIfAborted();
    if (key?.kind === "active") {
      this.#enrolled(state.keyId);
      return;
    }
    this.#nextPoll();
  }

  #nextPoll(): void {
    this.#timer(ENROLLMENT_POLL_MS, () => {
      this.#enqueue(() => this.#pollEnrollment());
    });
  }

  // The key is active: the home says `hello` next, on this same link, within the handshake limit.
  #enrolled(keyId: string): void {
    this.#state = FIRST;
    const enrolled: EnrolledMessage = { key_id: keyId };
    this.#answered();
    this.#send(CORE_MESSAGE_TYPES.enrolled, enrolled);
    this.#logger.info("connector_link_enrolled");
    this.#timer(CORE_HANDSHAKE_TIMEOUT_MS, () => {
      this.#close(CORE_CLOSE_REASONS.handshakeTimeout);
    });
  }

  // An open session's key is checked again on a timer: approving a newer key revokes this one, and
  // the link then closes within `KEY_RECHECK_MS`. A failed check keeps the session.
  async #recheckKey(): Promise<void> {
    const state = this.#state;
    if (state.phase !== "open") {
      return;
    }
    const key = await this.#checkKey(state.keyId);
    this.#signal.throwIfAborted();
    if (key !== undefined && key.kind !== "active") {
      this.#close(closeReasonFor(key));
      return;
    }
    this.#timer(KEY_RECHECK_MS, () => {
      this.#enqueue(() => this.#recheckKey());
    });
  }

  // `undefined` when the check could not be made; the first failure in a row is logged.
  async #checkKey(keyId: string): Promise<ConnectorKeyCheck | undefined> {
    try {
      const key = await this.#context.admin.connectorKey(keyId, this.#signal);
      this.#checkFailing = false;
      return key;
    } catch (error) {
      this.#signal.throwIfAborted();
      if (!this.#checkFailing) {
        this.#logger.error("connector_link_key_check_failed", undefined, error);
      }
      this.#checkFailing = true;
      return undefined;
    }
  }

  async #openMessage(message: HomeMessage, open: Open): Promise<void> {
    const { session } = open;
    switch (message.type) {
      case "inventory": {
        const inventory = incomingInventory(message.body);
        await this.#committed(inventory.message_id, "inventory", (signal) =>
          this.#context.intake.inventory(inventory, session, signal),
        );
        return;
      }
      case "device_state": {
        const change = incomingDeviceState(message.body);
        await this.#committed(change.message_id, "device_state", (signal) =>
          this.#context.intake.deviceState(change, session, signal),
        );
        return;
      }
      case "heartbeat": {
        const heartbeat = incomingHeartbeat(message.body);
        await this.#toEvent("heartbeat", (signal) =>
          this.#context.intake.heartbeat(heartbeat, session, signal),
        );
        return;
      }
      case "hello":
      case "challenge_response":
      case "enroll":
        this.#refuse(message.type);
        return;
    }
  }

  // An outbox message is acked only after Event committed it (AC B10).
  async #committed(
    messageId: string,
    messageType: string,
    work: (signal: AbortSignal) => Promise<void>,
  ): Promise<void> {
    if (await this.#toEvent(messageType, work, messageId)) {
      const ack: AckMessage = { message_id: messageId };
      this.#send(CORE_MESSAGE_TYPES.ack, ack);
    }
  }

  // Event's failure is logged once, here: the message stays unacked, and the home sends it again.
  async #toEvent(
    messageType: string,
    work: (signal: AbortSignal) => Promise<void>,
    messageId?: string,
  ): Promise<boolean> {
    try {
      await work(this.#signal);
      return true;
    } catch (error) {
      this.#signal.throwIfAborted();
      this.#logger.error(
        "connector_link_intake_failed",
        {
          message_type: messageType,
          ...(messageId === undefined ? {} : { message_id: messageId }),
        },
        error,
      );
      return false;
    }
  }

  #send(type: string, body: object): void {
    void this.#context.link.send({ type, body });
  }

  get #signal(): AbortSignal {
    return this.#controller.signal;
  }

  #timer(ms: number, action: () => void): void {
    this.#cancelTimer();
    this.#cancelTimer = this.#context.clock.schedule(ms, action);
  }

  #close(reason: string): void {
    if (this.#context.link.closed !== undefined) {
      return;
    }
    this.#logger.info("connector_link_closing", { outcome: reason });
    this.#context.link.close(reason);
  }

  #ended(closed: LinkClosed): void {
    this.#state = { phase: "closed", keyId: this.keyId };
    this.#cancelTimer();
    this.#controller.abort(new Error("The link closed."));
    this.#logger.info("connector_link_closed", { kind: closed.cause });
    this.#context.onClosed(this);
  }
}

function closeReasonFor(key: ConnectorKeyCheck): string {
  return key.kind === "revoked"
    ? LINK_CLOSE_REASONS.keyRevoked
    : LINK_CLOSE_REASONS.keyNotEnrolled;
}
