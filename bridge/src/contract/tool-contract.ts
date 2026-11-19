// One tool of the public contract, as MCP Endpoint registers it. Apart from the tool files so each
// can import it without importing the others.
import type { z } from "zod";

/** One tool of the public contract: what MCP Endpoint registers. */
export interface ToolContract<
  Input extends z.ZodObject = z.ZodObject,
  Reply extends z.ZodType = z.ZodType,
> {
  readonly name: string;
  /** The OAuth scope the caller's token needs. */
  readonly scope: "read" | "media" | "control";
  /** The MCP tool description; it ends with the untrusted-content sentence. */
  readonly description: string;
  readonly input: Input;
  /** The reply envelope around the tool's data. */
  readonly reply: Reply;
}
