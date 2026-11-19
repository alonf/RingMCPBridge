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
  /** A short hash of a client id, which can itself be a URL (T048). */
  client_ref: "identifier",
  event_id: "identifier",
  message_id: "identifier",
  location_id: "identifier",
  device_id: "identifier",
  /** The code the Setup CLI printed, which the owner compares on the admin page (T028). */
  enrollment_code: "identifier",
  key_id: "identifier",
  tool: "code",
  /** A listed agent's platform as a code, such as `chatgpt` (DRIFT-001-76). */
  agent: "code",
  message_type: "code",
  kind: "code",
  /** Ring's own subtype of a push, such as `human` (T038). */
  subtype: "code",
  /** An MCP event type's name, such as `bridge.probe` (T039). */
  event_name: "code",
  /** A callback's host name, never its path (T039). */
  host: "code",
  outcome: "code",
  error_code: "code",
  http_status: "measure",
  attempt: "measure",
  count: "measure",
  /** Room lists (DRIFT-001-80): entries Ring listed, devices matched or not, hubs that did not answer. */
  listed: "measure",
  matched: "measure",
  unmatched: "measure",
  unanswered: "measure",
  seq: "measure",
  state_version: "measure",
  schema_version: "measure",
  delay_ms: "measure",
  home_offline_ms: "measure",
  backlog_age_ms: "measure",
  ring_session: "code",
  duration_ms: "measure",
  /** The catch-up after a gap (T053): the gap in hours, what it recovered or found already stored, and whether Ring's history stopped short (1) or not (0). */
  gap_hours: "measure",
  recovered: "measure",
  duplicates: "measure",
  history_short: "measure",
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
