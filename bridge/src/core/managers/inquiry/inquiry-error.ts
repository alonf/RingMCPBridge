// Inquiry's error (I3: a manager passes on only its own declared errors, with the original as the
// cause). Its messages are the bridge's own text and never quote a stored value: names, rooms and
// device state come from Ring (FR-033, FR-034).

/**
 * - `invalid_argument`: the request cannot be answered as asked, such as an omitted `location_id`
 *   when the bridge holds no owned location or more than one; `details.location_ids` lists the
 *   owned ones (`INVALID_ARGUMENT`).
 * - `not_found`: no device or location the agent may read has that id. A shared location and its
 *   devices are hidden in iteration 001, as shared locations are off (FR-036) (`NOT_FOUND`).
 * - `unavailable`: the core's database could not be reached. Clients answer `BRIDGE_UNAVAILABLE`,
 *   retryable, and never serve stale data instead (FR-006).
 * - `failed`: something the bridge did not expect, such as a row State did not write (`INTERNAL`).
 */
export type InquiryErrorKind =
  "invalid_argument" | "not_found" | "unavailable" | "failed";

/** What an `invalid_argument` error tells the agent, so it can ask again. */
export interface InquiryErrorDetails {
  /** The owned locations' ids, in id order. */
  readonly location_ids: readonly string[];
}

/** The cause, and the details an `invalid_argument` error carries. */
export interface InquiryErrorOptions extends ErrorOptions {
  readonly details?: InquiryErrorDetails;
}

/** An Inquiry use case that did not succeed. */
export class InquiryError extends Error {
  readonly kind: InquiryErrorKind;
  readonly details: InquiryErrorDetails | undefined;

  constructor(
    kind: InquiryErrorKind,
    message: string,
    options?: InquiryErrorOptions,
  ) {
    super(message, options);
    this.name = "InquiryError";
    this.kind = kind;
    this.details = options?.details;
  }
}
