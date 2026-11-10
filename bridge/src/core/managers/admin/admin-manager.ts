// Admin (CD map v3): the owner's use cases from the admin page, and the checks behind them. Built
// at T017, ahead of the admin page (T029), with only the connector's part Connector Link needs:
// checking the key named in a `hello`, and recording an `enroll` request (SC2, PT-32). T029 adds
// the owner's side: the request waiting, and approving it. Clients reach Settings through this
// manager (the IDesign call rules).
import { SettingsStoreError } from "../../access/settings/index.ts";
import type {
  ConnectorKey,
  EnrollmentApproval,
  EnrollmentRequest,
  EnrollmentRequestOutcome,
  PendingEnrollment,
  SettingsStore,
} from "../../access/settings/index.ts";
import { AdminError } from "./admin-error.ts";

/** A connector key as Admin reports it: `active` with its public key, `revoked`, or `not_enrolled`. */
export type ConnectorKeyCheck = ConnectorKey;

/** An `enroll` request: the public key and the printed code. */
export type ConnectorEnrollmentRequest = EnrollmentRequest;

/** What became of an `enroll` request: `pending` until it expires, `already_active` or `revoked`. */
export type ConnectorEnrollmentOutcome = EnrollmentRequestOutcome;

/** The request waiting for the owner: its key, its code, and until when it waits. */
export type ConnectorEnrollmentPending = PendingEnrollment;

/**
 * What the owner's approval did: `approved`, with the older keys it revoked, or `not_pending` when
 * no request for that key waits any more. A newer request replaces an older one.
 */
export type ConnectorEnrollmentApproval = EnrollmentApproval;

/** What Admin is wired with. */
export interface AdminManagerOptions {
  readonly settings: SettingsStore;
}

/** The owner's use cases. One per core process. */
export class AdminManager {
  readonly #settings: SettingsStore;

  constructor(options: AdminManagerOptions) {
    this.#settings = options.settings;
  }

  /** The key a `hello` names, for Connector Link to accept or refuse (SC2). */
  async connectorKey(
    keyId: string,
    signal: AbortSignal,
  ): Promise<ConnectorKeyCheck> {
    return this.#guard(signal, "The connector key could not be checked.", () =>
      this.#settings.connectorKey(keyId, signal),
    );
  }

  /** Records an `enroll` request for the owner to approve on the admin page (PT-32). */
  async requestEnrollment(
    request: ConnectorEnrollmentRequest,
    signal: AbortSignal,
  ): Promise<ConnectorEnrollmentOutcome> {
    return this.#guard(
      signal,
      "The enrollment request could not be recorded.",
      () => this.#settings.requestEnrollment(request, signal),
    );
  }

  /** The request waiting for the owner, or `undefined` when none waits (T029). */
  async pendingEnrollment(
    signal: AbortSignal,
  ): Promise<ConnectorEnrollmentPending | undefined> {
    return this.#guard(
      signal,
      "The enrollment request could not be read.",
      () => this.#settings.pendingEnrollment(signal),
    );
  }

  /**
   * The owner approves the request for this key, the one the page showed: it becomes the one active
   * key and every older key is revoked (FR-032, SC2). The core's versions start again when the new
   * key's first session claims them. The page checks the sign-in's age and the typed code first.
   */
  async approveEnrollment(
    keyId: string,
    signal: AbortSignal,
  ): Promise<ConnectorEnrollmentApproval> {
    return this.#guard(signal, "The enrollment could not be approved.", () =>
      this.#settings.approveEnrollment(keyId, signal),
    );
  }

  // Settings' failures become Admin's own; an abort and anything else pass through unchanged.
  async #guard<T>(
    signal: AbortSignal,
    message: string,
    work: () => Promise<T>,
  ): Promise<T> {
    try {
      return await work();
    } catch (error) {
      signal.throwIfAborted();
      if (error instanceof SettingsStoreError) {
        throw new AdminError(error.kind, message, { cause: error });
      }
      throw error;
    }
  }
}
