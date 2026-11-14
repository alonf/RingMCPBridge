// The redaction layer (FR-034). Declared fields pass a shape check for their kind; free text
// (error messages and stacks from Ring or a library) has secret-shaped parts replaced.
// Over-redaction is accepted: a lost port number costs a little diagnosis, a logged PIN does not.

/** What replaces a value that fails its shape check. */
export const REDACTED = "[redacted]";

const REDACTED_BINARY = "[redacted:binary]";
const REDACTED_KEY = "[redacted:key]";
const REDACTED_TOKEN = "[redacted:token]";
const REDACTED_DATA = "[redacted:data]";
const REDACTED_BYTES = "[redacted:bytes]";
const REDACTED_TEXT = "[redacted:text]";
const TRUNCATED = "...[truncated]";

const MAX_TEXT_LENGTH = 2000;
const MAX_CODE_LENGTH = 64;
const MAX_CODE_SEGMENT_LENGTH = 20;
const MAX_SHORT_ID_LENGTH = 24;
const MAX_ERROR_NAME_LENGTH = 40;
const MIN_SECRET_RUN_LENGTH = 32;
const CHARACTER_CLASSES_IN_A_TOKEN = 2;
const CHARACTER_CLASSES_IN_A_SLASHED_TOKEN = 3;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUIDS = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const LONG_NUMERIC_ID = /^\d{9,20}$/;
const SHORT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const PIN_SHAPED = /^\d{4,8}$/;
const CODE =
  /^(?:[a-z][a-z0-9]*(?:[_.:-][a-z0-9]+)*|[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*)$/;
const CODE_SEPARATORS = /[_.:-]/;
const ERROR_NAME = /^[A-Z][A-Za-z]*$/;
const HEX_ONLY = /^[0-9a-fA-F]+$/;
const CHARACTER_CLASSES: readonly RegExp[] = [/[0-9]/, /[a-z]/, /[A-Z]/];
const BINARY = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F�]/;

/**
 * An identifier: a UUID, a numeric Ring id of 9 to 20 digits, or a short opaque id of up to
 * 24 characters (oidc-provider's client ids are 21). An all-digit value of 4 to 8 characters
 * is PIN-shaped and is redacted, even where it is a real id.
 */
export function toIdentifier(value: unknown): string {
  if (typeof value !== "string") {
    return REDACTED;
  }
  if (UUID.test(value) || LONG_NUMERIC_ID.test(value)) {
    return value;
  }
  const isShortId = value.length <= MAX_SHORT_ID_LENGTH && SHORT_ID.test(value);
  return isShortId && !PIN_SHAPED.test(value) ? value : REDACTED;
}

/** A code: lower-case words (`get_home_status`, `all-in-one`) or UPPER_SNAKE (`TIMEOUT`). */
export function toCode(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length > MAX_CODE_LENGTH ||
    !CODE.test(value)
  ) {
    return REDACTED;
  }
  const segments = value.split(CODE_SEPARATORS);
  return segments.every((segment) => segment.length <= MAX_CODE_SEGMENT_LENGTH)
    ? value
    : REDACTED;
}

/** A measure: any finite number. */
export function toMeasure(value: unknown): number | string {
  return typeof value === "number" && Number.isFinite(value) ? value : REDACTED;
}

/** An error class name: letters only, starting with a capital (`TypeError`, `RequestError`). */
export function toErrorName(value: unknown): string {
  return typeof value === "string" &&
    value.length <= MAX_ERROR_NAME_LENGTH &&
    ERROR_NAME.test(value)
    ? value
    : REDACTED;
}

interface TextRule {
  readonly pattern: RegExp;
  readonly replacement: string | ((match: string) => string);
}

function countCharacterClasses(run: string): number {
  return CHARACTER_CLASSES.filter((pattern) => pattern.test(run)).length;
}

