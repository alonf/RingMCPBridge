// The bridge's version, from its package: the connector sends it in its hello, so the admin page
// can show "connector behind" (T017, T018).
import { readFileSync } from "node:fs";
import { z } from "zod";

const PACKAGE = z.object({ version: z.string().min(1) });

/** The version in `bridge/package.json`. */
export const BRIDGE_VERSION: string = PACKAGE.parse(
  JSON.parse(
    readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
  ),
).version;
