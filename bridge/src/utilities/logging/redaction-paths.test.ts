// FR-034: logs carry identifiers, never content. This test feeds an OAuth token, a PIN-shaped
// value, a private key and image bytes through every log path and every error message, and
// asserts that none of them appears in the output (T005, written before the logger).
import { createPrivateKey } from "node:crypto";
import { describe, expect, it } from "vitest";
import { Logger } from "./index.ts";
import type { LogFields, LogLevel } from "./index.ts";
import { LOG_FIELD_KINDS } from "./log-fields.ts";

const FIXED_NOW = Date.UTC(2026, 10, 3, 9, 0, 0);
const LEVELS: readonly LogLevel[] = ["debug", "info", "warn", "error"];
const FIELD_NAMES = Object.keys(
  LOG_FIELD_KINDS,
) as readonly (keyof LogFields)[];
const PRINTABLE_ASCII_LINE = /^[\x20-\x7E]*$/;
const MARK_WINDOW = 24;

function patternBytes(length: number, step: number, offset: number): Buffer {
  return Buffer.from(
    Array.from({ length }, (_, index) => (index * step + offset) % 256),
  );
}

function base64UrlJson(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

/** Every 24-character slice of a long secret: a partial leak is still a leak. */
function windowsOf(secret: string): string[] {
  const windows: string[] = [];
  for (
    let start = 0;
    start + MARK_WINDOW <= secret.length;
    start += MARK_WINDOW
  ) {
    windows.push(secret.slice(start, start + MARK_WINDOW));
  }
  return windows;
}

// --- The secrets, built at run time so no secret-shaped literal sits in the source. ---

const JWT_HEADER = base64UrlJson({
  alg: "RS256",
  typ: "at+jwt",
  kid: "test-1",
});
const JWT_PAYLOAD = base64UrlJson({ sub: "owner", scp: "read", aud: "bridge" });
const JWT_SIGNATURE = patternBytes(64, 29, 3).toString("base64url");
const OAUTH_JWT = `${JWT_HEADER}.${JWT_PAYLOAD}.${JWT_SIGNATURE}`;
const OAUTH_OPAQUE = patternBytes(32, 37, 11).toString("base64url");

const PIN = "4821";

// A fixed Ed25519 seed keeps the test deterministic.
const ED25519_PKCS8_PREFIX = Buffer.from(
  "302e020100300506032b657004220420",
  "hex",
);
const PRIVATE_KEY = createPrivateKey({
  key: Buffer.concat([ED25519_PKCS8_PREFIX, patternBytes(32, 53, 7)]),
  format: "der",
  type: "pkcs8",
});
const PRIVATE_KEY_PEM = PRIVATE_KEY.export({ type: "pkcs8", format: "pem" });
const PRIVATE_KEY_PEM_BODY = PRIVATE_KEY_PEM.split("\n").filter(
  (line) => line.length > 0 && !line.startsWith("-----"),
);
const PRIVATE_KEY_DER_BASE64 = PRIVATE_KEY.export({
  type: "pkcs8",
  format: "der",
}).toString("base64");
const PRIVATE_KEY_JWK_D = PRIVATE_KEY.export({ format: "jwk" }).d ?? "";

const JPEG_HEADER = Buffer.from("ffd8ffe000104a46494600010100", "hex");
const IMAGE = Buffer.concat([JPEG_HEADER, patternBytes(512, 73, 41)]);
const IMAGE_BASE64 = IMAGE.toString("base64");
const IMAGE_HEX = IMAGE.toString("hex");
const IMAGE_LATIN1 = IMAGE.toString("latin1");
const IMAGE_DATA_URL = `data:image/jpeg;base64,${IMAGE_BASE64}`;
const IMAGE_JSON = JSON.stringify(IMAGE);

interface Sample {
  readonly name: string;
  readonly value: unknown;
  /** Substrings that must never appear in any log line. */
  readonly marks: readonly string[];
}

const SAMPLES: readonly Sample[] = [
  {
    name: "an OAuth access token (JWT)",
    value: OAUTH_JWT,
    marks: [JWT_HEADER, JWT_PAYLOAD, JWT_SIGNATURE],
  },
  {
    name: "an OAuth access token (opaque)",
    value: OAUTH_OPAQUE,
    marks: [OAUTH_OPAQUE],
  },
  { name: "a PIN-shaped value", value: PIN, marks: [PIN] },
  {
    name: "a private key (PEM)",
    value: PRIVATE_KEY_PEM,
    marks: ["PRIVATE KEY", ...PRIVATE_KEY_PEM_BODY],
  },
  {
    name: "a private key (DER as base64)",
    value: PRIVATE_KEY_DER_BASE64,
    marks: windowsOf(PRIVATE_KEY_DER_BASE64),
  },
  {
    name: "a private key (JWK d)",
    value: PRIVATE_KEY_JWK_D,
    marks: [PRIVATE_KEY_JWK_D],
  },
  {
    name: "image bytes (Buffer)",
    value: IMAGE,
    marks: ["JFIF", ...windowsOf(IMAGE_BASE64)],
  },
  {
    name: "image bytes (base64)",
    value: IMAGE_BASE64,
    marks: windowsOf(IMAGE_BASE64),
  },
  { name: "image bytes (hex)", value: IMAGE_HEX, marks: windowsOf(IMAGE_HEX) },
  { name: "image bytes (latin1 text)", value: IMAGE_LATIN1, marks: ["JFIF"] },
  {
    name: "image bytes (data URL)",
    value: IMAGE_DATA_URL,
    marks: ["data:image", ...windowsOf(IMAGE_BASE64)],
  },
  {
    name: "image bytes (Buffer as JSON)",
    value: IMAGE_JSON,
    marks: ["255,216,255,224", "JFIF"],
  },
];

// --- Every log path. Each one writes exactly one line. ---

interface LogPath {
  readonly name: string;
  readonly write: (logger: Logger, secret: unknown) => void;
}

/** The same field object, seen by the logger the way a careless caller could hand it over. */
function asFields(value: Record<string, unknown>): LogFields {
  return value;
}

const EVENT_NAME_PATHS: readonly LogPath[] = LEVELS.map((level) => ({
  name: `${level}: event name`,
  write: (logger, secret) => {
    logger[level](String(secret));
  },
}));

const FIELD_PATHS: readonly LogPath[] = FIELD_NAMES.flatMap((field) => [
  {
    name: `field ${field}`,
    write: (logger: Logger, secret: unknown) => {
      logger.info("tool_call", asFields({ [field]: secret }));
    },
  },
  {
    name: `bound field ${field}`,
    write: (logger: Logger, secret: unknown) => {
      logger.with(asFields({ [field]: secret })).info("tool_call");
    },
  },
]);

const UNDECLARED_FIELD_PATH: LogPath = {
  name: "undeclared fields",
  write: (logger, secret) => {
    logger.info(
      "tool_call",
      asFields({
        token: secret,
        password: secret,
        pin: secret,
        device_name: secret,
      }),
    );
  },
};

const ERROR_SHAPES: readonly {
  readonly name: string;
  readonly make: (secret: unknown) => unknown;
}[] = [
  {
    name: "message",
    make: (secret) => new Error(`Ring call failed: ${String(secret)}`),
  },
  {
    name: "cause message",
    make: (secret) =>
      new Error("outer", { cause: new Error(`inner ${String(secret)}`) }),
  },
  {
    name: "third-level cause message",
    make: (secret) =>
      new Error("a", {
        cause: new Error("b", { cause: new Error(`c ${String(secret)}`) }),
      }),
  },
  {
    name: "name",
    make: (secret) => Object.assign(new Error("x"), { name: String(secret) }),
  },
  {
    name: "code",
    make: (secret) => Object.assign(new Error("x"), { code: secret }),
  },
  {
    name: "kind",
    make: (secret) => Object.assign(new Error("x"), { kind: secret }),
  },
  {
    name: "stack",
    make: (secret) =>
      Object.assign(new Error("x"), {
        stack: `Error: x\n    at handler (${String(secret)})`,
      }),
  },
  {
    name: "other properties",
    make: (secret) =>
      Object.assign(new Error("x"), {
        response: { body: secret },
        config: { headers: { authorization: secret } },
      }),
  },
  { name: "a thrown string", make: (secret) => String(secret) },
  {
    name: "a thrown object",
    make: (secret) => ({ message: secret, token: secret }),
  },
];

const ERROR_PATHS: readonly LogPath[] = LEVELS.flatMap((level) =>
  ERROR_SHAPES.map((shape) => ({
    name: `${level}: error ${shape.name}`,
    write: (logger: Logger, secret: unknown) => {
      logger[level]("ring_call_failed", {}, shape.make(secret));
    },
  })),
);

const LOG_PATHS: readonly LogPath[] = [
  ...EVENT_NAME_PATHS,
  ...FIELD_PATHS,
  UNDECLARED_FIELD_PATH,
  ...ERROR_PATHS,
];

function captureLogger(): {
  readonly logger: Logger;
  readonly lines: string[];
} {
  const lines: string[] = [];
  const logger = new Logger({
    sink: (line) => {
      lines.push(line);
    },
    now: () => FIXED_NOW,
    minLevel: "debug",
  });
  return { logger, lines };
}

describe("FR-034: logs carry identifiers, never content", () => {
  it.each(SAMPLES)("$name never appears, through every log path", (sample) => {
    const { logger, lines } = captureLogger();
    for (const path of LOG_PATHS) {
      path.write(logger, sample.value);
    }

    expect(lines).toHaveLength(LOG_PATHS.length);
    const output = lines.join("\n");
    for (const mark of sample.marks) {
      expect(output).not.toContain(mark);
    }
    for (const line of lines) {
      expect(line).toMatch(PRINTABLE_ASCII_LINE);
      expect(() => JSON.parse(line) as unknown).not.toThrow();
    }
  });

  it("covers every declared field", () => {
    expect(FIELD_NAMES.length).toBeGreaterThan(0);
    expect(FIELD_PATHS).toHaveLength(FIELD_NAMES.length * 2);
  });
});
