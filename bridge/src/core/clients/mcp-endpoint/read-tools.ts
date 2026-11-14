// The four iteration 001 read tools as MCP tools (T024; contracts/mcp-tools.md, errors.md): each
// tool's contract, the Inquiry read behind it, and the one line of text an agent reads with the
// structured reply.
//
// - **Inputs** are listed exactly as the Public Contract publishes them, but checked here, so a bad
//   input gets the contract's `INVALID_ARGUMENT` envelope. The SDK's own check answers with text
//   of its own, and offers no way to change that (DRIFT-001-42).
// - **Replies** are parsed through the tool's reply schema before they leave, which keeps out any
//   field the contract does not declare: the client refuses a reply its listed schema does not
//   allow.
// - **The deadline** is 60 s on the Clock. It wins even over a read that never looks at its signal,
//   and answers `TIMEOUT`, which a read may retry (errors.md).
// - **The read limit** comes first: an agent over its hourly reads is answered `RATE_LIMITED`, with
//   the seconds until a read is free, before anything is read (T025).
// - **Failures** become the error envelope with `isError`. The text and the envelope carry the
//   bridge's own words, never Ring's text, and an unexpected failure is logged, not shown.
import type { CallToolResult, McpServer } from "@modelcontextprotocol/server";
import type { z } from "zod";
import {
  errorEnvelope,
  getDeviceTool,
  getHealthTool,
  getOverviewTool,
  listDevicesTool,
} from "../../../contract/index.ts";
import type { ErrorCode } from "../../../contract/index.ts";
import { formatUtc } from "../../../utilities/clock/index.ts";
import type { Clock } from "../../../utilities/clock/index.ts";
import type { Logger } from "../../../utilities/logging/index.ts";
import { InquiryError } from "../../managers/inquiry/index.ts";
import type {
  InquiryManager,
  InquiryReply,
} from "../../managers/inquiry/index.ts";
import { listedOnly } from "./listed-input.ts";
import type { ReadLimit } from "./read-limit.ts";

/** How long a tool call may take before it answers `TIMEOUT` (IA D3). */
export const TOOL_DEADLINE_MS = 60_000;
/** When an agent may try again after `BRIDGE_UNAVAILABLE` [P]. */
export const UNAVAILABLE_RETRY_AFTER_S = 30;

/** Whose reads a local client's are counted as, in mode A, which has no token. */
export const LOCAL_CLIENT = "local";

/** The Inquiry reads the tools make. */
export type InquiryReads = Pick<
  InquiryManager,
  "getOverview" | "listDevices" | "getDevice" | "getHealth"
>;

/** What a tool call has besides its input. */
export interface ToolCallContext {
  /** The agent's client id; none for a local client in mode A. */
  readonly clientId: string | undefined;
  /** The client's own cancellation. */
  readonly signal: AbortSignal;
}

/** What the read tools are wired with. */
export interface ReadToolsOptions {
  readonly inquiry: InquiryReads;
  /** Each agent's reads in the last hour, kept for the life of the endpoint. */
  readonly limit: ReadLimit;
  readonly clock: Clock;
  readonly logger: Logger;
  readonly deadlineMs?: number;
}

// One read tool: its contract, the read behind it, and its summary line.
interface ReadTool {
  readonly name: string;
  readonly description: string;
  readonly input: z.ZodObject;
  readonly reply: z.ZodType;
  call(
    inquiry: InquiryReads,
    input: unknown,
    signal: AbortSignal,
  ): Promise<{ readonly reply: unknown; readonly summary: string }>;
}

// A tool whose input and reply keep their contract's types between the parse and the read.
function readTool<Input extends z.ZodObject, Reply extends z.ZodType>(
  contract: {
    readonly name: string;
    readonly description: string;
    readonly input: Input;
    readonly reply: Reply;
  },
  read: (
    inquiry: InquiryReads,
    input: z.output<Input>,
    signal: AbortSignal,
  ) => Promise<InquiryReply<unknown>>,
  summarize: (reply: z.output<Reply>) => string,
): ReadTool {
  return {
    name: contract.name,
    description: contract.description,
    input: contract.input,
    reply: contract.reply,
    call: async (inquiry, input, signal) => {
      const answer = await read(inquiry, contract.input.parse(input), signal);
      const reply = contract.reply.parse(answer);
      return { reply, summary: summarize(reply) };
    },
  };
}

