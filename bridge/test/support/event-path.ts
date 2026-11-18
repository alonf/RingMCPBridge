// The Event manager's event path for tests (T047): the Event Log, the Audit and the shipped
// priority policy over the database a test gives, so every test builds the manager the way the
// Host does.
import { readFileSync } from "node:fs";
import { Audit } from "../../src/core/access/audit/index.ts";
import { EventLog } from "../../src/core/access/event-log/index.ts";
import {
  parsePriorityPolicy,
  PRIORITY_POLICY_FILE,
} from "../../src/core/engines/classify/index.ts";
import type { EventTransactions } from "../../src/core/managers/event/index.ts";
import type { Clock } from "../../src/utilities/clock/index.ts";

/** The event path's parts of `EventManagerOptions`, over `store`. */
export function eventPathParts(
  store: EventTransactions,
  clock: Clock,
): {
  readonly store: EventTransactions;
  readonly eventLog: EventLog;
  readonly audit: Audit;
  readonly priorityPolicy: ReturnType<typeof parsePriorityPolicy>;
} {
  return {
    store,
    eventLog: new EventLog({ clock }),
    audit: new Audit({ clock }),
    priorityPolicy: parsePriorityPolicy(
      JSON.parse(readFileSync(PRIORITY_POLICY_FILE, "utf8")),
    ),
  };
}
