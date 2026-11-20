// Reading one group of settings from the environment: each key's variable, checked with zod, and on
// failure the variables that failed, never their values (FR-034).
import type { z } from "zod";

/** Each setting's key and the environment variable behind it. */
export type VariableMap = Readonly<Record<string, string>>;

/** A group's checked values, or the variables that failed their check. */
export type SectionResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly variables: readonly string[] };

/**
 * Reads the group's variables (an empty value counts as unset) and checks them with `schema`, whose
 * keys are the map's keys.
 */
export function readSection<T>(
  schema: z.ZodType<T>,
  variables: VariableMap,
  environment: Readonly<Record<string, string | undefined>>,
): SectionResult<T> {
  const raw = Object.fromEntries(
    Object.entries(variables).map(([key, variable]) => {
      const value = environment[variable];
      return [key, value === "" ? undefined : value];
    }),
  );
  const parsed = schema.safeParse(raw);
  if (parsed.success) {
    return { ok: true, value: parsed.data };
  }
  const failedKeys = new Set(parsed.error.issues.map((issue) => issue.path[0]));
  const failed = Object.entries(variables)
    .filter(([key]) => failedKeys.has(key))
    .map(([, variable]) => variable);
  return { ok: false, variables: failed };
}
