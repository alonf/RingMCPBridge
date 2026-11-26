// Normalize engine (CP-08b, T042): Ring's push becomes the bridge's event. Its only entry point
// (CD4). Pure; Ingest calls it for each push the Push Listener hands over (T044), and for each
// change the alarm hub reports, with the entry it replaces (T062).

/** The rule, its input and its result. */
export { MAX_RING_EVENT_ID_LENGTH, normalizePush } from "./normalize.ts";
export { historyEvent } from "./history-events.ts";
export type { HistoryInput } from "./history-events.ts";
export {
  alarmEvent,
  armedAt,
  deviceChangeEvents,
  modeChangeEvent,
} from "./hub-events.ts";
export type { HubDevice, HubLocation, HubPanel } from "./hub-events.ts";
export type {
  HubDeviceType,
  Normalized,
  NormalizedEvent,
  NormalizeFailure,
  RingPushInput,
} from "./normalize.ts";
export { recordingEventId } from "./recording-id.ts";
