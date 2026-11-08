// Health engine (CP-11a, T018): turns the home's signs of life into one health view. Its only entry
// point (CD4). Pure rules, no I/O; the Event manager applies them and Inquiry reads through `asOf`.

/** The rules and the view they work on. */
export {
  afterHeartbeat,
  afterRefresh,
  afterSessionOpened,
  asOf,
  healthChanges,
  settled,
} from "./health-engine.ts";
export type {
  HealthPart,
  HealthPolicy,
  HealthView,
  HeartbeatReading,
} from "./health-engine.ts";
