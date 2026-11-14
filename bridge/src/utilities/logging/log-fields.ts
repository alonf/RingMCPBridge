// The allow-list of log fields (B3, FR-034, OR2). A field not declared here is never written.
// Adding a field is one line here; its kind decides which shape check its value must pass.

/**
 * - `identifier`: a correlation id (a UUID, a long numeric Ring id, or a short opaque id).
 * - `code`: a word from a closed set, such as a tool name, an error code or a kind.
 * - `measure`: a finite number, such as a duration or a count.
 */
export type FieldKind = "identifier" | "code" | "measure";

/** The declared fields in output order, each with the kind its value must have. */
export const LOG_FIELD_KINDS = {
  component: "code",
  mode: "code",
  session_id: "identifier",
  request_id: "identifier",
  command_id: "identifier",
  client_id: "identifier",
  event_id: "identifier",
  message_id: "identifier",
  location_id: "identifier",
  device_id: "identifier",
  /** The code the Setup CLI printed, which the owner compares on the admin page (T028). */
  enrollment_code: "identifier",
  key_id: "identifier",
  tool: "code",
  message_type: "code",
  kind: "code",
  outcome: "code",
  error_code: "code",
  http_status: "measure",
  attempt: "measure",
  count: "measure",
  seq: "measure",
  state_version: "measure",
  schema_version: "measure",
  delay_ms: "measure",
  duration_ms: "measure",
} as const satisfies Record<string, FieldKind>;

type FieldValue<Kind extends FieldKind> = Kind extends "measure"
  ? number
  : string;

/**
 * The fields a log line may carry: identifiers, codes and measures, never content.
 * `session_id` is the connector session id (OR2).
 */
export type LogFields = {
  readonly [Field in keyof typeof LOG_FIELD_KINDS]?: FieldValue<
    (typeof LOG_FIELD_KINDS)[Field]
  >;
};
