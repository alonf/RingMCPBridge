// Admin (CD map v3): the owner's use cases from the admin page, and the checks behind them. Built
// at T017, ahead of the admin page (T029), with only the connector's part Connector Link needs:
// checking the key named in a `hello`, and recording an `enroll` request (SC2, PT-32). T029 adds
// approving a request. Clients reach Settings through this manager (the IDesign call rules).
import { SettingsStoreError } from "../../access/settings/index.ts";
import type {
  ConnectorKey,
  EnrollmentRequest,
  EnrollmentRequestOutcome,
  SettingsStore,
} from "../../access/settings/index.ts";
import { AdminError } from "./admin-error.ts";

/** A connector key as Admin reports it: `active` with its public key, `revoked`, or `not_enrolled`. */
export type ConnectorKeyCheck = ConnectorKey;

/** An `enroll` request: the public key and the printed code. */
export type ConnectorEnrollmentRequest = EnrollmentRequest;

/** What became of an `enroll` request: `pending` until it expires, `already_active` or `revoked`. */
export type ConnectorEnrollmentOutcome = EnrollmentRequestOutcome;

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
