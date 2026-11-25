import { afterEach, it } from "vitest";
import type { Cleanups } from "../host/core-fixture.ts";
import { verifyEventHandoff } from "./event-handoff-scenario.ts";

const cleanups: Cleanups = [];
afterEach(async () => {
  for (const clean of cleanups.splice(0).reverse()) await clean();
});
const privateFolder = process.env.RING_PILOT_EVENT_DIRECTORY;
it(
  "shares exact event items through MCP to a separately authenticated receiver",
  () => verifyEventHandoff(cleanups),
  60_000,
);
it(
  "omits the sharing tool when the core has only cached media",
  () => verifyEventHandoff(cleanups, undefined, true),
  60_000,
);
it.skipIf(!privateFolder)(
  "verifies the recorded Ring photo and clip at the separate receiver",
  () => verifyEventHandoff(cleanups, privateFolder),
  60_000,
);
