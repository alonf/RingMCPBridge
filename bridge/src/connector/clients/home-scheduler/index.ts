// Home Scheduler (CP-09, T016): the home's ticks. The only entry point (CD4).

/** The client the Host starts and stops, its wiring, and its two intervals. */
export {
  HEARTBEAT_INTERVAL_MS,
  HomeScheduler,
  RESEND_TICK_MS,
} from "./home-scheduler.ts";
export type { HomeSchedulerOptions } from "./home-scheduler.ts";