// The request without the fields the agent left out, as Inquiry's requests declare them.
function present<Fields extends Record<string, unknown>>(
  fields: Fields,
): { [Field in keyof Fields]?: Exclude<Fields[Field], undefined> } {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  ) as { [Field in keyof Fields]?: Exclude<Fields[Field], undefined> };
}

function asOf(reply: { readonly as_of: string; readonly freshness: string }) {
  return `as of ${reply.as_of} (${reply.freshness})`;
}

/**
 * The overview's text: the whole home's counts, and a word when a list was cut to fit, so a
 * shortened list is never read as the total (CP-10 review).
 */
function overviewSummary(reply: {
  readonly as_of: string;
  readonly freshness: string;
  readonly data: {
    readonly counts: Readonly<Record<OverviewList, number>>;
  } & Readonly<Record<OverviewList, readonly unknown[]>>;
}): string {
  const { counts } = reply.data;
  const cut = OVERVIEW_LISTS.some(
    (list) => reply.data[list].length < counts[list],
  );
  return `The home ${asOf(reply)}: ${String(counts.open_contacts)} open contacts, ${String(counts.active_motion)} with motion, ${String(counts.offline_devices)} offline, ${String(counts.low_batteries)} with a low battery.${cut ? " Some lists are shortened to fit; the counts are the whole home's." : ""}`;
}

const OVERVIEW_LISTS = [
  "open_contacts",
  "active_motion",
  "offline_devices",
  "low_batteries",
] as const;
type OverviewList = (typeof OVERVIEW_LISTS)[number];

/** The read tools, in the catalog's order. */
export const READ_TOOLS: readonly ReadTool[] = [
  readTool(
    getOverviewTool,
    (inquiry, input, signal) => inquiry.getOverview(present(input), signal),
    (reply) => overviewSummary(reply),
  ),
  readTool(
    listDevicesTool,
    (inquiry, input, signal) => inquiry.listDevices(present(input), signal),
    (reply) =>
      `${String(reply.data.devices.length)} of ${String(reply.data.count)} devices ${asOf(reply)}.`,
  ),
  readTool(
    getDeviceTool,
    (inquiry, input, signal) => inquiry.getDevice(input, signal),
    (reply) => `Device ${reply.data.device.id} ${asOf(reply)}.`,
  ),
  readTool(
    getHealthTool,
    (inquiry, _input, signal) => inquiry.getHealth(signal),
    (reply) =>
      `Home link ${reply.data.home_link.status}, Ring session ${reply.data.ring_session.status}, ${asOf(reply)}.`,
  ),
];

/** The deadline's own reason, so a deadline is told apart from the client's cancellation. */
class DeadlinePassed extends Error {
  constructor() {
    super("The tool's deadline passed.");
    this.name = "DeadlinePassed";
  }
}

// A failure as the contract states it.
interface Failure {
  readonly code: ErrorCode;
  readonly message: string;
  readonly retryable: boolean;
  readonly retry_after_s?: number;
  readonly details?: Readonly<Record<string, unknown>>;
}

/** Registers the read tools on one server, for one request. */
export function registerReadTools(
  server: McpServer,
  options: ReadToolsOptions,
  context: (signal: AbortSignal) => ToolCallContext,
): void {
  for (const tool of READ_TOOLS) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: listedOnly(tool.input),
        outputSchema: tool.reply,
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      (input: unknown, ctx) =>
        callTool(tool, input, context(ctx.mcpReq.signal), options),
    );
  }
}

async function callTool(
  tool: ReadTool,
  input: unknown,
  call: ToolCallContext,
  options: ReadToolsOptions,
): Promise<CallToolResult> {
  const started = options.clock.now();
  const allowance = options.limit.take(call.clientId ?? LOCAL_CLIENT);
  const result: Outcome = allowance.allowed
    ? await outcomeOf(tool, input, call, options)
    : { failure: rateLimited(options.limit.perHour, allowance.retryAfterS) };
  const failure = "failure" in result ? result.failure : undefined;
  options.logger.info("mcp_tool_called", {
    tool: tool.name,
    outcome: failure === undefined ? "ok" : "failed",
    ...(failure === undefined ? {} : { error_code: failure.code }),
    ...(call.clientId === undefined ? {} : { client_id: call.clientId }),
    duration_ms: options.clock.now() - started,
  });
  return failure === undefined && "reply" in result
    ? {
        content: [{ type: "text", text: result.summary }],
        structuredContent: result.reply as Record<string, unknown>,
      }
    : errorResult(failure ?? internal(), options.clock);
}

