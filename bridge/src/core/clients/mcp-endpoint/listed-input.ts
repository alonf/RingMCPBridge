// A tool's input schema as the SDK lists it, while the endpoint checks inputs itself (T024).
//
// The SDK checks a tool's input before the tool runs, and answers a failure with its own text,
// "Input validation error: ...", not the contract's `INVALID_ARGUMENT` envelope (errors.md). The
// method that builds that answer is private, so it cannot be changed. The SDK accepts any Standard
// Schema for an input, though: this one lists the contract's JSON Schema exactly as zod writes it
// for `schemas/`, and accepts every value, so the tool's handler parses the input with the
// contract's own schema and answers with the envelope (DRIFT-001-42).
import type { StandardSchemaWithJSON } from "@modelcontextprotocol/server";
import type { z } from "zod";

/** Lists `schema` for `tools/list`, and leaves checking the input to the tool. */
export function listedOnly(
  schema: z.ZodObject,
): StandardSchemaWithJSON<unknown, unknown> {
  return {
    "~standard": {
      version: 1,
      vendor: "ring-mcp-bridge",
      validate: (value: unknown) => ({ value }),
      jsonSchema: schema["~standard"].jsonSchema,
    },
  };
}
