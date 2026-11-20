// Reads the Classify engine's priority policy when the core starts (T045; FR-009). The engine is
// pure and reads no file, so the Host does: a file that is missing, is not JSON or fails the
// engine's check stops the start, with an error that says which file and why.
import { readFileSync } from "node:fs";
import {
  parsePriorityPolicy,
  PRIORITY_POLICY_FILE,
  PriorityPolicyError,
} from "../core/engines/classify/index.ts";
import type { PriorityPolicy } from "../core/engines/classify/index.ts";

/** The checked policy from `file`: the engine's own policy file unless a test names another. */
export function readPriorityPolicy(
  file: URL = PRIORITY_POLICY_FILE,
): PriorityPolicy {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new PriorityPolicyError(
      `The priority policy file ${file.pathname} cannot be read as JSON: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
  }
  return parsePriorityPolicy(raw);
}