type Outcome =
  | { readonly reply: unknown; readonly summary: string }
  | { readonly failure: Failure };

async function outcomeOf(
  tool: ReadTool,
  input: unknown,
  call: ToolCallContext,
  options: ReadToolsOptions,
): Promise<Outcome> {
  const parsed = tool.input.safeParse(input);
  if (!parsed.success) {
    return { failure: invalidInput(tool.name, parsed.error) };
  }
  const deadline = new AbortController();
  const cancel = options.clock.schedule(
    options.deadlineMs ?? TOOL_DEADLINE_MS,
    () => {
      deadline.abort(new DeadlinePassed());
    },
  );
  try {
    return await withinDeadline(
      tool.call(
        options.inquiry,
        parsed.data,
        AbortSignal.any([call.signal, deadline.signal]),
      ),
      deadline.signal,
    );
  } catch (error) {
    if (error instanceof DeadlinePassed) {
      return { failure: timedOut() };
    }
    if (call.signal.aborted) {
      throw error;
    }
    return { failure: failureOf(tool.name, error, options.logger) };
  } finally {
    cancel();
  }
}

// The read's answer, or the deadline's reason once it passes, whichever comes first. A read still
// running then is left to its own signal, and its late answer is dropped.
function withinDeadline<T>(
  work: Promise<T>,
  deadline: AbortSignal,
): Promise<T> {
  work.catch(() => undefined);
  return Promise.race([
    work,
    new Promise<never>((_resolve, reject) => {
      deadline.addEventListener(
        "abort",
        () => {
          reject(deadline.reason as Error);
        },
        { once: true },
      );
    }),
  ]);
}

function failureOf(tool: string, error: unknown, logger: Logger): Failure {
  if (error instanceof InquiryError) {
    switch (error.kind) {
      case "invalid_argument":
        return {
          code: "INVALID_ARGUMENT",
          message: error.message,
          retryable: false,
          ...(error.details === undefined
            ? {}
            : { details: { location_ids: [...error.details.location_ids] } }),
        };
      case "not_found":
        return { code: "NOT_FOUND", message: error.message, retryable: false };
      case "unavailable":
        return {
          code: "BRIDGE_UNAVAILABLE",
          message: error.message,
          retryable: true,
          retry_after_s: UNAVAILABLE_RETRY_AFTER_S,
        };
      case "failed":
        break;
    }
  }
  logger.error("mcp_tool_failed", { tool, error_code: "INTERNAL" }, error);
  return internal();
}

// The contract's message for a bad input names the fields and what is wrong, as zod words it; the
// value the agent sent is never repeated.
function invalidInput(tool: string, error: z.ZodError): Failure {
  const problems = error.issues
    .map((issue) =>
      issue.path.length === 0
        ? issue.message
        : `${issue.path.join(".")}: ${issue.message}`,
    )
    .join("; ");
  return {
    code: "INVALID_ARGUMENT",
    message: `The input for ${tool} is not valid. ${problems}`,
    retryable: false,
  };
}

function rateLimited(perHour: number, retryAfterS: number): Failure {
  return {
    code: "RATE_LIMITED",
    message: `This agent has made its ${String(perHour)} reads for the hour. Try again in ${String(retryAfterS)} s.`,
    retryable: true,
    retry_after_s: retryAfterS,
  };
}

function timedOut(): Failure {
  return {
    code: "TIMEOUT",
    message: "The bridge did not answer within 60 seconds. Try again.",
    retryable: true,
  };
}

function internal(): Failure {
  return {
    code: "INTERNAL",
    message: "The bridge failed to answer. This is a fault in the bridge.",
    retryable: false,
  };
}

function errorResult(failure: Failure, clock: Clock): CallToolResult {
  const envelope = errorEnvelope.parse({
    error: failure,
    as_of: formatUtc(clock.now()),
  });
  return {
    isError: true,
    content: [{ type: "text", text: failure.message }],
    structuredContent: envelope,
  };
}