/**
 * A long run of base64, base64url or hex characters is a token or a key, unless it is only
 * UUIDs and a short rest, or a path-like run with fewer than three character classes.
 */
function redactLongRun(run: string): string {
  const rest = run.replace(UUIDS, "");
  if (rest.length < MIN_SECRET_RUN_LENGTH) {
    return run;
  }
  if (HEX_ONLY.test(rest)) {
    return REDACTED_TOKEN;
  }
  const needed = rest.includes("/")
    ? CHARACTER_CLASSES_IN_A_SLASHED_TOKEN
    : CHARACTER_CLASSES_IN_A_TOKEN;
  return countCharacterClasses(rest) >= needed ? REDACTED_TOKEN : run;
}

/** Applied in order. Each rule removes one shape of secret from free text. */
const TEXT_RULES: readonly TextRule[] = [
  {
    pattern:
      /-----BEGIN [A-Z0-9 ]+-----[\s\S]*?(?:-----END [A-Z0-9 ]+-----|$)/g,
    replacement: REDACTED_KEY,
  },
  {
    pattern: /data:[\w/+.-]+;base64,[A-Za-z0-9+/=]*/g,
    replacement: REDACTED_DATA,
  },
  {
    pattern: /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]*)?/g,
    replacement: REDACTED_TOKEN,
  },
  {
    pattern: /\b(Bearer|Basic|DPoP)\s+[A-Za-z0-9._~+/=-]+/gi,
    replacement: `$1 ${REDACTED_TOKEN}`,
  },
  // A quoted value is masked whole, spaces included: `password="correct horse"`.
  {
    pattern:
      /\b(access_token|refresh_token|id_token|client_secret|code_verifier|password|passwd|secret|pin|api_?key|token)\b(["']?\s*[=:]\s*)(["'])(?:(?!\3)[^\n])*\3/gi,
    replacement: `$1$2$3${REDACTED}$3`,
  },
  {
    pattern:
      /\b(access_token|refresh_token|id_token|client_secret|code_verifier|password|passwd|secret|pin|api_?key|token)\b(["']?\s*[=:]\s*["']?)(?!\[redacted\])[^\s"'&,;)}\]]+/gi,
    replacement: `$1$2${REDACTED}`,
  },
  {
    pattern: /([?&](?:code|key|sig|signature)=)[^\s&#"']+/gi,
    replacement: `$1${REDACTED}`,
  },
  {
    pattern: /\[?(?:\d{1,3}\s*,\s*){15,}\d{1,3}\]?/g,
    replacement: REDACTED_BYTES,
  },
  { pattern: /[A-Za-z0-9+/_=-]{32,}/g, replacement: redactLongRun },
  // A full stop ends the number unless more of a number follows it (`4821.` yes, `4821.5` no).
  {
    pattern: /(?<![\w.\-/:])\d{4,8}(?![\w\-/]|\.[\w-])/g,
    replacement: REDACTED,
  },
  { pattern: /[^\t\n\r\x20-\x7E]+/g, replacement: REDACTED_TEXT },
];

function applyRule(text: string, rule: TextRule): string {
  return typeof rule.replacement === "string"
    ? text.replace(rule.pattern, rule.replacement)
    : text.replace(rule.pattern, rule.replacement);
}

/**
 * Free text with every secret-shaped part replaced: private keys, data URLs, JWTs, bearer
 * credentials, `secret=value` pairs, byte lists, long tokens, PIN-shaped numbers and any
 * non-ASCII text (device names can be Hebrew). Text with control characters is binary and is
 * replaced whole. The result is printable ASCII of at most 2,000 characters.
 */
export function redactText(text: string): string {
  if (BINARY.test(text)) {
    return REDACTED_BINARY;
  }
  const redacted = TEXT_RULES.reduce(applyRule, text);
  return redacted.length > MAX_TEXT_LENGTH
    ? `${redacted.slice(0, MAX_TEXT_LENGTH)}${TRUNCATED}`
    : redacted;
}
